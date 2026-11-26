# Releasing, upgrading, and rollback

Releases are Git tags named `vMAJOR.MINOR.PATCH` on this repository. There is no package registry release, no automatic update, and no fleet management in v0.1.

## For a project maintainer: apply a release

Work in two places. The Cloudnaut checkout holds the tool. Your project holds the result.

1. Select a release in the Cloudnaut checkout, not in your project:

   ```text
   cd /path/to/dev-setup
   git fetch --tags
   git checkout v0.1.0
   ```

2. Preview. This writes nothing:

   ```text
   node bin/dev-setup.js preview --project /path/to/your-project --profile aws
   ```

   For an upgrade, omit `--profile` to reuse the locked one. The preview lists each file and setting with `create`, `update`, `adopt`, `restore`, `remove`, `keep-local`, or `unchanged`, plus collisions, review items, and warnings.

3. Create a branch in your project:

   ```text
   cd /path/to/your-project
   git switch -c chore/cloudnaut-dev-setup-0.1.0
   ```

4. Apply from the Cloudnaut checkout:

   ```text
   node bin/dev-setup.js apply --project /path/to/your-project --profile aws
   ```

5. Review in your project: `git status`, `git diff`, and anything under `.cloudnaut/incoming/` (see below).

6. Run `node bin/dev-setup.js doctor --project /path/to/your-project`, then commit and open a pull request:

   ```text
   git add -A .kiro .cloudnaut .vscode docs/cloudnaut .gitignore
   git commit -m "chore: apply Cloudnaut dev setup 0.1.0"
   ```

   Stage only files the setup changed. `git status` shows them.

If the preview reports collisions, nothing was written. Fix each one as the message says and run again.

## Upgrades and local edits

The lock file records what was installed. On upgrade, each owned item is compared three ways: what was installed, what is in your project now, and what the new release ships.

| Your project vs installed | New release vs installed | Result |
| --- | --- | --- |
| same | same | unchanged |
| same | changed | updated |
| edited | same | your edit is kept and reported |
| edited | changed, equal to your edit | adopted, nothing written |
| edited | changed, different | your file is kept and the new version is written to `.cloudnaut/incoming/<path>` for review |
| missing | any | restored |

For an MCP server entry, the incoming copy is `.cloudnaut/incoming/.kiro/settings/mcp.json.<entry-name>.json`. Incoming copies are never placed beside the original, so Kiro cannot load them by accident. Edits elsewhere in a shared file are never conflicts.

Resolve a conflict in one of three ways. The next `apply` removes the incoming copy and clears the record:

- Merge the new content into your file so it matches the incoming copy.
- Delete your file (or entry) and apply again to take the new version.
- Keep your version. It stays reported until a later release matches the installed one again.

An `apply` that finds only review items exits 0. Use `doctor` or `--json` (`plan.reviewItems`) to detect them in scripts.

### Opting out of a single item

- Extension: move `amazonwebservices.aws-toolkit-vscode` from `recommendations` to `unwantedRecommendations`. Later applies keep it that way and report `DECLINED_LOCALLY`.
- MCP server: set `"disabled": true` on `mcpServers.aws-knowledge-mcp`. It is treated as a local edit and kept.

### Refusals

- Applying an older release than the lock records exits 2. Downgrade by reverting the configuration commit.
- Applying a smaller profile than the lock records exits 2. Revert the commit instead.
- Options cannot be removed in v0.1. Revert the commit to remove a feature.

## Rollback

The configuration commit is the unit of rollback:

```text
git revert <commit-that-applied-the-setup>
```

That restores your project's earlier configuration, including the lock file. The CLI has no uninstall command.

## Interrupted apply

`apply` writes through a journal in `.cloudnaut/`. If it stops partway (power loss, killed process), run `apply` again. It rolls the project back to its earlier state, then applies. `preview` and `doctor` never recover. They report the pending journal and stop (exit 5 and exit 4). If the journal belongs to another host or a running process, the CLI refuses to touch it and says what to check.

## For a Cloudnaut maintainer: cut a release

This repository's maintainers do these steps by hand. The implementation never tags or pushes.

1. Update `CHANGELOG.md`: move entries from `Unreleased` to a new version heading.
2. Set the version in `package.json` and `powers/cloudnaut-connect-troubleshooting/plugin.json`, then run `node scripts/generate-manifest.js`.
3. Run `npm test && npm run check`.
4. Complete the checklist in [maintainers.md](maintainers.md).
5. Commit, tag `vX.Y.Z`, and push the tag.
