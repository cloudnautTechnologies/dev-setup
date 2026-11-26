# Requirements: Cloudnaut Dev Setup v0.1

## Summary

Cloudnaut Dev Setup is a public, versioned setup for Kiro IDE 1.x. A Cloudnaut developer working on an AWS delivery project runs a small Node.js CLI from a tagged checkout of this repository. The CLI previews, then applies, one of three profiles (`core`, `aws`, `connect`) to an existing project. The project maintainer reviews the result in Git, and can later upgrade without losing project-specific edits. Rollback is a Git revert of the configuration commit.

The first release ships:

- a zero-dependency CLI with `preview`, `apply`, and `doctor`;
- brief steering, reusable skills, one opt-in hook, workspace MCP wiring, an extension recommendation, and an installable Power;
- opt-in CodeGraph wiring and an opt-in vendored Ponytail steering adapter;
- documentation for Memory, release/upgrade/rollback, onboarding, and a Kiro smoke test;
- automated tests and a GitHub Actions matrix for Windows, macOS, and Linux.

Implementation stays local. The maintainer performs the first push, tag, and release.

### Assumptions (recorded; design review may challenge them)

- A1. "Target Kiro IDE 1.x" means the docs in `docs/sources.md` (checked 2026-11-25, builds up to 1.4.236). Nothing was verified in a live IDE. Every live-IDE dependency is listed in R19.
- A2. The CLI is run from a checkout of a Git tag of this repository (for example `node bin/dev-setup.js ...`). It is not published to npm in v0.1. Git tags are the release channel.
- A3. Minimum Node.js is 22 (Node 20 is EOL). CI covers 22, 24, 26.
- A4. "Installer" and "CLI" are the same program.
- A5. The repository has no `LICENSE` file. Adding one is a maintainer decision (R21); this spec does not choose a license.
- A6. `.vscode/extensions.json` is a VS Code convention that Kiro does not document. It is used because the request asks for extension recommendations and the editor is a VS Code OSS fork. Kiro honoring it is a live-IDE check.
- A7. The Power is installed by the developer through the Kiro Powers panel. The CLI does not install Powers.
- A8. Profile content is authored by this project. The Ponytail steering file is the only third-party content vendored.

## Functional Requirements and Acceptance Criteria

### R1. Repository layout and distribution

1. The CLI is written in Node.js (>= 22) using only Node built-in modules. `package.json` has no `dependencies` and no `devDependencies`, and no `postinstall`/`preinstall`/`prepare` scripts.
2. The CLI runs on Windows, macOS, and Linux without Bash. No source, script, test, or npm script invokes `bash`, `sh`, `sed`, `awk`, `cp`, `rm`, or similar POSIX tools. Paths are built with `node:path` and stored with `/` in the manifest.
3. All distributed content lives under `profiles/` and `powers/`. This repository's own `.kiro/` directory contains only `.kiro/specs/dev-setup-v0-1/`. The repository contains no `.kiro/steering`, `.kiro/skills`, `.kiro/hooks`, `.kiro/settings`, `.vscode/extensions.json`, or `.codegraph/`. A test fails if any of these exist at the repository root.
4. The repository contains `release-manifest.json`, `README.md`, `CHANGELOG.md`, `docs/sources.md`, and automated tests under `tests/`.
5. `package.json` `version`, `release-manifest.json` `version`, and the top released entry of `CHANGELOG.md` agree. A test enforces this.
6. `.gitattributes` forces LF line endings for text files so Windows checkouts keep hashes stable.

### R2. Profiles and composition

1. Three profiles exist: `core`, `aws`, `connect`.
2. Applying `aws` installs everything in `core` plus `aws`. Applying `connect` installs `core`, `aws`, and `connect`. Inclusion is declared in the manifest, not hard-coded in CLI logic.
3. `--profile` accepts only `core`, `aws`, or `connect`. Any other value exits 1 and lists the valid values.
4. `core` ships: one always-on steering file, the `trace-code-path` and `review-change` skills, and a project steering example.
5. `aws` ships: the AWS Knowledge MCP entry, the AWS Toolkit extension recommendation, one AWS/CDK steering file, and the `review-aws-infra-change` skill.
6. `connect` ships: one Amazon Connect steering file and the `connect-flow-troubleshooting` skill. The installable Power is shipped in `powers/` and documented but not applied by the CLI.
7. The three skills named in the request (trace a code path, review a change, review AWS infrastructure change) and the Connect troubleshooting skill are each usable alone: no skill requires another skill, a steering file, or a path outside its own directory in order to work.

### R3. Content quality and safety of public content

1. Every example in packaged content, docs, and test fixtures is fictional. A content-lint test scans the whole repository (excluding `.git`) and fails on: 12-digit account IDs other than `123456789012` and `000000000000`; strings matching `AKIA[0-9A-Z]{16}` or `ASIA[0-9A-Z]{16}`; PEM private-key headers; e-mail addresses other than `@example.com`; ARNs containing an account ID other than the two above; URLs whose host is not on an allowlist kept in the lint script. The allowlist is data (an exported array) in `scripts/check-content.js`. It contains every host cited anywhere in the repository: `github.com`, `raw.githubusercontent.com`, `open-vsx.org`, `docs.aws.amazon.com`, `kiro.dev`, `knowledge-mcp.global.api.aws`, `agent-plugins.org`, `www.npmjs.com`, `agentskills.io`, `nodejs.org`, and any further host that `docs/` cites. A test extracts every URL host from the repository and asserts each is on the list, so adding a doc link to a new host requires adding it to the list in the same change. The CodeGraph telemetry endpoint is referred to in prose without a URL. The verbatim vendored Ponytail files (`profiles/optional/ponytail/**` except `SOURCE.md`) are exempt from the content lint only while their SHA-256 values equal the pins in R9.2; any other edit to them fails the hash test instead.
2. Packaged content contains no client names, internal URLs, real contact flows, logs, customer data, or personal memories. The lint allowlist and a short maintainer checklist in `docs/maintainers.md` make this reviewable.
3. No packaged file, script, or doc instructs the developer to put AWS credentials, API keys, or tokens into project files. AWS authentication stays in each developer's own environment.
4. The CLI's own code (`preview`, `apply`, `doctor`) never opens a network connection and never requires AWS access or credentials. The only third-party program it may start is the optional `codegraph version` probe in `doctor` (R8.6), which `doctor --no-exec` skips. Tests run the CLI in a child process as `node --import ./tests/helpers/block-network.mjs bin/dev-setup.js <command> ...`. The helper replaces `net.Socket.prototype.connect`, `dns.lookup`, `globalThis.fetch`, and `http.request`/`https.request` with functions that throw `NETWORK_BLOCKED`. The test runs `preview`, `apply`, and `doctor --no-exec` with `AWS_*` variables unset and asserts exit 0 and no `NETWORK_BLOCKED` in the output.

### R4. Steering

1. The always-on core steering file is at most 40 lines (excluding front matter). It tells Kiro to: trace the existing implementation before changing it, reuse project conventions, preserve behavior, and report the checks it ran.
2. The core steering file tells developers how a project adds its own architecture, entry points, and verification commands, and points to `docs/cloudnaut/project-steering.example.md` (installed by `core`).
3. The project steering example is installed outside `.kiro/steering/` so it is not loaded by Kiro. It shows sections for architecture, entry points, verification commands, and conventions, with fictional content. It is not named `product.md`, `tech.md`, or `structure.md`.
4. The AWS/CDK steering file and the Connect steering file use `inclusion: auto` with `name` and `description` set so they load only when relevant. Neither is `always`.
5. Steering files do not repeat step-by-step workflows that live in skills; they link to the skill by name. A test checks that no sentence of 12 or more words appears verbatim in both a steering file and a skill.
6. Every steering file passes a front-matter test: valid `inclusion` value; `auto` requires `name` and `description`.

### R5. Skills

1. Shipped skills: `trace-code-path` and `review-change` (core), `review-aws-infra-change` (aws), `connect-flow-troubleshooting` (connect).
2. Each skill lives at `.kiro/skills/<name>/SKILL.md` in the target. Front matter has `name` equal to the directory name (`[a-z0-9-]`, 1 to 64 chars, no leading, trailing, or consecutive hyphens) and `description` of 1 to 1024 characters that states what the skill does and when to use it. Each `SKILL.md` is under 500 lines. A test enforces all of this.
3. Each skill has three level-2 headings: `Evidence to inspect`, `Verify`, and `Report`.
4. `trace-code-path` covers: locating the entry point, following calls and configuration to the effect, noting side effects and external dependencies, and reporting the path with file references.
5. `review-change` covers a pre-PR review. It is focused on reusing existing code and avoiding unnecessary abstractions, and also covers behavior preservation and the checks that were run. It does not contain Ponytail text and does not depend on Ponytail being installed.
6. `review-aws-infra-change` covers an IaC/CDK diff: resource replacement and data loss risks, IAM scope, network exposure, encryption, logging, cost drivers, rollback, and what `cdk diff` or the equivalent shows. It must work from files in the repository and must not require AWS credentials.
7. `connect-flow-troubleshooting` follows a contact from entry point (phone number, chat widget, or API start) through routing (flow, queue, routing profile, hours), Lambda or Lex dependencies where they exist, and fallback and error paths to disconnect. It states which evidence to inspect (exported flow JSON, IaC, Lambda code, Lex definitions, logs supplied by the developer), what to verify, and what to report, and never asks the developer to paste real customer data.
8. No skill promises a slash command beyond Kiro's documented `/skill-name` behavior.

### R6. MCP (workspace)

1. `aws` writes the official AWS Knowledge MCP server into `.kiro/settings/mcp.json` under `mcpServers.aws-knowledge-mcp` as `{ "url": "https://knowledge-mcp.global.api.aws" }`. No `type`, `headers`, `env`, or `autoApprove` key is written.
2. No file shipped by this repository sets `autoApprove` to `"*"` or to any tool list. A test scans every packaged MCP fragment and the rendered `mcp.json`.
3. No account-level AWS MCP server and no GitHub MCP server is written by any profile or option.
4. The CLI never reads or writes `~/.kiro/settings/mcp.json`.
5. When `mcp.json` exists, apply edits it at the text level (the same scanner as R11.2): every byte outside the inserted or replaced `mcpServers.<name>` property text, and outside the comma and whitespace needed to attach it, is unchanged. Unrelated top-level keys and unrelated `mcpServers` entries keep their exact formatting (compact arrays, inline objects, blank lines, indentation, EOL, BOM). A test uses a fixture with compact arrays and custom spacing and asserts byte equality of everything outside the edit. `mcp.json` must be strict JSON (comments make it `UNPARSEABLE`).

### R7. Hook (opt-in post-spec-task verification)

1. The CLI writes a hook file only when `--verify-command <cmd>` is supplied. Without it, no `.kiro/hooks/` file is created or planned, for any profile.
2. The hook file is `.kiro/hooks/cloudnaut-verify-after-task.json` in Kiro IDE 1.x format: `version: "v1"`, exactly one hook, `trigger: "PostTaskExec"`, `action: { "type": "command", "command": "node .cloudnaut/run-verify.cjs" }` (a fixed string, not the user's command), a `name`, a `description`, `enabled: true`, and a numeric `timeout` of 600. Together with the hook, `--verify-command` installs two more owned files: `.cloudnaut/run-verify.cjs` (a dependency-free CommonJS runner shipped by this setup) and `.cloudnaut/verify-command.json` (`{ "command": "<supplied command>" }`). Decision: a runner is used because Kiro sends only stderr to the agent on a non-zero exit, and common test runners write failures to stdout; the runner guarantees the failure output reaches stderr (R7.7).
3. The hook has no `matcher`, no `agent` action, and no trigger other than `PostTaskExec`. No packaged file defines a hook with `SessionStart`, `UserPromptSubmit`, `PostFileSave`, `PostFileCreate`, `PostFileDelete`, `Stop`, `PreToolUse`, `PostToolUse`, `PreTaskExec`, or an `agent` action. A test enforces this.
4. `--verify-command` is validated: after trimming it is non-empty, at most 1000 characters, and has no CR, LF, or NUL. A violation exits 1 and writes nothing. The plan emits a non-blocking warning when the command matches `(?i)(token|secret|password|passwd|api[_-]?key)\s*=`, `AKIA[0-9A-Z]{16}`, or `ASIA[0-9A-Z]{16}`, stating that the command is stored in `.cloudnaut/verify-command.json` and the lock, which are committed to Git, and that secrets belong in the developer's environment. `docs/hook.md` repeats this.
5. The command string is embedded in `.cloudnaut/verify-command.json` and in the lock using `JSON.stringify`. A test round-trips commands containing double quotes, single quotes, backslashes, `&&`, `%VAR%`, `$VAR`, spaces, and non-ASCII characters and asserts `JSON.parse(file).command === original`, and that the hook file's `action.command` is the fixed string in R7.2 for every input.
6. The CLI does not prepend `cd` or rewrite the user's command. The runner executes it with `child_process.spawnSync(command, { shell: true, cwd: <project root derived from the runner's own location>, encoding: "utf8", timeout: 590000 })`. Docs state that Kiro runs the hook command in the project root, that the runner does not depend on that cwd, that on Windows `shell: true` means `cmd.exe` (Node's documented behavior), that `node` must be on PATH for Kiro, and recommend an existing npm/make/task script name.
7. Runner behavior is tested through `child_process` against a temp project: exit 0 produces no stderr output and exits 0; a non-zero exit writes the command's stdout and stderr (both) to the runner's stderr, then a one-line `verify command failed (exit N): <command>` line, and exits with a non-zero code; a command that times out or cannot spawn exits non-zero with an explanatory stderr line; cwd is the project root even when the runner is started from another directory; a command that writes its failure only to stdout still produces that text on stderr.
8. Docs state that Kiro sends only stderr to the agent on a non-zero hook exit (hence the runner) and that the hook cannot block a task (`PostTaskExec`). `docs/smoke-test.md` has a `NEEDS LIVE IDE` item that deliberately makes the verify command fail with stdout-only output and checks that the agent sees the text.
9. A working example is in `docs/hook.md` (fictional project) with POSIX, PowerShell, and `cmd.exe` invocation lines for `--verify-command`.

### R8. CodeGraph (opt-in)

1. `--with-codegraph` is the only way CodeGraph content is planned. Default plans contain no CodeGraph entry and no `.codegraph/` ignore line. A test asserts this for all three profiles.
2. With `--with-codegraph`, the CLI adds `mcpServers.codegraph` to `.kiro/settings/mcp.json` with `command: "codegraph"`, `args: ["serve", "--mcp", "--no-telemetry"]`, and `env` containing `CODEGRAPH_TELEMETRY=0`, `DO_NOT_TRACK=1`, `CODEGRAPH_NO_UPDATE_CHECK=1`. It adds no `autoApprove`. Because the entry is enabled but the server does not exist until the developer installs it, `preview` and `apply` print a non-blocking warning: `install @colbymchenry/codegraph@1.6.4 (npm install -g), then run codegraph init; the codegraph MCP server fails to start until then`. The CLI may also scan `PATH` without executing anything and, if `codegraph` is found, say so instead of the install hint; it never runs it outside `doctor` (R8.6).
3. The pinned version is `1.6.4` (git tag `v1.6.4`, commit `461a5d87a873a4932997cd9a49042ab30e45a675`, npm integrity recorded in `docs/codegraph.md` and the manifest). The entry never uses `npx`, never uses `-y`, and never uses an unpinned install command. A lint test scans only `profiles/`, `powers/`, `src/`, `scripts/`, `.github/`, and `package.json` and asserts none of `npx`, ` -y`, `install.sh`, `install.ps1`, `curl`, `iwr` appears there (the lint script itself keeps these tokens as built strings so it does not match itself). `docs/` and `README.md` are not scanned. A separate test asserts that `docs/codegraph.md` contains the exact text `do not use npx`.
4. `--with-codegraph` also appends the line `.codegraph/` to the project `.gitignore` (creating it if missing). Without the flag, `.gitignore` is not touched.
5. `docs/codegraph.md` documents: installing the pinned version with `npm install -g @colbymchenry/codegraph@1.6.4`, verifying with `codegraph version`, initializing with `codegraph init`, verifying with `codegraph status`, the `.codegraph/` ignore, the telemetry opt-out layers (argument, environment, stored `codegraph telemetry off`), the separate update-check opt-out, and the fact that the version is the latest at check time and has not been code-reviewed by Cloudnaut (maintainer decision to call it "reviewed").
6. The CLI never downloads, installs, or initializes CodeGraph, never runs upstream's interactive installer, and never edits any agent configuration other than the target project's `.kiro/settings/mcp.json`. `doctor` may run exactly one external program, `codegraph version`, with a fixed argument list, no shell where the resolved path is an executable, a 5 s timeout, and the environment `CODEGRAPH_TELEMETRY=0`, `DO_NOT_TRACK=1`, `CODEGRAPH_NO_UPDATE_CHECK=1`. This happens only when the lock records CodeGraph, and `doctor --no-exec` skips it (the finding is then `OPTIONAL_MISSING` `CODEGRAPH_VERSION_SKIPPED`, listed as skipped). Parse rule: the version is the first match of `\d+\.\d+\.\d+` in stdout; if no match, the finding is `OPTIONAL_MISSING` `CODEGRAPH_VERSION_UNKNOWN`, never BROKEN. The output format and offline behavior of `codegraph version` are unverified (see `docs/sources.md`).
7. `doctor` reports CodeGraph prerequisites only when the lock records the option: `codegraph` on PATH, version equals the pin, `.codegraph/` index present. Each missing item is an optional-prerequisite finding, not a broken-config error.
8. Windows risk: npm installs `codegraph.cmd`, and whether Kiro's MCP launcher resolves a `.cmd` shim for `command: "codegraph"` without a shell is unverified. `docs/codegraph.md` states this as an unverified Windows risk (symptom: the `codegraph` server fails to start in Kiro's MCP panel while `codegraph version` works in a terminal; the developer reports it to the maintainer, and the maintainer decides on a documented workaround in a later release), and `docs/smoke-test.md` lists it as `NEEDS LIVE IDE`.


### R9. Ponytail (opt-in)

1. `--with-ponytail` is the only way Ponytail content is planned. Default plans contain none.
2. With the flag, the CLI installs the upstream Kiro adapter verbatim at `.kiro/steering/ponytail.md`, vendored from upstream tag `v5.3.3` (commit `7801d061243d7b753bad0e0b3c057cd250b11755`, raw-file SHA-256 `bbd1c60ea71dac352cc46f47476a9b8a75793af5a31f9df93c92a944dc7b0bbd`), and installs upstream's MIT `LICENSE` (SHA-256 `fb1bc6909ac3ef82d5c22106e32ef682b0cff66788fa915fb9b53b15c9d2f3ab`) and a `SOURCE.md` (upstream URL, tag, commit, hashes, date fetched) at `.cloudnaut/third-party/ponytail/`. The repository holds the same files under `profiles/optional/ponytail/` plus a repo-level `THIRD_PARTY_NOTICES.md`.
3. A test asserts the vendored steering file and LICENSE match the recorded SHA-256 values after line-ending normalization.
4. `docs/ponytail.md` states that Kiro runs the adapter in instruction-only mode (always-on steering, no slash commands, no hooks), that it adds always-on context to every prompt, that it overlaps with `review-change`, and that Cloudnaut makes no promise of `/ponytail` commands. It documents the manual alternative (copy the file from the pinned revision) and how to review a new upstream revision before bumping the pin.

### R10. Power

1. `powers/cloudnaut-connect-troubleshooting/` contains `plugin.json` (Agent Plugins format) and `skills/connect-flow-troubleshooting/SKILL.md` (plus any `references/` the skill has). It contains no `mcp.json`, no `POWER.md`, and no second AWS Knowledge MCP server.
2. `plugin.json` has `$schema` set to `https://agent-plugins.org/schemas/1.0.0/plugin.schema.json`, `name` equal to the directory name, `version` equal to the release version, `description`, `author`, `keywords`, `homepage`, `repository`, and no key outside the published schema. `license` is omitted until the maintainer decides (R21). A test validates these constraints offline.
3. The skill text has a single source: `profiles/connect/files/.kiro/skills/connect-flow-troubleshooting/`. The Power copy is generated by `node scripts/sync-power.js` and committed. A test fails if the two directory trees are not byte-identical (after LF normalization). `node scripts/sync-power.js --check` exits non-zero on drift.
4. The skill is self-contained (R5.7), so it works unchanged inside the Power.
5. `docs/power.md` documents local-folder installation (Powers panel, Add Custom Power, Import power from a folder), an activation check (mention a manifest keyword in a chat and confirm the skill is available), update by re-importing a newer tag, and that having both the workspace skill and the Power installed is redundant.

### R11. Extensions

1. `aws` recommends `amazonwebservices.aws-toolkit-vscode` by adding it to `recommendations` in `.vscode/extensions.json`. Verified Open VSX identity is recorded in `docs/sources.md`. No language-specific extension is added by any profile.
2. If `.vscode/extensions.json` exists, apply preserves every existing byte except the inserted entry, including comments, trailing commas, indentation, line endings, BOM, and unrelated keys. If the ID is already present, nothing changes and the entry is recorded as not owned (`preexisting`). Insertion rules (each has a byte-exact test): (a) the new element is placed after the last existing element and its comma is inserted immediately after that element's token (not after a trailing comment); (b) in a multi-line array the new element goes on a new line after the physical line that holds the last element, including any trailing `//` or `/* */` comment on that line, so the comment stays attached to its element; (c) standalone comments between the last element and `]` stay after the new element; (d) in a single-line non-empty array (`["a", "b"]`) the text `, "<id>"` is inserted before `]`, keeping the line style; (e) an existing trailing comma style is kept; (f) the new element uses the indentation of the last element.
3. If the file does not exist, it is created. If the file cannot be parsed by the JSONC scanner, or `recommendations` is not an array of strings, preflight reports a collision and nothing is written. If the ID is in `unwantedRecommendations` and the lock has no entry for the extension (first install, or an extension newly added by a later release), preflight reports a collision (the developer declined it). If the lock already owns the extension, the ID in `unwantedRecommendations` is a supported opt-out: the item is `keep-local` with the INFO `DECLINED_LOCALLY`, nothing is written or restored, and it is not a collision. `docs/releasing.md` documents both supported opt-outs: moving the extension ID to `unwantedRecommendations`, and setting `"disabled": true` on `mcpServers.aws-knowledge-mcp` (a local edit preserved as `keep-local`). Upgrade tests cover both.
4. `docs/extensions.md` documents installing AWS Toolkit from the Kiro Extensions view (Open VSX is Kiro's default marketplace), verifying the install, and verifying sign-in with the developer's own permitted AWS profile. It states that Kiro's handling of `.vscode/extensions.json` and any `kiro --install-extension` command are unverified and must not be treated as supported.

### R12. Memory (documentation only)

1. `docs/memory.md` documents: where to find Memories (activity bar), the four levels and the default (`Don't use`), that it is a user-level setting that a workspace value cannot change, how to inspect records in the Memories view, and that on-disk storage location is not documented in the pages checked.
2. `docs/memory.md` shows how to promote a team-relevant finding into reviewed project steering, project docs, or an ADR, including a template and a short fictional worked example.
3. The CLI reads, writes, and plans nothing related to Memory. A test asserts that no plan target is outside the allowlist in R13.9, and that the source tree does not reference Kiro Memory storage paths.

### R13. Installer: commands and plan

1. Commands: `preview`, `apply`, `doctor`. Syntax: `node bin/dev-setup.js <command> --project <path> [--profile <name>] [--with-codegraph] [--with-ponytail] [--verify-command <cmd>] [--json]` (`doctor` also accepts `--no-exec`, R8.6). `--help` and `--version` exist. Unknown commands or flags exit 1.
2. `preview` and `apply` require both `--project` and `--profile`, except that on a project that already has a lock, `--profile` may be omitted and defaults to the locked profile. `doctor` requires `--project` only. Missing required arguments exit 1.
3. `--project` must be an existing directory. Relative paths are resolved against the current directory. Anything else exits 1.
4. `preview` computes the plan, prints each file and settings entry that would be created, updated, adopted, kept, restored, or removed (with kind and reason), and writes nothing: no file, no directory, no temp file, no `.cloudnaut/` content. A test hashes the whole project tree before and after.
5. `apply` builds the plan with the same function used by `preview` and executes exactly that plan. A test asserts that the plan printed by `preview --json` equals the plan embedded in `apply --json` for the same inputs, and that the written results match `resultHash` values in the plan.
6. If anything changes between planning and writing (a target's hash differs from the planned `localHash`), `apply` aborts before the first rename with exit 2 and writes nothing permanent.
7. `apply` writes `.cloudnaut/dev-setup.lock.json` (R14) as the last step.
8. Options are sticky: on a project with a lock, omitted `--with-*` flags and `--verify-command` reuse the locked options. A supplied `--verify-command` replaces the locked one. Options cannot be removed in v0.1; the documented way to remove a feature is to revert the configuration commit.
9. The only paths the CLI may plan to write are: `.kiro/steering/`, `.kiro/skills/`, `.kiro/hooks/`, `.kiro/settings/mcp.json`, `.vscode/extensions.json`, `.gitignore`, `docs/cloudnaut/`, and `.cloudnaut/` inside the target project. A test fails on anything else.
10. Output is human-readable by default and machine-readable with `--json`. Results go to stdout and errors go to stderr.

### R14. Local record (lock file)

1. `.cloudnaut/dev-setup.lock.json` records: schema version, tool name, installed version, profile, options (CodeGraph, Ponytail, verify command), every owned file with `sha256` of normalized content, every owned JSON/JSONC/line entry with `sha256`, and unresolved incoming copies. (The verify command is stored in the lock and in `.cloudnaut/verify-command.json`; both are committed, see R7.4.) It contains no absolute paths, timestamps, user names, or machine identifiers.
2. Content hashes are SHA-256 over content with CRLF normalized to LF. JSON entries hash a canonical JSON serialization (sorted keys, no whitespace). A test shows that a CRLF copy of an unchanged file is not reported as a local edit.
3. Ownership means: files created by the CLI, JSON entries added by the CLI, the extension ID added by the CLI, the `.gitignore` line added by the CLI. Files or entries that existed before and were identical are recorded with `adopted: true`. Pre-existing extension IDs and `.gitignore` lines are recorded with `preexisting: true` and are not owned.
4. The lock file is stable: re-serializing it without semantic change yields identical bytes (sorted entries, 2-space indent, LF, trailing newline).
5. A lock with an unknown `schemaVersion` or invalid structure makes `apply` and `preview` exit 6 with a message, and makes `doctor` report broken config.

### R15. Collisions and preflight

1. Before any write, the CLI evaluates every planned action. A collision is any of: an existing non-owned file at a target path with different content; an existing `mcpServers.<name>` entry with the same name but a different value that is not owned; `mcp.json` or `extensions.json` that does not parse; an extension ID declined in `unwantedRecommendations` that the lock does not already own (R11.3); an existing non-owned hook file at the hook path; a path where a directory exists but a file is needed (or the reverse).
2. Identical pre-existing content is adopted, not a collision.
3. If any collision exists, `preview` prints all of them and exits 2, `apply` prints all of them, writes nothing, and exits 2. A test hashes the tree before and after for each collision type.
4. Collision messages name the path (and JSON pointer when relevant), what was found, and one concrete way to resolve it.

### R16. Upgrade and local edits

1. On a project with a lock, the CLI compares three hashes per owned item: `base` (lock), `local` (current project content), `incoming` (new release content), and applies this table:

| local vs base | incoming vs base | local vs incoming | Action |
| --- | --- | --- | --- |
| same | same | same | `unchanged` |
| same | differs | n/a | `update` (write incoming, update lock) |
| differs | same | n/a | `keep-local` (no write; report as locally modified, info) |
| differs | differs | same | `adopt` (no write; update lock hash) |
| differs | differs | differs | `keep-local` + incoming copy + review item (conflict) |
| missing | any | n/a | `restore` (write incoming; report) |

2. For a conflict, the local file is never modified. The incoming content is written to `.cloudnaut/incoming/<target-path>` for whole files, and to `.cloudnaut/incoming/<target-path>.<entry-name>.json` for JSON entries (for example `.cloudnaut/incoming/.kiro/settings/mcp.json.aws-knowledge-mcp.json`). Entry names are restricted to `[A-Za-z0-9._-]` by the manifest generator, so the path is portable on Windows (no `#` or `/` from JSON pointers). The lock records the unresolved item, and the summary lists it. Apply exits 0. Decision: a copy under `.cloudnaut/incoming/` rather than a `.new` file beside the original, because Kiro could load a sibling in `.kiro/steering/` or `.kiro/skills/`.
3. The lock keeps the old base hash for unresolved items, so the item keeps being reported until the local content equals the incoming content (`adopt`), the developer deletes the local file or entry and re-applies (`restore`), or a later release's content equals the base again (`update`). Every one of `adopt`, `restore`, and `update` deletes the incoming copy and removes the `unresolved` lock entry; each path has a test. Incoming copies are never created for extension IDs or `.gitignore` lines.
4. A file that was in the previous release and is absent from the new one is removed only if local equals base. Otherwise it is kept, dropped from ownership, and reported.
5. Re-applying an older version than the lock records exits 2 with a message that downgrade is done by reverting the commit.
6. A profile can widen (`core` to `aws` to `connect`). Narrowing exits 2 with the same revert guidance.
7. Edits to shared files made by the project (other `mcpServers` entries, other extension recommendations, other `.gitignore` lines) are never reported as conflicts and are never modified.

### R17. Idempotency and interruption

1. Running `apply` twice with the same version, profile, and options changes no file on the second run: no content change, no mtime change, no lock rewrite. A test hashes content and compares `mtimeMs` of all files.
2. `apply` uses a write-ahead journal `.cloudnaut/journal.json` with an explicit `state` of `staging`, `applying`, or `committed`. Every directory, temp file, and backup is recorded in the journal before it is created. `apply` stages each new or changed file as a temp file in the target file's own directory, switches to `applying`, replaces targets with atomic renames, writes the lock as the final rename, switches the journal to `committed` (atomic rewrite), and only then removes temp leftovers, backups, and the journal. Shared-file edits are written once per file.
3. If the process is interrupted at any step, the next `apply` recovers first. State `committed` means clean-up only; state `staging` or `applying` (or an unreadable journal) means roll back using the journal and backups, remove every temp file, backup, and directory the journal or the defined scan scope identifies, delete the journal, and then re-plan and apply from scratch. Commit state is never inferred from file contents, so a restore-only run whose lock bytes do not change is still rolled back correctly. A rollback never deletes or overwrites content that differs from what the interrupted run would have written or backed up.
4. `preview` on a project with a pending journal prints a recovery notice, writes nothing, and exits 5. `doctor` reports it as broken config (exit 4).
5. A fault-injection test simulates a failure at each stage (after journal creation, inside staging at each `during-stage:<i>` checkpoint, after staging, after each rename index, before lock write, after lock write, after the `committed` marker, before journal removal), including a restore-only run in which the lock bytes do not change, and asserts: the project is either unchanged from before or fully applied, no temp files remain after the next apply, and the final tree equals a clean apply.
6. Two concurrent applies cannot both proceed: journal creation is exclusive and the journal carries an owner record `{ pid, hostname, startedAt }` (transient, never committed). When `apply` finds a journal: if the owner is on the same host and `process.kill(pid, 0)` shows the process alive, it exits 5 without modifying anything; if the owner is dead, or the journal is unreadable and older than 60 s, it recovers; if the host differs or the journal is unreadable and younger than 60 s, it exits 5 and prints the manual steps. Recovery claims the journal by an atomic rename to `.cloudnaut/journal.recovering.json` so two recoverers cannot both proceed. Tests cover a live owner (the loser changes nothing and the winner finishes) and a dead owner (recovery runs).
7. `preview` and `doctor` treat any pending journal as exit 5 / BROKEN respectively; they never recover and never write.

### R18. Safety: paths, symlinks, home directory

1. All target paths are resolved against the real path of the project root. If any target, or any existing ancestor of a target, resolves through a symlink to a location outside the real project root, the CLI refuses with exit 3 before writing anything. Symlinks that resolve inside the project are followed and the real path is written.
2. The CLI refuses (exit 3) when the project root is the user's home directory, or is inside `~/.kiro`.
3. The CLI never reads or writes `~/.kiro`, AWS config and credentials files, personal memory, or global editor settings. A test sets `HOME`/`USERPROFILE` to a temp directory and asserts nothing in it is created or modified, and that the project tree and the redirected home tree are byte-identical to their pre-run state apart from the planned writes. "Not accessed" is enforced structurally, since file access cannot be observed: a source-scan test asserts that `src/`, `bin/`, and `scripts/` contain none of `.aws`, `AWS_`, `.kiro` as a home-relative path, or `os.homedir`/`homedir(` outside `src/paths.js`, and that `paths.js` uses the home directory only to refuse it as a project path.
4. Symlink tests run where the OS allows symlink creation; on Windows without the privilege they are skipped with a visible reason and covered by a path-containment unit test that uses synthetic resolved paths.
5. `.cloudnaut/` temp files, journal, backups, and incoming copies are all created inside the project root only.

### R19. Verification, CI, and smoke test

1. Automated tests (Node built-in `node:test`) cover: initial install, repeat apply, profile composition, upgrade, local-modification conflict, collisions, preview side-effect freedom, optional-feature absence by default, preservation of unrelated config, interrupted-apply recovery, symlink refusal, JSONC edit, hook rendering, content lint, skill/steering/plugin validation, manifest and Power sync checks, `doctor` output categories, and Windows path handling.
2. Tests use a fixture project `tests/fixtures/existing-project/` with an existing `.kiro/settings/mcp.json` (unrelated servers), `.vscode/extensions.json` (comments and trailing commas), and `.kiro/steering/` (a project steering file). The fixture is fictional (R3).
3. `.github/workflows/test.yml` runs on `push` and `pull_request`, with matrix `os: [ubuntu-latest, windows-latest, macos-latest]` and `node: [22, 24, 26]`, `permissions: contents: read`, and runs `npm test` and `npm run check`.
4. `docs/smoke-test.md` is a short checklist covering: steering discovery, skill loading, AWS Knowledge MCP, the hook, CodeGraph, and Power import. Each line is labelled either `RAN LOCALLY` (with the command) or `NEEDS LIVE IDE`. Live-IDE lines include the deliberately failing stdout-only verify command (R7.8) and the Windows `codegraph.cmd` launch (R8.8). `scripts/smoke-local.js` automates the locally runnable lines (apply into a temp project, validate generated files, execute the hook command, report CodeGraph availability) and an optional `--network` reachability check for the Knowledge MCP endpoint that is off by default.
5. `docs/sources.md` is kept up to date and continues to distinguish "checked in docs/code" from "needs a live Kiro IDE (NOT verified)".

### R20. Doctor

1. `doctor --project <path>` checks the installed setup and groups findings into: `OK`, `INFO` (for example locally modified owned files), `OPTIONAL MISSING` (missing optional prerequisites), and `BROKEN` (broken configuration).
2. `BROKEN` findings: no lock or an invalid lock; pending journal; owned file missing; `mcp.json` or `extensions.json` unparseable; an owned MCP entry missing or its server key malformed; any `autoApprove` of `"*"` on an owned entry; a hook file of ours that is not valid v1 `PostTaskExec` command form with `action.command` equal to `node .cloudnaut/run-verify.cjs`, or a missing or unparseable `.cloudnaut/run-verify.cjs` or `.cloudnaut/verify-command.json` when the lock records a verify command; a symlink escape in any owned path; temp files left behind; the lock's version newer than the running tool.
3. `OPTIONAL MISSING` findings (never affect exit code): `git` not on PATH, `codegraph` missing or at a different version, and `.codegraph/` index not initialized (the last two only when `--with-codegraph` is locked). `doctor` does not check AWS credentials or any AWS access.
4. `INFO`/warnings (do not affect exit code): locally modified owned files, unresolved incoming copies, and a newer tool version than the lock (suggest preview of upgrade).
5. Exit 0 when there are no `BROKEN` findings, else exit 4. Missing optional prerequisites alone produce exit 0.
6. `doctor` writes nothing. `doctor --no-exec` starts no external program (R8.6); without it, `doctor` runs only the `codegraph version` probe, and only when the lock records CodeGraph.

### R21. Release process, docs, and maintainer decisions

1. `docs/releasing.md` documents: releases are Git tags (`vMAJOR.MINOR.PATCH`); selecting a release (`git fetch --tags`, `git checkout vX.Y.Z` in the Cloudnaut checkout, not in the project); previewing an upgrade; creating a project branch; applying; reviewing the diff (including `.cloudnaut/incoming/`); committing for review; and rollback by reverting that commit. It states that automatic updates and fleet management are out of v0.1.
2. `README.md` has quick start, command reference, exit codes, profile table, option table, and links to every doc. `docs/onboarding.md` walks a new developer from clone to first `doctor`. `docs/maintainers.md` holds the release checklist and the public-content checklist.
3. `CHANGELOG.md` has an `Unreleased` section and a `0.1.0` entry in Keep a Changelog style.
4. The repository has no license. The spec does not add `LICENSE`. The final report flags it as a maintainer decision before the first public commit. `plugin.json` and skill front matter carry no `license` field until the decision is made.
5. The final report lists: changed files; commands and test results; items needing maintainer review (license; CodeGraph 1.6.4 review; Ponytail v5.3.3 review; actions pinned by major tag; hook shell on Windows; all live-IDE checks); and which checks were done in code versus a live IDE.
6. Nothing is committed, pushed, or tagged by the implementation.

## Non-Functional Requirements

- NFR1 Portability: no Bash, no native modules, tested on Windows, macOS, Linux.
- NFR2 Determinism: the same inputs produce identical plans, identical files, and an identical lock.
- NFR3 Reviewability: every change the CLI makes is a plain text diff in the project; no binary files; no generated timestamps.
- NFR4 Footprint: apply writes only the files in the plan, and the largest possible plan (profile `connect` with every option), computed by the test from the release manifest, touches fewer than 25 targets.
- NFR5 Performance: preview/apply/doctor on a fixture complete in under 5 seconds on CI runners.
- NFR6 Error messages: every failure names the cause, the path, and the next step. Stack traces are shown only with `DEBUG=cloudnaut`.

## Out of Scope

- Account-level AWS tools, AWS MCP Server (Agent Toolkit), GitHub MCP.
- Automatic updates, fleet management, a package-registry release (npm), telemetry.
- Installing or modifying anything in `~/.kiro`, AWS profiles, Kiro Memory, global editor settings, or other agents' configuration.
- Installing the Power from the CLI, installing extensions from the CLI, installing CodeGraph.
- Language-specific extension recommendations.
- Uninstall command (rollback is Git revert), profile narrowing, option removal.
- Creating `LICENSE`, committing, pushing, tagging, releasing.
