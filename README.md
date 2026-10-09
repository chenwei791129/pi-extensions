# Pi Extensions

An npm-workspaces repository for small, independently published Pi extensions.

| Package | Purpose |
| --- | --- |
| [@chenwei791129/pi-local-settings](packages/pi-local-settings) | Session-authorized local skills, prompts and themes |

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
`publish.yml` at every released package tag, without a long-lived GitHub PAT.
Publication validates the tag and publishes only its configured workspace.

See [release operations](docs/releasing.md) for GitHub permissions, first npm
publication, OIDC, recovery, and adding independently tagged packages. The
[original implementation plan](docs/plans/pi-local-settings-v1.md) predates
this automatic-tag flow. No publication or gallery listing is claimed until
verified.
