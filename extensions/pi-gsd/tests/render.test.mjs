import assert from "node:assert/strict";
import test from "node:test";

import {
  formatTaskDuration,
  recordTaskSettled,
  taskResultDisplay,
  toolPushTask,
  updateTaskStatus,
} from "../.test-dist/src/index.js";

const theme = {
  bg(_color, text) { return text; },
  bold(text) { return text; },
  fg(_color, text) { return text; },
};

function lines(component) {
  return component.render(120).map((line) => line.trimEnd());
}

function session(entries) {
  return {
    getBranch() { return entries; },
    getLeafId() { return entries.at(-1)?.id ?? null; },
  };
}

test("registers push-task as the session-tree subagent entry point", () => {
  const tool = toolPushTask({ appendEntry() {} });

  assert.equal(tool.label, "Subagent Task");
  assert.match(tool.description, /session-tree subagent/i);
  assert.match(tool.description, /user asks for a subagent/i);
  assert.ok(tool.promptGuidelines.some((line) => /does not start immediately/i.test(line)));
});

test("renders a queued subagent as one collapsed line and reveals its prompt when expanded", () => {
  const tool = toolPushTask({ appendEntry() {} });
  const args = {
    title: "inspect repository",
    prompt: "Check the current branch.\nDo not modify files.",
    role: "explore",
    model: "manager/gpt-5.6-luna",
  };

  assert.deepEqual(lines(tool.renderCall(args, theme, { expanded: false })), [
    "○ inspect repository · queued · role explore · model manager/gpt-5.6-luna",
  ]);
  assert.deepEqual(lines(tool.renderCall(args, theme, { expanded: true })), [
    "○ inspect repository · queued · role explore · model manager/gpt-5.6-luna",
    "Check the current branch.",
    "Do not modify files.",
  ]);
});

test("keeps completed prose behind expansion and formats elapsed time", () => {
  assert.equal(formatTaskDuration(842), "<1s");
  assert.equal(formatTaskDuration(8_990), "9.0s");
  assert.equal(formatTaskDuration(62_000), "1m 02s");
  assert.equal(formatTaskDuration(3_720_000), "1h 02m");

  const details = { title: "review changes", durationMs: 8_990 };
  assert.equal(
    taskResultDisplay(details, "No blocking findings.", false, theme),
    "✓ 🧵 review changes · completed · 9.0s",
  );
  assert.equal(
    taskResultDisplay(details, "No blocking findings.", true, theme),
    "✓ 🧵 review changes · completed · 9.0s\nNo blocking findings.",
  );
});

test("records the last settled assistant turn once for accurate elapsed time", () => {
  const entries = [
    { id: "task-start", type: "custom", customType: "task-start", data: { title: "review", returnTo: "parent", startedAt: 1_000 } },
    { id: "assistant", type: "message", message: { role: "assistant", content: "done" } },
  ];
  const appended = [];
  recordTaskSettled({
    appendEntry(customType, data) { appended.push({ customType, data }); },
  }, session(entries), 9_990);

  assert.deepEqual(appended, [{
    customType: "task-settled",
    data: { taskStartId: "task-start", assistantEntryId: "assistant", endedAt: 9_990 },
  }]);

  entries.push({ id: "settled", type: "custom", ...appended[0] });
  recordTaskSettled({ appendEntry() { assert.fail("duplicate settle entry"); } }, session(entries), 10_000);
});

test("shows explicit queued and running subagent states in the footer", () => {
  let status;
  const setStatus = (_key, value) => { status = value; };

  updateTaskStatus(session([
    { id: "queued", type: "custom", customType: "task", data: { title: "inspect", prompt: "prompt" } },
  ]), setStatus, theme);
  assert.equal(status, "○ subagent inspect · queued");

  updateTaskStatus(session([
    { id: "active", type: "custom", customType: "task-start", data: { title: "review", returnTo: "parent", startedAt: 1 } },
  ]), setStatus, theme, { prefix: "[auto] " });
  assert.equal(status, "[auto] ● subagent review · running");

  updateTaskStatus(session([]), setStatus, theme);
  assert.equal(status, undefined);
});
