import assert from "node:assert/strict";
import test from "node:test";
import { AxonHubAffinity, isAxonHubModel, registerAxonHubAffinity } from "../axonhub-affinity.ts";

const model = { provider: "manager", api: "openai-responses", id: "gpt-6-luna", baseUrl: "https://cpa.zonazcy.xyz/v1" };

function harness() {
  const handlers = new Map();
  const ctx = {
    model,
    sessionManager: { getSessionId: () => "pi-session-123" },
  };
  registerAxonHubAffinity({ on: (event, handler) => handlers.set(event, handler) });
  return { handlers, ctx };
}

test("targets only the configured manager AxonHub endpoint", () => {
  assert.equal(isAxonHubModel(model), true);
  for (const override of [
    { provider: "openai" },
    { baseUrl: "https://other.example/v1" },
    { baseUrl: "https://cpa.zonazcy.xyz.evil.example/v1" },
    { baseUrl: "invalid" },
  ]) assert.equal(isAxonHubModel({ ...model, ...override }), false);
  assert.equal(isAxonHubModel(undefined), false);
});

test("uses one stable session thread id and one trace id across an agent run", () => {
  const { handlers, ctx } = harness();
  const start = handlers.get("agent_start");
  const addHeaders = handlers.get("before_provider_headers");
  const firstHeaders = {};
  const secondHeaders = {};

  start({ type: "agent_start" }, ctx);
  addHeaders({ headers: firstHeaders }, ctx);
  addHeaders({ headers: secondHeaders }, ctx);

  assert.equal(firstHeaders["AH-Thread-Id"], "pi-session-123");
  assert.equal(secondHeaders["AH-Thread-Id"], "pi-session-123");
  assert.match(firstHeaders["AH-Trace-Id"], /^[0-9a-f-]{36}$/);
  assert.equal(secondHeaders["AH-Trace-Id"], firstHeaders["AH-Trace-Id"]);

  const nextModelRequestHeaders = {};
  addHeaders({ headers: nextModelRequestHeaders }, ctx);
  assert.equal(nextModelRequestHeaders["AH-Trace-Id"], firstHeaders["AH-Trace-Id"]);

  handlers.get("agent_end")({ type: "agent_end", messages: [] }, ctx);
  const afterRunHeaders = {};
  addHeaders({ headers: afterRunHeaders }, ctx);
  assert.equal(afterRunHeaders["AH-Thread-Id"], "pi-session-123");
  assert.equal(afterRunHeaders["AH-Trace-Id"], undefined);

  start({ type: "agent_start" }, ctx);
  const nextTurnHeaders = {};
  addHeaders({ headers: nextTurnHeaders }, ctx);
  assert.notEqual(nextTurnHeaders["AH-Trace-Id"], firstHeaders["AH-Trace-Id"]);
});

test("does not add AxonHub affinity headers to other providers", () => {
  const { handlers, ctx } = harness();
  const headers = {};
  ctx.model = { ...model, provider: "openai" };
  handlers.get("before_provider_headers")({ headers }, ctx);
  assert.deepEqual(headers, {});
});

test("clears a session trace when its runtime shuts down", () => {
  const affinity = new AxonHubAffinity();
  affinity.beginTurn("pi-session-123");
  assert.ok(affinity.getTraceId("pi-session-123"));
  affinity.endTurn("pi-session-123");
  assert.equal(affinity.getTraceId("pi-session-123"), undefined);
});
