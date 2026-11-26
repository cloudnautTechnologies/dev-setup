---
name: trace-code-path
description: Trace an unfamiliar code path from its entry point to its side effects and report it with file references. Use when asked how something works, where a behavior comes from, or before changing code you do not know yet.
---

# Trace a code path

Use this when you need to understand how a request, event, command, or job flows through code you have not read before. The goal is a verified map, not a guess.

## Evidence to inspect

1. Entry point: the route, handler, CLI command, queue consumer, scheduled job, or exported function where the behavior starts. Search for the names that appear in the symptom, the URL, the event type, or the message text.
2. Calls: follow each call one level at a time. Note the file and line for every hop. Stop at library boundaries and say so.
3. Configuration: environment variables, feature flags, dependency-injection wiring, and infrastructure definitions that change which code runs.
4. Side effects: database writes, network calls, files, queues, caches, emitted events, logs.
5. Tests: the tests that already exercise the path, and the fixtures they use.

## Verify

- Confirm each hop by opening the code, not by inferring from names.
- Where the path branches, list every branch and the condition that selects it.
- If a test or a local command can exercise the path safely, run it and compare the result with your map.
- Mark anything you could not confirm as an assumption.

## Report

Return, in this order:

- Entry point with file and line.
- Numbered path with file and line for each hop.
- Branches and the conditions that select them.
- Side effects and external dependencies.
- Tests that cover the path, and gaps.
- Assumptions and anything not verified.
