import { usage } from "./errors.js";

export const HOOK_COMMAND = "node .cloudnaut/run-verify.cjs";

export function validateVerifyCommand(cmd) {
  if (typeof cmd !== "string") throw usage("--verify-command needs a value", "pass your project's existing verification command");
  const c = cmd.trim();
  if (c.length === 0 || c.length > 1000) throw usage("--verify-command must be 1 to 1000 characters", "use a short existing script such as 'npm test'");
  if (/[\r\n\0]/.test(c)) throw usage("--verify-command must not contain line breaks or NUL", "use one line, or wrap the steps in a project script");
  return c;
}

export function renderVerifyCommand(cmd) {
  return `${JSON.stringify({ command: cmd }, null, 2)}\n`;
}

const SECRET_RES = [
  /(token|secret|password|passwd|api[_-]?key)\s*=/i,
  new RegExp(["AK", "IA[0-9A-Z]{16}"].join("")),
  new RegExp(["AS", "IA[0-9A-Z]{16}"].join("")),
];

export function verifyWarnings(cmd) {
  const out = [];
  if (SECRET_RES.some((r) => r.test(cmd))) {
    out.push({
      code: "VERIFY_COMMAND_SECRET",
      message:
        "the verify command looks like it contains a secret. It is stored in .cloudnaut/verify-command.json and the lock, which are committed to Git. Keep secrets in your environment.",
    });
  }
  if (/[|><`%]|\$\(/.test(cmd)) {
    out.push({
      code: "VERIFY_COMMAND_SHELL",
      message: "the verify command uses shell syntax (| > < ` $( %) that behaves differently on Windows (cmd.exe) and POSIX shells. Prefer an existing script name.",
    });
  }
  return out;
}

/** Returns an error string when the hook file is not our expected shape, else null. */
export function validateHookFile(text) {
  let h;
  try {
    h = JSON.parse(text);
  } catch (err) {
    return `not valid JSON: ${err.message}`;
  }
  if (!h || h.version !== "v1") return 'version must be "v1"';
  if (!Array.isArray(h.hooks) || h.hooks.length !== 1) return "expected exactly one hook";
  const hook = h.hooks[0];
  if (hook.trigger !== "PostTaskExec") return "trigger must be PostTaskExec";
  if (!hook.action || hook.action.type !== "command" || hook.action.command !== HOOK_COMMAND) return `action must be the command "${HOOK_COMMAND}"`;
  if ("matcher" in hook) return "matcher is not allowed";
  return null;
}
