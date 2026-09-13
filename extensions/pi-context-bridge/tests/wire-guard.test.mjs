import assert from "node:assert/strict";
import test from "node:test";
import {
  isEmptyBlock,
  registerWireGuard,
  resetWireGuardStats,
  sanitizeProviderPayload,
  wireGuardStats,
} from "../wire-guard.ts";

const EMPTY_M0 = {
  model: "claude-opus-5",
  messages: [
    { role: "system", content: "You are a coding assistant." },
    { role: "user", content: [{ type: "text", text: "" }] },
    { role: "user", content: [{ type: "text", text: "<session-history-since>x</session-history-since>" }] },
    { role: "user", content: [{ type: "text", text: "say hi" }] },
  ],
  stream: true,
};

test("drops the empty synthetic memory baseline and keeps every other message", () => {
  resetWireGuardStats();
  const sanitized = sanitizeProviderPayload(EMPTY_M0);
  assert.ok(sanitized, "payload with an empty user message must be rewritten");
  const messages = sanitized.messages;
  assert.equal(messages.length, 3);
  assert.equal(messages[0].role, "system");
  assert.equal(messages[1].content[0].text, "<session-history-since>x</session-history-since>");
  assert.equal(messages[2].content[0].text, "say hi");
  // The input payload is never mutated in place.
  assert.equal(EMPTY_M0.messages.length, 4);
  const current = wireGuardStats();
  assert.equal(current.requests, 1);
  assert.equal(current.droppedMessages, 1);
});

test("returns undefined when nothing needs to change", () => {
  resetWireGuardStats();
  const clean = {
    model: "deepseek-v4-flash",
    messages: [
      { role: "user", content: "hello" },
      { role: "user", content: [{ type: "text", text: "world" }] },
    ],
  };
  assert.equal(sanitizeProviderPayload(clean), undefined);
  assert.equal(wireGuardStats().droppedBlocks, 0);
  assert.equal(wireGuardStats().droppedMessages, 0);
});

test("keeps a user message whose only non-empty part is a tool result", () => {
  const payload = {
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "" },
          { type: "tool_result", tool_use_id: "t1", content: [{ type: "text", text: "ok" }] },
        ],
      },
    ],
  };
  const sanitized = sanitizeProviderPayload(payload);
  assert.ok(sanitized);
  assert.equal(sanitized.messages.length, 1);
  assert.deepEqual(sanitized.messages[0].content.map((part) => part.type), ["tool_result"]);
});

test("keeps tool calls on an assistant message that lost its empty text block", () => {
  const payload = {
    messages: [
      { role: "user", content: "read the file" },
      {
        role: "assistant",
        content: [
          { type: "text", text: "" },
          { type: "tool_use", id: "t1", name: "read", input: { path: "a.ts" } },
        ],
      },
    ],
  };
  const sanitized = sanitizeProviderPayload(payload);
  assert.ok(sanitized);
  assert.equal(sanitized.messages.length, 2);
  assert.deepEqual(sanitized.messages[1].content.map((part) => part.type), ["tool_use"]);
});

test("cleans an Anthropic top-level system field", () => {
  const arraySystem = sanitizeProviderPayload({
    system: [
      { type: "text", text: "" },
      { type: "text", text: "real system prompt" },
    ],
    messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
  });
  assert.ok(arraySystem);
  assert.equal(arraySystem.system.length, 1);
  assert.equal(arraySystem.system[0].text, "real system prompt");

  const emptySystem = sanitizeProviderPayload({
    system: "",
    messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
  });
  assert.ok(emptySystem);
  assert.equal("system" in emptySystem, false);
});

test("handles Responses-style input arrays and empty string content", () => {
  const payload = {
    input: [
      { role: "user", content: [{ type: "input_text", text: "" }] },
      { role: "user", content: [{ type: "input_text", text: "question" }] },
      { role: "user", content: "" },
    ],
  };
  const sanitized = sanitizeProviderPayload(payload);
  assert.ok(sanitized);
  assert.equal(sanitized.input.length, 1);
  assert.equal(sanitized.input[0].content[0].text, "question");
});

test("never hands the provider an empty message list", () => {
  const payload = { messages: [{ role: "user", content: [{ type: "text", text: "" }] }] };
  assert.equal(sanitizeProviderPayload(payload), undefined);
});

test("recognizes only zero-length text and thinking blocks as empty", () => {
  assert.equal(isEmptyBlock({ type: "text", text: "" }), true);
  assert.equal(isEmptyBlock({ type: "text", text: " " }), false);
  assert.equal(isEmptyBlock({ type: "thinking", thinking: "" }), true);
  assert.equal(isEmptyBlock({ type: "thinking", signature: "sig" }), false);
  assert.equal(isEmptyBlock({ type: "redacted_thinking", data: "abc" }), false);
  assert.equal(isEmptyBlock({ type: "tool_result", content: [] }), false);
  assert.equal(isEmptyBlock("text"), false);
});

test("registers a provider-request handler and a diagnostics command", () => {
  const handlers = new Map();
  const commands = [];
  registerWireGuard({
    on(name, handler) {
      handlers.set(name, handler);
    },
    registerCommand(name) {
      commands.push(name);
    },
  });
  assert.equal(handlers.size, 1);
  const handler = handlers.get("before_provider_request");
  assert.ok(handler);
  assert.ok(commands.includes("wire-guard"));

  resetWireGuardStats();
  assert.equal(handler({ type: "before_provider_request", payload: EMPTY_M0 }).messages.length, 3);
  assert.equal(handler({ type: "before_provider_request", payload: { messages: [] } }), undefined);
});
