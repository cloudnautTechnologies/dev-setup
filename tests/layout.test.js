import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { REPO } from "./helpers/util.js";

const read = (rel) => fs.readFileSync(path.join(REPO, rel), "utf8");
const pkg = JSON.parse(read("package.json"));

test("no active Kiro, editor, or CodeGraph config at the repository root", () => {
  for (const rel of [".kiro/steering", ".kiro/skills", ".kiro/hooks", ".kiro/settings", ".vscode/extensions.json", ".codegraph", ".cloudnaut"]) {
    assert.ok(!fs.existsSync(path.join(REPO, rel)), rel);
  }
  assert.deepEqual(fs.readdirSync(path.join(REPO, ".kiro")), ["specs"]);
  assert.deepEqual(fs.readdirSync(path.join(REPO, ".kiro/specs")), ["dev-setup-v0-1"]);
});

test("packaged content lives only under profiles/ and powers/", () => {
  for (const rel of ["profiles/core", "profiles/aws", "profiles/connect", "profiles/optional", "powers/cloudnaut-connect-troubleshooting"]) assert.ok(fs.existsSync(path.join(REPO, rel)), rel);
  for (const rel of ["release-manifest.json", "README.md", "CHANGELOG.md", "THIRD_PARTY_NOTICES.md", "docs/sources.md", ".gitattributes", ".gitignore"]) assert.ok(fs.existsSync(path.join(REPO, rel)), rel);
  assert.equal(read(".gitattributes").trim(), "* text=auto eol=lf");
});

test("package.json: no dependencies, no install scripts, Node 22+, version agrees everywhere", () => {
  assert.ok(!pkg.dependencies && !pkg.devDependencies && !pkg.optionalDependencies && !pkg.peerDependencies);
  for (const s of ["preinstall", "install", "postinstall", "prepare", "prepublish", "prepack"]) assert.ok(!(s in pkg.scripts), s);
  assert.equal(pkg.engines.node, ">=22");
  assert.equal(pkg.type, "module");
  assert.equal(pkg.version, JSON.parse(read("release-manifest.json")).version);
  assert.ok(fs.existsSync(path.join(REPO, pkg.bin["cloudnaut-dev-setup"])));
  for (const f of ["bin/", "src/", "profiles/", "powers/"]) assert.ok(pkg.files.includes(f), f);
  const top = /^## \[(\d+\.\d+\.\d+)\]/m.exec(read("CHANGELOG.md"));
  assert.equal(top[1], pkg.version, "top released CHANGELOG entry");
  assert.ok(/^## \[Unreleased\]/m.test(read("CHANGELOG.md")));
});

test("no POSIX-only tools are invoked by sources, scripts, tests, or npm scripts", () => {
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
  const re = /(spawn|spawnSync|exec|execSync|execFile|execFileSync)\(\s*["'`](bash|sh|sed|awk|cp|rm|cat|grep|mkdir|chmod|ln)\b/;
  for (const dir of ["src", "bin", "scripts", "tests"]) {
    for (const f of walk(path.join(REPO, dir))) {
      if (!/\.(js|cjs|mjs)$/.test(f) || f.includes("fixtures")) continue;
      assert.ok(!re.test(fs.readFileSync(f, "utf8")), f);
    }
  }
  for (const [name, cmd] of Object.entries(pkg.scripts)) assert.ok(!/\b(bash|sh|sed|awk|cp|rm)\b/.test(cmd), name);
});

test("CI runs on Windows, macOS, and Linux with pinned major action tags and current Node versions", () => {
  const y = read(".github/workflows/test.yml");
  for (const s of ["ubuntu-latest", "windows-latest", "macos-latest", "actions/checkout@v7", "actions/setup-node@v7", "contents: read", "npm test", "npm run check"]) assert.ok(y.includes(s), s);
  assert.match(y, /node:\s*\[22, 24, 26\]/);
  assert.match(y, /pull_request/);
  assert.ok(!/@main|@master/.test(y));
});

test("docs: README links every doc; required statements are present", () => {
  const readme = read("README.md");
  for (const d of ["releasing", "onboarding", "hook", "codegraph", "ponytail", "power", "extensions", "memory", "smoke-test", "maintainers", "sources"]) {
    assert.ok(fs.existsSync(path.join(REPO, "docs", `${d}.md`)), d);
    assert.ok(readme.includes(`docs/${d}.md`), `README links ${d}`);
  }
  assert.ok(/License: TBD/.test(readme));
  for (const s of ["preview", "apply", "doctor", "Exit codes"]) assert.ok(readme.includes(s), s);
  const rel = read("docs/releasing.md");
  for (const s of ["git fetch --tags", "git checkout v0.1.0", "git switch -c", "git revert", "no automatic update", "fleet management"]) assert.ok(rel.toLowerCase().includes(s.toLowerCase()), s);
});

test("docs/codegraph.md pins the version and says not to use the unpinned installer", () => {
  const t = read("docs/codegraph.md");
  assert.ok(t.includes("do not use npx"));
  for (const s of ["npm install -g @colbymchenry/codegraph@1.6.4", "codegraph init", "codegraph status", ".codegraph/", "--no-telemetry", "CODEGRAPH_NO_UPDATE_CHECK", "461a5d87a873a4932997cd9a49042ab30e45a675", "not been code-reviewed"]) assert.ok(t.includes(s), s);
});

test("docs/smoke-test.md labels every check and states nothing was verified in a live IDE", () => {
  const t = read("docs/smoke-test.md");
  for (const area of ["Steering discovery", "Skill loading", "AWS Knowledge MCP", "Hook", "CodeGraph", "Power import"]) assert.ok(t.includes(`## ${area}`), area);
  const rows = t.split("\n").filter((l) => l.startsWith("| ") && !l.startsWith("| Check") && !l.startsWith("| ---"));
  assert.ok(rows.length >= 12);
  for (const row of rows) assert.ok(/RAN LOCALLY|NEEDS LIVE IDE/.test(row), row);
  for (const row of rows.filter((r) => r.includes("NEEDS LIVE IDE") && !r.includes("RAN LOCALLY"))) assert.ok(row.includes("not verified"), row);
  assert.ok(t.includes("stdout-only"));
  assert.ok(t.includes("codegraph.cmd"));
});

test("docs/hook.md shows POSIX, PowerShell, and cmd.exe invocations and the secrets warning", () => {
  const t = read("docs/hook.md");
  for (const s of ["POSIX", "PowerShell", "cmd.exe", "--verify-command", "PostTaskExec", "stderr", "Secrets warning", "committed to Git"]) assert.ok(t.includes(s), s);
});

test("docs/memory.md, extensions.md, power.md, and ponytail.md cover the required points", () => {
  const m = read("docs/memory.md");
  for (const s of ["Memories view", "Don't use", "user setting", "ADR", "steering", "Worked example"]) assert.ok(m.includes(s), s);
  const e = read("docs/extensions.md");
  for (const s of ["amazonwebservices.aws-toolkit-vscode", "Open VSX", "aws sts get-caller-identity --profile <your-profile>", "not verified"]) assert.ok(e.includes(s), s);
  const p = read("docs/power.md");
  for (const s of ["Import power from a folder", "Activation check", "no `mcp.json`"]) assert.ok(p.includes(s), s);
  const t = read("docs/ponytail.md");
  for (const s of ["instruction-only", "no slash commands", "7801d061243d7b753bad0e0b3c057cd250b11755"]) assert.ok(t.toLowerCase().includes(s.toLowerCase()), s);
});
