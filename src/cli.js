import { executePlan } from "./apply.js";
import { parseCli } from "./args.js";
import { doctor } from "./doctor.js";
import { SetupError } from "./errors.js";
import { EXIT } from "./exit-codes.js";
import { allManifestTargets, loadRelease } from "./manifest.js";
import { resolveProject } from "./paths.js";
import { buildPlan } from "./plan.js";
import { canRecover, describeOwner, inspectJournal, recover } from "./recover.js";
import { jsonPlan, renderDoctor, renderPlan } from "./report.js";

const HELP = `Cloudnaut dev-setup

Usage:
  node bin/dev-setup.js preview --project <path> --profile <core|aws|connect> [options]
  node bin/dev-setup.js apply   --project <path> --profile <core|aws|connect> [options]
  node bin/dev-setup.js doctor  --project <path> [--json] [--no-exec]

Options for preview and apply:
  --with-codegraph          add the opt-in CodeGraph MCP entry and .gitignore line
  --with-ponytail           add the opt-in vendored Ponytail steering adapter
  --verify-command <cmd>    install the opt-in post-task verification hook for <cmd>
  --json                    machine-readable output

Other:
  --no-exec                 doctor only: do not start any external program
  --help, --version

Exit codes: 0 ok, 1 usage, 2 collision or refused, 3 unsafe path, 4 doctor found broken config, 5 recovery pending, 6 internal.
`;

export async function main(argv, io) {
  const out = (s) => io.stdout.write(s);
  const err = (s) => io.stderr.write(s);
  try {
    const args = parseCli(argv);
    const release = io.release ?? loadRelease();
    if (args.help) {
      out(HELP);
      return EXIT.OK;
    }
    if (args.version) {
      out(`${release.manifest.version}\n`);
      return EXIT.OK;
    }
    const project = resolveProject(args.project, io.cwd);
    const env = io.env ?? process.env;
    const targets = allManifestTargets(release.manifest);

    if (args.command === "doctor") {
      const result = doctor({ project, release, env, noExec: args.noExec });
      out(args.json ? `${JSON.stringify(result, null, 2)}\n` : renderDoctor(result));
      return result.summary.broken > 0 ? EXIT.DOCTOR_BROKEN : EXIT.OK;
    }

    const planArgs = { project, release, profile: args.profile, flags: args.flags, env };
    let plan = buildPlan(planArgs);
    if (plan.recovery) {
      const info = inspectJournal(project);
      if (args.command === "preview" || !canRecover(info)) {
        err(`error[RECOVERY_PENDING]: ${describeOwner(info)}\n  fix: ${args.command === "preview" ? "run apply to recover (preview never recovers)" : "wait for the other apply, or remove .cloudnaut/journal.json by hand after checking nothing is running"}\n`);
        return EXIT.RECOVERY;
      }
      const r = recover(project, info, targets);
      err(`recovered an interrupted apply (${r.outcome})\n`);
      for (const w of r.warnings) err(`warning: ${w}\n`);
      plan = buildPlan(planArgs);
    }

    if (args.command === "preview") {
      out(args.json ? jsonPlan(plan) : renderPlan(plan, { mode: "preview" }));
      return plan.collisions.length ? EXIT.COLLISION : EXIT.OK;
    }

    if (plan.collisions.length) {
      out(args.json ? jsonPlan(plan) : renderPlan(plan, { mode: "apply" }));
      return EXIT.COLLISION;
    }
    const result = executePlan(plan, targets);
    out(args.json ? jsonPlan(plan, result) : renderPlan(plan, { mode: "apply", result }));
    return EXIT.OK;
  } catch (e) {
    if (e instanceof SetupError) {
      err(`error[${e.kind}]: ${e.message}\n`);
      if (e.details?.fix) err(`  fix: ${e.details.fix}\n`);
      if (e.details?.collisions) for (const c of e.details.collisions) err(`  [${c.code}] ${c.target}: ${c.message}\n`);
      if (process.env.DEBUG === "cloudnaut") err(`${e.stack}\n`);
      return e.exitCode;
    }
    err(`error[INTERNAL]: ${e.message}\n  fix: re-run with DEBUG=cloudnaut for details\n`);
    if (process.env.DEBUG === "cloudnaut") err(`${e.stack}\n`);
    return EXIT.INTERNAL;
  }
}
