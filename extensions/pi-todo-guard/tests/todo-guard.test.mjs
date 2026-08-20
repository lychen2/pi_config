import assert from "node:assert/strict";
import test from "node:test";

import todoGuard from "../index.ts";

function fakePi() {
  const handlers = new Map();
  const branch = [
    {
      type: "message",
      message: {
        role: "toolResult",
        toolName: "todo",
        details: { tasks: [{ id: 1, subject: "never completes", status: "in_progress" }] },
      },
    },
  ];
  const sent = [];
  return {
    branch,
    sent,
    on(name, handler) {
      handlers.set(name, [...(handlers.get(name) ?? []), handler]);
    },
    sendUserMessage(message) {
      sent.push(message);
    },
    appendEntry(customType, data) {
      branch.push({ type: "custom", customType, data });
    },
    handlers,
  };
}

async function emit(pi, name, ctx) {
  for (const handler of pi.handlers.get(name) ?? []) await handler({}, ctx);
}

test("limits persisted todo guard follow-ups to three turns", async () => {
  const pi = fakePi();
  todoGuard(pi);
  const ctx = {
    sessionManager: { getBranch: () => pi.branch },
    isIdle: () => true,
    hasPendingMessages: () => false,
    hasUI: false,
  };

  for (let turn = 0; turn < 4; turn += 1) {
    await emit(pi, "agent_start", ctx);
    await emit(pi, "agent_settled", ctx);
  }

  assert.equal(pi.sent.length, 3);
  assert.equal(
    pi.branch.filter((entry) => entry.type === "custom" && entry.customType === "pi-todo-guard-follow-up").length,
    3,
  );
});
