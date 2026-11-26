// Loads the release manifest, verifies packaged content, and derives desired items.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { internal } from "./errors.js";
import { normalizeText, sha256Json, sha256Text } from "./hash.js";
import { HOOK_COMMAND, renderVerifyCommand } from "./hook.js";

export const DEFAULT_RELEASE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const LOCK_TARGET = ".cloudnaut/dev-setup.lock.json";
export const EXTENSIONS_FILE = ".vscode/extensions.json";

export function loadRelease(root = DEFAULT_RELEASE_ROOT) {
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(path.join(root, "release-manifest.json"), "utf8"));
  } catch (err) {
    throw internal("INTEGRITY", `release-manifest.json cannot be read: ${err.message}`, "re-checkout the release tag");
  }
  if (manifest.schemaVersion !== 1) throw internal("INTEGRITY", "unsupported release manifest schema", "re-checkout the release tag");
  return { root, manifest };
}

export function profileNames(manifest) {
  return Object.keys(manifest.profiles).sort();
}

/** Depth-first expansion: includes first, then the profile itself, deduplicated. */
export function expandProfile(manifest, name) {
  const out = [];
  const visit = (n) => {
    if (out.includes(n)) return;
    for (const inc of manifest.profiles[n].includes) visit(inc);
    out.push(n);
  };
  visit(name);
  return out;
}

function readPackaged(release, rel, expectHash, hasher) {
  const full = path.join(release.root, ...rel.split("/"));
  let text;
  try {
    text = fs.readFileSync(full, "utf8");
  } catch {
    throw internal("INTEGRITY", `packaged file is missing: ${rel}`, "checkout is modified or corrupt; re-checkout the release tag");
  }
  if (hasher(text) !== expectHash) {
    throw internal("INTEGRITY", `packaged file does not match the release manifest: ${rel}`, "checkout is modified or corrupt; re-checkout the release tag");
  }
  return text;
}

const fileItem = (release, f, owner) => {
  const text = normalizeText(readPackaged(release, f.source, f.sha256, sha256Text));
  return { id: `file:${f.target}`, kind: "file", target: f.target, owner, content: text, hash: f.sha256 };
};

const mcpItem = (release, e, owner) => {
  const value = JSON.parse(readPackaged(release, e.source, e.sha256, (t) => sha256Json(JSON.parse(t))));
  return { id: `json:${e.file}#/mcpServers/${e.name}`, kind: "json-entry", target: e.file, pointer: `/mcpServers/${e.name}`, name: e.name, owner, value, hash: e.sha256 };
};

/** Desired items for a profile and options. Hook items exist only with a verify command. */
export function buildDesired(release, profile, options) {
  const m = release.manifest;
  const items = [];
  for (const name of expandProfile(m, profile)) {
    const p = m.profiles[name];
    for (const f of p.files) items.push(fileItem(release, f, name));
    for (const e of p.mcpEntries) items.push(mcpItem(release, e, name));
    for (const id of p.extensions) {
      items.push({ id: `jsonc:${EXTENSIONS_FILE}#/recommendations/${id}`, kind: "jsonc-item", target: EXTENSIONS_FILE, value: id, owner: name, hash: sha256Text(id) });
    }
  }
  if (options.withCodegraph) {
    const cg = m.features.codegraph;
    for (const e of cg.mcpEntries) items.push(mcpItem(release, e, "codegraph"));
    for (const l of cg.lines) {
      items.push({ id: `line:${l.file}#${l.line}`, kind: "line", target: l.file, line: l.line, owner: "codegraph", hash: sha256Text(l.line) });
    }
  }
  if (options.withPonytail) {
    for (const f of m.features.ponytail.files) items.push(fileItem(release, f, "ponytail"));
  }
  if (options.verifyCommand) {
    const vh = m.features.verifyHook;
    for (const f of vh.files) items.push(fileItem(release, f, "verifyHook"));
    const content = renderVerifyCommand(options.verifyCommand);
    items.push({ id: `file:${vh.commandFile.target}`, kind: "file", target: vh.commandFile.target, owner: "verifyHook", content, hash: sha256Text(content) });
  }
  return items;
}

/** Every target path in the manifest (used for the temp-file scan scope). */
export function allManifestTargets(manifest) {
  const t = new Set([".kiro/settings/mcp.json", EXTENSIONS_FILE, ".gitignore", LOCK_TARGET]);
  for (const p of Object.values(manifest.profiles)) p.files.forEach((f) => t.add(f.target));
  manifest.features.ponytail.files.forEach((f) => t.add(f.target));
  manifest.features.verifyHook.files.forEach((f) => t.add(f.target));
  t.add(manifest.features.verifyHook.commandFile.target);
  return [...t];
}

export { HOOK_COMMAND };
