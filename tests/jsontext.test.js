import assert from "node:assert/strict";
import test from "node:test";
import { applyExtensionOps, readExtensions } from "../src/extensions.js";
import { appendLine, hasLine } from "../src/gitignore.js";
import { parseDoc, scan } from "../src/jsontext.js";

const ID = "x.y";
const add = (text) => applyExtensionOps(text, [ID]);

test("scanner handles comments, strings with escapes, and rejects garbage", () => {
  assert.equal(scan('{"a": "q\\"//not comment" /* c */ // d\n}').filter((t) => t.t === "lc" || t.t === "bc").length, 2);
  assert.throws(() => scan('"abc'), /unterminated/i);
  assert.throws(() => parseDoc('{"a": '), /unexpected/i);
  assert.throws(() => parseDoc("[1 2]"), /expected/);
  assert.throws(() => parseDoc("{} {}"), /trailing/);
  assert.ok(parseDoc("[1, 2,]").trailing);
});

test("non-empty array, trailing line comment on the last element", () => {
  const src = '{\n  "recommendations": [\n    "a.b", // team\n    "c.d" // last\n  ]\n}\n';
  assert.equal(add(src), '{\n  "recommendations": [\n    "a.b", // team\n    "c.d", // last\n    "x.y"\n  ]\n}\n');
});

test("block comment between last element and the closing bracket stays after the new element", () => {
  const src = '{\n  "recommendations": [\n    "a.b"\n    /* more later */\n  ]\n}\n';
  assert.equal(add(src), '{\n  "recommendations": [\n    "a.b",\n    "x.y"\n    /* more later */\n  ]\n}\n');
});

test("comments-only array", () => {
  const src = '{\n  "recommendations": [\n    // none yet\n  ]\n}\n';
  assert.equal(add(src), '{\n  "recommendations": [\n    // none yet\n    "x.y"\n  ]\n}\n');
});

test("single-line array keeps its style", () => {
  assert.equal(add('{ "recommendations": ["a.b", "c.d"] }'), '{ "recommendations": ["a.b", "c.d", "x.y"] }');
});

test("trailing comma style is kept", () => {
  const src = '{\n  "recommendations": [\n    "a.b",\n    "c.d", // keep\n  ]\n}\n';
  assert.equal(add(src), '{\n  "recommendations": [\n    "a.b",\n    "c.d", // keep\n    "x.y",\n  ]\n}\n');
});

test("empty array on one line and on two lines", () => {
  assert.equal(add('{\n  "recommendations": []\n}\n'), '{\n  "recommendations": [\n    "x.y"\n  ]\n}\n');
  assert.equal(add('{\n  "recommendations": [\n  ]\n}\n'), '{\n  "recommendations": [\n    "x.y"\n  ]\n}\n');
});

test("missing recommendations key is added to the root object", () => {
  assert.equal(add('{\n  "other": 1\n}\n'), '{\n  "other": 1,\n  "recommendations": [\n    "x.y"\n  ]\n}\n');
  assert.equal(add("{}"), '{\n  "recommendations": [\n    "x.y"\n  ]\n}');
});

test("new file", () => {
  assert.equal(add(null), '{\n  "recommendations": [\n    "x.y"\n  ]\n}\n');
});

test("CRLF line endings and tab indentation are reused", () => {
  const src = '{\r\n\t"recommendations": [\r\n\t\t"a.b"\r\n\t]\r\n}\r\n';
  assert.equal(add(src), '{\r\n\t"recommendations": [\r\n\t\t"a.b",\r\n\t\t"x.y"\r\n\t]\r\n}\r\n');
});

test("BOM is preserved", () => {
  const src = '\uFEFF{\n  "recommendations": [\n    "a.b"\n  ]\n}\n';
  const out = add(src);
  assert.ok(out.startsWith("\uFEFF{"));
  assert.equal(out, '\uFEFF{\n  "recommendations": [\n    "a.b",\n    "x.y"\n  ]\n}\n');
});

test("every byte outside the insertion is unchanged on the fixture-style file", () => {
  const src = '// header\n{\n  "recommendations": [\n    "a.b",\n    "c.d", // keep\n  ],\n  "unwantedRecommendations": [\n    "e.f"\n  ]\n}\n';
  const out = add(src);
  assert.equal(out.replace('    "x.y",\n', ""), src);
});

test("readExtensions: present, declined, malformed", () => {
  const ok = readExtensions('{"recommendations": ["X.Y"], "unwantedRecommendations": ["A.B"]}');
  assert.ok(ok.ok && ok.recs.has("x.y") && ok.unwanted.has("a.b"));
  assert.equal(readExtensions("{").ok, false);
  assert.equal(readExtensions("[]").ok, false);
  assert.equal(readExtensions('{"recommendations": [1]}').ok, false);
  assert.equal(readExtensions('{"recommendations": "x"}').ok, false);
});

test(".gitignore helpers", () => {
  assert.ok(hasLine("a\n.codegraph\n", ".codegraph/"));
  assert.ok(hasLine("a\r\n/.codegraph/  \r\n", ".codegraph/"));
  assert.ok(!hasLine("a\nb\n", ".codegraph/"));
  assert.equal(appendLine(null, ".codegraph/"), ".codegraph/\n");
  assert.equal(appendLine("a\nb", ".codegraph/"), "a\nb\n.codegraph/\n");
  assert.equal(appendLine("a\r\nb\r\n", ".codegraph/"), "a\r\nb\r\n.codegraph/\r\n");
});
