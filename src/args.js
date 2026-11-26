import { parseArgs } from "node:util";
import { usage } from "./errors.js";

const OPTIONS = {
  project: { type: "string" },
  profile: { type: "string" },
  "with-codegraph": { type: "boolean" },
  "with-ponytail": { type: "boolean" },
  "verify-command": { type: "string" },
  json: { type: "boolean" },
  "no-exec": { type: "boolean" },
  help: { type: "boolean", short: "h" },
  version: { type: "boolean" },
};

export const COMMANDS = ["preview", "apply", "doctor"];

export function parseCli(argv) {
  let parsed;
  try {
    parsed = parseArgs({ args: argv, options: OPTIONS, allowPositionals: true, strict: true });
  } catch (err) {
    throw usage(err.message, "run with --help to see the options");
  }
  const { values, positionals } = parsed;
  if (values.help || values.version) return { help: !!values.help, version: !!values.version };
  if (positionals.length !== 1) throw usage(positionals.length ? `unexpected arguments: ${positionals.slice(1).join(" ")}` : "a command is required", `use one of: ${COMMANDS.join(", ")}`);
  const command = positionals[0];
  if (!COMMANDS.includes(command)) throw usage(`unknown command: ${command}`, `use one of: ${COMMANDS.join(", ")}`);
  if (!values.project) throw usage("--project is required", "pass --project <path to an existing directory>");
  if (values["no-exec"] && command !== "doctor") throw usage("--no-exec is only valid for doctor", "remove --no-exec");
  if (command === "doctor") {
    for (const k of ["profile", "with-codegraph", "with-ponytail", "verify-command"]) {
      if (values[k] !== undefined) throw usage(`--${k} is not valid for doctor`, "remove it; doctor reads the lock");
    }
  }
  if (command !== "doctor" && !values.profile) {
    // allowed only when a lock exists; plan.js enforces that with the same message
  }
  return {
    command,
    project: values.project,
    profile: values.profile,
    json: !!values.json,
    noExec: !!values["no-exec"],
    flags: {
      withCodegraph: values["with-codegraph"] === true,
      withPonytail: values["with-ponytail"] === true,
      verifyCommand: values["verify-command"],
    },
  };
}
