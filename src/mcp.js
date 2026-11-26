// Text-level editing of .kiro/settings/mcp.json (strict JSON).
import { sha256Json } from "./hash.js";
import { applySplices, formatInfo, stripBom } from "./textfile.js";
import { findProp, insertElement, parseDoc, valueText } from "./jsontext.js";

export const MCP_FILE = ".kiro/settings/mcp.json";

/** Parse strict JSON. Returns {ok:true, servers} or {ok:false, error}. */
export function readMcp(text) {
  let data;
  try {
    data = JSON.parse(stripBom(text));
    parseDoc(text);
  } catch (err) {
    return { ok: false, error: `not valid JSON: ${err.message}` };
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return { ok: false, error: "root is not an object" };
  const servers = data.mcpServers;
  if (servers !== undefined && (servers === null || typeof servers !== "object" || Array.isArray(servers))) {
    return { ok: false, error: "mcpServers is not an object" };
  }
  return { ok: true, servers: servers || {}, data };
}

export function entryHash(value) {
  return sha256Json(value);
}

const NEW_FILE = '{\n  "mcpServers": {}\n}\n';

/**
 * Apply [{name, value}] set operations (insert when absent, replace when present).
 * `text` may be null for a new file. Returns the new text.
 */
export function applyMcpOps(text, ops) {
  let cur = text === null ? NEW_FILE : text;
  const fmt = formatInfo(cur);
  for (const op of ops) {
    let root = parseDoc(cur);
    let servers = findProp(root, "mcpServers");
    if (!servers) {
      const sp = insertElement(cur, root, () => '"mcpServers": {}', fmt);
      cur = applySplices(cur, sp);
      root = parseDoc(cur);
      servers = findProp(root, "mcpServers");
    }
    const obj = servers.value;
    const existing = findProp(obj, op.name);
    if (existing) {
      const indent = /^[ \t]*/.exec(cur.slice(cur.lastIndexOf("\n", existing.value.start) + 1))[0];
      cur = applySplices(cur, [{ start: existing.value.start, end: existing.value.end, text: valueText(op.value, indent, fmt) }]);
    } else {
      const sp = insertElement(cur, obj, (indent) => `${JSON.stringify(op.name)}: ${valueText(op.value, indent, fmt)}`, fmt);
      cur = applySplices(cur, sp);
    }
  }
  return cur;
}
