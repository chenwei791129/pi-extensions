# Agent Guide

## Architecture and documentation

- npm-workspaces monorepo: the root is private; each `packages/*` workspace is
  independently versioned and published. Do not publish the root.
- The root Pi manifest exposes the first extension for checkout use. Installing
  both the root and its individual package duplicates the extension.
- Packages ship TypeScript sources directly; no bundler or generated runtime
  output. Host Pi packages belong in `peerDependencies` with `"*"`, not bundled
  dependencies. Development tests pin Pi to **1.1.0**.
- `README.md` is a short user-facing catalog/install guide. Each package README
  covers installation, configuration, operation and safety. Keep development
  details here, not in either README. English is used for READMEs, code comments
  and commit messages; operational docs use Taiwan Traditional Chinese.
- `docs/releasing.md` is the current release/onboarding/recovery reference.
  `docs/plans/pi-local-settings-v1.md` is historical: its original empty-repo,
  bootstrap and workflow assumptions do not describe the current system.

### Code map

- `packages/pi-local-settings/src/config.ts`: bounded JSON reading, schema/path
  checks, canonicalization, deduplication and redacted diagnostics.
- `packages/pi-local-settings/src/index.ts`: `resources_discover`, authorization,
  session decision persistence, reload invalidation and `/local-settings`.
- `packages/pi-local-settings/test/`: parser/extension contracts, real Pi
  integration and npm tarball tests, plus release automation regressions/helpers.
- `scripts/release-config.ts`: package allowlist and component/tag contracts.
- `scripts/release.ts`: tagged release/caller/SHA/main-ancestry validation.
- `scripts/preview-release.ts`: caller-bound, read-only main preview validation.
- `scripts/dispatch-releases.ts`: validated, deduplicated Release PR CI and
  per-package tag dispatch; no blind retry of ambiguous API failures.
- `scripts/stage-bootstrap.ts`: the historical, tightly pinned first `0.1.0`
  staging guard. It is not a general bootstrap mechanism for new packages.

## Toolchain and checks

Use `.node-version` (**Node 24.14.1**), npm and the committed lockfile. Do not
install global tools or switch package managers for this project.

```sh
npm ci --ignore-scripts
npm run check
npm run check:pack
```

`check` runs TypeScript, Biome and the Node test runner. `npm run format` applies
Biome fixes; review its diff. Tests use `PI_OFFLINE=1`, isolated temporary homes,
agent directories and real Pi loaders; never use personal settings or call a
model. The pack test checks an exact runtime-file whitelist and real Pi loading.

- Dependency lifecycle scripts stay disabled. Known scripts include
  `@google/genai`'s no-op preinstall, `esbuild` binary setup and `protobufjs`'s
  version-scheme warning. Pi and Biome work without running them. Re-evaluate
  compatibility on upgrades; do not enable all scripts to bypass an install error.
- Node 24.14.1 bundles npm **11.11.0**; do not assume the developer's npm version.
  Normal CI/tests must work with it. Staging pins **npm 11.18.0** through
  `npm exec`; the stage-capable version gate applies only at its CLI entrypoint.
- CI needs full Git history/tags for the immutable `0.1.0` regression fixture.
  That fixture resets to the original tag so newer main versions do not alter it.
- Release Please action and engine tests are version-aligned; upgrade both
  together. Preserve independent-package bumps, shared-lockfile updates and the
  regression that `ci:`/`docs:` commits do not produce releases.
- `.release-please-manifest.json` retains Release Please's generated formatting.
  Biome disables only its formatter, not JSON syntax checks or other formatting.

## pi-local-settings behavior to preserve

- Read only startup cwd `.pi/settings.local.json`, never search ancestors/Git root.
  Resolve relative paths from `.pi/`; support absolute paths and `~/` (including
  `~//` as home-relative, not filesystem-root-relative). Do not write settings.
- Only `skills`, `prompts`, `themes` arrays are supported. No settings/model merge,
  extension/package loading, commands, installation, watcher, glob or filter layer.
- Config reads are bounded to a regular file of at most 64 KiB. Invalid JSON/root
  or read failures reject the config; bad fields/items are skipped independently.
  Unknown keys/values and parser fragments must not leak into diagnostics.
- Resolve symlinks and deduplicate canonical paths per resource type in order.
  Reject special-file targets, unsupported characters/syntax and canonical paths
  with leading/trailing whitespace, including symlink targets: Pi trims paths.
  Delegate content validation, traversal and collisions to Pi; no local-wins rule.
- Pi project refusal always wins, including over `--trust-local-settings`.
  Pi project trust alone is not local-config approval; Git ignore is not trust.
- Approval/refusal uses non-model-context custom entries on the active session
  branch. Persist the SHA-256 fingerprint of canonical cwd, config identity,
  raw content and resolved paths, not raw JSON. Observed changes invalidate old
  decisions even if later reverted. Forked sessions do not inherit approval;
  unchanged same-session reload may reuse it.
- Print/JSON/RPC must never wait for a dialog. Require explicit opt-in or a valid
  existing session approval. Diagnostics use stderr/TUI, never protocol stdout.
  `/local-settings` shows the last discovery only; it cannot read/apply changes.
- Reload replaces this extension's contributions; other sources may still supply
  a removed resource. Themes are discovered, not selected.
- Pi 1.1.0 native `--no-skills`, `--no-prompt-templates`, `--no-themes` do not
  suppress extension-discovered paths. Do not parse argv to emulate suppression.
- Authorization is not a sandbox or a resource-content integrity guarantee.
  Preserve these warnings in user docs: approved files can change without another
  prompt, symlinks can leave the project, skills/prompts can instruct execution,
  and declared paths are visible in approval UI/diagnostics.

## CI and release maintenance

Read `docs/releasing.md` before changing publication behavior or onboarding a
package. Current structure:

- `ci.yml`: read-only main/PR checks; manual dispatch supports bot PRs.
- `release-please.yml`: manifest-based Release PRs, independent component tags and
  GitHub Releases. It explicitly dispatches CI and package callers because normal
  bot-token events cannot be relied on to start downstream workflows.
- `publish-<component>.yml`: thin per-package caller, fixed workspace identity.
  Main manual dispatch is preview only; version tags request publication.
- `publish.yml`: reusable `workflow_call` implementation. Validate caller, selected
  package, version, event/tag SHA and main ancestry before uploading. Preview
  validation is read-only and publication is skipped. Real OIDC publishing needs
  `id-token: write` in both caller and child; never inherit npm secrets.
- npm Trusted Publisher binds the **caller filename**, not the reusable file.
  The pre-wrapper `0.1.1` OIDC release used `publish.yml`; new caller publishing
  needs the new binding before the next authorized release. A main preview does
  not validate OIDC. New bindings have a two-day first-publication window.
- `stage-bootstrap.yml` is the historical initial-package exception. Never rerun
  staging just because anonymous registry metadata is 404: an existing stage may
  already have been accepted. Inspect Actions and npm Staged Packages first.
- Pin external actions to reviewed commit SHAs; no dependency caching in releases,
  no lifecycle scripts or unquoted/unvalidated shell inputs. Serialize publishing
  per package while allowing different packages to publish independently.

Keep README badges honest: they show each wrapper's latest **manual main preview**,
not successful npm publication. GitHub/npm publication, provenance verification,
installed smoke tests and Pi gallery inclusion are separate evidence gates.
`pi-package` makes a package eligible, not guaranteed to appear in the gallery.
Do not publish extra versions to refresh indexing or make a badge green.

Commit/push/release only with user authorization; stage named files only. Use
Conventional Commits. Documentation/CI-only work uses `docs:`/`ci:` when requested,
without changing versions, moving existing tags or merging a Release PR.
Behavioral, trust or deployment changes require focused validation, simplify and
fresh-context read-only review under the applicable quality-gate instructions.
Never request or record credentials, tokens or OTPs in chat/repository artifacts;
maintainers handle npm approval, publisher setup and token revocation themselves.
