import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";
import { compatibleRtkApi, isSummaryCommand, preserveResult } from "../rtk-compat.ts";
import registerRtk from "../rtk.ts";

const jiti = createJiti(import.meta.url);
const { compactToolResult } = await jiti.import("../node_modules/pi-rtk-optimizer/src/output-compactor.ts");
const { DEFAULT_RTK_INTEGRATION_CONFIG } = await jiti.import("../node_modules/pi-rtk-optimizer/src/types.ts");

test("production entry loads upstream RTK once through scoped registration", async () => {
  const handlers = new Map();
  const commands = [];
  await registerRtk({
    on(name, handler) {
      const existing = handlers.get(name) ?? [];
      existing.push(handler);
      handlers.set(name, existing);
    },
    registerCommand(name) { commands.push(name); },
  });
  assert.ok(commands.length > 0);
  assert.equal(handlers.get("tool_call").length, 1);
  assert.equal(handlers.get("tool_result").length, 1);
  assert.ok(handlers.has("session_start"));
  assert.equal(handlers.has("tool_execution_update"), false);
});

function event(command, text, extra = {}) {
  return { toolName: "bash", input: { command }, content: [{ type: "text", text }], ...extra };
}

test("only bounded summary commands permit automatic rewriting", () => {
  for (const command of ["git status", "git status --short", "git diff --stat", "git log --oneline -5"]) assert.ok(isSummaryCommand(command));
  for (const command of ["cargo test", "npm test", "./custom-check", "find . -print", "head -20 evidence.txt", "sed -n '1,200p' evidence.txt", "git diff", "git status && make", "git status\nmake", "rtk cargo test"]) assert.equal(isSummaryCommand(command), false, command);
});

test("real RTK truncates exact readback; scoped hook preserves every byte and details", async () => {
  const config = structuredClone(DEFAULT_RTK_INTEGRATION_CONFIG);
  const raw = event("sed -n '1,500p' evidence.txt", "evidence abcdefghijklmnopqrstuvwxyz\n".repeat(500), { details: { fullOutputPath: "/tmp/pi-bash-example.log" } });
  assert.equal(compactToolResult(raw, config).changed, true);
  const handlers = new Map();
  const api = compatibleRtkApi({ on: (name, handler) => handlers.set(name, handler) });
  api.on("tool_result", (input) => compactToolResult(input, config));
  const before = structuredClone(raw);
  assert.equal(await handlers.get("tool_result")(raw, {}), undefined);
  assert.deepEqual(raw, before);
});

test("receipts, fused tools, recall, failures and source reads bypass compaction", () => {
  for (const input of [
    event("git status", "sol_pi_evidence_receipt_v1\nsource_artifact=/tmp/source.txt"),
    event("git status", "Use obs_recall to recover the exact evidence"),
    event("git status", "fatal: failed", { isError: true }),
    event("make", "log", { toolName: "edit" }),
    event("make", "log", { toolName: "write" }),
    event(undefined, "exact", { toolName: "obs_recall" }),
    event(undefined, "source", { toolName: "read" }),
  ]) assert.ok(preserveResult(input));
});

test("wrapper scopes RTK only, preserves lifecycle and prevents streaming mutation", async () => {
  const handlers = new Map();
  let calls = 0;
  const host = { on: (name, handler) => handlers.set(name, handler), registerCommand() {} };
  const originalOn = host.on;
  const api = compatibleRtkApi(host);
  api.on("tool_call", (input) => { calls++; input.input.command = "rewritten"; });
  api.on("session_start", () => { calls++; });
  api.on("tool_execution_update", () => { throw new Error("mutated stream"); });
  api.on("tool_execution_end", () => { throw new Error("mutated result"); });
  assert.equal(host.on, originalOn);
  assert.equal(api.registerCommand, host.registerCommand);
  assert.equal(handlers.has("tool_execution_update"), false);
  assert.equal(handlers.has("tool_execution_end"), false);
  const diagnostic = event("cargo test", "");
  await handlers.get("tool_call")(diagnostic, {});
  assert.equal(diagnostic.input.command, "cargo test");
  await handlers.get("tool_call")(event("git status", ""), {});
  await handlers.get("session_start")();
  assert.equal(calls, 2);
});
