// Locally runnable smoke checks. Usage: node scripts/smoke-local.js [--network]
// Everything here is checked in code. Live Kiro IDE behavior is listed at the end as NOT verified.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { main } from "../src/cli.js";
import { findOnPath } from "../src/pathscan.js";
import { diffPower } from "./sync-power.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const results = [];
function step(area, label, fn) {
  try {
    const detail = fn();
    results.push({ ok: true, area, label, detail });
  } catch (err) {
    results.push({ ok: false, area, label, detail: err.message });
  }
}
const need = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

async function cli(argv) {
  let out = "";
  let err = "";
  const code = await main(argv, { stdout: { write: (s) => (out += s) }, stderr: { write: (s) => (err += s) }, cwd: ROOT, env: process.env });
  return { code, out, err };
}

const project = fs.mkdtempSync(path.join(os.tmpdir(), "cloudnaut-smoke-"));
fs.cpSync(path.join(ROOT, "tests", "fixtures", "existing-project"), project, { recursive: true });
const verify = 'node -e "process.exit(0)"';
const applied = await cli(["apply", "--project", project, "--profile", "connect", "--with-codegraph", "--verify-command", verify]);
step("setup", "apply connect + CodeGraph + verify hook into a temp copy of the fixture", () => need(applied.code === 0, applied.err));
const file = (rel) => path.join(project, ...rel.split("/"));
const front = (rel) => /^---\n([\s\S]*?)\n---/.exec(fs.readFileSync(file(rel), "utf8").replace(/\r\n/g, "\n"))?.[1] ?? "";

step("steering", "steering files have the expected inclusion modes", () => {
  need(/inclusion: always/.test(front(".kiro/steering/cloudnaut-core.md")), "core is not always");
  for (const f of ["cloudnaut-aws-cdk", "cloudnaut-connect"]) {
    const fm = front(`.kiro/steering/${f}.md`);
    need(/inclusion: auto/.test(fm) && /^name:/m.test(fm) && /^description:/m.test(fm), `${f} is not a valid auto file`);
  }
});
step("skills", "four skills with matching name and description", () => {
  for (const s of ["trace-code-path", "review-change", "review-aws-infra-change", "connect-flow-troubleshooting"]) {
    const fm = front(`.kiro/skills/${s}/SKILL.md`);
    need(new RegExp(`^name: ${s}$`, "m").test(fm) && /^description: .+/m.test(fm), `${s} front matter`);
  }
});
step("mcp", "mcp.json parses; AWS Knowledge entry present; no autoApprove; existing servers kept", () => {
  const j = JSON.parse(fs.readFileSync(file(".kiro/settings/mcp.json"), "utf8"));
  need(j.mcpServers["aws-knowledge-mcp"]?.url === "https://knowledge-mcp.global.api.aws", "entry missing");
  need(!JSON.stringify(j).includes("autoApprove"), "autoApprove present");
  need(j.mcpServers["internal-docs"] && j.mcpServers["local-tool"], "existing servers lost");
});
step("hook", "hook file is v1 PostTaskExec with the fixed command", () => {
  const h = JSON.parse(fs.readFileSync(file(".kiro/hooks/cloudnaut-verify-after-task.json"), "utf8"));
  need(h.version === "v1" && h.hooks.length === 1 && h.hooks[0].trigger === "PostTaskExec", "shape");
  need(h.hooks[0].action.command === "node .cloudnaut/run-verify.cjs", "command");
});
const runner = () => spawnSync(process.execPath, [file(".cloudnaut/run-verify.cjs")], { cwd: os.tmpdir(), encoding: "utf8" });
step("hook", "runner: a passing verify command is silent and exits 0", () => {
  const r = runner();
  need(r.status === 0 && r.stderr === "", `status ${r.status} ${r.stderr}`);
});
step("hook", "runner: a failing stdout-only command reaches stderr with a non-zero exit", () => {
  const cmdFile = file(".cloudnaut/verify-command.json");
  const original = fs.readFileSync(cmdFile, "utf8");
  fs.writeFileSync(cmdFile, JSON.stringify({ command: `node -e "console.log('SMOKE-FAILURE-TEXT'); process.exit(2)"` }));
  const r = runner();
  fs.writeFileSync(cmdFile, original);
  need(r.status !== 0 && r.stderr.includes("SMOKE-FAILURE-TEXT") && r.stderr.includes("verify command failed (exit 2)"), `status ${r.status} ${r.stderr}`);
});
step("codegraph", "CodeGraph wiring is pinned and has the telemetry opt-out", () => {
  const e = JSON.parse(fs.readFileSync(file(".kiro/settings/mcp.json"), "utf8")).mcpServers.codegraph;
  need(e.command === "codegraph" && e.args.join(" ") === "serve --mcp --no-telemetry", "args");
  need(e.env.CODEGRAPH_TELEMETRY === "0" && e.env.DO_NOT_TRACK === "1" && e.env.CODEGRAPH_NO_UPDATE_CHECK === "1", "env");
  need(/^\.codegraph\/$/m.test(fs.readFileSync(file(".gitignore"), "utf8")), ".gitignore line");
});
step("codegraph", "codegraph binary availability (informational)", () => {
  const found = findOnPath("codegraph");
  return found ? `found at ${found}` : "not on PATH (optional; see docs/codegraph.md)";
});
step("doctor", "doctor --no-exec reports no broken config", () => {
  return cli(["doctor", "--project", project, "--no-exec"]).then((r) => need(r.code === 0, r.out));
});
step("power", "Power manifest exists and the skill copy matches the single source", () => {
  const m = JSON.parse(fs.readFileSync(path.join(ROOT, "powers/cloudnaut-connect-troubleshooting/plugin.json"), "utf8"));
  need(m.name === "cloudnaut-connect-troubleshooting", "name");
  const d = diffPower(ROOT);
  need(d.length === 0, d.join(", "));
});

// doctor is async; settle promises stored by step()
for (const r of results) if (r.detail && typeof r.detail.then === "function") {
  try {
    await r.detail;
    r.detail = undefined;
  } catch (err) {
    r.ok = false;
    r.detail = err.message;
  }
}

if (process.argv.includes("--network")) {
  try {
    const res = await fetch("https://knowledge-mcp.global.api.aws", { method: "GET", signal: AbortSignal.timeout(10000) });
    results.push({ ok: true, area: "mcp", label: "AWS Knowledge MCP endpoint is reachable (--network)", detail: `HTTP ${res.status}; this does not prove Kiro can use it` });
  } catch (err) {
    results.push({ ok: false, area: "mcp", label: "AWS Knowledge MCP endpoint is reachable (--network)", detail: err.message });
  }
}

fs.rmSync(project, { recursive: true, force: true });
for (const r of results) console.log(`${r.ok ? "RAN LOCALLY  pass" : "RAN LOCALLY  FAIL"}  [${r.area}] ${r.label}${r.detail ? ` (${r.detail})` : ""}`);
console.log("\nNEEDS LIVE IDE (not run here, NOT verified):");
for (const s of [
  "steering discovery: the three steering files appear in the Steering panel; auto files load for AWS and Connect prompts",
  "skill loading: the four skills are listed and activate from a matching prompt or /skill-name",
  "AWS Knowledge MCP: Kiro connects to aws-knowledge-mcp and lists search_documentation and its other tools; tool calls ask for approval",
  "hook: PostTaskExec fires after a spec task; a deliberately failing stdout-only command reaches the agent",
  "CodeGraph: the codegraph server starts in Kiro (including codegraph.cmd on Windows) and lists its tools",
  "Power import: the folder imports through Powers panel > Add Custom Power; a keyword activates it",
  "extension recommendation: Kiro honors .vscode/extensions.json; AWS Toolkit installs from Open VSX and signs in",
]) console.log(`  - ${s}`);
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} local steps passed.`);
process.exit(failed ? 1 : 0);
