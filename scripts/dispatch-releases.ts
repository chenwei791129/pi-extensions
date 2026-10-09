import assert from "node:assert/strict";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  type ReleasePackage,
  readReleasePackages,
  validateReleaseTag,
} from "./release-config.ts";

export interface DispatchRequest {
  workflow: "ci.yml" | "publish.yml";
  ref: string;
}
export type GitHubRequest = (
  path: string,
  body?: Record<string, unknown>,
) => Promise<unknown>;

interface ReleasePleaseOutput {
  releases: { path: string; tag: string; version: string }[];
  pullRequests: { number: number; headBranchName: string }[];
}

function decodeOutputs(raw: string): ReleasePleaseOutput {
  try {
    const value: unknown = JSON.parse(raw);
    assert.ok(value && typeof value === "object" && !Array.isArray(value));
    const outputs = value as Record<string, unknown>;
    const paths: unknown = JSON.parse(String(outputs.paths_released ?? "[]"));
    const prs: unknown = JSON.parse(String(outputs.prs ?? "[]"));
    assert.ok(Array.isArray(paths) && Array.isArray(prs));
    const releases = paths.map((path: unknown) => {
      assert.ok(typeof path === "string");
      const tag = outputs[`${path}--tag_name`];
      const version = outputs[`${path}--version`];
      assert.ok(typeof tag === "string");
      assert.ok(typeof version === "string");
      return { path, tag, version };
    });
    const pullRequests = prs.map((pr: unknown) => {
      assert.ok(pr && typeof pr === "object" && !Array.isArray(pr));
      const item = pr as Record<string, unknown>;
      const { number, headBranchName } = item;
      assert.ok(
        typeof number === "number" &&
          Number.isSafeInteger(number) &&
          number > 0,
      );
      assert.ok(typeof headBranchName === "string");
      return { number, headBranchName };
    });
    return { releases, pullRequests };
  } catch {
    throw new Error("Invalid release-please outputs.");
  }
}

export async function buildDispatches(
  raw: string,
  packages: ReleasePackage[],
  request: GitHubRequest,
): Promise<DispatchRequest[]> {
  const { releases, pullRequests } = decodeOutputs(raw);
  const result: DispatchRequest[] = [];
  for (const { path, tag, version } of releases) {
    const pkg = packages.find((pkg) => pkg.path === path);
    assert.ok(pkg, "Release output names an unconfigured package.");
    validateReleaseTag(tag, version, pkg.component);
    result.push({ workflow: "publish.yml", ref: tag });
  }
  for (const pr of pullRequests) {
    assert.ok(pr.headBranchName.startsWith("release-please--branches--main"));
    const details = (await request(`pulls/${pr.number}`)) as {
      state: string;
      base: { ref: string };
      head: { ref: string; repo: { full_name: string } | null };
    };
    assert.equal(details.state, "open");
    assert.equal(details.base.ref, "main");
    assert.equal(details.head.repo?.full_name, "chenwei791129/pi-extensions");
    assert.equal(details.head.ref, pr.headBranchName);
    result.push({ workflow: "ci.yml", ref: pr.headBranchName });
  }
  // Validate every output before dispatching anything. Do not retry ambiguous
  // API failures automatically: inspect Actions and registry before recovery.
  return result.filter(
    (item, index) =>
      result.findIndex(
        (other) => other.workflow === item.workflow && other.ref === item.ref,
      ) === index,
  );
}

export async function dispatchAll(
  dispatches: DispatchRequest[],
  request: GitHubRequest,
): Promise<void> {
  const failed: string[] = [];
  for (const { workflow, ref } of dispatches) {
    try {
      await request(`actions/workflows/${workflow}/dispatches`, { ref });
      console.log(`Dispatched ${workflow} at ${ref}.`);
    } catch {
      failed.push(`${workflow} at ${ref}`);
    }
  }
  assert.equal(
    failed.length,
    0,
    `Dispatch failed (inspect run state before retrying): ${failed.join(", ")}`,
  );
}

export async function dispatchReleasePlease(
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  assert.equal(env.GITHUB_REPOSITORY, "chenwei791129/pi-extensions");
  assert.equal(env.GITHUB_REF, "refs/heads/main");
  assert.ok(env.GITHUB_TOKEN, "The workflow token is required.");
  const request: GitHubRequest = async (path, body) => {
    const response = await fetch(
      `https://api.github.com/repos/chenwei791129/pi-extensions/${path}`,
      {
        method: body ? "POST" : "GET",
        headers: {
          Authorization: `Bearer ${env.GITHUB_TOKEN}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(15_000),
      },
    );
    assert.ok(response.ok, `GitHub request failed (${response.status}).`);
    return response.status === 204 ? undefined : response.json();
  };
  const dispatches = await buildDispatches(
    env.RELEASE_PLEASE_OUTPUTS ?? "{}",
    await readReleasePackages(),
    request,
  );
  await dispatchAll(dispatches, request);
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await dispatchReleasePlease();
}
