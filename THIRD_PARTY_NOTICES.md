# Third-party notices

## Ponytail

The opt-in `--with-ponytail` option installs files copied byte for byte from upstream.

- Project: https://github.com/DietrichGebert/ponytail
- Tag: v5.3.3, commit `7801d061243d7b753bad0e0b3c057cd250b11755`
- License: MIT, Copyright (c) 2026 DietrichGebert. The upstream license text is kept at `profiles/optional/ponytail/files/.cloudnaut/third-party/ponytail/LICENSE` and is installed next to the steering file.

| Upstream file | Packaged at | SHA-256 |
| --- | --- | --- |
| `.kiro/steering/ponytail.md` | `profiles/optional/ponytail/files/.kiro/steering/ponytail.md` | `bbd1c60ea71dac352cc46f47476a9b8a75793af5a31f9df93c92a944dc7b0bbd` |
| `LICENSE` | `profiles/optional/ponytail/files/.cloudnaut/third-party/ponytail/LICENSE` | `fb1bc6909ac3ef82d5c22106e32ef682b0cff66788fa915fb9b53b15c9d2f3ab` |

A test fails if either file changes.

## CodeGraph

CodeGraph is not vendored. The opt-in wiring only points Kiro at a `codegraph` program that you install yourself. Upstream: https://github.com/colbymchenry/codegraph (MIT license). Pinned version: 1.6.4.
