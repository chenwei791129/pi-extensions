import { join } from "node:path";
import { readReleasePackages } from "../../../scripts/release-config.ts";
import type { fixture } from "./helpers.ts";

export function releaseConfig() {
  return {
    "release-type": "node",
    "include-component-in-tag": true,
    "include-v-in-tag": true,
    "tag-separator": "-",
    plugins: ["node-workspace"],
    packages: {
      "packages/pi-local-settings": {
        component: "pi-local-settings",
        "initial-version": "0.1.0",
      },
      "packages/pi-example": {
        component: "pi-example",
        "initial-version": "0.1.0",
      },
    },
  };
}

export async function seedPackages(f: Awaited<ReturnType<typeof fixture>>) {
  await f.file(
    join(f.root, "release-please-config.json"),
    JSON.stringify(releaseConfig()),
  );
  await f.file(join(f.root, ".release-please-manifest.json"), "{}");
  for (const [name, version] of [
    ["pi-local-settings", "0.1.0"],
    ["pi-example", "2.3.4"],
  ]) {
    await f.file(
      join(f.root, `packages/${name}/package.json`),
      JSON.stringify({ name: `@chenwei791129/${name}`, version }),
    );
  }
  return readReleasePackages(f.root);
}
