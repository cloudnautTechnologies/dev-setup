import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { buildManifest, checkManifest, writeManifest } from "../scripts/generate-manifest.js";
import { buildDesired, expandProfile, loadRelease } from "../src/manifest.js";
import { REPO, copyDir, run, fixtureProject, tmpDir } from "./helpers/util.js";

function copyRepoSubset() {
  const root = tmpDir("cdev-rel-");
  copyDir(path.join(REPO, "profiles"), path.join(root, "profiles"));
  fs.copyFileSync(path.join(REPO, "package.json"), path.join(root, "package.json"));
  return root;
}

test("release-manifest.json is up to date with the packaged content", () => {
  assert.ok(checkManifest(REPO).ok, "run: node scripts/generate-manifest.js");
});

test("profile inclusion is declared in the manifest", () => {
  const m = loadRelease().manifest;
  assert.deepEqual(expandProfile(m, "core"), ["core"]);
  assert.deepEqual(expandProfile(m, "aws"), ["core", "aws"]);
  assert.deepEqual(expandProfile(m, "connect"), ["core", "aws", "connect"]);
  assert.deepEqual(m.profiles.core.includes, []);
});

test("manifest pins and entries", () => {
  const m = loadRelease().manifest;
  assert.equal(m.features.codegraph.pin.version, "1.6.4");
  assert.equal(m.features.ponytail.pin.tag, "v5.3.3");
  assert.deepEqual(m.profiles.aws.extensions, ["amazonwebservices.aws-toolkit-vscode"]);
  assert.deepEqual(m.profiles.aws.mcpEntries.map((e) => e.name), ["aws-knowledge-mcp"]);
  assert.equal(m.profiles.connect.mcpEntries.length, 0);
});

test("desired items: hook items exist only with a verify command", () => {
  const r = loadRelease();
  const targets = (o) => buildDesired(r, "connect", o).map((i) => i.target);
  assert.ok(!targets({}).some((t) => t.includes("hooks") || t.includes("run-verify")));
  assert.ok(targets({ verifyCommand: "npm test" }).includes(".kiro/hooks/cloudnaut-verify-after-task.json"));
  assert.ok(!targets({}).some((t) => t.includes("ponytail")));
});

test("the generator rejects cycles, unknown includes, duplicates, bad targets, bad names, NUL bytes, autoApprove", () => {
  const cases = {
    cycle: (root) => fs.writeFileSync(path.join(root, "profiles/core/profile.json"), '{"includes":["connect"],"mcpEntries":[],"extensions":[]}'),
    unknown: (root) => fs.writeFileSync(path.join(root, "profiles/aws/profile.json"), '{"includes":["nope"],"mcpEntries":[],"extensions":[]}'),
    duplicate: (root) => {
      fs.mkdirSync(path.join(root, "profiles/aws/files/.kiro/steering"), { recursive: true });
      fs.copyFileSync(path.join(root, "profiles/core/files/.kiro/steering/cloudnaut-core.md"), path.join(root, "profiles/aws/files/.kiro/steering/cloudnaut-core.md"));
    },
    outside: (root) => {
      fs.mkdirSync(path.join(root, "profiles/core/files/src"), { recursive: true });
      fs.writeFileSync(path.join(root, "profiles/core/files/src/x.js"), "x");
    },
    badName: (root) => fs.writeFileSync(path.join(root, "profiles/aws/profile.json"), '{"includes":["core"],"mcpEntries":[{"name":"a/b","source":"mcp/aws-knowledge-mcp.json"}],"extensions":[]}'),
    nul: (root) => fs.writeFileSync(path.join(root, "profiles/core/files/docs/cloudnaut/project-steering.example.md"), "a\0b"),
    autoApprove: (root) => fs.writeFileSync(path.join(root, "profiles/aws/mcp/aws-knowledge-mcp.json"), '{"url":"https://knowledge-mcp.global.api.aws","autoApprove":["*"]}'),
  };
  for (const [name, mutate] of Object.entries(cases)) {
    const root = copyRepoSubset();
    mutate(root);
    assert.throws(() => buildManifest(root), undefined, name);
  }
});

test("a modified packaged file fails the integrity check (exit 6) and nothing is written", async () => {
  const root = copyRepoSubset();
  writeManifest(root);
  fs.appendFileSync(path.join(root, "profiles/core/files/.kiro/steering/cloudnaut-core.md"), "\ntampered\n");
  const p = fixtureProject();
  const r = await run(["apply", "--project", p, "--profile", "core"], { release: loadRelease(root) });
  assert.equal(r.code, 6);
  assert.ok(r.err.includes("INTEGRITY") && r.err.includes("re-checkout"));
  assert.ok(!fs.existsSync(path.join(p, ".cloudnaut")));
});

test("the manifest is stable: regenerating gives identical bytes", () => {
  const a = fs.readFileSync(path.join(REPO, "release-manifest.json"), "utf8");
  assert.equal(checkManifest(REPO).want, a);
  assert.ok(!a.includes("\r"));
});
