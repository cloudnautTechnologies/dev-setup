// Parses JSON files. Usage: node scripts/check-json.js [dir ...]   (default: this repository)
// extensions.json is parsed as JSONC (comments and trailing commas allowed); everything else as strict JSON.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseDoc } from "../src/jsontext.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const roots = process.argv.slice(2).length ? process.argv.slice(2).map((d) => path.resolve(d)) : [ROOT];
const SKIP = new Set([".git", "node_modules", ".agents"]);

let count = 0;
const bad = [];
function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name) || e.isSymbolicLink()) continue;
    const f = path.join(dir, e.name);
    if (e.isDirectory()) walk(f);
    else if (e.name.endsWith(".json")) {
      count++;
      const text = fs.readFileSync(f, "utf8");
      try {
        if (e.name === "extensions.json") parseDoc(text);
        else JSON.parse(text.replace(/^\uFEFF/, ""));
      } catch (err) {
        bad.push(`${f}: ${err.message}`);
      }
    }
  }
}
roots.forEach(walk);
for (const b of bad) console.error(b);
console.log(`${count - bad.length}/${count} JSON files parse`);
process.exit(bad.length ? 1 : 0);
