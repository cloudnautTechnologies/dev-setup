---
name: review-change
description: Review a code change before a pull request, focused on reusing existing code and avoiding unnecessary abstractions, while checking behavior is preserved and checks were run. Use before opening or updating a PR.
---

# Review a change before the PR

Use this on your own diff, or on a branch you were asked to look at. The central question is whether the change reuses what the repository already has, and whether each new abstraction earns its place.

## Evidence to inspect

1. The full diff against the base branch, including tests, configuration, and generated files.
2. For every new function, class, module, option, or dependency: search the repository for an existing equivalent and note what you found.
3. For every new abstraction (interface, base class, wrapper, factory, config switch): count the places that use it today.
4. Callers and consumers of any changed signature, schema, or message format.
5. The tests added or changed, and the tests that should have changed but did not.

## Verify

- An abstraction with fewer than two present uses should be inlined unless a requirement names it.
- A new helper that duplicates an existing one should be replaced by the existing one.
- A new dependency needs a reason that the standard library or existing dependencies cannot meet.
- Behavior outside the stated task is unchanged. Compare old and new behavior for the edge cases the diff touches.
- Run the project's own checks (tests, linters, type checks, build). Record each command and result.

## Report

- Summary of the change in two or three lines.
- Reuse findings: what was reused, what duplicates existing code, with file references.
- Abstractions kept, and the uses that justify them. Abstractions to remove.
- Behavior changes, intended and unintended.
- Checks run with results, and checks not run with the reason.
- Verdict: ready, ready after listed fixes, or not ready.
