// Path policy: project root resolution, allowlist, containment, symlink guard.
// This is the only module allowed to look at the home directory, and only to refuse it.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { unsafe, usage } from "./errors.js";

export const ALLOWED_PREFIXES = [
  ".kiro/steering/",
  ".kiro/skills/",
  ".kiro/hooks/",
  "docs/cloudnaut/",
  ".cloudnaut/",
];
export const ALLOWED_EXACT = [".kiro/settings/mcp.json", ".vscode/extensions.json", ".gitignore"];

export function isAllowedTarget(rel) {
  return ALLOWED_EXACT.includes(rel) || ALLOWED_PREFIXES.some((p) => rel.startsWith(p) && rel.length > p.length);
}

/** True when `rel` is a safe, posix, project-relative path. */
export function isSafeRelative(rel) {
  if (typeof rel !== "string" || rel === "") return false;
  if (rel.includes("\0") || rel.includes("\\")) return false;
  if (rel.startsWith("/") || /^[A-Za-z]:/.test(rel)) return false;
  return !rel.split("/").some((seg) => seg === ".." || seg === "." || seg === "");
}

function fold(p, platform) {
  return platform === "win32" || platform === "darwin" ? p.toLowerCase() : p;
}

/** Containment check that works with synthetic paths for either platform. */
export function isInside(root, candidate, platform = process.platform) {
  const lib = platform === "win32" ? path.win32 : path.posix;
  const rel = lib.relative(fold(root, platform), fold(candidate, platform));
  if (rel === "") return true;
  if (lib.isAbsolute(rel)) return false;
  return rel !== ".." && !rel.startsWith(`..${lib.sep}`);
}

export function resolveProject(arg, cwd = process.cwd()) {
  if (!arg) throw usage("--project is required", "pass --project <path to an existing directory>");
  const abs = path.resolve(cwd, arg);
  let real;
  try {
    real = fs.realpathSync(abs);
  } catch {
    throw usage(`project path does not exist: ${abs}`, "pass --project <path to an existing directory>");
  }
  if (!fs.statSync(real).isDirectory()) throw usage(`project path is not a directory: ${real}`, "pass a directory");
  const home = safeRealHome();
  if (home) {
    if (isInside(home, real) && isInside(path.join(home, ".kiro"), real)) {
      throw unsafe(`refusing to use a path inside ~/.kiro: ${real}`, "choose a project directory");
    }
    if (fold(real, process.platform) === fold(home, process.platform)) {
      throw unsafe(`refusing to use the home directory as a project: ${real}`, "choose a project directory");
    }
  }
  return real;
}

function safeRealHome() {
  try {
    return fs.realpathSync(os.homedir());
  } catch {
    return null;
  }
}

/**
 * Resolve a project-relative target to the real path that may be written.
 * Throws ESCAPE if any existing component is a symlink leaving the project.
 */
export function resolveWriteTarget(projectReal, rel) {
  if (!isSafeRelative(rel)) throw unsafe(`unsafe target path: ${rel}`, "this is a bug in the release manifest or lock");
  const parts = rel.split("/");
  let cur = projectReal;
  for (let i = 0; i < parts.length; i++) {
    const next = path.join(cur, parts[i]);
    let st;
    try {
      st = fs.lstatSync(next);
    } catch (err) {
      if (err.code === "ENOENT") return { realPath: path.join(cur, ...parts.slice(i)), exists: false, broken: false };
      throw err;
    }
    if (st.isSymbolicLink()) {
      let resolved;
      try {
        resolved = fs.realpathSync(next);
      } catch {
        return { realPath: next, exists: false, broken: true };
      }
      if (!isInside(projectReal, resolved)) {
        throw unsafe(
          `${rel} resolves through a symlink to ${resolved}, outside the project`,
          "replace the symlink with a real file or directory, or choose another project",
        );
      }
      cur = resolved;
    } else {
      cur = next;
    }
  }
  return { realPath: cur, exists: true, broken: false };
}

export const guard = resolveWriteTarget;
