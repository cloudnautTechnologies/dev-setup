// Journal inspection, rollback, and recovery. The journal format is private to this module and apply.js.
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { recovery as recoveryError } from "./errors.js";
import { rawHash } from "./hash.js";
import { isInside } from "./paths.js";

export const JOURNAL = ".cloudnaut/journal.json";
export const RECOVERING = ".cloudnaut/journal.recovering.json";
export const BACKUP_DIR = ".cloudnaut/backup";
export const TMP_RE = /^.+\.cloudnaut-tmp-[0-9a-f]{8}$/;
const OLD_MS = 60_000;

const abs = (project, rel) => path.join(project, ...rel.split("/"));

export function defaultAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === "EPERM";
  }
}

/** Describe a pending journal, or return null. Reads only. */
export function inspectJournal(project, { now = Date.now(), hostname = os.hostname(), isAlive = defaultAlive } = {}) {
  let rel = null;
  if (fs.existsSync(abs(project, RECOVERING))) rel = RECOVERING;
  else if (fs.existsSync(abs(project, JOURNAL))) rel = JOURNAL;
  if (!rel) return null;
  const file = abs(project, rel);
  let journal = null;
  try {
    journal = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    journal = null;
  }
  const info = { rel, file, journal, state: journal?.state ?? null, owner: journal?.owner ?? null, ownerStatus: null };
  if (journal && journal.owner && typeof journal.owner.pid === "number") {
    if (journal.owner.hostname !== hostname) info.ownerStatus = "foreign-host";
    else info.ownerStatus = isAlive(journal.owner.pid) ? "alive" : "dead";
  } else {
    let age = Infinity;
    try {
      age = now - fs.statSync(file).mtimeMs;
    } catch {
      // gone
    }
    info.ownerStatus = age > OLD_MS ? "unreadable-old" : "unreadable-new";
  }
  return info;
}

export function describeOwner(info) {
  const o = info.owner;
  switch (info.ownerStatus) {
    case "alive":
      return `another apply is running (pid ${o.pid})`;
    case "dead":
      return `a previous apply (pid ${o.pid}) stopped before finishing`;
    case "foreign-host":
      return `the journal was written on another host (${o?.hostname}); do not recover automatically`;
    case "unreadable-old":
      return "the journal is unreadable and older than 60 seconds";
    default:
      return "the journal is unreadable and very new; an apply may be starting";
  }
}

/** True when apply may run recovery for this journal. */
export const canRecover = (info) => info.ownerStatus === "dead" || info.ownerStatus === "unreadable-old";

function hashOf(file) {
  try {
    return rawHash(fs.readFileSync(file));
  } catch {
    return null;
  }
}

function safeUnlink(file) {
  try {
    fs.unlinkSync(file);
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
}

function restoreFrom(backup, target) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const tmp = `${target}.cloudnaut-tmp-${randomBytes(4).toString("hex")}`;
  fs.copyFileSync(backup, tmp);
  fs.renameSync(tmp, target);
}

/** All stray temp files in the scan scope. `id` filters to one journal. */
export function scanTemp(project, targets, id = null) {
  const dirs = new Set([abs(project, ".cloudnaut")]);
  for (const t of targets) dirs.add(path.dirname(abs(project, t)));
  const found = [];
  const test = (name) => TMP_RE.test(name) && (id === null || name.endsWith(`.cloudnaut-tmp-${id}`));
  for (const d of dirs) {
    let entries;
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) if (e.isFile() && test(e.name)) found.push(path.join(d, e.name));
  }
  // .cloudnaut is scanned recursively because incoming copies live in nested folders
  const walk = (d) => {
    let entries;
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(d, e.name);
      if (e.isDirectory() && !e.isSymbolicLink()) walk(full);
      else if (e.isFile() && test(e.name) && !found.includes(full)) found.push(full);
    }
  };
  walk(abs(project, ".cloudnaut"));
  return found;
}

function removeEmptyDir(dir) {
  try {
    fs.rmdirSync(dir);
  } catch {
    // not empty or gone
  }
}

/** Roll back an interrupted apply using its journal. Returns warnings. */
export function rollback(project, journal, targets) {
  const warnings = [];
  const inside = (p) => typeof p === "string" && isInside(project, p);
  for (const op of [...(journal.ops || [])].reverse()) {
    if (!inside(op.realPath)) {
      warnings.push(`journal entry outside the project ignored: ${String(op.path)}`);
      continue;
    }
    const cur = hashOf(op.realPath);
    const haveBackup = op.backup && inside(op.backup) && fs.existsSync(op.backup);
    if (op.mode === "create") {
      if (cur === null) {
        // nothing to do
      } else if (cur === op.afterHash) safeUnlink(op.realPath);
      else warnings.push(`left ${op.path} alone: it changed after the interrupted apply`);
    } else if (op.mode === "replace") {
      if (cur === op.beforeHash) {
        // untouched
      } else if (cur === op.afterHash && haveBackup) restoreFrom(op.backup, op.realPath);
      else warnings.push(`left ${op.path} alone: it differs from both the old and new content`);
    } else if (op.mode === "delete") {
      if (cur === null && haveBackup) restoreFrom(op.backup, op.realPath);
    }
    if (inside(op.tmp)) safeUnlink(op.tmp);
  }
  if (journal.id) for (const f of scanTemp(project, targets, journal.id)) safeUnlink(f);
  const dirs = [...(journal.createdDirs || [])].sort((a, b) => b.length - a.length);
  for (const d of dirs) {
    if (d === ".cloudnaut" || d.startsWith(".cloudnaut/backup")) continue;
    removeEmptyDir(abs(project, d));
  }
  return warnings;
}

export function removeBackup(project, id) {
  if (id) fs.rmSync(abs(project, `${BACKUP_DIR}/${id}`), { recursive: true, force: true });
  removeEmptyDir(abs(project, BACKUP_DIR));
}

/**
 * Recover from a pending journal (caller already decided it is safe).
 * Returns {outcome, warnings}.
 */
export function recover(project, info, targets) {
  let file = info.file;
  if (info.rel === JOURNAL) {
    try {
      fs.renameSync(abs(project, JOURNAL), abs(project, RECOVERING));
    } catch (err) {
      if (err.code === "ENOENT") throw recoveryError("RECOVERY_PENDING", "another process is recovering this project", "retry in a moment");
      throw err;
    }
    file = abs(project, RECOVERING);
  }
  let journal = null;
  try {
    journal = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    journal = null;
  }
  let outcome;
  let warnings = [];
  if (!journal || (journal.state === "staging" && (journal.ops || []).length === 0)) {
    for (const f of scanTemp(project, targets)) safeUnlink(f);
    removeBackup(project, journal?.id);
    fs.rmSync(abs(project, BACKUP_DIR), { recursive: true, force: true });
    outcome = "cleaned";
  } else if (journal.state === "committed") {
    for (const op of journal.ops || []) if (op.tmp && isInside(project, op.tmp)) safeUnlink(op.tmp);
    removeBackup(project, journal.id);
    outcome = "committed";
  } else {
    warnings = rollback(project, journal, targets);
    removeBackup(project, journal.id);
    outcome = "rolled-back";
  }
  safeUnlink(file);
  if (journal?.createdDirs?.includes(".cloudnaut")) removeEmptyDir(abs(project, ".cloudnaut"));
  return { outcome, warnings };
}
