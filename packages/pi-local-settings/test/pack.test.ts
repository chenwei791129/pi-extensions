import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { fixture } from "./helpers.ts";
import { piSession } from "./pi-helper.ts";

test("npm tarball includes only runtime files and loads through real Pi", async (t) => {
  const f = await fixture(t);
  const pack = JSON.parse(
    execFileSync(
      "npm",
      [
        "pack",
        "--workspace",
        "@chenwei791129/pi-local-settings",
        "--ignore-scripts",
        "--json",
        "--pack-destination",
        f.root,
      ],
      { cwd: resolve("."), encoding: "utf8" },
    ),
  );
  assert.equal(pack.length, 1);
  assert.deepEqual(
    pack[0].files.map((file: { path: string }) => file.path).sort(),
    ["LICENSE", "README.md", "package.json", "src/config.ts", "src/index.ts"],
  );
  const extracted = join(f.root, "extracted");
  await mkdir(extracted);
  execFileSync("tar", [
    "-xzf",
    join(f.root, pack[0].filename),
    "-C",
    extracted,
  ]);
  const packageDir = join(extracted, "package");
  const manifest = JSON.parse(
    await readFile(join(packageDir, "package.json"), "utf8"),
  );
  assert.equal(manifest.name, "@chenwei791129/pi-local-settings");
  assert.equal(
    manifest.peerDependencies["@earendil-works/pi-coding-agent"],
    "*",
  );
  assert.equal(manifest.dependencies, undefined);
  assert.ok(manifest.keywords.includes("pi-package"));
  assert.equal(manifest.publishConfig.access, "public");
  const prompt = await f.file(join(f.cwd, "packed.md"), "Packed prompt");
  const skill = await f.file(
    join(f.cwd, "packed/SKILL.md"),
    "---\nname: packed\ndescription: Packed\n---\nPacked skill",
  );
  const piDist = new URL(
    "./modes/interactive/theme/dark.json",
    import.meta.resolve("@earendil-works/pi-coding-agent"),
  );
  const themeValue = JSON.parse(await readFile(piDist, "utf8"));
  themeValue.name = "packed";
  const theme = await f.file(
    join(f.cwd, "packed.json"),
    JSON.stringify(themeValue),
  );
  await f.config({ skills: [skill], prompts: [prompt], themes: [theme] });
  const { loader, session } = await piSession(t, f.cwd, f.agentDir, {
    extension: join(packageDir, manifest.pi.extensions[0]),
  });
  assert.deepEqual(
    loader.getPrompts().prompts.map((r) => r.name),
    ["packed"],
  );
  assert.deepEqual(
    loader.getSkills().skills.map((r) => r.name),
    ["packed"],
  );
  assert.deepEqual(
    loader.getThemes().themes.map((r) => r.name),
    ["packed"],
  );
  await session.reload();
  assert.equal(loader.getPrompts().prompts.length, 1);
});
