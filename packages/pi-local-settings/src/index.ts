import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import {
  displayPath,
  emptyPaths,
  type LocalConfig,
  RESOURCE_FIELDS,
  readLocalConfig,
} from "./config.ts";

const TRUST_ENTRY = "pi-local-settings:authorization:v1";
interface Authorization {
  sessionId: string;
  fingerprint: string;
  allowed?: boolean;
}
interface Discovery {
  config: LocalConfig;
  authorization: string;
}

function report(ctx: ExtensionContext, message: string, warning = false): void {
  if (ctx.mode === "tui" && ctx.hasUI) {
    ctx.ui.notify(message, warning ? "warning" : "info");
  } else {
    process.stderr.write(`[pi-local-settings] ${message}\n`);
  }
}

function describe(config: LocalConfig): string {
  return [
    `Source: ${displayPath(config.source)} (${config.status})`,
    ...RESOURCE_FIELDS.map(
      (field) =>
        `${field}: ${config.paths[field].map(displayPath).join(", ") || "(none)"}`,
    ),
  ].join("\n");
}

function remembered(ctx: ExtensionContext): Authorization | undefined {
  const sessionId = ctx.sessionManager.getSessionId();
  // Read the active branch, not abandoned decisions. Session ID prevents a fork
  // or copied history from silently authorizing a different session.
  for (const entry of ctx.sessionManager.getBranch().toReversed()) {
    if (entry.type !== "custom" || entry.customType !== TRUST_ENTRY) continue;
    const data = entry.data as Partial<Authorization> | null;
    if (data?.sessionId === sessionId && typeof data.fingerprint === "string") {
      return data as Authorization;
    }
  }
  return undefined;
}

export default function localSettings(pi: ExtensionAPI): void {
  pi.registerFlag("trust-local-settings", {
    type: "boolean",
    default: false,
    description:
      "Authorize .pi/settings.local.json resources for this invocation (does not override project trust)",
  });
  let last: Discovery | undefined;
  pi.on("session_start", () => {
    last = undefined;
  });
  pi.on("resources_discover", async (event, ctx) => {
    const config = await readLocalConfig(event.cwd);
    last = { config, authorization: "no valid resources" };
    const previous = remembered(ctx);
    const fingerprint = config.fingerprint ?? "";
    const prior =
      previous?.fingerprint === fingerprint ? previous.allowed : undefined;
    // Invalidate the latest decision on any observed change, including removal,
    // invalid JSON or changes discovered without interactive UI. Reverting to
    // an older configuration must not resurrect an earlier authorization.
    if (previous && previous.fingerprint !== fingerprint) {
      pi.appendEntry<Authorization>(TRUST_ENTRY, {
        sessionId: ctx.sessionManager.getSessionId(),
        fingerprint,
      });
    }
    for (const diagnostic of config.diagnostics) {
      report(ctx, `${displayPath(config.source)}: ${diagnostic}`, true);
    }
    if (!RESOURCE_FIELDS.some((field) => config.paths[field].length)) return {};
    let allowed = false;
    if (!ctx.isProjectTrusted()) {
      last.authorization = "blocked by Pi project trust";
    } else if (pi.getFlag("trust-local-settings") === true) {
      allowed = true;
      last.authorization = "explicit CLI opt-in";
    } else {
      if (!fingerprint) return {};
      if (prior !== undefined) {
        allowed = prior;
        last.authorization = prior ? "session approval" : "session refusal";
      } else if (ctx.mode === "tui" && ctx.hasUI) {
        allowed = await ctx.ui.confirm(
          "Load local Pi resources?",
          `${describe(config)}\n\nSkills and prompts may instruct execution. Paths may leave this project. Approval is session-only, not a sandbox or content-integrity guarantee.`,
        );
        pi.appendEntry<Authorization>(TRUST_ENTRY, {
          sessionId: ctx.sessionManager.getSessionId(),
          fingerprint,
          allowed,
        });
        last.authorization = allowed ? "session approval" : "session refusal";
      } else {
        last.authorization = "not authorized (use --trust-local-settings)";
      }
    }
    if (!allowed)
      report(ctx, `Skipped local resources: ${last.authorization}.`, true);
    const paths = allowed ? config.paths : emptyPaths();
    return {
      skillPaths: paths.skills,
      promptPaths: paths.prompts,
      themePaths: paths.themes,
    };
  });
  pi.registerCommand("local-settings", {
    description: "Show the last local resource discovery (read-only)",
    handler: async (_args, ctx) => {
      report(
        ctx,
        last
          ? `${describe(last.config)}\nAuthorization: ${last.authorization}\n${last.config.diagnostics.join("\n")}`
          : "No local settings discovery in this session yet.",
      );
    },
  });
}
