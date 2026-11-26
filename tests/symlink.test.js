import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { emptyProject, exists, fixtureProject, read, run, snapshot, tmpDir } from "./helpers/util.js";

function trySymlink(target, link, type) {
  try {
    fs.symlinkSync(target, link, type);
    return true;
  } catch {
    return false;
  }
}

test("a symlinked directory that escapes the project is refused with exit 3 and nothing is written", (t) => {
  const p = fixtureProject();
  const outside = tmpDir("cdev-outside-");
  if (!trySymlink(outside, path.join(p, "docs"), "junction")) return t.skip("cannot create symlinks on this system");
  const before = snapshot(p);
  const out = snapshot(outside);
  return run(["apply", "--project", p, "--profile", "core"]).then((r) => {
    assert.equal(r.code, 3, r.err);
    assert.ok(r.err.includes("outside the project"));
    assert.deepEqual(snapshot(outside), out);
    assert.deepEqual(snapshot(p), before);
    assert.ok(!exists(p, ".cloudnaut"), "nothing else was written");
  });
});

test("a symlinked target file that escapes the project is refused", (t) => {
  const p = fixtureProject();
  const outside = tmpDir("cdev-outside-");
  const victim = path.join(outside, "ignore");
  fs.writeFileSync(victim, "secret\n");
  fs.rmSync(path.join(p, ".gitignore"));
  if (!trySymlink(victim, path.join(p, ".gitignore"), "file")) return t.skip("cannot create symlinks on this system");
  return run(["apply", "--project", p, "--profile", "core", "--with-codegraph"]).then((r) => {
    assert.equal(r.code, 3, r.err);
    assert.equal(fs.readFileSync(victim, "utf8"), "secret\n");
  });
});

test("a symlink that stays inside the project is followed and preserved", (t) => {
  const p = emptyProject();
  fs.mkdirSync(path.join(p, "shared-docs"));
  if (!trySymlink(path.join(p, "shared-docs"), path.join(p, "docs"), "junction")) return t.skip("cannot create symlinks on this system");
  return run(["apply", "--project", p, "--profile", "core"]).then((r) => {
    assert.equal(r.code, 0, r.err);
    assert.ok(fs.lstatSync(path.join(p, "docs")).isSymbolicLink(), "symlink preserved");
    assert.ok(exists(p, "shared-docs/cloudnaut/project-steering.example.md"));
  });
});

test("doctor reports a symlink escape in an owned path as broken", async (t) => {
  const p = fixtureProject();
  await run(["apply", "--project", p, "--profile", "core"]);
  const outside = tmpDir("cdev-outside-");
  fs.rmSync(path.join(p, "docs"), { recursive: true });
  if (!trySymlink(outside, path.join(p, "docs"), "junction")) return t.skip("cannot create symlinks on this system");
  const d = await run(["doctor", "--project", p, "--no-exec"]);
  assert.equal(d.code, 4);
  assert.ok(d.out.includes("ESCAPE"));
  assert.ok(read(p, ".kiro/steering/cloudnaut-core.md").length > 0);
});
