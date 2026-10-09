import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { mkdir, symlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { MAX_CONFIG_BYTES, readLocalConfig } from "../src/config.ts";
import { fixture } from "./helpers.ts";

test("missing, empty object and arrays are silent", async (t) => {
  const f = await fixture(t);
  assert.equal((await readLocalConfig(f.cwd)).status, "missing");
  for (const value of [{}, { skills: [], prompts: [], themes: [] }]) {
    await f.config(value);
    const result = await readLocalConfig(f.cwd);
    assert.equal(result.status, "valid");
    assert.deepEqual(result.paths, { skills: [], prompts: [], themes: [] });
    assert.deepEqual(result.diagnostics, []);
  }
});

test("resolves .pi relative, absolute and home paths; canonical dedup preserves order", async (t) => {
  const f = await fixture(t);
  const skill = await f.file(join(f.cwd, "skill.md"));
  const prompt = await f.file(join(f.cwd, "prompt.md"));
  const theme = await f.file(join(f.cwd, "theme.json"));
  const directory = join(f.cwd, "resources");
  await mkdir(directory);
  await symlink(skill, join(f.cwd, "alias.md"));
  await f.config({
    skills: ["../skill.md", skill, "../alias.md", "../resources", "~/"],
    prompts: [prompt],
    themes: [theme],
  });
  const result = await readLocalConfig(f.cwd);
  assert.deepEqual(result.paths.skills, [
    realpathSync(skill),
    realpathSync(directory),
    realpathSync(homedir()),
  ]);
  assert.deepEqual(result.paths.prompts, [realpathSync(prompt)]);
  assert.deepEqual(result.paths.themes, [realpathSync(theme)]);
  assert.match(result.diagnostics.join("\n"), /resolved/);
});

test("home expansion keeps repeated slashes anchored to home", async (t) => {
  const f = await fixture(t);
  const prompt = await f.file(join(f.root, "home-prompt.md"));
  await f.config({ skills: ["~//", "~/"], prompts: ["~//home-prompt.md"] });
  const result = await readLocalConfig(f.cwd);
  assert.deepEqual(result.paths.skills, [realpathSync(f.root)]);
  assert.deepEqual(result.paths.prompts, [realpathSync(prompt)]);
  assert.ok(
    result.diagnostics.every((message) => message.includes("resolved")),
  );
});

test("invalid JSON and roots fail closed without leaking parser fragments", async (t) => {
  const f = await fixture(t);
  for (const input of [
    '{"secret":"TOP_SECRET",oops}',
    "null",
    "[]",
    "42",
    '"secret"',
  ]) {
    await writeFile(f.source, input);
    const result = await readLocalConfig(f.cwd);
    assert.equal(result.status, "invalid");
    assert.deepEqual(result.paths, { skills: [], prompts: [], themes: [] });
    assert.doesNotMatch(result.diagnostics.join(""), /TOP_SECRET/);
  }
});

test("invalid fields and entries are skipped individually without logging values", async (t) => {
  const f = await fixture(t);
  const good = await f.file(join(f.cwd, "good.md"));
  const wrong = await f.file(join(f.cwd, "wrong.txt"));
  await f.config({
    token: "TOP_SECRET",
    skills: [
      null,
      1,
      "",
      "  ",
      "*.md",
      "!foo",
      "+foo",
      "-foo",
      "$SECRET",
      "~user/a",
      "a[b]",
      "{a,b}",
      "a?b",
      "a\nb",
      "../missing",
      wrong,
      good,
    ],
    prompts: "TOP_SECRET",
    themes: [good],
  });
  const result = await readLocalConfig(f.cwd);
  assert.deepEqual(result.paths.skills, [realpathSync(good)]);
  assert.deepEqual(result.paths.prompts, []);
  assert.deepEqual(result.paths.themes, []);
  assert.match(result.diagnostics.join("\n"), /v1 does not support/);
  assert.match(result.diagnostics.join("\n"), /requires .json/);
  assert.doesNotMatch(JSON.stringify(result), /TOP_SECRET|\$SECRET/);
});

test("does not search ancestors and never resolves against process.cwd", async (t) => {
  const f = await fixture(t);
  const child = join(f.cwd, "child");
  await mkdir(child);
  await f.config({ skills: ["../good.md"] });
  await f.file(join(f.cwd, "good.md"));
  assert.equal((await readLocalConfig(child)).status, "missing");
  assert.equal((await readLocalConfig(f.cwd)).paths.skills.length, 1);
});

test("fingerprint changes with content, canonical targets and config identity", async (t) => {
  const f = await fixture(t);
  const a = await f.file(join(f.cwd, "a.md"));
  const b = await f.file(join(f.cwd, "b.md"));
  await f.config({ skills: [a] });
  const first = (await readLocalConfig(f.cwd)).fingerprint;
  assert.equal((await readLocalConfig(f.cwd)).fingerprint, first);
  await f.config({ skills: [b] });
  assert.notEqual((await readLocalConfig(f.cwd)).fingerprint, first);
});

test("bounded regular-file reads reject oversized files, directories and FIFOs", async (t) => {
  const f = await fixture(t);
  await writeFile(f.source, " ".repeat(MAX_CONFIG_BYTES + 1));
  assert.equal((await readLocalConfig(f.cwd)).status, "invalid");
  const dir = join(f.cwd, "directory");
  await mkdir(join(dir, ".pi/settings.local.json"), { recursive: true });
  assert.equal((await readLocalConfig(dir)).status, "invalid");
  if (process.platform !== "win32") {
    const fifo = join(f.cwd, "fifo");
    await mkdir(join(fifo, ".pi"), { recursive: true });
    execFileSync("mkfifo", [join(fifo, ".pi/settings.local.json")]);
    assert.equal((await readLocalConfig(fifo)).status, "invalid");
    execFileSync("mkfifo", [join(f.cwd, "resource.md")]);
    await f.config({ skills: ["../resource.md"] });
    assert.deepEqual((await readLocalConfig(f.cwd)).paths.skills, []);
  }
});
