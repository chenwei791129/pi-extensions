import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { appendFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  packageForTag,
  type ReleasePackage,
  readReleasePackages,
} from "./release-config.ts";

export const BOOTSTRAP_PACKAGE = "@chenwei791129/pi-local-settings";

export function bootstrapRequested(
  pkg: ReleasePackage,
  enabled: string | undefined,
): boolean {
  // The existing bootstrap token is authorized for this package only. Adding a
  // workspace must never silently extend its token-backed publishing authority.
  return enabled === "true" && pkg.name === BOOTSTRAP_PACKAGE;
}

export async function validateRelease(
  env: NodeJS.ProcessEnv = process.env,
): Promise<ReleasePackage> {
  assert.equal(env.GITHUB_REPOSITORY, "chenwei791129/pi-extensions");
  assert.equal(
    env.GITHUB_REF_TYPE,
    "tag",
    "Releases require a version tag, including dispatched runs.",
  );
  const tag = env.GITHUB_REF_NAME ?? "";
  const target = packageForTag(tag, await readReleasePackages());
  assert.equal(
    tag,
    `${target.component}-v${target.version}`,
    "Tag and package version must match.",
  );
  if (env.EXPECTED_PACKAGE_PATH)
    assert.equal(target.path, env.EXPECTED_PACKAGE_PATH);
  const git = (...args: string[]) =>
    execFileSync("git", args, { encoding: "utf8" }).trim();
  const commit = git("rev-parse", "HEAD");
  assert.equal(commit, env.GITHUB_SHA, "Checkout must match the event commit.");
  assert.equal(git("rev-parse", `refs/tags/${tag}^{commit}`), commit);
  git("merge-base", "--is-ancestor", commit, "origin/main");
  const npmVersion = execFileSync("npm", ["--version"], { encoding: "utf8" })
    .trim()
    .split(".")
    .map(Number);
  assert.ok(
    npmVersion[0] > 11 ||
      (npmVersion[0] === 11 &&
        (npmVersion[1] > 5 || (npmVersion[1] === 5 && npmVersion[2] >= 1))),
    "Trusted publishing requires npm >=11.5.1.",
  );
  const bootstrap = bootstrapRequested(target, env.NPM_BOOTSTRAP_ENABLED);
  if (bootstrap) {
    assert.equal(
      target.version,
      "0.1.0",
      "Token bootstrap is only for the first pi-local-settings release.",
    );
    const response = await fetch(
      `https://registry.npmjs.org/${encodeURIComponent(target.name)}`,
      { signal: AbortSignal.timeout(15_000) },
    );
    assert.equal(
      response.status,
      404,
      "Bootstrap requires an unpublished package; use OIDC for existing packages.",
    );
  }
  if (env.GITHUB_OUTPUT) {
    await appendFile(
      env.GITHUB_OUTPUT,
      `package_path=${target.path}\ncomponent=${target.component}\nbootstrap=${bootstrap}\n`,
    );
  }
  console.log(`Validated ${tag} at ${commit} (${target.path}).`);
  return target;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await validateRelease();
}
