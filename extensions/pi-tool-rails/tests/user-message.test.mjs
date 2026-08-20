import assert from "node:assert/strict";
import test from "node:test";
import { visibleWidth } from "@earendil-works/pi-tui";

import { sanitizeUserMessageForTest } from "../user-message.ts";

test("renders user Markdown in a bounded reference-style frame", () => {
  const lines = sanitizeUserMessageForTest("# Inspect\n\n`src/index.ts`", 48);
  assert.match(lines[0], /^─+$/);
  assert.ok(lines[1].startsWith("▐ "));
  assert.ok(!lines.some((line) => line.includes("you")));
  assert.ok(lines.some((line) => line.includes("Inspect")));
  assert.ok(lines.some((line) => line.includes("src/index.ts")));
  assert.ok(lines.some((line) => line.startsWith("▐ ")));
  assert.equal(visibleWidth(lines[0]), 48);
  assert.equal(visibleWidth(lines.at(-1)), 48);
});
