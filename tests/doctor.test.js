import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fakeCodegraph } from "./helpers/fake-codegraph.js";
import { exists, fixtureProject, read, run, runJson, snapshot, write } from "./helpers/util.js";

const apply = (p, ...extra) => run(["apply", "--project", p, "--profile", "connect", ...extra]);
const find = (json, code) => json.findings.filter((f) => f.code === code);

test("a healthy install has no broken findings and exits 0", async () => {
  const p = fixtureProject();
  await apply(p);
  const d = await runJson(["doctor", "--project", p, "--no-exec"]);
  assert.equal(d.code, 0);
  assert.equal(d.json.summary.broken, 0);
  assert.ok(d.json.summary.ok > 5);
});

test("no lock is broken config; doctor never writes", async () => {
  const p = fixtureProject();
  const before = snapshot(p);
  const d = await runJson(["doctor", "--project", p, "--no-exec"]);
  assert.equal(d.code, 4);
  assert.equal(find(d.json, "NO_LOCK").length, 1);
  assert.deepEqual(snapshot(p), before);
});

test("broken config: missing owned file, invalid JSON, missing entry, blanket autoApprove", async () => {
  const p = fixtureProject();
  await apply(p);
  fs.rmSync(path.join(p, ".kiro/skills/review-change/SKILL.md"));
  let d = await runJson(["doctor", "--project", p, "--no-exec"]);
  assert.equal(d.code, 4);
  assert.equal(find(d.json, "MISSING")[0].target, ".kiro/skills/review-change/SKILL.md");

  const q = fixtureProject();
  await apply(q);
  const mcp = JSON.parse(read(q, ".kiro/settings/mcp.json"));
  mcp.mcpServers["aws-knowledge-mcp"].autoApprove = "*";
  write(q, ".kiro/settings/mcp.json", JSON.stringify(mcp));
  d = await runJson(["doctor", "--project", q, "--no-exec"]);
  assert.equal(find(d.json, "BLANKET_AUTOAPPROVE").length, 1);

  write(q, ".kiro/settings/mcp.json", "{ not json");
  d = await runJson(["doctor", "--project", q, "--no-exec"]);
  assert.equal(find(d.json, "UNPARSEABLE").length, 1);

  write(q, ".kiro/settings/mcp.json", '{"mcpServers": {}}');
  d = await runJson(["doctor", "--project", q, "--no-exec"]);
  assert.equal(find(d.json, "ENTRY_MISSING").length, 1);

  write(q, ".vscode/extensions.json", '{"recommendations": []}');
  d = await runJson(["doctor", "--project", q, "--no-exec"]);
  assert.equal(find(d.json, "EXTENSION_MISSING").length, 1);
});

test("local edits are INFO, not broken", async () => {
  const p = fixtureProject();
  await apply(p);
  write(p, ".kiro/steering/cloudnaut-core.md", `${read(p, ".kiro/steering/cloudnaut-core.md")}\n- mine\n`);
  const d = await runJson(["doctor", "--project", p, "--no-exec"]);
  assert.equal(d.code, 0);
  assert.equal(find(d.json, "LOCALLY_MODIFIED").length, 1);
  assert.equal(find(d.json, "LOCALLY_MODIFIED")[0].category, "INFO");
});

test("hook checks: valid hook is OK; edited trigger, matcher, command, or missing runner are broken", async () => {
  const p = fixtureProject();
  await apply(p, "--verify-command", "npm test");
  const hookPath = ".kiro/hooks/cloudnaut-verify-after-task.json";
  assert.equal((await runJson(["doctor", "--project", p, "--no-exec"])).code, 0);
  const good = read(p, hookPath);
  for (const mutate of [(h) => (h.hooks[0].trigger = "PostFileSave"), (h) => (h.hooks[0].matcher = "x"), (h) => (h.hooks[0].action.command = "npm test"), (h) => h.hooks.push({})]) {
    const h = JSON.parse(good);
    mutate(h);
    write(p, hookPath, JSON.stringify(h));
    const d = await runJson(["doctor", "--project", p, "--no-exec"]);
    assert.equal(d.code, 4);
    assert.equal(find(d.json, "HOOK_INVALID").length, 1);
  }
  write(p, hookPath, good);
  fs.rmSync(path.join(p, ".cloudnaut/run-verify.cjs"));
  assert.equal((await runJson(["doctor", "--project", p, "--no-exec"])).code, 4);
});

test("missing optional prerequisites are reported separately and never fail doctor", async () => {
  const p = fixtureProject();
  await apply(p, "--with-codegraph");
  const d = await runJson(["doctor", "--project", p, "--no-exec"], { env: { PATH: "" } });
  assert.equal(d.code, 0);
  assert.equal(d.json.summary.broken, 0);
  const optional = d.json.findings.filter((f) => f.category === "OPTIONAL_MISSING").map((f) => f.code);
  for (const c of ["GIT_MISSING", "AWS_CLI_MISSING", "NPM_MISSING", "CODEGRAPH_MISSING", "CODEGRAPH_NOT_INITIALIZED"]) assert.ok(optional.includes(c), c);
  const text = await run(["doctor", "--project", p, "--no-exec"], { env: { PATH: "" } });
  assert.ok(text.out.indexOf("OPTIONAL PREREQUISITES MISSING") > -1 && !text.out.includes("BROKEN CONFIG"));
});

test("codegraph version probe: match, mismatch, unparseable, and --no-exec starts nothing", async () => {
  const p = fixtureProject();
  await apply(p, "--with-codegraph");
  fs.mkdirSync(path.join(p, ".codegraph"));
  const run1 = async (out, extra = []) => {
    const fake = fakeCodegraph(out);
    const sep = process.platform === "win32" ? ";" : ":";
    const env = { PATH: `${fake.dir}${sep}${path.dirname(process.execPath)}` };
    const d = await runJson(["doctor", "--project", p, ...extra], { env });
    return { d, fake };
  };
  let r = await run1("codegraph 1.6.4\n");
  assert.equal(r.d.code, 0);
  assert.equal(find(r.d.json, "CODEGRAPH")[0].category, "OK");
  assert.ok(fs.readFileSync(r.fake.log, "utf8").startsWith("version|01"), "fixed argv and telemetry env");
  assert.equal(fs.readFileSync(r.fake.log, "utf8").trim().split("\n").length, 1, "exactly one probe");

  r = await run1("1.5.0\n");
  assert.equal(find(r.d.json, "CODEGRAPH_VERSION_MISMATCH")[0].category, "OPTIONAL_MISSING");
  assert.equal(r.d.code, 0);

  r = await run1("hello\n");
  assert.equal(find(r.d.json, "CODEGRAPH_VERSION_UNKNOWN")[0].category, "OPTIONAL_MISSING");
  assert.equal(r.d.code, 0);

  r = await run1("1.6.4\n", ["--no-exec"]);
  assert.equal(find(r.d.json, "CODEGRAPH_VERSION_SKIPPED").length, 1);
  assert.ok(!exists(r.fake.dir, "calls.log"), "--no-exec started nothing");
});

test("doctor without CodeGraph in the lock never checks it", async () => {
  const p = fixtureProject();
  await apply(p);
  const d = await runJson(["doctor", "--project", p, "--no-exec"], { env: { PATH: "" } });
  assert.ok(!d.json.findings.some((f) => f.code.startsWith("CODEGRAPH")));
});

test("a newer release than the lock is INFO; a lock newer than the tool is broken", async () => {
  const p = fixtureProject();
  await apply(p);
  const f = path.join(p, ".cloudnaut/dev-setup.lock.json");
  const lock = JSON.parse(fs.readFileSync(f, "utf8"));
  fs.writeFileSync(f, JSON.stringify({ ...lock, version: "9.0.0" }));
  const d = await runJson(["doctor", "--project", p, "--no-exec"]);
  assert.equal(d.code, 4);
  assert.equal(find(d.json, "LOCK_NEWER").length, 1);
});
