import { planForJson } from "./plan.js";

const pad = (s, n) => String(s).padEnd(n);

export function renderPlan(plan, { mode, result = null }) {
  const L = [];
  L.push(`Cloudnaut dev-setup ${plan.tool.version}: ${mode} profile ${plan.profile} (${plan.resolvedProfiles.join(", ")})`);
  L.push(`Project: ${plan.project}`);
  const o = plan.options;
  L.push(`Options: codegraph=${o.withCodegraph} ponytail=${o.withPonytail} verify-command=${o.verifyCommand === null ? "none" : JSON.stringify(o.verifyCommand)}`);
  L.push("");
  for (const a of plan.actions) {
    const where = a.pointer ? `${a.target} ${a.pointer}` : a.target;
    L.push(`  ${pad(a.op, 15)} ${pad(a.kind, 11)} ${where}${a.reason ? `  (${a.reason})` : ""}`);
  }
  const extra = plan.writes.filter((w) => w.path.startsWith(".cloudnaut/incoming/"));
  for (const w of extra) L.push(`  ${pad(w.mode === "delete" ? "remove" : "write", 15)} ${pad("incoming", 11)} ${w.path}`);
  if (plan.lock?.changed) L.push(`  ${pad("write", 15)} ${pad("lock", 11)} ${plan.lock.path}`);
  if (plan.collisions.length) {
    L.push("", `Collisions (${plan.collisions.length}), nothing will be written:`);
    for (const c of plan.collisions) L.push(`  [${c.code}] ${c.target}${c.pointer ? ` ${c.pointer}` : ""}: ${c.message}`, `      fix: ${c.fix}`);
  }
  if (plan.reviewItems.length) {
    L.push("", `Review items (${plan.reviewItems.length}):`);
    for (const r of plan.reviewItems) L.push(`  [${r.code}] ${r.message}`);
  }
  for (const n of plan.notices) L.push("", `Note [${n.code}]: ${n.message}`);
  if (plan.warnings.length) {
    L.push("", "Warnings:");
    for (const w of plan.warnings) L.push(`  [${w.code}] ${w.message}`);
  }
  const s = plan.summary;
  L.push("", `Summary: ${s.create} create, ${s.update} update, ${s.adopt} adopt, ${s.restore} restore, ${s.remove} remove, ${s.keepLocal} keep-local, ${s.unchanged} unchanged, ${s.skipPreexisting} already present; ${s.writes} file write(s).`);
  if (mode === "preview") L.push("Preview only. Nothing was written.");
  else if (plan.collisions.length) L.push("Nothing was written.");
  else if (result && !result.changed) L.push("Already up to date. Nothing was written.");
  else if (result) L.push(`Applied ${result.written.length} file write(s). Review the changes with git status and git diff.`);
  return `${L.join("\n")}\n`;
}

export function renderDoctor(result) {
  const L = [];
  const sections = [["BROKEN", "BROKEN CONFIG"], ["OPTIONAL_MISSING", "OPTIONAL PREREQUISITES MISSING"], ["INFO", "INFO"], ["OK", "OK"]];
  for (const [cat, title] of sections) {
    const list = result.findings.filter((f) => f.category === cat);
    if (!list.length) continue;
    L.push(`${title} (${list.length})`);
    for (const f of list) L.push(`  [${f.code}]${f.target ? ` ${f.target}:` : ""} ${f.message}`);
    L.push("");
  }
  const s = result.summary;
  L.push(`Doctor: ${s.broken} broken, ${s.optionalMissing} optional missing, ${s.info} info, ${s.ok} ok.`);
  return `${L.join("\n")}\n`;
}

export const jsonPlan = (plan, result) => `${JSON.stringify({ plan: planForJson(plan), ...(result ? { result } : {}) }, null, 2)}\n`;
