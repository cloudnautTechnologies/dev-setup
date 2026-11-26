# Ponytail (opt-in)

Ponytail is a third-party steering adapter that pushes the agent toward the smallest complete change. It is optional and off by default.

- Upstream: https://github.com/DietrichGebert/ponytail (MIT)
- Pinned revision: tag `v5.3.3`, commit `7801d061243d7b753bad0e0b3c057cd250b11755`
- Vendored files: `.kiro/steering/ponytail.md` (SHA-256 `bbd1c60ea71dac352cc46f47476a9b8a75793af5a31f9df93c92a944dc7b0bbd`) and upstream's `LICENSE`, plus a `SOURCE.md` that records where they came from. See [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md).

**Review status.** v5.3.3 was the latest tag when this was written. It has not been reviewed by Cloudnaut beyond confirming the license and the file hashes.

## Enable

```text
node bin/dev-setup.js apply --project /path/to/project --profile core --with-ponytail
```

This installs three files and records them in the lock:

- `.kiro/steering/ponytail.md`
- `.cloudnaut/third-party/ponytail/LICENSE`
- `.cloudnaut/third-party/ponytail/SOURCE.md`

The MIT license requires the copyright and permission notice to travel with copies. The LICENSE file is installed so it does.

## How Kiro treats it

Upstream's Kiro adapter is one steering file with `inclusion: always`. Kiro runs it in instruction-only mode:

- It adds always-on text to every prompt, so it costs context in every session.
- There are no slash commands and no hooks on Kiro. Do not expect `/ponytail` or any command from other hosts. Cloudnaut makes no such promise.
- It overlaps with the `review-change` skill, which focuses on reuse and unnecessary abstractions. That skill is independent and works with or without Ponytail.

Whether the file loads and changes agent behavior in the IDE is not verified. See [smoke-test.md](smoke-test.md).

## Manual alternative

Skip the option and copy `.kiro/steering/ponytail.md` from the pinned upstream tag into your project yourself, with its `LICENSE`. Upstream also describes a global install into `~/.kiro/steering/`. This setup never touches that folder.

## Reviewing a new upstream revision

1. Read upstream's diff between the pinned tag and the new tag. Look at the steering text, the license, and anything that changes agent behavior.
2. Check that the license is still compatible with redistribution here.
3. Download the two files from the new tag, byte for byte, and save them with LF line endings.
4. Update the pins: `profiles/optional/ponytail/feature.json`, `SOURCE.md`, `THIRD_PARTY_NOTICES.md`, the hash constants in `tests/content-lint.test.js`, and the values in this document.
5. Run `node scripts/generate-manifest.js`, `npm test`, and `npm run check`.
6. Note the bump in `CHANGELOG.md`.

Vendored files are exempt from the content lint only while their hashes match the pins. Do not edit them by hand.
