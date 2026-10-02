import test from "node:test";
import assert from "node:assert/strict";
import { CURSOR_MARKER, visibleWidth } from "@earendil-works/pi-tui";
import promptFrame from "../prompt-frame.ts";

const theme = {
  fg: (_color, text) => text,
  bold: text => text,
};
const frameMarker = Symbol.for("test.editorFactory");

function setup(width, baseLines) {
  const hooks = new Map();
  let factory;
  const pi = {
    on: (event, handler) => hooks.set(event, handler),
    getThinkingLevel: () => "high",
  };
  promptFrame(pi, false);
  const ctx = {
    mode: "tui",
    model: { id: "test-model", provider: "openai" },
    ui: {
      theme,
      getEditorComponent: () => undefined,
      setEditorComponent: value => { factory = value; },
    },
  };
  hooks.get("session_start")({}, ctx);
  const baseFactory = () => ({
    render: requestedWidth => {
      assert.equal(requestedWidth, width < 16 ? width : width - 2);
      return baseLines;
    },
  });
  baseFactory[frameMarker] = true;
  ctx.ui.setEditorComponent(baseFactory);
  const editor = factory(null, theme, {});
  return { editor, factory, ctx, hooks, baseFactory };
}

for (const width of [40, 80, 120, 160]) {
  test(`frames prompt at ${width} columns without moving cursor or capturing completions`, () => {
    const baseLines = [
      "─".repeat(width < 48 ? width - 2 : width - 4),
      `中文 prompt ${CURSOR_MARKER}text`,
      "─".repeat(width < 48 ? width - 2 : width - 4),
      "  completion one",
      "  completion two",
    ];
    const { editor, factory, baseFactory, hooks, ctx } = setup(width, baseLines);
    const output = editor.render(width);
    assert.notEqual(output.at(-1), "", "no extra blank row before the footer");
    const completions = output.slice(-2);
    assert.deepEqual(completions, baseLines.slice(-2));
    assert.equal(output.filter(line => line.includes(CURSOR_MARKER)).length, 1);
    assert.equal(visibleWidth(output.find(line => line.includes(CURSOR_MARKER))), width);
    assert.match(output[0], /^─+$/);
    assert.match(output.at(-3), /^─+$/);
    assert.ok(output[1].startsWith("▐ "));
    assert.ok(output.at(-4).includes("test-model"));
    assert.ok(output[2].includes(CURSOR_MARKER));
    assert.equal(factory[frameMarker], true, "factory identity markers are forwarded");
    hooks.get("session_shutdown")?.({}, ctx);
  });
}

test("adds no footer spacer when there are no completion rows", () => {
  for (const width of [40, 80, 120, 160]) {
    const { editor } = setup(width, ["────", `输入 ${CURSOR_MARKER}`, "────"]);
    const output = editor.render(width);
    assert.notEqual(output.at(-1), "");
    assert.match(output.at(-1), /^─+$/);
    assert.equal(output.filter(line => line.includes(CURSOR_MARKER)).length, 1);
  }
});

test("leaves narrow prompt widths untouched", () => {
  const lines = ["short"];
  const { editor } = setup(12, lines);
  assert.deepEqual(editor.render(12), lines);
});

test("editor decoration remains idempotent and forwards input methods", () => {
  const hooks = new Map();
  let factory;
  const pi = {
    on: (event, handler) => hooks.set(event, handler),
    getThinkingLevel: () => "off",
  };
  promptFrame(pi, false);
  const ctx = {
    mode: "tui",
    ui: { theme, getEditorComponent: () => undefined, setEditorComponent: value => { factory = value; } },
  };
  hooks.get("session_start")({}, ctx);
  let inputs = 0;
  const base = { render: () => ["─", "body", "─"], handleInput: () => inputs++, getText: () => "body" };
  ctx.ui.setEditorComponent(() => base);
  const editor = factory(null, theme, {});
  editor.handleInput("x");
  assert.equal(inputs, 1);
  assert.equal(editor.getText(), "body");
  hooks.get("session_shutdown")({}, ctx);
});
