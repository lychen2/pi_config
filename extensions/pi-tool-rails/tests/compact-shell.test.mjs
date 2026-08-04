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
  assert.deepEqual(labelLines("web_search"), ["web"]);
  assert.deepEqual(labelLines("fetch_content"), ["fetch"]);
  assert.equal(labelLayout("fffind", 0, "ff find").emoji, "🧭");
  assert.equal(labelLayout("ffgrep", 0, "ffgrep").emoji, "🔍");
  assert.deepEqual(labelLines("undo_last_replace"), ["undo"]);
  assert.deepEqual(labelLines("todowrite"), ["tasks"]);
  assert.deepEqual(labelLines("replace"), ["replace"]);
  assert.deepEqual(labelLines("aft_inspect"), ["health"]);
  assert.deepEqual(labelLines("aft_outline"), ["outline"]);
  assert.deepEqual(labelLines("ast_grep_search"), ["ast find"]);
  assert.equal(labelLayout("aft_inspect", 0, "health").emoji, "🩺");
  assert.equal(labelLayout("aft_zoom", 0, "zoom").emoji, "🔬");
  assert.equal(labelLayout("ast_grep_replace", 0, "ast edit").emoji, "🌳");
});

test("keeps a single overlong tool word compact", () => {
  assert.deepEqual(labelLines("verylongtool"), ["verylon…"]);
});

test("places the emoji immediately before centered text without shifting its center", () => {
  assert.deepEqual(labelLayout("todowrite", 0, "tasks"), {
    emoji: "✅",
    text: "tasks",
    left: 1,
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
  assert.deepEqual(
    visibleToolContentLines(["inspect project", "4 warnings", "..."]),
    ["inspect project", "4 warnings"],
  );
  assert.deepEqual(visibleToolContentLines(["inspect project", "..."]), ["inspect project"]);
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
