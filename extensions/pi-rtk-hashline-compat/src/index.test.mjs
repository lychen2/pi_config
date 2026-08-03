import assert from "node:assert/strict";
import test from "node:test";

import rtkHashlineCompat from "../index.ts";

function hashlineText(count) {
  return Array.from(
    { length: count },
    (_value, index) => `${index.toString(36).padStart(3, "0").slice(-3)}│line ${index + 1} ${"x".repeat(32)}`,
  ).join("\n");
}

test("registers read result middleware and returns a compacted patch", () => {
  let handler;
  rtkHashlineCompat({
    on(eventName, callback) {
      assert.equal(eventName, "tool_result");
      handler = callback;
    },
  });
  assert.equal(typeof handler, "function");
  for (const toolName of ["write", "replace"]) {
    assert.equal(handler({
      type: "tool_result",
      toolName,
      toolCallId: "untouched-call",
      input: {},
      content: [{ type: "text", text: "not a read result" }],
      details: {},
      isError: false,
    }), undefined);
  }
  process.env.PI_RTK_HASHLINE_MAX_CHARS = "1";
  try {
    const result = handler({
      type: "tool_result",
      toolName: "read",
      toolCallId: "test-call",
      input: { path: "sample.ts", offset: 41, limit: 120 },
      content: [{ type: "text", text: hashlineText(120) }],
      details: { snapshotId: "v1|/tmp/sample.ts|1|1" },
      isError: false,
    });

    assert.ok(result?.content);
    assert.equal(result.details.rtkHashlineCompat.applied, true);
    assert.ok(result.details.nextOffset > 41);
  } finally {
    delete process.env.PI_RTK_HASHLINE_MAX_CHARS;
  }
});
