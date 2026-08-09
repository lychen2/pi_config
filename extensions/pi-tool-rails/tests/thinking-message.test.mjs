import assert from "node:assert/strict";
import test from "node:test";

import {
  ThinkingTrailComponent,
  recolorHiddenThinkingLines,
  thinkingChildIndices,
} from "../thinking-message.ts";

const theme = {
  fg(_color, text) { return text; },
  italic(text) { return text; },
};

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
  assert.ok(rendered[0].includes("Thought trail · 2 steps"));
  assert.ok(rendered[1].includes("├─"));
  assert.ok(rendered[3].includes("╰─"));
  assert.ok(rendered[1].includes("first step"));
});

test("recolors the native collapsed thinking placeholder", () => {
  assert.deepEqual(
    recolorHiddenThinkingLines(["  Thinking...", "plain"], theme),
    ["  ✦ Thought", "plain"],
  );
});
