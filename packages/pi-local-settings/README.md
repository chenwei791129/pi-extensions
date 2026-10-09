# pi-local-settings

Add **skills**, **prompt templates**, and **themes** from a local-only
`.pi/settings.local.json`, without changing Pi's shared settings.

Tested with Pi **1.1.0** (`@earendil-works/pi-coding-agent`) and Node
**24.14.1**. Requires Node >=24.14.1; other Pi versions are not yet verified.

## Install

After publication:

```sh
pi install npm:@chenwei791129/pi-local-settings
```

For a local checkout, use one entry only:

```sh
pi -e ./packages/pi-local-settings/src/index.ts
# Alternatively: pi install /absolute/path/to/pi-extensions
```

Do not install both the repository and its individual package.

## Configure

Create `.pi/settings.local.json` in the directory where you start Pi:

```json
{
  "skills": ["../.claude/skills", "../extra-skills/example/SKILL.md"],
  "prompts": ["../my-prompts", "../review.md"],
  "themes": ["../my-themes", "~/themes/example.json"]
}
```

Relative paths resolve from the **`.pi/` directory**, not the repository root,
Git root, a parent directory, or a later process working directory. Absolute
paths and `~/` are supported. Configuration is read again at startup and
`/reload`; there is no watcher. No settings file is modified by this extension.
For local-only use, ignore `settings.local.json` in your own Git configuration;
being Git-ignored is **not** evidence of trust.

Only the three root fields above are supported. Each accepts an array of paths
to regular files or directories. File targets must end in `.md` for skills and
prompts or `.json` for themes (after symlink resolution). Pi handles content
validation, directory traversal and collisions. Themes are discovered, **not
selected**; select a loaded theme through Pi's `/settings`.

Paths are canonicalized, deduplicated per resource type and kept in order.
Symlinks may point outside the project; resolved paths appear in diagnostics.
This is not directory isolation. Pi keeps its own collision behavior; there is
no local-wins override guarantee.

### Limitations and diagnostics

- Missing configuration is silently ignored. Empty objects/arrays load nothing.
- Malformed JSON, non-object roots and read errors reject the entire config.
- Invalid fields/items are warned about and skipped; valid siblings still load.
- Unknown root fields are ignored without printing their names or values.
- Configuration must be a regular file, at most **64 KiB**. Special-file
  configuration and resource targets are rejected.
- No glob patterns, filters (`!`, `+`, `-` prefixes), `$` variable expansion,
  `~user`, or control characters. `*`, `?`, `[`, `]`, `{`, `}`, `$` are rejected
  even when they are literal filename characters. A literal leading `!`, `+`,
  `-`, or `~` can be expressed with a `./` prefix (except `~/`, which expands).
- Canonical resource paths with leading/trailing whitespace are rejected,
  including symlink targets. Pi 1.1.0 trims resource paths; rejecting these
  prevents the host from loading a different target than the one approved.
- No model/settings merge, extensions/packages loading, commands from JSON,
  automatic package installation, or removal of other sources' resources.

Use **`/local-settings`** to show the last discovery source, parsed paths,
authorization status and warnings. This command is read-only: it does not read
changed files, prompt for approval, or apply settings. Diagnostics go to the
TUI or stderr in print/JSON/RPC modes, never protocol stdout.

## Trust

Pi project trust is checked first. If Pi rejects the project, even this
extension's CLI opt-in cannot load local resources. Install this extension as a
personal or explicit CLI extension if it must be available before project trust.

In the TUI, the first discovery of valid resources asks for dedicated approval,
even if Pi already considers the project trusted. Approval **or refusal** is
stored as non-model-context session data. Unchanged `/reload` does not ask again.
The decision is bound to the session ID, canonical working directory, config
file identity, raw config content and resolved path summary. Changes (including
whitespace, ignored fields, replacement of the config file, or symlink targets)
require confirmation again. Forked sessions do not inherit approval; resuming
the same session can reuse it on its active branch.

For automation, explicitly opt in:

```sh
pi --trust-local-settings --print "Review this project"
# If protected shared project resources exist, also grant Pi trust as needed:
pi --approve --trust-local-settings --print "Review this project"
```

Print, JSON and RPC never wait for approval dialogs: without opt-in or a valid
approval in the current session they skip local resources. CLI opt-in applies
to changed configs throughout that invocation, but never overrides Pi's refusal.
No permanent trust file or Pi `trust.json` is written.

**Approval is not a sandbox or integrity check of resource contents.** Skills
and prompts may instruct code execution. Files under approved paths may change
without another confirmation; inspect sources and use OS isolation as needed.
Local configuration is not a secrets store; declared resource paths appear in
approval UI and diagnostics. Unknown field values and malformed JSON fragments
are not displayed.

## Reload and native flags

`/reload` rebuilds this extension's contributions. Removing a path or deleting
the config removes that contribution on the next reload. The same resource can
remain if another source also supplies it.

In Pi **1.1.0**, `--no-skills`, `--no-prompt-templates`, and `--no-themes` disable
native discovered/configured paths but **do not suppress extension-discovered
paths**, including this extension's authorized paths. This extension does not
parse argv or simulate native priority rules. To skip these local resources,
remove the local paths, refuse local authorization, or do not load the extension.

## Development

From the repository root:

```sh
npm ci --ignore-scripts
npm run check
npm run check:pack
```

Tests use isolated temporary homes/agent directories and real Pi loaders,
including reload and tarball loading. They do not call a model.

MIT licensed. The `pi-package` keyword makes the published package eligible for
Pi gallery discovery; it is not a claim of publication or gallery indexing.
