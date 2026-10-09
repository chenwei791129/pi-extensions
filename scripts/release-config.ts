import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export interface ReleasePackage {
  path: string;
  component: string;
  name: string;
  version: string;
  initialVersion: string;
}

export async function readJson(path: string): Promise<Record<string, unknown>> {
  try {
    const value: unknown = JSON.parse(await readFile(path, "utf8"));
    assert.ok(value && typeof value === "object" && !Array.isArray(value));
    return value as Record<string, unknown>;
  } catch {
    throw new Error(`Cannot read JSON object from ${path}.`);
  }
}

export function validateReleaseTag(
  tag: string,
  version: string,
  component: string,
): void {
  assert.match(component, /^[a-z0-9][a-z0-9-]*$/);
  assert.equal(component.trim(), component);
  assert.match(version, /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/);
  assert.equal(version.trim(), version);
  assert.equal(
    tag,
    `${component}-v${version}`,
    "Tag must match package component and version exactly.",
  );
}

export function packageForTag(
  tag: string,
  packages: ReleasePackage[],
): ReleasePackage {
  const match =
    /^([a-z0-9][a-z0-9-]*)-v((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))$/.exec(
      tag,
    );
  assert.ok(
    match && match[0] === tag,
    "Expected a package-vX.Y.Z release tag.",
  );
  const target = packages.find((pkg) => pkg.component === match[1]);
  assert.ok(target, "Release tag must belong to a configured package.");
  validateReleaseTag(tag, match[2], target.component);
  return target;
}

export async function readReleasePackages(
  root = ".",
): Promise<ReleasePackage[]> {
  const config = await readJson(join(root, "release-please-config.json"));
  assert.equal(config["release-type"], "node");
  assert.equal(config["include-component-in-tag"], true);
  assert.equal(config["include-v-in-tag"], true);
  assert.equal(config["tag-separator"], "-");
  const entries = config.packages;
  assert.ok(entries && typeof entries === "object" && !Array.isArray(entries));
  const result: ReleasePackage[] = [];
  for (const [path, options] of Object.entries(entries)) {
    assert.match(path, /^packages\/[a-z0-9][a-z0-9-]*$/);
    assert.equal(path.trim(), path);
    assert.ok(
      options && typeof options === "object" && !Array.isArray(options),
    );
    const settings = options as Record<string, unknown>;
    for (const key of [
      "release-type",
      "include-component-in-tag",
      "include-v-in-tag",
      "tag-separator",
    ]) {
      assert.equal(
        settings[key] ?? config[key],
        config[key],
        `Package ${path} must keep the shared ${key} contract.`,
      );
    }
    const { component } = settings;
    const initialVersion = settings["initial-version"];
    assert.ok(typeof component === "string");
    assert.ok(typeof initialVersion === "string");
    validateReleaseTag(
      `${component}-v${initialVersion}`,
      initialVersion,
      component,
    );
    assert.ok(
      !result.some((pkg) => pkg.component === component),
      "Components must be unique.",
    );
    const manifest = await readJson(join(root, path, "package.json"));
    assert.ok(
      manifest.private === undefined || manifest.private === false,
      "Root/private packages must not be released.",
    );
    const { name, version } = manifest;
    assert.ok(typeof name === "string");
    assert.match(name, /^@chenwei791129\/[a-z0-9][a-z0-9-]*$/);
    assert.equal(name.trim(), name);
    assert.ok(typeof version === "string");
    validateReleaseTag(`${component}-v${version}`, version, component);
    assert.ok(
      !result.some((pkg) => pkg.name === name),
      "Package names must be unique.",
    );
    result.push({ path, component, name, version, initialVersion });
  }
  assert.ok(result.length, "At least one package must be configured.");
  return result;
}
