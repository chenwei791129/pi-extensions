import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { fixture } from "./helpers.ts";

test("release-please compact manifest passes Biome without exempting JSON syntax or other formatting", async (t) => {
  const f = await fixture(t);
  const config = JSON.parse(await readFile("biome.json", "utf8"));
  // The fixture is outside Git; preserve the real formatter/override policy.
  config.vcs.enabled = false;
  await f.file(join(f.root, "biome.json"), JSON.stringify(config));
  await f.file(
    join(f.root, ".release-please-manifest.json"),
    '{"packages/pi-local-settings":"0.1.0"}\n',
  );
  const biome = resolve("node_modules/@biomejs/biome/bin/biome");
  const check = (path: string) =>
    execFileSync(process.execPath, [biome, "check", path], {
      cwd: f.root,
      stdio: "pipe",
    });
  assert.doesNotThrow(() => check(".release-please-manifest.json"));
  await f.file(join(f.root, "normal.json"), '{"example":1}\n');
  assert.throws(() => check("normal.json"));
  await f.file(join(f.root, ".release-please-manifest.json"), "{invalid\n");
  assert.throws(() => check(".release-please-manifest.json"));
});
