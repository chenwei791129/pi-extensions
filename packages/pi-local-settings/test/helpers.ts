import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { TestContext } from "node:test";

export async function fixture(t: TestContext) {
  const root = await realpath(
    await mkdtemp(join(tmpdir(), "pi-local-settings-")),
  );
  t.after(() => rm(root, { recursive: true, force: true }));
  const cwd = join(root, "project");
  const agentDir = join(root, "agent");
  await mkdir(join(cwd, ".pi"), { recursive: true });
  await mkdir(agentDir);
  // Pi also discovers ~/.agents/skills independently of agentDir. Tests run
  // sequentially within each isolated test process; never use the real home.
  const previousHome = process.env.HOME;
  const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
  process.env.HOME = root;
  process.env.PI_CODING_AGENT_DIR = agentDir;
  t.after(() => {
    if (previousHome === undefined) delete process.env.HOME;
    else process.env.HOME = previousHome;
    if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
  });
  const source = join(cwd, ".pi/settings.local.json");
  async function file(path: string, content = "") {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content);
    return path;
  }
  async function config(value: unknown) {
    await writeFile(source, JSON.stringify(value));
  }
  return { root, cwd, agentDir, source, file, config };
}
