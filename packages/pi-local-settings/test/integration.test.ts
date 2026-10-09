import assert from "node:assert/strict";
import { mkdir, readFile, rm, symlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { RESOURCE_FIELDS, readLocalConfig } from "../src/config.ts";
import { fixture } from "./helpers.ts";
import { piSession } from "./pi-helper.ts";

const piDist = dirname(
  fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent")),
);

async function resources(f: Awaited<ReturnType<typeof fixture>>, name: string) {
  const skill = await f.file(
    join(f.cwd, name, "skills", name, "SKILL.md"),
    `---\nname: ${name}\ndescription: Example skill\n---\nInstructions.`,
  );
  const prompt = await f.file(
    join(f.cwd, name, "prompts", `${name}.md`),
    `---\ndescription: Example prompt\n---\n${name}`,
  );
  const themeValue = JSON.parse(
    await readFile(join(piDist, "modes/interactive/theme/dark.json"), "utf8"),
  );
  themeValue.name = name;
  const theme = await f.file(
    join(f.cwd, name, "themes", `${name}.json`),
    JSON.stringify(themeValue),
  );
  return {
    skills: [dirname(skill)],
    prompts: [dirname(prompt)],
    themes: [theme],
  };
}

function names(loader: Awaited<ReturnType<typeof piSession>>["loader"]) {
  return {
    skills: loader.getSkills().skills.map((r) => r.name),
    prompts: loader.getPrompts().prompts.map((r) => r.name),
    themes: loader.getThemes().themes.map((r) => r.name),
  };
}

test("real Pi loads all resources; reload adds/removes and deletion removes only local contributions", async (t) => {
  const f = await fixture(t);
  const shared = await resources(f, "shared");
  const local = await resources(f, "local");
  const added = await resources(f, "added");
  const globalSettings = await f.file(join(f.agentDir, "settings.json"), "{}");
  const projectSettings = await f.file(
    join(f.cwd, ".pi/settings.json"),
    JSON.stringify(shared),
  );
  await f.config(local);
  const before = await Promise.all(
    [globalSettings, projectSettings, f.source].map((p) => readFile(p, "utf8")),
  );
  const { session, loader } = await piSession(t, f.cwd, f.agentDir);
  for (const values of Object.values(names(loader)))
    assert.deepEqual(values.sort(), ["local", "shared"]);
  await session.reload();
  assert.deepEqual(
    await Promise.all(
      [globalSettings, projectSettings, f.source].map((p) =>
        readFile(p, "utf8"),
      ),
    ),
    before,
  );
  await f.config(added);
  await session.reload();
  for (const values of Object.values(names(loader)))
    assert.deepEqual(values.sort(), ["added", "shared"]);
  await f.config({ skills: [], prompts: [], themes: [] });
  await session.reload();
  for (const values of Object.values(names(loader)))
    assert.deepEqual(values, ["shared"]);
  await f.config(local);
  await session.reload();
  await rm(f.source);
  await session.reload();
  for (const values of Object.values(names(loader)))
    assert.deepEqual(values, ["shared"]);
  assert.deepEqual(
    await Promise.all(
      [globalSettings, projectSettings].map((p) => readFile(p, "utf8")),
    ),
    before.slice(0, 2),
  );
});

test("collision stays with Pi's first source and reports diagnostics", async (t) => {
  const f = await fixture(t);
  const shared = await resources(f, "collision");
  const local = await resources(f, "other");
  await f.file(
    join(f.cwd, "other/skills/other/SKILL.md"),
    "---\nname: collision\ndescription: Local\n---\nLocal.",
  );
  await f.file(join(f.cwd, "other/prompts/collision.md"), "Local prompt");
  await f.file(
    join(f.cwd, "other/themes/collision.json"),
    await readFile(shared.themes[0], "utf8"),
  );
  await f.file(join(f.cwd, ".pi/settings.json"), JSON.stringify(shared));
  await f.config(local);
  const { loader } = await piSession(t, f.cwd, f.agentDir);
  const skill = loader.getSkills().skills.find((r) => r.name === "collision");
  assert.ok(skill?.filePath.includes("collision/skills"));
  const prompt = loader
    .getPrompts()
    .prompts.find((r) => r.name === "collision");
  assert.notEqual(prompt?.content, "Local prompt");
  assert.ok(loader.getSkills().diagnostics.length);
  assert.ok(loader.getPrompts().diagnostics.length);
});

test("real reload preserves session approval, but config changes ask again", async (t) => {
  const f = await fixture(t);
  const local = await resources(f, "local");
  await f.config(local);
  let calls = 0;
  const { loader, session } = await piSession(t, f.cwd, f.agentDir, {
    optIn: false,
    confirm: async () => {
      calls++;
      return calls === 1;
    },
  });
  assert.ok(names(loader).skills.includes("local"));
  await session.reload();
  assert.equal(calls, 1);
  await f.config({ ...local, ignored: true });
  await session.reload();
  assert.equal(calls, 2);
  assert.deepEqual(names(loader).skills, []);
  await session.reload();
  assert.equal(calls, 2);
});

test("Pi no-resource flags do not suppress extension-discovered paths in 1.1.0", async (t) => {
  const f = await fixture(t);
  await f.config(await resources(f, "local"));
  const { loader } = await piSession(t, f.cwd, f.agentDir, {
    noResources: true,
  });
  for (const values of Object.values(names(loader)))
    assert.deepEqual(values, ["local"]);
});

test("canonical trailing whitespace cannot redirect approved resources to trimmed siblings", async (t) => {
  const f = await fixture(t);
  const unapproved = await resources(f, "unapproved");
  const safe = await resources(f, "safe");
  const targets = {
    skills: unapproved.skills[0],
    prompts: unapproved.prompts[0],
    themes: dirname(unapproved.themes[0]),
  };
  const direct = {
    skills: [...safe.skills],
    prompts: [...safe.prompts],
    themes: [...safe.themes],
  };
  const aliases = {
    skills: [...safe.skills],
    prompts: [...safe.prompts],
    themes: [...safe.themes],
  };
  for (const field of RESOURCE_FIELDS) {
    const padded = `${targets[field]} `;
    await mkdir(padded);
    const alias = join(f.cwd, `alias-${field}`);
    await symlink(padded, alias);
    direct[field].push(padded);
    aliases[field].push(alias);
  }
  await f.config(direct);
  const parsed = await readLocalConfig(f.cwd);
  assert.deepEqual(parsed.paths, safe);
  assert.equal(
    parsed.diagnostics.filter((message) => message.includes("Pi trims")).length,
    3,
  );
  let confirmations = 0;
  const { loader, session } = await piSession(t, f.cwd, f.agentDir, {
    optIn: false,
    confirm: async () => {
      confirmations++;
      return true;
    },
  });
  for (const values of Object.values(names(loader)))
    assert.deepEqual(values, ["safe"]);
  await f.config(aliases);
  await session.reload();
  for (const values of Object.values(names(loader)))
    assert.deepEqual(values, ["safe"]);
  assert.equal(confirmations, 2);
});

test("real session project rejection wins over opt-in", async (t) => {
  const f = await fixture(t);
  await f.config(await resources(f, "local"));
  const { loader } = await piSession(t, f.cwd, f.agentDir, { trusted: false });
  for (const values of Object.values(names(loader)))
    assert.deepEqual(values, []);
});
