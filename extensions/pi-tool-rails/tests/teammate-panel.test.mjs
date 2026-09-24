import test from "node:test";
import assert from "node:assert/strict";
import { visibleWidth } from "@earendil-works/pi-tui";
import { AGENTS_PANEL_TAG } from "../plan-widget.ts";
import { TeammatePanelStore, renderTeammatePanel, installTeammatePanel, TEAMMATE_PANEL_TOGGLE } from "../teammate-panel.ts";
const theme = { fg: (_color, text) => text, bold: text => text };

test("tracks graph tasks, duplicate starts, completion, cancellation and usage", () => {
  const store = new TeammatePanelStore();
  store.apply("started", { correlationId: "graph", agent: "graph(2)", status: "running", startedAt: 1000 });
  store.apply("message", { correlationId: "graph", progress: [
    { correlationId: "a", agent: "general", status: "running", toolCount: 2, tokens: 1400, startedAt: new Date(1000).toISOString(), lastMessage: "working" },
    { correlationId: "b", agent: "explorer", status: "pending" },
  ] });
  assert.equal(store.visible().length, 2);
  const lines = renderTeammatePanel(store, theme, 100, true, 5000);
  assert.match(lines.join("\n"), /2 active.*4s.*2 tools.*1,400 tok/s);
  store.apply("complete", { correlationId: "a", agent: "general", exitCode: 0, durationMs: 4500, structuredResults: [{ correlationId: "a", output: "Verified result" }] });
  assert.equal(store.rows.get("a").lastMessage, "Verified result");
  store.apply("complete", { correlationId: "b", agent: "explorer", exitCode: 1, cancelled: true });
  assert.equal(store.rows.get("a").status, "completed");
  assert.equal(store.rows.get("b").status, "terminated");
  store.apply("started", { correlationId: "a", agent: "general", status: "running", startedAt: 9000 });
  assert.equal(store.rows.size, 3);
  assert.equal(store.rows.get("a").status, "running");
});

test("sanitizes terminal input, bounds widths and rows, supports collapsed mode", () => {
  const store = new TeammatePanelStore();
  store.apply("message", { isSend: true, correlationId: "ignored" });
  for (let i = 0; i < 8; i++) store.apply("started", { correlationId: String(i), agent: "中文\n\x1b[31mworker", task: "safe\x1b]0;title\x07", status: "running" });
  for (const width of [1, 8, 20, 64, 80, 120]) {
    const lines = renderTeammatePanel(store, theme, width, true);
    assert.ok(lines.every(line => visibleWidth(line) <= width));
    // truncateToWidth adds its own SGR resets; reject input controls, not those resets.
    assert.ok(lines.every(line => !/[\x00-\x1f\x7f]/.test(line.replaceAll("\x1b[0m", ""))));
    assert.ok(lines.length <= 12);
  }
  assert.equal(renderTeammatePanel(store, theme, 80, false).length, 1);
  assert.equal(renderTeammatePanel(store, theme, 0).length, 0);
  assert.match(renderTeammatePanel(store, theme, 80).join("\n"), /\+3 more/);
});

test("bounds settled history while retaining all live agents", () => {
  const store = new TeammatePanelStore();
  store.apply("started", { correlationId: "live", agent: "general" });
  for (let i = 0; i < 70; i++) store.apply("complete", { correlationId: String(i), exitCode: 1 });
  assert.equal(store.rows.size, 51);
  assert.ok(store.rows.has("live"));
});

test("mounts with UI, toggles, opens details, resets and releases ownership", async () => {
  const hooks = new Map(), events = new Map(), shortcuts = new Map(), commands = new Map(), emitted = [], widgets = [];
  let disposed = 0;
  installTeammatePanel({
    on: (name, fn) => hooks.set(name, fn),
    events: { on: (name, fn) => { events.set(name, fn); return () => disposed++; }, emit: (...args) => emitted.push(args) },
    registerShortcut: (name, value) => shortcuts.set(name, value),
    registerCommand: (name, value) => commands.set(name, value),
  });
  let detailLines = [];
  const ctx = { hasUI: true, ui: { setWidget: (key, factory) => widgets.push({ key, factory }), select: async (_title, labels) => labels[0], notify() {}, custom: async factory => {
    const detail = factory({ requestRender() {}, terminal: { rows: 24 } }, theme, {}, () => {});
    detailLines = detail.render(80);
    detail.handleInput("q");
  } } };
  hooks.get("session_start")({}, ctx);
  assert.equal(emitted[0][1].agents, true);
  events.get("teammate:started")({ correlationId: "a", agent: "general", status: "running" });
  const component = () => widgets.at(-1).factory({ requestRender() {} }, theme);
  assert.equal(component()[AGENTS_PANEL_TAG], true);
  assert.equal(component().render(80).length, 2);
  await shortcuts.get(TEAMMATE_PANEL_TOGGLE).handler(ctx);
  assert.equal(component().render(80).length, 1);
  await commands.get("agents-panel").handler("open", ctx);
  assert.match(detailLines.join("\n"), /Status: running/);
  assert.match(detailLines.join("\n"), /glm-5\.3-flash/);
  hooks.get("session_start")({}, ctx);
  assert.equal(widgets.at(-1).factory, undefined);
  hooks.get("session_shutdown")({}, ctx);
  assert.equal(disposed, 3);
  assert.equal(emitted.at(-1)[1].agents, false);
});
