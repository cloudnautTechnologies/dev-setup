// Doctor: checks an installed setup. Reads only; never writes.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { sha256Json, sha256Text } from "./hash.js";
import { readExtensions } from "./extensions.js";
import { hasLine } from "./gitignore.js";
import { validateHookFile } from "./hook.js";
import { compareSemver, readLock } from "./lock.js";
import { allManifestTargets, profileNames, expandProfile } from "./manifest.js";
import { readMcp } from "./mcp.js";
import { findOnPath } from "./pathscan.js";
import { resolveWriteTarget } from "./paths.js";
import { BACKUP_DIR, describeOwner, inspectJournal, scanTemp } from "./recover.js";

const HOOK_FILE = ".kiro/hooks/cloudnaut-verify-after-task.json";

export function doctor({ project, release, env = process.env, noExec = false }) {
  const manifest = release.manifest;
  const findings = [];
  const add = (category, code, message, target) => findings.push({ category, code, message, target });
  const read = (rel) => {
    const r = resolveWriteTarget(project, rel);
    if (!r.exists || r.broken) return null;
    try {
      return fs.readFileSync(r.realPath, "utf8");
    } catch {
      return null;
    }
  };

  const journal = inspectJournal(project);
  if (journal) add("BROKEN", "RECOVERY_PENDING", `a journal is pending: ${describeOwner(journal)}. Run apply to recover.`, journal.rel);
  const targets = allManifestTargets(manifest);
  for (const f of scanTemp(project, targets)) add("BROKEN", "TEMP_LEFTOVER", "temporary file left behind by an interrupted apply", path.relative(project, f).split(path.sep).join("/"));
  if (fs.existsSync(path.join(project, ...BACKUP_DIR.split("/")))) add("BROKEN", "TEMP_LEFTOVER", "backup folder left behind by an interrupted apply", BACKUP_DIR);

  let lock = null;
  try {
    lock = readLock(project, profileNames(manifest)).lock;
  } catch (err) {
    add("BROKEN", "LOCK_INVALID", err.message);
  }
  if (!lock) {
    if (!findings.some((f) => f.code === "LOCK_INVALID")) add("BROKEN", "NO_LOCK", "no .cloudnaut/dev-setup.lock.json; run apply first");
    return finish(findings);
  }

  const cmp = compareSemver(lock.version, manifest.version);
  if (cmp > 0) add("BROKEN", "LOCK_NEWER", `the project was set up with ${lock.version}; this tool is ${manifest.version}`);
  else if (cmp < 0) add("INFO", "UPGRADE_AVAILABLE", `set up with ${lock.version}; ${manifest.version} is available. Run preview to see the upgrade.`);
  else add("OK", "VERSION", `version ${lock.version}, profile ${lock.profile}`);

  const parsed = {};
  const mcp = () => (parsed.mcp ??= { text: read(".kiro/settings/mcp.json") });
  const ext = () => (parsed.ext ??= { text: read(".vscode/extensions.json") });
  for (const it of lock.items) {
    if (it.preexisting) continue;
    try {
      resolveWriteTarget(project, it.target);
    } catch (err) {
      add("BROKEN", "ESCAPE", err.message, it.target);
      continue;
    }
    if (it.kind === "file") {
      const t = read(it.target);
      if (t === null) add("BROKEN", "MISSING", "owned file is missing; run apply to restore it", it.target);
      else if (sha256Text(t) !== it.sha256) add("INFO", "LOCALLY_MODIFIED", "differs from the installed version", it.target);
      else add("OK", "FILE", "matches the installed version", it.target);
    } else if (it.kind === "json-entry") {
      const m = mcp();
      if (m.text === null) {
        add("BROKEN", "MISSING", "mcp.json is missing", it.target);
        continue;
      }
      m.read ??= readMcp(m.text);
      if (!m.read.ok) {
        add("BROKEN", "UNPARSEABLE", `mcp.json ${m.read.error}`, it.target);
        continue;
      }
      const name = it.pointer.split("/").pop();
      const entry = m.read.servers[name];
      if (entry === undefined) add("BROKEN", "ENTRY_MISSING", `mcpServers.${name} is missing; run apply to restore it`, it.target);
      else if (entry && typeof entry === "object" && (entry.autoApprove === "*" || (Array.isArray(entry.autoApprove) && entry.autoApprove.includes("*")))) {
        add("BROKEN", "BLANKET_AUTOAPPROVE", `mcpServers.${name} auto-approves every tool`, it.target);
      } else if (sha256Json(entry) !== it.sha256) add("INFO", "LOCALLY_MODIFIED", `mcpServers.${name} differs from the installed version`, it.target);
      else add("OK", "MCP_ENTRY", `mcpServers.${name} matches`, it.target);
    } else if (it.kind === "jsonc-item") {
      const e = ext();
      if (e.text === null) {
        add("BROKEN", "EXTENSION_MISSING", `${it.value} is not recommended: extensions.json is missing`, it.target);
        continue;
      }
      e.read ??= readExtensions(e.text);
      if (!e.read.ok) add("BROKEN", "UNPARSEABLE", `extensions.json ${e.read.error}`, it.target);
      else if (e.read.recs.has(it.value.toLowerCase())) add("OK", "EXTENSION", `${it.value} is recommended`, it.target);
      else if (e.read.unwanted.has(it.value.toLowerCase())) add("INFO", "DECLINED_LOCALLY", `${it.value} is in unwantedRecommendations`, it.target);
      else add("BROKEN", "EXTENSION_MISSING", `${it.value} is no longer recommended; run apply to restore it`, it.target);
    } else if (it.kind === "line") {
      const t = read(it.target);
      if (t !== null && hasLine(t, it.line)) add("OK", "IGNORE_LINE", `${it.line} is ignored`, it.target);
      else add("INFO", "IGNORE_LINE_MISSING", `${it.line} is not in ${it.target}`, it.target);
    }
  }

  if (lock.items.some((i) => i.target === HOOK_FILE)) {
    const hook = read(HOOK_FILE);
    let err = hook === null ? "hook file is missing" : validateHookFile(hook);
    if (!err) {
      const runner = read(".cloudnaut/run-verify.cjs");
      const cmdText = read(".cloudnaut/verify-command.json");
      if (runner === null) err = ".cloudnaut/run-verify.cjs is missing";
      else if (cmdText === null) err = ".cloudnaut/verify-command.json is missing";
      else {
        try {
          const c = JSON.parse(cmdText);
          if (!c || typeof c.command !== "string" || c.command.trim() === "") err = "verify-command.json has no command";
        } catch (e) {
          err = `verify-command.json is not valid JSON: ${e.message}`;
        }
      }
    }
    if (err) add("BROKEN", "HOOK_INVALID", err, HOOK_FILE);
    else add("OK", "HOOK", "verify hook is valid");
    if (!findOnPath("node", env)) add("OPTIONAL_MISSING", "NODE_NOT_ON_PATH", "node is not on this shell's PATH; the hook runs 'node .cloudnaut/run-verify.cjs', so Kiro needs node on its PATH.");
  }
  try {
    const dir = resolveWriteTarget(project, ".kiro/hooks").realPath;
    const owned = new Set(lock.items.map((i) => i.target));
    for (const n of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
      if (n.startsWith("cloudnaut-") && !owned.has(`.kiro/hooks/${n}`)) add("INFO", "UNMANAGED_HOOK", "a cloudnaut-* hook file that this setup does not own", `.kiro/hooks/${n}`);
    }
  } catch (err) {
    add("BROKEN", "ESCAPE", err.message, ".kiro/hooks");
  }

  for (const u of lock.unresolved) add("INFO", "UNRESOLVED_INCOMING", `review the incoming copy and resolve it (see docs/releasing.md): ${u.incoming}`, u.incoming);

  // Optional prerequisites: scanned on PATH, never run (except the single codegraph probe).
  if (!findOnPath("git", env)) add("OPTIONAL_MISSING", "GIT_MISSING", "git is not on PATH; you need it to review and commit the setup.");
  if (expandProfile(manifest, lock.profile).includes("aws") && !findOnPath("aws", env)) {
    add("OPTIONAL_MISSING", "AWS_CLI_MISSING", "the AWS CLI is not on PATH. It is only needed for your own AWS sign-in checks; doctor never uses AWS.");
  }
  if (lock.options.withCodegraph) codegraphChecks({ project, manifest, env, noExec, add });
  return finish(findings);
}

function codegraphChecks({ project, manifest, env, noExec, add }) {
  const pin = manifest.features.codegraph.pin.version;
  if (!findOnPath("npm", env)) add("OPTIONAL_MISSING", "NPM_MISSING", `npm is not on PATH; you need it to install codegraph: npm install -g @colbymchenry/codegraph@${pin}`);
  const bin = findOnPath("codegraph", env);
  if (!bin) {
    add("OPTIONAL_MISSING", "CODEGRAPH_MISSING", `codegraph is not on PATH. Install the pinned version: npm install -g @colbymchenry/codegraph@${pin}`);
  } else if (noExec) {
    add("OPTIONAL_MISSING", "CODEGRAPH_VERSION_SKIPPED", `codegraph found at ${bin}; version check skipped (--no-exec)`);
  } else {
    const isCmd = process.platform === "win32" && /\.(cmd|bat)$/i.test(bin);
    const res = spawnSync(isCmd ? `"${bin}"` : bin, ["version"], {
      encoding: "utf8",
      timeout: 5000,
      shell: isCmd,
      env: { ...env, CODEGRAPH_TELEMETRY: "0", DO_NOT_TRACK: "1", CODEGRAPH_NO_UPDATE_CHECK: "1" },
    });
    const v = res.error || res.status !== 0 ? null : /\d+\.\d+\.\d+/.exec(res.stdout || "");
    if (!v) add("OPTIONAL_MISSING", "CODEGRAPH_VERSION_UNKNOWN", "could not read the codegraph version (spawn failed, timed out, or unexpected output)");
    else if (v[0] !== pin) add("OPTIONAL_MISSING", "CODEGRAPH_VERSION_MISMATCH", `codegraph ${v[0]} found; the pinned version is ${pin}. Run: npm install -g @colbymchenry/codegraph@${pin}`);
    else add("OK", "CODEGRAPH", `codegraph ${v[0]} matches the pin`);
  }
  if (!fs.existsSync(path.join(project, ".codegraph"))) add("OPTIONAL_MISSING", "CODEGRAPH_NOT_INITIALIZED", "no .codegraph/ index. Run: codegraph init");
}

function finish(findings) {
  const count = (c) => findings.filter((f) => f.category === c).length;
  return { findings, summary: { broken: count("BROKEN"), optionalMissing: count("OPTIONAL_MISSING"), info: count("INFO"), ok: count("OK") } };
}
