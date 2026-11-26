import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { ALLOWED_HOSTS, checkHook, runContentCheck, scanText, scanTokens, urlHosts } from "../scripts/check-content.js";
import { sha256Text } from "../src/hash.js";
import { REPO, copyDir, tmpDir } from "./helpers/util.js";

const j = (...p) => p.join("");

test("the repository passes the content lint", () => {
  assert.deepEqual(runContentCheck(REPO), []);
});

test("lint negative cases (strings are assembled so this file stays clean)", () => {
  const codes = (s) => scanText("x.md", s).map((f) => f.code);
  assert.deepEqual(codes(`account ${j("1234", "5678", "9013")}`), ["ACCOUNT_ID"]);
  assert.deepEqual(codes("account 123456789012 and 000000000000"), []);
  assert.deepEqual(codes(j("AK", "IA", "ABCDEFGHIJKLMNOP")), ["ACCESS_KEY"]);
  assert.deepEqual(codes(j("AS", "IA", "ABCDEFGHIJKLMNOP")), ["ACCESS_KEY"]);
  assert.deepEqual(codes(j("-----BEGIN RSA ", "PRIVATE KEY-----")), ["PEM"]);
  assert.deepEqual(codes(j("someone", "@", "corp.test")), ["EMAIL"]);
  assert.deepEqual(codes(j("someone", "@", "example.com")), []);
  assert.deepEqual(codes(`arn:aws:iam::${j("9999", "9999", "9999")}:role/x`).sort(), ["ACCOUNT_ID", "ARN_ACCOUNT"]);
  assert.deepEqual(codes("arn:aws:iam::123456789012:role/x"), []);
  assert.deepEqual(codes(`see ${j("https:", "//intranet.corp.test/wiki")}`), ["URL_HOST"]);
  assert.deepEqual(codes("see https://docs.internal.example.com/x https://kiro.dev/docs"), []);
  assert.deepEqual(codes("npm install -g @colbymchenry/codegraph@1.6.4"), [], "package names are not e-mail addresses");
  const hex = "a".repeat(10) + "123456789012" + "b".repeat(10);
  assert.deepEqual(codes(hex), [], "digits inside a hash are not an account id");
  const tok = (s) => scanTokens("x", s).map((f) => f.message);
  assert.equal(tok(`run ${j("np", "x")} thing`).length, 1);
  assert.equal(tok(`do ${j("cu", "rl")} it`).length, 1);
  assert.equal(tok(`go ${j("-", "y")}`).length, 1);
  assert.equal(tok(`./${j("install", ".sh")}`).length, 1);
  assert.equal(tok("a plain sentence about curly braces").length, 0);
});

test("hook rules reject other triggers, agent actions, matchers, and multiple hooks", () => {
  const ok = { version: "v1", hooks: [{ trigger: "PostTaskExec", action: { type: "command", command: "x" } }] };
  assert.equal(checkHook("h", ok).length, 0);
  for (const trigger of ["SessionStart", "UserPromptSubmit", "PostFileSave", "PostFileCreate", "PostFileDelete", "Stop", "PreToolUse", "PostToolUse", "PreTaskExec"]) {
    assert.ok(checkHook("h", { ...ok, hooks: [{ ...ok.hooks[0], trigger }] }).length, trigger);
  }
  assert.ok(checkHook("h", { ...ok, hooks: [{ ...ok.hooks[0], action: { type: "agent", prompt: "x" } }] }).length);
  assert.ok(checkHook("h", { ...ok, hooks: [{ ...ok.hooks[0], matcher: "x" }] }).length);
  assert.ok(checkHook("h", { ...ok, hooks: [ok.hooks[0], ok.hooks[0]] }).length);
});

test("every URL host cited anywhere in the repository is on the allowlist", () => {
  const hosts = new Set();
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if ([".git", "node_modules", ".agents"].includes(e.name)) continue;
      const f = path.join(d, e.name);
      if (e.isDirectory()) walk(f);
      else urlHosts(fs.readFileSync(f, "utf8")).forEach((h) => hosts.add(h));
    }
  };
  walk(REPO);
  const unlisted = [...hosts].filter((h) => !ALLOWED_HOSTS.some((a) => h === a || (a === "example.com" && h.endsWith(".example.com"))));
  assert.deepEqual(unlisted, []);
  for (const required of ["github.com", "raw.githubusercontent.com", "open-vsx.org", "docs.aws.amazon.com", "kiro.dev", "knowledge-mcp.global.api.aws", "agent-plugins.org", "www.npmjs.com", "agentskills.io", "nodejs.org"]) {
    assert.ok(ALLOWED_HOSTS.includes(required), required);
  }
});

test("vendored Ponytail files match the pinned hashes and are exempt only while they do", () => {
  const pin = JSON.parse(fs.readFileSync(path.join(REPO, "profiles/optional/ponytail/feature.json"), "utf8")).pin;
  const base = path.join(REPO, "profiles/optional/ponytail/files");
  const norm = (f) => sha256Text(fs.readFileSync(path.join(base, f), "utf8"));
  assert.equal(norm(".kiro/steering/ponytail.md"), "bbd1c60ea71dac352cc46f47476a9b8a75793af5a31f9df93c92a944dc7b0bbd");
  assert.equal(norm(".kiro/steering/ponytail.md"), pin.steeringSha256);
  assert.equal(norm(".cloudnaut/third-party/ponytail/LICENSE"), "fb1bc6909ac3ef82d5c22106e32ef682b0cff66788fa915fb9b53b15c9d2f3ab");
  assert.equal(norm(".cloudnaut/third-party/ponytail/LICENSE"), pin.licenseSha256);
  assert.ok(fs.readFileSync(path.join(base, ".cloudnaut/third-party/ponytail/LICENSE"), "utf8").startsWith("MIT License"));
  assert.equal(pin.commit, "7801d061243d7b753bad0e0b3c057cd250b11755");
  // A modified copy loses the exemption and is linted like any other file.
  const root = tmpDir("cdev-lint-");
  copyDir(path.join(REPO, "profiles"), path.join(root, "profiles"));
  const steering = path.join(root, "profiles/optional/ponytail/files/.kiro/steering/ponytail.md");
  fs.appendFileSync(steering, `\nsee ${j("np", "x")} now\n`);
  const findings = runContentCheck(root);
  assert.ok(findings.some((f) => f.code === "FORBIDDEN_TOKEN" && f.file.endsWith("ponytail.md")));
});

test("lint flags active config at the repository root", () => {
  const root = tmpDir("cdev-lint-");
  copyDir(path.join(REPO, "profiles"), path.join(root, "profiles"));
  fs.mkdirSync(path.join(root, ".kiro/steering"), { recursive: true });
  fs.mkdirSync(path.join(root, ".codegraph"));
  const codes = runContentCheck(root).map((f) => f.code);
  assert.ok(codes.includes("ACTIVE_CONFIG"));
});

test("no MCP fragment or rendered config sets autoApprove", () => {
  const walk = (d, out = []) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const f = path.join(d, e.name);
      if (e.isDirectory()) walk(f, out);
      else if (f.endsWith(".json")) out.push(f);
    }
    return out;
  };
  for (const f of [...walk(path.join(REPO, "profiles")), ...walk(path.join(REPO, "powers"))]) {
    assert.ok(!fs.readFileSync(f, "utf8").includes("autoApprove"), f);
  }
});
