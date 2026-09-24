import test from "node:test";
import assert from "node:assert/strict";
import { Container, Text, visibleWidth } from "@earendil-works/pi-tui";
import {
  AGENTS_PANEL_TAG,
  PLAN_TOGGLE_KEY,
  PLAN_WIDGET_KEY,
  installPlanWidget,
  renderPlanWidget,
  restorePlan,
  syncPlanLayout,
} from "../plan-widget.ts";

const theme = { fg: (_color, text) => text, bold: text => text, strikethrough: text => text };
const steps = [
  { id: "a", goal: "Completed step", status: "completed" },
  { id: "b", goal: "当前进行中的步骤", status: "in_progress" },
  { id: "c", goal: "Pending step", status: "pending" },
];
const state = plan => ({ type: "custom", customType: "sol-pi-online-context-state-v1", data: { plan } });
const header = (done, total, running, toggle) =>
  `Plan  ${total} steps · ${done} done · ${running} running  (Alt+T ${toggle})`;

function harness() {
  const hooks = new Map();
  const shortcuts = new Map();
  installPlanWidget({
    on: (name, fn) => hooks.set(name, fn),
    registerShortcut: (key, options) => shortcuts.set(key, options),
  });
  return { hooks, shortcuts };
}

function mount(options = {}) {
  const { hooks, shortcuts } = harness();
  const widgets = [];
  let branch = options.branch ?? [state(steps)];
  const renders = [];
  const ctx = {
    hasUI: true,
    mode: "tui",
    sessionManager: { getBranch: () => branch },
    ui: { setWidget: (key, factory, widgetOptions) => widgets.push({ key, factory, options: widgetOptions }) },
  };
  hooks.get("session_start")({ reason: options.reason ?? "new" }, ctx);
  return {
    hooks,
    shortcuts,
    widgets,
    ctx,
    renders,
    tui: { requestRender: force => renders.push(force) },
    setBranch: next => { branch = next; },
    latest: () => (widgets.at(-1).factory === undefined ? undefined : widgets.at(-1).factory({ requestRender: force => renders.push(force) }, theme)),
  };
}

test("renders plan contents and progress above the editor when expanded", () => {
  const app = mount();
  const widget = app.latest();
  assert.deepEqual(widget.render(80), [header(1, 3, 1, "expand")]);
  app.shortcuts.get(PLAN_TOGGLE_KEY).handler(app.ctx);
  assert.equal(app.widgets.at(-1).key, PLAN_WIDGET_KEY);
  assert.equal(app.widgets.at(-1).options.placement, "aboveEditor");
  assert.deepEqual(widget.render(80), [
    header(1, 3, 1, "collapse"),
    "  ✓ Completed step",
    "  ■ 当前进行中的步骤",
    "  □ Pending step",
  ]);
  const finished = steps.map(step => ({ ...step, status: "completed" }));
  app.hooks.get("tool_result")({ toolName: "update_plan", input: { steps: finished }, isError: false }, app.ctx);
  assert.equal(app.latest().render(80)[0], header(3, 3, 0, "collapse"));
  const count = app.widgets.length;
  app.hooks.get("tool_result")({ toolName: "update_plan", input: { steps }, isError: true }, app.ctx);
  app.hooks.get("tool_result")({ toolName: "write", input: { steps }, isError: false }, app.ctx);
  assert.equal(app.widgets.length, count);
  app.setBranch([]);
  app.hooks.get("session_start")({ reason: "new" }, app.ctx);
  assert.equal(app.widgets.at(-1).factory, undefined);
  app.setBranch([state(steps)]);
  app.hooks.get("session_tree")({}, app.ctx);
  assert.equal(app.latest().render(80)[0], header(1, 3, 1, "expand"));
  app.hooks.get("session_compact")({}, app.ctx);
  assert.equal(app.latest().render(80)[0], header(1, 3, 1, "expand"));
  app.hooks.get("session_shutdown")({}, app.ctx);
  assert.equal(app.widgets.at(-1).factory, undefined);
});

test("starts collapsed, toggles, preserves state across updates and resets on session start", () => {
  const app = mount();
  const widget = app.latest();
  assert.equal(app.shortcuts.get(PLAN_TOGGLE_KEY).description, "Toggle the Plan panel (Alt+T)");
  assert.deepEqual(widget.render(80), [header(1, 3, 1, "expand")]);
  app.shortcuts.get(PLAN_TOGGLE_KEY).handler(app.ctx);
  assert.deepEqual(app.renders, [true]);
  assert.equal(widget.render(80).length, 4);
  assert.equal(widget.render(80)[0], header(1, 3, 1, "collapse"));
  app.shortcuts.get(PLAN_TOGGLE_KEY).handler(app.ctx);
  assert.deepEqual(widget.render(80), [header(1, 3, 1, "expand")]);
  app.hooks.get("tool_result")({ toolName: "update_plan", input: { steps }, isError: false }, app.ctx);
  assert.deepEqual(app.latest().render(80), [header(1, 3, 1, "expand")]);
  app.shortcuts.get(PLAN_TOGGLE_KEY).handler(app.ctx);
  // A compaction keeps the reader's fold state, a fresh session resets it.
  app.hooks.get("session_compact")({}, app.ctx);
  assert.equal(app.latest().render(80).length, 4);
  app.hooks.get("session_start")({ reason: "new" }, app.ctx);
  assert.deepEqual(app.latest().render(80), [header(1, 3, 1, "expand")]);
});

test("ignores the toggle when no plan is mounted", () => {
  const app = mount({ branch: [] });
  app.shortcuts.get(PLAN_TOGGLE_KEY).handler(app.ctx);
  assert.deepEqual(app.renders, []);
});

test("keeps the plan container ahead of Pi's working status line", () => {
  const container = () => ({ children: [] });
  const [document, pending, status, widget, editor, footer] = Array.from({ length: 6 }, container);
  const self = { render: () => [] };
  widget.children.push(self, { render: () => [] });
  const tui = { children: [document, pending, status, widget, editor, footer] };
  const memory = {};
  assert.equal(syncPlanLayout(tui, self, memory), true);
  assert.deepEqual(tui.children, [document, pending, widget, status, editor, footer]);
  assert.equal(syncPlanLayout(tui, self, memory), false);

  const transcript = container();
  const parallel = [pending, status, widget, editor];
  const dock = {
    children: parallel,
    entries: parallel.map(component => ({ component, shrink: 1 })),
  };
  const root = { children: [transcript, dock], entries: [{ component: transcript, grow: 1 }, { component: dock }] };
  const split = { children: [document, pending, status, widget, editor], layoutRoot: root };
  assert.equal(syncPlanLayout(split, self, {}), true);
  assert.deepEqual(split.children, [document, pending, widget, status, editor]);
  assert.deepEqual(dock.children, [pending, widget, status, editor]);
  assert.deepEqual(dock.entries.map(entry => entry.component), [pending, widget, status, editor]);
  assert.deepEqual(root.entries.map(entry => entry.component), [transcript, dock]);
  assert.equal(syncPlanLayout(split, self, {}), false);
  assert.equal(syncPlanLayout({ children: [document] }, self, {}), false);
  assert.equal(syncPlanLayout({}, self, {}), false);
});

test("keeps Agents above Plan across panel mount orders and remounts", () => {
  const spacer = {};
  const plan = { render: () => [] };
  const agents = { [AGENTS_PANEL_TAG]: true, render: () => [] };
  const unrelated = {};
  const status = {};
  const widgets = { children: [] };
  const tui = { children: [status, widgets] };
  const memory = {};
  for (const order of [[spacer, plan, unrelated, agents], [spacer, agents, plan, unrelated]]) {
    widgets.children = order;
    widgets.entries = order.map(component => ({ component }));
    syncPlanLayout(tui, plan, memory);
    assert.deepEqual(widgets.children, [spacer, agents, plan, unrelated]);
    assert.deepEqual(widgets.entries.map(entry => entry.component), widgets.children);
    assert.deepEqual(tui.children, [widgets, status]);
    assert.equal(syncPlanLayout(tui, plan, memory), false);
  }
  const remounted = { [AGENTS_PANEL_TAG]: true };
  widgets.children = [spacer, plan, unrelated, remounted];
  widgets.entries = widgets.children.map(component => ({ component }));
  assert.equal(syncPlanLayout(tui, plan, memory), true);
  assert.deepEqual(widgets.children, [spacer, remounted, plan, unrelated]);
  assert.equal(syncPlanLayout(tui, plan, {}), false);
});

test("reorders the layout tree that Pi's VStack renders", () => {
  const status = new Container();
  status.addChild(new Text("WORKING", 0, 0));
  const widgets = new Container();
  widgets.addChild(new Text("SPACER", 0, 0));
  const self = new Text("PLAN", 0, 0);
  widgets.addChild(self);
  const editor = new Container();
  editor.addChild(new Text("EDITOR", 0, 0));
  // pi-tui resolves VStack only from the host Pi install, so mirror its dual
  // children/entries layout contract with plain objects here.
  const entries = [status, widgets, editor].map(component => ({ component, shrink: 1, minSize: 0 }));
  const dock = { children: entries.map(entry => entry.component), entries };
  const root = { children: [dock], entries: [{ component: dock, basis: "auto" }] };
  const tui = { children: [status, widgets, editor], layoutRoot: root };
  const memory = {};
  assert.equal(syncPlanLayout(tui, self, memory), true);
  assert.deepEqual(dock.entries.map(entry => entry.component), [widgets, status, editor]);
  assert.deepEqual(dock.children, [widgets, status, editor]);
  assert.deepEqual(tui.children, [widgets, status, editor]);
  assert.deepEqual(root.entries.map(entry => entry.component), [dock]);
  assert.equal(syncPlanLayout(tui, self, memory), false);
  assert.equal(syncPlanLayout(tui, self, {}), false);
  assert.deepEqual(dock.entries.map(entry => entry.component), [widgets, status, editor]);
});

test("restores latest branch snapshot and accepts an empty plan", () => {
  const message = { role: "toolResult", toolName: "update_plan", content: [{ type: "text", text: `<sol-pi-plan task_status="active">${JSON.stringify({ steps })}</sol-pi-plan>` }] };
  assert.deepEqual(restorePlan([{ type: "message", message }]), steps);
  assert.deepEqual(restorePlan([state(steps), state([])]), []);
  assert.deepEqual(restorePlan([state(steps), { type: "message", message: { ...message, isError: true } }]), steps);
  assert.deepEqual(restorePlan([state(steps), state([{ invalid: true }])]), steps);
});

test("bounds long plans and narrow Unicode rows while keeping current step visible", () => {
  const long = Array.from({ length: 128 }, (_, i) => ({ id: `${i}`, goal: `Step ${i}`, status: i === 100 ? "in_progress" : "pending" }));
  const lines = renderPlanWidget(long, theme, 40);
  assert.ok(lines.length <= 11);
  assert.ok(lines.some(line => line.startsWith("  … ")));
  assert.ok(lines.includes("  ■ Step 100"));
  assert.deepEqual(renderPlanWidget(long, theme, 30, false), ["Plan  0/128"]);
  assert.deepEqual(renderPlanWidget(long, theme, 40, false), ["Plan  0/128 · 1 running  (Alt+T expand)"]);
  assert.deepEqual(renderPlanWidget(long, theme, 60, false), ["Plan  128 steps · 0 done · 1 running  (Alt+T expand)"]);
  for (const width of [1, 5, 20]) assert.ok(renderPlanWidget(steps, theme, width).every(line => visibleWidth(line) <= width));
  assert.deepEqual(renderPlanWidget(steps, theme, 0), []);
  assert.deepEqual(renderPlanWidget([], theme, 40), []);
});

test("does not mount widgets in headless modes", () => {
  const { hooks } = harness();
  for (const mode of ["rpc", "json"]) hooks.get("session_start")({}, { mode, hasUI: false, sessionManager: { getBranch: () => [state(steps)] }, ui: { setWidget() { assert.fail("headless widget"); } } });
});
