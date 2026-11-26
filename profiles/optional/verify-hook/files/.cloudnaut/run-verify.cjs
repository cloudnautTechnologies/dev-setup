"use strict";
// Cloudnaut verify runner. Runs the project's verification command and makes
// sure failure output reaches stderr, which is what Kiro forwards to the agent
// when a hook exits non-zero. No dependencies. CommonJS so it runs regardless
// of the project's "type" setting.
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const MAX_BUFFER = 64 * 1024 * 1024;
const MAX_LINES = 200;
const MAX_BYTES = 20 * 1024;

function fail(text) {
  process.stderr.write(text.endsWith("\n") ? text : `${text}\n`);
  process.exit(1);
}

function tail(text) {
  const lines = text.split("\n");
  if (lines.length && lines[lines.length - 1] === "") lines.pop();
  let start = Math.max(0, lines.length - MAX_LINES);
  while (start < lines.length - 1 && Buffer.byteLength(lines.slice(start).join("\n")) > MAX_BYTES) start++;
  let out = lines.slice(start).join("\n");
  if (Buffer.byteLength(out) > MAX_BYTES) out = out.slice(out.length - MAX_BYTES);
  return start > 0 ? `... ${start} lines truncated\n${out}` : out;
}

const root = path.resolve(__dirname, "..");
let command;
try {
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, "verify-command.json"), "utf8"));
  command = data && data.command;
} catch (err) {
  fail(`verify command could not be read from .cloudnaut/verify-command.json: ${err.message}`);
}
if (typeof command !== "string" || command.trim() === "") {
  fail("verify command is missing or empty in .cloudnaut/verify-command.json");
}

let timeout = 590000;
const override = Number(process.env.CLOUDNAUT_VERIFY_TIMEOUT_MS);
if (Number.isFinite(override) && override >= 1 && override < timeout) timeout = override;

const res = spawnSync(command, { shell: true, cwd: root, encoding: "utf8", timeout, maxBuffer: MAX_BUFFER });
const combined = `${res.stdout || ""}${res.stderr || ""}`;

if (res.error) {
  let reason;
  if (res.error.code === "ENOBUFS") reason = "verify command output exceeded 64 MiB";
  else if (res.error.code === "ETIMEDOUT") reason = `verify command timed out after ${Math.round(timeout / 1000)} s: ${command}`;
  else reason = `verify command could not start: ${res.error.message}`;
  fail(`${combined ? `${tail(combined)}\n` : ""}${reason}`);
}
if (res.status !== 0) {
  const why = res.status === null ? `signal ${res.signal}` : `exit ${res.status}`;
  fail(`${combined ? `${tail(combined)}\n` : ""}verify command failed (${why}): ${command}`);
}
