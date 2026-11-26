# Cloudnaut Connect troubleshooting Power

`powers/cloudnaut-connect-troubleshooting/` is an installable Kiro Power. It packages the `connect-flow-troubleshooting` skill, which follows an Amazon Connect contact from entry point through routing, Lambda or Lex dependencies, and fallback paths.

The Power ships a `plugin.json` manifest (Agent Plugins format) and the skill. It ships no `mcp.json`, so it does not add a second AWS Knowledge MCP server. The `aws` profile already configures that server for the project.

The CLI does not install Powers. You import the folder in Kiro.

## Install from a local folder

1. Check out the release tag of this repository.
2. In Kiro, open the Powers panel.
3. Choose Add Custom Power, then Import power from a folder.
4. Select `powers/cloudnaut-connect-troubleshooting`, the folder that contains `plugin.json`.

## Activation check

1. In the Powers panel, confirm `cloudnaut-connect-troubleshooting` is listed with its description.
2. Start a chat and use one of the manifest keywords in a prompt, for example: "My Amazon Connect contact flow sends callers to the wrong queue. Use contact flow troubleshooting."
3. Confirm Kiro activates the Power or offers the `connect-flow-troubleshooting` skill.

Keyword matching drives activation. How it behaves in your IDE build is not verified here.

## Update

Check out a newer tag and import the folder again, or use Check for updates on the Power if it was imported from a GitHub URL.

## One source for the skill text

The canonical skill is `profiles/connect/files/.kiro/skills/connect-flow-troubleshooting/`. The Power's copy is generated:

```text
node scripts/sync-power.js          # copy
node scripts/sync-power.js --check  # fail if the copy has drifted
```

`npm run check` and `tests/power.test.js` fail when the copy differs. Edit the profile copy, then sync.

## Installing both

The `connect` profile already installs the same skill into your project. Having both the workspace skill and the Power is redundant but harmless. Use the Power when you want the skill available outside a configured project.
