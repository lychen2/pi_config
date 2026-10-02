import assert from "node:assert/strict";
import test from "node:test";
import { isSolCacheTarget, registerSolCacheCompatibility, SolRequestTracker, stabilizeSolTools } from "../sol-cache-compat.ts";

const model = { provider: "manager", api: "openai-responses", id: "gpt-6.1-sol", baseUrl: "https://cpa.zonazcy.xyz/v1" };
const tool = (name) => ({ type: "function", name, description: name, parameters: { type: "object" } });
const payload = () => ({
  model: model.id,
  input: [{ role: "system", content: "private prompt" }, { role: "user", content: "private task" }],
  tools: [tool("z"), tool("a")],
  prompt_cache_key: "private-key",
  prompt_cache_retention: "24h",
  store: false,
  stream: true,
});

function harness() {
  const handlers = new Map();
  const commands = new Map();
  const entries = [];
  const notifications = [];
  const pi = {
    on: (name, handler) => handlers.set(name, handler),
    registerCommand: (name, command) => commands.set(name, command),
    appendEntry: (type, data) => entries.push({ type, data }),
  };
  const ctx = { model, ui: { notify: (...args) => notifications.push(args) } };
  registerSolCacheCompatibility(pi);
  return { handlers, commands, entries, notifications, ctx };
}

function completed(cached = 0, input = 8000) {
  return { message: { role: "assistant", provider: "manager", api: "openai-responses", model: model.id,
    stopReason: "stop", usage: { input: input - cached, cacheRead: cached },
  } };
}

test("targets only manager CPA Sol Responses models", () => {
  assert.equal(isSolCacheTarget(model), true);
  for (const override of [
    { id: "gpt-6-luna" }, { api: "openai-completions" }, { provider: "openai" },
    { baseUrl: "https://other.example/v1" }, { baseUrl: "invalid" },
    { baseUrl: "https://cpa.zonazcy.xyz.evil.example/v1" },
  ]) assert.equal(isSolCacheTarget({ ...model, ...override }), false);
  assert.equal(isSolCacheTarget(undefined), false);
});

test("normalizes only function order and preserves all other payload bytes", () => {
  const original = payload();
  const snapshot = structuredClone(original);
  const next = stabilizeSolTools(original);
  assert.deepEqual(next.tools.map((t) => t.name), ["a", "z"]);
  assert.deepEqual(original, snapshot);
  assert.equal(next.input, original.input);
  assert.equal(next.prompt_cache_key, original.prompt_cache_key);
  assert.equal(next.tools[0], original.tools[1]);
  assert.deepEqual({ ...next, tools: original.tools }, original);
  assert.equal(stabilizeSolTools(next), undefined);
});

test("keeps mixed, duplicate, malformed and absent tools unchanged", () => {
  for (const tools of [undefined, [], [tool("z")], [tool("z"), { type: "web_search" }],
    [tool("z"), tool("z")], [tool("z"), null], [tool("z"), { type: "function" }]]) {
    assert.equal(stabilizeSolTools({ tools }), undefined);
  }
  assert.equal(stabilizeSolTools(null), undefined);
});

test("distinguishes append-only history from header tools settings and history changes", () => {
  const tracker = new SolRequestTracker();
  const first = payload();
  assert.deepEqual(tracker.observe(first).changes, ["cold"]);
  const second = { ...first, input: [...first.input, { role: "assistant", content: "result" }] };
  assert.deepEqual(tracker.observe(second), { changes: [], inputItems: 3, commonPrefixItems: 2, reusablePrefix: true });
  assert.deepEqual(tracker.observe({ ...second, prompt_cache_key: "other" }).changes, ["cache-key"]);
  const toolsChanged = { ...second, tools: [...first.tools, tool("extra")], prompt_cache_key: "other" };
  assert.deepEqual(tracker.observe(toolsChanged).changes, ["tools"]);
  const settingsChanged = { ...toolsChanged, reasoning: { effort: "high" } };
  assert.deepEqual(tracker.observe(settingsChanged).changes, ["settings"]);
  const historyChanged = { ...settingsChanged, input: [{ role: "system", content: "different" }, ...second.input.slice(1)] };
  assert.deepEqual(tracker.observe(historyChanged).changes, ["history"]);
  assert.deepEqual(tracker.observe({ ...historyChanged, input: [] }).changes, ["history"]);
  tracker.reset();
  assert.deepEqual(tracker.observe(first).changes, ["cold"]);
  assert.equal(tracker.observe({ input: [] }), undefined);
});

test("same tool set in a different order produces a reusable normalized prefix", () => {
  const tracker = new SolRequestTracker();
  const a = payload();
  tracker.observe(stabilizeSolTools(a));
  const b = { ...a, tools: [...a.tools].reverse() };
  assert.equal(tracker.observe(stabilizeSolTools(b) ?? b).reusablePrefix, true);
});

test("persists only bounded comparisons and real usage; no prompts keys or headers", () => {
  const h = harness();
  const request = h.handlers.get("before_provider_request");
  const stream = h.handlers.get("message_end");
  request({ payload: payload() }, h.ctx);
  stream(completed(0));
  assert.equal(h.entries[0].data.stableZero, false);
  request({ payload: payload() }, h.ctx);
  stream(completed(0));
  assert.equal(h.entries[1].data.stableZero, true);
  assert.equal(h.entries[1].data.inputTokens, 8000);
  assert.equal(h.entries[1].data.cachedTokens, 0);
  assert.equal(JSON.stringify(h.entries).includes("private"), false);
  stream(completed(0));
  assert.equal(h.entries.length, 2, "terminal events are recorded once");
});

test("does not rewrite other routes and ignores unrelated or invalid usage", () => {
  const h = harness();
  const request = h.handlers.get("before_provider_request");
  const stream = h.handlers.get("message_end");
  assert.equal(request({ payload: payload() }, { model: { ...model, id: "gpt-6-luna" } }), undefined);
  assert.equal(request({ payload: { ...payload(), model: "other" } }, h.ctx), undefined);
  request({ payload: payload() }, h.ctx);
  for (const event of [
    { message: { ...completed().message, provider: "other" } },
    { message: { ...completed().message, model: "gpt-6-sol" } },
    { message: { role: "user", content: "private" } },
    { message: { ...completed().message, stopReason: "error" } },
    completed(-1), completed(9000, 8000), completed(NaN), completed(0, Infinity),
  ]) stream(event);
  assert.equal(h.entries.length, 0);
  stream(completed(7680));
  assert.equal(h.entries.length, 1);
});

test("disable environment starts the plugin without rewriting or recording requests", (t) => {
  const previous = process.env.PI_SOL_CACHE_COMPAT_DISABLE;
  t.after(() => {
    if (previous === undefined) delete process.env.PI_SOL_CACHE_COMPAT_DISABLE;
    else process.env.PI_SOL_CACHE_COMPAT_DISABLE = previous;
  });
  process.env.PI_SOL_CACHE_COMPAT_DISABLE = "1";
  const h = harness();
  assert.equal(h.handlers.get("before_provider_request")({ payload: payload() }, h.ctx), undefined);
  h.handlers.get("message_end")(completed());
  assert.equal(h.entries.length, 0);
});

test("command can disable normalization and diagnostics and reset on re-enable", async () => {
  const h = harness();
  const command = h.commands.get("sol-cache");
  await command.handler("off", h.ctx);
  assert.equal(h.handlers.get("before_provider_request")({ payload: payload() }, h.ctx), undefined);
  h.handlers.get("message_end")(completed());
  assert.equal(h.entries.length, 0);
  await command.handler("on", h.ctx);
  h.handlers.get("before_provider_request")({ payload: payload() }, h.ctx);
  h.handlers.get("message_end")(completed());
  assert.deepEqual(h.entries[0].data.changes, ["cold"]);
  await command.handler("status", h.ctx);
  assert.match(h.notifications.at(-1)[0], /1 requests, 1 tool-order normalizations/);
  await command.handler("invalid", h.ctx);
  assert.match(h.notifications.at(-1)[0], /Usage:/);
  h.handlers.get("session_tree")();
  await command.handler("status", h.ctx);
  assert.match(h.notifications.at(-1)[0], /0 requests/);
});
