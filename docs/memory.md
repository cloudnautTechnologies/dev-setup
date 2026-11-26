# Kiro Memory

Kiro Memory is a user-level feature. This setup does not read, write, or plan anything about it. The CLI contains no Memory paths, and no profile changes your Memory settings.

## Find and configure it

- Memories view: the Memories icon in the activity bar.
- Level: in IDE 1.4.236 or later, use the gear in the Memories view title bar. Earlier builds use the setting `Kiro Agent: Memory`.
- Levels (names from IDE 1.4.215): Use and create automatically, Use and create when asked, Use but don't create, and Don't use. The default is Don't use. Older builds named them Use and learn, Use but don't learn, Use only, and Off.
- It is a user setting. A value in a workspace has no effect, so a project cannot turn Memory on for you.

Source: https://kiro.dev/docs/memory/, checked 2026-11-25. Not verified in a live IDE.

## Inspect what Kiro remembered

Open the Memories view and read the records it lists. The pages checked do not say where records are stored on disk or how to export or delete them. Use the controls in the view, and do not look for files to edit by hand.

## Promote a finding to the team

A personal memory is not a team decision. Move findings that other people need into reviewed project files:

| If the finding is | Put it in |
| --- | --- |
| A rule Kiro should follow in every task | Project steering, for example `.kiro/steering/project.md` |
| A repeatable how-to or reference for developers | Project docs |
| A design decision with reasons and trade-offs | An ADR |

Steps:

1. Rewrite the finding as a general statement. Remove names, ticket numbers, and anything personal.
2. Check that it is still true by reading the code.
3. Put it in one of the places above on a branch.
4. Open a pull request and get it reviewed like code.
5. If you no longer need the personal memory, remove it in the Memories view.

### Template

```text
Finding: <one sentence>
Evidence: <file paths, commands, or docs that show it is true>
Applies to: <area of the project>
Promote to: steering | docs | ADR
Reviewer: <person>
```

### ADR template

```text
# ADR-NNN: <decision>

Status: proposed | accepted | superseded by ADR-NNN
Date: YYYY-MM-DD

## Context
What forces led to this decision?

## Decision
What was decided?

## Consequences
What gets easier, what gets harder, what to revisit?
```

### Worked example (fictional)

Kiro keeps remembering that the `orders-service` tests fail unless the local queue emulator is running.

```text
Finding: Integration tests for orders-service need the local queue emulator.
Evidence: tests/integration/setup.ts connects to localhost:9324; npm run test:integration fails without it.
Applies to: orders-service tests
Promote to: steering
Reviewer: a teammate
```

The result is one line in `.kiro/steering/project.md` under Verification commands: "Start the queue emulator with `npm run emulator` before `npm run test:integration`." A reviewer confirms it in the pull request. If the team also chose the emulator over a hosted queue for cost and isolation, that reasoning goes in an ADR, and the steering line stays short.
