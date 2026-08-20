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
  shuffledPhaseOrder,
} from "../thinking-shimmer.ts";

test("keeps animated dot frames at a fixed width", () => {
  assert.deepEqual([animatedDots(0), animatedDots(8), animatedDots(16)], [".  ", ".. ", "..."]);
  assert.equal(new Set([animatedDots(0), animatedDots(8), animatedDots(16)].map((value) => value.length)).size, 1);
});

test("moves a one-way wave through the current theme colors", () => {
  const theme = { fg: (color, text) => `<${color}>${text}</${color}>` };
  const text = "正在整理工具执行参数";
  const first = colorSweep(theme, text, 0, false, false);
  const next = colorSweep(theme, text, 1, false, false);
  const reversedFlag = colorSweep(theme, text, 1, true, false);

  assert.match(first, /<toolTitle>/);
  assert.match(first, /<accent>/);
  assert.match(first, /<muted>/);
  assert.match(first, /<dim>/);
  assert.notEqual(first, next);
  assert.equal(next, reversedFlag);
});

test("keeps stalled shimmer inside the Matugen cool palette", () => {
  const theme = { fg: (color, text) => `<${color}>${text}</${color}>` };
  const rendered = colorSweep(theme, "流光缓存", 0, false, true);

  assert.doesNotMatch(rendered, /<(?:error|warning)>/);
  assert.match(rendered, /<(?:toolTitle|accent|dim)>/);
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

test("uses Pi's native animated Loader for changing work phases", async () => {
  const handlers = new Map();
  const log = { messages: [], indicators: [], visibility: [] };
  const ctx = createHudContext(log);
  const pi = {
    on(event, handler) { handlers.set(event, handler); },
    getThinkingLevel() { return "high"; },
  };

  installThinkingShimmer(pi);
  await handlers.get("session_start")({}, ctx);
  try {
    await handlers.get("agent_start")({}, ctx);
    assert.ok(PHASE_LINES.requesting.some((line) => plainMessage(log.messages.at(-1)).includes(line)));
    assert.equal(log.visibility.at(-1), true);
    assert.ok(log.indicators.at(-1).frames.length > 1);

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
    const beforeTurnEndWait = log.messages.length;
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.ok(log.messages.length > beforeTurnEndWait);
    await handlers.get("tool_execution_start")({ toolName: "read", toolCallId: "call-1" }, ctx);
    assert.ok(plainMessage(log.messages.at(-1)).includes("正在执行：读取"));
    const beforeResize = log.messages.length;
    process.stdout.emit("resize");
    assert.ok(log.messages.length > beforeResize);
    const toolFrame = log.messages.at(-1);
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.notEqual(log.messages.at(-1), toolFrame);

    await handlers.get("agent_end")({}, ctx);
    assert.equal(log.messages.at(-1), undefined);
    assert.equal(log.indicators.at(-1), undefined);
  } finally {
    await handlers.get("session_shutdown")();
  }
});
