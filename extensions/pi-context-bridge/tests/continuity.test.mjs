import assert from "node:assert/strict";
import test from "node:test";
import {
  CONTINUITY_ENTRY_TYPE,
  CONTINUITY_MAX_CHARS,
  CONTINUITY_MESSAGE_TYPE,
  buildContinuitySnapshot,
  checkpointsFromBranch,
  normalizeCheckpoint,
  redactCheckpointText,
  registerContinuity,
} from "../continuity.ts";

function checkpoint(overrides = {}) {
  return {
    kind: "failed_attempt",
    summary: "The first route failed",
    reason: "The fixture rejected the assumption",
    next: "Try the narrower route",
    verified: true,
    refs: ["src/example.ts:10"],
    ...overrides,
  };
}

test("normalizes checkpoints and redacts credential-shaped values", () => {
  const result = normalizeCheckpoint({
    ...checkpoint(),
    summary: "Use token=super-secret for the request",
  });

  assert.deepEqual(result, {
    ...checkpoint(),
    summary: "Use [redacted] for the request",
  });
  assert.equal(redactCheckpointText("Bearer abc.def; ghp_abcdef"), "[redacted]; [redacted]");
});

test("replays only the bounded continuity entries from a branch", () => {
  const entries = [
    { type: "custom", customType: CONTINUITY_ENTRY_TYPE, data: checkpoint({ summary: "old" }) },
    { type: "message", message: { role: "user", content: "unrelated" } },
    { type: "custom", customType: CONTINUITY_ENTRY_TYPE, data: checkpoint({ summary: "new" }) },
  ];

  assert.deepEqual(checkpointsFromBranch(entries), [
    checkpoint({ summary: "old" }),
    checkpoint({ summary: "new" }),
  ]);
});

test("keeps the snapshot within the token-cost guardrail", () => {
  const snapshot = buildContinuitySnapshot(
    Array.from({ length: 20 }, (_, index) => checkpoint({ summary: `checkpoint ${index} ${"x".repeat(180)}` })),
  );

  assert.ok(snapshot);
  assert.ok(snapshot.length <= CONTINUITY_MAX_CHARS);
  assert.match(snapshot, /failed/);
  assert.match(snapshot, /Try the narrower route/);
});

test("context hook replaces its previous hidden snapshot and records checkpoints", async () => {
  const handlers = new Map();
  const tools = new Map();
  const entries = [];
  const pi = {
    appendEntry(type, data) { entries.push({ type: "custom", customType: type, data }); },
    registerTool(tool) { tools.set(tool.name, tool); },
    on(name, handler) { handlers.set(name, handler); },
  };
  registerContinuity(pi);

  const tool = tools.get("checkpoint");
  assert.ok(tool);
  const data = checkpoint({ kind: "decision" });
  await tool.execute("call-1", data, undefined, undefined, {});
  assert.deepEqual(entries, [{ type: "custom", customType: CONTINUITY_ENTRY_TYPE, data }]);

  const result = await handlers.get("context")({
    messages: [
      { role: "user", content: "continue" },
      { role: "custom", customType: CONTINUITY_MESSAGE_TYPE, content: "stale", display: false, timestamp: 1 },
    ],
  }, {
    sessionManager: { getBranch: () => entries },
  });

  assert.equal(result.messages.filter((message) => message.customType === CONTINUITY_MESSAGE_TYPE).length, 1);
  assert.match(result.messages.at(-1).content, /decision/);
  assert.equal(result.messages.at(-1).display, false);
});
