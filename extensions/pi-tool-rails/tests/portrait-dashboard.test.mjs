import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createEventBus, createExtensionRuntime } from "@earendil-works/pi-coding-agent";
import { visibleWidth, CURSOR_MARKER, Key } from "@earendil-works/pi-tui";

const { loadExtensions } = await import(new URL("./core/extensions/loader.js", import.meta.resolve("@earendil-works/pi-coding-agent")));
const root = new URL("../", import.meta.url);
const theme = {
  fg: (_color, text) => text, bg: (_color, text) => text,
  bold: text => text, strikethrough: text => text,
};
const steps = [
  { id: "inspect", goal: "Inspect portrait", status: "completed" },
  { id: "integrate", goal: "整合仪表盘", status: "in_progress" },
];

async function harness(t, { enabled = true, mode = "tui" } = {}) {
  const cwd = mkdtempSync(join(tmpdir(), "portrait-test-"));
  const configDir = join(cwd, ".pi/extensions/pi-emote");
  mkdirSync(configDir, { recursive: true });
  writeFileSync(join(configDir, "config.json"), JSON.stringify({ enabled, emotes: [{ model: "*", "emote-set": "ascii" }] }));
  const events = createEventBus();
  const runtime = createExtensionRuntime();
  runtime.getAllTools = () => [];
  runtime.getThinkingLevel = () => "xhigh";
  const loaded = await loadExtensions(["index.ts", "prompt-frame.ts", "portrait-dashboard.ts"].map(name => new URL(name, root).pathname), cwd, events, runtime);
  assert.deepEqual(loaded.errors, []);
  const widgets = new Map();
  const tui = { requestRender() {}, terminal: { rows: 50 } };
  const baseFactory = () => ({ render: () => ["────────", `输入 ${CURSOR_MARKER}`, "────────"], invalidate() {} });
  let editorFactory = baseFactory;
  let visible = true;
  let usageCalls = 0;
  const ctx = {
    mode, hasUI: mode === "tui" || mode === "rpc", cwd,
    model: { id: "gpt-6-astra", provider: "manager", reasoning: true },
    getContextUsage() { usageCalls++; return { tokens: 1000, contextWindow: 100000, percent: 1 }; },
    sessionManager: { getBranch: () => [{ type: "custom", customType: "sol-pi-online-context-state-v1", data: { plan: steps } }], getCwd: () => cwd },
    ui: {
      theme, notify() {}, setStatus() {}, setWorkingMessage() {}, setWorkingIndicator() {},
      setWorkingVisible(value) { visible = value; },
      getEditorComponent: () => editorFactory,
      setEditorComponent(factory) { editorFactory = factory; },
      setWidget(key, factory) {
        widgets.get(key)?.dispose?.();
        if (factory) widgets.set(key, factory(tui, theme));
        else widgets.delete(key);
      },
    },
  };
  const emit = async (name, event = {}) => {
    for (const extension of loaded.extensions) {
      for (const handler of extension.handlers.get(name) ?? []) await handler(event, ctx);
    }
  };
  t.after(async () => { await emit("session_shutdown"); rmSync(cwd, { recursive: true, force: true }); });
  await emit("session_start");
  const shortcut = key => loaded.extensions.flatMap(extension => [...extension.shortcuts.values()]).find(value => value.shortcut === key || value.key === key)
    ?? loaded.extensions.map(extension => extension.shortcuts.get(key)).find(Boolean);
  return { widgets, ctx, events, emit, shortcut, editor: () => editorFactory(tui, theme, {}), visible: () => visible, usageCalls: () => usageCalls };
}

test("actual Pi loader joins model, working status, plan and teammates in one portrait", async t => {
  const app = await harness(t);
  const portrait = app.widgets.get("emote");
  assert.ok(portrait);
  assert.match(portrait.render(120).join("\n"), /gpt-6-astra  Manager  很高/);
  assert.match(portrait.render(120).join("\n"), /Plan/);
  assert.deepEqual(app.widgets.get("tool-rails-plan").render(120), []);
  assert.doesNotMatch(app.editor().render(120).join("\n"), /gpt-6-astra/);
  assert.equal(app.editor().render(120).filter(line => line.includes(CURSOR_MARKER)).length, 1);

  await app.emit("agent_start");
  assert.equal(app.visible(), false);
  const busy = portrait.render(120).join("\n");
  assert.match(busy, /很高 · ↑ 0 词元 · 00:00/);
  const calls = app.usageCalls();
  for (let i = 0; i < 10; i++) portrait.render(120);
  assert.equal(app.usageCalls(), calls, "animation frames do not recount the conversation");

  app.events.emit("teammate:started", { correlationId: "one", agent: "reviewer", task: "Review integration", startedAt: Date.now() });
  const joined = portrait.render(120);
  assert.match(joined.join("\n"), /Agents[\s\S]*reviewer/);
  const modelRow = joined.findIndex(line => line.includes("gpt-6-astra"));
  assert.match(joined[modelRow], /gpt-6-astra[\s\S]*│[\s\S]*词元/);
  const rightStart = visibleWidth(joined[modelRow].slice(0, joined[modelRow].lastIndexOf("│"))) + 2;
  for (const label of ["Plan", "Agents"]) {
    const row = joined.find(line => line.includes(label));
    assert.equal(visibleWidth(row.slice(0, row.indexOf(label))), rightStart, `${label} aligns in the right column`);
  }
  assert.ok(joined.length <= 10, "right column keeps the dashboard compact");
  assert.deepEqual(app.widgets.get("tool-rails-agents").render(120), []);
  await app.shortcut(Key.alt("t")).handler(app.ctx);
  assert.match(portrait.render(120).join("\n"), /整合仪表盘/);
  await app.emit("tool_result", { toolName: "update_plan", input: { steps: steps.map(step => ({ ...step, status: "completed" })) }, isError: false });
  assert.match(portrait.render(120).join("\n"), /2 done/);
  for (const width of [1, 12, 39, 40, 80, 120]) {
    const lines = portrait.render(width);
    assert.ok(lines.length > 0, "narrow mode preserves text");
    assert.ok(lines.every(line => visibleWidth(line) <= width), `fits ${width} columns`);
  }
  const longPlan = Array.from({ length: 30 }, (_, i) => ({ id: `${i}`, goal: `Step ${i}`, status: i === 24 ? "in_progress" : "pending" }));
  await app.emit("tool_result", { toolName: "update_plan", input: { steps: longPlan }, isError: false });
  for (let i = 0; i < 7; i++) app.events.emit("teammate:started", { correlationId: `agent-${i}`, agent: `worker-${i}`, status: "running" });
  for (const width of [82, 120, 160]) {
    const crowded = portrait.render(width);
    assert.ok(crowded.length <= 10, "expanded panels share a bounded right column");
    assert.match(crowded.join("\n"), /Step 24/, "current step survives the row budget");
    assert.match(crowded.join("\n"), /… \d+ more/, "plan names omitted steps");
    assert.match(crowded.join("\n"), /\+\d+ more/, "agents name omitted tasks");
    assert.ok(crowded.every(line => visibleWidth(line) <= width));
  }
  app.ctx.model = { id: "next-model", provider: "openai", reasoning: true };
  await app.emit("model_select", { model: app.ctx.model });
  assert.match(portrait.render(120).join("\n"), /next-model  OpenAI  很高/);
  await app.emit("agent_end", { messages: [] });
  assert.match(portrait.render(120).join("\n"), /就绪/);
  assert.doesNotMatch(portrait.render(120).join("\n"), /00:00/);
  await app.emit("session_start");
  assert.equal(app.widgets.has("tool-rails-agents"), false, "session replacement clears old teammates");
  assert.match(app.widgets.get("emote").render(80).join("\n"), /Plan/);
});

test("disabled portrait leaves the original model, plan and working status visible", async t => {
  const app = await harness(t, { enabled: false });
  assert.equal(app.widgets.has("emote"), false);
  assert.match(app.editor().render(120).join("\n"), /gpt-6-astra  Manager  很高/);
  assert.match(app.widgets.get("tool-rails-plan").render(120).join("\n"), /Plan/);
  await app.emit("agent_start");
  assert.equal(app.visible(), true);
});

test("RPC loads no portrait or terminal animation", async t => {
  const app = await harness(t, { mode: "rpc" });
  await app.emit("agent_start");
  assert.equal(app.widgets.size, 0);
});
