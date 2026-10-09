import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateCaller } from "./release.ts";
import { readReleasePackages } from "./release-config.ts";

export async function validatePreview(
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  assert.equal(env.GITHUB_REPOSITORY, "chenwei791129/pi-extensions");
  assert.equal(env.GITHUB_EVENT_NAME, "workflow_dispatch");
  assert.equal(env.GITHUB_REF, "refs/heads/main");
  assert.equal(env.GITHUB_REF_TYPE, "branch");
  const target = (await readReleasePackages()).find(
    (pkg) => pkg.path === env.EXPECTED_PACKAGE_PATH,
  );
  assert.ok(target, "Preview requires a configured package.");
  validateCaller(target, env);
  const git = (...args: string[]) =>
    execFileSync("git", args, { encoding: "utf8" }).trim();
  const commit = git("rev-parse", "HEAD");
  assert.equal(
    commit,
    env.GITHUB_SHA,
    "Preview checkout must match the main event.",
  );
  git("merge-base", "--is-ancestor", commit, "origin/main");
  console.log(
    `Preview ${target.name}@${target.version} at ${commit}; no tag or publication.`,
  );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await validatePreview();
}
