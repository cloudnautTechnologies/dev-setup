import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { loadRelease } from "../src/manifest.js";
import { exists, fixtureProject, makeRelease, read, run, runJson, snapshot, write } from "./helpers/util.js";

const CORE = ".kiro/steering/cloudnaut-core.md";
const SKILL = ".kiro/skills/trace-code-path/SKILL.md";
const EXAMPLE = "docs/cloudnaut/project-steering.example.md";
const lockOf = (p) => JSON.parse(read(p, ".cloudnaut/dev-setup.lock.json"));
const base = loadRelease();
const edit = (rel, fn) => (root) => {
  const f = path.join(root, "profiles", ...rel.split("/"));
  fs.writeFileSync(f, fn(fs.readFileSync(f, "utf8")));
};
const chain = (...fns) => (root) => fns.forEach((f) => f(root));
const coreSrc = "core/files/.kiro/steering/cloudnaut-core.md";
const skillSrc = "core/files/.kiro/skills/trace-code-path/SKILL.md";

async function installed(profile = "aws", extra = []) {
  const p = fixtureProject();
  const r = await run(["apply", "--project", p, "--profile", profile, ...extra], { release: base });
  assert.equal(r.code, 0, r.err);
  return p;
}
const up = (p, release, extra = []) => runJson(["apply", "--project", p, "--profile", "aws", ...extra], { release });

test("upgrade updates unmodified files and records the new version", async () => {
  const p = await installed();
  const r2 = makeRelease("0.2.0", edit(coreSrc, (t) => `${t}\n- A new upstream line.\n`));
  const pre = await runJson(["preview", "--project", p, "--profile", "aws"], { release: r2 });
  assert.equal(pre.json.plan.summary.update, 1);
  const r = await up(p, r2);
  assert.equal(r.code, 0, r.err);
  assert.ok(read(p, CORE).includes("A new upstream line"));
  assert.equal(lockOf(p).version, "0.2.0");
  const again = await up(p, r2);
  assert.equal(again.json.plan.writes.length, 0);
});

test("a locally edited file with no upstream change is kept and reported", async () => {
  const p = await installed();
  write(p, CORE, `${read(p, CORE)}\n- Project rule.\n`);
  const r2 = makeRelease("0.2.0", edit(skillSrc, (t) => `${t}\nExtra.\n`));
  const r = await up(p, r2);
  assert.equal(r.code, 0);
  assert.ok(read(p, CORE).includes("Project rule"));
  assert.ok(r.json.plan.reviewItems.some((i) => i.code === "LOCALLY_MODIFIED" && i.target === CORE));
  assert.ok(read(p, SKILL).endsWith("Extra.\n"), "the unmodified file still updates");
});

test("local edit equal to the new upstream content is adopted", async () => {
  const p = await installed();
  const r2 = makeRelease("0.2.0", edit(coreSrc, (t) => `${t}\n- Same line.\n`));
  write(p, CORE, `${read(p, CORE)}\n- Same line.\n`);
  const r = await up(p, r2);
  assert.equal(r.json.plan.summary.adopt, 1);
  assert.equal(lockOf(p).items.find((i) => i.target === CORE).adopted, true);
  assert.ok(!exists(p, `.cloudnaut/incoming/${CORE}`));
});

test("conflict keeps the local file, writes an incoming copy, and exits 0", async () => {
  const p = await installed();
  const local = `${read(p, CORE)}\n- Local rule.\n`;
  write(p, CORE, local);
  const r2 = makeRelease("0.2.0", edit(coreSrc, (t) => `${t}\n- Upstream rule.\n`));
  const r = await up(p, r2);
  assert.equal(r.code, 0, r.err);
  assert.equal(read(p, CORE), local, "local file untouched");
  assert.ok(read(p, `.cloudnaut/incoming/${CORE}`).includes("Upstream rule"));
  assert.ok(!exists(p, `${CORE}.new`));
  assert.ok(r.json.plan.reviewItems.some((i) => i.code === "CONFLICT"));
  const lock = lockOf(p);
  assert.equal(lock.unresolved.length, 1);
  assert.equal(lock.unresolved[0].incoming, `.cloudnaut/incoming/${CORE}`);
  assert.equal(lock.version, "0.2.0");
  // surfaced again, but idempotent
  const before = snapshot(p);
  const again = await up(p, r2);
  assert.equal(again.json.plan.writes.length, 0);
  assert.equal(again.json.plan.reviewItems.length, 1);
  assert.deepEqual(snapshot(p), before);
  // doctor shows it as INFO, not broken
  const d = await run(["doctor", "--project", p, "--no-exec"], { release: r2 });
  assert.equal(d.code, 0);
  assert.ok(d.out.includes("UNRESOLVED_INCOMING"));
});

async function conflicted() {
  const p = await installed();
  write(p, CORE, `${read(p, CORE)}\n- Local rule.\n`);
  const r2 = makeRelease("0.2.0", edit(coreSrc, (t) => `${t}\n- Upstream rule.\n`));
  await up(p, r2);
  return { p, r2 };
}

test("resolution by adopt removes the incoming copy and the unresolved entry", async () => {
  const { p, r2 } = await conflicted();
  write(p, CORE, read(p, `.cloudnaut/incoming/${CORE}`));
  const r = await up(p, r2);
  assert.equal(r.json.plan.summary.adopt, 1);
  assert.ok(!exists(p, `.cloudnaut/incoming/${CORE}`));
  assert.ok(!exists(p, ".cloudnaut/incoming"), "empty incoming folders are pruned");
  assert.equal(lockOf(p).unresolved.length, 0);
});

test("resolution by restore (delete the local file) takes the new upstream file", async () => {
  const { p, r2 } = await conflicted();
  fs.rmSync(path.join(p, CORE));
  const r = await up(p, r2);
  assert.equal(r.json.plan.summary.restore, 1);
  assert.ok(read(p, CORE).includes("Upstream rule"));
  assert.ok(!exists(p, `.cloudnaut/incoming/${CORE}`));
  assert.equal(lockOf(p).unresolved.length, 0);
});

test("resolution by update: a later release equals the base again and local was reverted", async () => {
  const { p } = await conflicted();
  const baseText = fs.readFileSync(path.join(process.cwd(), "profiles", coreSrc), "utf8");
  write(p, CORE, baseText);
  const r3 = makeRelease("0.3.0");
  const r = await up(p, r3);
  assert.equal(r.code, 0, r.err);
  assert.ok(!exists(p, `.cloudnaut/incoming/${CORE}`));
  assert.equal(lockOf(p).unresolved.length, 0);
  assert.equal(lockOf(p).version, "0.3.0");
});

test("a deleted incoming copy is rewritten while the conflict persists", async () => {
  const { p, r2 } = await conflicted();
  fs.rmSync(path.join(p, ".cloudnaut/incoming", CORE));
  const r = await up(p, r2);
  assert.ok(r.json.plan.writes.some((w) => w.path === `.cloudnaut/incoming/${CORE}`));
  assert.ok(exists(p, `.cloudnaut/incoming/${CORE}`));
});

test("an MCP entry conflict uses the portable incoming path", async () => {
  const p = await installed();
  const m = path.join(p, ".kiro/settings/mcp.json");
  const j = JSON.parse(fs.readFileSync(m, "utf8"));
  j.mcpServers["aws-knowledge-mcp"].disabled = true;
  fs.writeFileSync(m, JSON.stringify(j, null, 2));
  const r2 = makeRelease("0.2.0", (root) => fs.writeFileSync(path.join(root, "profiles/aws/mcp/aws-knowledge-mcp.json"), '{\n  "url": "https://knowledge-mcp.global.api.aws",\n  "disabled": false\n}\n'));
  const r = await up(p, r2);
  assert.equal(r.code, 0, r.err);
  const inc = ".cloudnaut/incoming/.kiro/settings/mcp.json.aws-knowledge-mcp.json";
  assert.deepEqual(JSON.parse(read(p, inc)), { url: "https://knowledge-mcp.global.api.aws", disabled: false });
  assert.equal(JSON.parse(read(p, ".kiro/settings/mcp.json")).mcpServers["aws-knowledge-mcp"].disabled, true);
  assert.equal(lockOf(p).unresolved[0].incoming, inc);
});

test("opt-out: \"disabled\": true on the MCP entry is preserved on upgrade", async () => {
  const p = await installed();
  const m = path.join(p, ".kiro/settings/mcp.json");
  const j = JSON.parse(fs.readFileSync(m, "utf8"));
  j.mcpServers["aws-knowledge-mcp"].disabled = true;
  fs.writeFileSync(m, JSON.stringify(j, null, 2));
  const r = await up(p, makeRelease("0.2.0"));
  assert.equal(r.code, 0);
  assert.equal(JSON.parse(read(p, ".kiro/settings/mcp.json")).mcpServers["aws-knowledge-mcp"].disabled, true);
  assert.ok(r.json.plan.reviewItems.some((i) => i.code === "LOCALLY_MODIFIED"));
});

test("opt-out: an owned extension moved to unwantedRecommendations is not restored", async () => {
  const p = await installed();
  const f = path.join(p, ".vscode/extensions.json");
  const text = fs.readFileSync(f, "utf8").replace('    "amazonwebservices.aws-toolkit-vscode",\n', "").replace('"example.deprecated-tool"', '"example.deprecated-tool",\n    "amazonwebservices.aws-toolkit-vscode"');
  fs.writeFileSync(f, text);
  const before = snapshot(p);
  const r = await up(p, makeRelease("0.2.0"));
  assert.equal(r.code, 0, r.err);
  assert.ok(r.json.plan.notices.some((n) => n.code === "DECLINED_LOCALLY"));
  assert.equal(snapshot(p).get(".vscode/extensions.json"), before.get(".vscode/extensions.json"));
});

test("an owned recommendation removed by hand is restored", async () => {
  const p = await installed();
  const f = path.join(p, ".vscode/extensions.json");
  fs.writeFileSync(f, fs.readFileSync(f, "utf8").replace('    "amazonwebservices.aws-toolkit-vscode",\n', ""));
  const r = await up(p, base);
  assert.equal(r.code, 0);
  assert.ok(read(p, ".vscode/extensions.json").includes("amazonwebservices.aws-toolkit-vscode"));
});

test("a file dropped upstream is removed when unmodified, kept when edited", async () => {
  const drop = (root) => fs.rmSync(path.join(root, "profiles/core/files", EXAMPLE));
  const p = await installed();
  const r = await up(p, makeRelease("0.2.0", drop));
  assert.equal(r.json.plan.summary.remove, 1);
  assert.ok(!exists(p, EXAMPLE));
  assert.ok(!lockOf(p).items.some((i) => i.target === EXAMPLE));
  assert.ok(!exists(p, "docs/cloudnaut"), "emptied folder is not left behind by the setup");

  const q = await installed();
  write(q, EXAMPLE, `${read(q, EXAMPLE)}\nmine\n`);
  const r2 = await up(q, makeRelease("0.2.0", drop));
  assert.ok(exists(q, EXAMPLE));
  assert.ok(r2.json.plan.reviewItems.some((i) => i.code === "REMOVED_UPSTREAM_KEPT"));
  assert.ok(!lockOf(q).items.some((i) => i.target === EXAMPLE));
});

test("a missing owned file is restored", async () => {
  const p = await installed();
  fs.rmSync(path.join(p, SKILL));
  const r = await up(p, base);
  assert.equal(r.json.plan.summary.restore, 1);
  assert.ok(exists(p, SKILL));
  assert.equal(r.json.plan.lock.changed, false, "lock bytes do not change on a restore-only run");
});

test("edits elsewhere in shared files are never conflicts", async () => {
  const p = await installed();
  const m = path.join(p, ".kiro/settings/mcp.json");
  const j = JSON.parse(fs.readFileSync(m, "utf8"));
  j.mcpServers["another-server"] = { url: "https://another.example.com" };
  j.somethingNew = 1;
  fs.writeFileSync(m, JSON.stringify(j, null, 2));
  const r = await up(p, makeRelease("0.2.0", edit(coreSrc, (t) => `${t}\n- x\n`)));
  assert.equal(r.code, 0);
  const after = JSON.parse(read(p, ".kiro/settings/mcp.json"));
  assert.ok(after.mcpServers["another-server"] && after.somethingNew === 1);
  assert.equal(r.json.plan.reviewItems.length, 0);
});

test("downgrade and profile narrowing are refused with no writes", async () => {
  const p = await installed("connect");
  const r2 = makeRelease("0.2.0");
  await run(["apply", "--project", p, "--profile", "connect"], { release: r2 });
  const state = snapshot(p);
  const down = await run(["apply", "--project", p, "--profile", "connect"], { release: base });
  assert.equal(down.code, 2);
  assert.ok(down.err.includes("DOWNGRADE") && down.err.includes("revert"));
  const narrow = await run(["apply", "--project", p, "--profile", "aws"], { release: r2 });
  assert.equal(narrow.code, 2);
  assert.ok(narrow.err.includes("NARROWING"));
  assert.deepEqual(snapshot(p), state);
});

test("a tampered unresolved.incoming path is refused as LOCK_INVALID", async () => {
  const { p, r2 } = await conflicted();
  const f = path.join(p, ".cloudnaut/dev-setup.lock.json");
  const lock = JSON.parse(fs.readFileSync(f, "utf8"));
  lock.unresolved[0].incoming = "../outside.md";
  fs.writeFileSync(f, JSON.stringify(lock, null, 2));
  const state = snapshot(p);
  const r = await run(["apply", "--project", p, "--profile", "aws"], { release: r2 });
  assert.equal(r.code, 6);
  assert.ok(r.err.includes("LOCK_INVALID"));
  assert.deepEqual(snapshot(p), state);
  lock.unresolved[0].incoming = ".cloudnaut/incoming/somewhere/else.md";
  fs.writeFileSync(f, JSON.stringify(lock, null, 2));
  assert.equal((await run(["preview", "--project", p], { release: r2 })).code, 6);
});

test("an invalid or unknown-schema lock exits 6; doctor reports it as broken", async () => {
  const p = await installed();
  const f = path.join(p, ".cloudnaut/dev-setup.lock.json");
  const lock = JSON.parse(fs.readFileSync(f, "utf8"));
  fs.writeFileSync(f, JSON.stringify({ ...lock, schemaVersion: 2 }));
  assert.equal((await run(["apply", "--project", p, "--profile", "aws"], { release: base })).code, 6);
  const d = await run(["doctor", "--project", p, "--no-exec"], { release: base });
  assert.equal(d.code, 4);
  fs.writeFileSync(f, "not json");
  assert.equal((await run(["preview", "--project", p], { release: base })).code, 6);
});

test("changing --verify-command later updates the unmodified command file", async () => {
  const p = await installed("aws", ["--verify-command", "npm test"]);
  const r = await up(p, base, ["--verify-command", "npm run verify"]);
  assert.equal(r.code, 0, r.err);
  assert.equal(JSON.parse(read(p, ".cloudnaut/verify-command.json")).command, "npm run verify");
  assert.equal(lockOf(p).options.verifyCommand, "npm run verify");
});
