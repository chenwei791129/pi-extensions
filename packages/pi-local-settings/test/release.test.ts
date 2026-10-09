import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { bootstrapRequested } from "../../../scripts/release.ts";
import {
  packageForTag,
  readReleasePackages,
  validateReleaseTag,
} from "../../../scripts/release-config.ts";
import { fixture } from "./helpers.ts";
import { releaseConfig, seedPackages } from "./release-helper.ts";

test("release tags bind exact independent components and versions, never shell input", async (t) => {
  const f = await fixture(t);
  const packages = await seedPackages(f);
  validateReleaseTag("pi-local-settings-v0.1.0", "0.1.0", "pi-local-settings");
  assert.equal(
    packageForTag("pi-example-v2.3.4", packages).path,
    "packages/pi-example",
  );
  assert.equal(bootstrapRequested(packages[0], "true"), true);
  assert.equal(bootstrapRequested(packages[1], "true"), false);
  for (const tag of [
    "v0.1.0",
    "unknown-v0.1.0",
    "pi-local-settings-v0.1",
    "pi-local-settings-v00.1.0",
    "pi-local-settings-v0.1.0-beta",
    "pi-local-settings-v0.1.0;echo injected",
    "pi-local-settings-v0.1.0\n",
  ]) {
    assert.throws(() => packageForTag(tag, packages));
  }
  assert.throws(() =>
    validateReleaseTag(
      "pi-local-settings-v0.2.0",
      "0.1.0",
      "pi-local-settings",
    ),
  );
  const overlapping = [
    ...packages,
    { ...packages[1], component: "pi-example-v1" },
  ];
  assert.equal(
    packageForTag("pi-example-v1-v1.0.0", overlapping).component,
    "pi-example-v1",
  );
});

test("release allowlist rejects root/traversal, duplicate components and private workspaces", async (t) => {
  const f = await fixture(t);
  await seedPackages(f);
  for (const path of [
    ".",
    "packages/../escape",
    "packages/*",
    "packages/pi-example\n",
  ]) {
    const config = releaseConfig();
    await f.file(
      join(f.root, "release-please-config.json"),
      JSON.stringify({
        ...config,
        packages: { [path]: config.packages["packages/pi-example"] },
      }),
    );
    await assert.rejects(readReleasePackages(f.root));
  }
  const config = releaseConfig();
  config.packages["packages/pi-example"].component = "pi-local-settings";
  await f.file(
    join(f.root, "release-please-config.json"),
    JSON.stringify(config),
  );
  await assert.rejects(readReleasePackages(f.root), /unique/);
  await seedPackages(f);
  await f.file(
    join(f.root, "packages/pi-example/package.json"),
    JSON.stringify({
      name: "@chenwei791129/pi-example",
      version: "2.3.4",
      private: true,
    }),
  );
  await assert.rejects(readReleasePackages(f.root), /private/);
});

test("release guard selects only the tagged workspace and verifies SHA/main, including dispatch", async (t) => {
  const f = await fixture(t);
  await seedPackages(f);
  const git = (...args: string[]) =>
    execFileSync("git", args, {
      cwd: f.root,
      encoding: "utf8",
      env: {
        ...process.env,
        GIT_CONFIG_GLOBAL: "/dev/null",
        GIT_CONFIG_NOSYSTEM: "1",
      },
    }).trim();
  git("init", "-b", "main");
  git("config", "user.name", "Test");
  git("config", "user.email", "test@example.invalid");
  git(
    "add",
    "release-please-config.json",
    "packages/pi-local-settings/package.json",
    "packages/pi-example/package.json",
  );
  git("commit", "-m", "test baseline");
  const sha = git("rev-parse", "HEAD");
  git("update-ref", "refs/remotes/origin/main", sha);
  git("tag", "pi-local-settings-v0.1.0");
  git("tag", "pi-example-v2.3.4");
  const output = join(f.root, "github-output");
  const env = {
    ...process.env,
    GITHUB_REPOSITORY: "chenwei791129/pi-extensions",
    GITHUB_REF_TYPE: "tag",
    GITHUB_REF_NAME: "pi-local-settings-v0.1.0",
    GITHUB_REF: "refs/tags/pi-local-settings-v0.1.0",
    GITHUB_WORKFLOW_REF:
      "chenwei791129/pi-extensions/.github/workflows/publish-pi-local-settings.yml@refs/tags/pi-local-settings-v0.1.0",
    GITHUB_SHA: sha,
    NPM_BOOTSTRAP_ENABLED: "false",
    GITHUB_OUTPUT: output,
  };
  const run = (overrides = {}) =>
    execFileSync(process.execPath, [resolve("scripts/release.ts")], {
      cwd: f.root,
      env: { ...env, ...overrides },
      encoding: "utf8",
      stdio: "pipe",
    });
  assert.match(run(), /Validated/);
  assert.match(
    run({ EXPECTED_PACKAGE_PATH: "packages/pi-local-settings" }),
    /Validated/,
  );
  assert.throws(() =>
    run({
      EXPECTED_PACKAGE_PATH: "packages/pi-local-settings",
      GITHUB_WORKFLOW_REF: "other-caller",
    }),
  );
  const previewEnv = {
    ...env,
    GITHUB_REF: "refs/heads/main",
    GITHUB_REF_TYPE: "branch",
    GITHUB_EVENT_NAME: "workflow_dispatch",
    EXPECTED_PACKAGE_PATH: "packages/pi-local-settings",
    GITHUB_WORKFLOW_REF:
      "chenwei791129/pi-extensions/.github/workflows/publish-pi-local-settings.yml@refs/heads/main",
  };
  const preview = (overrides = {}) =>
    execFileSync(process.execPath, [resolve("scripts/preview-release.ts")], {
      cwd: f.root,
      env: { ...previewEnv, ...overrides },
      encoding: "utf8",
      stdio: "pipe",
    });
  assert.match(preview(), /no tag or publication/);
  for (const overrides of [
    { GITHUB_EVENT_NAME: "push" },
    { GITHUB_REF: "refs/heads/other" },
    { GITHUB_REF_TYPE: "tag" },
    { GITHUB_SHA: "bad" },
    { EXPECTED_PACKAGE_PATH: "packages/unknown" },
    { EXPECTED_PACKAGE_PATH: "packages/pi-example" },
    { GITHUB_WORKFLOW_REF: "other-caller" },
  ])
    assert.throws(() => preview(overrides));
  assert.match(
    await readFile(output, "utf8"),
    /package_path=packages\/pi-local-settings/,
  );
  // A global bootstrap flag must not send this package the first package's token.
  assert.match(
    run({
      GITHUB_EVENT_NAME: "workflow_dispatch",
      GITHUB_REF_NAME: "pi-example-v2.3.4",
      NPM_BOOTSTRAP_ENABLED: "true",
    }),
    /packages\/pi-example/,
  );
  assert.match(
    await readFile(output, "utf8"),
    /component=pi-example\nbootstrap=false/,
  );
  for (const overrides of [
    { GITHUB_SHA: "bad" },
    { GITHUB_REF_TYPE: "branch" },
    { GITHUB_REPOSITORY: "other/repo" },
    { GITHUB_REF_NAME: "pi-local-settings-v0.2.0" },
    { EXPECTED_PACKAGE_PATH: "packages/pi-example" },
  ])
    assert.throws(() => run(overrides));
  await f.file(join(f.root, "change.txt"), "Unmerged commit");
  git("add", "change.txt");
  git("commit", "-m", "test unmerged");
  const unmerged = git("rev-parse", "HEAD");
  git("tag", "-f", "pi-local-settings-v0.1.0");
  assert.throws(() => run({ GITHUB_SHA: unmerged }));
});
