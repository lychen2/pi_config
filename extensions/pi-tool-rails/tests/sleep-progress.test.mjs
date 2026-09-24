import assert from "node:assert/strict";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { visibleWidth } from "@earendil-works/pi-tui";
import { initTheme, ToolExecutionComponent } from "@earendil-works/pi-coding-agent";
import labeledToolShell from "../compact-shell.ts";
import { decorateTool } from "../index.ts";
import { SleepProgress, createSleepProgressBash, sleepSeconds, sleepProgressLine } from "../sleep-progress.ts";

const theme = { fg: (_color, text) => text, bold: (text) => text };
const base = { render: () => ["command"], invalidate() {} };

test("accepts finite sleep durations and refuses unknown operands", () => {
  for (const [args, expected] of [
    [["240"], 240], [["4m"], 240], [["0.5"], 0.5], [[".5s"], 0.5],
    [["--", "1h", "2m", "3s"], 3723], [["1d"], 86400],
  ]) assert.equal(sleepSeconds(args), expected);
  for (const args of [[], ["0"], ["-1"], ["inf"], ["$WAIT"], ["--help"], ["2", "oops"]]) {
    assert.equal(sleepSeconds(args), undefined);
  }
});

test("progress lines fit narrow terminals and never announce completion early", () => {
  for (const width of [0, 1, 10, 20, 40, 80]) {
    assert.ok(visibleWidth(sleepProgressLine(240, 61, width)) <= width);
  }
  assert.match(sleepProgressLine(240, 60, 90), /\[━+─+\] 25% · 约剩 3m00s/);
  assert.match(sleepProgressLine(1, 2, 90), /99% · 等待进程结束/);
});

test("tracks phases and concurrent calls independently, clears on finish and dispose", async () => {
  let found = new Map();
  let now = 0;
  let redraws = 0;
  const progress = new SleepProgress(async () => found, () => now);
  const tokenA = progress.start("a");
  const tokenB = progress.start("b");
  const a = progress.component("a", base, () => redraws++, (s) => s);
  const b = progress.component("b", base, () => redraws++, (s) => s);
  try {
    await progress.poll();
    assert.deepEqual(a.render(90), ["command"]);
    now = 5000;
    found = new Map([[tokenA, [{ key: "p1", seconds: 4 }]]]);
    await progress.poll();
    assert.match(a.render(90)[1], /0%/);
    now += 1000;
    await progress.poll();
    assert.match(a.render(90)[1], /25%/);
    assert.deepEqual(b.render(90), ["command"]);
    found = new Map([[tokenB, [{ key: "p2", seconds: 8 }, { key: "p3", seconds: 2 }]]]);
    await progress.poll();
    assert.deepEqual(a.render(90), ["command"]);
    assert.match(b.render(90)[1], /sleep ×2/);
    progress.stop("b");
    assert.deepEqual(b.render(90), ["command"]);
    assert.ok(redraws > 0);
  } finally { progress.dispose(); }
  assert.deepEqual(a.render(90), ["command"]);
});

test("late scans cannot resurrect disposed calls", async () => {
  let resolve;
  const progress = new SleepProgress(() => new Promise((done) => { resolve = done; }));
  const token = progress.start("late");
  const component = progress.component("late", base, () => {}, (s) => s);
  const pending = progress.poll();
  progress.dispose();
  resolve(new Map([[token, [{ key: "gone", seconds: 10 }]]]));
  await pending;
  assert.deepEqual(component.render(80), ["command"]);
});

test("real compact tool box refreshes progress without output updates", async () => {
  initTheme("dark");
  const handlers = new Map();
  labeledToolShell({ on: (name, handler) => handlers.set(name, handler) });
  handlers.get("session_start")({}, { mode: "tui", ui: { theme } });
  let found = new Map();
  let now = 0;
  let redraws = 0;
  const progress = new SleepProgress(async () => found, () => now);
  try {
    const tool = createSleepProgressBash(process.cwd(), progress, decorateTool);
    const box = new ToolExecutionComponent("bash", "box", { command: "sleep 240" }, {}, tool, { requestRender() { redraws++; } }, process.cwd());
    box.markExecutionStarted();
    box.render(90);
    const token = progress.start("box");
    box.render(90);
    found = new Map([[token, [{ key: "p", seconds: 240 }]]]);
    await progress.poll();
    assert.match(box.render(90).join("\n"), /约剩/);
    now = 60000;
    await progress.poll();
    assert.match(box.render(90).join("\n"), /25%/);
    for (const width of [18, 40, 90]) assert.ok(box.render(width).every((line) => visibleWidth(line) <= width));
    assert.ok(redraws > 0);
    progress.stop("box");
    box.updateResult({ content: [{ type: "text", text: "done" }], isError: false }, false);
    assert.doesNotMatch(box.render(90).join("\n"), /约剩/);
  } finally {
    progress.dispose();
    handlers.get("session_shutdown")({});
  }
});

async function waitFor(predicate, timeout = 2500) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (predicate()) return;
    await delay(40);
  }
  assert.fail("Expected progress state was not observed");
}

function execution(command, options = {}) {
  const progress = new SleepProgress();
  const tool = createSleepProgressBash(process.cwd(), progress, decorateTool);
  const controller = new AbortController();
  const args = { command, ...options };
  const updates = [];
  const promise = tool.execute("integration", args, controller.signal, (value) => updates.push(value), { cwd: process.cwd(), sessionManager: { getSessionId: () => "test", getSessionFile: () => undefined } });
  // Attach a rejection handler before polling to avoid unhandled abort failures.
  promise.catch(() => {});
  const component = tool.renderCall(args, theme, { toolCallId: "integration", invalidate() {}, args });
  return { progress, component, controller, promise, updates };
}

const linux = { skip: process.platform !== "linux" };
test("compound commands start counting at sleep and preserve later output", linux, async () => {
  const run = execution("cd /tmp && node -e 'setTimeout(()=>{},700)' && sleep 1.2 && printf 'first\\n'; echo ---; printf 'second\\n' 2>/dev/null || echo fallback");
  try {
    await delay(400);
    assert.equal(run.component.render(200).length, 1);
    await waitFor(() => run.component.render(200).length > 1);
    assert.ok(Number(run.component.render(200)[1].match(/(\d+)%/)[1]) < 20);
    const result = await run.promise;
    assert.equal(result.content[0].text, "first\n---\nsecond\n");
    assert.equal(run.component.render(200).length, 1);
    assert.ok(!JSON.stringify([result, run.updates]).includes("约剩"));
  } finally { run.controller.abort(); run.progress.dispose(); }
});

test("failed earlier commands never show a sleep countdown", linux, async () => {
  const run = execution("false && sleep 5; printf skipped");
  try {
    const result = await run.promise;
    assert.equal(result.content[0].text, "skipped");
    assert.equal(run.component.render(200).length, 1);
  } finally { run.progress.dispose(); }
});

test("abort and native timeout both clear the progress row", linux, async () => {
  for (const timeout of [undefined, 1]) {
    const run = execution("sleep 10 && echo should-not-run", timeout ? { timeout } : {});
    try {
      await waitFor(() => run.component.render(200).length > 1);
      if (!timeout) run.controller.abort();
      await assert.rejects(run.promise, timeout ? /timed out|timeout/i : /aborted/i);
      assert.equal(run.component.render(200).length, 1);
    } finally { run.controller.abort(); run.progress.dispose(); }
  }
});
