import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { CrashSignal, executePlan, setCheckpointHandler } from "../src/apply.js";
import { loadRelease } from "../src/manifest.js";
import { buildPlan } from "../src/plan.js";
import { deadPid, dirs, fixtureProject, makeRelease, read, run, runJson, snapshot, write } from "./helpers/util.js";

const J = ".cloudnaut/journal.json";
const ARGS = (p) => ["apply", "--project", p, "--profile", "aws", "--with-codegraph"];
const POST_COMMIT = new Set(["after-committed", "before-journal-delete"]);

async function injectedApply(p, name, mode, argsFn = ARGS) {
  setCheckpointHandler((n) => {
    if (n === name) throw mode === "crash" ? new CrashSignal(n) : new Error(`injected failure at ${n}`);
  });
  try {
    return await run(argsFn(p));
  } finally {
    setCheckpointHandler(null);
  }
}

async function patchOwner(p, patch) {
  for (const f of [J, ".cloudnaut/journal.recovering.json"]) {
    const file = path.join(p, f);
    if (!fs.existsSync(file)) continue;
    const j = JSON.parse(fs.readFileSync(file, "utf8"));
    Object.assign(j.owner, patch);
    fs.writeFileSync(file, JSON.stringify(j));
  }
}
const kill = async (p) => patchOwner(p, { pid: await deadPid() });

function assertClean(p, expected) {
  const snap = snapshot(p);
  assert.deepEqual([...snap.keys()].filter((k) => /cloudnaut-tmp-|journal|\.cloudnaut\/backup/.test(k)), [], "no temp, journal, or backup files remain");
  assert.ok(!fs.existsSync(path.join(p, ".cloudnaut/backup")));
  if (expected) assert.deepEqual(snap, expected);
}

const clean = fixtureProject();
const cleanRun = await run(ARGS(clean));
assert.equal(cleanRun.code, 0);
const CLEAN = snapshot(clean);
const N = (await runJson(["preview", "--project", fixtureProject(), "--profile", "aws", "--with-codegraph"])).json.plan.writes.length;

const names = ["after-journal-created", "after-stage", "before-lock", "after-lock", "after-committed", "before-journal-delete"];
for (let i = 0; i < N; i++) names.push(`during-stage:${i}`, `after-rename:${i}`);

for (const mode of ["throw", "crash"]) {
  for (const name of names) {
    test(`initial apply interrupted at ${name} (${mode}) recovers to a clean apply`, async () => {
      const p = fixtureProject();
      const preSnap = snapshot(p);
      const preDirs = dirs(p);
      const r = await injectedApply(p, name, mode);
      assert.notEqual(r.code, 0);
      if (mode === "throw" && !POST_COMMIT.has(name)) {
        assert.deepEqual(snapshot(p), preSnap, "rolled back to the pre-apply tree");
        assert.deepEqual(dirs(p), preDirs, "created directories were removed");
      }
      await kill(p);
      const r2 = await run(ARGS(p));
      assert.equal(r2.code, 0, r2.err);
      assertClean(p, CLEAN);
    });
  }
}

test("restore-only apply (lock bytes unchanged) interrupted at every point is rolled back and redone", async () => {
  const victim = ".kiro/skills/review-change/SKILL.md";
  for (const mode of ["throw", "crash"]) {
    for (const name of ["after-journal-created", "during-stage:0", "after-stage", "after-rename:0", "before-lock", "after-lock", "after-committed"]) {
      const p = fixtureProject();
      await run(ARGS(p));
      const full = snapshot(p);
      fs.rmSync(path.join(p, victim));
      const r = await injectedApply(p, name, mode);
      assert.notEqual(r.code, 0, `${mode} ${name}`);
      await kill(p);
      const r2 = await run(ARGS(p));
      assert.equal(r2.code, 0, r2.err);
      assertClean(p, full);
    }
  }
});

test("a live owner blocks apply, preview, and doctor; nothing changes", async () => {
  const p = fixtureProject();
  await injectedApply(p, "after-stage", "crash");
  const state = snapshot(p);
  const a = await run(ARGS(p));
  assert.equal(a.code, 5);
  assert.ok(a.err.includes("another apply is running"));
  assert.equal((await run(["preview", "--project", p, "--profile", "aws"])).code, 5);
  const d = await run(["doctor", "--project", p, "--no-exec"]);
  assert.equal(d.code, 4);
  assert.ok(d.out.includes("RECOVERY_PENDING"));
  assert.deepEqual(snapshot(p), state);
  await kill(p);
  assert.equal((await run(["preview", "--project", p, "--profile", "aws"])).code, 5, "preview never recovers");
  assert.equal((await run(ARGS(p))).code, 0);
  assertClean(p, CLEAN);
});

test("a journal from another host is not recovered automatically", async () => {
  const p = fixtureProject();
  await injectedApply(p, "after-stage", "crash");
  await patchOwner(p, { hostname: "some-other-host.invalid" });
  const state = snapshot(p);
  const r = await run(ARGS(p));
  assert.equal(r.code, 5);
  assert.ok(r.err.includes("another host"));
  assert.deepEqual(snapshot(p), state);
});

test("an unreadable journal is recovered when old and refused when new", async () => {
  const p = fixtureProject();
  write(p, ".kiro/steering/stray.md.cloudnaut-tmp-deadbeef", "junk");
  write(p, J, "{ not json");
  assert.equal((await run(ARGS(p))).code, 5, "very new journal");
  const old = new Date(Date.now() - 120_000);
  fs.utimesSync(path.join(p, J), old, old);
  const r = await run(ARGS(p));
  assert.equal(r.code, 0, r.err);
  assert.ok(r.err.includes("recovered"));
  assert.ok(!fs.existsSync(path.join(p, ".kiro/steering/stray.md.cloudnaut-tmp-deadbeef")), "stray temp file removed");
  assertClean(p, CLEAN);
});

test("an interrupted recovery (journal.recovering.json) is picked up", async () => {
  const p = fixtureProject();
  await injectedApply(p, "after-stage", "crash");
  fs.renameSync(path.join(p, J), path.join(p, ".cloudnaut/journal.recovering.json"));
  await kill(p);
  const r = await run(ARGS(p));
  assert.equal(r.code, 0, r.err);
  assertClean(p, CLEAN);
});

test("journal creation is exclusive: a journal appearing after planning stops apply", () => {
  const p = fixtureProject();
  const plan = buildPlan({ project: p, release: loadRelease(), profile: "core", flags: {} });
  write(p, J, "{}");
  const state = snapshot(p);
  assert.throws(() => executePlan(plan), (e) => e.exitCode === 5);
  assert.deepEqual(snapshot(p), state);
});

test("rollback never overwrites content it did not write", async () => {
  const p = fixtureProject();
  const r1 = loadRelease();
  await run(["apply", "--project", p, "--profile", "aws"], { release: r1 });
  const target = ".kiro/steering/cloudnaut-core.md";
  const r2 = makeRelease("0.2.0", (root) => {
    const f = path.join(root, "profiles/core/files", target);
    fs.writeFileSync(f, `${fs.readFileSync(f, "utf8")}\n- Upstream.\n`);
  });
  setCheckpointHandler((n) => {
    if (n === "after-rename:0") throw new CrashSignal(n);
  });
  const crashed = await run(["apply", "--project", p, "--profile", "aws"], { release: r2 });
  setCheckpointHandler(null);
  assert.equal(crashed.code, 6);
  assert.ok(read(p, target).includes("Upstream"), "rename happened before the crash");
  write(p, target, "LOCAL EDIT AFTER THE CRASH\n");
  await kill(p);
  const r = await run(["apply", "--project", p, "--profile", "aws"], { release: r2 });
  assert.equal(r.code, 0, r.err);
  assert.ok(r.err.includes("warning"), r.err);
  assert.equal(read(p, target), "LOCAL EDIT AFTER THE CRASH\n");
  assert.ok(fs.existsSync(path.join(p, ".cloudnaut/incoming", target)), "later apply treats it as a normal conflict");
  assertClean(p);
});

test("doctor reports leftover temp files and backups as broken config", async () => {
  const p = fixtureProject();
  await run(ARGS(p));
  write(p, ".kiro/steering/x.md.cloudnaut-tmp-0123abcd", "x");
  fs.mkdirSync(path.join(p, ".cloudnaut/backup/abcd0123"), { recursive: true });
  const d = await runJson(["doctor", "--project", p, "--no-exec"]);
  assert.equal(d.code, 4);
  assert.equal(d.json.findings.filter((f) => f.code === "TEMP_LEFTOVER").length, 2);
});
