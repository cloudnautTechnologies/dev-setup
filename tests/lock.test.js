import assert from "node:assert/strict";
import test from "node:test";
import { compareSemver, incomingPath, renderLock, validateLock } from "../src/lock.js";

const H = "a".repeat(64);
const good = () => ({
  schemaVersion: 1, tool: "cloudnaut-dev-setup", version: "0.1.0", profile: "core",
  options: { withCodegraph: false, withPonytail: false, verifyCommand: null },
  items: [{ id: "file:.kiro/steering/a.md", kind: "file", target: ".kiro/steering/a.md", owner: "core", sha256: H, adopted: false }],
  unresolved: [],
});
const profiles = ["core", "aws", "connect"];

test("a good lock validates and re-serializes to identical bytes", () => {
  const l = validateLock(good(), profiles);
  const text = renderLock(l);
  assert.equal(renderLock(JSON.parse(text)), text);
  assert.ok(text.endsWith("}\n"));
});

test("validation rejects bad shapes", () => {
  const cases = [
    (l) => (l.schemaVersion = 2), (l) => (l.tool = "x"), (l) => (l.version = "one"), (l) => (l.profile = "zzz"),
    (l) => (l.options = {}), (l) => (l.items[0].target = "../x"), (l) => (l.items[0].target = "src/index.js"),
    (l) => (l.items[0].sha256 = "short"), (l) => l.items.push({ ...l.items[0] }), (l) => (l.items[0].kind = "weird"),
    (l) => l.unresolved.push({ id: "file:.kiro/steering/a.md", incoming: "x", incomingSha256: H }),
    (l) => l.unresolved.push({ id: "file:nope", incoming: ".cloudnaut/incoming/nope", incomingSha256: H }),
  ];
  for (const mutate of cases) {
    const l = good();
    mutate(l);
    assert.throws(() => validateLock(l, profiles), (e) => e.exitCode === 6, mutate.toString());
  }
});

test("incoming paths are portable", () => {
  assert.equal(incomingPath({ kind: "file", target: ".kiro/steering/a.md" }), ".cloudnaut/incoming/.kiro/steering/a.md");
  assert.equal(incomingPath({ kind: "json-entry", target: ".kiro/settings/mcp.json", pointer: "/mcpServers/aws-knowledge-mcp" }), ".cloudnaut/incoming/.kiro/settings/mcp.json.aws-knowledge-mcp.json");
  assert.equal(incomingPath({ kind: "line" }), null);
});

test("semver compare", () => {
  assert.equal(compareSemver("0.1.0", "0.2.0"), -1);
  assert.equal(compareSemver("1.0.0", "0.9.9"), 1);
  assert.equal(compareSemver("0.1.0", "0.1.0"), 0);
});
