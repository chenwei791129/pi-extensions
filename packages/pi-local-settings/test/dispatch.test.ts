import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildDispatches,
  dispatchAll,
  type GitHubRequest,
} from "../../../scripts/dispatch-releases.ts";
import { fixture } from "./helpers.ts";
import { seedPackages } from "./release-helper.ts";

function outputs() {
  return {
    paths_released: JSON.stringify([
      "packages/pi-local-settings",
      "packages/pi-example",
    ]),
    "packages/pi-local-settings--tag_name": "pi-local-settings-v0.1.0",
    "packages/pi-local-settings--version": "0.1.0",
    "packages/pi-example--tag_name": "pi-example-v2.3.4",
    "packages/pi-example--version": "2.3.4",
    prs: JSON.stringify([
      { number: 1, headBranchName: "release-please--branches--main" },
    ]),
  };
}

const prDetails = {
  state: "open",
  base: { ref: "main" },
  head: {
    ref: "release-please--branches--main",
    repo: { full_name: "chenwei791129/pi-extensions" },
  },
};

test("each independently tagged package is dispatched; bot Release PR gets explicit read-only CI", async (t) => {
  const f = await fixture(t);
  const packages = await seedPackages(f);
  const requested: { path: string; body?: Record<string, unknown> }[] = [];
  const request: GitHubRequest = async (path, body) => {
    requested.push({ path, body });
    return prDetails;
  };
  const dispatches = await buildDispatches(
    JSON.stringify(outputs()),
    packages,
    request,
  );
  assert.deepEqual(dispatches, [
    {
      workflow: "publish-pi-local-settings.yml",
      ref: "pi-local-settings-v0.1.0",
    },
    { workflow: "publish-pi-example.yml", ref: "pi-example-v2.3.4" },
    { workflow: "ci.yml", ref: "release-please--branches--main" },
  ]);
  assert.deepEqual(requested, [{ path: "pulls/1", body: undefined }]);
  await dispatchAll(dispatches, request);
  assert.deepEqual(
    requested.slice(1).map((r) => r.body),
    dispatches.map((r) => ({ ref: r.ref })),
  );
  const noEvents = await buildDispatches("{}", packages, request);
  assert.deepEqual(noEvents, []);
});

test("dispatch planning fails closed for invalid/unconfigured tags and foreign PRs", async (t) => {
  const f = await fixture(t);
  const packages = await seedPackages(f);
  for (const raw of [
    "broken",
    "null",
    JSON.stringify({ ...outputs(), paths_released: '"not-an-array"' }),
    JSON.stringify({
      ...outputs(),
      "packages/pi-example--tag_name": "pi-local-settings-v2.3.4",
    }),
    JSON.stringify({
      ...outputs(),
      "packages/pi-example--tag_name": "pi-example-v2.3.4\n",
    }),
    JSON.stringify({ ...outputs(), paths_released: '["packages/unknown"]' }),
    JSON.stringify({
      ...outputs(),
      prs: '[{"number":1,"headBranchName":"main"}]',
    }),
  ]) {
    await assert.rejects(buildDispatches(raw, packages, async () => prDetails));
  }
  for (const details of [
    { ...prDetails, state: "closed" },
    { ...prDetails, base: { ref: "other" } },
    {
      ...prDetails,
      head: { ...prDetails.head, repo: { full_name: "other/repo" } },
    },
    { ...prDetails, head: { ...prDetails.head, ref: "other" } },
  ])
    await assert.rejects(
      buildDispatches(JSON.stringify(outputs()), packages, async () => details),
    );
});

test("deduplicate dispatches and attempt other packages after a failure without blind retries", async (t) => {
  const f = await fixture(t);
  const packages = await seedPackages(f);
  const data = {
    ...outputs(),
    paths_released: '["packages/pi-example","packages/pi-example"]',
    prs: "[]",
  };
  assert.equal(
    (
      await buildDispatches(
        JSON.stringify(data),
        packages,
        async () => prDetails,
      )
    ).length,
    1,
  );
  const attempted: string[] = [];
  await assert.rejects(
    dispatchAll(
      [
        {
          workflow: "publish-pi-local-settings.yml",
          ref: "pi-local-settings-v0.1.0",
        },
        { workflow: "publish-pi-example.yml", ref: "pi-example-v2.3.4" },
      ],
      async (_path, body) => {
        const ref = String(body?.ref);
        attempted.push(ref);
        if (ref.startsWith("pi-local-settings"))
          throw new Error("Transient error");
      },
    ),
    /inspect run state/,
  );
  assert.deepEqual(attempted, [
    "pi-local-settings-v0.1.0",
    "pi-example-v2.3.4",
  ]);
});
