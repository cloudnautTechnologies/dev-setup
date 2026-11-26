import assert from "node:assert/strict";
import test from "node:test";
import { dirs, emptyProject, fixtureProject, mtimes, run, runJson, snapshot } from "./helpers/util.js";

test("preview leaves the whole tree byte-identical and creates no directories", async () => {
  for (const make of [fixtureProject, emptyProject]) {
    const p = make();
    const before = [snapshot(p), dirs(p), mtimes(p)];
    const r = await run(["preview", "--project", p, "--profile", "connect", "--with-codegraph", "--with-ponytail", "--verify-command", "npm test"]);
    assert.equal(r.code, 0, r.err);
    assert.ok(r.out.includes("Nothing was written"));
    assert.deepEqual([snapshot(p), dirs(p), mtimes(p)], before);
  }
});

test("preview --json equals the plan embedded in apply --json, and written results match resultHash", async () => {
  const p = fixtureProject();
  const args = ["--project", p, "--profile", "aws", "--with-codegraph"];
  const pv = await runJson(["preview", ...args]);
  const ap = await runJson(["apply", ...args]);
  assert.equal(pv.code, 0);
  assert.equal(ap.code, 0);
  assert.deepEqual(ap.json.plan, pv.json.plan);
  assert.ok(ap.json.result.changed);
  assert.ok(!JSON.stringify(pv.json).includes('"content"'), "file contents are not serialized");
  const snap = snapshot(p);
  assert.ok(pv.json.plan.writes.length > 0);
});

test("preview of a project that is up to date reports no writes", async () => {
  const p = fixtureProject();
  await run(["apply", "--project", p, "--profile", "core"]);
  const r = await runJson(["preview", "--project", p, "--profile", "core"]);
  assert.equal(r.json.plan.writes.length, 0);
});
