import assert from "node:assert/strict";
import test from "node:test";
import { Value } from "typebox/value";

import register, {
  adaptReadSeekTool,
  createRecoveringReadSeekAdapter,
  adaptTeammateTool,
  adaptWebAccessTool,
  isReadSeekFailure,
  isStandaloneImage,
  normalizeDigestInput,
  registerNativeRead,
  readSeekErrorCode,
} from "../index.ts";

function bareTool(name, properties = {}) {
  return {
    name,
    label: name,
    description: "tool",
    parameters: { type: "object", properties, additionalProperties: false },
    async execute() { return { content: [], details: {} }; },
  };
}

function schemaAccepts(schema, value) {
  return Value.Check(schema, value);
}

function fakePi() {
  const tools = new Map();
  const handlers = new Map();
  const api = new Proxy({
    events: { on() { return () => {}; } },
    tools,
    handlers,
    registerTool(tool) { tools.set(tool.name, tool); },
    on(name, handler) { handlers.set(name, [...(handlers.get(name) ?? []), handler]); },
    registerCommand() {},
    registerShortcut() {},
    registerFlag() {},
    registerMessageRenderer() {},
    registerProvider() {},
    sendMessage() {},
    appendEntry() {},
    getAllTools() { return [...tools.values()]; },
  }, {
    get(target, property) {
      if (property in target) return target[property];
      return () => {};
    },
  });
  return api;
}

test("strips forced vision fields from source digest calls", () => {
  const input = { path: "src/example.ts", visionMode: "none", visionLevel: "low" };
  normalizeDigestInput(input);
  assert.deepEqual(input, { path: "src/example.ts" });
});

test("keeps valid image analysis and removes invalid image defaults", () => {
  const analysis = { path: "scan.png", visionMode: "ocr", visionLevel: "medium" };
  normalizeDigestInput(analysis);
  assert.deepEqual(analysis, { path: "scan.png", visionMode: "ocr", visionLevel: "medium" });

  const prepared = { path: "scan.png", visionMode: "none", visionLevel: "low" };
  normalizeDigestInput(prepared);
  assert.deepEqual(prepared, { path: "scan.png", visionMode: "none" });
  assert.equal(isStandaloneImage("scan.PNG?cache=1"), true);
});

test("recognizes structured ReadSeek errors", () => {
  assert.equal(isReadSeekFailure({ readSeekValue: { ok: false } }), true);
  assert.equal(isReadSeekFailure({ readSeekValue: { ok: true } }), false);
  assert.equal(isReadSeekFailure({}), false);
});

test("recovers only missing in-memory anchor state", async () => {
  let editCalls = 0;
  let digestCalls = 0;
  const adapt = createRecoveringReadSeekAdapter();
  const digest = adapt({
    ...bareTool("readSeek_digest"),
    async execute(_id, params) {
      digestCalls += 1;
      assert.deepEqual(params, { path: "a.ts", limit: 1 });
      return { content: [], details: { readSeekValue: { ok: true } } };
    },
  });
  const edit = adapt({
    ...bareTool("readSeek_edit"),
    async execute() {
      editCalls += 1;
      return editCalls === 1
        ? { content: [], details: { readSeekValue: { ok: false, error: { code: "file-not-read" } } } }
        : { content: [], details: { readSeekValue: { ok: true } } };
    },
  });
  assert.equal(digest.name, "readSeek_digest");
  const result = await edit.execute("id", { path: "a.ts", edits: [] }, undefined, undefined, {});
  assert.equal(result.details.readSeekValue.ok, true);
  assert.equal(editCalls, 2);
  assert.equal(digestCalls, 1);
});

test("does not retry stale anchor failures", async () => {
  let editCalls = 0;
  const adapt = createRecoveringReadSeekAdapter();
  adapt(bareTool("readSeek_digest"));
  const edit = adapt({
    ...bareTool("readSeek_edit"),
    async execute() {
      editCalls += 1;
      return { content: [], details: { readSeekValue: { ok: false, error: { code: "hash-mismatch" } } } };
    },
  });
  const result = await edit.execute("id", { path: "a.ts", edits: [] }, undefined, undefined, {});
  assert.equal(readSeekErrorCode(result.details), "hash-mismatch");
  assert.equal(editCalls, 1);
});

test("readseek schemas reject conflicting ranges, outline vision, and unknown languages", () => {
  const digest = adaptReadSeekTool(bareTool("readSeek_digest", {
    path: { type: "string" },
    end: { type: "integer" },
    limit: { type: "integer" },
    language: { type: "string" },
    visionMode: { type: "string" },
    visionLevel: { type: "string" },
  })).parameters;
  assert.equal(schemaAccepts(digest, { path: "a.ts", end: 5, limit: 2 }), false);
  assert.equal(schemaAccepts(digest, { path: "a.ts", limit: 2, language: "typescript" }), true);
  assert.equal(schemaAccepts(digest, { path: "a.ts", limit: 2, language: "text" }), false);
  assert.equal(schemaAccepts(digest, { path: "a.ts", visionLevel: "low" }), false);

  const view = adaptReadSeekTool(bareTool("readSeek_view", {
    path: { type: "string" },
    outline: { type: "boolean" },
    visionMode: { type: "string" },
    visionLevel: { type: "string" },
    page: { anyOf: [{ type: "number" }, { type: "string" }] },
  })).parameters;
  assert.equal(schemaAccepts(view, { path: "a.ts", outline: true, visionMode: "ocr" }), false);
  assert.equal(schemaAccepts(view, { path: "a.ts", outline: true }), true);
  assert.equal(schemaAccepts(view, { path: "a.ts", page: 0 }), false);
  assert.equal(schemaAccepts(view, { path: "a.ts", page: "0" }), false);
  assert.equal(schemaAccepts(view, { path: "a.ts", page: 1 }), true);
  assert.equal(schemaAccepts(view, { path: "a.ts", page: "1" }), true);
  assert.equal(schemaAccepts(view, { path: "a.ts", page: "01" }), true);
  assert.match(view.properties.node.description, /Short-lived node ID/);
});

test("get_search_content schema separates text lookup from bounded slices", () => {
  const schema = adaptWebAccessTool(bareTool("get_search_content", {
    responseId: { type: "string" },
    findText: { type: "string" },
    findMode: { type: "string" },
    offset: { type: "integer" },
    limit: { type: "integer" },
  })).parameters;
  assert.equal(schemaAccepts(schema, { responseId: "x", findText: "needle" }), true);
  assert.equal(schemaAccepts(schema, { responseId: "x", findText: "needle", offset: 0 }), false);
  assert.equal(schemaAccepts(schema, { responseId: "x", offset: 0, limit: 100 }), true);
  assert.equal(schemaAccepts(schema, { responseId: "x", findMode: "fuzzy" }), false);
});

test("observe schema exposes only registered observation kinds", () => {
  const schema = adaptTeammateTool(bareTool("observe", {
    action: { type: "string" },
    targets: {
      type: "array",
      items: {
        type: "object",
        properties: { kind: { type: "string" }, id: { type: "string" } },
        required: ["kind", "id"],
      },
    },
  })).parameters;
  assert.equal(schemaAccepts(schema, { action: "status", targets: [{ kind: "teammate", id: "a" }] }), true);
  assert.equal(schemaAccepts(schema, { action: "status", targets: [{ kind: "workspace", id: "owner:x" }] }), true);
  assert.equal(schemaAccepts(schema, { action: "status", targets: [{ kind: "bash_bg", id: "bg-1" }] }), false);
});

test("teammate description is replaced with a compact prompt contract", () => {
  const tool = adaptTeammateTool({
    ...bareTool("teammate"),
    description: "x".repeat(7000),
    promptSnippet: "x".repeat(200),
    promptGuidelines: Array.from({ length: 20 }, (_, index) => `guideline ${index}`),
  });
  assert.ok(tool.description.length < 2000, `teammate description too long: ${tool.description.length}`);
  assert.match(tool.description, /Dispatch tasks to teammate agents/);
  assert.equal(Array.isArray(tool.promptGuidelines), true);
  assert.ok(tool.promptGuidelines.length <= 3);
});

test("native read schema and executor reject zero-based offsets", async () => {
  const pi = fakePi();
  registerNativeRead(pi);
  const read = pi.tools.get("read");
  assert.equal(schemaAccepts(read.parameters, { path: "a.txt", offset: 0, limit: 1 }), false);
  assert.equal(schemaAccepts(read.parameters, { reasoning: "inspect file", path: "a.txt", offset: 0, limit: 1 }), false);
  assert.equal(schemaAccepts(read.parameters, { reasoning: "inspect file", path: "a.txt", offset: 1, limit: 1 }), true);
  await assert.rejects(
    read.execute("id", { reasoning: "inspect file", path: "a.txt", offset: 0, limit: 1 }, undefined, undefined, {}),
    /offset must be an integer >= 1/,
  );
});

test("read, write, and grep share the reasoning contract", async () => {
  const write = adaptReadSeekTool(bareTool("write", {
    path: { type: "string" },
    content: { type: "string" },
  })).parameters;
  assert.equal(schemaAccepts(write, { path: "a.txt", content: "x" }), false);
  assert.equal(schemaAccepts(write, { reasoning: "write file", path: "a.txt", content: "x" }), true);

  const grep = adaptReadSeekTool(bareTool("grep", { pattern: { type: "string" } })).parameters;
  assert.equal(schemaAccepts(grep, { pattern: "x" }), false);
  assert.equal(schemaAccepts(grep, { reasoning: "find lines", pattern: "x" }), true);

  const pi = fakePi();
  registerNativeRead(pi);
  assert.equal(schemaAccepts(pi.tools.get("read").parameters, { reasoning: "inspect", path: "a.txt" }), true);
});

test("write and grep strip reasoning before delegating to ReadSeek", async () => {
  const seen = [];
  const adapt = createRecoveringReadSeekAdapter();
  const write = adapt({
    ...bareTool("write"),
    async execute(_id, params) {
      seen.push(params);
      return { content: [], details: {} };
    },
  });
  await write.execute("id", { reasoning: "write file", path: "a.txt", content: "x" }, undefined, undefined, {});
  assert.deepEqual(seen[0], { path: "a.txt", content: "x" });
});

test("full adapter factory registers every audited default-mode tool", async () => {
  const pi = fakePi();
  await register(pi);
  for (const name of [
    "read", "readSeek_digest", "readSeek_edit", "readSeek_view", "readSeek_search",
    "get_search_content", "observe", "teammate",
  ]) {
    assert.equal(pi.tools.has(name), true, `missing ${name}`);
  }
  assert.equal(pi.tools.has("edit"), false, "ReadSeek must not replace native edit");
  assert.equal(pi.handlers.get("tool_call").length > 0, true);
  assert.equal(pi.handlers.get("tool_result").length > 0, true);
});
