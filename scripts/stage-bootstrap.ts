import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { packageForTag, readReleasePackages } from "./release-config.ts";

export const BOOTSTRAP_TAG = "pi-local-settings-v0.1.0";
export const BOOTSTRAP_COMMIT = "95ee14c169b60416bc959fa7f2a75c23e044525d";
const PACKAGE_PATH = "packages/pi-local-settings";

export async function validateStagedBootstrap(
  env: NodeJS.ProcessEnv = process.env,
  request: typeof fetch = fetch,
  root = ".",
): Promise<void> {
  assert.equal(env.GITHUB_REPOSITORY, "chenwei791129/pi-extensions");
  assert.equal(env.GITHUB_EVENT_NAME, "workflow_dispatch");
  assert.equal(env.GITHUB_REF, "refs/heads/main");
  assert.equal(env.NPM_BOOTSTRAP_ENABLED, "true");
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  const automationCommit = env.GITHUB_SHA;
  assert.ok(
    typeof automationCommit === "string" &&
      /^[0-9a-f]{40}$/.test(automationCommit),
  );
  assert.equal(
    git("rev-parse", "HEAD"),
    automationCommit,
    "Automation checkout must match the event commit.",
  );
  assert.equal(
    git("rev-parse", `refs/tags/${BOOTSTRAP_TAG}^{commit}`),
    BOOTSTRAP_COMMIT,
    "The approved release tag must not move.",
  );
  git("merge-base", "--is-ancestor", automationCommit, "origin/main");
  git("merge-base", "--is-ancestor", BOOTSTRAP_COMMIT, "origin/main");
  const pkg = packageForTag(BOOTSTRAP_TAG, await readReleasePackages(root));
  assert.equal(pkg.path, PACKAGE_PATH);
  assert.equal(pkg.name, "@chenwei791129/pi-local-settings");
  assert.equal(pkg.version, "0.1.0");
  const response = await request(
    `https://registry.npmjs.org/${encodeURIComponent(pkg.name)}`,
    { signal: AbortSignal.timeout(15_000) },
  );
  assert.equal(
    response.status,
    404,
    "Package already exists or has a pending stage. Inspect/approve the existing stage; do not upload again.",
  );

  // npm provenance records the main automation commit. Require its payload to
  // be byte-identical to the immutable approved tag, without spoofing GitHub env.
  const destination = await mkdtemp(join(tmpdir(), "pi-stage-pack-"));
  const releaseRoot = join(destination, "release");
  let worktreeAdded = false;
  try {
    git("worktree", "add", "--detach", releaseRoot, BOOTSTRAP_COMMIT);
    worktreeAdded = true;
    const pack = (cwd: string) => {
      const result = JSON.parse(
        execFileSync(
          "npm",
          [
            "pack",
            "--workspace",
            PACKAGE_PATH,
            "--ignore-scripts",
            "--json",
            "--pack-destination",
            destination,
          ],
          { cwd, encoding: "utf8", stdio: "pipe" },
        ),
      );
      assert.equal(result.length, 1);
      assert.equal(result[0].name, pkg.name);
      assert.equal(result[0].version, "0.1.0");
      assert.ok(typeof result[0].integrity === "string");
      return result[0].integrity;
    };
    const integrity = pack(root);
    assert.equal(
      integrity,
      pack(releaseRoot),
      "Main tarball must exactly match the approved 0.1.0 tag.",
    );
    console.log(
      `Approved payload: ${integrity}; automation: ${automationCommit}.`,
    );
  } finally {
    try {
      if (worktreeAdded) git("worktree", "remove", "--force", releaseRoot);
    } finally {
      await rm(destination, { recursive: true, force: true });
    }
  }
  console.log(
    `Validated staged bootstrap for ${BOOTSTRAP_TAG} at ${BOOTSTRAP_COMMIT}.`,
  );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  // Normal CI imports the payload guard with bundled npm. Only this workflow
  // entry point requires the stage-capable CLI pinned by stage-bootstrap.yml.
  const [major, minor] = execFileSync("npm", ["--version"], {
    encoding: "utf8",
  })
    .trim()
    .split(".")
    .map(Number);
  assert.ok(
    major > 11 || (major === 11 && minor >= 15),
    "Staged publishing requires npm >=11.15.0.",
  );
  await validateStagedBootstrap();
}
