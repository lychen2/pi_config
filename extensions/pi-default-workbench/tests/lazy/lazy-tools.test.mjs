import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

import register from "../../index.ts";

function fakePi() {
  const tools = new Map();
  const commands = new Map();
  const handlers = new Map();
  return {
    tools,
    commands,
    handlers,
    registerTool(tool) { tools.set(tool.name, tool); },
    registerCommand(name, command) { commands.set(name, command); },
    registerShortcut() {},
    on(name, handler) { handlers.set(name, [...(handlers.get(name) ?? []), handler]); },
    getAllTools() {
      return [...tools.values()].map((tool) => ({
        ...tool,
        sourceInfo: tool.sourceInfo ?? { source: "test", path: `${tool.name}.ts`, origin: "extension" },
      }));
    },
    getActiveTools() { return []; },
    setActiveTools() {},
  };
}

test("registers lazy tool definitions without loading their runtime handlers", async () => {
  const pi = fakePi();
  register(pi);
  assert.deepEqual([...pi.tools.keys()].sort(), [
    "bash_bg",
    "code_outline",
    "conflict",
    "fffind",
    "ffgrep",
    "preview_export",
    "search_skill_bm25",
  ]);
  assert.equal(pi.commands.has("large"), false, "retired Large command must not be registered");
  assert.equal(pi.handlers.has("session_shutdown"), false);
  assert.equal(Object.hasOwn(require.cache, require.resolve("typescript-api")), false);

  const cwd = await mkdtemp(join(tmpdir(), "pi-default-workbench-lazy-mode-"));
  assert.ok(!pi.tools.has("search_tool_bm25"), "discovery loader is not registered before mode config loads");
  for (const handler of pi.handlers.get("session_start") ?? []) {
    await handler({ reason: "startup" }, {
      cwd,
      hasUI: false,
      isProjectTrusted: () => true,
      ui: {},
    });
  }
  assert.ok(pi.tools.has("search_tool_bm25"), "adaptive default registers discovery at session start");
});

test("leaves host-provided web search and fetch tools unchanged", () => {
  const pi = fakePi();
  const webSearch = { name: "web_search" };
  const fetchContent = { name: "fetch_content" };
  pi.registerTool(webSearch);
  pi.registerTool(fetchContent);

  register(pi);

  assert.equal(pi.tools.get("web_search"), webSearch);
  assert.equal(pi.tools.get("fetch_content"), fetchContent);
  assert.equal(pi.tools.has("browser"), false);
});

test("loads a tool implementation only when it executes", async () => {
  const pi = fakePi();
  register(pi);
  const cwd = await mkdtemp(join(tmpdir(), "pi-default-workbench-lazy-"));
  await assert.rejects(
    pi.tools.get("conflict").execute("id", { action: "list" }, undefined, undefined, { cwd }),
    /Git repository with unmerged files/,
  );
  assert.equal(pi.handlers.has("session_shutdown"), true);
});
