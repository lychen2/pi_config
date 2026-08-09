import assert from "node:assert/strict";
import test from "node:test";

import {
  animatedDots,
  estimateTextTokens,
  formatTokenCount,
  installThinkingShimmer,
  reportedOutputTokens,
} from "../thinking-shimmer.ts";

test("keeps animated dot frames at a fixed width", () => {
  assert.deepEqual([animatedDots(0), animatedDots(8), animatedDots(16)], [".  ", ".. ", "..."]);
  assert.equal(new Set([animatedDots(0), animatedDots(8), animatedDots(16)].map((value) => value.length)).size, 1);
});

test("keeps token accounting compatible with the reference estimator", () => {
  assert.equal(formatTokenCount(1), "1 token");
  assert.equal(formatTokenCount(1000), "1k tokens");
  assert.equal(estimateTextTokens("中文"), 2);
  assert.equal(reportedOutputTokens({ usage: { output: 12 } }), 12);
  assert.equal(reportedOutputTokens({ usage: { output: 0 } }), null);
  assert.equal(reportedOutputTokens({ usage: { output: 0, input: 3 } }, true), 0);
});

test("keeps the animated glyph in the todo-adjacent working widget", async () => {
  const handlers = new Map();
  const widgets = new Map([["todo", { render: () => ["todo"] }]]);
  const workingVisibility = [];
  const ctx = {
    mode: "tui",
    ui: {
      theme: { fg(_color, text) { return text; } },
      setWorkingMessage() {},
      setWorkingIndicator() {},
      setWorkingVisible(value) { workingVisibility.push(value); },
      setWidget(key, factory) {
        if (factory === undefined) {
          widgets.delete(key);
          return;
        }
        widgets.set(key, factory({ requestRender() {} }));
      },
    },
  };
  const pi = {
    on(event, handler) { handlers.set(event, handler); },
    getThinkingLevel() { return "high"; },
  };

  installThinkingShimmer(pi);
  await handlers.get("session_start")({}, ctx);
  await handlers.get("agent_start")({}, ctx);
  try {
    const widget = widgets.get("pi-tool-rails-working");
    assert.match(widget.render()[0], /^[·✢✳✶✻✽] Preparing/);
    assert.equal([...widgets.keys()].at(-1), "pi-tool-rails-working");
    assert.equal(workingVisibility.at(-1), false);
  } finally {
    await handlers.get("session_shutdown")();
  }
});

test("starts, switches, and cleans the working HUD through Pi events", async () => {
  const handlers = new Map();
  const messages = [];
  const indicators = [];
  const ctx = {
    mode: "tui",
    ui: {
      theme: { fg(_color, text) { return text; } },
      setWorkingMessage(message) { messages.push(message); },
      setWorkingIndicator(indicator) { indicators.push(indicator); },
    },
  };
  const pi = {
    on(event, handler) { handlers.set(event, handler); },
    getThinkingLevel() { return "high"; },
  };

  installThinkingShimmer(pi);
  await handlers.get("session_start")({}, ctx);
  try {
    await handlers.get("agent_start")({}, ctx);
    assert.ok(messages.some((message) => typeof message === "string" && message.includes("Preparing")));
    assert.ok(indicators.at(-1)?.frames.length > 0);

    await handlers.get("message_update")({
      assistantMessageEvent: { type: "thinking_start", contentIndex: 0 },
      message: { content: [{ type: "thinking", thinking: "reason" }] },
    }, ctx);
    assert.ok(messages.at(-1).includes("Thinking"));
    assert.ok(indicators.at(-1).frames.length > 0);

    await handlers.get("agent_end")({}, ctx);
    assert.equal(messages.at(-1), undefined);
  } finally {
    await handlers.get("session_shutdown")();
  }
  assert.equal(indicators.at(-1), undefined);
});
