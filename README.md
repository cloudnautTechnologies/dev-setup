# Cloudnaut Dev Setup

Cloudnaut's public, versioned setup for Kiro IDE 1.x. You apply a profile to an existing project, review the result in Git, and upgrade later without losing project-specific configuration.

- Zero-dependency Node.js CLI (Node 22 or newer). Works on Windows, macOS, and Linux without Bash.
- Packaged content lives under `profiles/` and `powers/`. Opening this repository does not activate any of it.
- The CLI never needs AWS access, never touches `~/.kiro`, AWS profiles, Kiro Memory, or global editor settings, and only writes inside the project you name.
- Releases are Git tags. There are no automatic updates and no fleet management in v0.1.

License: TBD by the maintainers. The repository has no license file yet.

## Quick start

Run these from a checkout of a release tag of this repository (see [docs/releasing.md](docs/releasing.md)).

```text
node bin/dev-setup.js preview --project /path/to/your-project --profile aws
node bin/dev-setup.js apply   --project /path/to/your-project --profile aws
node bin/dev-setup.js doctor  --project /path/to/your-project
```

`preview` prints what would change and writes nothing. `apply` executes exactly that plan. `doctor` checks the result. Then review with `git status` and `git diff` in your project and commit on a branch.

## Profiles

| Profile | Includes | Adds |
| --- | --- | --- |
| `core` | | Short always-on Cloudnaut steering, skills `trace-code-path` and `review-change`, and a project steering example at `docs/cloudnaut/project-steering.example.md` |
| `aws` | `core` | AWS Knowledge MCP entry, AWS Toolkit recommendation, AWS/CDK steering (loads when relevant), skill `review-aws-infra-change` |
| `connect` | `core`, `aws` | Amazon Connect steering (loads when relevant), skill `connect-flow-troubleshooting` |

The installable Power `powers/cloudnaut-connect-troubleshooting/` is not applied by the CLI. See [docs/power.md](docs/power.md).

## Options (all off by default)

| Option | Effect |
| --- | --- |
| `--with-codegraph` | Adds the pinned CodeGraph MCP entry (telemetry off) and a `.codegraph/` line in `.gitignore`. You install CodeGraph yourself. [docs/codegraph.md](docs/codegraph.md) |
| `--with-ponytail` | Adds the vendored upstream Ponytail steering adapter at a pinned revision. [docs/ponytail.md](docs/ponytail.md) |
| `--verify-command <cmd>` | Adds an opt-in post-spec-task hook that runs your project's existing verification command. [docs/hook.md](docs/hook.md) |
| `--json` | Machine-readable output |
| `--no-exec` | `doctor` only: start no external program |

Options are sticky: they are recorded in the lock and reused on upgrades. Omit `--profile` on a project that already has a lock to reuse the locked profile.

## Commands

```text
node bin/dev-setup.js preview --project <path> --profile <core|aws|connect> [options]
node bin/dev-setup.js apply   --project <path> --profile <core|aws|connect> [options]
node bin/dev-setup.js doctor  --project <path> [--json] [--no-exec]
node bin/dev-setup.js --help | --version
```

Exit codes: `0` ok, `1` usage, `2` collision or refused (downgrade, narrowing), `3` unsafe path (symlink escape, home directory, `~/.kiro`), `4` doctor found broken config, `5` recovery pending or another apply running, `6` internal error, bad lock, or corrupt checkout.

## What apply does

- Computes one plan, then executes that plan. Preflight reports every collision (an unmanaged file at a target path, a conflicting MCP server name, unparseable JSON) before anything is written.
- Edits shared files (`.kiro/settings/mcp.json`, `.vscode/extensions.json`, `.gitignore`) at the text level, so unrelated entries, comments, trailing commas, line endings, and formatting stay as they were.
- Writes `.cloudnaut/dev-setup.lock.json` last. It records the version, profile, options, owned files and entries, and content hashes (line endings normalized).
- On upgrade, compares the previous install, your files, and the new release. Local edits are kept. When both sides changed, the new content goes to `.cloudnaut/incoming/` for review.
- A repeat apply at the same version changes nothing. An interrupted apply is rolled back on the next run.

## Documentation

- [Releasing, upgrading, and rollback](docs/releasing.md)
- [Onboarding a developer](docs/onboarding.md)
- [Verification hook](docs/hook.md)
- [CodeGraph](docs/codegraph.md)
- [Ponytail](docs/ponytail.md)
- [Cloudnaut Connect Power](docs/power.md)
- [Extensions and AWS Toolkit sign-in](docs/extensions.md)
- [Kiro Memory and promoting findings](docs/memory.md)
- [Smoke test](docs/smoke-test.md)
- [Maintainer checklist](docs/maintainers.md)
- [Sources and verification record](docs/sources.md)
- [Third-party notices](THIRD_PARTY_NOTICES.md), [Changelog](CHANGELOG.md)

## Development

```text
npm test          # node:test suite
npm run check     # manifest, Power copy, and content lint
npm run smoke     # locally runnable smoke checks
```

After changing anything under `profiles/`, run `node scripts/generate-manifest.js`. After changing the Connect skill, run `node scripts/sync-power.js`.
