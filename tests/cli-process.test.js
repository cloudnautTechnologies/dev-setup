import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { HOME, REPO, fixtureProject } from "./helpers/util.js";

const cli = (args) => spawnSync(process.execPath, ["bin/dev-setup.js", ...args], { cwd: REPO, encoding: "utf8", env: { ...process.env, HOME, USERPROFILE: HOME } });

test("real process exit codes and streams", () => {
  const p = fixtureProject();
  assert.equal(cli(["--version"]).stdout.trim(), "0.1.0");
  assert.ok(cli(["--help"]).stdout.includes("Usage:"));
  const bad = cli(["apply", "--project", p]);
  assert.equal(bad.status, 1);
  assert.ok(bad.stderr.includes("--profile"));
  assert.equal(bad.stdout, "");
  assert.equal(cli(["nope"]).status, 1);
  assert.equal(cli(["doctor", "--project", p, "--profile", "core"]).status, 1);
  assert.equal(cli(["preview", "--project", p, "--profile", "aws"]).status, 0);
  const a = cli(["apply", "--project", p, "--profile", "aws"]);
  assert.equal(a.status, 0, a.stderr);
  assert.equal(cli(["doctor", "--project", p, "--no-exec"]).status, 0);
  assert.equal(cli(["doctor", "--project", HOME]).status, 3);
  assert.equal(cli(["doctor", "--project", `${p}-missing`]).status, 1);
});
