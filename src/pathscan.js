// Locate an executable on PATH without running it.
import fs from "node:fs";
import path from "node:path";

export function findOnPath(name, env = process.env, platform = process.platform) {
  const pathVar = env.PATH ?? env.Path ?? env.path ?? "";
  const dirs = pathVar.split(platform === "win32" ? ";" : ":").filter(Boolean);
  const exts = platform === "win32" ? (env.PATHEXT || ".COM;.EXE;.BAT;.CMD").split(";").filter(Boolean) : [""];
  for (const dir of dirs) {
    for (const ext of exts) {
      const candidate = path.join(dir, name + ext);
      try {
        const st = fs.statSync(candidate);
        if (!st.isFile()) continue;
        if (platform !== "win32" && (st.mode & 0o111) === 0) continue;
        return candidate;
      } catch {
        // not here
      }
    }
  }
  return null;
}
