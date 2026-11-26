// Generates release-manifest.json from profiles/ and optional features.
// Usage: node scripts/generate-manifest.js [--check]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { sha256Json, sha256Text } from "../src/hash.js";
import { isAllowedTarget } from "../src/paths.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const NAME_RE = /^[A-Za-z0-9._-]+$/;
const toPosix = (p) => p.split(path.sep).join("/");

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function walk(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const full = path.join(dir, e.name);
    if (e.isSymbolicLink()) throw new Error(`symlink not allowed in packaged content: ${full}`);
    if (e.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

function fileEntries(root, filesDir) {
  return walk(filesDir).map((full) => {
    const text = fs.readFileSync(full, "utf8");
    if (text.includes("\0")) throw new Error(`NUL byte in packaged file: ${full}`);
    return {
      source: toPosix(path.relative(root, full)),
      target: toPosix(path.relative(filesDir, full)),
      sha256: sha256Text(text),
    };
  });
}

function mcpEntries(root, dir, list) {
  return (list || []).map((e) => {
    if (!NAME_RE.test(e.name)) throw new Error(`bad MCP entry name: ${e.name}`);
    const full = path.join(dir, e.source);
    const value = readJson(full);
    if (JSON.stringify(value).includes("autoApprove")) throw new Error(`autoApprove is not allowed in ${full}`);
    return {
      file: ".kiro/settings/mcp.json",
      name: e.name,
      source: toPosix(path.relative(root, full)),
      sha256: sha256Json(value),
    };
  });
}

export function buildManifest(root = ROOT) {
  const pkg = readJson(path.join(root, "package.json"));
  const profilesDir = path.join(root, "profiles");
  const names = fs
    .readdirSync(profilesDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name !== "optional")
    .map((d) => d.name)
    .sort();

  const profiles = {};
  for (const name of names) {
    const dir = path.join(profilesDir, name);
    const def = readJson(path.join(dir, "profile.json"));
    profiles[name] = {
      includes: def.includes || [],
      files: fileEntries(root, path.join(dir, "files")),
      mcpEntries: mcpEntries(root, dir, def.mcpEntries),
      extensions: def.extensions || [],
    };
  }
  for (const [name, p] of Object.entries(profiles)) {
    for (const inc of p.includes) if (!profiles[inc]) throw new Error(`profile ${name} includes unknown profile ${inc}`);
  }
  // cycle detection
  const visiting = new Set();
  const done = new Set();
  const visit = (n) => {
    if (done.has(n)) return;
    if (visiting.has(n)) throw new Error(`profile include cycle at ${n}`);
    visiting.add(n);
    profiles[n].includes.forEach(visit);
    visiting.delete(n);
    done.add(n);
  };
  names.forEach(visit);

  const optDir = path.join(profilesDir, "optional");
  const features = {};
  const cg = readJson(path.join(optDir, "codegraph", "feature.json"));
  features.codegraph = {
    pin: cg.pin,
    mcpEntries: mcpEntries(root, path.join(optDir, "codegraph"), cg.mcpEntries),
    lines: cg.lines,
  };
  const pt = readJson(path.join(optDir, "ponytail", "feature.json"));
  features.ponytail = {
    pin: { tag: pt.pin.tag, commit: pt.pin.commit },
    files: fileEntries(root, path.join(optDir, "ponytail", "files")),
  };
  const vh = readJson(path.join(optDir, "verify-hook", "feature.json"));
  features.verifyHook = {
    files: fileEntries(root, path.join(optDir, "verify-hook", "files")),
    commandFile: {
      target: vh.commandFile.target,
      template: toPosix(path.relative(root, path.join(optDir, "verify-hook", vh.commandFile.template))),
    },
  };

  // target checks
  const seen = new Map();
  const claim = (target, who) => {
    if (!isAllowedTarget(target)) throw new Error(`target outside allowlist: ${target} (${who})`);
    if (seen.has(target)) throw new Error(`duplicate target ${target}: ${seen.get(target)} and ${who}`);
    seen.set(target, who);
  };
  for (const [n, p] of Object.entries(profiles)) p.files.forEach((f) => claim(f.target, `profile ${n}`));
  features.ponytail.files.forEach((f) => claim(f.target, "ponytail"));
  features.verifyHook.files.forEach((f) => claim(f.target, "verifyHook"));
  claim(features.verifyHook.commandFile.target, "verifyHook command file");

  return {
    schemaVersion: 1,
    name: "cloudnaut-dev-setup",
    version: pkg.version,
    minNode: "22.0.0",
    profiles,
    features,
  };
}

function sorted(v) {
  if (Array.isArray(v)) return v.map(sorted);
  if (v && typeof v === "object") {
    return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sorted(v[k])]));
  }
  return v;
}

export function renderManifest(m) {
  return `${JSON.stringify(sorted(m), null, 2)}\n`;
}

export function writeManifest(root = ROOT) {
  const text = renderManifest(buildManifest(root));
  fs.writeFileSync(path.join(root, "release-manifest.json"), text);
  return text;
}

export function checkManifest(root = ROOT) {
  const want = renderManifest(buildManifest(root));
  const file = path.join(root, "release-manifest.json");
  const have = fs.existsSync(file) ? fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n") : null;
  return { ok: have === want, want, have };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes("--check")) {
    const r = checkManifest();
    if (!r.ok) {
      console.error("release-manifest.json is stale. Run: node scripts/generate-manifest.js");
      process.exit(1);
    }
    console.log("release-manifest.json is up to date");
  } else {
    writeManifest();
    console.log("wrote release-manifest.json");
  }
}
