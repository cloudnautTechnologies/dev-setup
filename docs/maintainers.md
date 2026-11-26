# Maintainer checklist

Items here need a human decision. The implementation does not commit, tag, push, or release.

## Before the first public commit

- [ ] **License.** The repository has no license. Choose one and add `LICENSE`. Then set `license` in `powers/cloudnaut-connect-troubleshooting/plugin.json` and in skill front matter if you want it there, regenerate the manifest, and run `node scripts/sync-power.js`.
- [ ] **Scratch files.** Run `git status`. Do not commit workflow scratch folders such as `.agents/`.
- [ ] **Public-content scrub.** See below.
- [ ] **Pins.** Review CodeGraph 1.6.4 and Ponytail v5.3.3 (below), or leave them labelled as not reviewed.
- [ ] **CI.** Push once and confirm the Windows, macOS, and Linux matrix is green. It has never run on GitHub. Decide whether to pin actions by commit SHA instead of the `@v7` major tags.
- [ ] **Live Kiro checks.** Work through the `NEEDS LIVE IDE` rows in [smoke-test.md](smoke-test.md) and update their results.
- [ ] **Open VSX identifier.** Confirm `amazonwebservices.aws-toolkit-vscode` is still the verified AWS Toolkit listing on Open VSX.

## Public-content checklist

Everything in this repository is public. `node scripts/check-content.js` (part of `npm run check`) catches account IDs, access-key patterns, private-key headers, non-example e-mail addresses, ARNs with real account IDs, and URL hosts that are not on its allowlist. It cannot catch names. Read the diff for:

- client or customer names, project code names, internal hostnames and URLs
- real contact flow exports, phone numbers, transcripts, logs, or customer data
- personal notes or memories copied from Kiro
- credentials, tokens, or AWS profile names

Examples must stay fictional (`orders-service`, `example.com`, account `123456789012`). Adding a link to a new host means adding the host to `ALLOWED_HOSTS` in `scripts/check-content.js` in the same change.

## Reviewing pins

- CodeGraph: read upstream's code or release notes for the pinned tag, confirm what `serve --mcp` can read and send, confirm the telemetry opt-outs behave as documented, then update the "Review status" note in [codegraph.md](codegraph.md). To bump the pin, change `profiles/optional/codegraph/feature.json`, the manifest, the install hint in `src/plan.js`, and the docs.
- Ponytail: follow [ponytail.md](ponytail.md#reviewing-a-new-upstream-revision).

## Release checklist

See [releasing.md](releasing.md), section "For a Cloudnaut maintainer".
