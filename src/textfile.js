// Small helpers for reading text files while remembering BOM, EOL, and indentation.
export function detectEol(text) {
  const m = /\r\n|\n/.exec(text);
  return m ? m[0] : "\n";
}

export function detectIndent(text) {
  const m = /^([ \t]+)\S/m.exec(text);
  return m ? m[1] : "  ";
}

export function hasBom(text) {
  return text.charCodeAt(0) === 0xfeff;
}

export function stripBom(text) {
  return hasBom(text) ? text.slice(1) : text;
}

export function formatInfo(text) {
  return { eol: detectEol(text), indentUnit: detectIndent(text), bom: hasBom(text) };
}

/** Apply non-overlapping splices ({start,end,text}) from the end to the start. */
export function applySplices(text, splices) {
  let out = text;
  // Same start: the splice listed first must appear first, so it is applied last.
  const ordered = splices.map((s, i) => ({ ...s, i })).sort((a, b) => b.start - a.start || b.end - a.end || b.i - a.i);
  for (const s of ordered) {
    out = out.slice(0, s.start) + s.text + out.slice(s.end);
  }
  return out;
}
