import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { main } from "../../src/cli.js";
import { loadRelease } from "../../src/manifest.js";
import { writeManifest } from "../../scripts/generate-manifest.js";

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const FIXTURE = path.join(REPO, "tests", "fixtures", "existing-project");

// Redirect the home directory so no test can touch a real one.
const FAKE_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "cdev-home-"));
process.env.HOME = FAKE_HOME;
process.env.USERPROFILE = FAKE_HOME;
export const HOME = FAKE_HOME;

const made = [];
process.on("exit", () => {
  for (const d of [...made, FAKE_HOME]) fs.rmSync(d, { recursive: true, force: true });
});

export function tmpDir(prefix = "cdev-") {
  const d = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  made.push(d);
  return d;
}

export function copyDir(from, to) {
  fs.cpSync(from, to, { recursive: true });
}

export function fixtureProject() {
  const d = tmpDir();
  copyDir(FIXTURE, d);
  return d;
}

export function emptyProject() {
  return tmpDir();
}

export function run(argv, { release, env, cwd } = {}) {
  let out = "";
  let err = "";
  const io = {
    stdout: { write: (s) => (out += s) },
    stderr: { write: (s) => (err += s) },
    cwd: cwd ?? process.cwd(),
    env: env ?? { PATH: "" },
    release,
  };
  return main(argv, io).then((code) => ({ code, out, err }));
}

export async function runJson(argv, opts) {
  const r = await run([...argv, "--json"], opts);
  return { ...r, json: r.out ? JSON.parse(r.out) : null };
}

/** Map of relative path -> sha256 for every file (not directories) under dir. */
export function snapshot(dir) {
  const out = new Map();
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isSymbolicLink()) out.set(`${path.relative(dir, full).split(path.sep).join("/")} -> link`, fs.readlinkSync(full));
      else if (e.isDirectory()) walk(full);
      else out.set(path.relative(dir, full).split(path.sep).join("/"), crypto.createHash("sha256").update(fs.readFileSync(full)).digest("hex"));
    }
  };
  walk(dir);
  return out;
}

export function dirs(dir) {
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory() && !e.isSymbolicLink()) {
        const full = path.join(d, e.name);
        out.push(path.relative(dir, full).split(path.sep).join("/"));
        walk(full);
      }
    }
  };
  walk(dir);
  return out.sort();
}

export function mtimes(dir) {
  const out = new Map();
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) walk(full);
      else out.set(path.relative(dir, full).split(path.sep).join("/"), fs.statSync(full).mtimeMs);
    }
  };
  walk(dir);
  return out;
}

export const read = (project, rel) => fs.readFileSync(path.join(project, ...rel.split("/")), "utf8");
export const write = (project, rel, text) => {
  const f = path.join(project, ...rel.split("/"));
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, text);
};
export const exists = (project, rel) => fs.existsSync(path.join(project, ...rel.split("/")));

/** Build a temp release copy (profiles + package.json) with a new version and optional edits. */
export function makeRelease(version, edit) {
  const root = tmpDir("cdev-release-");
  copyDir(path.join(REPO, "profiles"), path.join(root, "profiles"));
  const pkg = JSON.parse(fs.readFileSync(path.join(REPO, "package.json"), "utf8"));
  pkg.version = version;
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify(pkg, null, 2));
  if (edit) edit(root);
  writeManifest(root);
  return loadRelease(root);
}

export const deadPid = () => {
  // A process id that has exited.
  return import("node:child_process").then(({ spawnSync }) => spawnSync(process.execPath, ["-e", ""]).pid);
};
