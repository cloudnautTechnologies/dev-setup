import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { diffPower, powerDir, sourceDir, syncPower } from "../scripts/sync-power.js";
import { REPO, copyDir, tmpDir } from "./helpers/util.js";

const POWER = path.join(REPO, "powers", "cloudnaut-connect-troubleshooting");
const manifest = JSON.parse(fs.readFileSync(path.join(POWER, "plugin.json"), "utf8"));
const ALLOWED = ["$schema", "name", "version", "description", "author", "homepage", "repository", "license", "keywords", "extensions"];

test("plugin.json satisfies the published Agent Plugins constraints", () => {
  assert.equal(manifest.$schema, "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json");
  for (const k of Object.keys(manifest)) assert.ok(ALLOWED.includes(k), `unknown key ${k}`);
  assert.equal(manifest.name, path.basename(POWER));
  assert.ok(manifest.name.length <= 64);
  assert.match(manifest.name, /^[a-z0-9]+([.-][a-z0-9]+)*$/);
  assert.ok(!/--|\.\./.test(manifest.name));
  assert.equal(manifest.version, JSON.parse(fs.readFileSync(path.join(REPO, "package.json"), "utf8")).version);
  assert.ok(manifest.description && manifest.author?.name && manifest.homepage && manifest.repository);
  assert.ok(Array.isArray(manifest.keywords) && manifest.keywords.every((k) => typeof k === "string"));
  assert.ok(!("license" in manifest), "license stays out until the maintainers decide");
});

test("the Power has no mcp.json, no POWER.md, and no second AWS Knowledge server", () => {
  assert.ok(!fs.existsSync(path.join(POWER, "mcp.json")));
  assert.ok(!fs.existsSync(path.join(POWER, "POWER.md")));
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
  for (const f of walk(POWER)) assert.ok(!/knowledge-mcp/i.test(fs.readFileSync(f, "utf8")), f);
});

test("the Power's skill is a byte-identical copy of the single source", () => {
  assert.deepEqual(diffPower(REPO), []);
  const a = fs.readFileSync(path.join(sourceDir(REPO), "SKILL.md"));
  const b = fs.readFileSync(path.join(powerDir(REPO), "SKILL.md"));
  assert.ok(a.equals(b));
});

test("drift is detected and the sync script repairs it", () => {
  const root = tmpDir("cdev-power-");
  copyDir(path.join(REPO, "profiles"), path.join(root, "profiles"));
  copyDir(path.join(REPO, "powers"), path.join(root, "powers"));
  assert.deepEqual(diffPower(root), []);
  fs.appendFileSync(path.join(sourceDir(root), "SKILL.md"), "\nedit\n");
  assert.deepEqual(diffPower(root), ["differs: SKILL.md"]);
  fs.writeFileSync(path.join(powerDir(root), "extra.md"), "x");
  assert.equal(diffPower(root).length, 2);
  syncPower(root);
  assert.deepEqual(diffPower(root), []);
});
