import assert from "node:assert/strict";
import test from "node:test";

import {
  AssistantMessageComponent,
  BashExecutionComponent,
  ToolExecutionComponent,
  UserMessageComponent,
} from "@earendil-works/pi-coding-agent";
import labeledToolShell from "../compact-shell.ts";
import toolRails from "../index.ts";
import promptFrame from "../prompt-frame.ts";

const theme = {
  fg(_color, text) { return text; },
  bg(_color, text) { return text; },
  bold(text) { return text; },
};

function createPi() {
  const handlers = new Map();
  return {
    handlers,
    on(event, handler) {
      const registered = handlers.get(event) ?? [];
      registered.push(handler);
      handlers.set(event, registered);
    },
    getAllTools() { return []; },
    registerTool() {},
    getThinkingLevel() { return "high"; },
  };
}

async function emit(pi, event, payload, ctx) {
  for (const handler of pi.handlers.get(event) ?? []) await handler(payload, ctx);
}

function createContext() {
  let editor;
  const originalSetEditor = (factory) => { editor = factory; };
  const ui = {
    theme,
    setEditorComponent: originalSetEditor,
    getEditorComponent: () => editor,
  };
  return { mode: "tui", cwd: process.cwd(), ui, originalSetEditor };
}

test("repeated session starts leave one cleanup owner for every presentation patch", async () => {
  const assistantRender = AssistantMessageComponent.prototype.render;
  const assistantUpdateContent = AssistantMessageComponent.prototype.updateContent;
  const userRender = UserMessageComponent.prototype.render;
  const userInvalidate = UserMessageComponent.prototype.invalidate;
  const toolRender = ToolExecutionComponent.prototype.render;
  const toolInvalidate = ToolExecutionComponent.prototype.invalidate;
  const toolShell = ToolExecutionComponent.prototype.getRenderShell;
  const bashRender = BashExecutionComponent.prototype.render;
  const bashInvalidate = BashExecutionComponent.prototype.invalidate;
  const bashShell = BashExecutionComponent.prototype.getRenderShell;

  const railsPi = createPi();
  const shellPi = createPi();
  const promptPi = createPi();
  const first = createContext();
  const second = createContext();

  toolRails(railsPi);
  labeledToolShell(shellPi);
  promptFrame(promptPi);

  await emit(railsPi, "session_start", { reason: "startup" }, first);
  await emit(shellPi, "session_start", { reason: "startup" }, first);
  await emit(promptPi, "session_start", { reason: "startup" }, first);
  await emit(railsPi, "session_start", { reason: "reload" }, second);
  await emit(shellPi, "session_start", { reason: "reload" }, second);
  await emit(promptPi, "session_start", { reason: "reload" }, second);

  assert.notEqual(AssistantMessageComponent.prototype.render, assistantRender);
  assert.notEqual(UserMessageComponent.prototype.render, userRender);
  assert.notEqual(ToolExecutionComponent.prototype.render, toolRender);
  assert.notEqual(BashExecutionComponent.prototype.render, bashRender);
  assert.equal(first.ui.setEditorComponent, first.originalSetEditor);
  assert.notEqual(second.ui.setEditorComponent, second.originalSetEditor);

  await emit(promptPi, "session_shutdown", { reason: "reload" });
  await emit(shellPi, "session_shutdown", { reason: "reload" });
  await emit(railsPi, "session_shutdown", { reason: "reload" });

  assert.equal(AssistantMessageComponent.prototype.render, assistantRender);
  assert.equal(AssistantMessageComponent.prototype.updateContent, assistantUpdateContent);
  assert.equal(UserMessageComponent.prototype.render, userRender);
  assert.equal(UserMessageComponent.prototype.invalidate, userInvalidate);
  assert.equal(ToolExecutionComponent.prototype.render, toolRender);
  assert.equal(ToolExecutionComponent.prototype.invalidate, toolInvalidate);
  assert.equal(ToolExecutionComponent.prototype.getRenderShell, toolShell);
  assert.equal(BashExecutionComponent.prototype.render, bashRender);
  assert.equal(BashExecutionComponent.prototype.invalidate, bashInvalidate);
  assert.equal(BashExecutionComponent.prototype.getRenderShell, bashShell);
  assert.equal(second.ui.setEditorComponent, second.originalSetEditor);
  assert.equal(globalThis[Symbol.for("pi.toolRails.assistantMessagePatch")], undefined);
  assert.equal(globalThis[Symbol.for("pi.toolRails.prototype-patch-registry")], undefined);
});
