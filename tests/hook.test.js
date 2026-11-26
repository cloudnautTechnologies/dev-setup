import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { renderVerifyCommand, validateHookFile, validateVerifyCommand, verifyWarnings } from "../src/hook.js";
import { findOnPath } from "../src/pathscan.js";
import { emptyProject, exists, fixtureProject, read, run, snapshot } from "./helpers/util.js";

const HOOK = ".kiro/hooks/cloudnaut-verify-after-task.json";
const RUNNER = ".cloudnaut/run-verify.cjs";
const FIXED = "node .cloudnaut/run-verify.cjs";

async function install(command, project = emptyProject()) {
  const r = await run(["apply", "--project", project, "--profile", "core", "--verify-command", command]);
  assert.equal(r.code, 0, r.err);
  return project;
}
const runner = (project, env = {}, cwd = os.tmpdir()) =>
  spawnSync(process.execPath, [path.join(project, RUNNER)], { cwd, encoding: "utf8", env: { ...process.env, ...env } });
const node = (code) => `"${process.execPath}" -e "${code}"`;

test("the hook is static: v1, one PostTaskExec command hook, fixed command, no matcher", async () => {
  const p = await install("npm test");
  const h = JSON.parse(read(p, HOOK));
  assert.equal(h.version, "v1");
  assert.equal(h.hooks.length, 1);
  assert.deepEqual(Object.keys(h.hooks[0]).sort(), ["action", "description", "enabled", "name", "timeout", "trigger"]);
  assert.equal(h.hooks[0].trigger, "PostTaskExec");
  assert.deepEqual(h.hooks[0].action, { type: "command", command: FIXED });
  assert.equal(h.hooks[0].timeout, 600);
  assert.equal(h.hooks[0].enabled, true);
  assert.equal(validateHookFile(read(p, HOOK)), null);
});

test("no hook, runner, or command file without --verify-command, for any profile", async () => {
  for (const profile of ["core", "aws", "connect"]) {
    const p = fixtureProject();
    await run(["apply", "--project", p, "--profile", profile, "--with-codegraph", "--with-ponytail"]);
    assert.ok(!exists(p, ".kiro/hooks") && !exists(p, RUNNER) && !exists(p, ".cloudnaut/verify-command.json"), profile);
  }
});

test("tricky commands survive JSON encoding and never reach the hook file", async () => {
  const tricky = [
    'echo "double" && echo \'single\'',
    "C:\\tools\\run.cmd --flag \"a b\"",
    "echo %PATH% $HOME ${X} `date` $(id)",
    "make verify   # ünï©ødé ✓",
    "a\\\"b\\\\c",
  ];
  for (const cmd of tricky) {
    const p = await install(cmd);
    assert.equal(JSON.parse(read(p, ".cloudnaut/verify-command.json")).command, cmd);
    assert.equal(JSON.parse(read(p, ".cloudnaut/dev-setup.lock.json")).options.verifyCommand, cmd);
    assert.equal(JSON.parse(read(p, HOOK)).hooks[0].action.command, FIXED);
    assert.ok(!read(p, HOOK).includes(cmd), "the user's command is not in the hook file");
  }
  assert.equal(JSON.parse(renderVerifyCommand("a")).command, "a");
});

test("verify command validation: trimmed, 1 to 1000 characters, single line", () => {
  assert.equal(validateVerifyCommand("  npm test  "), "npm test");
  for (const bad of ["", "   ", "a\nb", "a\rb", "a\0b", "x".repeat(1001)]) assert.throws(() => validateVerifyCommand(bad), (e) => e.exitCode === 1);
  assert.equal(validateVerifyCommand("x".repeat(1000)).length, 1000);
});

test("warnings: secrets and shell syntax", () => {
  assert.equal(verifyWarnings("npm test").length, 0);
  assert.equal(verifyWarnings("API_KEY=abc npm test")[0].code, "VERIFY_COMMAND_SECRET");
  assert.ok(verifyWarnings("TOKEN = x run").some((w) => w.code === "VERIFY_COMMAND_SECRET"));
  assert.ok(verifyWarnings("npm test | tee out").some((w) => w.code === "VERIFY_COMMAND_SHELL"));
  assert.ok(verifyWarnings(["AK", "IA", "ABCDEFGHIJKLMNOP"].join("")).some((w) => w.code === "VERIFY_COMMAND_SECRET"));
});

test("invalid commands exit 1 and write nothing", async () => {
  const p = fixtureProject();
  const before = snapshot(p);
  for (const cmd of ["", "a\nb"]) assert.equal((await run(["apply", "--project", p, "--profile", "core", "--verify-command", cmd])).code, 1);
  assert.deepEqual(snapshot(p), before);
});

test("runner: success is silent", async () => {
  const p = await install(node("process.exit(0)"));
  const r = runner(p);
  assert.equal(r.status, 0);
  assert.equal(r.stderr, "");
  assert.equal(r.stdout, "");
});

test("runner: a stdout-only failure is forwarded to stderr with a final failure line and non-zero exit", async () => {
  const p = await install(node("console.log('FAIL: 3 tests failed'); process.exit(3)"));
  const r = runner(p);
  assert.notEqual(r.status, 0);
  assert.ok(r.stderr.includes("FAIL: 3 tests failed"));
  assert.match(r.stderr.trim().split("\n").pop(), /^verify command failed \(exit 3\): /);
});

test("runner: stderr and stdout are both forwarded, stdout first", async () => {
  const p = await install(node("console.log('OUT'); console.error('ERR'); process.exit(1)"));
  const r = runner(p);
  assert.ok(r.stderr.indexOf("OUT") < r.stderr.indexOf("ERR"));
});

test("runner: cwd is the project root even when started elsewhere", async () => {
  const p = await install(node("require('fs').writeFileSync('cwd.txt', process.cwd()); process.exit(1)"));
  runner(p, {}, os.homedir());
  assert.equal(fs.realpathSync(read(p, "cwd.txt")), fs.realpathSync(p));
});

test("runner: output beyond 200 lines or 20 KB is cut to the tail with a truncation line", async () => {
  const p = await install(node("for(let i=1;i<=1000;i++)console.log('line '+i); process.exit(1)"));
  const r = runner(p);
  const lines = r.stderr.trim().split("\n");
  assert.ok(lines.length <= 202, `${lines.length} lines`);
  assert.match(lines[0], /^\.\.\. \d+ lines truncated$/);
  assert.ok(r.stderr.includes("line 1000"));
  assert.ok(!r.stderr.includes("line 1\n"));
  const big = await install(node("for(let i=0;i<100;i++)console.log('x'.repeat(1000)); process.exit(1)"));
  assert.ok(Buffer.byteLength(runner(big).stderr) < 21 * 1024 + 400);
});

test("runner: output above 64 MiB is reported as a failure", async () => {
  const p = await install(node("const b='x'.repeat(1048576);for(let i=0;i<70;i++)process.stdout.write(b)"));
  const r = runner(p);
  assert.notEqual(r.status, 0);
  assert.ok(r.stderr.includes("exceeded 64 MiB"));
});

test("runner: a timeout is a failure with an explanation", async () => {
  const p = await install(node("setTimeout(()=>{},20000)"));
  const r = runner(p, { CLOUDNAUT_VERIFY_TIMEOUT_MS: "400" });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /timed out|signal|ETIMEDOUT/);
});

test("runner: a command that cannot run or a missing command file fails clearly", async () => {
  const p = await install("definitely-not-a-real-command-xyz");
  const r = runner(p);
  assert.notEqual(r.status, 0);
  assert.ok(r.stderr.includes("verify command failed"));
  fs.rmSync(path.join(p, ".cloudnaut/verify-command.json"));
  const r2 = runner(p);
  assert.notEqual(r2.status, 0);
  assert.ok(r2.stderr.includes("verify-command.json"));
});

test("working example: the fixture's own 'npm test' runs through the installed hook runner", async (t) => {
  if (!findOnPath("npm")) return t.skip("npm is not on PATH");
  const p = fixtureProject();
  await install("npm test", p);
  const r = runner(p);
  assert.equal(r.status, 0, r.stderr);
  const pkg = JSON.parse(read(p, "package.json"));
  pkg.scripts.test = "node -e \"console.log('1 failing'); process.exit(1)\"";
  fs.writeFileSync(path.join(p, "package.json"), JSON.stringify(pkg));
  const bad = runner(p);
  assert.notEqual(bad.status, 0);
  assert.ok(bad.stderr.includes("1 failing"));
});

test("hook, runner, and command file are installed together and tracked in the lock", async () => {
  const p = await install("npm test");
  const ids = JSON.parse(read(p, ".cloudnaut/dev-setup.lock.json")).items.map((i) => i.target);
  for (const t of [HOOK, RUNNER, ".cloudnaut/verify-command.json"]) assert.ok(ids.includes(t), t);
});
