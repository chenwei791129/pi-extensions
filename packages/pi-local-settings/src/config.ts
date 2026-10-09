import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { open, realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

export const RESOURCE_FIELDS = ["skills", "prompts", "themes"] as const;
export const MAX_CONFIG_BYTES = 64 * 1024;
export type ResourceField = (typeof RESOURCE_FIELDS)[number];
export type ResourcePaths = Record<ResourceField, string[]>;
export interface LocalConfig {
  source: string;
  status: "missing" | "invalid" | "valid";
  paths: ResourcePaths;
  diagnostics: string[];
  fingerprint?: string;
}

export function emptyPaths(): ResourcePaths {
  return { skills: [], prompts: [], themes: [] };
}

function errorCode(error: unknown): string {
  return (error as NodeJS.ErrnoException).code ?? "unknown error";
}

// Quote paths before rendering them in a terminal; never render raw JSON values.
export function displayPath(path: string): string {
  return JSON.stringify(path);
}

export async function readLocalConfig(cwd: string): Promise<LocalConfig> {
  const source = resolve(cwd, ".pi/settings.local.json");
  const result: LocalConfig = {
    source,
    status: "missing",
    paths: emptyPaths(),
    diagnostics: [],
  };
  const invalid = (message: string): LocalConfig => {
    result.status = "invalid";
    result.diagnostics.push(message);
    return result;
  };

  let content: string;
  let identity: string;
  try {
    // Nonblocking open plus fstat avoids hanging on a FIFO and bounds the read
    // even if the file grows after stat. Symlinked regular config files are OK.
    const file = await open(source, constants.O_RDONLY | constants.O_NONBLOCK);
    try {
      const info = await file.stat();
      if (!info.isFile())
        return invalid("Configuration must be a regular file.");
      if (info.size > MAX_CONFIG_BYTES)
        return invalid("Configuration exceeds 64 KiB.");
      const buffer = Buffer.alloc(MAX_CONFIG_BYTES + 1);
      let length = 0;
      while (length < buffer.length) {
        const { bytesRead } = await file.read(
          buffer,
          length,
          buffer.length - length,
          null,
        );
        if (bytesRead === 0) break;
        length += bytesRead;
      }
      if (length > MAX_CONFIG_BYTES)
        return invalid("Configuration exceeds 64 KiB.");
      content = buffer.subarray(0, length).toString("utf8");
      identity = JSON.stringify([
        await realpath(cwd),
        await realpath(source),
        info.dev,
        info.ino,
      ]);
    } finally {
      await file.close();
    }
  } catch (error) {
    if (errorCode(error) === "ENOENT") return result;
    return invalid(`Cannot read configuration (${errorCode(error)}).`);
  }

  let value: unknown;
  try {
    value = JSON.parse(content);
  } catch {
    // JSON.parse errors can contain fragments of secrets from the input.
    return invalid("Malformed JSON; configuration was not applied.");
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return invalid("Configuration root must be an object.");
  }
  result.status = "valid";
  const object = value as Record<string, unknown>;
  const unknownCount = Object.keys(object).filter(
    (key) => !RESOURCE_FIELDS.includes(key as ResourceField),
  ).length;
  if (unknownCount) {
    result.diagnostics.push(
      `Ignored ${unknownCount} unsupported root field(s); v1 supports only skills, prompts, themes.`,
    );
  }
  for (const field of RESOURCE_FIELDS) {
    if (!Object.hasOwn(object, field)) continue;
    const entries = object[field];
    if (!Array.isArray(entries)) {
      result.diagnostics.push(`${field}: expected an array; field ignored.`);
      continue;
    }
    const seen = new Set<string>();
    for (const [index, entry] of entries.entries()) {
      const label = `${field}[${index}]`;
      if (typeof entry !== "string" || !entry.trim()) {
        result.diagnostics.push(
          `${label}: expected a nonempty path string; item ignored.`,
        );
        continue;
      }
      const hasControl = [...entry].some(
        (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127,
      );
      if (
        (/^[!+\-~]/.test(entry) && !entry.startsWith("~/")) ||
        /[*?[\]{}$]/.test(entry) ||
        hasControl
      ) {
        result.diagnostics.push(
          `${label}: v1 does not support glob/filter syntax, ~user, variable expansion, or control characters (even in literal filenames); item ignored.`,
        );
        continue;
      }
      const requested = entry.startsWith("~/")
        ? join(homedir(), entry.slice(2))
        : resolve(cwd, ".pi", entry);
      try {
        const canonical = await realpath(requested);
        // Pi 1.1.0 trims extension paths. Reject instead of approving one
        // directory while the host silently loads a different sibling.
        if (canonical !== canonical.trim()) {
          result.diagnostics.push(
            `${label}: v1 rejects canonical paths with leading/trailing whitespace because Pi trims resource paths; item ignored.`,
          );
          continue;
        }
        const info = await stat(canonical);
        if (!info.isDirectory() && !info.isFile()) {
          result.diagnostics.push(
            `${label}: target is not a regular file or directory; item ignored.`,
          );
          continue;
        }
        const suffix = field === "themes" ? ".json" : ".md";
        if (info.isFile() && !canonical.endsWith(suffix)) {
          result.diagnostics.push(
            `${label}: Pi requires ${suffix} files; item ignored.`,
          );
          continue;
        }
        if (canonical !== requested) {
          result.diagnostics.push(
            `${label}: resolved ${displayPath(requested)} to ${displayPath(canonical)}.`,
          );
        }
        if (!seen.has(canonical)) {
          seen.add(canonical);
          result.paths[field].push(canonical);
        }
      } catch (error) {
        result.diagnostics.push(
          `${label}: target unavailable (${errorCode(error)}); item ignored.`,
        );
      }
    }
  }
  result.fingerprint = createHash("sha256")
    .update(JSON.stringify([identity, content, result.paths]))
    .digest("hex");
  return result;
}
