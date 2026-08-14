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
        widgets.delete(key); // Pi's setExtensionWidget removes, then re-inserts at the END
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

test("re-orders the working widget below a lazily registered todo overlay", async () => {
  const handlers = new Map();
  const widgets = new Map();
  const ctx = {
    mode: "tui",
    ui: {
      theme: { fg(_color, text) { return text; } },
      setWorkingMessage() {},
      setWorkingIndicator() {},
      setWorkingVisible() {},
      setWidget(key, factory) {
        if (factory === undefined) {
          widgets.delete(key);
          return;
        }
        widgets.delete(key); // Pi's setExtensionWidget removes, then re-inserts at the END
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
    // pi-maestro-todo registers its widget lazily on the first todo tool run of
    // a turn — AFTER the working widget mounted at agent_start.
    widgets.set("pi-maestro-todo", { render: () => ["todo"] });
    assert.equal([...widgets.keys()].at(-1), "pi-maestro-todo");
    await handlers.get("tool_execution_end")({ toolName: "todo" }, ctx);
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal([...widgets.keys()].at(-1), "pi-tool-rails-working");
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


function createHudContext(log) {
  return {
    mode: "tui",
    ui: {
      theme: { fg(_color, text) { return text; } },
      setWorkingMessage(value) { log.messages.push(value); },
      setWorkingIndicator(value) { log.indicators.push(value); },
      setWorkingVisible(value) { log.visibility.push(value); },
      setWidget(_key, factory) {
        log.widgets.push(factory === undefined ? "remove" : "set");
        if (factory) factory({ requestRender() { log.renders += 1; } });
      },
    },
  };
}

test("does not mount a retired session's queued working widget after replacement", async () => {
  const handlers = new Map();
  const firstLog = { messages: [], indicators: [], visibility: [], widgets: [], renders: 0 };
  const secondLog = { messages: [], indicators: [], visibility: [], widgets: [], renders: 0 };
  const first = createHudContext(firstLog);
  const second = createHudContext(secondLog);
  const pi = {
    on(event, handler) { handlers.set(event, handler); },
    getThinkingLevel() { return "high"; },
  };

  installThinkingShimmer(pi);
  await handlers.get("session_start")({}, first);
  await handlers.get("session_shutdown")();
  await handlers.get("session_start")({}, second);
  await new Promise((resolve) => setTimeout(resolve, 0));
  try {
    assert.deepEqual(firstLog.widgets, []);
    assert.deepEqual(firstLog.visibility, []);
    assert.deepEqual(secondLog.widgets, ["set"]);
  } finally {
    await handlers.get("session_shutdown")();
  }
});

test("does not rebalance or hide native work for a retired session", async () => {
  const handlers = new Map();
  const firstLog = { messages: [], indicators: [], visibility: [], widgets: [], renders: 0 };
  const secondLog = { messages: [], indicators: [], visibility: [], widgets: [], renders: 0 };
  const first = createHudContext(firstLog);
  const second = createHudContext(secondLog);
  const pi = {
    on(event, handler) { handlers.set(event, handler); },
    getThinkingLevel() { return "high"; },
  };

  installThinkingShimmer(pi);
  await handlers.get("session_start")({}, first);
  await handlers.get("agent_start")({}, first);
  await handlers.get("tool_execution_end")({ toolName: "todo" }, first);
  await handlers.get("session_shutdown")();
  const firstAfterShutdown = structuredClone(firstLog);
  await handlers.get("session_start")({}, second);
  await new Promise((resolve) => setTimeout(resolve, 0));
  try {
    assert.deepEqual(firstLog, firstAfterShutdown);
    assert.deepEqual(secondLog.widgets, ["set"]);
  } finally {
    await handlers.get("session_shutdown")();
  }
});
