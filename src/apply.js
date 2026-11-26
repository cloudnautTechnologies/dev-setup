// Transactional execution of a plan: write-ahead journal, staged temp files, atomic renames, lock last.
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { SetupError, internal, recovery as recoveryError } from "./errors.js";
import { EXIT } from "./exit-codes.js";
import { rawHash } from "./hash.js";
import { collisionError } from "./plan.js";
import { JOURNAL, BACKUP_DIR, removeBackup, rollback } from "./recover.js";
import { isInside, resolveWriteTarget } from "./paths.js";

let handler = null;
/** Test seam: fn(name, index) may throw to simulate a failure. */
export function setCheckpointHandler(fn) {
  handler = fn;
}
/** Thrown by a test handler to simulate a hard process kill: apply never rolls back on it. */
export class CrashSignal extends Error {}
const checkpoint = (name, i) => {
  if (handler) handler(name, i);
};

const abs = (project, rel) => path.join(project, ...rel.split("/"));
const relPosix = (project, p) => path.relative(project, p).split(path.sep).join("/");

function hashOf(file) {
  try {
    return rawHash(fs.readFileSync(file));
  } catch {
    return null;
  }
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function renameWithRetry(from, to) {
  for (let attempt = 0; ; attempt++) {
    try {
      fs.renameSync(from, to);
      return;
    } catch (err) {
      const retryable = process.platform === "win32" && ["EPERM", "EBUSY", "EACCES"].includes(err.code);
      if (!retryable || attempt >= 5) throw err;
      sleep(50);
    }
  }
}

function fsyncFile(file) {
  const fd = fs.openSync(file, "r+");
  try {
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

function pruneEmpty(project, rel) {
  let dir = path.dirname(abs(project, rel));
  for (;;) {
    const r = relPosix(project, dir);
    const prunable = r.startsWith(".cloudnaut/incoming") || r.startsWith(".cloudnaut/third-party") || r.startsWith("docs/cloudnaut") || (r.startsWith(".kiro/skills/") && r.split("/").length >= 3);
    if (!prunable || !isInside(project, dir) || dir === project) return;
    try {
      fs.rmdirSync(dir);
    } catch {
      return;
    }
    dir = path.dirname(dir);
  }
}

export function executePlan(plan, targets = []) {
  if (plan.collisions.length > 0) throw collisionError(plan);
  if (plan.recovery) throw recoveryError("RECOVERY_PENDING", "a pending journal exists", "run apply again to recover");
  if (plan.writes.length === 0) return { changed: false, written: [] };
  const project = plan.project;

  for (const w of plan.writes) {
    const r = resolveWriteTarget(project, w.path);
    if (r.realPath !== w.realPath) throw new SetupError("CHANGED_DURING_APPLY", EXIT.COLLISION, `${w.path} resolves differently than planned`, { fix: "re-run" });
    if (hashOf(w.realPath) !== w.expectBeforeHash) {
      throw new SetupError("CHANGED_DURING_APPLY", EXIT.COLLISION, `${w.path} changed between planning and writing; nothing was written`, { fix: "re-run the command" });
    }
  }

  const id = randomBytes(4).toString("hex");
  const cloudnautDir = abs(project, ".cloudnaut");
  const cloudnautExisted = fs.existsSync(cloudnautDir);
  fs.mkdirSync(cloudnautDir, { recursive: true });
  const journalFile = abs(project, JOURNAL);
  const journal = {
    schemaVersion: 1,
    id,
    toolVersion: plan.tool.version,
    owner: { pid: process.pid, hostname: os.hostname(), startedAt: new Date().toISOString() },
    state: "staging",
    createdDirs: cloudnautExisted ? [] : [".cloudnaut"],
    ops: [],
  };
  try {
    const fd = fs.openSync(journalFile, "wx");
    try {
      fs.writeSync(fd, JSON.stringify(journal, null, 2));
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
  } catch (err) {
    if (err.code === "EEXIST") throw recoveryError("RECOVERY_PENDING", "another apply is running or a journal exists", "wait, or run apply again");
    throw err;
  }

  const journalWrite = () => {
    const tmp = `${journalFile}.cloudnaut-tmp-${id}`;
    fs.writeFileSync(tmp, JSON.stringify(journal, null, 2));
    fsyncFile(tmp);
    renameWithRetry(tmp, journalFile);
  };
  const ensureDir = (dir) => {
    const missing = [];
    let d = dir;
    while (!fs.existsSync(d) && isInside(project, d) && d !== project) {
      missing.unshift(d);
      d = path.dirname(d);
    }
    for (const m of missing) {
      journal.createdDirs.push(relPosix(project, m));
      journalWrite();
      fs.mkdirSync(m);
    }
  };

  let committed = false;
  try {
    checkpoint("after-journal-created");
    plan.writes.forEach((w, i) => {
      ensureDir(path.dirname(w.realPath));
      const backup = w.mode === "create" ? null : path.join(abs(project, `${BACKUP_DIR}/${id}`), ...w.path.split("/"));
      const op = {
        path: w.path,
        realPath: w.realPath,
        mode: w.mode,
        tmp: w.mode === "delete" ? null : `${w.realPath}.cloudnaut-tmp-${id}`,
        backup,
        beforeHash: w.expectBeforeHash,
        afterHash: w.mode === "delete" ? null : rawHash(Buffer.from(w.content, "utf8")),
      };
      journal.ops.push(op);
      journalWrite();
      if (backup) {
        ensureDir(path.dirname(backup));
        fs.copyFileSync(w.realPath, backup);
      }
      if (op.tmp) {
        fs.writeFileSync(op.tmp, w.content, { flag: "wx" });
        fsyncFile(op.tmp);
        if (w.mode === "replace") fs.chmodSync(op.tmp, fs.statSync(w.realPath).mode & 0o777);
      }
      checkpoint(`during-stage:${i}`, i);
    });
    journal.state = "applying";
    journalWrite();
    checkpoint("after-stage");

    const lockIndex = plan.writes.findIndex((w) => w.isLock);
    journal.ops.forEach((op, i) => {
      if (i === lockIndex) checkpoint("before-lock");
      if (op.mode === "delete") fs.unlinkSync(op.realPath);
      else renameWithRetry(op.tmp, op.realPath);
      checkpoint(`after-rename:${i}`, i);
      if (i === lockIndex) checkpoint("after-lock");
    });
    if (lockIndex < 0) {
      checkpoint("before-lock");
      checkpoint("after-lock");
    }
    journal.state = "committed";
    journalWrite();
    committed = true;
    checkpoint("after-committed");

    removeBackup(project, id);
    for (const op of journal.ops) if (op.mode === "delete") pruneEmpty(project, op.path);
    checkpoint("before-journal-delete");
    fs.unlinkSync(journalFile);
    if (journal.createdDirs.includes(".cloudnaut")) {
      // keep: the lock now lives here
    }
  } catch (err) {
    if (err instanceof CrashSignal) throw err;
    if (committed) throw err instanceof SetupError ? err : internal("INTERNAL", `clean-up after apply failed: ${err.message}`, "run apply again to finish clean-up");
    try {
      rollback(project, journal, targets);
      removeBackup(project, id);
      fs.rmSync(journalFile, { force: true });
      if (journal.createdDirs.includes(".cloudnaut")) {
        try {
          fs.rmdirSync(cloudnautDir);
        } catch {
          // not empty
        }
      }
    } catch (rbErr) {
      throw recoveryError("RECOVERY_PENDING", `apply failed (${err.message}) and rollback did not finish (${rbErr.message})`, `run apply again to recover; backups are in ${BACKUP_DIR}/${id}/`);
    }
    throw err instanceof SetupError ? err : internal("INTERNAL", `apply failed and was rolled back: ${err.message}`, "fix the cause and run apply again");
  }
  return { changed: true, written: plan.writes.map((w) => w.path) };
}
