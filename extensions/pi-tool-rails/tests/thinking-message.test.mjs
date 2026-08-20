import assert from "node:assert/strict";
import test from "node:test";

import {
  ThinkingTrailComponent,
  hasLeadingThinkingBlock,
  recolorHiddenThinkingLines,
  thinkingChildIndices,
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
  assert.ok(rendered[0].includes("思考轨迹 · 2 步"));
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
  assert.match(recolored, /✦ 思考轨迹/);
  assert.deepEqual(recolorHiddenThinkingLines(["Thinking..."], theme, false), ["Thinking..."]);
});

test("recolors the native collapsed thinking placeholder", () => {
  assert.deepEqual(
    recolorHiddenThinkingLines(["  Thinking...", "plain"], theme),
    ["  ✦ 思考轨迹", "plain"],
  );
});
