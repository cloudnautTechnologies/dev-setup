// Lock file: schema, validation, canonical rendering.
import fs from "node:fs";
import path from "node:path";
import { internal } from "./errors.js";
import { isAllowedTarget, isSafeRelative } from "./paths.js";

export const LOCK_PATH = ".cloudnaut/dev-setup.lock.json";
export const INCOMING_ROOT = ".cloudnaut/incoming/";
const KINDS = ["file", "json-entry", "jsonc-item", "line"];
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const HEX64 = /^[0-9a-f]{64}$/;

export function parseSemver(v) {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(v);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : [0, 0, 0];
}

export function compareSemver(a, b) {
  const x = parseSemver(a);
  const y = parseSemver(b);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  return 0;
}

/** Portable incoming-copy path for an item. */
export function incomingPath(item) {
  if (item.kind === "file") return `${INCOMING_ROOT}${item.target}`;
  if (item.kind === "json-entry") return `${INCOMING_ROOT}${item.target}.${item.pointer.split("/").pop()}.json`;
  return null;
}

const bad = (msg) => internal("LOCK_INVALID", `invalid lock file: ${msg}`, "restore the lock from Git, or fix it by hand");

export function validateLock(lock, knownProfiles) {
  if (!lock || typeof lock !== "object") throw bad("not an object");
  if (lock.schemaVersion !== 1) throw internal("LOCK_INVALID", `unsupported lock schemaVersion ${lock.schemaVersion}`, "use a newer Cloudnaut dev-setup release");
  if (lock.tool !== "cloudnaut-dev-setup") throw bad("tool does not match");
  if (typeof lock.version !== "string" || !SEMVER.test(lock.version)) throw bad("version is not semver");
  if (!knownProfiles.includes(lock.profile)) throw bad(`unknown profile ${lock.profile}`);
  const o = lock.options;
  if (!o || typeof o.withCodegraph !== "boolean" || typeof o.withPonytail !== "boolean" || !(o.verifyCommand === null || typeof o.verifyCommand === "string")) {
    throw bad("options are malformed");
  }
  if (!Array.isArray(lock.items) || !Array.isArray(lock.unresolved)) throw bad("items or unresolved is not an array");
  const ids = new Set();
  for (const it of lock.items) {
    if (!it || typeof it.id !== "string" || !KINDS.includes(it.kind)) throw bad("item has bad id or kind");
    if (ids.has(it.id)) throw bad(`duplicate item ${it.id}`);
    ids.add(it.id);
    if (!isSafeRelative(it.target) || !isAllowedTarget(it.target)) throw bad(`item target is not allowed: ${it.target}`);
    if (typeof it.sha256 !== "string" || !HEX64.test(it.sha256)) throw bad(`bad sha256 for ${it.id}`);
    if (it.kind === "json-entry" && typeof it.pointer !== "string") throw bad(`missing pointer for ${it.id}`);
    if (it.kind === "jsonc-item" && typeof it.value !== "string") throw bad(`missing value for ${it.id}`);
    if (it.kind === "line" && typeof it.line !== "string") throw bad(`missing line for ${it.id}`);
  }
  for (const u of lock.unresolved) {
    const it = lock.items.find((x) => x.id === u.id);
    if (!it) throw bad(`unresolved item not in items: ${u.id}`);
    const expected = incomingPath(it);
    if (!expected || u.incoming !== expected || !u.incoming.startsWith(INCOMING_ROOT) || !isSafeRelative(u.incoming)) {
      throw bad(`unresolved incoming path is not the expected one for ${u.id}`);
    }
    if (typeof u.incomingSha256 !== "string" || !HEX64.test(u.incomingSha256)) throw bad(`bad incomingSha256 for ${u.id}`);
  }
  return lock;
}

export function readLock(project, knownProfiles) {
  const file = path.join(project, ...LOCK_PATH.split("/"));
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") return { lock: null, text: null };
    throw internal("LOCK_INVALID", `lock file cannot be read: ${err.message}`, "check the file permissions");
  }
  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    throw bad(err.message);
  }
  return { lock: validateLock(data, knownProfiles), text };
}

function sorted(v) {
  if (Array.isArray(v)) return v.map(sorted);
  if (v && typeof v === "object") return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sorted(v[k])]));
  return v;
}

export function renderLock(lock) {
  const copy = {
    ...lock,
    items: [...lock.items].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
    unresolved: [...lock.unresolved].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
  };
  return `${JSON.stringify(sorted(copy), null, 2)}\n`;
}
