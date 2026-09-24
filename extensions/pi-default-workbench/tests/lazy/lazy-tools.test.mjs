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
  const handlers = new Map();
  return {
    tools,
    handlers,
    registerTool(tool) { tools.set(tool.name, tool); },
    registerCommand() {},
    registerShortcut() {},
    on(name, handler) { handlers.set(name, [...(handlers.get(name) ?? []), handler]); },
    getAllTools() { return [...tools.values()]; },
    getActiveTools() { return []; },
    setActiveTools() {},
  };
}

test("registers lazy tool definitions without loading their runtime handlers", () => {
  const pi = fakePi();
  register(pi);
  assert.deepEqual([...pi.tools.keys()].sort(), [
    "bash_bg",
    "browser",
    "code_outline",
    "conflict",
    "fffind",
    "ffgrep",
    "preview_export",
    "search_skill_bm25",
    "search_tool_bm25",
  ]);
  assert.equal(pi.handlers.has("session_shutdown"), false);
  assert.equal(Object.hasOwn(require.cache, require.resolve("typescript-api")), false);
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
