import assert from "node:assert/strict";
import test from "node:test";
import { visibleWidth } from "@earendil-works/pi-tui";
import {
  compactResult,
  locateNewLineNumbers,
  parseAftEditDiff,
  parseHashlineReadOutput,
  parseReplaceDiff,
  renderHashlineReadResult,
  renderReplaceDiffResult,
  renderAftEditBridgeResult,
  renderAftEditResult,
  renderAftWriteBridgeResult,
  renderAftWriteResult,
  summarizeBackgroundShell,
} from "../result-bridge.ts";

const theme = {
  fg(_color, text) {
    return text;
  },
};

const result = {
  content: [{ type: "text", text: "Successfully replaced." }],
  details: {
    firstChangedLine: 42,
    diff: [
      " ...",
      " Ab1│const before = true;",
      "-Cd2│const value = oldValue;",
      "-Ef3│return value;",
      "+Gh4│const value = newValue;",
      "+Ij5│return normalize(value);",
      " Kl6│}",
    ].join("\n"),
  },
};

test("normalizes background watcher JSONL into readable status rows", () => {
  assert.deepEqual(
    summarizeBackgroundShell([
      "Task bash-test: running",
      'Waited 46ms; matched "push-task" at offset 997.',
      '{"type":"extension_ui_request","method":"notify","message":"Task stored. Use /start-task or /auto to start it."}',
      '{"type":"agent_settled"}',
      "PTY task is still running.",
    ]),
    [
      "Task bash-test: running",
      'Waited 46ms; matched "push-task" at offset 997.',
      "Task stored. Use /start-task or /auto to start it.",
    ],
  );
});

test("renders normalized watcher details only when collapsed", () => {
  const watchResult = {
    content: [{
      type: "text",
      text: [
        "Task bash-test: running",
        'Waited 46ms; matched "push-task" at offset 997.',
        '{"type":"extension_ui_request","method":"notify","message":"Task stored."}',
      ].join("\n"),
    }],
  };
  const collapsed = compactResult("bash_watch", watchResult, { expanded: false }, theme, {}).render(100);
  assert.ok(collapsed.some((line) => line.includes("Task bash-test: running")));
  assert.ok(collapsed.some((line) => line.includes("Task stored.")));
  assert.ok(!collapsed.some((line) => line.includes('"type":"extension_ui_request"')));

  const expanded = compactResult("bash_watch", watchResult, { expanded: true }, theme, {}).render(100);
  assert.ok(expanded.some((line) => line.includes('"type":"extension_ui_request"')));
});

test("renders AFT edit counts from structured diff metadata", () => {
  const aftResult = {
    content: [{ type: "text", text: "Edited (+3/-2, 2 edits)." }],
    details: {
      edits_applied: 2,
      diff: { additions: 3, deletions: 2 },
    },
  };
  const collapsed = renderAftEditResult(aftResult, { expanded: false }, theme, {}).render(80);
  assert.deepEqual(collapsed.map((line) => line.trimEnd()), ["+3/-2 · 2 edits"]);
  const expanded = renderAftEditResult(aftResult, { expanded: true }, theme, {}).render(80);
  assert.ok(expanded.some((line) => line.includes("Edited (+3/-2, 2 edits).")));

  const textOnlyResult = {
    content: [{ type: "text", text: "Edited (+16/-2, 2 edits)." }],
  };
  const textFallback = renderAftEditResult(textOnlyResult, { expanded: false }, theme, {}).render(80);
  assert.deepEqual(textFallback.map((line) => line.trimEnd()), ["+16/-2 · 2 edits"]);
});

test("renders AFT writes with the same collapsed and expanded diff as edits", () => {
  const mutationResult = {
    content: [{ type: "text", text: "Wrote (+2/-1)." }],
    details: {
      additions: 2,
      deletions: 1,
      diff: [
        " 4 before",
        "-5 old value",
        "+5 new value",
        "+6 added value",
        " 6 after",
      ].join("\n"),
    },
  };
  const collapsedEdit = renderAftEditResult(mutationResult, { expanded: false }, theme, {}).render(80);
  const collapsedWrite = renderAftWriteResult(mutationResult, { expanded: false }, theme, {}).render(80);
  assert.deepEqual(collapsedWrite, collapsedEdit);
  assert.deepEqual(collapsedWrite.map((line) => line.trimEnd()), ["+2/-1"]);

  const expandedEdit = renderAftEditBridgeResult(undefined, mutationResult, { expanded: true }, theme, {}).render(80);
  const expandedWrite = renderAftWriteBridgeResult(undefined, mutationResult, { expanded: true }, theme, {}).render(80);
  assert.deepEqual(expandedWrite, expandedEdit);
  assert.ok(expandedWrite.some((line) => line.includes("- old value") && line.includes("+ new value")));
});

test("summarizes bash status instead of showing arbitrary trailing output", () => {
  const bashResult = {
    content: [{ type: "text", text: "first output\nfinal output" }],
    details: { exit_code: 0, duration_ms: 1250 },
  };
  const collapsed = compactResult("bash", bashResult, { expanded: false }, theme, {}).render(100);
  assert.deepEqual(collapsed.map((line) => line.trimEnd()), ["completed · exit 0 · 1.3s · 2 output lines"]);

  const expanded = compactResult("bash", bashResult, { expanded: true }, theme, {}).render(100);
  assert.deepEqual(expanded.map((line) => line.trimEnd()), [
    "completed · exit 0 · 1.3s · 2 output lines",
    "first output",
    "final output",
  ]);

  const failed = compactResult(
    "bash",
    { content: [{ type: "text", text: "Error: missing config\n    at main.js:10" }], details: { exit_code: 1 } },
    { expanded: false },
    theme,
    { isError: true },
  ).render(100);
  assert.deepEqual(failed.map((line) => line.trimEnd()), ["exit 1 · Error: missing config"]);
});

test("renders expanded AFT edits as a de-indented split diff", () => {
  const aftDiff = [
    " 4 \t\t\tbefore",
    "-5 \t\t\told",
    "+5 \t\t\tnew",
    "+6 \t\t\t\tchild",
    " 6 \t\t\tafter",
    "   ...",
    " 20 \t\t\tfinal",
  ].join("\n");
  const aftResult = {
    content: [{ type: "text", text: "Edited (+2/-1, 2 edits)." }],
    details: {
      additions: 2,
      deletions: 1,
      editsApplied: 2,
      diff: aftDiff,
    },
  };
  let nativeCalls = 0;
  const nativeRenderer = () => {
    nativeCalls += 1;
    return { render: () => ["native diff"], invalidate() {} };
  };

  const collapsed = renderAftEditBridgeResult(
    nativeRenderer,
    aftResult,
    { expanded: false },
    theme,
    {},
  ).render(80);
  assert.deepEqual(collapsed.map((line) => line.trimEnd()), ["+2/-1 · 2 edits"]);

  const expanded = renderAftEditBridgeResult(
    nativeRenderer,
    aftResult,
    { expanded: true },
    theme,
    {},
  ).render(80);
  const changedLine = expanded.find((line) => line.includes("- old") && line.includes("+ new"));
  const childLine = expanded.find((line) => line.includes("child"));

  assert.equal(expanded[0].trim(), "↳ diff +2 -1 split");
  assert.match(changedLine, /^\s*5 │ - old.*│\s*5 │ \+ new/);
  assert.ok(childLine.includes("+     child"), "one relative indentation level must remain");
  assert.ok(expanded.some((line) => /^\s*20 │/.test(line) && /│\s*21 │/.test(line)));
  assert.equal(nativeCalls, 0);

  const parsed = parseAftEditDiff(aftDiff);
  assert.deepEqual(
    parsed.map(({ kind, oldLineNumber, newLineNumber }) => [kind, oldLineNumber, newLineNumber]),
    [
      ["context", 4, 4],
      ["remove", 5, undefined],
      ["add", undefined, 5],
      ["add", undefined, 6],
      ["context", 6, 7],
      ["meta", undefined, undefined],
      ["context", 20, 21],
    ],
  );
});
test("renders hashline read output with source line numbers", () => {
  const hashlineText = [
    "Ab1│const alpha = true;",
    "Cd2│const beta = false;",
    "",
    "[Showing lines 20-21 of 40. Use offset=22 to continue.]",
  ].join("\n");
  const readResult = { content: [{ type: "text", text: hashlineText }] };
  const entries = parseHashlineReadOutput(hashlineText.split("\n"), 20);

  assert.deepEqual(entries.slice(0, 2), [
    { kind: "line", content: "const alpha = true;", lineNumber: 20 },
    { kind: "line", content: "const beta = false;", lineNumber: 21 },
  ]);

  const component = renderHashlineReadResult(
    readResult,
    { expanded: true },
    theme,
    { args: { offset: 20 } },
  );
  const lines = component.render(72);

  assert.match(lines[0], /^\s*20 │ const alpha = true;/);
  assert.match(lines[1], /^\s*21 │ const beta = false;/);
  assert.ok(lines.some((line) => line.includes("Showing lines 20-21 of 40")));
  assert.ok(lines.every((line) => !/[A-Za-z0-9_-]{3}│/.test(line)));
  assert.ok(lines.every((line) => visibleWidth(line) <= 72));
  assert.equal(readResult.content[0].text, hashlineText, "renderer must preserve LLM-visible anchors");
  const collapsed = renderHashlineReadResult(readResult, { expanded: false }, theme, { args: { offset: 20 } });
  assert.deepEqual(collapsed.render(72).map((line) => line.trimEnd()), ["2 lines"]);
});

test("wraps numbered read lines with an aligned continuation gutter", () => {
  const content = `const value = "${"x".repeat(64)}";`;
  const readResult = { content: [{ type: "text", text: `Ef3│${content}` }] };
  const lines = renderHashlineReadResult(
    readResult,
    { expanded: true },
    theme,
    { args: { offset: 105 } },
  ).render(32);

  assert.ok(lines.length > 1);
  assert.match(lines[0], /^105 │ const value/);
  assert.match(lines[1], /^\s{3} │ /);
  assert.equal(
    lines.map((line) => line.slice(line.indexOf("│") + 1).trim()).join(""),
    content,
  );
  assert.ok(lines.every((line) => visibleWidth(line) <= 32));
});

test("parses hashline replace output without exposing hashes", () => {
  const entries = parseReplaceDiff(result.details.diff);
  assert.deepEqual(
    entries.map(({ kind, content }) => [kind, content]),
    [
      ["meta", "..."],
      ["context", "const before = true;"],
      ["remove", "const value = oldValue;"],
      ["remove", "return value;"],
      ["add", "const value = newValue;"],
      ["add", "return normalize(value);"],
      ["context", "}"],
    ],
  );
});

test("renders old and new line numbers in split columns", () => {
  const component = renderReplaceDiffResult(result, { expanded: true }, theme, {});
  const lines = component.render(80);
  const changedLine = lines.find((line) => line.includes("oldValue") && line.includes("newValue"));

  assert.equal(lines[0].trim(), "↳ diff +2 -2 split");
  assert.match(lines[2], /^old\s+│.*│ new\s+│/);
  assert.ok(changedLine, "expected paired changed line");
  assert.match(changedLine, /^\s*42 │ - const value = oldValue;.*│\s*42 │ \+ const value = newValue;/);
  assert.ok(lines.every((line) => visibleWidth(line) <= 80));
  assert.ok(lines.every((line) => !/[A-Za-z0-9_-]{3}│/.test(line)));
});
test("uses semantic foreground colors for diff rows", () => {
  const colors = [];
  const semanticTheme = {
    fg(color, text) {
      colors.push(color);
      return text;
    },
  };
  renderReplaceDiffResult(result, { expanded: true }, semanticTheme, {}).render(80);
  assert.ok(colors.includes("toolDiffAdded"));
  assert.ok(colors.includes("toolDiffRemoved"));
  assert.ok(colors.includes("toolDiffContext"));
});

test("keeps empty split cells bordered and continuation indentation aligned", () => {
  const content = `    diff: [${"x".repeat(40)}]`;
  const additionResult = {
    content: [{ type: "text", text: "Successfully replaced." }],
    details: { firstChangedLine: 12, diff: `+Ab1│${content}` },
  };
  const lines = renderReplaceDiffResult(additionResult, { expanded: true }, theme, {}).render(74);
  const leftWidth = Math.floor((74 - 3) / 2);
  const dataLines = lines.slice(3);
  const leftCells = dataLines.map((line) => line.slice(0, leftWidth));
  const rightCells = dataLines.map((line) => line.slice(leftWidth + 3));

  assert.ok(dataLines.length > 1, "expected the addition to wrap");
  assert.ok(leftCells.every((cell) => /^\s{3} │/.test(cell)), "empty old cells must keep their gutter");
  assert.ok(rightCells[0].includes("diff: [x"), "long tokens should use the first line's remaining width");
  assert.equal(rightCells[1].indexOf("x"), rightCells[0].indexOf("diff:"));
});

test("falls back to numbered unified diff in narrow layouts", () => {
  const component = renderReplaceDiffResult(result, { expanded: true }, theme, {});
  const lines = component.render(32);

  assert.equal(lines[0].trim(), "↳ diff +2 -2 unified");
  assert.match(lines[1], /^old new │/);
  assert.ok(lines.some((line) => /^\s*42\s+│ - const value/.test(line)));
  assert.ok(lines.some((line) => /^\s+42 │ \+ const value/.test(line)));
  assert.ok(lines.every((line) => visibleWidth(line) <= 32));
});

test("wraps long diff lines without hiding their tails", () => {
  const oldContent = `old-prefix-${"x".repeat(48)}-OLD_TAIL`;
  const newContent = `new-prefix-${"y".repeat(48)}-NEW_TAIL`;
  const longResult = {
    content: [{ type: "text", text: "Successfully replaced." }],
    details: {
      firstChangedLine: 7,
      diff: [`-Ab1│${oldContent}`, `+Cd2│${newContent}`].join("\n"),
    },
  };
  const component = renderReplaceDiffResult(longResult, { expanded: true }, theme, {});

  for (const width of [84, 74]) {
    const splitLines = component.render(width);
    const leftWidth = Math.floor((width - 3) / 2);
    const cells = splitLines.slice(3).map((line) => [
      line.slice(0, leftWidth),
      line.slice(leftWidth + 3),
    ]);
    const unwrap = (side) => cells
      .map((row) => row[side])
      .map((cell) => cell.slice(cell.indexOf("│") + 1).trim())
      .join("");
    assert.equal(unwrap(0), `- ${oldContent}`);
    assert.equal(unwrap(1), `+ ${newContent}`);
    assert.ok(splitLines.every((line) => visibleWidth(line) <= width));
  }

  const unifiedLines = component.render(32);
  const unifiedContent = unifiedLines
    .slice(2)
    .map((line) => line.slice(line.indexOf("│") + 1).trim())
    .join("");
  assert.equal(unifiedContent, `- ${oldContent}+ ${newContent}`);
  assert.ok(unifiedLines.every((line) => visibleWidth(line) <= 32));
});

test("locates line numbers across multiple omitted groups", () => {
  const diff = [
    " Aa1│line 9",
    "-Bb2│old 10",
    "+Cc3│new 10",
    " Dd4│line 11",
    " ...",
    " Ee5│line 49",
    "+Ff6│inserted 50",
    " Gg7│line 50",
  ].join("\n");
  const entries = parseReplaceDiff(diff);
  const fileContent = Array.from({ length: 50 }, (_, index) => {
    const line = index + 1;
    if (line === 9) return "line 9";
    if (line === 10) return "new 10";
    if (line === 11) return "line 11";
    if (line === 49) return "line 49";
    if (line === 50) return "inserted 50";
    return `unchanged ${line}`;
  }).concat("line 50").join("\n");

  assert.deepEqual(
    locateNewLineNumbers(entries, fileContent, 10),
    [9, null, 10, 11, null, 49, 50, 51],
  );

  const numberedResult = {
    content: [{ type: "text", text: "Successfully replaced." }],
    details: {
      diff,
      firstChangedLine: 10,
      toolRailsNewLineNumbers: [9, null, 10, 11, null, 49, 50, 51],
      toolRailsFinalLineCount: 51,
    },
  };
  const lines = renderReplaceDiffResult(numberedResult, { expanded: true }, theme, {}).render(100);
  assert.ok(lines.some((line) => /│\s*50 │ \+ inserted 50/.test(line)));
  assert.ok(lines.some((line) => /^\s*49 │/.test(line) && line.includes("line 49")));
});

test("parses deletion entries whose hash is unavailable", () => {
  const entries = parseReplaceDiff("-   │const LABEL_WIDTH = 9;\n+Ab1│const LABEL_WIDTH = 10;");
  assert.deepEqual(
    entries.map(({ kind, content }) => [kind, content]),
    [["remove", "const LABEL_WIDTH = 9;"], ["add", "const LABEL_WIDTH = 10;"]],
  );
});
