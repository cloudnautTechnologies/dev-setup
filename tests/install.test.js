import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { loadRelease } from "../src/manifest.js";
import { isAllowedTarget } from "../src/paths.js";
import { emptyProject, exists, fixtureProject, read, run, runJson, snapshot } from "./helpers/util.js";

const apply = (project, profile, extra = []) => run(["apply", "--project", project, "--profile", profile, ...extra]);
const lockOf = (project) => JSON.parse(read(project, ".cloudnaut/dev-setup.lock.json"));
const CORE = [".kiro/steering/cloudnaut-core.md", ".kiro/skills/trace-code-path/SKILL.md", ".kiro/skills/review-change/SKILL.md", "docs/cloudnaut/project-steering.example.md"];
const AWS = [".kiro/steering/cloudnaut-aws-cdk.md", ".kiro/skills/review-aws-infra-change/SKILL.md"];
const CONNECT = [".kiro/steering/cloudnaut-connect.md", ".kiro/skills/connect-flow-troubleshooting/SKILL.md"];

test("initial install of core on the fixture adds only core files and leaves shared config untouched", async () => {
  const p = fixtureProject();
  const before = snapshot(p);
  const r = await apply(p, "core");
  assert.equal(r.code, 0, r.err);
  const after = snapshot(p);
  for (const f of CORE) assert.ok(after.has(f), f);
  for (const f of [...AWS, ...CONNECT]) assert.ok(!after.has(f), f);
  for (const keep of [".kiro/settings/mcp.json", ".vscode/extensions.json", ".gitignore", ".kiro/steering/project.md", "package.json"]) {
    assert.equal(after.get(keep), before.get(keep), `${keep} unchanged`);
  }
  assert.ok(!exists(p, ".kiro/hooks"), "no hook by default");
  assert.ok(!exists(p, ".cloudnaut/run-verify.cjs"));
});

test("aws includes core and adds the MCP entry and extension without disturbing existing config", async () => {
  const p = fixtureProject();
  const beforeMcp = read(p, ".kiro/settings/mcp.json");
  const beforeExt = read(p, ".vscode/extensions.json");
  const r = await apply(p, "aws");
  assert.equal(r.code, 0, r.err);
  for (const f of [...CORE, ...AWS]) assert.ok(exists(p, f), f);
  assert.ok(!exists(p, CONNECT[0]));
  const mcp = JSON.parse(read(p, ".kiro/settings/mcp.json"));
  assert.deepEqual(Object.keys(mcp.mcpServers), ["internal-docs", "local-tool", "aws-knowledge-mcp"]);
  assert.deepEqual(mcp.mcpServers["aws-knowledge-mcp"], { url: "https://knowledge-mcp.global.api.aws" });
  assert.ok(!("autoApprove" in mcp.mcpServers["aws-knowledge-mcp"]));
  assert.deepEqual(mcp.unrelatedSetting, { keep: [1, 2, 3] });
  const mcpText = read(p, ".kiro/settings/mcp.json");
  assert.ok(mcpText.includes('"args": ["--stdio", "--quiet"],'.replace(",", "")) || mcpText.includes('["--stdio", "--quiet"]'), "compact args array kept");
  assert.ok(mcpText.startsWith(beforeMcp.slice(0, beforeMcp.indexOf('    }\n  },') + 5)), "bytes before the edit are unchanged");
  const ext = read(p, ".vscode/extensions.json");
  assert.ok(ext.startsWith("// Recommended extensions for orders-service (fictional fixture)\n"));
  assert.ok(ext.includes('"example.formatter", // keep: team formatter\n    "amazonwebservices.aws-toolkit-vscode",\n  ],'));
  assert.ok(ext.includes('"unwantedRecommendations"'));
  assert.equal(ext.replace('    "amazonwebservices.aws-toolkit-vscode",\n', ""), beforeExt);
});

test("connect includes core and aws", async () => {
  const p = fixtureProject();
  const r = await apply(p, "connect");
  assert.equal(r.code, 0, r.err);
  for (const f of [...CORE, ...AWS, ...CONNECT]) assert.ok(exists(p, f), f);
  const lock = lockOf(p);
  assert.equal(lock.profile, "connect");
  assert.deepEqual(lock.options, { verifyCommand: null, withCodegraph: false, withPonytail: false });
});

test("optional features are absent by default for every profile and present when requested", async () => {
  for (const profile of ["core", "aws", "connect"]) {
    const p = fixtureProject();
    await apply(p, profile);
    const files = [...snapshot(p).keys()];
    assert.ok(!files.some((f) => f.includes("ponytail") || f.includes("run-verify") || f.startsWith(".kiro/hooks")), profile);
    assert.ok(!read(p, ".kiro/settings/mcp.json").includes("codegraph"), profile);
    assert.equal(read(p, ".gitignore"), "node_modules/\ndist/\n.env\n");
  }
  const p = fixtureProject();
  const r = await apply(p, "connect", ["--with-codegraph", "--with-ponytail", "--verify-command", "npm test"]);
  assert.equal(r.code, 0, r.err);
  const mcp = JSON.parse(read(p, ".kiro/settings/mcp.json")).mcpServers;
  assert.deepEqual(mcp.codegraph.args, ["serve", "--mcp", "--no-telemetry"]);
  assert.deepEqual(mcp.codegraph.env, { CODEGRAPH_TELEMETRY: "0", DO_NOT_TRACK: "1", CODEGRAPH_NO_UPDATE_CHECK: "1" });
  assert.ok(!("autoApprove" in mcp.codegraph));
  assert.equal(read(p, ".gitignore"), "node_modules/\ndist/\n.env\n.codegraph/\n");
  for (const f of [".kiro/steering/ponytail.md", ".cloudnaut/third-party/ponytail/LICENSE", ".cloudnaut/third-party/ponytail/SOURCE.md", ".kiro/hooks/cloudnaut-verify-after-task.json", ".cloudnaut/run-verify.cjs", ".cloudnaut/verify-command.json"]) {
    assert.ok(exists(p, f), f);
  }
  assert.ok(r.out.includes("CODEGRAPH_INSTALL_FIRST"));
});

test("ponytail option installs byte-identical upstream files", async () => {
  const p = emptyProject();
  await apply(p, "core", ["--with-ponytail"]);
  const m = JSON.parse(fs.readFileSync(path.join(process.cwd(), "profiles/optional/ponytail/feature.json"), "utf8")).pin;
  const sha = (f) => snapshot(p).get(f);
  assert.equal(sha(".kiro/steering/ponytail.md"), m.steeringSha256);
  assert.equal(sha(".cloudnaut/third-party/ponytail/LICENSE"), m.licenseSha256);
});

test("lock records version, profile, owned files, entries, and normalized hashes", async () => {
  const p = fixtureProject();
  await apply(p, "aws");
  const lock = lockOf(p);
  assert.equal(lock.version, "0.1.0");
  assert.equal(lock.schemaVersion, 1);
  const ids = lock.items.map((i) => i.id);
  assert.ok(ids.includes("file:.kiro/steering/cloudnaut-core.md"));
  assert.ok(ids.includes("json:.kiro/settings/mcp.json#/mcpServers/aws-knowledge-mcp"));
  assert.ok(ids.includes("jsonc:.vscode/extensions.json#/recommendations/amazonwebservices.aws-toolkit-vscode"));
  assert.ok(!JSON.stringify(lock).includes(p), "no absolute paths in the lock");
  assert.ok(!/\d{4}-\d{2}-\d{2}T/.test(JSON.stringify(lock)), "no timestamps in the lock");
  assert.deepEqual(ids, [...ids].sort());
});

test("a CRLF copy of an unchanged file is not reported as a local edit", async () => {
  const p = fixtureProject();
  await apply(p, "core");
  const f = path.join(p, ".kiro/steering/cloudnaut-core.md");
  fs.writeFileSync(f, fs.readFileSync(f, "utf8").replace(/\n/g, "\r\n"));
  const r = await runJson(["preview", "--project", p]);
  assert.equal(r.json.plan.summary.keepLocal, 0);
  assert.equal(r.json.plan.summary.unchanged, r.json.plan.actions.length);
});

test("an existing identical file is adopted, not a collision", async () => {
  const p = fixtureProject();
  fs.mkdirSync(path.join(p, ".kiro/steering"), { recursive: true });
  fs.copyFileSync(path.join(process.cwd(), "profiles/core/files/.kiro/steering/cloudnaut-core.md"), path.join(p, ".kiro/steering/cloudnaut-core.md"));
  const r = await runJson(["apply", "--project", p, "--profile", "core"]);
  assert.equal(r.code, 0, r.err);
  assert.equal(r.json.plan.summary.adopt, 1);
  assert.equal(lockOf(p).items.find((i) => i.target === ".kiro/steering/cloudnaut-core.md").adopted, true);
});

test("a pre-existing recommendation is recorded as not owned", async () => {
  const p = fixtureProject();
  fs.writeFileSync(path.join(p, ".vscode/extensions.json"), '{ "recommendations": ["AmazonWebServices.aws-toolkit-vscode"] }\n');
  const before = read(p, ".vscode/extensions.json");
  const r = await apply(p, "aws");
  assert.equal(r.code, 0, r.err);
  assert.equal(read(p, ".vscode/extensions.json"), before);
  const item = lockOf(p).items.find((i) => i.kind === "jsonc-item");
  assert.equal(item.preexisting, true);
});

test("an empty project gets mcp.json and extensions.json created; .gitignore only with CodeGraph", async () => {
  const p = emptyProject();
  await apply(p, "aws");
  assert.ok(exists(p, ".kiro/settings/mcp.json") && exists(p, ".vscode/extensions.json"));
  assert.ok(!exists(p, ".gitignore"));
  const p2 = emptyProject();
  await apply(p2, "core", ["--with-codegraph"]);
  assert.equal(read(p2, ".gitignore"), ".codegraph/\n");
});

test("the largest possible plan stays below 25 targets and every target is allowlisted", async () => {
  const p = fixtureProject();
  const r = await runJson(["apply", "--project", p, "--profile", "connect", "--with-codegraph", "--with-ponytail", "--verify-command", "npm test"]);
  assert.equal(r.code, 0, r.err);
  const m = loadRelease().manifest;
  const fromManifest = new Set([".kiro/settings/mcp.json", ".vscode/extensions.json", ".gitignore", ".cloudnaut/dev-setup.lock.json", m.features.verifyHook.commandFile.target]);
  for (const prof of ["core", "aws", "connect"]) m.profiles[prof].files.forEach((f) => fromManifest.add(f.target));
  m.features.ponytail.files.forEach((f) => fromManifest.add(f.target));
  m.features.verifyHook.files.forEach((f) => fromManifest.add(f.target));
  assert.ok(fromManifest.size < 25, `${fromManifest.size} targets`);
  assert.ok(r.json.plan.writes.length < 25);
  for (const w of r.json.plan.writes) assert.ok(isAllowedTarget(w.path), w.path);
});

test("sticky options: omitted flags reuse the lock, and the profile may be omitted", async () => {
  const p = fixtureProject();
  await apply(p, "aws", ["--with-codegraph", "--verify-command", "npm test"]);
  const r = await runJson(["preview", "--project", p]);
  assert.equal(r.code, 0, r.err);
  assert.equal(r.json.plan.profile, "aws");
  assert.deepEqual(r.json.plan.options, { withCodegraph: true, withPonytail: false, verifyCommand: "npm test" });
  assert.equal(r.json.plan.summary.writes, 0);
});

test("profile widening is allowed", async () => {
  const p = fixtureProject();
  await apply(p, "core");
  const r = await apply(p, "connect");
  assert.equal(r.code, 0, r.err);
  assert.ok(exists(p, CONNECT[0]));
});
