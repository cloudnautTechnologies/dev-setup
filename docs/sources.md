# Sources and verification record

This file records which upstream documents and code the Cloudnaut Dev Setup relies on, what was
verified in each, and what is still unverified.

- Date checked: 2026-11-25 (all rows, unless noted).
- Target: Kiro IDE 1.x. Docs referenced Kiro IDE builds up to 1.4.236.
- Method: pages fetched and read, plus public registry and GitHub API calls. Content is paraphrased.
- **No behavior in this file was verified in a running Kiro IDE.** Everything listed under
  "Checked in docs/code" was read from documentation, manifests, or source. Everything under
  "Needs a live Kiro IDE (NOT verified)" must be confirmed by a person with the IDE. The same
  items are repeated as a checklist in the smoke test.

## Labels

- **Checked in docs/code**: confirmed by reading official docs, package metadata, or upstream source.
- **Needs a live Kiro IDE (NOT verified)**: depends on IDE behavior that was not observed.

## Kiro

| URL | Checked | Checked in docs/code | Needs a live Kiro IDE (NOT verified) |
| --- | --- | --- | --- |
| https://kiro.dev/docs/steering/ | 2026-11-25 | Workspace steering lives in `.kiro/steering/`. Front matter `inclusion` takes `always`, `fileMatch` (with `fileMatchPattern`, string or array), `manual`, or `auto` (requires `name` and `description`). Manual and auto files also appear as slash commands. `#[[file:path]]` live references are supported. `AGENTS.md` in the workspace root or subfolders is always included. Workspace steering wins over global on conflict. | That a file with each mode is discovered and loaded as described. Whether `auto` matching picks up our Connect guidance. |
| https://kiro.dev/docs/skills/ | 2026-11-25 | Workspace skills live in `.kiro/skills/<name>/SKILL.md`. Front matter: `name` (must match folder, lowercase, digits, hyphens, max 64) and `description` (max 1024) are required. `license`, `compatibility`, `metadata` are optional. Optional `references/`, `scripts/`, `assets/`. Skills activate by description match or as `/name` slash commands. | That each shipped skill appears in the Steering and Skills panel and activates from a matching prompt. |
| https://agentskills.io/specification | 2026-11-25 | Open standard behind Kiro skills: same required fields, no consecutive hyphens, name must match the parent directory, description 1 to 1024 chars, keep SKILL.md under 500 lines. | Nothing beyond Kiro's own loading behavior. |
| https://kiro.dev/docs/hooks/ | 2026-11-25 | Hooks are standalone JSON in `.kiro/hooks/*.json`. Schema: `version: "v1"`, `hooks[]` with `name`, `trigger`, optional `matcher`, `description`, `timeout` (seconds, default 60, 0 disables), `enabled`, and `action` of `{type: "command", command}` or `{type: "agent", prompt}`. Command actions run in the project root and get session JSON on stdin. Exit 0 adds stdout to agent context. Any other exit sends stderr to the agent as an error. | That a hook file is picked up on session start, that the command's working directory is the project root, and how a failing command is shown to the user. |
| https://kiro.dev/docs/ide/whats-new-v1/hooks/ | 2026-11-25 | Trigger table for IDE 1.0. The post-task trigger is `PostTaskExec` ("after a spec task finishes", cannot block). `PreTaskExec` can block. Other triggers: `SessionStart`, `Stop`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PostFileCreate`, `PostFileSave`, `PostFileDelete`. Exit code 2 blocks only for blockable triggers. | That `PostTaskExec` fires after each spec task in the IDE. The exact stdin payload for `PostTaskExec` is not documented in the pages read. |
| https://kiro.dev/docs/hooks/types/ | 2026-11-25 | Trigger availability by surface: Pre and Post Task Execution are IDE and CLI V3. Post Task Execution is described as running tests or linting after a task completes. | Same as above. |
| https://kiro.dev/docs/mcp/configuration/ | 2026-11-25 | Workspace file is `.kiro/settings/mcp.json`, user file is `~/.kiro/settings/mcp.json`; workspace overrides user for the same server name. Top-level key `mcpServers`. Stdio server: `command`, `args`, `env`, `disabled`, `autoApprove`, `disabledTools`. Remote server: `url` (HTTPS), `headers`, `env`, `oauth`, `disabled`, `autoApprove`, `disabledTools`. `autoApprove` accepts `"*"`. `${VAR}` expansion only for env vars the user approves. Saving the file reloads servers. | That the server connects, its tools list, and the approval prompt appears for each tool when `autoApprove` is absent. |
| https://kiro.dev/docs/powers/ and https://kiro.dev/docs/powers/create/ | 2026-11-25 | Powers follow the Agent Plugins format. Required manifest is `plugin.json` at the power root. Optional `skills/<name>/SKILL.md` and `mcp.json`. Manifest fields: `$schema`, `name`, `version`, `description`, `author`, `keywords`, `homepage`, `repository`, `license`. Keywords drive activation. | That keywords from our manifest activate the power. |
| https://kiro.dev/docs/powers/installation/ | 2026-11-25 | Install from a local folder: Powers panel, Add Custom Power, Import power from a folder, pick a directory containing `plugin.json` or `POWER.md`. `POWER.md` is the legacy format and is still accepted. Metadata shown in the panel comes from `plugin.json` when present (IDE 1.4.26 or later). | That our power imports without errors and shows its metadata and bundled skill. |
| https://agent-plugins.org/schemas/1.0.0/plugin.schema.json | 2026-11-25 | JSON Schema for `plugin.json`: required `$schema` (fixed const) and `name` (lowercase kebab-like, max 64); `additionalProperties: false`, so unknown top-level keys are invalid. Optional `extensions` object for client-specific data. | Whether Kiro rejects manifests with extra keys. |
| https://kiro.dev/docs/specs/ and https://kiro.dev/docs/specs/quick-spec/ | 2026-11-25 | A spec produces `requirements.md`, `design.md`, `tasks.md`, saved under `.kiro/specs/`. Quick Spec generates all three in one pass with no approval gates. Docs do not state the per-spec folder layout explicitly. | The exact folder name Kiro uses for a spec (expected `.kiro/specs/<spec-name>/`). |
| https://kiro.dev/docs/memory/ | 2026-11-25 | Memory is configured in the Memories view (activity bar) through the gear menu. Four levels: Use and create automatically, Use and create when asked, Use but don't create, Don't use (default). It is a user setting; a workspace value has no effect. Stored memory location is not stated in the page read. | Where memory records are stored on disk, and how to view or delete a record. The docs page read does not cover this. |
| https://kiro.dev/docs/ide/editor/extension-registry/ | 2026-11-25 | Kiro IDE uses https://open-vsx.org as its default extension marketplace. Organizations can override it with a policy (`ExtensionGalleryServiceUrl`). | That the Extensions view in the IDE finds AWS Toolkit on Open VSX. |
| https://code.visualstudio.com/docs/configure/extensions/extension-marketplace | 2026-11-25 | Workspace recommendations are `.vscode/extensions.json` with a `recommendations` array of `publisher.extension` IDs. VS Code prompts when a workspace opens. VS Code's file is JSONC in practice. | **Kiro was not found documenting `.vscode/extensions.json`.** It is a VS Code OSS fork, so the file is expected to work, but that is unverified. Also unverified: whether Kiro prompts, and whether a `kiro --install-extension` CLI exists. |

## AWS

| URL | Checked | Checked in docs/code | Needs a live Kiro IDE (NOT verified) |
| --- | --- | --- | --- |
| https://github.com/awslabs/mcp/blob/main/src/aws-knowledge-mcp-server/README.md | 2026-11-25 | Official AWS Knowledge MCP server is a managed remote server at `https://knowledge-mcp.global.api.aws`, Streamable HTTP, no authentication, rate limited, no AWS account needed. Tools: `search_documentation`, `read_documentation`, `list_regions`, `get_regional_availability`, `retrieve_skill`. The README's Kiro example uses `url`, `type: "http"`, `disabled`. Its one-click Kiro link passes only `{"url": "https://knowledge-mcp.global.api.aws"}`. | That Kiro connects and lists the five tools. Whether `type` is accepted or ignored by Kiro (the Kiro MCP docs do not list `type` for remote servers). |
| https://docs.aws.amazon.com/agent-toolkit/latest/userguide/mcp-server.html | 2026-11-25 | A separate "AWS MCP Server" (Agent Toolkit for AWS) also exists. Doc search works unauthenticated; API calls need IAM credentials. This is out of v0.1 scope (account-level tools). | Not applicable. |
| https://open-vsx.org/api/amazonwebservices/aws-toolkit-vscode | 2026-11-25 | Identifier `amazonwebservices.aws-toolkit-vscode`, display name AWS Toolkit, namespace `amazonwebservices`, **verified: true**, latest 4.20.0 (2026-11-19), license Apache-2.0, repository github.com/aws/aws-toolkit-vscode, engines `vscode ^1.83.0`. | That it installs in the current Kiro build, and that sign-in works with the developer's own profile. Kiro-specific sign-in steps are not documented in the pages read. |

## CodeGraph

| URL | Checked | Checked in docs/code | Needs a live Kiro IDE (NOT verified) |
| --- | --- | --- | --- |
| https://github.com/colbymchenry/codegraph (releases, tags) and https://registry.npmjs.org/@colbymchenry/codegraph | 2026-11-25 | Upstream repo `colbymchenry/codegraph`, MIT. npm package `@colbymchenry/codegraph`. Latest release **1.6.4**, published 2026-11-20, tag `v1.6.4` at commit `461a5d87a873a4932997cd9a49042ab30e45a675`. npm tarball integrity: `sha512-Vn4rKe3wTDi8jV3Ni3nUtCX17X3y+hv5rBGkOrO1dtE9ICj3eByVbHM/A9CmR68Cjl8QiGRoOhn7phnS1hyjZg==`. Several forks with near-identical names exist; only the upstream above is referenced. | Nothing about the IDE. Note: this version is the latest at check time, not independently code-reviewed. A maintainer must review it before it is treated as "reviewed". |
| https://github.com/colbymchenry/codegraph/blob/main/site/src/content/docs/getting-started/installation.md | 2026-11-25 | Install: `npm install -g @colbymchenry/codegraph` (also a shell and PowerShell installer). The interactive installer edits agent configs, so Cloudnaut documents manual setup instead. `codegraph init` creates `.codegraph/` and builds the index. `codegraph install` does not index. | Not applicable. |
| https://github.com/colbymchenry/codegraph/blob/main/site/src/content/docs/reference/integrations.md | 2026-11-25 | Kiro project config is `.kiro/settings/mcp.json`. Manual entry uses `command: "codegraph"`, `args: ["serve", "--mcp"]`. | That Kiro starts the server and lists CodeGraph tools. |
| https://github.com/colbymchenry/codegraph/blob/main/site/src/content/docs/reference/cli.md | 2026-11-25 | `codegraph init [path]`, `codegraph status [path] [--json] [--strict]`, `codegraph version`, `codegraph telemetry [on\|off]`. `.codegraph/` contains its own `.gitignore`; `codegraph init --local-only` makes it ignore itself. | Not applicable. |
| https://github.com/colbymchenry/codegraph/blob/main/TELEMETRY.md | 2026-11-25 | Opt-out: `--no-telemetry` argument on `serve --mcp`, or `CODEGRAPH_TELEMETRY=0`, or `DO_NOT_TRACK=1`, or `codegraph telemetry off` (stored). The MCP server also checks GitHub for a newer release once a day; `CODEGRAPH_NO_UPDATE_CHECK=1` or `DO_NOT_TRACK=1` disables that. | Not applicable. |

## Ponytail

| URL | Checked | Checked in docs/code | Needs a live Kiro IDE (NOT verified) |
| --- | --- | --- | --- |
| https://github.com/DietrichGebert/ponytail | 2026-11-25 | Upstream repo, MIT license (file `LICENSE`, "Copyright (c) 2026 DietrichGebert"). Latest tag/release `v5.3.3` (2026-10-29) at commit `7801d061243d7b753bad0e0b3c057cd250b11755`. Default branch `main` head was `ebd8654c2c627f721eb8f9c0d1bd4090a29f9e10` at check time. | Not applicable. |
| https://github.com/DietrichGebert/ponytail/blob/main/INSTALL.md and `.kiro/steering/ponytail.md` | 2026-11-25 | Kiro adapter is one steering file, `.kiro/steering/ponytail.md`, `inclusion: always`. Upstream says to copy it to `~/.kiro/steering/` or a project's `.kiro/steering/`. The file is identical at tag `v5.3.3` and at `main` head (same blob SHA). Upstream issue #466 states Kiro runs in instruction-only mode: no slash commands or hooks. | That the steering file loads with `inclusion: always` and changes agent behavior. |

## CI and runtime

| URL | Checked | Checked in docs/code | Needs a live Kiro IDE (NOT verified) |
| --- | --- | --- | --- |
| https://github.com/nodejs/Release (`schedule.json`) and https://nodejs.org/dist/index.json | 2026-11-25 | Node 26 is Active LTS since 2026-10-28 (EOL 2029-04-30). Node 24 entered Maintenance 2026-10-20 (EOL 2028-04-30). Node 22 is Maintenance (EOL 2027-04-30). Node 20 reached EOL 2026-04-30. | Not applicable. |
| https://github.com/actions/checkout and https://github.com/actions/setup-node (releases, tags) | 2026-11-25 | Latest `actions/checkout` is `v7.0.1` (major tag `v7`). Latest `actions/setup-node` is `v7.1.0` (major tag `v7`). | The Actions matrix has not been run on GitHub; it needs a first push to confirm. |

## Not verified at all

- Any behavior in a running Kiro IDE (steering, skills, hook execution, MCP connection, power import, extension install, memory view).
- Hook stdin payload shape for `PostTaskExec`.
- Whether Kiro honors `.vscode/extensions.json` and its JSONC comments.
- Where Kiro Memory stores records.
- CodeGraph 1.6.4 has not been code-reviewed by Cloudnaut.

## Where each kind of check lives

- Checked in code (this repository's tests, no IDE): file formats, schemas as documented above, installer behavior, the hook runner, and the Power layout. Run `npm test`, `npm run check`, and `npm run smoke`.
- Needs a live Kiro IDE (NOT verified): everything listed in the right-hand column above, repeated as a checklist with results in [smoke-test.md](smoke-test.md).
