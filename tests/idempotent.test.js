import assert from "node:assert/strict";
import test from "node:test";
import { fixtureProject, mtimes, run, snapshot } from "./helpers/util.js";

test("a repeat apply at the same version changes no content, no mtime, and does not rewrite the lock", async () => {
  const p = fixtureProject();
  const args = ["apply", "--project", p, "--profile", "connect", "--with-codegraph", "--with-ponytail", "--verify-command", "npm test"];
  const first = await run(args);
  assert.equal(first.code, 0, first.err);
  const content = snapshot(p);
  const times = mtimes(p);
  await new Promise((r) => setTimeout(r, 30));
  const second = await run(args);
  assert.equal(second.code, 0, second.err);
  assert.ok(second.out.includes("Already up to date"));
  assert.deepEqual(snapshot(p), content);
  assert.deepEqual(mtimes(p), times);
});
