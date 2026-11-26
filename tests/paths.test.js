import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { isAllowedTarget, isInside, isSafeRelative, resolveProject, resolveWriteTarget } from "../src/paths.js";
import { HOME, tmpDir } from "./helpers/util.js";

test("isInside works for POSIX and Windows paths", () => {
  assert.ok(isInside("/p/app", "/p/app/a/b", "linux"));
  assert.ok(isInside("/p/app", "/p/app", "linux"));
  assert.ok(!isInside("/p/app", "/p/app-other/x", "linux"));
  assert.ok(!isInside("/p/app", "/p/x", "linux"));
  assert.ok(isInside("C:\\work\\app", "C:\\work\\app\\.kiro\\x", "win32"));
  assert.ok(isInside("C:\\Work\\App", "c:\\work\\app\\x", "win32"), "case-insensitive on win32");
  assert.ok(!isInside("C:\\work\\app", "D:\\work\\app\\x", "win32"), "different drive");
  assert.ok(!isInside("C:\\work\\app", "C:\\work\\app2", "win32"));
  assert.ok(!isInside("/p/App", "/p/app/x", "linux"), "case-sensitive on linux");
});

test("safe relative paths and allowlist", () => {
  for (const bad of ["../x", "/abs", "C:/x", "a\\b", "a//b", "", "a/../b", "a\0b"]) assert.ok(!isSafeRelative(bad), bad);
  assert.ok(isSafeRelative(".kiro/steering/x.md"));
  assert.ok(isAllowedTarget(".kiro/steering/x.md"));
  assert.ok(isAllowedTarget(".gitignore"));
  assert.ok(!isAllowedTarget("src/index.js"));
  assert.ok(!isAllowedTarget(".kiro/steering/"));
  assert.ok(!isAllowedTarget(".kiro/settings/other.json"));
});

test("project must exist and must not be home or inside ~/.kiro", () => {
  assert.throws(() => resolveProject(path.join(HOME, "nope")), /does not exist/);
  assert.throws(() => resolveProject(HOME), (e) => e.exitCode === 3);
  fs.mkdirSync(path.join(HOME, ".kiro", "sub"), { recursive: true });
  assert.throws(() => resolveProject(path.join(HOME, ".kiro", "sub")), (e) => e.exitCode === 3);
  const ok = tmpDir();
  assert.equal(resolveProject(ok), ok);
});

test("resolveWriteTarget returns planned real path for new files", () => {
  const p = tmpDir();
  const r = resolveWriteTarget(p, ".kiro/steering/a.md");
  assert.equal(r.realPath, path.join(p, ".kiro", "steering", "a.md"));
  assert.equal(r.exists, false);
});
