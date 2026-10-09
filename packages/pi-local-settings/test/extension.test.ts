import assert from "node:assert/strict";
import { rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
  ResourcesDiscoverResult,
  SessionEntry,
} from "@earendil-works/pi-coding-agent";
import localSettings from "../src/index.ts";
import { fixture } from "./helpers.ts";

function harness(cwd: string) {
  const entries: SessionEntry[] = [];
  const notifications: string[] = [];
  let confirmations = 0;
  let consent = true;
  let flag = false;
  let sessionId = "session-a";
  let discover: (
    event: unknown,
    ctx: ExtensionContext,
  ) => Promise<ResourcesDiscoverResult>;
  let command: (args: string, ctx: ExtensionCommandContext) => Promise<void>;
  const ctx = {
    cwd,
    mode: "tui",
    hasUI: true,
    isProjectTrusted: () => true,
    sessionManager: { getSessionId: () => sessionId, getBranch: () => entries },
    ui: {
      notify: (message: string) => notifications.push(message),
      confirm: async () => {
        confirmations++;
        return consent;
      },
    },
  } as unknown as ExtensionContext;
  const pi = {
    registerFlag: (name: string) => assert.equal(name, "trust-local-settings"),
    getFlag: () => flag,
    appendEntry: (customType: string, data: unknown) =>
      entries.push({ type: "custom", customType, data } as SessionEntry),
    on: (name: string, handler: typeof discover) => {
      if (name === "resources_discover") discover = handler;
    },
    registerCommand: (_name: string, options: { handler: typeof command }) => {
      command = options.handler;
    },
  } as unknown as ExtensionAPI;
  const reload = () => {
    localSettings(pi);
  };
  reload();
  return {
    ctx,
    entries,
    notifications,
    reload,
    discover: () =>
      discover({ type: "resources_discover", cwd, reason: "reload" }, ctx),
    command: () => command("", ctx as ExtensionCommandContext),
    confirmations: () => confirmations,
    consent: (value: boolean) => {
      consent = value;
    },
    flag: (value: boolean) => {
      flag = value;
    },
    session: (value: string) => {
      sessionId = value;
    },
  };
}

test("TUI approval/refusal survives runtime reload, changed config asks again", async (t) => {
  const f = await fixture(t);
  const a = await f.file(join(f.cwd, "a.md"));
  const b = await f.file(join(f.cwd, "b.md"));
  await f.config({ skills: [a] });
  const h = harness(f.cwd);
  assert.equal((await h.discover()).skillPaths?.length, 1);
  h.reload();
  assert.equal((await h.discover()).skillPaths?.length, 1);
  assert.equal(h.confirmations(), 1);
  h.consent(false);
  await f.config({ skills: [b] });
  assert.deepEqual((await h.discover()).skillPaths, []);
  h.reload();
  assert.deepEqual((await h.discover()).skillPaths, []);
  assert.equal(h.confirmations(), 2);
  h.session("new-session");
  await h.discover();
  assert.equal(h.confirmations(), 3);
});

test("project trust rejection cannot be overridden; true context still asks", async (t) => {
  const f = await fixture(t);
  await f.config({ skills: [await f.file(join(f.cwd, "a.md"))] });
  const h = harness(f.cwd);
  h.flag(true);
  h.ctx.isProjectTrusted = () => false;
  assert.deepEqual((await h.discover()).skillPaths, []);
  assert.equal(h.confirmations(), 0);
  h.ctx.isProjectTrusted = () => true;
  h.flag(false);
  await h.discover();
  assert.equal(h.confirmations(), 1);
});

test("print, JSON and RPC skip by default; opt-in or current session approval loads without UI", async (t) => {
  const f = await fixture(t);
  await f.config({ prompts: [await f.file(join(f.cwd, "a.md"))] });
  for (const mode of ["print", "json", "rpc"] as const) {
    const h = harness(f.cwd);
    h.ctx.mode = mode;
    assert.deepEqual((await h.discover()).promptPaths, []);
    assert.equal(h.confirmations(), 0);
    h.flag(true);
    assert.equal((await h.discover()).promptPaths?.length, 1);
    h.flag(false);
    h.ctx.mode = "tui";
    await h.discover();
    h.ctx.mode = mode;
    assert.equal((await h.discover()).promptPaths?.length, 1);
    assert.equal(h.confirmations(), 1);
  }
});

test("noninteractive diagnostics write only stderr and never secret values", async (t) => {
  const f = await fixture(t);
  await writeFile(f.source, '{"token":"TOP_SECRET",broken}');
  const h = harness(f.cwd);
  h.ctx.mode = "json";
  const stdout: string[] = [];
  const stderr: string[] = [];
  t.mock.method(process.stdout, "write", (value: string) => {
    stdout.push(value);
    return true;
  });
  t.mock.method(process.stderr, "write", (value: string) => {
    stderr.push(value);
    return true;
  });
  await h.discover();
  await h.command();
  assert.deepEqual(stdout, []);
  assert.match(stderr.join(""), /Malformed JSON/);
  assert.doesNotMatch(stderr.join(""), /TOP_SECRET/);
});

test("reverting after removal, invalid config or noninteractive changes never resurrects approval", async (t) => {
  const f = await fixture(t);
  const original = { skills: [await f.file(join(f.cwd, "a.md"))] };
  const h = harness(f.cwd);
  const changes = [
    () => f.config({ skills: [] }),
    () => rm(f.source),
    () => writeFile(f.source, "{invalid"),
    () => f.config({ ...original, ignored: true }),
  ];
  for (const change of changes) {
    await f.config(original);
    await h.discover();
    const before = h.confirmations();
    h.ctx.mode = "json";
    await change();
    await h.discover();
    await f.config(original);
    h.ctx.mode = "tui";
    h.reload();
    await h.discover();
    assert.equal(h.confirmations(), before + 1);
  }
});

test("diagnostic command is read-only and redacts unsupported values", async (t) => {
  const f = await fixture(t);
  await f.config({
    token: "TOP_SECRET",
    prompts: [await f.file(join(f.cwd, "a.md"))],
  });
  const h = harness(f.cwd);
  await h.command();
  assert.equal(h.confirmations(), 0);
  await h.discover();
  const entryCount = h.entries.length;
  await f.config({ prompts: [] });
  await h.command();
  assert.equal(h.entries.length, entryCount);
  assert.equal(h.confirmations(), 1);
  assert.match(h.notifications.at(-1) ?? "", /a.md/);
  assert.doesNotMatch(h.notifications.join("\n"), /TOP_SECRET/);
});
