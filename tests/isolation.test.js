import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { HOME, REPO, fixtureProject, run, snapshot } from "./helpers/util.js";

const walk = (dir, out = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) walk(f, out);
    else if (/\.(js|cjs|mjs)$/.test(e.name)) out.push(f);
  }
  return out;
};
const rel = (f) => path.relative(REPO, f).split(path.sep).join("/");

test("the redirected home directory is untouched by preview, apply, and doctor", async () => {
  const p = fixtureProject();
  const before = snapshot(HOME);
  for (const argv of [["preview", "--project", p, "--profile", "connect"], ["apply", "--project", p, "--profile", "connect", "--with-codegraph", "--verify-command", "npm test"], ["doctor", "--project", p, "--no-exec"]]) {
    await run(argv);
  }
  assert.deepEqual(snapshot(HOME), before);
  assert.equal(before.size, 0);
});

test("source scan: no AWS, home-directory, or Memory access outside paths.js; no network modules", () => {
  const files = [...walk(path.join(REPO, "src")), ...walk(path.join(REPO, "bin")), ...walk(path.join(REPO, "scripts"))];
  assert.ok(files.length > 10);
  for (const f of files) {
    const text = fs.readFileSync(f, "utf8");
    const name = rel(f);
    assert.ok(!/(^|[\s"'`/\\~])\.aws([\s"'`/\\]|$)/m.test(text), `${name} mentions the .aws folder`);
    assert.ok(!/env\.AWS_|env\[\s*["'`]AWS_|["'`]AWS_(PROFILE|ACCESS_KEY|SECRET|SESSION|REGION|DEFAULT|CONFIG|SHARED)/.test(text), `${name} reads AWS_ variables`);
    if (name !== "src/paths.js") assert.ok(!/~\/\.kiro/.test(text), `${name} uses ~/.kiro`);
    assert.ok(!/\bmemor(y|ies)\b/i.test(text.replace(/\/\/.*$/gm, "")) || name.startsWith("scripts/"), `${name} references Memory`);
    if (name !== "src/paths.js") assert.ok(!/homedir\(|os\.homedir/.test(text), `${name} uses the home directory`);
    if (name.startsWith("src/") || name.startsWith("bin/")) {
      assert.ok(!/from "node:(net|http|https|dns|tls|dgram|http2)"|require\("(net|http|https|dns|tls)"\)/.test(text), `${name} imports a network module`);
    }
  }
  const paths = fs.readFileSync(path.join(REPO, "src/paths.js"), "utf8");
  assert.equal((paths.match(/homedir\(/g) || []).length, 1, "paths.js uses the home directory once, to refuse it");
});

test("plan.js imports no filesystem write functions", () => {
  const text = fs.readFileSync(path.join(REPO, "src/plan.js"), "utf8");
  assert.ok(!/\b(writeFile|writeFileSync|mkdir|mkdirSync|rename|renameSync|unlink|unlinkSync|rm|rmSync|rmdir|rmdirSync|copyFile|copyFileSync|appendFile|appendFileSync|openSync|cpSync|symlinkSync|chmodSync|utimesSync)\s*\(/.test(text));
});

function cli(args, env = {}) {
  const clean = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith("AWS_")));
  return spawnSync(process.execPath, ["--import", "./tests/helpers/block-network.mjs", "bin/dev-setup.js", ...args], {
    cwd: REPO,
    encoding: "utf8",
    env: { ...clean, HOME, USERPROFILE: HOME, ...env },
  });
}

test("preview, apply, and doctor --no-exec succeed with the network blocked and AWS variables unset", () => {
  const p = fixtureProject();
  for (const args of [["preview", "--project", p, "--profile", "connect"], ["apply", "--project", p, "--profile", "connect"], ["doctor", "--project", p, "--no-exec"]]) {
    const r = cli(args, { AWS_PROFILE: "", AWS_ACCESS_KEY_ID: "" });
    assert.equal(r.status, 0, `${args[0]}: ${r.stderr}`);
    assert.ok(!(r.stdout + r.stderr).includes("NETWORK_BLOCKED"));
  }
});
