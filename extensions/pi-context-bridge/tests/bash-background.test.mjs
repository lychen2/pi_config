import assert from "node:assert/strict";
import test from "node:test";
import { EventEmitter } from "node:events";
import { homedir } from "node:os";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { createJiti } from "jiti";
import { registerBashBackground } from "../bash-background.ts";

const root = join(homedir(), ".pi/agent/npm/node_modules/@aliou/pi-processes");
const jiti = createJiti(import.meta.url, { alias: { typebox: import.meta.resolve("typebox"), "@earendil-works/pi-coding-agent": import.meta.resolve("@earendil-works/pi-coding-agent"), "@earendil-works/pi-ai": import.meta.resolve("@earendil-works/pi-ai"), "@earendil-works/pi-tui": import.meta.resolve("@earendil-works/pi-tui") } });
const installed = existsSync(join(root, "src/manager/index.ts"));

function api() {
  const bus = new EventEmitter();
  let tool;
  return {
    events: { emit: (name, data) => bus.emit(name, data), on: (name, cb) => { bus.on(name, cb); return () => bus.off(name, cb); } },
    on() {}, registerTool(value) { tool = value; }, get tool() { return tool; },
  };
}
const ctx = { cwd: process.cwd(), sessionManager: { getSessionId: () => "test", getSessionFile: () => undefined } };

test("native fallback preserves short output and nonzero exits without processes", async () => {
  const pi = api();
  registerBashBackground(pi, 20);
  const result = await pi.tool.execute("fast", { command: "printf hello; exit 7" }, undefined, undefined, ctx);
  assert.equal(result.structuredContent.output, "hello");
  assert.equal(result.structuredContent.exit_code, 7);
  assert.equal(result.isError, true);
});

test("real process manager adopts the same Bash child, preserves logs and completion, and supports stop", { skip: !installed, timeout: 15000 }, async () => {
  const { ProcessManager } = await jiti.import(join(root, "src/manager/index.ts"));
  const { registerCommandHandlers } = await jiti.import(join(root, "extensions/processes/handlers/commands.ts"));
  const { createNotificationRegistry, createNotificationService } = await jiti.import(join(root, "extensions/processes/notifications/service.ts"));
  const manager = new ProcessManager();
  const pi = api();
  const notifications = createNotificationRegistry();
  const service = createNotificationService({ events: pi.events, manager, registry: notifications, getProcess: (id) => manager.get(id) });
  const delivered = [];
  pi.events.on("processes:notification", (details) => delivered.push(details));
  const dispose = registerCommandHandlers(pi.events, manager, notifications);
  pi.events.on("processes:request:config", ({ reply }) => reply({}));
  const ended = () => new Promise((resolve) => {
    const off = manager.onEvent((event) => { if (event.type === "process_ended") { off(); resolve(event); } });
  });
  registerBashBackground(pi, 80);
  try {
    const finished = ended();
    const result = await pi.tool.execute("slow", { command: "printf '%s\\n' $$; printf before >&2; sleep 0.3; printf after; exit 3" }, undefined, undefined, ctx);
    const data = result.structuredContent;
    assert.equal(data.status, "background");
    assert.equal(data.exit_code, null);
    const record = manager.get(data.process_id);
    assert.equal(Number(data.output.split("\n")[0]), record.pid);
    assert.equal(record.status, "running");
    assert.ok(notifications.get(record.id), "adoption registers completion notifications");
    await finished;
    assert.equal(manager.get(record.id).exitCode, 3);
    assert.equal(manager.getFullOutput(record.id).stdout, `${record.pid}\nafter`);
    assert.equal(manager.getFullOutput(record.id).stderr, "before");
    assert.equal(delivered[0].kind, "crash");
    assert.equal(delivered[0].attention, "turn");

    const timedEnd = ended();
    const timed = await pi.tool.execute("timeout", { command: "sleep 10", timeout: 0.2 }, undefined, undefined, ctx);
    assert.equal(timed.structuredContent.status, "background");
    await timedEnd;
    assert.equal(manager.get(timed.structuredContent.process_id).status, "killed");

    const stopEnd = ended();
    const stopped = await pi.tool.execute("stop", { command: "sleep 10" }, undefined, undefined, ctx);
    const killed = await manager.kill(stopped.structuredContent.process_id);
    assert.equal(killed.ok, true);
    await stopEnd;

    const controller = new AbortController();
    const aborted = pi.tool.execute("abort", { command: "sleep 10" }, controller.signal, undefined, ctx);
    controller.abort();
    await assert.rejects(aborted, /Command aborted/);
    await assert.rejects(pi.tool.execute("timeout-fast", { command: "sleep 10", timeout: 0.02 }, undefined, undefined, ctx), /timed out/);
  } finally {
    dispose();
    service.dispose();
    manager.cleanup();
  }
});
