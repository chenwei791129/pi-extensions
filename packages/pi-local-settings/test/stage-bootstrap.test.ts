import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { test } from "node:test";
import {
  BOOTSTRAP_COMMIT,
  BOOTSTRAP_TAG,
  validateStagedBootstrap,
} from "../../../scripts/stage-bootstrap.ts";
import { fixture } from "./helpers.ts";

test("staged bootstrap uses a main event, immutable approved tag and byte-identical tarball; fails closed for existing stages", async (t) => {
  const f = await fixture(t);
  const root = join(f.root, "repo");
  const gitEnv = {
    ...process.env,
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_NOSYSTEM: "1",
  };
  const git = (...args: string[]) =>
    execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      env: gitEnv,
      stdio: "pipe",
    }).trim();
  execFileSync("git", ["clone", "--no-local", resolve("."), root], {
    stdio: "pipe",
    env: gitEnv,
  });
  // Keep the release fixture stable after main advances to newer versions.
  git("checkout", "-B", "main", BOOTSTRAP_COMMIT);
  git("config", "user.name", "Test");
  git("config", "user.email", "test@example.invalid");
  await f.file(
    join(root, "automation.txt"),
    "New automation, identical package payload",
  );
  git("add", "automation.txt");
  git("commit", "-m", "test automation update");
  const automationCommit = git("rev-parse", "HEAD");
  assert.notEqual(automationCommit, BOOTSTRAP_COMMIT);
  git("update-ref", "refs/remotes/origin/main", automationCommit);
  const env = {
    GITHUB_REPOSITORY: "chenwei791129/pi-extensions",
    GITHUB_EVENT_NAME: "workflow_dispatch",
    GITHUB_REF: "refs/heads/main",
    GITHUB_SHA: git("rev-parse", "HEAD"),
    NPM_BOOTSTRAP_ENABLED: "true",
  };
  let calls = 0;
  const missing: typeof fetch = async (url) => {
    calls++;
    assert.equal(
      url,
      "https://registry.npmjs.org/%40chenwei791129%2Fpi-local-settings",
    );
    return new Response(null, { status: 404 });
  };
  await validateStagedBootstrap(env, missing, root);
  assert.equal(calls, 1);
  assert.equal(git("rev-parse", `${BOOTSTRAP_TAG}^{commit}`), BOOTSTRAP_COMMIT);
  assert.equal(git("status", "--porcelain"), "");
  assert.equal(
    git("worktree", "list", "--porcelain").match(/^worktree /gm)?.length,
    1,
  );
  for (const overrides of [
    { GITHUB_EVENT_NAME: "push" },
    { GITHUB_REF: `refs/tags/${BOOTSTRAP_TAG}` },
    { GITHUB_REPOSITORY: "other/repo" },
    { GITHUB_SHA: "bad" },
    { NPM_BOOTSTRAP_ENABLED: "false" },
  ]) {
    await assert.rejects(
      validateStagedBootstrap({ ...env, ...overrides }, missing, root),
    );
  }
  assert.equal(calls, 1);
  for (const status of [200, 403, 429, 503]) {
    const existing: typeof fetch = async () => new Response(null, { status });
    await assert.rejects(
      validateStagedBootstrap(env, existing, root),
      /already exists or has a pending stage/,
    );
  }
  const readme = join(root, "packages/pi-local-settings/README.md");
  await f.file(readme, `${await readFile(readme, "utf8")}\nChanged payload\n`);
  await assert.rejects(
    validateStagedBootstrap(env, missing, root),
    /exactly match/,
  );
  assert.equal(
    git("worktree", "list", "--porcelain").match(/^worktree /gm)?.length,
    1,
  );
  git("checkout", "--", "packages/pi-local-settings/README.md");
  await f.file(join(root, "change.txt"), "Not on origin/main");
  git("add", "change.txt");
  git("commit", "-m", "test unmerged automation");
  const unmerged = git("rev-parse", "HEAD");
  await assert.rejects(
    validateStagedBootstrap({ ...env, GITHUB_SHA: unmerged }, missing, root),
  );
  git("update-ref", "refs/remotes/origin/main", unmerged);
  git("tag", "-f", BOOTSTRAP_TAG);
  await assert.rejects(
    validateStagedBootstrap({ ...env, GITHUB_SHA: unmerged }, missing, root),
    /must not move/,
  );
});
