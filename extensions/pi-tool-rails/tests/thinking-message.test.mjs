import assert from "node:assert/strict";
import test from "node:test";
import { visibleWidth } from "@earendil-works/pi-tui";

import {
  ThinkingSummaryComponent,
  ThinkingTrailComponent,
  clearThinkingTimings,
  formatThinkingDuration,
  hasLeadingThinkingBlock,
  recolorHiddenThinkingLines,
  recordThinkingTiming,
  replaceThinkingChild,
  thinkingChildIndices,
  thinkingRegion,
  thinkingRunIsLive,
  thinkingRunStats,
  thinkingRuns,
} from "../thinking-message.ts";

const theme = {
  fg(_color, text) { return text; },
  italic(text) { return text; },
};

test("identifies thinking as the first visible assistant content", () => {
  assert.equal(
    hasLeadingThinkingBlock({
      content: [
        { type: "toolCall" },
        { type: "thinking", thinking: "first" },
        { type: "text", text: "answer" },
      ],
    }),
    true,
  );
  assert.equal(
    hasLeadingThinkingBlock({
      content: [
        { type: "text", text: "answer" },
        { type: "thinking", thinking: "second" },
      ],
    }),
    false,
  );
});

test("groups consecutive thinking blocks and maps them to assistant children", () => {
  assert.deepEqual(
    thinkingChildIndices({
      content: [
        { type: "thinking", thinking: "first" },
        { type: "thinking", thinking: "continuation" },
        { type: "text", text: "answer" },
        { type: "thinking", thinking: "second trail" },
      ],
    }),
    [1, 4],
  );
});

test("renders the reference tree trail with bounded preview lines", () => {
  const component = new ThinkingTrailComponent(
    {
      render() { return [" first step", "wrapped", "", " last step"]; },
    },
    () => theme,
  );
  const rendered = component.render(60);
  assert.equal(rendered.length, 4);
  assert.ok(rendered[0].includes("思考 · 2 步"));
  assert.ok(rendered[1].includes("├─"));
  assert.ok(rendered[3].includes("╰─"));
  assert.ok(rendered[1].includes("first step"));
});

test("adds semantic markers to important thinking steps", () => {
  const semanticTheme = {
    fg(color, text) { return `<${color}>${text}</${color}>`; },
    bold(text) { return text; },
    italic(text) { return text; },
  };
  const component = new ThinkingTrailComponent(
    {
      render() { return ["I need to verify the test suite", "", "Build failed with an error"]; },
    },
    () => semanticTheme,
  );
  const rendered = component.render(80).join("\n");
  assert.match(rendered, /<success>✓<\/success>/);
  assert.match(rendered, /<error>!<\/error>/);
});

test("keeps English punctuation and avoids substring role matches", () => {
  const semanticTheme = {
    fg(color, text) { return `<${color}>${text}</${color}>`; },
    bold(text) { return text; },
    italic(text) { return text; },
  };
  const component = new ThinkingTrailComponent(
    {
      render() { return ["Already handled.", "", "Bypass the cache.", "", "I need tools", "", "Compare options,", "", "Build failed with an error."]; },
    },
    () => semanticTheme,
  );
  const rendered = component.render(100).join("\n");
  assert.doesNotMatch(rendered, /<mdLink>⌕<\/mdLink>/);
  assert.doesNotMatch(rendered, /<success>✓<\/success>/);
  assert.match(rendered, /I need tools\./);
  assert.match(rendered, /Compare options\./);
  assert.doesNotMatch(rendered, /options,\./);
  assert.match(rendered, /Build failed with an error\./);
  assert.doesNotMatch(rendered, /error。/);
});

test("preserves OSC-8 link text in thinking summaries", () => {
  const link = "\x1b]8;;https://example.com\x1b\\README\x1b]8;;\x1b\\";
  const component = new ThinkingTrailComponent(
    { render() { return [` ${link}`]; } },
    () => theme,
  );
  assert.match(component.render(60).join("\n"), /README/);
});

test("keeps the final preview lines and the retained step title", () => {
  const component = new ThinkingTrailComponent(
    {
      render() {
        return Array.from({ length: 18 }, (_, index) => ` line ${index + 1}`);
      },
    },
    () => theme,
  );
  const rendered = component.render(60);
  assert.equal(rendered.length, 18);
  assert.ok(rendered[1].includes("省略 2 行"));
  const renderedText = rendered.join("\n");
  assert.match(renderedText, /line 1\./);
  assert.doesNotMatch(renderedText, /line [23](?:\n|$)/);
  assert.match(renderedText, /line 4(?:\n|$)/);
  assert.match(renderedText, /line 18(?:\n|$)/);
});

test("recolors only hidden thinking labels and preserves OSC-133 markers", () => {
  const zoneEnd = "\x1b]133;B\x07\x1b]133;C\x07";
  const original = `${zoneEnd}  \x1b[3mThinking...\x1b[0m`;
  const recolored = recolorHiddenThinkingLines([original], theme)[0];
  assert.ok(recolored.startsWith(zoneEnd));
  assert.ok(recolored.endsWith("\x1b[0m"));
  assert.match(recolored, /✦ 思考/);
  assert.deepEqual(recolorHiddenThinkingLines(["Thinking..."], theme, false), ["Thinking..."]);
});

test("recolors the native collapsed thinking placeholder", () => {
  assert.deepEqual(
    recolorHiddenThinkingLines(["  Thinking...", "plain"], theme),
    ["  ✦ 思考", "plain"],
  );
});

test("groups thinking blocks into the runs Pi numbers", () => {
  const message = {
    timestamp: 1000,
    content: [
      { type: "thinking", thinking: " " },
      { type: "thinking", thinking: "first " },
      { type: "thinking", thinking: "run tail" },
      { type: "text", text: "answer" },
      { type: "thinking", thinking: "second run" },
    ],
  };
  assert.deepEqual(thinkingRuns(message), [
    { blockIndices: [0, 1, 2], text: "first\n\nrun tail" },
    { blockIndices: [4], text: "second run" },
  ]);
});

test("formats thinking durations compactly", () => {
  assert.equal(formatThinkingDuration(900), "1s");
  assert.equal(formatThinkingDuration(18_400), "18s");
  assert.equal(formatThinkingDuration(75_000), "1m15s");
});

test("reports step count and measured duration for a settled run", () => {
  clearThinkingTimings();
  const message = { timestamp: 5_000, content: [{ type: "thinking", thinking: "one\n\ntwo\n\nthree" }] };
  const [run] = thinkingRuns(message);
  recordThinkingTiming({ assistantMessageEvent: { type: "thinking_start", contentIndex: 0 }, message }, 1_000);
  recordThinkingTiming({ assistantMessageEvent: { type: "thinking_end", contentIndex: 0 }, message }, 20_000);
  assert.deepEqual(thinkingRunStats(message, run), ["3 步", "19s"]);
  assert.equal(thinkingRunIsLive(message, run, true), false);
});

test("keeps the live run counting and flags it as still thinking", () => {
  clearThinkingTimings();
  const message = { timestamp: 6_000, content: [{ type: "thinking", thinking: "one\n\ntwo" }] };
  const [run] = thinkingRuns(message);
  recordThinkingTiming({ assistantMessageEvent: { type: "thinking_start", contentIndex: 0 }, message }, 30_000);
  assert.deepEqual(thinkingRunStats(message, run, true, 41_000), ["2 步", "11s"]);
  assert.equal(thinkingRunIsLive(message, run, true), true);
  // Once the stream settles the unfinished block no longer reports a duration.
  assert.deepEqual(thinkingRunStats(message, run, false), ["2 步"]);
  assert.equal(thinkingRunIsLive(message, run, false), false);
});

test("shows only a step count for thinking restored from session history", () => {
  clearThinkingTimings();
  const message = { timestamp: 7_000, content: [{ type: "thinking", thinking: "one\n\ntwo\n\nthree\n\nfour" }] };
  const [run] = thinkingRuns(message);
  assert.deepEqual(thinkingRunStats(message, run, false), ["4 步"]);
});

test("renders the collapsed run as one padded summary row", () => {
  const component = new ThinkingSummaryComponent(() => ["4 步", "18s"], () => theme);
  const rendered = component.render(40);
  assert.equal(rendered.length, 1);
  assert.equal(visibleWidth(rendered[0]), 40);
  const plain = rendered[0].replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "");
  assert.equal(plain.trim(), "✦ 思考 · 4 步 · 18s");
});

test("truncates a long summary row to the available width", () => {
  const component = new ThinkingSummaryComponent(() => ["9 步", "1m20s"], () => theme);
  const rendered = component.render(18);
  assert.equal(rendered.length, 1);
  assert.ok(rendered[0].replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "").trimEnd().length <= 18);
});

test("keeps Pi's click region outermost so the trail never wraps itself", () => {
  const content = { render: (width) => [` ${"x".repeat(Math.min(width, 6))}`] };
  const region = { child: content, render(width) { return this.child.render(width); } };

  assert.deepEqual(thinkingRegion(region), { region, content });
  assert.deepEqual(thinkingRegion(content), { content });

  const trail = new ThinkingTrailComponent(thinkingRegion(region).content, () => theme);
  const children = [region];
  replaceThinkingChild(region, 0, trail, children);
  assert.equal(children[0], region, "the click region must stay in its slot");
  assert.equal(region.child, trail);
  // Wrong wiring would recurse: trail -> region -> trail.
  assert.equal(trail.render(40).length, 2);
});

test("replaces an unframed thinking child in place", () => {
  const original = { render: () => [" original"] };
  const replacement = { render: () => [" replacement"] };
  const children = [original];
  replaceThinkingChild(original, 0, replacement, children);
  assert.deepEqual(children, [replacement]);
});

test("keeps the measured duration in the expanded trail header", () => {
  clearThinkingTimings();
  const message = { timestamp: 8_000, content: [{ type: "thinking", thinking: "one\n\ntwo" }] };
  const [run] = thinkingRuns(message);
  recordThinkingTiming({ assistantMessageEvent: { type: "thinking_start", contentIndex: 0 }, message }, 1_000);
  recordThinkingTiming({ assistantMessageEvent: { type: "thinking_end", contentIndex: 0 }, message }, 14_000);
  const component = new ThinkingTrailComponent(
    { render: () => [" one step", "", " two step"] },
    () => theme,
    () => thinkingRunStats(message, run),
  );
  assert.match(component.render(60)[0], /思考 · 2 步 · 13s/);
});
