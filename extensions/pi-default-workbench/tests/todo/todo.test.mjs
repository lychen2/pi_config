import assert from "node:assert/strict";
import test from "node:test";
import { visibleWidth } from "@earendil-works/pi-tui";

import register, { createTodoInitializer } from "../../index.ts";
import {
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

test("prevents more than one task from running at once", () => {
  let state = cloneState({ tasks: [], nextId: 1 });
  state = applyMutation(state, "create", { subject: "first" }).state;
  state = applyMutation(state, "create", { subject: "second" }).state;
  state = applyMutation(state, "update", { id: 1, status: "in_progress" }).state;

  const outcome = applyMutation(state, "update", { id: 2, status: "in_progress" });
  assert.equal(outcome.error, "only one task may be in_progress at a time");
  assert.deepEqual(outcome.state, state);
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

  const expanded = renderTodoWidget(plainTheme, tasks, true, 72);
  assert.match(expanded[0], /3 tasks · 1 done · 1 running · 1 blocked/);
  assert.match(expanded[1], /Implement replacement/);
  assert.match(expanded[2], /Verify behavior/);
  assert.match(expanded[2], /← ■ Implement replacement/);
  assert.match(expanded[1], /@worker/);
  assert.match(expanded[0], /Alt\+Shift\+T collapse/);
  assert.ok(expanded.every((line) => visibleWidth(line) <= 72));
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

test("Todo initializer retries a failed load and shares concurrent initialization", async () => {
  let loads = 0;
  let todoRegistrations = 0;
  let guardRegistrations = 0;
  const initializer = createTodoInitializer(
    async () => {
      loads += 1;
      if (loads === 1) throw new Error("temporary import failure");
      await new Promise((resolve) => setTimeout(resolve, 5));
      return ["todo", "guard"];
    },
    () => { todoRegistrations += 1; },
    () => { guardRegistrations += 1; },
  );

  await assert.rejects(initializer(), /temporary import failure/);
  await Promise.all([initializer(), initializer()]);
  await initializer();

  assert.equal(loads, 2);
  assert.equal(todoRegistrations, 1);
  assert.equal(guardRegistrations, 1);
});

test("Todo initializer does not duplicate a successful partial registration on retry", async () => {
  let todoRegistrations = 0;
  let guardRegistrations = 0;
  let failGuard = true;
  const initializer = createTodoInitializer(
    async () => ["todo", "guard"],
    () => { todoRegistrations += 1; },
    () => {
      guardRegistrations += 1;
      if (failGuard) {
        failGuard = false;
        throw new Error("temporary guard registration failure");
      }
    },
  );

  await assert.rejects(initializer(), /temporary guard registration failure/);
  await initializer();
  await initializer();

  assert.equal(todoRegistrations, 1);
  assert.equal(guardRegistrations, 2, "retry the failed guard, preserving the completed todo registration");
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
  assert.ok(tools.some((tool) => tool.name === "code_outline"));
  assert.ok(!tools.some((tool) => tool.name === "todo"));
  assert.deepEqual([...commands.keys()], ["stash", "anycopy", "md", "preview", "preview-browser", "preview-pdf", "preview-clear-cache", "tools", "deferred-tools"]);
  assert.deepEqual([...shortcuts.keys()], ["ctrl+alt+s", "ctrl+alt+y", "ctrl+alt+t"]);
  assert.ok(handlers.has("session_start"));
  assert.ok(handlers.has("session_tree"));
  assert.ok(handlers.has("session_compact"));

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
      setStatus() {},
    },
  };
  await handlers.get("session_start").at(-1)({}, ctx);
  assert.equal(tools.filter((tool) => tool.name === "todo").length, 1);
  assert.equal(tools.filter((tool) => tool.name === "code_outline").length, 1);
  assert.ok(commands.has("todos"));
  assert.ok(commands.has("maestro-todo"));
  assert.ok(shortcuts.has("alt+shift+t"));
  assert.ok(handlers.has("session_tree"));
  assert.ok(handlers.has("session_compact"));
  assert.ok(handlers.has("session_shutdown"));
  const result = await tools.find((tool) => tool.name === "todo").execute("call-1", { action: "create", subject: "Test tool" }, undefined, undefined, ctx);
  assert.equal(result.details.nextId, 2);
  assert.equal(result.details.tasks[0].subject, "Test tool");
  await handlers.get("session_start").at(-1)({}, ctx);
  assert.equal(tools.filter((tool) => tool.name === "todo").length, 1);
  await handlers.get("session_shutdown").at(-1)({}, ctx);
  await handlers.get("session_shutdown").at(-1)({}, ctx);
});
