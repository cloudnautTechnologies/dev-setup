# Changelog

All notable changes to this project are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.0]

First release. Not yet tagged or published.

### Added

- Zero-dependency CLI with `preview`, `apply`, and `doctor`.
- Profiles `core`, `aws`, and `connect`, with inclusion declared in `release-manifest.json`.
- Steering, skills, AWS Knowledge MCP entry, and AWS Toolkit recommendation.
- Opt-in verification hook (`--verify-command`), CodeGraph wiring (`--with-codegraph`), and Ponytail adapter (`--with-ponytail`).
- Installable Cloudnaut Connect troubleshooting Power.
- Lock file, three-way upgrades with incoming copies, journaled apply with recovery, and symlink containment.
- Documentation, smoke test, automated tests, and a GitHub Actions matrix for Windows, macOS, and Linux.
