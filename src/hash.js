import { createHash } from "node:crypto";

export function normalizeText(s) {
  return s.replace(/\r\n/g, "\n");
}

export function sha256Text(s) {
  return createHash("sha256").update(normalizeText(s), "utf8").digest("hex");
}

export function rawHash(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

export function canonicalJson(v) {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(",")}]`;
  if (v && typeof v === "object") {
    const keys = Object.keys(v).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(v[k])}`).join(",")}}`;
  }
  return JSON.stringify(v);
}

export function sha256Json(v) {
  return sha256Text(canonicalJson(v));
}
