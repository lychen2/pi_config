import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import register from "../index.ts";
import { MINIMAL_PERSONA, STATE_TYPE } from "../core.ts";

function tool(name) {
  return {
    name,
    label: name,
    description: name,
    parameters: { type: "object", properties: {} },
    sourceInfo: { origin: "builtin", path: `${name}.ts` },
  };
}

function fakePi(initialTools) {
  const handlers = new Map();
  const commands = new Map();
  const sentUserMessages = [];
  const appendedEntries = [];
  const registeredTools = new Map(initialTools.map((entry) => [entry.name, entry]));
  let active = initialTools.map((entry) => entry.name);

  return {
    handlers,
    commands,
    sentUserMessages,
    appendedEntries,
    getAllTools: () => [...registeredTools.values()],
    getActiveTools: () => [...active],
    setActiveTools(names) { active = [...new Set(names)]; },
    sendUserMessage(content, options) { sentUserMessages.push({ content, options }); },
    appendEntry(type, data) { appendedEntries.push({ type: "custom", customType: type, data }); },
    registerCommand(name, options) { commands.set(name, options); },
    registerTool(definition) {
      registeredTools.set(definition.name, definition);
      if (!active.includes(definition.name)) active.push(definition.name);
    },
    on(name, handler) { handlers.set(name, [...(handlers.get(name) ?? []), handler]); },
  };
}

function context(cwd, branch = [], modelId = "deepseek-v4-pro") {
  return {
    cwd,
    hasUI: false,
    model: { id: modelId },
    sessionManager: {
      getBranch: () => branch,
      getSessionId: () => "test-session",
    },
    ui: { notify() {}, setStatus() {} },
  };
}

async function emit(pi, name, event, ctx) {
  let result;
  for (const handler of pi.handlers.get(name) ?? []) {
    const next = await handler(event, ctx);
    if (next !== undefined) result = next;
  }
  return result;
}

function standardTools() {
  return [
    tool("bash"),
    tool("read"),
    tool("edit"),
    tool("write"),
    tool("grep"),
    tool("todo"),
  ];
}

function request(model = "deepseek-v4-pro") {
  return {
    model,
    messages: [
      { role: "system", content: "full Pi system prompt" },
      { role: "user", content: [{ type: "text", text: "<user-profile>\nprofile" }] },
      { role: "user", content: [{ type: "text", text: "the task" }] },
    ],
    tools: [
      { type: "function", name: "read" },
      { type: "function", name: "bash" },
      { type: "function", name: "str_replace_editor" },
      { type: "function", name: "edit" },
    ],
  };
}

test("bootstrap exposes Minimal pair and sends the Minimal first payload", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "pi-deepseek-anchor-"));
  const pi = fakePi(standardTools());
  register(pi);
  const ctx = context(cwd);

  await emit(pi, "session_start", { reason: "startup" }, ctx);
  assert.deepEqual(pi.getActiveTools(), ["bash", "str_replace_editor"]);

  const start = await emit(pi, "before_agent_start", { systemPrompt: "full Pi system prompt" }, ctx);
  assert.deepEqual(start, { systemPrompt: MINIMAL_PERSONA });

  const payload = await emit(pi, "before_provider_request", { payload: request() }, ctx);
  assert.deepEqual(payload.tools.map((entry) => entry.name), ["bash", "str_replace_editor"]);
  assert.equal(payload.messages[0].content, MINIMAL_PERSONA);
  assert.deepEqual(payload.messages.map((entry) => entry.role), ["system", "user"]);
  assert.equal(payload.messages[1].content[0].text, "the task");
  assert.equal(payload.max_tokens, undefined);
});

test("V4 Flash receives the same bootstrap route", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "pi-deepseek-flash-"));
  const pi = fakePi(standardTools());
  register(pi);
  const ctx = context(cwd, [], "deepseek-v4-flash");

  await emit(pi, "session_start", { reason: "startup" }, ctx);
  assert.deepEqual(pi.getActiveTools(), ["bash", "str_replace_editor"]);
  const payload = await emit(pi, "before_provider_request", {
    payload: request("deepseek-v4-flash"),
  }, ctx);
  assert.deepEqual(payload.tools.map((entry) => entry.name), ["bash", "str_replace_editor"]);
  assert.equal(payload.messages[0].content, MINIMAL_PERSONA);
});test("Progressive anchor withholds images then queues the original task once", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "pi-deepseek-progressive-"));
  const pi = fakePi(standardTools());
  register(pi);
  const branch = [];
  const ctx = context(cwd, branch);
  const image = { type: "image", data: "base64-image", mimeType: "image/png" };

  await emit(pi, "session_start", { reason: "startup" }, ctx);
  const transformed = await emit(pi, "input", {
    text: "inspect this image",
    images: [image],
    source: "interactive",
  }, ctx);
  assert.deepEqual(transformed, {
    action: "transform",
    text: "请简单介绍一下你自己，以及你当前可用的工具。",
    images: [],
  });

  await emit(pi, "agent_start", {}, ctx);
  assert.equal(pi.sentUserMessages.length, 1);
  assert.deepEqual(pi.sentUserMessages[0], {
    content: [{ type: "text", text: "inspect this image" }, image],
    options: { deliverAs: "followUp", expandPromptTemplates: true },
  });
  await emit(pi, "agent_start", {}, ctx);
  assert.equal(pi.sentUserMessages.length, 1);
});

test("Progressive follow-up removes the synthetic exchange before the real request", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "pi-deepseek-clean-followup-"));
  const pi = fakePi(standardTools());
  register(pi);
  const ctx = context(cwd);

  await emit(pi, "session_start", { reason: "startup" }, ctx);
  await emit(pi, "input", { text: "real task", source: "interactive" }, ctx);
  await emit(pi, "agent_start", {}, ctx);
  await emit(pi, "message_end", {
    message: { role: "assistant", content: [{ type: "text", text: "ready" }] },
  }, ctx);

  const payload = {
    model: "deepseek-v4-pro",
    messages: [
      { role: "system", content: "full Pi system prompt" },
      { role: "user", content: "请简单介绍一下你自己，以及你当前可用的工具。" },
      { role: "assistant", content: "ready" },
      { role: "user", content: [{ type: "text", text: "real task" }] },
    ],
    tools: request().tools,
  };
  const result = await emit(pi, "before_provider_request", { payload }, ctx);
  assert.deepEqual(result.messages.map((message) => message.role), ["system", "user"]);
  assert.equal(result.messages[0].content, "full Pi system prompt");
  assert.equal(result.messages[1].content[0].text, "real task");
  assert.equal(result.tools.length, 4);
  assert.equal(await emit(pi, "before_provider_request", { payload: request() }, ctx), undefined);
});

test("first assistant response promotes to the original full catalog and normal payload", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "pi-deepseek-promote-"));
  const pi = fakePi(standardTools());
  register(pi);
  const ctx = context(cwd);
  const fullCatalog = ["bash", "read", "edit", "write", "grep", "todo"];

  await emit(pi, "session_start", { reason: "startup" }, ctx);
  await emit(pi, "message_end", {
    message: { role: "assistant", content: [{ type: "text", text: "ready" }] },
  }, ctx);
  assert.deepEqual(pi.getActiveTools(), fullCatalog);

  const payload = request();
  const result = await emit(pi, "before_provider_request", { payload }, ctx);
  assert.equal(result, undefined);
  assert.equal(payload.messages[0].content, "full Pi system prompt");
  assert.equal(payload.tools.length, 4);
  assert.ok(pi.appendedEntries.some((entry) => entry.customType === STATE_TYPE && entry.data.phase === "promoted"));
});

test("first tool execution promotes before the next provider turn", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "pi-deepseek-tool-promote-"));
  const pi = fakePi(standardTools());
  register(pi);
  const ctx = context(cwd);

  await emit(pi, "session_start", { reason: "startup" }, ctx);
  await emit(pi, "tool_execution_start", { toolName: "bash", toolCallId: "call-1", args: {} }, ctx);
  assert.ok(pi.getActiveTools().includes("read"));
  assert.ok(!pi.getActiveTools().includes("str_replace_editor"));
});

test("direct mode does not synthesize an anchor turn", async () => {
  const previous = process.env.PI_DEEPSEEK_ANCHORED_STANDARD_MODE;
  process.env.PI_DEEPSEEK_ANCHORED_STANDARD_MODE = "direct";
  try {
    const cwd = await mkdtemp(join(tmpdir(), "pi-deepseek-direct-"));
    const pi = fakePi(standardTools());
    register(pi);
    const ctx = context(cwd);
    await emit(pi, "session_start", { reason: "startup" }, ctx);
    assert.equal(await emit(pi, "input", { text: "real task", source: "interactive" }, ctx), undefined);
  } finally {
    if (previous === undefined) delete process.env.PI_DEEPSEEK_ANCHORED_STANDARD_MODE;
    else process.env.PI_DEEPSEEK_ANCHORED_STANDARD_MODE = previous;
  }
});

test("reload and tree navigation restore the durable branch phase", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "pi-deepseek-restore-"));
  const pi = fakePi(standardTools());
  register(pi);
  const fullTools = ["bash", "read", "edit", "write", "grep", "todo", "str_replace_editor"];
  const promotedBranch = [{
    type: "custom",
    customType: STATE_TYPE,
    data: { version: 2, phase: "promoted", modelId: "deepseek-v4-pro", fullTools },
  }];
  const ctx = context(cwd, promotedBranch);

  await emit(pi, "session_start", { reason: "reload" }, ctx);
  assert.deepEqual(pi.getActiveTools(), ["bash", "read", "edit", "write", "grep", "todo"]);

  promotedBranch.length = 0;
  await emit(pi, "session_tree", { oldLeafId: "promoted", newLeafId: "fresh" }, ctx);
  assert.deepEqual(pi.getActiveTools(), ["bash", "str_replace_editor"]);
});

test("non-target models retain their existing active tool selection", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "pi-deepseek-other-"));
  const pi = fakePi(standardTools());
  register(pi);
  const ctx = context(cwd, [], "claude-opus-5");
  const nativeTools = standardTools().map((entry) => entry.name);

  await emit(pi, "session_start", { reason: "startup" }, ctx);
  assert.deepEqual(pi.getActiveTools(), nativeTools);
  assert.ok(pi.getAllTools().some((entry) => entry.name === "str_replace_editor"));
  assert.equal(await emit(pi, "before_agent_start", { systemPrompt: "native" }, ctx), undefined);
  const payload = request("claude-opus-5");
  assert.equal(await emit(pi, "before_provider_request", { payload }, ctx), undefined);
  assert.equal(payload.tools.find((tool) => tool.name === "bash").description, undefined);
});
