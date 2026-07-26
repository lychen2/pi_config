import assert from "node:assert/strict";
import test from "node:test";
import { visibleWidth } from "@earendil-works/pi-tui";
import { locateNewLineNumbers, parseReplaceDiff, renderReplaceDiffResult } from "../result-bridge.ts";

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
