# CodeGraph (opt-in)

CodeGraph builds a local code index that Kiro can query through MCP. It is optional and off by default. The setup only wires Kiro to a `codegraph` program that you install yourself. The CLI never downloads, installs, or initializes CodeGraph and never edits any other agent's configuration.

- Upstream: https://github.com/colbymchenry/codegraph (MIT)
- npm package: `@colbymchenry/codegraph`, https://www.npmjs.com/package/@colbymchenry/codegraph
- Pinned version: **1.6.4**, git tag `v1.6.4`, commit `461a5d87a873a4932997cd9a49042ab30e45a675`
- npm integrity: `sha512-Vn4rKe3wTDi8jV3Ni3nUtCX17X3y+hv5rBGkOrO1dtE9ICj3eByVbHM/A9CmR68Cjl8QiGRoOhn7phnS1hyjZg==`

**Review status.** 1.6.4 was the latest release when this was written. It has not been code-reviewed by Cloudnaut. A maintainer must review it before anyone calls the pin "reviewed".

## Enable

```text
node bin/dev-setup.js apply --project /path/to/project --profile aws --with-codegraph
```

This adds to `.kiro/settings/mcp.json`:

```json
"codegraph": {
  "command": "codegraph",
  "args": ["serve", "--mcp", "--no-telemetry"],
  "env": {
    "CODEGRAPH_TELEMETRY": "0",
    "DO_NOT_TRACK": "1",
    "CODEGRAPH_NO_UPDATE_CHECK": "1"
  }
}
```

It also appends `.codegraph/` to the project's `.gitignore`, creating the file if needed. There is no `autoApprove`, so Kiro asks before each tool call. The server fails to start until you install CodeGraph, and `apply` warns you about that.

## Install the pinned version

Install exactly 1.6.4 with npm, globally:

```text
npm install -g @colbymchenry/codegraph@1.6.4
codegraph version
```

`codegraph version` should print 1.6.4. Its exact output format was not verified, so `doctor` takes the first `x.y.z` number it finds.

Please do not use npx, and do not run upstream's shell or PowerShell installer scripts. Upstream's interactive installer edits the configuration of other agents, which this setup avoids on purpose. An unpinned install also gets whatever version is newest.

## Initialize, verify, ignore

From the project root:

```text
codegraph init
codegraph status
```

`codegraph init` creates `.codegraph/` and builds the index. `codegraph status` reports whether the index is finished and current (`--strict` exits 1 when it is not). After upgrading CodeGraph, run `codegraph index`.

Keep the index out of Git. `--with-codegraph` adds `.codegraph/` to `.gitignore`. Upstream also writes a `.gitignore` inside `.codegraph/`. If you do not use the option, add the line yourself. To remove the index, run `codegraph uninit`.

## Telemetry and update checks

Four layers, any one is enough, and this setup uses the first two:

1. The `--no-telemetry` argument on `serve --mcp`.
2. The environment variables above (`CODEGRAPH_TELEMETRY=0`, and `DO_NOT_TRACK=1`, which also disables the update check).
3. Upstream's stored setting: `codegraph telemetry off`. Check it with `codegraph telemetry status`.
4. Update checks are separate. `CODEGRAPH_NO_UPDATE_CHECK=1` turns off the daily check for a newer release.

A CodeGraph server that is already running without these settings keeps its own settings until it exits. Upstream keeps a machine identifier in your home directory. This setup never reads or changes it.

## What doctor checks

When the lock records CodeGraph, `doctor` looks for `codegraph` on PATH without running it, then runs `codegraph version` once (fixed arguments, 5 second timeout, telemetry and update checks disabled) and compares it to the pin. It also checks for `.codegraph/`. All of these are optional prerequisites and never make `doctor` fail. Use `doctor --no-exec` to start no program at all.

## Unverified Windows risk

On Windows, npm installs `codegraph.cmd`. Whether Kiro's MCP launcher can start a `.cmd` shim from `"command": "codegraph"` without a shell is not verified. Symptom: the `codegraph` server fails to start in Kiro's MCP view while `codegraph version` works in a terminal. If that happens, tell the maintainers. They decide on a documented workaround in a later release. Do not work around it by switching to npx.

## Slow file systems

For slow file systems such as WSL2 `/mnt` paths, upstream offers `--no-watch` for the MCP server. That changes the entry and is not part of this setup.
