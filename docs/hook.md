# Verification hook (opt-in)

The hook runs your project's existing verification command after each spec task, and shows failures to Kiro. It is installed only when you pass `--verify-command`. Opening a repository or saving a file does not trigger it, and it makes no model calls.

## Install

Pass the command your project already uses (`npm test`, `make verify`, `./gradlew check`). Prefer a script name over an inline pipeline.

POSIX shells:

```text
node bin/dev-setup.js apply --project /path/to/project --profile core --verify-command 'npm test'
```

PowerShell (use single quotes outside; use double quotes inside if the command needs them):

```text
node bin/dev-setup.js apply --project C:\work\project --profile core --verify-command 'npm test'
```

cmd.exe:

```text
node bin\dev-setup.js apply --project C:\work\project --profile core --verify-command "npm test"
```

The command must be a single line of 1 to 1000 characters.

## What gets installed

| File | Purpose |
| --- | --- |
| `.kiro/hooks/cloudnaut-verify-after-task.json` | The hook. Version `v1`, one hook, trigger `PostTaskExec`, command action `node .cloudnaut/run-verify.cjs`, timeout 600 seconds. No matcher. |
| `.cloudnaut/run-verify.cjs` | A small dependency-free runner |
| `.cloudnaut/verify-command.json` | `{ "command": "<your command>" }` |

Your command text is only stored as JSON data in `verify-command.json` and in the lock. It is never pasted into the hook file, so quotes, backslashes, `%VAR%`, `$VAR`, and non-ASCII text are safe.

## Why a runner

Kiro sends only stderr to the agent when a hook command exits with a non-zero code. Many test runners print failures to stdout. The runner runs your command in the project root (found from the runner's own location, not the current directory), and on failure writes the command's stdout, then stderr, then one line `verify command failed (exit N): <command>` to stderr and exits non-zero. On success it prints nothing.

- Output is cut to the last 200 lines or 20 KB, with a `... N lines truncated` line first.
- The command runs through the system shell (`cmd.exe` on Windows, per Node's documented behavior), so it must be valid there.
- Output above 64 MiB, a timeout (about 590 seconds), or a command that cannot start is reported as a failure.
- `node` must be on the PATH that Kiro uses to run hooks. `doctor` can only check your shell's PATH.

## Limits

- `PostTaskExec` cannot block a task. The hook reports; it does not stop anything.
- It runs only after spec tasks, not after chat or file saves.
- Kiro's shell for hook commands on Windows is not documented in the pages checked.
- The hook is active as soon as the file exists, which is why the CLI writes it only when you supply a command.

## Secrets warning

`verify-command.json` and `.cloudnaut/dev-setup.lock.json` are committed to Git. Keep tokens and keys out of the command. If the command looks like it contains one, the CLI prints a warning. Set secrets in your environment instead.

## Try it by hand

From the project root:

```text
node .cloudnaut/run-verify.cjs
```

Fictional example, a project whose `package.json` has `"test": "node -e \"process.exit(0)\""`. Applying with `--verify-command 'npm test'` and running the line above prints nothing and exits 0. Change the script to print `1 failing` and exit 1, and the runner prints `1 failing` and `verify command failed (exit 1): npm test` on stderr and exits non-zero. Both cases are tested in `tests/hook.test.js`.

## Change or remove

Run `apply` again with a different `--verify-command`. If you edited `verify-command.json` by hand, the new value is offered as an incoming copy instead of overwriting yours. To remove the hook, revert the configuration commit, or delete the three files and the matching lock entries by hand.
