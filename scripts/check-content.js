// Content lint for public content. Usage: node scripts/check-content.js
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { sha256Text } from "../src/hash.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Every host cited anywhere in the repository. Add a host here in the same change that cites it. */
export const ALLOWED_HOSTS = [
  "github.com",
  "raw.githubusercontent.com",
  "open-vsx.org",
  "docs.aws.amazon.com",
  "kiro.dev",
  "knowledge-mcp.global.api.aws",
  "agent-plugins.org",
  "www.npmjs.com",
  "registry.npmjs.org",
  "agentskills.io",
  "nodejs.org",
  "code.visualstudio.com",
  "example.com",
  "keepachangelog.com",
  "semver.org",
  "adr.github.io",
  "aws.amazon.com",
];

export const ALLOWED_ACCOUNT_IDS = ["123456789012", "000000000000"];

// Tokens are assembled from fragments so this file does not match its own rules.
const j = (...p) => p.join("");
export const FORBIDDEN_TOKENS = [
  { name: j("np", "x"), re: new RegExp(`\\b${j("np", "x")}\\b`) },
  { name: j(" -", "y"), re: new RegExp(`\\s-${"y"}\\b`) },
  { name: j("install", ".sh"), re: new RegExp(j("install", "\\.sh")) },
  { name: j("install", ".ps1"), re: new RegExp(j("install", "\\.ps1")) },
  { name: j("cu", "rl"), re: new RegExp(`\\b${j("cu", "rl")}\\b`) },
  { name: j("iw", "r"), re: new RegExp(`\\b${j("iw", "r")}\\b`) },
];
export const TOKEN_SCOPES = ["profiles", "powers", "src", "scripts", ".github", "package.json"];

const REPO_ROOT_FORBIDDEN = [
  ".kiro/steering",
  ".kiro/skills",
  ".kiro/hooks",
  ".kiro/settings",
  ".vscode/extensions.json",
  ".codegraph",
  ".cloudnaut",
];
const FORBIDDEN_TRIGGERS = [
  "SessionStart", "Stop", "UserPromptSubmit", "PreToolUse", "PostToolUse",
  "PostFileCreate", "PostFileSave", "PostFileDelete", "PreTaskExec",
];
const SKIP_DIRS = new Set([".git", "node_modules", ".agents"]);

export function scanText(rel, text) {
  const out = [];
  const add = (code, msg) => out.push({ file: rel, code, message: msg });
  for (const m of text.matchAll(/(?<![0-9A-Za-z])\d{12}(?![0-9A-Za-z])/g)) {
    if (!ALLOWED_ACCOUNT_IDS.includes(m[0])) add("ACCOUNT_ID", `12-digit number ${m[0]}`);
  }
  if (new RegExp(j("AK", "IA", "[0-9A-Z]{16}")).test(text) || new RegExp(j("AS", "IA", "[0-9A-Z]{16}")).test(text)) {
    add("ACCESS_KEY", "AWS access key pattern");
  }
  if (new RegExp(j("-----BEGIN [A-Z ]*", "PRIVATE KEY-----")).test(text)) add("PEM", "private key header");
  for (const m of text.matchAll(/[A-Za-z0-9._%+-]+@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,})\b/g)) {
    if (m[1].toLowerCase() !== "example.com") add("EMAIL", `e-mail address ${m[0]}`);
  }
  for (const m of text.matchAll(/arn:aws[a-z-]*:[a-z0-9-]*:[a-z0-9-]*:(\d{12}):/g)) {
    if (!ALLOWED_ACCOUNT_IDS.includes(m[1])) add("ARN_ACCOUNT", `ARN with account ${m[1]}`);
  }
  for (const m of text.matchAll(/https?:\/\/([A-Za-z0-9.-]+)/g)) {
    const h = m[1].toLowerCase().replace(/\.$/, "");
    const ok = ALLOWED_HOSTS.some((a) => h === a || h.endsWith(`.${a}`) && a === "example.com");
    if (!ok) add("URL_HOST", `host not on allowlist: ${h}`);
  }
  return out;
}

export function urlHosts(text) {
  return [...text.matchAll(/https?:\/\/([A-Za-z0-9.-]+)/g)].map((m) => m[1].toLowerCase().replace(/\.$/, ""));
}

export function scanTokens(rel, text) {
  return FORBIDDEN_TOKENS.filter((t) => t.re.test(text)).map((t) => ({
    file: rel,
    code: "FORBIDDEN_TOKEN",
    message: `forbidden token "${t.name}"`,
  }));
}

function walkFiles(root, dir = root, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(e.name) && dir === root) continue;
    if (e.name === ".git" || e.name === "node_modules") continue;
    const full = path.join(dir, e.name);
    if (e.isSymbolicLink()) continue;
    if (e.isDirectory()) walkFiles(root, full, out);
    else out.push(full);
  }
  return out;
}

function ponytailExempt(root) {
  const pin = JSON.parse(fs.readFileSync(path.join(root, "profiles/optional/ponytail/feature.json"), "utf8")).pin;
  const exempt = new Set();
  const pairs = [
    ["profiles/optional/ponytail/files/.kiro/steering/ponytail.md", pin.steeringSha256],
    ["profiles/optional/ponytail/files/.cloudnaut/third-party/ponytail/LICENSE", pin.licenseSha256],
  ];
  for (const [rel, want] of pairs) {
    const f = path.join(root, rel);
    if (fs.existsSync(f) && sha256Text(fs.readFileSync(f, "utf8")) === want) exempt.add(rel);
  }
  return exempt;
}

export function runContentCheck(root = ROOT) {
  const findings = [];
  for (const rel of REPO_ROOT_FORBIDDEN) {
    if (fs.existsSync(path.join(root, rel))) findings.push({ file: rel, code: "ACTIVE_CONFIG", message: "active config at repository root" });
  }
  const kiro = path.join(root, ".kiro");
  if (fs.existsSync(kiro)) {
    for (const e of fs.readdirSync(kiro)) if (e !== "specs") findings.push({ file: `.kiro/${e}`, code: "ACTIVE_CONFIG", message: "only .kiro/specs is allowed" });
  }
  const exempt = ponytailExempt(root);
  for (const full of walkFiles(root)) {
    const rel = path.relative(root, full).split(path.sep).join("/");
    if (exempt.has(rel)) continue;
    const stat = fs.statSync(full);
    if (stat.size > 2_000_000) continue;
    const text = fs.readFileSync(full, "utf8");
    findings.push(...scanText(rel, text));
    if (TOKEN_SCOPES.some((s) => rel === s || rel.startsWith(`${s}/`))) findings.push(...scanTokens(rel, text));
    if ((rel.startsWith("profiles/") || rel.startsWith("powers/")) && rel.endsWith(".json")) {
      let data;
      try {
        data = JSON.parse(text);
      } catch (err) {
        findings.push({ file: rel, code: "JSON", message: `invalid JSON: ${err.message}` });
        continue;
      }
      if (text.includes("autoApprove")) findings.push({ file: rel, code: "AUTOAPPROVE", message: "autoApprove must not appear" });
      if (rel.includes("/.kiro/hooks/")) findings.push(...checkHook(rel, data));
    }
  }
  return findings;
}

export function checkHook(rel, data) {
  const out = [];
  const add = (msg) => out.push({ file: rel, code: "HOOK", message: msg });
  if (data.version !== "v1") add("version must be v1");
  if (!Array.isArray(data.hooks) || data.hooks.length !== 1) add("exactly one hook required");
  for (const h of data.hooks || []) {
    if (h.trigger !== "PostTaskExec" || FORBIDDEN_TRIGGERS.includes(h.trigger)) add(`trigger ${h.trigger} not allowed`);
    if (!h.action || h.action.type !== "command") add("action must be a command");
    if ("matcher" in h) add("matcher not allowed");
  }
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const findings = runContentCheck();
  if (findings.length) {
    for (const f of findings) console.error(`${f.file}: [${f.code}] ${f.message}`);
    process.exit(1);
  }
  console.log("content check passed");
}
