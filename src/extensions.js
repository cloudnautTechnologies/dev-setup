// Text-level editing of .vscode/extensions.json (JSONC).
import { applySplices, formatInfo } from "./textfile.js";
import { findProp, insertElement, parseDoc, stringValue } from "./jsontext.js";

export const EXTENSIONS_PATH = ".vscode/extensions.json";

function stringList(node) {
  if (!node || node.type !== "array") return null;
  const out = [];
  for (const e of node.elems) {
    if (e.value.type !== "string") return null;
    out.push(stringValue(e.value));
  }
  return out;
}

/** Returns {ok, recs, unwanted} (lowercased sets) or {ok:false, error}. */
export function readExtensions(text) {
  let root;
  try {
    root = parseDoc(text);
  } catch (err) {
    return { ok: false, error: `cannot be parsed: ${err.message}` };
  }
  if (root.type !== "object") return { ok: false, error: "root is not an object" };
  const rec = findProp(root, "recommendations");
  const recs = rec ? stringList(rec.value) : [];
  if (recs === null) return { ok: false, error: "recommendations is not an array of strings" };
  const unw = findProp(root, "unwantedRecommendations");
  const unwanted = (unw && stringList(unw.value)) || [];
  return { ok: true, recs: new Set(recs.map((s) => s.toLowerCase())), unwanted: new Set(unwanted.map((s) => s.toLowerCase())) };
}

const NEW_FILE = '{\n  "recommendations": []\n}\n';

/** Append ids to recommendations. `text` may be null for a new file. */
export function applyExtensionOps(text, ids) {
  let cur = text === null ? NEW_FILE : text;
  const fmt = formatInfo(cur);
  for (const id of ids) {
    let root = parseDoc(cur);
    let rec = findProp(root, "recommendations");
    if (!rec) {
      cur = applySplices(cur, insertElement(cur, root, () => '"recommendations": []', fmt));
      root = parseDoc(cur);
      rec = findProp(root, "recommendations");
    }
    cur = applySplices(cur, insertElement(cur, rec.value, () => JSON.stringify(id), fmt));
  }
  return cur;
}
