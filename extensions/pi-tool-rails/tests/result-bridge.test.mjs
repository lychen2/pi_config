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

test("falls back to numbered unified diff in narrow layouts", () => {
  const component = renderReplaceDiffResult(result, { expanded: true }, theme, {});
  const lines = component.render(32);

  assert.equal(lines[0].trim(), "↳ diff +2 -2 unified");
  assert.match(lines[1], /^old new │/);
  assert.ok(lines.some((line) => /^\s*42\s+│ - const value/.test(line)));
  assert.ok(lines.some((line) => /^\s+42 │ \+ const value/.test(line)));
  assert.ok(lines.every((line) => visibleWidth(line) <= 32));
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
