import assert from "node:assert/strict";
import test from "node:test";

import {
  isStandaloneToolNameLine,
  labelLayout,
  labelLines,
  labelPadding,
  renderWithCapturedSelf,
  styleStructuredLine,
  visibleToolContentLines,
} from "../compact-shell.ts";

const identityTheme = {
  fg(_color, text) {
    return text;
  },
};

test("uses compact tool text labels with emoji rendered separately", () => {
  assert.deepEqual(labelLines("add_directory"), ["add"]);
  assert.deepEqual(labelLines("agent_browser"), ["browser"]);
  assert.deepEqual(labelLines("undo_last_replace"), ["undo"]);
  assert.deepEqual(labelLines("todowrite"), ["todo", "write"]);
  assert.deepEqual(labelLines("replace"), ["replace"]);
});

test("keeps a single overlong tool word compact", () => {
  assert.deepEqual(labelLines("verylongtool"), ["verylon…"]);
});

test("places the emoji immediately before centered text without shifting its center", () => {
  assert.deepEqual(labelLayout("todowrite", 0, "todo"), {
    emoji: "✏️",
    text: "todo",
    left: 2,
    right: 4,
  });
  assert.deepEqual(labelLayout("todowrite", 1, "write"), {
    emoji: "",
    text: "write",
    left: 3,
    right: 4,
  });
});

test("recognizes the default tool-name-only header", () => {
  assert.equal(isStandaloneToolNameLine("undo_last_replace", "undo_last_replace"), true);
  assert.equal(isStandaloneToolNameLine("undo_last_replace /tmp/file", "undo_last_replace"), false);
});

test("keeps the extra padding cell on the right", () => {
  assert.deepEqual(labelPadding("REPLACE"), { left: 2, right: 3 });
});

test("keeps collapsed structured output to a useful two-line summary", () => {
  assert.deepEqual(
    visibleToolContentLines(["Todos — 2 active", "✓ #inspect", "◐ #adjust", "○ #verify"]),
    ["Todos — 2 active", "◐ #adjust"],
  );
});

test("colors structured status and task identifiers", () => {
  const theme = {
    fg(color, text) {
      return `<${color}>${text}</${color}>`;
    },
  };
  assert.equal(
    styleStructuredLine("◐ #adjust improve blur", theme),
    "<warning>◐</warning> <accent>#adjust</accent> improve blur",
  );
  assert.equal(styleStructuredLine("Todos — 2 active", theme), "<toolTitle>Todos — 2 active</toolTitle>");
  assert.equal(styleStructuredLine("plain result", identityTheme), "plain result");
});

test("reuses self-render output from the original shell render", () => {
  let renderCalls = 0;
  const container = {
    render(width) {
      renderCalls += 1;
      return [`content:${width}`];
    },
  };
  const component = {};
  const originalContainerRender = container.render;
  const rendered = renderWithCapturedSelf(
    component,
    function (width) {
      return ["shell", ...container.render(width)];
    },
    container,
    20,
  );

  assert.equal(renderCalls, 1);
  assert.deepEqual(rendered.lines, ["shell", "content:20"]);
  assert.deepEqual(rendered.contentLines, ["content:20"]);
  assert.equal(container.render, originalContainerRender);
});
