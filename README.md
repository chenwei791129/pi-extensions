# Pi Extensions

An npm-workspaces repository for small, independently published Pi extensions.

| Package | Purpose | Release checks<br>(main preview) |
| --- | --- | --- |
| [@chenwei791129/pi-local-settings](packages/pi-local-settings) | Session-authorized local skills, prompts and themes | [![pi-local-settings release checks](https://github.com/chenwei791129/pi-extensions/actions/workflows/publish-pi-local-settings.yml/badge.svg?branch=main&event=workflow_dispatch)](https://github.com/chenwei791129/pi-extensions/actions/workflows/publish-pi-local-settings.yml) |

Each badge shows that package's latest manual **main preview**, not an npm
publication or the status of other packages. A preview checks sources, tests
and packaging without creating a tag, uploading a stage or publishing.

## Development

Use Node **24.14.1** and npm. Pi integration tests are pinned to **1.1.0**.

```sh
npm ci --ignore-scripts
npm run check
npm run check:pack
```

Dependency lifecycle scripts are disabled intentionally. The lockfile includes
install scripts from `@google/genai` (a no-op preinstall), `esbuild`
(binary setup), and `protobufjs` (dependency version-scheme warning); the tested
Pi loader and our toolchain work without executing them. Biome uses its
platform-specific optional binary package. Re-evaluate this policy when
updating dependencies rather than enabling all scripts after a failed install.

The root package is private. Each extension under `packages/` owns its version,
manifest, documentation and MIT license. TypeScript entry points are loaded
directly by Pi; no bundle or duplicate host dependency is shipped.

For checkout use, install the root repository **or** the individual package,
not both. The root manifest explicitly exposes the first extension.

## Releases

Release Please uses `release-please-config.json` and
`.release-please-manifest.json` to manage package versions and CHANGELOGs.
Merge its Release PR to create each package's independent `<component>-vX.Y.Z`
tag and GitHub Release. The private root is not released, and package versions
are not linked. The Node workspace plugin keeps the root lockfile in sync.

Bot-created PRs/tags do not automatically trigger other workflows with
`GITHUB_TOKEN`. We explicitly dispatch read-only CI for Release PR branches and
`publish-<component>.yml` at each package tag, without a long-lived GitHub PAT.
Each package has a thin caller (currently `publish-pi-local-settings.yml`);
`publish.yml` is the shared reusable implementation. Publication validates
both the caller/package identity and immutable tag, then publishes only that
workspace. Dispatching the caller on main runs a read-only preview instead.
Trusted Publisher must bind the **caller filename** before its next real
release; see the transition instructions in [release operations](docs/releasing.md).
The first `0.1.0` uses `stage-bootstrap.yml` on main with a short-lived,
stage-only token and a byte-identical tarball check against its immutable tag.
A maintainer approves it with 2FA on npm; later versions use token-free OIDC.
A successful stage is not a completed public release.

See [release operations](docs/releasing.md) for GitHub permissions, first npm
publication, OIDC, recovery, and adding independently tagged packages. The
[original implementation plan](docs/plans/pi-local-settings-v1.md) predates
this automatic-tag flow. No publication or gallery listing is claimed until
verified.
