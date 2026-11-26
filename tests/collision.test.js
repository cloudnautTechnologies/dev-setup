import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { executePlan } from "../src/apply.js";
import { loadRelease } from "../src/manifest.js";
import { buildPlan } from "../src/plan.js";
import { dirs, fixtureProject, mtimes, read, run, runJson, snapshot, write } from "./helpers/util.js";

async function expectCollision(project, profile, code, mutate) {
  mutate(project);
  const state = [snapshot(project), dirs(project), mtimes(project)];
  for (const cmd of ["preview", "apply"]) {
    const r = await runJson([cmd, "--project", project, "--profile", profile]);
    assert.equal(r.code, 2, `${cmd}: ${r.err}`);
    assert.ok(r.json.plan.collisions.some((c) => c.code === code), `${cmd} reports ${code}`);
    assert.ok(r.json.plan.collisions.every((c) => c.fix && c.target), "each collision names the path and a fix");
    assert.deepEqual([snapshot(project), dirs(project), mtimes(project)], state, `${cmd} wrote nothing`);
  }
}

test("EXISTS_DIFFERENT: an unmanaged file with different content", async () => {
  await expectCollision(fixtureProject(), "core", "EXISTS_DIFFERENT", (p) => write(p, ".kiro/steering/cloudnaut-core.md", "my own file\n"));
});

test("MCP_ENTRY_DIFFERENT: same server name, different value", async () => {
  await expectCollision(fixtureProject(), "aws", "MCP_ENTRY_DIFFERENT", (p) =>
    write(p, ".kiro/settings/mcp.json", '{ "mcpServers": { "aws-knowledge-mcp": { "url": "https://other.example.com" } } }\n'));
});

test("UNPARSEABLE: mcp.json with a comment, and extensions.json that is malformed", async () => {
  await expectCollision(fixtureProject(), "aws", "UNPARSEABLE", (p) => write(p, ".kiro/settings/mcp.json", '{ "mcpServers": {} } // note\n'));
  await expectCollision(fixtureProject(), "aws", "UNPARSEABLE", (p) => write(p, ".vscode/extensions.json", '{ "recommendations": [ '));
  await expectCollision(fixtureProject(), "aws", "UNPARSEABLE", (p) => write(p, ".vscode/extensions.json", '{ "recommendations": [1] }'));
});

test("DECLINED: the extension is in unwantedRecommendations on a first install", async () => {
  await expectCollision(fixtureProject(), "aws", "DECLINED", (p) =>
    write(p, ".vscode/extensions.json", '{ "recommendations": [], "unwantedRecommendations": ["amazonwebservices.aws-toolkit-vscode"] }'));
});

test("TYPE_MISMATCH: a directory where a file is needed", async () => {
  await expectCollision(fixtureProject(), "core", "TYPE_MISMATCH", (p) => fs.mkdirSync(path.join(p, ".kiro/steering/cloudnaut-core.md"), { recursive: true }));
});

test("an existing non-owned hook file collides", async () => {
  const p = fixtureProject();
  write(p, ".kiro/hooks/cloudnaut-verify-after-task.json", '{ "version": "v1", "hooks": [] }\n');
  const r = await runJson(["apply", "--project", p, "--profile", "core", "--verify-command", "npm test"]);
  assert.equal(r.code, 2);
  assert.ok(r.json.plan.collisions.some((c) => c.code === "EXISTS_DIFFERENT"));
});

test("all collisions are listed at once", async () => {
  const p = fixtureProject();
  write(p, ".kiro/steering/cloudnaut-core.md", "mine\n");
  write(p, ".kiro/steering/cloudnaut-aws-cdk.md", "mine too\n");
  const r = await runJson(["preview", "--project", p, "--profile", "aws"]);
  assert.equal(r.json.plan.collisions.length, 2);
});

test("CHANGED_DURING_APPLY: a target changing between planning and writing aborts with nothing written", () => {
  const p = fixtureProject();
  const plan = buildPlan({ project: p, release: loadRelease(), profile: "aws", flags: {} });
  const mcp = ".kiro/settings/mcp.json";
  fs.writeFileSync(path.join(p, mcp), `${read(p, mcp)} `);
  const state = [snapshot(p), dirs(p)];
  assert.throws(() => executePlan(plan), (e) => e.kind === "CHANGED_DURING_APPLY" && e.exitCode === 2);
  assert.deepEqual([snapshot(p), dirs(p)], state);
});

test("a collision-bearing plan cannot be executed", () => {
  const p = fixtureProject();
  write(p, ".kiro/steering/cloudnaut-core.md", "mine\n");
  const plan = buildPlan({ project: p, release: loadRelease(), profile: "core", flags: {} });
  assert.ok(plan.collisions.length);
  const state = snapshot(p);
  assert.throws(() => executePlan(plan), (e) => e.exitCode === 2);
  assert.deepEqual(snapshot(p), state);
});

test("usage errors exit 1 and write nothing", async () => {
  const p = fixtureProject();
  const state = snapshot(p);
  for (const argv of [["apply", "--project", p], ["apply", "--project", p, "--profile", "nope"], ["apply", "--profile", "core"], ["apply", "--project", p, "--profile", "core", "--verify-command", "a\nb"], ["apply", "--project", p, "--profile", "core", "--verify-command", " "], ["apply", "--project", p, "--profile", "core", "--no-exec"], ["frobnicate"], ["apply", "--project", p, "--profile", "core", "--bogus"]]) {
    const r = await run(argv);
    assert.equal(r.code, 1, argv.join(" "));
  }
  assert.deepEqual(snapshot(p), state);
});
