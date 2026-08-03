import assert from "node:assert/strict";
import test from "node:test";

import { compactHashlineRead } from "./compact.ts";

const HASHLINE = /^[A-Za-z0-9]{3}│/u;

function hash(index) {
  return index.toString(36).padStart(3, "0").slice(-3);
}

function hashlineText(count, width = 72) {
  const lines = Array.from({ length: count }, (_value, index) => {
    const label = `line-${index + 1} `;
    return `${hash(index)}│${label}${"x".repeat(Math.max(0, width - label.length))}`;
  });
  return `${lines.join("\n")}\n\n[Showing lines 1-${count}. Use offset=${count + 1} to continue.]`;
}

function readEvent(text, { input = {}, details = {} } = {}) {
  return {
    input,
    details: { snapshotId: "v1|/tmp/sample.ts|1|1", ...details },
    content: [{ type: "text", text }],
  };
}

function textOf(result) {
  assert.ok(result?.content);
  const block = result.content[0];
  assert.equal(block?.type, "text");
  return block.text;
}

test("compacts explicit hashline ranges at whole-anchor boundaries", () => {
  const source = hashlineText(260);
  const result = compactHashlineRead(
    readEvent(source, {
      input: { path: "sample.ts", offset: 101, limit: 260 },
      details: { nextOffset: 361, metrics: { truncated: false, next_offset: 361 } },
    }),
    { maxChars: 8_000, maxLines: 160 },
  );

  const output = textOf(result);
  const keptSourceLines = output.split("\n").filter((line) => HASHLINE.test(line));
  const metadata = result.details.rtkHashlineCompat;

  assert.ok(output.length <= 8_000);
  assert.ok(keptSourceLines.length > 80);
  assert.ok(keptSourceLines.length < 160);
  assert.ok(keptSourceLines.every((line) => HASHLINE.test(line)));
  assert.equal(metadata.keptLineCount, keptSourceLines.length);
  assert.equal(metadata.returnedLineCount, 260);
  assert.equal(metadata.nextOffset, 101 + keptSourceLines.length);
  assert.equal(result.details.nextOffset, metadata.nextOffset);
  assert.equal(result.details.metrics.next_offset, metadata.nextOffset);
  assert.match(output, new RegExp(`Continue with read offset=${metadata.nextOffset}\\.`));
  assert.equal(output.includes("Use offset=261"), false);
  const lines = output.split("\n");
  const markerIndex = lines.findIndex((line) => line.startsWith("[RTK hashline compat:"));
  assert.ok(markerIndex > 0);
  const retainedLines = lines.slice(0, markerIndex).filter(Boolean);
  assert.equal(retainedLines.length, keptSourceLines.length);
  assert.ok(retainedLines.every((line) => HASHLINE.test(line)));
});

test("applies RTK smart line limit even below the character limit", () => {
  const result = compactHashlineRead(
    readEvent(hashlineText(120, 8), { input: { path: "sample.ts", limit: 120 } }),
    { maxChars: 50_000, maxLines: 90 },
  );

  const output = textOf(result);
  assert.equal(output.split("\n").filter((line) => HASHLINE.test(line)).length, 90);
  assert.equal(result.details.nextOffset, 91);
});

test("compacts unpaged long hashline reads before RTK can cut an anchor", () => {
  const source = hashlineText(81, 360);
  const result = compactHashlineRead(
    readEvent(source, { input: { path: "sample.ts" } }),
    { maxChars: 8_000, maxLines: 160 },
  );

  const output = textOf(result);
  const sourceLines = source.split("\n").filter((line) => HASHLINE.test(line));
  const keptLines = output.split("\n").filter((line) => HASHLINE.test(line));

  assert.ok(source.length > 8_000);
  assert.ok(output.length <= 8_000);
  assert.ok(keptLines.length > 0);
  assert.ok(keptLines.length < sourceLines.length);
  assert.deepEqual(keptLines, sourceLines.slice(0, keptLines.length));
  assert.equal(result.details.nextOffset, keptLines.length + 1);
  assert.match(output, new RegExp(`Continue with read offset=${keptLines.length + 1}\\.`));
});

test("keeps short and non-hashline reads exact", () => {
  assert.equal(
    compactHashlineRead(readEvent(hashlineText(80)), { maxChars: 1_000, maxLines: 40 }),
    undefined,
  );
  assert.equal(
    compactHashlineRead(readEvent("plain output\n".repeat(300)), { maxChars: 1_000, maxLines: 40 }),
    undefined,
  );
});

test("does not compact a result already handled by RTK", () => {
  const event = readEvent(hashlineText(200), {
    details: { rtkCompaction: { applied: true, truncated: true } },
  });
  assert.equal(compactHashlineRead(event, { maxChars: 1_000, maxLines: 40 }), undefined);
});

test("still compacts when RTK only applied a lossless transform", () => {
  const event = readEvent(hashlineText(200), {
    details: { rtkCompaction: { applied: true, truncated: false, techniques: ["ansi"] } },
  });
  assert.ok(compactHashlineRead(event, { maxChars: 1_000, maxLines: 40 }));
});

test("preserves an oversized single anchor instead of cutting it", () => {
  const text = `aB3│${"x".repeat(5_000)}`;
  assert.equal(
    compactHashlineRead(readEvent(text), { maxChars: 1_000 }),
    undefined,
  );
});
