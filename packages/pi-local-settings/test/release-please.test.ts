import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { type GitHub, Manifest } from "release-please";
import type { PullRequest } from "release-please/build/src/pull-request.js";
import { fixture } from "./helpers.ts";
import { seedPackages } from "./release-helper.ts";

test("pinned release-please creates independent tags/versions and updates the shared workspace lockfile", async (t) => {
  const f = await fixture(t);
  await seedPackages(f);
  const config = JSON.parse(
    await readFile("release-please-config.json", "utf8"),
  );
  config.packages["packages/pi-example"] = {
    component: "pi-example",
    "initial-version": "0.1.0",
  };
  await f.file(
    join(f.root, "release-please-config.json"),
    JSON.stringify(config),
  );
  const versions = {
    "packages/pi-local-settings": "1.0.0",
    "packages/pi-example": "2.0.0",
  };
  for (const [path, version] of Object.entries(versions)) {
    await f.file(
      join(f.root, path, "package.json"),
      JSON.stringify({ name: `@chenwei791129/${path.split("/")[1]}`, version }),
    );
  }
  await f.file(
    join(f.root, ".release-please-manifest.json"),
    JSON.stringify(versions),
  );
  const lockfile = JSON.stringify({
    name: "pi-extensions",
    lockfileVersion: 3,
    packages: {
      "": { name: "pi-extensions" },
      ...Object.fromEntries(
        Object.entries(versions).map(([path, version]) => [
          path,
          { name: `@chenwei791129/${path.split("/")[1]}`, version },
        ]),
      ),
    },
  });
  let merged: PullRequest | undefined;
  let changeBoth = true;
  let initialRelease = false;
  let maintenanceOnly = false;
  const github = {
    repository: { owner: "chenwei791129", repo: "pi-extensions" },
    getFileJson: async (path: string) =>
      JSON.parse(await readFile(join(f.root, path), "utf8")),
    getFileContentsOnBranch: async (path: string) => {
      const parsedContent = await readFile(join(f.root, path), "utf8");
      return {
        parsedContent,
        content: Buffer.from(parsedContent).toString("base64"),
        sha: "fixture",
      };
    },
    async *releaseIterator() {
      if (initialRelease) return;
      for (const [path, version] of Object.entries(versions))
        yield {
          name: path,
          tagName: `${path.split("/")[1]}-v${version}`,
          sha: "baseline",
        };
    },
    async *tagIterator() {},
    async *mergeCommitIterator() {
      if (maintenanceOnly) {
        yield {
          sha: "docs",
          message: "docs: add package badges",
          files: ["README.md"],
        };
        yield {
          sha: "ci",
          message: "ci: split release callers",
          files: [
            "packages/pi-local-settings/test/release.test.ts",
            ".github/workflows/publish.yml",
          ],
        };
        yield { sha: "baseline", message: "chore: prior release", files: [] };
        return;
      }
      yield {
        sha: "fix",
        message: "fix: correct local settings",
        files: ["packages/pi-local-settings/src/index.ts"],
      };
      if (changeBoth)
        yield {
          sha: "feature",
          message: "feat: add example feature",
          files: ["packages/pi-example/src/index.ts"],
        };
      yield { sha: "baseline", message: "chore: prior release", files: [] };
    },
    async *pullRequestIterator() {
      if (merged) yield merged;
    },
  } as unknown as GitHub;
  for (const scenario of [
    { initial: true, both: true },
    { initial: false, both: true },
    { initial: false, both: false },
    { initial: false, both: false, maintenance: true },
  ]) {
    const { initial, both } = scenario;
    initialRelease = initial;
    changeBoth = both;
    maintenanceOnly =
      "maintenance" in scenario && scenario.maintenance === true;
    await f.file(
      join(f.root, ".release-please-manifest.json"),
      JSON.stringify(initial ? {} : versions),
    );
    for (const [path, version] of Object.entries(versions)) {
      await f.file(
        join(f.root, path, "package.json"),
        JSON.stringify({
          name: `@chenwei791129/${path.split("/")[1]}`,
          version: initial ? "0.1.0" : version,
        }),
      );
    }
    const manifest = await Manifest.fromManifest(
      github,
      "main",
      undefined,
      undefined,
      { logger: { debug() {}, info() {}, warn() {}, error() {}, trace() {} } },
    );
    const prs = await manifest.buildPullRequests();
    assert.equal(prs.length, maintenanceOnly ? 0 : 1);
    if (maintenanceOnly) {
      assert.deepEqual(await manifest.buildReleases(), []);
      continue;
    }
    const pr = prs[0];
    assert.ok(
      pr.updates.some(
        (u) => u.path === "packages/pi-local-settings/CHANGELOG.md",
      ),
    );
    assert.equal(
      pr.updates.some((u) => u.path === "packages/pi-example/package.json"),
      both,
    );
    assert.ok(!pr.updates.some((u) => u.path === "package.json"));
    const lockUpdate = pr.updates.find((u) => u.path === "package-lock.json");
    assert.ok(lockUpdate);
    const updatedLock = JSON.parse(lockUpdate.updater.updateContent(lockfile));
    const settingsVersion = initial ? "0.1.0" : "1.0.1";
    let exampleVersion = "2.0.0";
    if (initial) exampleVersion = "0.1.0";
    else if (both) exampleVersion = "2.1.0";
    assert.equal(
      updatedLock.packages["packages/pi-local-settings"].version,
      settingsVersion,
    );
    assert.equal(
      updatedLock.packages["packages/pi-example"].version,
      exampleVersion,
    );
    merged = {
      headBranchName: pr.headRefName,
      baseBranchName: "main",
      number: 1,
      title: pr.title.toString(),
      body: pr.body.toString(),
      labels: ["autorelease: pending"],
      files: [],
      sha: "merged",
    };
    const releases = await manifest.buildReleases();
    const expectedTags = [`pi-local-settings-v${settingsVersion}`];
    if (both) expectedTags.push(`pi-example-v${exampleVersion}`);
    assert.deepEqual(
      releases.map((r) => r.tag.toString()).sort(),
      expectedTags.sort(),
    );
    merged = undefined;
  }
});
