import fs from "node:fs";
import path from "node:path";
import { tmpDir } from "./util.js";

/** Writes a fake `codegraph` that prints `output` and records each call. Returns {dir, log}. */
export function fakeCodegraph(output = "1.6.4\n") {
  const dir = tmpDir("cdev-bin-");
  const log = path.join(dir, "calls.log");
  const body = `const fs=require("fs");fs.appendFileSync(${JSON.stringify(log)},process.argv.slice(2).join(" ")+"|"+process.env.CODEGRAPH_TELEMETRY+process.env.DO_NOT_TRACK+"\\n");process.stdout.write(${JSON.stringify(output)});\n`;
  if (process.platform === "win32") {
    fs.writeFileSync(path.join(dir, "codegraph.js"), body);
    fs.writeFileSync(path.join(dir, "codegraph.cmd"), `@echo off\r\n"${process.execPath}" "%~dp0codegraph.js" %*\r\n`);
  } else {
    const f = path.join(dir, "codegraph");
    fs.writeFileSync(f, `#!/usr/bin/env node\n${body}`);
    fs.chmodSync(f, 0o755);
  }
  return { dir, log };
}
