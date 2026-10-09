import assert from "node:assert/strict";
import { resolve } from "node:path";
import type { TestContext } from "node:test";
import {
  createAgentSession,
  DefaultResourceLoader,
  type ExtensionUIContext,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";

export const extensionPath = resolve("packages/pi-local-settings/src/index.ts");

export async function piSession(
  t: TestContext,
  cwd: string,
  agentDir: string,
  options: {
    extension?: string;
    trusted?: boolean;
    optIn?: boolean;
    noResources?: boolean;
    confirm?: () => Promise<boolean>;
  } = {},
) {
  const settingsManager = SettingsManager.create(cwd, agentDir, {
    projectTrusted: options.trusted ?? true,
  });
  const loader = new DefaultResourceLoader({
    cwd,
    agentDir,
    settingsManager,
    additionalExtensionPaths: [options.extension ?? extensionPath],
    noSkills: options.noResources,
    noPromptTemplates: options.noResources,
    noThemes: options.noResources,
    noContextFiles: true,
  });
  await loader.reload();
  assert.deepEqual(loader.getExtensions().errors, []);
  loader
    .getExtensions()
    .runtime.flagValues.set("trust-local-settings", options.optIn ?? true);
  const { session } = await createAgentSession({
    cwd,
    agentDir,
    resourceLoader: loader,
    settingsManager,
    sessionManager: SessionManager.inMemory(cwd),
    tools: [],
  });
  t.after(() => session.dispose());
  const notifications: string[] = [];
  await session.bindExtensions({
    mode: options.confirm ? "tui" : "json",
    uiContext: options.confirm
      ? ({
          confirm: options.confirm,
          notify: (message: string) => notifications.push(message),
        } as unknown as ExtensionUIContext)
      : undefined,
    onError: (error) => {
      throw new Error(JSON.stringify(error));
    },
  });
  return { loader, session, notifications };
}
