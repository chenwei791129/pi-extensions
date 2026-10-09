# pi-local-settings

Load **skills**, **prompt templates** and **themes** from
`.pi/settings.local.json` without changing Pi's shared settings.

Requires Node **>=24.14.1**. Tested with Pi **1.1.0**; other Pi versions are not
verified.

## Install

```sh
pi install npm:@chenwei791129/pi-local-settings
```

For a local checkout: `pi -e ./packages/pi-local-settings/src/index.ts`.
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

- Relative paths start at **`.pi/`**, not the repository root. Absolute paths and
  `~/` work; parent directories are not searched for configuration.
- Only these three arrays are supported. Targets may be files or directories;
  files must resolve to `.md` for skills/prompts or `.json` for themes.
- No globs, filters, environment variables or `~user` expansion. Special files,
  control characters, `* ? [ ] { } $` and canonical paths with surrounding
  whitespace are rejected. Use `./` for literal leading `!`, `+`, `-` or `~`
  filenames (except `~/`, which expands).
- Configuration must be a regular JSON object file, at most **64 KiB**. Invalid
  JSON/read failures reject the config; invalid fields/items are skipped with
  warnings. Missing config loads nothing; unknown fields are ignored.
- Paths are resolved and deduplicated; Pi validates contents and handles
  collisions. There is no local-wins override. Themes are loaded, not selected:
  choose a loaded theme with `/settings`.

Ignore this local-only file in your Git configuration if appropriate. It is not
an extra settings layer: it cannot change models, load extensions/packages or
install anything.

## Authorization and safety

Pi project trust and this extension's local-config approval are separate. In the
TUI, approve or refuse the listed resources when prompted. The decision is
session-specific and reused for unchanged configuration. Observed config,
identity or resolved-path changes invalidate it, even if later reverted.
Forked sessions do not inherit approval. CLI opt-in covers changed configs for
that invocation, but never overrides Pi's refusal. Git ignore is not trust.

For print/JSON/RPC, explicitly opt in or use an existing valid session approval:

```sh
pi --trust-local-settings --print "Review this project"
```

If Pi also requires project authorization, grant that separately (for example,
with `--approve`). Non-interactive modes otherwise skip local resources without
waiting for a dialog. Install this extension personally or through explicit CLI
loading if it must be available before project trust.

**Approval is not a sandbox or a content-integrity check.** Skills/prompts may
instruct code execution; files inside approved paths can change without another
prompt. Symlinks may leave the project. Resource paths appear in approval UI and
diagnostics, so this configuration is not a secrets store. Unknown values and
malformed JSON fragments are not displayed. The extension writes neither
settings nor permanent trust files.

## Reload and diagnostics

Run **`/reload`** after changing configuration; there is no watcher. Removed paths
or deleted config remove this extension's contributions, but another source may
still provide the same resource.

**`/local-settings`** shows the last discovered source, paths, authorization and
warnings. It is read-only: it does not reread changes, request approval or apply
settings. Automation diagnostics go to stderr, never protocol stdout.

In Pi **1.1.0**, `--no-skills`, `--no-prompt-templates` and `--no-themes` do **not**
suppress extension-discovered resources. To skip these local resources, remove
their paths, refuse local approval or do not load this extension.

MIT licensed.
