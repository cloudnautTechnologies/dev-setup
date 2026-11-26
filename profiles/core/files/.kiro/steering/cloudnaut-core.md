---
inclusion: always
---
# Cloudnaut working agreements

Applies to every task in this project.

## Before you change code

- Trace the existing implementation first: find the entry point, follow it to the effect, and read the tests around it.
- Reuse this project's conventions, helpers, and libraries before adding new ones.
- Preserve existing behavior unless the task says to change it. Call out any behavior change you make.

## When you finish

- Run the project's own checks and report the exact commands and their results.
- Say which checks you did not run, and why.
- Keep the change small enough to review in one sitting.

## Project-specific guidance

This file is generic. Each project adds its own architecture, entry points,
and verification commands in a steering file such as `.kiro/steering/project.md`.
Start from `docs/cloudnaut/project-steering.example.md` and adapt it.

## Skills

- `trace-code-path`: follow an unfamiliar code path.
- `review-change`: review a change before opening a pull request.

AWS, CDK, and Amazon Connect guidance loads separately when a task is about them.
