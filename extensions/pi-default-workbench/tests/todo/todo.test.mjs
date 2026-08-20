import assert from "node:assert/strict";
import test from "node:test";
import { visibleWidth } from "@earendil-works/pi-tui";

import register, {
  applyMutation,
  cloneState,
  dependencyState,
  replayFromBranch,
  renderTodoWidget,
} from "../../todo/index.ts";

const plainTheme = {
  fg(_color, text) { return text; },
  bg(_color, text) { return text; },
  bold(text) { return text; },
  strikethrough(text) { return text; },
};

test("replays the latest rpiv-compatible todo details snapshot", () => {
  const first = {
    action: "create",
    params: { subject: "old" },
    tasks: [{ id: 1, subject: "old", status: "pending" }],
    nextId: 2,
  };
  const latest = {
    action: "update",
    params: { id: 1, status: "completed" },
    tasks: [{ id: 1, subject: "old", status: "completed" }],
    nextId: 2,
  };
  const state = replayFromBranch({
    sessionManager: {
      getBranch: () => [
        { type: "message", message: { role: "toolResult", toolName: "todo", details: first } },
        { type: "message", message: { role: "toolResult", toolName: "bash", details: latest } },
        { type: "message", message: { role: "toolResult", toolName: "todo", details: latest } },
      ],
    },
  });
  assert.deepEqual(state, { tasks: latest.tasks, nextId: 2 });
});

test("preserves task transitions and rejects dependency cycles", () => {
  let state = cloneState({ tasks: [], nextId: 1 });
  state = applyMutation(state, "create", { subject: "foundation" }).state;
  state = applyMutation(state, "create", { subject: "dependent", blockedBy: [1] }).state;
  assert.equal(dependencyState(state.tasks[1], state.tasks), "blocked");

  const cycle = applyMutation(state, "update", { id: 1, addBlockedBy: [2] });
  assert.equal(cycle.error, "addBlockedBy would create a cycle in the blockedBy graph");
  assert.deepEqual(cycle.state, state);

  state = applyMutation(state, "update", { id: 1, status: "completed" }).state;
  assert.equal(dependencyState(state.tasks[1], state.tasks), "pending");
  const invalid = applyMutation(state, "update", { id: 1, status: "in_progress" });
  assert.equal(invalid.error, "illegal transition completed -> in_progress");
});

test("renders Maestro-style compact and expanded widgets within width", () => {
  const tasks = [
    { id: 1, subject: "Inspect implementation", status: "completed" },
    {
      id: 2,
      subject: "Implement replacement",
      status: "in_progress",
      activeForm: "writing Todo",
      owner: "worker",
    },
    { id: 3, subject: "Verify behavior", status: "pending", blockedBy: [2] },
  ];
  const compact = renderTodoWidget(plainTheme, tasks, false, 44);
  assert.equal(compact.length, 1);
  assert.match(compact[0], /^Todo/);
  assert.ok(visibleWidth(compact[0]) <= 44);

  const expanded = renderTodoWidget(plainTheme, tasks, true, 64);
  assert.match(expanded[0], /3 tasks · 1 done · 1 running · 1 blocked/);
  assert.match(expanded[1], /Implement replacement/);
  assert.match(expanded[2], /Verify behavior/);
  assert.match(expanded[2], /← ■ Implement replacement/);
  assert.match(expanded[1], /@worker/);
  assert.match(expanded[0], /Alt\+T collapse/);
  assert.ok(expanded.every((line) => visibleWidth(line) <= 64));
});

test("keeps the Todo center inside narrow widths and preserves task priority", async () => {
  const { TodoCenter } = await import("../../todo/src/center.ts");
  const tasks = [
    { id: 1, subject: "Long running implementation task", status: "in_progress", activeForm: "writing the replacement" },
    { id: 2, subject: "Blocked verification task", status: "pending", blockedBy: [1], description: "A long description that must be clipped safely" },
    { id: 3, subject: "Completed setup task", status: "completed" },
  ];
  for (const width of [1, 8, 19, 20, 39, 40, 71, 72]) {
    const center = new TodoCenter({ getTasks: () => tasks, requestRender() {}, close() {}, theme: plainTheme });
    const rows = center.render(width);
    assert.ok(rows.length > 0);
    assert.ok(rows.every((row) => visibleWidth(row) <= width), `row exceeds ${width} columns`);
  }

  const center = new TodoCenter({ getTasks: () => tasks, requestRender() {}, close() {}, theme: plainTheme });
  const rows = center.render(72);
  assert.match(rows.join("\\n"), /Long running implementation task/);
  center.handleInput(String.fromCharCode(13));
  assert.match(center.render(72).join("\\n"), /writing the replacement/);
  center.handleInput(String.fromCharCode(27));
  center.handleInput("l");
  assert.match(center.render(72).join("\\n"), /Long running implementation task/);
});

test("registers one todo tool, both commands, shortcut, and session hooks", async () => {
  const tools = [];
  const commands = new Map();
  const shortcuts = new Map();
  const handlers = new Map();
  const pi = {
    registerTool(tool) { tools.push(tool); },
    registerCommand(name, command) { commands.set(name, command); },
    registerShortcut(key, shortcut) { shortcuts.set(key, shortcut); },
    on(event, handler) {
      const list = handlers.get(event) ?? [];
      list.push(handler);
      handlers.set(event, list);
    },
  };
  register(pi);
  assert.deepEqual(tools.map((tool) => tool.name), ["todo"]);
  assert.deepEqual([...commands.keys()], ["todos", "maestro-todo"]);
  assert.deepEqual([...shortcuts.keys()], ["alt+t"]);
  assert.ok(handlers.has("session_start"));
  assert.ok(handlers.has("session_tree"));
  assert.ok(handlers.has("session_compact"));
  assert.ok(handlers.has("session_shutdown"));

  const widgets = new Map();
  const ctx = {
    hasUI: true,
    mode: "tui",
    sessionManager: { getSessionId: () => "session-1", getBranch: () => [] },
    ui: {
      setWidget(key, factory) {
        if (!factory) widgets.delete(key);
        else widgets.set(key, factory({ requestRender() {} }, plainTheme));
      },
      notify() {},
    },
  };
  await handlers.get("session_start")[0]({}, ctx);
  const result = await tools[0].execute("call-1", { action: "create", subject: "Test tool" }, undefined, undefined, ctx);
  assert.equal(result.details.nextId, 2);
  assert.equal(result.details.tasks[0].subject, "Test tool");
  assert.ok(widgets.has("todo-panel"));
  await handlers.get("session_shutdown")[0]({}, ctx);
  assert.equal(widgets.size, 0);
});
