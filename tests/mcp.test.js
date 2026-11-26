import assert from "node:assert/strict";
import test from "node:test";
import { applyMcpOps, readMcp } from "../src/mcp.js";

const aws = { name: "aws-knowledge-mcp", value: { url: "https://knowledge-mcp.global.api.aws" } };

test("insert into an irregular file: bytes outside the edit are unchanged", () => {
  const src = '{\n\t"mcpServers": {\r\n\r\n\t\t"a": { "url": "https://a.example.com" },\n\n\t\t"b": {"command":"b","args":["x","y"]}\n\t},\n\t"keep": [1,2,  3]\n}\n';
  const out = applyMcpOps(src, [aws]);
  const edit = ',\n\t\t"aws-knowledge-mcp": {\n\t\t\t"url": "https://knowledge-mcp.global.api.aws"\n\t\t}';
  assert.equal(out, src.replace('"y"]}\n\t}', `"y"]}${edit}\n\t}`).replace(/^/, ""));
  assert.deepEqual(JSON.parse(out).mcpServers["aws-knowledge-mcp"], aws.value);
});

test("missing mcpServers is added; new file is created", () => {
  const out = applyMcpOps('{\n  "other": true\n}\n', [aws]);
  assert.deepEqual(JSON.parse(out), { other: true, mcpServers: { "aws-knowledge-mcp": aws.value } });
  assert.equal(applyMcpOps(null, [aws]), '{\n  "mcpServers": {\n    "aws-knowledge-mcp": {\n      "url": "https://knowledge-mcp.global.api.aws"\n    }\n  }\n}\n');
});

test("replace changes only the entry value", () => {
  const src = '{\n  "mcpServers": {\n    "a": { "url": "https://old.example.com" },\n    "b": {"x":1}\n  }\n}\n';
  const out = applyMcpOps(src, [{ name: "a", value: { url: "https://new.example.com" } }]);
  assert.equal(out, '{\n  "mcpServers": {\n    "a": {\n      "url": "https://new.example.com"\n    },\n    "b": {"x":1}\n  }\n}\n');
});

test("two entries in one pass and CRLF files", () => {
  const out = applyMcpOps('{\r\n  "mcpServers": {}\r\n}\r\n', [aws, { name: "cg", value: { command: "cg" } }]);
  assert.ok(!/[^\r]\n/.test(out), "only CRLF line breaks");
  assert.deepEqual(Object.keys(JSON.parse(out).mcpServers), ["aws-knowledge-mcp", "cg"]);
});

test("readMcp rejects comments, bad shapes, and accepts a BOM", () => {
  assert.equal(readMcp('{"mcpServers": {}} // c').ok, false);
  assert.equal(readMcp("[]").ok, false);
  assert.equal(readMcp('{"mcpServers": []}').ok, false);
  assert.ok(readMcp('\uFEFF{"mcpServers": {"a": {}}}').ok);
  assert.ok(readMcp("{}").ok);
});
