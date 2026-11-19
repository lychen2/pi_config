import assert from "node:assert/strict";
import test from "node:test";
import {
  isEmptyBlock,
  planImageBudget,
  registerWireGuard,
  resetWireGuardStats,
  sanitizeProviderPayload,
  wireGuardStats,
} from "../wire-guard.ts";

const IMAGE_BYTES = 400_000;
/** Stand-in for base64 payload: the guard measures length, never decodes. */
const fakeBase64 = (bytes = IMAGE_BYTES) => "A".repeat(bytes);
const anthropicImage = (data = fakeBase64()) => ({
  type: "image",
  source: { type: "base64", media_type: "image/png", data },
});
const openaiImage = (data = fakeBase64()) => ({
  type: "image_url",
  image_url: { url: `data:image/png;base64,${data}` },
});

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

test("drops the oldest images over the request budget and keeps the newest", () => {
  resetWireGuardStats();
  const payload = {
    messages: [
      { role: "user", content: [{ type: "text", text: "first screenshot" }, anthropicImage()] },
      { role: "assistant", content: [{ type: "text", text: "ok" }] },
      { role: "user", content: [{ type: "text", text: "second screenshot" }, anthropicImage()] },
      { role: "user", content: [{ type: "text", text: "third screenshot" }, anthropicImage()] },
    ],
  };
  const sanitized = sanitizeProviderPayload(payload, { requestBytes: 1_000_000 });
  assert.ok(sanitized, "three 400 KB images cannot fit a 1 MB request budget");

  const blocks = sanitized.messages.map((message) => message.content.map((block) => block.type));
  assert.deepEqual(blocks, [["text", "text"], ["text"], ["text", "image"], ["text", "image"]]);
  assert.match(sanitized.messages[0].content[1].text, /^\[image omitted: image\/png, 391 KB of base64/);

  // The original payload keeps its images; only the returned copy is trimmed.
  assert.equal(payload.messages[0].content[1].type, "image");
  assert.equal(wireGuardStats().droppedImages, 1);
  assert.equal(wireGuardStats().droppedImageBytes, IMAGE_BYTES);
});

test("records every image it has to drop, in encounter order", () => {
  resetWireGuardStats();
  const payload = {
    messages: [
      { role: "user", content: [anthropicImage()] },
      { role: "user", content: [anthropicImage()] },
      { role: "user", content: [anthropicImage()] },
    ],
  };
  const sanitized = sanitizeProviderPayload(payload, { requestBytes: 700_000 });
  assert.ok(sanitized);
  assert.deepEqual(
    sanitized.messages.map((message) => message.content[0].type),
    ["text", "text", "image"],
  );
  assert.equal(wireGuardStats().droppedImages, 2);
  assert.equal(wireGuardStats().droppedImageBytes, IMAGE_BYTES * 2);
});

test("leaves images alone while they fit the request budget", () => {
  resetWireGuardStats();
  const payload = {
    messages: [{ role: "user", content: [{ type: "text", text: "one shot" }, anthropicImage()] }],
  };
  assert.equal(sanitizeProviderPayload(payload, { requestBytes: 4_000_000 }), undefined);
  assert.equal(wireGuardStats().droppedImages, 0);
});

test("trims OpenAI data URLs and ignores images that cost no body bytes", () => {
  resetWireGuardStats();
  const payload = {
    messages: [
      { role: "user", content: [{ type: "text", text: "old" }, openaiImage()] },
      { role: "user", content: [{ type: "text", text: "new" }, openaiImage()] },
      { role: "user", content: [{ type: "image_url", image_url: { url: "https://example.test/shot.png" } }] },
    ],
  };
  const sanitized = sanitizeProviderPayload(payload, { requestBytes: 700_000 });
  assert.ok(sanitized);
  assert.equal(sanitized.messages[0].content[1].type, "text");
  assert.equal(sanitized.messages[1].content[1].type, "image_url");
  assert.equal(sanitized.messages[2].content[0].type, "image_url");
  assert.equal(wireGuardStats().droppedImages, 1);
});

test("trims images nested in Anthropic tool results", () => {
  resetWireGuardStats();
  const toolResult = (id) => ({
    role: "user",
    content: [
      {
        type: "tool_result",
        tool_use_id: id,
        content: [{ type: "text", text: "Read image" }, anthropicImage()],
      },
    ],
  });
  const payload = { messages: [toolResult("t1"), toolResult("t2")] };
  const sanitized = sanitizeProviderPayload(payload, { requestBytes: 700_000 });
  assert.ok(sanitized);
  const [oldResult, newResult] = sanitized.messages;
  assert.deepEqual(oldResult.content[0].content.map((block) => block.type), ["text", "text"]);
  assert.equal(oldResult.content[0].tool_use_id, "t1");
  assert.deepEqual(newResult.content[0].content.map((block) => block.type), ["text", "image"]);
});

test("uses the text block type of the surrounding array for the placeholder", () => {
  resetWireGuardStats();
  const responsesImage = () => ({ type: "input_image", image_url: `data:image/png;base64,${fakeBase64()}` });
  const payload = {
    input: [
      { role: "user", content: [{ type: "input_text", text: "old" }, responsesImage()] },
      { role: "user", content: [{ type: "input_text", text: "new" }, responsesImage()] },
    ],
  };
  const sanitized = sanitizeProviderPayload(payload, { requestBytes: 700_000 });
  assert.ok(sanitized);
  assert.equal(sanitized.input[0].content[1].type, "input_text");
  assert.equal(sanitized.input[1].content[1].type, "input_image");
});

test("keeps the newest image even when text alone fills the budget", () => {
  const scan = {
    refs: [
      { kind: "base64", bytes: 1_000, label: "image/png" },
      { kind: "base64", bytes: 1_000, label: "image/png" },
    ],
    nonImageBytes: 10_000_000,
  };
  const plan = planImageBudget(scan, 1_000_000);
  assert.equal(plan.dropBefore, 2);
  assert.equal(plan.droppedBytes, 2_000);
});

test("registers a provider-request handler, a session reset and a diagnostics command", () => {
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
  assert.deepEqual([...handlers.keys()].sort(), ["before_provider_request", "session_start"]);
  const handler = handlers.get("before_provider_request");
  assert.ok(handler);
  assert.ok(commands.includes("wire-guard"));

  const ctx = { ui: { notify() {} } };
  resetWireGuardStats();
  assert.equal(handler({ type: "before_provider_request", payload: EMPTY_M0 }, ctx).messages.length, 3);
  assert.equal(handler({ type: "before_provider_request", payload: { messages: [] } }, ctx), undefined);
});
