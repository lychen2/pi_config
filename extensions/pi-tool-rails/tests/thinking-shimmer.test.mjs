import assert from "node:assert/strict";
import test from "node:test";

import {
  PHASE_LINES,
  animatedDots,
  colorSweep,
  estimateTextTokens,
  formatTokenCount,
  installThinkingShimmer,
  reportedOutputTokens,
  reducedMotionEnabled,
  shuffledPhaseOrder,
} from "../thinking-shimmer.ts";

test("keeps animated dot frames at a fixed width", () => {
  assert.deepEqual([animatedDots(0), animatedDots(8), animatedDots(16)], [".  ", ".. ", "..."]);
  assert.equal(new Set([animatedDots(0), animatedDots(8), animatedDots(16)].map((value) => value.length)).size, 1);
});

test("keeps work text static and muted instead of animating a whole-text wave", () => {
  const theme = { fg: (color, text) => `<${color}>${text}</${color}>` };
  const text = "正在整理工具执行参数";
  const first = colorSweep(theme, text, 0, false, false);
  const next = colorSweep(theme, text, 1, true, true);

  assert.equal(first, `<muted>${text}</muted>`);
  assert.equal(next, first);
});

test("recognizes the opt-in reduced-motion setting", () => {
  const previous = process.env.PI_TOOL_RAILS_REDUCED_MOTION;
  try {
    delete process.env.PI_TOOL_RAILS_REDUCED_MOTION;
    assert.equal(reducedMotionEnabled(), false);
    process.env.PI_TOOL_RAILS_REDUCED_MOTION = "1";
    assert.equal(reducedMotionEnabled(), true);
    process.env.PI_TOOL_RAILS_REDUCED_MOTION = "true";
    assert.equal(reducedMotionEnabled(), false);
  } finally {
    if (previous === undefined) delete process.env.PI_TOOL_RAILS_REDUCED_MOTION;
    else process.env.PI_TOOL_RAILS_REDUCED_MOTION = previous;
  }
});
test("keeps phase lines balanced and shuffles every index", () => {
  for (const lines of Object.values(PHASE_LINES)) assert.equal(lines.length, 34);
  const order = shuffledPhaseOrder(34, () => 0.25);
  assert.deepEqual([...order].sort((left, right) => left - right), Array.from({ length: 34 }, (_, index) => index));
});

test("keeps token accounting compatible with the reference estimator", () => {
  assert.equal(formatTokenCount(1), "1 词元");
  assert.equal(formatTokenCount(1000), "1k 词元");
  assert.equal(estimateTextTokens("中文"), 2);
  assert.equal(reportedOutputTokens({ usage: { output: 12 } }), 12);
  assert.equal(reportedOutputTokens({ usage: { output: 0 } }), null);
  assert.equal(reportedOutputTokens({ usage: { output: 0, input: 3 } }, true), 0);
});

function createHudContext(log) {
  return {
    mode: "tui",
    ui: {
      theme: { fg(color, text) { return `<${color}>${text}</${color}>`; } },
      setWorkingMessage(value) { log.messages.push(value); },
      setWorkingIndicator(value) { log.indicators.push(value); },
      setWorkingVisible(value) { log.visibility.push(value); },
    },
  };
}

function plainMessage(value) {
  return value.replace(/<\/(?:accent|dim|error|muted|success|thinkingHigh|thinkingLow|thinkingMax|thinkingMedium|thinkingMinimal|thinkingOff|thinkingXhigh|toolOutput|toolTitle|warning)>|<(?:accent|dim|error|muted|success|thinkingHigh|thinkingLow|thinkingMax|thinkingMedium|thinkingMinimal|thinkingOff|thinkingXhigh|toolOutput|toolTitle|warning)>/g, "");
}

function workText(value) {
  return value.match(/<muted>([^<]*)/)?.[1];
}

test("uses one native animated indicator while work text stays steady", async () => {
  const handlers = new Map();
  const log = { messages: [], indicators: [], visibility: [] };
  const ctx = createHudContext(log);
  const pi = {
    on(event, handler) { handlers.set(event, handler); },
    getThinkingLevel() { return "high"; },
  };

  const previousMotion = process.env.PI_TOOL_RAILS_REDUCED_MOTION;
  delete process.env.PI_TOOL_RAILS_REDUCED_MOTION;
  installThinkingShimmer(pi);
  try {
    await handlers.get("session_start")({}, ctx);
    await handlers.get("agent_start")({}, ctx);
    assert.ok(PHASE_LINES.requesting.some((line) => plainMessage(log.messages.at(-1)).includes(line)));
    assert.equal(log.visibility.at(-1), true);
    assert.ok(log.indicators.at(-1).frames.length > 1);
    assert.equal(log.indicators.at(-1).intervalMs, 125);

    await handlers.get("message_update")({
      assistantMessageEvent: { type: "thinking_start", contentIndex: 0 },
      message: { content: [{ type: "thinking", thinking: "reason" }] },
    }, ctx);
    assert.ok(PHASE_LINES.thinking.some((line) => plainMessage(log.messages.at(-1)).includes(line)));

    await handlers.get("message_update")({
      assistantMessageEvent: { type: "toolcall_start", contentIndex: 0 },
      message: { content: [{ type: "toolCall", name: "read", arguments: {} }] },
    }, ctx);
    assert.ok(PHASE_LINES["tool-input"].some((line) => plainMessage(log.messages.at(-1)).includes(line)));
    assert.ok(!plainMessage(log.messages.at(-1)).includes("装配参数"));

    await handlers.get("turn_end")({}, ctx);
    const statusLine = log.messages.at(-1);
    const beforeWait = log.messages.length;
    await new Promise((resolve) => setTimeout(resolve, 180));
    assert.ok(log.messages.length > beforeWait, "factual elapsed time should continue updating");
    assert.ok(log.messages.length - beforeWait <= 2, "status refresh is capped at 8Hz");
    assert.equal(workText(log.messages.at(-1)), workText(statusLine), "decorative status text should stay static");
    await handlers.get("tool_execution_start")({ toolName: "read", toolCallId: "call-1" }, ctx);
    assert.ok(plainMessage(log.messages.at(-1)).includes("正在执行：读取"));
    const toolFrame = log.messages.at(-1);
    const beforeToolWait = log.messages.length;
    await new Promise((resolve) => setTimeout(resolve, 180));
    assert.ok(log.messages.length - beforeToolWait <= 2, "working HUD refresh is capped at 8Hz");
    assert.equal(workText(log.messages.at(-1)), workText(toolFrame), "working text should remain static while loader animates");

    process.env.PI_TOOL_RAILS_REDUCED_MOTION = "1";
    await handlers.get("message_update")({
      assistantMessageEvent: { type: "thinking_start", contentIndex: 1 },
      message: { content: [{ type: "thinking", thinking: "reason" }, { type: "thinking", thinking: "next" }] },
    }, ctx);
    assert.equal(log.indicators.at(-1).frames.length, 1);
    assert.equal(log.indicators.at(-1).intervalMs, 125);
    const initialStatus = plainMessage(log.messages.at(-1));
    await new Promise((resolve) => setTimeout(resolve, 1_100));
    assert.notEqual(plainMessage(log.messages.at(-1)), initialStatus, "factual elapsed seconds still update");
  } finally {
    await handlers.get("agent_end")({}, ctx);
    assert.equal(log.messages.at(-1), undefined);
    assert.equal(log.indicators.at(-1), undefined);
    await handlers.get("session_shutdown")();
    if (previousMotion === undefined) delete process.env.PI_TOOL_RAILS_REDUCED_MOTION;
    else process.env.PI_TOOL_RAILS_REDUCED_MOTION = previousMotion;
  }
});
