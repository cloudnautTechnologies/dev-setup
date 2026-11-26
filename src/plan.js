// Pure planning: reads the project, writes nothing. Preview prints the plan; apply executes the same object.
import { lstatSync, readFileSync } from "node:fs";
import { SetupError, refusal, usage } from "./errors.js";
import { EXIT } from "./exit-codes.js";
import { normalizeText, rawHash, sha256Json, sha256Text } from "./hash.js";
import { appendLine, hasLine } from "./gitignore.js";
import { applyExtensionOps, readExtensions } from "./extensions.js";
import { LOCK_PATH, compareSemver, incomingPath, readLock, renderLock } from "./lock.js";
import { applyMcpOps, readMcp } from "./mcp.js";
import { buildDesired, expandProfile, profileNames } from "./manifest.js";
import { findOnPath } from "./pathscan.js";
import { resolveWriteTarget } from "./paths.js";
import { inspectJournal } from "./recover.js";
import { validateVerifyCommand, verifyWarnings } from "./hook.js";

const MCP = ".kiro/settings/mcp.json";
const EXT = ".vscode/extensions.json";
const GITIGNORE = ".gitignore";

function readTarget(project, rel) {
  const r = resolveWriteTarget(project, rel);
  const out = { rel, realPath: r.realPath, exists: false, isFile: false, bad: r.broken, text: null, raw: null };
  if (r.broken) return out;
  let st;
  try {
    st = lstatSync(r.realPath);
  } catch (err) {
    if (err.code === "ENOENT") return out;
    throw err;
  }
  out.exists = true;
  if (!st.isFile()) {
    out.bad = true;
    return out;
  }
  const buf = readFileSync(r.realPath);
  out.isFile = true;
  out.text = buf.toString("utf8");
  out.raw = rawHash(buf);
  return out;
}

/** Pure three-way decision for one item. localHash is null when absent. */
export function decide(lockItem, localHash, incoming, hasUnresolved) {
  if (!lockItem) {
    if (localHash === null) return { op: "create" };
    if (localHash === incoming) return { op: "adopt" };
    return { collision: true };
  }
  const base = lockItem.sha256;
  if (localHash === null) return { op: "restore", clear: hasUnresolved };
  if (localHash === incoming) {
    return localHash === base ? { op: "unchanged", clear: hasUnresolved } : { op: "adopt", clear: hasUnresolved };
  }
  if (localHash === base) return { op: "update", clear: hasUnresolved };
  if (incoming === base) return { op: "keep-local", review: "LOCALLY_MODIFIED", clear: hasUnresolved };
  return { op: "keep-local", conflict: true };
}

export function planForJson(plan) {
  return { ...plan, writes: plan.writes.map(({ content, ...rest }) => rest) };
}

export function buildPlan({ project, release, profile, flags = {}, env = process.env }) {
  const manifest = release.manifest;
  const tool = { name: manifest.name, version: manifest.version };
  const known = profileNames(manifest);
  const plan = {
    schemaVersion: 1,
    tool,
    project,
    profile: null,
    resolvedProfiles: [],
    options: { withCodegraph: false, withPonytail: false, verifyCommand: null },
    fromLock: null,
    actions: [],
    writes: [],
    collisions: [],
    reviewItems: [],
    notices: [],
    warnings: [],
    recovery: null,
    summary: {},
  };

  const journal = inspectJournal(project);
  if (journal) {
    plan.recovery = { file: journal.rel, state: journal.state, ownerStatus: journal.ownerStatus, owner: journal.owner };
    return plan;
  }

  resolveWriteTarget(project, LOCK_PATH);
  const { lock, text: lockText } = readLock(project, known);

  const requested = profile ?? lock?.profile;
  if (!requested) throw usage("--profile is required", `use one of: ${known.join(", ")}`);
  if (!known.includes(requested)) throw usage(`unknown profile: ${requested}`, `use one of: ${known.join(", ")}`);
  if (lock) {
    if (compareSemver(lock.version, tool.version) > 0) {
      throw refusal("DOWNGRADE", `the project was set up with ${lock.version}, newer than this release (${tool.version})`, "downgrade by reverting the configuration commit in the project");
    }
    const want = expandProfile(manifest, requested);
    const have = expandProfile(manifest, lock.profile);
    if (!have.every((p) => want.includes(p))) {
      throw refusal("NARROWING", `the project uses profile ${lock.profile}; ${requested} would remove parts of it`, "narrowing is not supported; revert the configuration commit instead");
    }
    plan.fromLock = { version: lock.version, profile: lock.profile, options: lock.options };
  }

  const options = {
    withCodegraph: flags.withCodegraph === true || lock?.options.withCodegraph === true,
    withPonytail: flags.withPonytail === true || lock?.options.withPonytail === true,
    verifyCommand: flags.verifyCommand !== undefined ? validateVerifyCommand(flags.verifyCommand) : (lock?.options.verifyCommand ?? null),
  };
  plan.profile = requested;
  plan.resolvedProfiles = expandProfile(manifest, requested);
  plan.options = options;

  const desired = buildDesired(release, requested, options);
  const lockItems = new Map((lock?.items || []).map((i) => [i.id, i]));
  const unresolved = new Map((lock?.unresolved || []).map((u) => [u.id, u]));

  const fileWrites = new Map(); // path -> write
  const newItems = [];
  const newUnresolved = new Map();
  const sharedOps = { mcp: [], ext: [], ignore: [] };
  const shared = {};
  const addCollision = (code, target, message, fix, pointer) => plan.collisions.push({ code, target, pointer, message, fix });
  const addAction = (item, op, extra) => {
    const a = {
      id: item.id, kind: item.kind, target: item.target, pointer: item.pointer, owner: item.owner, op,
      baseHash: lockItems.get(item.id)?.sha256 ?? null, localHash: null, incomingHash: item.hash, resultHash: null, reason: "", ...extra,
    };
    plan.actions.push(a);
    return a;
  };
  const stageFile = (rel, content, t) => {
    // t: target read state for this path
    const cur = t ?? readTarget(project, rel);
    fileWrites.set(rel, {
      path: rel, realPath: cur.realPath, mode: cur.exists ? "replace" : "create", content,
      expectBeforeHash: cur.exists ? cur.raw : null, resultHash: sha256Text(content),
    });
  };
  const stageDelete = (rel) => {
    const cur = readTarget(project, rel);
    if (!cur.exists || !cur.isFile) return;
    fileWrites.set(rel, { path: rel, realPath: cur.realPath, mode: "delete", content: null, expectBeforeHash: cur.raw, resultHash: null });
  };
  const incomingCopy = (item, content, incomingHash, action) => {
    const rel = incomingPath(item);
    const cur = readTarget(project, rel);
    if (cur.bad) {
      addCollision("TYPE_MISMATCH", rel, `${rel} exists but is not a file`, "remove or rename it");
      return;
    }
    if (!cur.exists || sha256Text(cur.text) !== sha256Text(content)) stageFile(rel, content, cur);
    action.incomingCopy = rel;
    const prev = unresolved.get(item.id);
    newUnresolved.set(item.id, {
      id: item.id, incoming: rel, incomingSha256: incomingHash,
      sinceVersion: prev && prev.incomingSha256 === incomingHash ? prev.sinceVersion : tool.version,
    });
    plan.reviewItems.push({ code: "CONFLICT", id: item.id, target: item.target, incomingCopy: rel, message: `${item.target}${item.pointer ? ` (${item.pointer})` : ""} was edited locally and changed upstream. Local content kept; review ${rel}.` });
  };
  const clearIncoming = (item) => {
    const rel = incomingPath(item);
    if (rel) stageDelete(rel);
  };
  const lockItemOf = (item, sha, extra = {}) => {
    const base = { id: item.id, kind: item.kind, target: item.target, owner: item.owner, sha256: sha };
    if (item.kind === "file" || item.kind === "json-entry") base.adopted = false;
    if (item.kind === "json-entry") base.pointer = item.pointer;
    if (item.kind === "jsonc-item") base.value = item.value;
    if (item.kind === "line") base.line = item.line;
    return { ...base, ...extra };
  };
  const keepOld = (item, li, extra = {}) => ({ ...li, owner: item.owner, ...extra });

  const loadShared = (key, rel, parse) => {
    if (shared[key]) return shared[key];
    const t = readTarget(project, rel);
    const s = { t, parsed: null, bad: false };
    if (t.bad) {
      addCollision("TYPE_MISMATCH", rel, `${rel} exists but is not a regular file`, "rename or remove it, then re-run");
      s.bad = true;
    } else if (t.exists) {
      s.parsed = parse(t.text);
      if (s.parsed && s.parsed.ok === false) {
        addCollision("UNPARSEABLE", rel, `${rel} ${s.parsed.error}`, rel === MCP ? "fix the syntax (mcp.json must be strict JSON, no comments), then re-run" : "fix the syntax, then re-run");
        s.bad = true;
      }
    }
    shared[key] = s;
    return s;
  };

  for (const item of desired) {
    const li = lockItems.get(item.id) || null;
    const hasUnres = unresolved.has(item.id);

    if (item.kind === "file") {
      const t = readTarget(project, item.target);
      if (t.bad) {
        addCollision("TYPE_MISMATCH", item.target, `${item.target} exists but is not a regular file`, "rename or remove it, then re-run");
        continue;
      }
      const local = t.exists ? sha256Text(t.text) : null;
      const d = decide(li, local, item.hash, hasUnres);
      if (d.collision) {
        addCollision("EXISTS_DIFFERENT", item.target, `${item.target} already exists with different content and is not managed by Cloudnaut`, "move, merge, or rename it, then re-run");
        continue;
      }
      const a = addAction(item, d.op, { localHash: local });
      if (d.op === "create" || d.op === "update" || d.op === "restore") {
        stageFile(item.target, item.content, t);
        a.resultHash = item.hash;
        newItems.push(lockItemOf(item, item.hash));
      } else if (d.op === "adopt") {
        a.resultHash = item.hash;
        newItems.push(lockItemOf(item, item.hash, { adopted: true }));
      } else if (d.op === "unchanged") {
        newItems.push(keepOld(item, li));
      } else if (d.conflict) {
        a.reason = "edited locally and changed upstream";
        incomingCopy(item, item.content, item.hash, a);
        newItems.push(keepOld(item, li));
      } else {
        a.reason = "edited locally; upstream unchanged";
        plan.reviewItems.push({ code: d.review, id: item.id, target: item.target, message: `${item.target} differs from the installed version (local edit kept).` });
        newItems.push(keepOld(item, li));
      }
      if (d.clear) clearIncoming(item);
      continue;
    }

    if (item.kind === "json-entry") {
      const s = loadShared("mcp", MCP, readMcp);
      if (s.bad) continue;
      const cur = s.parsed ? s.parsed.servers[item.name] : undefined;
      const local = cur === undefined ? null : sha256Json(cur);
      const d = decide(li, local, item.hash, hasUnres);
      if (d.collision) {
        addCollision("MCP_ENTRY_DIFFERENT", item.target, `mcpServers.${item.name} already exists with a different value`, "rename your existing entry or make it identical, then re-run", item.pointer);
        continue;
      }
      const a = addAction(item, d.op, { localHash: local });
      if (d.op === "create" || d.op === "update" || d.op === "restore") {
        sharedOps.mcp.push({ name: item.name, value: item.value });
        a.resultHash = item.hash;
        newItems.push(lockItemOf(item, item.hash));
      } else if (d.op === "adopt") {
        a.resultHash = item.hash;
        newItems.push(lockItemOf(item, item.hash, { adopted: true }));
      } else if (d.op === "unchanged") {
        newItems.push(keepOld(item, li));
      } else if (d.conflict) {
        a.reason = "edited locally and changed upstream";
        incomingCopy(item, `${JSON.stringify(item.value, null, 2)}\n`, item.hash, a);
        newItems.push(keepOld(item, li));
      } else {
        a.reason = "edited locally; upstream unchanged";
        plan.reviewItems.push({ code: d.review, id: item.id, target: item.target, message: `mcpServers.${item.name} differs from the installed version (local edit kept).` });
        newItems.push(keepOld(item, li));
      }
      if (d.clear) clearIncoming(item);
      continue;
    }

    if (item.kind === "jsonc-item") {
      const s = loadShared("ext", EXT, readExtensions);
      if (s.bad) continue;
      const key = item.value.toLowerCase();
      const present = s.parsed ? s.parsed.recs.has(key) : false;
      const declined = s.parsed ? s.parsed.unwanted.has(key) : false;
      if (li && li.preexisting) {
        addAction(item, "unchanged", { reason: "recommendation existed before setup" });
        newItems.push(keepOld(item, li));
      } else if (!li && present) {
        addAction(item, "skip-preexisting", { reason: "already recommended" });
        newItems.push(lockItemOf(item, item.hash, { preexisting: true }));
      } else if (!li && declined && !present) {
        addCollision("DECLINED", item.target, `${item.value} is listed in unwantedRecommendations`, "remove it from unwantedRecommendations if you want the recommendation, then re-run");
      } else if (!li) {
        addAction(item, "create", {}).resultHash = item.hash;
        sharedOps.ext.push(item.value);
        newItems.push(lockItemOf(item, item.hash));
      } else if (present) {
        addAction(item, "unchanged", {});
        newItems.push(keepOld(item, li));
      } else if (declined) {
        addAction(item, "keep-local", { reason: "declined locally" });
        plan.notices.push({ code: "DECLINED_LOCALLY", target: item.target, message: `${item.value} is in unwantedRecommendations; the recommendation is not restored.` });
        newItems.push(keepOld(item, li));
      } else {
        addAction(item, "restore", {}).resultHash = item.hash;
        sharedOps.ext.push(item.value);
        newItems.push(keepOld(item, li));
      }
      continue;
    }

    // line
    const s = loadShared("ignore", GITIGNORE, () => null);
    if (s.bad) continue;
    const present = s.t.exists && hasLine(s.t.text, item.line);
    if (li && li.preexisting) {
      addAction(item, "unchanged", {});
      newItems.push(keepOld(item, li));
    } else if (!li && present) {
      addAction(item, "skip-preexisting", { reason: "line already present" });
      newItems.push(lockItemOf(item, item.hash, { preexisting: true }));
    } else if (li && present) {
      addAction(item, "unchanged", {});
      newItems.push(keepOld(item, li));
    } else {
      addAction(item, li ? "restore" : "create", {}).resultHash = item.hash;
      sharedOps.ignore.push(item.line);
      newItems.push(li ? keepOld(item, li) : lockItemOf(item, item.hash));
    }
  }

  // Items owned in the lock that this release no longer ships.
  const desiredIds = new Set(desired.map((d) => d.id));
  for (const li of lock?.items || []) {
    if (desiredIds.has(li.id)) continue;
    const ghost = { id: li.id, kind: li.kind, target: li.target, pointer: li.pointer, owner: li.owner, hash: li.sha256 };
    if (li.preexisting) {
      addAction(ghost, "unchanged", { reason: "no longer shipped (not owned)" });
      continue;
    }
    if (li.kind === "file") {
      const t = readTarget(project, li.target);
      if (!t.exists) {
        addAction(ghost, "unchanged", { reason: "no longer shipped; already absent" });
      } else if (t.isFile && sha256Text(t.text) === li.sha256) {
        addAction(ghost, "remove", { reason: "no longer shipped", localHash: li.sha256 });
        stageDelete(li.target);
      } else {
        addAction(ghost, "keep-local", { reason: "no longer shipped; edited locally" });
        plan.reviewItems.push({ code: "REMOVED_UPSTREAM_KEPT", id: li.id, target: li.target, message: `${li.target} is no longer shipped but was edited locally; kept and no longer managed.` });
      }
      if (unresolved.has(li.id)) clearIncoming(li);
    } else {
      addAction(ghost, "keep-local", { reason: "no longer shipped; remove by hand if unwanted" });
      plan.reviewItems.push({ code: "REMOVED_UPSTREAM_KEPT", id: li.id, target: li.target, message: `${li.id} is no longer shipped; it was left in place and is no longer managed.` });
      if (unresolved.has(li.id)) clearIncoming(li);
    }
  }

  // Shared file edits (one write per file).
  if (plan.collisions.length === 0) {
    if (sharedOps.mcp.length) {
      const s = shared.mcp;
      stageFile(MCP, applyMcpOps(s.t.exists ? s.t.text : null, sharedOps.mcp), s.t);
    }
    if (sharedOps.ext.length) {
      const s = shared.ext;
      stageFile(EXT, applyExtensionOps(s.t.exists ? s.t.text : null, sharedOps.ext), s.t);
    }
    if (sharedOps.ignore.length) {
      const s = shared.ignore;
      let text = s.t.exists ? s.t.text : null;
      for (const l of sharedOps.ignore) text = appendLine(text, l);
      stageFile(GITIGNORE, text, s.t);
    }
  }

  // Lock.
  const newLock = {
    schemaVersion: 1,
    tool: "cloudnaut-dev-setup",
    version: tool.version,
    profile: requested,
    options,
    items: newItems,
    unresolved: [...newUnresolved.values()],
  };
  const newLockText = renderLock(newLock);
  plan.lock = { path: LOCK_PATH, changed: lockText === null || normalizeText(lockText) !== newLockText };
  plan.writes = [...fileWrites.values()].sort((a, b) => (a.path < b.path ? -1 : 1));
  if (plan.lock.changed) {
    const cur = readTarget(project, LOCK_PATH);
    plan.writes.push({
      path: LOCK_PATH, realPath: cur.realPath, mode: cur.exists ? "replace" : "create", content: newLockText,
      expectBeforeHash: cur.exists ? cur.raw : null, resultHash: sha256Text(newLockText), isLock: true,
    });
  }

  // Warnings.
  if (options.withCodegraph) {
    const found = findOnPath("codegraph", env);
    plan.warnings.push(found
      ? { code: "CODEGRAPH_FOUND", message: `codegraph found on PATH (${found}); run 'codegraph init' in the project and check the version with doctor.` }
      : { code: "CODEGRAPH_INSTALL_FIRST", message: "install @colbymchenry/codegraph@1.6.4 (npm install -g), then run codegraph init; the codegraph MCP server fails to start until then" });
  }
  if (options.verifyCommand) plan.warnings.push(...verifyWarnings(options.verifyCommand));

  const count = (op) => plan.actions.filter((a) => a.op === op).length;
  plan.summary = {
    create: count("create"), update: count("update"), adopt: count("adopt"), unchanged: count("unchanged"),
    keepLocal: count("keep-local"), restore: count("restore"), remove: count("remove"), skipPreexisting: count("skip-preexisting"),
    collisions: plan.collisions.length, reviewItems: plan.reviewItems.length, writes: plan.writes.length,
  };
  return plan;
}

export function collisionError(plan) {
  return new SetupError("COLLISION", EXIT.COLLISION, `${plan.collisions.length} collision(s) found; nothing was written`, { collisions: plan.collisions });
}
