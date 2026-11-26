// JSON/JSONC scanner and text-level edits. Documents are never re-serialized:
// every edit is a splice over the original text.
import { applySplices } from "./textfile.js";

export function scan(text) {
  const tokens = [];
  const n = text.length;
  let i = 0;
  while (i < n) {
    const c = text[i];
    if (c === " " || c === "\t" || c === "\n" || c === "\r" || c === "\uFEFF") {
      i++;
    } else if (c === "/" && text[i + 1] === "/") {
      let j = i + 2;
      while (j < n && text[j] !== "\n" && text[j] !== "\r") j++;
      tokens.push({ t: "lc", s: i, e: j });
      i = j;
    } else if (c === "/" && text[i + 1] === "*") {
      const j = text.indexOf("*/", i + 2);
      if (j < 0) throw new Error(`unterminated comment at ${i}`);
      tokens.push({ t: "bc", s: i, e: j + 2 });
      i = j + 2;
    } else if ("{}[],:".includes(c)) {
      tokens.push({ t: c, s: i, e: i + 1 });
      i++;
    } else if (c === '"') {
      let j = i + 1;
      while (j < n && text[j] !== '"') {
        if (text[j] === "\n" || text[j] === "\r") throw new Error(`unterminated string at ${i}`);
        j += text[j] === "\\" ? 2 : 1;
      }
      if (j >= n) throw new Error(`unterminated string at ${i}`);
      tokens.push({ t: "str", s: i, e: j + 1 });
      i = j + 1;
    } else {
      const rest = text.slice(i, i + 64);
      const num = /^-?\d+(\.\d+)?([eE][+-]?\d+)?/.exec(rest);
      const lit = /^(true|false|null)/.exec(rest);
      const m = num || lit;
      if (!m) throw new Error(`unexpected character at ${i}`);
      tokens.push({ t: num ? "num" : "lit", s: i, e: i + m[0].length });
      i += m[0].length;
    }
  }
  return tokens;
}

/** Parse into a range-annotated tree. Tolerates comments and trailing commas. */
export function parseDoc(text) {
  const toks = scan(text).filter((t) => t.t !== "lc" && t.t !== "bc");
  let p = 0;
  const fail = (m) => {
    throw new Error(m);
  };
  function container(open, closeType) {
    const o = toks[p++];
    const elems = [];
    let trailing = false;
    let close;
    for (;;) {
      const t = toks[p];
      if (!t) fail("unexpected end of document");
      if (t.t === closeType) {
        close = t;
        p++;
        break;
      }
      let el;
      if (open === "{") {
        if (t.t !== "str") fail(`expected property name at ${t.s}`);
        p++;
        if (!toks[p] || toks[p].t !== ":") fail(`expected ':' at ${t.e}`);
        p++;
        const v = value();
        el = { key: JSON.parse(text.slice(t.s, t.e)), start: t.s, end: v.end, value: v, comma: null };
      } else {
        const v = value();
        el = { start: v.start, end: v.end, value: v, comma: null };
      }
      elems.push(el);
      const nx = toks[p];
      if (nx && nx.t === ",") {
        el.comma = nx.s;
        p++;
        if (toks[p] && toks[p].t === closeType) trailing = true;
      } else if (!nx || nx.t !== closeType) {
        fail(`expected ',' or '${closeType}' at ${nx ? nx.s : text.length}`);
      }
    }
    return { type: open === "{" ? "object" : "array", start: o.s, end: close.e, open: o.s, close: close.s, elems, trailing };
  }
  function value() {
    const t = toks[p];
    if (!t) fail("unexpected end of document");
    if (t.t === "{") return container("{", "}");
    if (t.t === "[") return container("[", "]");
    if (t.t === "str" || t.t === "num" || t.t === "lit") {
      p++;
      const type = t.t === "str" ? "string" : t.t === "num" ? "number" : "literal";
      return { type, start: t.s, end: t.e, text: text.slice(t.s, t.e) };
    }
    return fail(`unexpected token at ${t.s}`);
  }
  const root = value();
  if (p !== toks.length) fail(`trailing content at ${toks[p].s}`);
  return root;
}

export function findProp(obj, key) {
  return obj.type === "object" ? obj.elems.find((e) => e.key === key) : undefined;
}

export function stringValue(node) {
  return JSON.parse(node.text);
}

const lineStart = (text, i) => text.lastIndexOf("\n", i - 1) + 1;
function lineEnd(text, i) {
  let j = i;
  while (j < text.length && text[j] !== "\n" && text[j] !== "\r") j++;
  return j;
}
const leadingWs = (text, ls) => /^[ \t]*/.exec(text.slice(ls, ls + 256))[0];

/**
 * Splices that append an element to an array or object node.
 * `mk(indent)` returns the element text for the given child indentation.
 */
export function insertElement(text, node, mk, { eol, indentUnit }) {
  const baseIndent = leadingWs(text, lineStart(text, node.open));
  const last = node.elems[node.elems.length - 1];

  if (!last) {
    const child = baseIndent + indentUnit;
    const el = mk(child);
    const inner = text.slice(node.open + 1, node.close);
    const closeLs = lineStart(text, node.close);
    const closeOwnLine = /^[ \t]*$/.test(text.slice(closeLs, node.close)) && closeLs > node.open;
    if (/^\s*$/.test(inner) && !inner.includes("\n")) {
      return [{ start: node.open + 1, end: node.close, text: `${eol}${child}${el}${eol}${baseIndent}` }];
    }
    if (closeOwnLine) return [{ start: closeLs, end: closeLs, text: `${child}${el}${eol}` }];
    return [{ start: node.close, end: node.close, text: `${eol}${child}${el}${eol}${baseIndent}` }];
  }

  const splices = [];
  const lastEnd = last.end;
  const multiLine = text.slice(node.open, node.close).includes("\n");
  if (!multiLine) {
    const el = mk(baseIndent);
    if (last.comma !== null) {
      splices.push({ start: last.comma + 1, end: last.comma + 1, text: ` ${el},` });
    } else {
      splices.push({ start: lastEnd, end: lastEnd, text: `, ${el}` });
    }
    return splices;
  }
  const indent = leadingWs(text, lineStart(text, last.start));
  const el = mk(indent);
  const trailingComma = last.comma !== null;
  const afterLast = last.comma !== null ? last.comma + 1 : lastEnd;
  const le = lineEnd(text, afterLast);
  if (le > node.close) {
    // closing bracket shares the last element's line
    splices.push({ start: afterLast, end: afterLast, text: `${trailingComma ? "" : ","}${eol}${indent}${el}${trailingComma ? "," : ""}` });
    return splices;
  }
  if (!trailingComma) splices.push({ start: lastEnd, end: lastEnd, text: "," });
  splices.push({ start: le, end: le, text: `${eol}${indent}${el}${trailingComma ? "," : ""}` });
  return splices;
}

export function replaceRange(start, end, text) {
  return [{ start, end, text }];
}

/** Render a JSON value for embedding at the given indentation. */
export function valueText(value, indent, { eol, indentUnit }) {
  return JSON.stringify(value, null, indentUnit).split("\n").join(`${eol}${indent}`);
}

export { applySplices };
