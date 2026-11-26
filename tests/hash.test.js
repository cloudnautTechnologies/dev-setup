import assert from "node:assert/strict";
import test from "node:test";
import { canonicalJson, normalizeText, sha256Json, sha256Text } from "../src/hash.js";

test("CRLF and LF text hash the same", () => {
  assert.equal(sha256Text("a\r\nb\r\n"), sha256Text("a\nb\n"));
  assert.equal(normalizeText("a\r\nb"), "a\nb");
});

test("canonical JSON ignores key order and whitespace", () => {
  assert.equal(canonicalJson({ b: 1, a: [2, { d: 1, c: 2 }] }), '{"a":[2,{"c":2,"d":1}],"b":1}');
  assert.equal(sha256Json({ a: 1, b: 2 }), sha256Json({ b: 2, a: 1 }));
});
