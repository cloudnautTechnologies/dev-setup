<!--
Example project steering. Copy this file to `.kiro/steering/project.md`,
replace the fictional orders-service content with your project's facts,
and add `inclusion: always` front matter if it should apply to every task.
Kiro loads files from `.kiro/steering/`; this copy under `docs/` is not loaded.
-->

# orders-service (fictional example)

## Architecture

- A REST API receives order requests and writes them to a relational database.
- A background worker reads the `order-events` queue and updates fulfilment status.
- Shared validation lives in `src/common/validation`. Reuse it instead of writing new validators.

## Entry points

- HTTP handlers: `src/api/handlers/*.ts`, routed in `src/api/routes.ts`.
- Worker: `src/worker/main.ts`.
- Scheduled cleanup job: `src/jobs/cleanup.ts`.

## Verification commands

- Unit tests: `npm test`
- Type check: `npm run typecheck`
- Lint: `npm run lint`
- Infrastructure diff: `npm run cdk -- diff`

## Conventions

- Errors are returned as typed results, not thrown, in `src/api`.
- Database access goes through `src/db/repositories`. No SQL in handlers.
- New environment variables are declared in `src/config.ts` with a default or a startup failure.

## Do not touch

- `src/generated/`: produced by the schema build step.
- `migrations/`: add new files, never edit applied ones.
