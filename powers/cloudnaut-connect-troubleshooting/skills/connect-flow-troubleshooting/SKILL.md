---
name: connect-flow-troubleshooting
description: Troubleshoot an Amazon Connect contact that is misrouted, dropped, or stuck by following it from entry point through routing, Lambda or Lex dependencies, and fallback paths to disconnect. Use for contact flow, queue, or routing problems.
---

# Troubleshoot an Amazon Connect contact flow

Use this when a contact does not behave as expected: it reaches the wrong queue, loops, is disconnected early, or never gets an answer. Work from files and from facts the developer supplies. Never ask for real customer data. Ask for fictional or redacted examples.

## Evidence to inspect

1. Entry point: the phone number, chat widget, or API call that starts the contact, and the flow it is associated with.
2. Flow definition: the exported flow JSON or infrastructure code. Read blocks in order from the start block, following every transition.
3. Routing: the queue, routing profile, hours of operation, and any queue or agent transfer flows the path reaches.
4. Contact attributes: where each attribute is set, read, and overwritten along the path.
5. Lambda dependencies: the function invoked by each Invoke block, its input mapping, its response keys, its timeout, and its error handling.
6. Lex dependencies: the bot and alias, intents and slots, the confidence handling, and what happens on no match or timeout.
7. Fallback paths: every error, no-match, timeout, and default branch, and the block each one ends in.
8. Logs the developer supplies, with identifiers and personal data redacted. Match them to the blocks above.

## Verify

- Walk the path block by block and write down the transition taken for the reported symptom.
- Confirm that every block has an error or default transition and that none ends in an unintended disconnect.
- Confirm that each Lambda response key and Lex output used later in the flow exists and has the expected type.
- Confirm that hours of operation, time zone, and queue capacity explain or rule out the symptom.
- Check that fallback branches lead to a queue, a message, or a callback, and not back into a loop without an exit.
- Mark each conclusion as confirmed from files or as an assumption that needs a test contact.

## Report

- Symptom in one line, using fictional or redacted values.
- The path followed, block by block, with file references.
- The first block where behavior diverges from what was expected, and why.
- Lambda and Lex findings.
- Fallback gaps.
- Proposed fix and how to test it with a test contact.
- What was not verified.
