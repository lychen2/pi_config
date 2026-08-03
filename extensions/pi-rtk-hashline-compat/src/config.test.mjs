import assert from "node:assert/strict";
import test from "node:test";

import { limitsFromRtkConfig } from "./config.ts";

test("mirrors enabled RTK read truncation settings", () => {
  assert.deepEqual(
    limitsFromRtkConfig({
      enabled: true,
      outputCompaction: {
        enabled: true,
        readCompaction: { enabled: true },
        truncate: { enabled: true, maxChars: 8_000 },
        smartTruncate: { enabled: true, maxLines: 160 },
      },
    }),
    { maxChars: 8_000, maxLines: 160 },
  );
});

test("supports smart-line truncation when hard truncation is disabled", () => {
  assert.deepEqual(
    limitsFromRtkConfig({
      outputCompaction: {
        readCompaction: { enabled: true },
        truncate: { enabled: false },
        smartTruncate: { enabled: true, maxLines: 160 },
      },
    }),
    { maxLines: 160 },
  );
});

test("stays inactive when both RTK truncation modes are disabled", () => {
  assert.equal(
    limitsFromRtkConfig({
      outputCompaction: {
        readCompaction: { enabled: true },
        truncate: { enabled: false },
        smartTruncate: { enabled: false },
      },
    }),
    undefined,
  );
});

test("stays inactive when RTK read compaction is disabled", () => {
  assert.equal(
    limitsFromRtkConfig({
      enabled: true,
      outputCompaction: {
        enabled: true,
        readCompaction: { enabled: false },
      },
    }),
    undefined,
  );
});

test("uses RTK defaults and bounds unsafe values", () => {
  assert.deepEqual(
    limitsFromRtkConfig({
      outputCompaction: {
        readCompaction: { enabled: true },
        truncate: { maxChars: 10 },
        smartTruncate: { enabled: true, maxLines: 99_999 },
      },
    }),
    { maxChars: 1_000, maxLines: 4_000 },
  );
});
