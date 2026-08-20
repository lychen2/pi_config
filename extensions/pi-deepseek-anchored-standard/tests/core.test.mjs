import assert from "node:assert/strict";
import test from "node:test";

import {
  bootstrapPayload,
  bootstrapToolPayload,
  DEFAULT_ANCHOR_TEXT,
  hasConversation,
  hasPromotionSignal,
  isTargetModel,
  MINIMAL_BASH_DESCRIPTION,
  MINIMAL_EDITOR_DESCRIPTION,
  MINIMAL_PERSONA,
  withMinimalToolSchemas,
  parseMode,
  parsePromoteOn,
  stripBootstrapContext,
  stripSyntheticAnchorTurn,
  uniquePresent,
  validAnchorState,
  withMinimalPersona,
} from "../core.ts";

const PAIR = ["bash", "str_replace_editor"];

test("targets exact DeepSeek V4 Pro and V4 Flash model ids", () => {
  assert.equal(isTargetModel("deepseek-v4-pro"), true);
  assert.equal(isTargetModel("provider/deepseek-v4-pro"), true);
  assert.equal(isTargetModel("deepseek-v4-flash"), true);
  assert.equal(isTargetModel("provider/deepseek-v4-flash"), true);
  assert.equal(isTargetModel("deepseek-v4-pro-thinking"), false);
  assert.equal(isTargetModel("deepseek-v4-flash-thinking"), false);
  assert.equal(isTargetModel("claude-opus-5"), false);
});

test("parses the small explicit configuration surface", () => {
  assert.equal(parseMode(undefined), "progressive");
  assert.equal(parseMode("direct"), "direct");
  assert.equal(parsePromoteOn(undefined), "either");
  assert.equal(parsePromoteOn("tool-call"), "tool-call");
  assert.throws(() => parseMode("zero-tool"), /mode/);
  assert.throws(() => parsePromoteOn("bogus"), /promoteOn/);
});

test("keeps requested tools unique and in configured order", () => {
  assert.deepEqual(uniquePresent(["read", "bash", "edit"], ["bash", "bash", "read"]), ["bash", "read"]);
  assert.deepEqual(uniquePresent(["read"], ["read"]), ["read"]);
});

test("filters the provider tool catalog to the Minimal pair", () => {
  const payload = {
    model: "deepseek-v4-pro",
    tools: [
      { type: "function", name: "read" },
      { type: "function", name: "bash" },
      { type: "function", name: "str_replace_editor" },
    ],
  };
  const result = bootstrapToolPayload(payload, PAIR);
  assert.deepEqual(result.tools.map((tool) => tool.name), ["bash", "str_replace_editor"]);
  assert.equal(payload.tools.length, 3);
});

test("does not issue a partial Minimal catalog when one tool is missing", () => {
  const payload = { tools: [{ name: "bash" }] };
  assert.equal(bootstrapToolPayload(payload, PAIR), payload);
});

test("replaces Chat Completions and Responses system instructions", () => {
  const chat = {
    messages: [
      { role: "system", content: "full prompt" },
      { role: "user", content: "task" },
    ],
  };
  const chatResult = withMinimalPersona(chat);
  assert.equal(chatResult.messages[0].content, MINIMAL_PERSONA);
  assert.equal(chatResult.messages[1].content, "task");

  const responses = {
    instructions: "full prompt",
    input: [{ role: "user", content: "task" }],
  };
  const responseResult = withMinimalPersona(responses);
  assert.equal(responseResult.instructions, MINIMAL_PERSONA);
  assert.equal(responseResult.input[0].content, "task");
});

test("strips only generated leading context and keeps the real task", () => {
  const payload = {
    messages: [
      { role: "system", content: "prompt" },
      { role: "user", content: [{ type: "text", text: "<user-profile>\nprofile" }] },
      { role: "user", content: [{ type: "text", text: "<session-history>\nhistory" }] },
      { role: "user", content: [{ type: "text", text: "the real task" }] },
    ],
  };
  const result = stripBootstrapContext(payload);
  assert.deepEqual(result.messages.map((message) => message.role), ["system", "user"]);
  assert.equal(result.messages[1].content[0].text, "the real task");
});

test("strips only the synthetic anchor exchange before the real follow-up", () => {
  const payload = {
    messages: [
      { role: "system", content: "normal system" },
      { role: "user", content: DEFAULT_ANCHOR_TEXT },
      { role: "assistant", content: "ready" },
      { role: "user", content: [{ type: "text", text: "real task" }] },
      { role: "assistant", content: "older context after real task" },
    ],
  };
  const result = stripSyntheticAnchorTurn(payload, DEFAULT_ANCHOR_TEXT);
  assert.deepEqual(result.messages.map((message) => message.role), ["system", "user", "assistant"]);
  assert.equal(result.messages[1].content[0].text, "real task");
  assert.equal(result.messages[2].content, "older context after real task");

  const incomplete = { messages: [{ role: "user", content: DEFAULT_ANCHOR_TEXT }] };
  assert.equal(stripSyntheticAnchorTurn(incomplete, DEFAULT_ANCHOR_TEXT), incomplete);
});test("bootstrapPayload combines pair filtering, context stripping, and persona", () => {
  const payload = {
    messages: [
      { role: "system", content: "full prompt" },
      { role: "user", content: [{ type: "text", text: "<project-memory> old" }] },
      { role: "user", content: [{ type: "text", text: "task" }] },
    ],
    tools: [{ name: "bash" }, { name: "read" }, { name: "str_replace_editor" }],
  };
  const result = bootstrapPayload(payload, PAIR);
  assert.equal(result.messages[0].content, MINIMAL_PERSONA);
  assert.deepEqual(result.messages.map((message) => message.role), ["system", "user"]);
  assert.deepEqual(result.tools.map((tool) => tool.name), PAIR);
  assert.equal(result.tools[0].description, MINIMAL_BASH_DESCRIPTION);
  assert.deepEqual(result.tools[0].parameters.required, ["command"]);
  assert.equal(result.tools[1].description, MINIMAL_EDITOR_DESCRIPTION);
  assert.deepEqual(result.tools[1].parameters.required, ["command", "path"]);
});

test("rewrites Minimal schemas in nested provider function entries", () => {
  const payload = {
    tools: [{ type: "function", function: { name: "bash", description: "native", parameters: {} } }],
  };
  const result = withMinimalToolSchemas(payload);
  assert.equal(result.tools[0].function.description, MINIMAL_BASH_DESCRIPTION);
  assert.deepEqual(result.tools[0].function.parameters.required, ["command"]);
});
test("promotion signals follow the configured trigger", () => {
  const toolResult = {
    type: "message",
    message: { role: "toolResult", content: [{ type: "text", text: "ok" }] },
  };
  const text = {
    type: "message",
    message: { role: "assistant", content: [{ type: "text", text: "done" }] },
  };
  const toolCall = {
    type: "message",
    message: { role: "assistant", content: [{ type: "toolCall", name: "bash" }] },
  };
  assert.equal(hasPromotionSignal([toolResult], "tool-call"), true);
  assert.equal(hasPromotionSignal([toolResult], "assistant-message"), false);
  assert.equal(hasPromotionSignal([text], "assistant-message"), true);
  assert.equal(hasPromotionSignal([toolCall], "tool-call"), true);
  assert.equal(hasPromotionSignal([text], "tool-call"), false);
});

test("conversation detection ignores custom state entries", () => {
  assert.equal(hasConversation([{ type: "custom", customType: "state", data: {} }]), false);
  assert.equal(hasConversation([{ type: "message", message: { role: "user", content: [] } }]), true);
});

test("persisted state has a strict versioned shape", () => {
  assert.equal(validAnchorState({ version: 2, phase: "bootstrap", modelId: "deepseek-v4-pro", fullTools: ["bash"] }), true);
  assert.equal(validAnchorState({ version: 1, phase: "bootstrap", modelId: "deepseek-v4-pro", fullTools: ["bash"] }), false);
  assert.equal(DEFAULT_ANCHOR_TEXT.length > 0, true);
});
