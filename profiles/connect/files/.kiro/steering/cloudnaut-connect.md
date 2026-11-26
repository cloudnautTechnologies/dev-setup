---
inclusion: auto
name: cloudnaut-connect
description: Guidance for Amazon Connect work. Use when a task involves Amazon Connect, contact flows, queues, routing profiles, hours of operation, or Lambda functions and Lex bots invoked from flows.
---
# Amazon Connect guidance

## Vocabulary and contracts

- A contact flow is a graph of blocks. It may live as an exported JSON file, as infrastructure code, or in the console. Find out which source of truth the project uses before editing.
- Treat flow modules, contact attributes, and Lambda or Lex inputs and outputs as contracts. Check every consumer before renaming or removing one.
- Routing depends on several objects together: the entry point, the flow, the queue, the routing profile, and the hours of operation.

## Working rules

- Never paste real phone numbers, names, transcripts, or recordings into prompts, files, tests, or fixtures. Use fictional values.
- Check the error and fallback branches of every block you touch, not only the main path.
- For a misrouted or dropped contact, use the `connect-flow-troubleshooting` skill.
- For public AWS documentation, use the AWS Knowledge MCP server when it is connected.
