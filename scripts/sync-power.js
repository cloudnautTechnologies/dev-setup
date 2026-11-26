// Copies the single-source Connect skill into the Power. Usage: node scripts/sync-power.js [--check]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SKILL = "connect-flow-troubleshooting";
export const sourceDir = (root = ROOT) => path.join(root, "profiles", "connect", "files", ".kiro", "skills", SKILL);
export const powerDir = (root = ROOT) =>
  path.join(root, "powers", "cloudnaut-connect-troubleshooting", "skills", SKILL);

function tree(dir) {
  const out = new Map();
  const walk = (d, rel) => {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isSymbolicLink()) throw new Error(`symlink not allowed: ${path.join(d, e.name)}`);
      if (e.isDirectory()) walk(path.join(d, e.name), r);
      else out.set(r, fs.readFileSync(path.join(d, e.name), "utf8").replace(/\r\n/g, "\n"));
    }
  };
  walk(dir, "");
  return out;
}

/** Returns the list of differences between source and Power copy. */
export function diffPower(root = ROOT) {
  const src = tree(sourceDir(root));
  const dst = tree(powerDir(root));
  const diffs = [];
  for (const [k, v] of src) {
    if (!dst.has(k)) diffs.push(`missing in power: ${k}`);
    else if (dst.get(k) !== v) diffs.push(`differs: ${k}`);
  }
  for (const k of dst.keys()) if (!src.has(k)) diffs.push(`extra in power: ${k}`);
  return diffs;
}

export function syncPower(root = ROOT) {
  const src = tree(sourceDir(root));
  fs.rmSync(powerDir(root), { recursive: true, force: true });
  for (const [k, v] of src) {
    const out = path.join(powerDir(root), ...k.split("/"));
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, v);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes("--check")) {
    const d = diffPower();
    if (d.length) {
      console.error(`Power skill copy is stale:\n  ${d.join("\n  ")}\nRun: node scripts/sync-power.js`);
      process.exit(1);
    }
    console.log("Power skill copy matches the source");
  } else {
    syncPower();
    console.log("synced Power skill copy");
  }
}
