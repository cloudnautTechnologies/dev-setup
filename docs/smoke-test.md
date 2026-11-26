# Smoke test

A short checklist for a project that has the setup applied. Labels:

- `RAN LOCALLY`: checked in code by `npm run smoke` (or `npm test`) without Kiro. These confirm the files and settings are right, not that Kiro uses them.
- `NEEDS LIVE IDE`: must be checked by a person in a running Kiro IDE. **None of these has been verified.** Record your result and the Kiro build number when you run them.

Run the local part:

```text
npm run smoke
npm run smoke -- --network      # also checks the AWS Knowledge endpoint answers over HTTPS
```

Last local run: 2026-11-26, Node 22.12.0, Linux. All 11 local steps passed, and the `--network` check returned HTTP 200 from the AWS Knowledge endpoint. That shows only that the endpoint is reachable from that machine.

## Steering discovery

| Check | Label | Result |
| --- | --- | --- |
| Steering files exist with valid `inclusion` values (core `always`, AWS/CDK and Connect `auto` with name and description) | RAN LOCALLY (`npm run smoke`, `tests/steering-skills.test.js`) | passed |
| The Steering panel lists `cloudnaut-core`; a prompt about CDK or Amazon Connect pulls in the matching `auto` file | NEEDS LIVE IDE | not verified |

## Skill loading

| Check | Label | Result |
| --- | --- | --- |
| Four skills at `.kiro/skills/<name>/SKILL.md` with `name` equal to the folder and a `description` | RAN LOCALLY (`npm run smoke`) | passed |
| The skills show up in the panel and activate from a matching prompt or `/skill-name` | NEEDS LIVE IDE | not verified |

## AWS Knowledge MCP

| Check | Label | Result |
| --- | --- | --- |
| `.kiro/settings/mcp.json` parses, has `mcpServers.aws-knowledge-mcp` with only `url`, no `autoApprove`, existing servers kept | RAN LOCALLY (`npm run smoke`, `tests/install.test.js`) | passed |
| The endpoint answers over HTTPS | RAN LOCALLY (`npm run smoke -- --network`, optional) | HTTP 200 |
| With MCP support enabled in Kiro settings, the server connects and lists `search_documentation`, `read_documentation`, `list_regions`, `get_regional_availability`, `retrieve_skill`; each tool call asks for approval | NEEDS LIVE IDE | not verified |

## Hook

| Check | Label | Result |
| --- | --- | --- |
| Hook file is v1, one `PostTaskExec` command hook, fixed command, no matcher | RAN LOCALLY (`npm run smoke`, `tests/hook.test.js`) | passed |
| Runner is silent on success, forwards a stdout-only failure to stderr with a non-zero exit, runs in the project root | RAN LOCALLY (`npm run smoke`, `tests/hook.test.js`) | passed |
| Nothing runs when the repository is opened or a file is saved | Follows from the file contents (only `PostTaskExec`); firing behavior NEEDS LIVE IDE | not verified |
| `PostTaskExec` fires after a spec task, in the project root | NEEDS LIVE IDE | not verified |
| Make the verify command fail with stdout-only output (for example `node -e "console.log('SMOKE FAIL'); process.exit(1)"`), finish a spec task, and confirm the agent sees `SMOKE FAIL` | NEEDS LIVE IDE | not verified |

## CodeGraph

| Check | Label | Result |
| --- | --- | --- |
| `--with-codegraph` writes the pinned entry with `--no-telemetry` and the three environment variables, and `.codegraph/` in `.gitignore`; defaults write none of it | RAN LOCALLY (`npm run smoke`, `tests/install.test.js`) | passed |
| `doctor` handles a missing, matching, mismatched, and unparseable `codegraph` (fake binary) | RAN LOCALLY (`tests/doctor.test.js`) | passed |
| Real `codegraph` on this machine | RAN LOCALLY (`npm run smoke` reports availability) | not on PATH; not installed |
| `codegraph version` prints 1.6.4; `codegraph init` and `codegraph status` work | NEEDS LIVE IDE (needs the real program) | not verified |
| The `codegraph` server starts in Kiro and lists its tools, including on Windows where npm installs `codegraph.cmd` | NEEDS LIVE IDE | not verified |

## Power import

| Check | Label | Result |
| --- | --- | --- |
| `plugin.json` follows the published schema constraints, no `mcp.json`, skill copy identical to the source | RAN LOCALLY (`npm run smoke`, `tests/power.test.js`) | passed |
| Powers panel, Add Custom Power, Import power from a folder imports it without errors, and a keyword such as "Amazon Connect contact flow" activates it | NEEDS LIVE IDE | not verified |

## Extension

| Check | Label | Result |
| --- | --- | --- |
| `.vscode/extensions.json` keeps comments and entries and gains `amazonwebservices.aws-toolkit-vscode` | RAN LOCALLY (`tests/install.test.js`, `tests/jsontext.test.js`) | passed |
| Kiro honors `.vscode/extensions.json`; AWS Toolkit installs from Open VSX and signs in with your permitted profile | NEEDS LIVE IDE | not verified |
