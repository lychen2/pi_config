import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import register from "../../deferred-tools/deferred-tools.ts";

function tool(name, description, source, path = `${name}.ts`) {
  return {
    name,
    label: name,
    description,
    parameters: { type: "object", properties: {} },
    sourceInfo: {
      source,
      path,
      origin: source === "builtin" ? "core" : source.startsWith("npm:") ? "package" : "extension",
    },
    async execute() {
      return { content: [{ type: "text", text: name }], details: {} };
    },
  };
}

function fakePi(initialTools) {
  const tools = [...initialTools];
  const handlers = new Map();
  const commands = new Map();
  const shortcuts = new Map();
  let active = tools.map((entry) => entry.name);

  return {
    tools,
    handlers,
    commands,
    shortcuts,
    registerTool(definition) {
      tools.push({
        ...definition,
        sourceInfo: {
          source: "/repo/extensions/pi-deferred-tools",
          path: "extensions/deferred-tools.ts",
          origin: "package",
        },
      });
      active.push(definition.name);
    },
    registerCommand(name, definition) { commands.set(name, definition); },
    registerShortcut(key, definition) { shortcuts.set(key, definition); },
    on(name, handler) { handlers.set(name, [...(handlers.get(name) ?? []), handler]); },
    getAllTools: () => tools,
    getActiveTools: () => [...active],
    setActiveTools(names) { active = [...new Set(names)]; },
  };
}

function context(cwd, notifications = []) {
  return {
    cwd,
    hasUI: true,
    mode: "rpc",
    isProjectTrusted: () => true,
    ui: {
      notify(message, level) { notifications.push({ message, level }); },
    },
  };
}

async function start(pi, cwd) {
  for (const handler of pi.handlers.get("session_start") ?? []) {
    await handler({ reason: "startup" }, context(cwd));
  }
}

const initialTools = () => [
  tool("read", "Read files", "builtin"),
  tool("bash", "Run shell commands", "builtin"),
  tool("write", "Write a complete file", "builtin"),
  tool("edit", "Edit a file", "builtin"),
  tool("grep", "Search text", "builtin"),
  tool("ls", "List directory contents", "builtin"),
  tool("find", "Find files by glob", "builtin"),
  tool("todowrite", "Host todo tool", "sdk", "host/todo.ts"),
  tool("ask_user_question", "Ask a structured question", "sdk", "host/question.ts"),
  tool("fffind", "Find files by fuzzy path", "npm:pi-maestro-tools@0.1.0"),
  tool("ffgrep", "Search literal workspace text", "npm:pi-maestro-tools@0.1.0"),
  tool("todo", "Manage project tasks", "npm:pi-maestro-todo@0.1.0"),
  tool("web_search", "Search the web for current information", "sdk", "host/web.ts"),
  tool("search_skill_bm25", "Search available skills", "local:pi-default-workbench"),
];

test("session_start applies adaptive core and BM25 activates an SDK tool", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "pi-adaptive-tools-"));
  const pi = fakePi(initialTools());
  register(pi);
  await start(pi, cwd);

  const core = [
    "read",
    "bash",
    "write",
    "edit",
    "grep",
    "fffind",
    "ffgrep",
    "web_search",
    "todo",
    "ask_user_question",
    "search_skill_bm25",
  ];
  for (const name of ["ls", "find"]) {
    assert.equal(pi.getActiveTools().includes(name), false, `${name} must stay out of adaptive core`);
  }

  const search = pi.tools.find((entry) => entry.name === "search_tool_bm25");
  assert.match(search.promptSnippet, /Use active tools directly/);
  assert.match(search.promptSnippet, /When a needed capability is missing/);
  assert.match(search.promptSnippet, /call search_tool_bm25 once/);
  assert.doesNotMatch(search.promptSnippet, /browser|memory/);
  const result = await search.execute("id", { query: "web current information", limit: 8 });
  assert.deepEqual(result.details.activatedTools, []);
  assert.deepEqual(new Set(pi.getActiveTools()), new Set([...core, "search_tool_bm25"]));
});

test("explicit disables outrank adaptive discovery including SDK tools", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "pi-adaptive-disabled-"));
  const configPath = join(cwd, ".pi", "tool-selector.json");
  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(configPath, JSON.stringify({
    disabledExtensions: [],
    disabledTools: ["todowrite", "web_search"],
  }), "utf8");

  const pi = fakePi(initialTools());
  register(pi);
  await start(pi, cwd);
  assert.equal(pi.getActiveTools().includes("todowrite"), false);
  assert.equal(pi.getActiveTools().includes("web_search"), false);

  const search = pi.tools.find((entry) => entry.name === "search_tool_bm25");
  const result = await search.execute("id", { query: "web current information", limit: 8 });
  assert.deepEqual(result.details.activatedTools, []);
  assert.equal(result.details.tools.some((entry) => entry.name === "web_search"), false);
});

test("resource discovery settles late SoL tools and prevents duplicate task discovery", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "pi-sol-tools-"));
  const pi = fakePi(initialTools());
  register(pi);
  await start(pi, cwd);
  pi.registerTool(tool("update_plan", "Track execution plan", "sol"));
  pi.registerTool(tool("obs_recall", "Recall observations", "sol"));
  for (const handler of pi.handlers.get("resources_discover")) await handler({}, context(cwd));
  assert.ok(pi.getActiveTools().includes("update_plan"));
  assert.ok(pi.getActiveTools().includes("obs_recall"));
  assert.ok(!pi.getActiveTools().includes("todo"));
  const search = pi.tools.find(t => t.name === "search_tool_bm25");
  const result = await search.execute("search", { query: "todo project tasks", limit: 50 });
  assert.ok(!result.details.tools.some(t => t.name === "todo" || t.name === "todowrite"));
});

test("tools commands provide mode argument completions", () => {
  const pi = fakePi(initialTools());
  register(pi);

  const expected = ["adaptive", "fast", "full", "reset", "list"];
  const tools = pi.commands.get("tools");
  const legacy = pi.commands.get("deferred-tools");
  assert.deepEqual(tools.getArgumentCompletions(""), [
    { value: "adaptive", label: "adaptive", description: "先启用核心工具，按需发现其他工具" },
    { value: "fast", label: "fast", description: "仅保留最小核心工具集" },
    { value: "full", label: "full", description: "启用全部已注册工具，明确禁用的除外" },
    { value: "reset", label: "reset", description: "清除禁用规则并切换到完整模式" },
    { value: "list", label: "list", description: "显示当前工具选择和已启用工具" },
  ]);
  assert.deepEqual(tools.getArgumentCompletions("f"), [
    { value: "fast", label: "fast", description: "仅保留最小核心工具集" },
    { value: "full", label: "full", description: "启用全部已注册工具，明确禁用的除外" },
  ]);
  assert.equal(tools.getArgumentCompletions("unknown"), null);
  assert.deepEqual(tools.getArgumentCompletions("full "), [
    { value: "full", label: "full", description: "启用全部已注册工具，明确禁用的除外" },
  ]);
  assert.deepEqual(legacy.getArgumentCompletions("a"), [
    { value: "adaptive", label: "adaptive", description: "先启用核心工具，按需发现其他工具" },
  ]);
});

test("Ctrl+Alt+T cycles fast, adaptive, full, then fast", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "pi-tool-mode-shortcut-"));
  const configPath = join(cwd, ".pi", "tool-selector.json");
  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(configPath, JSON.stringify({
    toolMode: "fast",
    disabledExtensions: [],
    disabledTools: [],
  }), "utf8");

  const pi = fakePi(initialTools());
  register(pi);
  await start(pi, cwd);
  const shortcut = [...pi.shortcuts.values()][0];
  const notifications = [];
  const ctx = context(cwd, notifications);

  await shortcut.handler(ctx);
  assert.equal(JSON.parse(await readFile(configPath, "utf8")).toolMode, "adaptive");
  await shortcut.handler(ctx);
  assert.equal(JSON.parse(await readFile(configPath, "utf8")).toolMode, "full");
  await shortcut.handler(ctx);
  assert.equal(JSON.parse(await readFile(configPath, "utf8")).toolMode, "fast");
  assert.equal(notifications.length, 3);
});

test("fast and full commands persist mode without clearing disables", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "pi-tool-modes-"));
  const configPath = join(cwd, ".pi", "tool-selector.json");
  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(configPath, JSON.stringify({
    toolMode: "adaptive",
    disabledExtensions: [],
    disabledTools: ["todowrite"],
  }), "utf8");

  const pi = fakePi(initialTools());
  register(pi);
  await start(pi, cwd);
  const command = pi.commands.get("tools");
  const notifications = [];
  const ctx = context(cwd, notifications);

  await command.handler("fast", ctx);
  assert.deepEqual(new Set(pi.getActiveTools()), new Set([
    "read",
    "bash",
    "write",
    "edit",
    "grep",
    "fffind",
    "ffgrep",
    "web_search",
    "todo",
    "ask_user_question",
    "search_skill_bm25",
  ]));
  assert.deepEqual(JSON.parse(await readFile(configPath, "utf8")), {
    toolMode: "fast",
    disabledExtensions: [],
    disabledTools: ["todowrite"],
  });

  await command.handler("full", ctx);
  assert.deepEqual(new Set(pi.getActiveTools()), new Set([
    "read",
    "bash",
    "write",
    "edit",
    "grep",
    "ls",
    "find",
    "ask_user_question",
    "fffind",
    "ffgrep",
    "todo",
    "web_search",
    "search_skill_bm25",
  ]));
  assert.deepEqual(JSON.parse(await readFile(configPath, "utf8")), {
    toolMode: "full",
    disabledExtensions: [],
    disabledTools: ["todowrite"],
  });
});
