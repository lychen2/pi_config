import assert from "node:assert/strict";
import test from "node:test";
import { visibleWidth } from "@earendil-works/pi-tui";

import { materialToolIcon, toolIcon } from "../tool-presentations.mjs";
import { compactBashBody, compactToolBody } from "../tool-body-polish.ts";

import {
  backgroundLine,
  mutationBody,
  planBody,
  withoutBackground,
  isInternalToolDiagnosticLine,
  filterSoLStaticSavingsLines,
  isSoLStaticSavingsLine,
  isStandaloneToolNameLine,
  toolBoxBottom,
  toolBoxLine,
  toolBoxTop,
  labelLayout,
  labelLines,
  labelPadding,
  renderWithCapturedSelf,
  stabilizeToolBoxBody,
  styleStructuredLine,
  visibleToolContentLines,
} from "../compact-shell.ts";

const identityTheme = {
  fg(_color, text) {
    return text;
  },
};

test("mutation previews remove backgrounds, retain foregrounds, and count omitted rows", () => {
  assert.equal(withoutBackground("\x1b[1;31;48;2;40;49;100m+code\x1b[49m"), "\x1b[1;31m+code");
  assert.equal(withoutBackground("\x1b[42mgreen\x1b[0m\x1b[48;5;22mindexed"), "green\x1b[0mindexed");
  assert.equal(withoutBackground("\x1b[48:2::1:2:3mcolon"), "colon");
  const lines = Array.from({ length: 45 }, (_, i) => `\x1b[48;2;1;2;3mline ${i}\x1b[49m`);
  const collapsed = mutationBody(lines, false, identityTheme);
  assert.equal(collapsed.length, 13);
  assert.equal(collapsed.at(-1), "… +33 行 · 展开");
  assert.ok(collapsed.every((line) => !line.includes("\x1b[48")));
  assert.equal(mutationBody(lines, true, identityTheme).length, 45);
});

test("plans show actual goals and keep the active step visible in long plans", () => {
  const steps = Array.from({ length: 20 }, (_, i) => ({ goal: `step ${i}`, status: i === 19 ? "in_progress" : "completed" }));
  const collapsed = planBody(steps);
  assert.equal(collapsed[0], "计划 · 19/20 完成");
  assert.equal(collapsed[1], "◐ step 19");
  assert.equal(collapsed.at(-1), "… +9 步 · 展开");
  assert.equal(planBody(steps, true).length, 21);
  assert.equal(planBody([{ goal: "bad", status: "unknown" }]), undefined);
});

test("renders reference-style tool box chrome without putting emoji on the rail", () => {
  const theme = {
    fg(_color, text) { return text; },
    bg(_color, text) { return text; },
    bold(text) { return text; },
  };
  const execution = { toolName: "read", isPartial: false, result: { isError: false } };
  const top = toolBoxTop(execution, 48, theme);
  const middle = toolBoxLine("result", 48, theme);
  const bottom = toolBoxBottom(48, theme);
  assert.match(top, /^╭─ ✓ 📖 读取 · 完成 ─+╮$/);
  assert.equal(visibleWidth(top), 48);
  assert.equal(visibleWidth(toolBoxTop(execution, 77, theme)), 77);
  assert.equal(
    visibleWidth(toolBoxTop({ toolName: "an_incredibly_long_external_tool", isPartial: false, result: {} }, 20, theme)),
    20,
  );
  assert.equal(visibleWidth(toolBoxTop(execution, 4, theme)), 4);
  assert.equal(middle.slice(0, 2), "┃ ");
  assert.equal(middle.at(-1), "│");
  assert.equal(middle.includes("📖"), false);
  assert.equal(bottom, `╰${"─".repeat(46)}╯`);
});

test("keeps mutation tool boxes the same height from running to complete", () => {
  assert.deepEqual(stabilizeToolBoxBody("readSeek_edit", ["edit /tmp/demo.txt (1 edit)"]), [
    "edit /tmp/demo.txt (1 edit)",
    "",
  ]);
  assert.deepEqual(stabilizeToolBoxBody("readSeek_edit", ["edit /tmp/demo.txt (1 edit)", "↳ edited +1 -1"]), [
    "edit /tmp/demo.txt (1 edit)",
    "↳ edited +1 -1",
  ]);
  assert.deepEqual(stabilizeToolBoxBody("readSeek_digest", ["digest file"]), ["digest file"]);
});

test("uses compact tool text labels with emoji rendered separately", () => {
  assert.deepEqual(labelLines("web_search"), ["联网"]);
  assert.deepEqual(labelLines("agent_browser"), ["浏览器"]);
  assert.deepEqual(labelLines("browser"), ["浏览器"]);
  assert.deepEqual(labelLines("fetch_content"), ["获取"]);
  assert.deepEqual(labelLines("undo_last_replace"), ["撤销"]);
  assert.deepEqual(labelLines("todo"), ["任务"]);
  assert.deepEqual(labelLines("replace"), ["替换"]);
  assert.deepEqual(labelLines("readSeek_digest"), ["摘要"]);
  assert.deepEqual(labelLines("readSeek_def"), ["定义"]);
  assert.deepEqual(labelLines("readSeek_search"), ["检索"]);
  assert.equal(labelLayout("readSeek_digest", 0, "digest").emoji, "🩺");
  assert.equal(labelLayout("readSeek_view", 0, "view").emoji, "🔬");
  assert.equal(labelLayout("readSeek_search", 0, "search").emoji, "🌳");
});

test("exposes Material Symbols Rounded glyphs as an explicit icon fallback", () => {
  assert.equal(toolIcon("read"), "📖");
  assert.equal(toolIcon("agent_browser"), "🌐");
  assert.equal(toolIcon("browser"), "🌐");
  assert.equal(materialToolIcon("read").codePointAt(0), 0xe873);
  assert.equal(materialToolIcon("unknown").codePointAt(0), 0xe65f);
});

test("keeps a single overlong tool word compact", () => {
  assert.deepEqual(labelLines("verylongtool"), ["verylon…"]);
});

test("places the emoji immediately before centered text without shifting its center", () => {
  assert.deepEqual(labelLayout("todo", 0, "任务"), {
    emoji: "📋",
    text: "任务",
    left: 2,
    right: 4,
  });
});

test("recognizes the default tool-name-only header", () => {
  assert.equal(isStandaloneToolNameLine("undo_last_replace", "undo_last_replace"), true);
  assert.equal(isStandaloneToolNameLine("undo_last_replace /tmp/file", "undo_last_replace"), false);
});

test("keeps the extra padding cell on the right", () => {
  assert.deepEqual(labelPadding("替换"), { left: 4, right: 4 });
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

test("selects semantic results instead of the final rendered line", () => {
  assert.deepEqual(
    visibleToolContentLines(
      ["find config files", "src/config.ts", "src/config.test.ts", "Found 2 results.", "[AFT E0 W0 | D0 U0]"],
      false,
      { toolName: "grep" },
    ),
    ["find config files", "Found 2 results."],
  );
  assert.deepEqual(
    visibleToolContentLines(
      ["inspect symbols", "src/config.ts", "Zoom any result for full source", "[AFT E0 W0 | D0 U0]"],
      false,
      { toolName: "readSeek_search" },
    ),
    ["inspect symbols", "src/config.ts"],
  );
  assert.deepEqual(
    visibleToolContentLines(
      ["run tests", "suite output", "exit 0", "1250ms"],
      false,
      { toolName: "bash" },
    ),
    ["run tests", "exit 0"],
  );
});

test("hides RTK rewrite diagnostics until a tool body is expanded", () => {
  const lines = ["RTK rewrite: printf '%s\\n' /home/zonazcy/*", "run project scan", "exit 0"];
  assert.equal(isInternalToolDiagnosticLine(lines[0]), true);
  assert.deepEqual(
    visibleToolContentLines(lines, false, { toolName: "bash" }),
    ["run project scan", "exit 0"],
  );
  assert.deepEqual(visibleToolContentLines(lines, true, { toolName: "bash" }), lines);
});

test("drops SoL-Pi static savings slogans while keeping measured savings", () => {
  assert.equal(isSoLStaticSavingsLine("Money saved · compacts only when projected savings are positive"), true);
  assert.equal(isSoLStaticSavingsLine("┃ Money saved · 1 model round-trip avoided"), true);
  assert.equal(isSoLStaticSavingsLine("Money saved · full observation replay avoided"), true);
  assert.equal(isSoLStaticSavingsLine("Money saved · 12,345 context tokens removed"), false);
  assert.equal(isSoLStaticSavingsLine("Money saved · 4 KiB removed from future prompts"), false);
  assert.equal(isSoLStaticSavingsLine("⚡ SoL-Pi · Online Context Compact"), false);

  // The tool box wraps a slogan once it is wider than the box.
  assert.deepEqual(
    filterSoLStaticSavingsLines([
      "⚡ SoL-Pi · Online Context Compact",
      "Money saved · compacts only when projected savings are",
      "positive",
      "Plan: 5 steps, 2 completed",
    ]),
    ["⚡ SoL-Pi · Online Context Compact", "Plan: 5 steps, 2 completed"],
  );
  assert.deepEqual(
    filterSoLStaticSavingsLines([
      "Money saved · 12,345 context tokens removed",
      "Plan: 5 steps, 2 completed",
    ]),
    ["Money saved · 12,345 context tokens removed", "Plan: 5 steps, 2 completed"],
  );
});

test("uses reference-style body compression instead of a two-line collapse", () => {
  const lines = Array.from({ length: 16 }, (_, index) => `result ${index + 1}`);
  assert.equal(compactToolBody(lines, { theme: identityTheme }).length, 13);
  assert.match(compactToolBody(lines, { theme: identityTheme }).at(-1), /\+4 行.*展开/);
  assert.equal(compactToolBody(lines, { theme: identityTheme, expanded: true }).length, 16);
});

test("summarizes huge heredoc output while keeping the tool actionable", () => {
  const lines = ["$ cat > src/generated.ts <<'EOF'", ...Array.from({ length: 50 }, (_, index) => `line ${index}`), "EOF"];
  const compacted = compactToolBody(lines, { theme: identityTheme });
  assert.ok(compacted.some((line) => line.includes("已折叠大段内容")));
  assert.ok(compacted.some((line) => line.includes("行") && line.includes("展开查看")));
  assert.ok(compacted.length < lines.length);
});

test("keeps the head and live tail of a long Bash stream", () => {
  const lines = Array.from({ length: 24 }, (_, index) => `line ${index + 1}`);
  const compacted = compactBashBody(lines, identityTheme);
  assert.deepEqual(compacted.slice(0, 3), ["line 1", "line 2", "line 3"]);
  assert.match(compacted[3], /\+5 行/);
  assert.equal(compacted.at(-1), "line 24");
});

test("keeps the first actionable error instead of a trailing stack frame", () => {
  assert.deepEqual(
    visibleToolContentLines(
      ["run tests", "Error: missing config", "at main.js:10", "at bootstrap.js:3"],
      false,
      { isError: true, toolName: "bash" },
    ),
    ["run tests", "Error: missing config"],
  );
});

test("keeps tool text neutral while tinting the adjacent diff divider", () => {
  const neutral = "\u001b[48;2;71;71;71m";
  const red = "\u001b[48;2;82;57;61m";
  const green = "\u001b[48;2;35;70;55m";
  const theme = {
    bg(_color, text) {
      return `${neutral}${text}\u001b[49m`;
    },
    fg(_color, text) {
      return text;
    },
    getBgAnsi() {
      return neutral;
    },
  };
  const rendered = backgroundLine(
    ` edit │ ${red}208 │ - function backgroundLine(  \u001b[49m${red} \u001b[49m${green}│ \u001b[49m${green}234 │ + export function backgroundLine( \u001b[49m`,
    80,
    "toolSuccessBg",
    theme,
  );

  assert.ok(rendered.startsWith(`${neutral} edit ${red}│ ${red}208`), "left divider must join the removed cell");
  assert.ok(rendered.includes(`${red} ${neutral}${green}│ `), "red must switch directly to green at the center divider");
  assert.ok(rendered.includes(`${green}│ ${neutral}${green}234`), "center divider and right line number must be green");
  assert.ok(!rendered.startsWith(red), "removed tint must not color the tool label text");
  assert.equal(visibleWidth(rendered), 80);
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
  assert.equal(
    styleStructuredLine(
      "\u001b[37mtodos 0 · diagnostics 0 errors/0 warnings/0 info/0 hints · metrics 2\u001b[0m",
      theme,
      { toolName: "readSeek_digest" },
    ),
    [
      "<success>todos 0</success>",
      "<muted> · </muted>",
      "<accent>diagnostics 0 errors/0 warnings/0 info/0 hints</accent>",
      "<muted> · </muted>",
      "<syntaxFunction>metrics 2</syntaxFunction>",
    ].join(""),
  );
  const coloredDiff = "\u001b[32m+2/-1 · 2 edits\u001b[0m";
  assert.equal(styleStructuredLine(coloredDiff, theme, { toolName: "edit" }), coloredDiff);
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
