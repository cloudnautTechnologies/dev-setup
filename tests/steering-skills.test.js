import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { REPO } from "./helpers/util.js";

const P = (...p) => path.join(REPO, "profiles", ...p);
const read = (f) => fs.readFileSync(f, "utf8").replace(/\r\n/g, "\n");

function frontMatter(text) {
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  if (!m) return { data: null, body: text };
  const data = {};
  for (const line of m[1].split("\n")) {
    const kv = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line);
    if (kv) data[kv[1]] = kv[2];
  }
  return { data, body: text.slice(m[0].length) };
}

const steering = {
  core: P("core/files/.kiro/steering/cloudnaut-core.md"),
  aws: P("aws/files/.kiro/steering/cloudnaut-aws-cdk.md"),
  connect: P("connect/files/.kiro/steering/cloudnaut-connect.md"),
};
const skills = {
  "trace-code-path": P("core/files/.kiro/skills/trace-code-path/SKILL.md"),
  "review-change": P("core/files/.kiro/skills/review-change/SKILL.md"),
  "review-aws-infra-change": P("aws/files/.kiro/skills/review-aws-infra-change/SKILL.md"),
  "connect-flow-troubleshooting": P("connect/files/.kiro/skills/connect-flow-troubleshooting/SKILL.md"),
};

test("every steering file, including the vendored one, has valid front matter", () => {
  const files = [...Object.values(steering), P("optional/ponytail/files/.kiro/steering/ponytail.md")];
  for (const f of files) {
    const { data } = frontMatter(read(f));
    assert.ok(data, f);
    assert.ok(["always", "fileMatch", "manual", "auto"].includes(data.inclusion), `${f}: inclusion ${data.inclusion}`);
    if (data.inclusion === "auto") assert.ok(data.name && data.description, `${f}: auto needs name and description`);
    if (data.inclusion === "fileMatch") assert.ok(data.fileMatchPattern, f);
  }
});

test("core steering is always-on, at most 40 lines, and covers the required guidance", () => {
  const { data, body } = frontMatter(read(steering.core));
  assert.equal(data.inclusion, "always");
  const lines = body.replace(/\n+$/, "").split("\n");
  assert.ok(lines.length <= 40, `${lines.length} lines`);
  const text = body.toLowerCase();
  for (const phrase of ["trace the existing implementation", "reuse", "preserve existing behavior", "report the exact commands", "architecture", "entry points", "verification commands", "docs/cloudnaut/project-steering.example.md", "trace-code-path", "review-change"]) {
    assert.ok(text.includes(phrase), phrase);
  }
});

test("AWS/CDK and Connect steering load only when relevant (inclusion auto)", () => {
  for (const k of ["aws", "connect"]) {
    const { data } = frontMatter(read(steering[k]));
    assert.equal(data.inclusion, "auto", k);
    assert.ok(data.name && data.description.length > 20, k);
  }
  assert.match(frontMatter(read(steering.aws)).data.description, /AWS.*CDK.*IAM/i);
  assert.match(frontMatter(read(steering.connect)).data.description, /Amazon Connect.*contact flow/i);
});

test("the project steering example is not under .kiro/steering and avoids reserved names", () => {
  const f = P("core/files/docs/cloudnaut/project-steering.example.md");
  assert.ok(fs.existsSync(f));
  const text = read(f);
  for (const h of ["Architecture", "Entry points", "Verification commands", "Conventions"]) assert.ok(text.includes(`## ${h}`), h);
  for (const reserved of ["product.md", "tech.md", "structure.md"]) {
    assert.ok(!fs.existsSync(P("core/files/.kiro/steering", reserved)));
  }
});

test("skills: front matter, name matches folder, length, and the three headings", () => {
  for (const [name, f] of Object.entries(skills)) {
    assert.equal(path.basename(path.dirname(f)), name);
    const text = read(f);
    const { data } = frontMatter(text);
    assert.equal(data.name, name);
    assert.match(data.name, /^[a-z0-9]+(-[a-z0-9]+)*$/);
    assert.ok(data.name.length <= 64);
    assert.ok(data.description.length >= 1 && data.description.length <= 1024, name);
    assert.ok(data.description.toLowerCase().includes("use"), `${name}: description says when to use it`);
    assert.ok(text.split("\n").length < 500);
    for (const h of ["Evidence to inspect", "Verify", "Report"]) assert.ok(new RegExp(`^## ${h}$`, "m").test(text), `${name}: ${h}`);
  }
});

test("skills are independent, do not depend on Ponytail, and promise no extra slash commands", () => {
  const names = Object.keys(skills);
  for (const [name, f] of Object.entries(skills)) {
    const text = read(f);
    for (const other of names.filter((n) => n !== name)) assert.ok(!text.includes(other), `${name} references ${other}`);
    assert.ok(!/\.kiro\/steering|docs\/cloudnaut|\.cloudnaut/.test(text), `${name} needs a path outside its folder`);
    assert.ok(!/ponytail/i.test(text), `${name} mentions Ponytail`);
    assert.ok(!/\s\/[a-z][a-z-]+\b/.test(text.replace(/`[^`]*`/g, "").replace(/\w+\/\w+/g, "")), `${name} promises a slash command`);
  }
});

test("review-change centers on reuse and unnecessary abstractions", () => {
  const t = read(skills["review-change"]).toLowerCase();
  for (const phrase of ["reuse", "abstraction", "behavior", "checks"]) assert.ok(t.includes(phrase), phrase);
});

test("skill content: AWS infra review works without credentials; Connect covers the whole path", () => {
  const aws = read(skills["review-aws-infra-change"]).toLowerCase();
  for (const w of ["replacement", "iam", "encryption", "logging", "cost", "rollback", "does not need aws access"]) assert.ok(aws.includes(w), w);
  const cx = read(skills["connect-flow-troubleshooting"]).toLowerCase();
  for (const w of ["entry point", "routing", "queue", "lambda", "lex", "fallback", "disconnect", "never ask for real customer data"]) assert.ok(cx.includes(w), w);
});

function sentences(text) {
  return text
    .replace(/^---[\s\S]*?---\n/, "")
    .replace(/`/g, "")
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.replace(/^[-*\d.\s#]+/, "").trim().toLowerCase().replace(/\s+/g, " "))
    .filter((s) => s.split(" ").length >= 12);
}

test("no sentence of 12 or more words appears in both a steering file and a skill", () => {
  const fromSteering = new Set(Object.values(steering).flatMap((f) => sentences(read(f))));
  for (const [name, f] of Object.entries(skills)) {
    for (const s of sentences(read(f))) assert.ok(!fromSteering.has(s), `${name} repeats: ${s}`);
  }
});

test("the duplication check itself detects a repeated sentence", () => {
  const a = sentences("Run the project's own checks and report the exact commands and their results every time.");
  const b = sentences("- Run the project's own checks and report the exact commands and their results every time.");
  assert.deepEqual(a, b);
  assert.equal(a.length, 1);
});
