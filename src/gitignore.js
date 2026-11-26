import { detectEol } from "./textfile.js";

function equivalents(line) {
  const bare = line.replace(/^\//, "").replace(/\/$/, "");
  return new Set([bare, `${bare}/`, `/${bare}`, `/${bare}/`]);
}

export function hasLine(text, line) {
  const eq = equivalents(line);
  return text.split(/\r?\n/).some((l) => eq.has(l.trimEnd()));
}

export function appendLine(text, line) {
  if (text === null || text === "") return `${line}\n`;
  const eol = detectEol(text);
  const prefix = text.endsWith("\n") ? "" : eol;
  return `${text}${prefix}${line}${eol}`;
}
