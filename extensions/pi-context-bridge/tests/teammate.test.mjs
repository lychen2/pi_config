import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createJiti } from "jiti";
import { patchTeammate, installedTeammateRoot, TEAMMATE_MODEL } from "../patch-teammate.mjs";

const jiti = createJiti(import.meta.url, { interopDefault: true });
test("patch is installed, idempotent, and fails closed on version changes", () => {
  assert.equal(patchTeammate(installedTeammateRoot()), 0);
  const temp = mkdtempSync(join(tmpdir(), "teammate-patch-"));
  writeFileSync(join(temp, "package.json"), JSON.stringify({ version: "9.0.0" }));
  assert.throws(() => patchTeammate(temp), /Review teammate patch/);
  writeFileSync(join(temp, "package.json"), JSON.stringify({ version: "2.6.2" }));
  mkdirSync(join(temp, "src/models"), { recursive: true });
  writeFileSync(join(temp, "src/models/model-routing.ts"), "changed upstream");
  assert.throws(() => patchTeammate(temp), /anchor changed/);
  assert.equal(readFileSync(join(temp, "src/models/model-routing.ts"), "utf8"), "changed upstream");
});

test("every task route overrides explicit models, parent models, and fallback chains", async () => {
  const { applyModelRouting } = await jiti.import("pi-maestro-teammate/v1/model-routing");
  const cwd = mkdtempSync(join(tmpdir(), "teammate-routes-"));
  const result = applyModelRouting({ model: "wrong/top", fallbackModels: ["wrong/fallback"], tasks: [
    { agent: "general", prompt: "test", model: "wrong/task", fallbackModels: ["wrong/backup"] },
    { agent: "explorer", prompt: "test", taskType: "explore" },
    { agent: "analyst", prompt: "test", taskType: "custom-kind" },
  ] }, cwd, [TEAMMATE_MODEL, "wrong/top"], join(cwd, "missing.json"), "wrong/parent");
  assert.equal(result.model, TEAMMATE_MODEL);
  assert.deepEqual(result.fallbackModels, []);
  for (const task of result.tasks) {
    assert.equal(task.model, TEAMMATE_MODEL);
    assert.deepEqual(task.fallbackModels, []);
  }
});

test("single-run boundary enforces model before validation and refuses alternate backends", async () => {
  const { runSingleTeammate } = await jiti.import("pi-maestro-teammate/src/runs/execution.ts");
  const cwd = mkdtempSync(join(tmpdir(), "teammate-run-"));
  const result = await runSingleTeammate({ agent: "missing-role", model: "wrong/model", fallbackModels: ["wrong/fallback"] }, { baseCwd: cwd });
  assert.equal(result.exitCode, 1);
  assert.equal(result.model, TEAMMATE_MODEL);
  await assert.rejects(runSingleTeammate({ agent: "general", backend: "remote" }, { baseCwd: cwd }), /local Pi backend/);
});

test("dispatch boundaries forbid expert mode and nested agents without mutating callers", async () => {
  const { boundTeammateDispatch, TEAMMATE_SCOPE_RULES } = await jiti.import("../teammate.ts");
  const task = { goal: "Inspect src/a.ts; report findings", access: "read-only", allowedPaths: [], checks: ["Cite file and line evidence"], stopWhen: "Return findings or one blocker" };
  const input = { concurrency: 2, tasks: [task] };
  const original = structuredClone(input);
  const result = boundTeammateDispatch(input);
  assert.equal(result.maxNestingDepth, 0);
  assert.equal(result.tasks[0].maxNestingDepth, 0);
  assert.equal(result.concurrency, 2);
  assert.equal(result.tasks[0].agent, "analyst");
  assert.ok(result.tasks[0].prompt.startsWith(TEAMMATE_SCOPE_RULES));
  assert.ok(result.tasks[0].prompt.includes(task.goal));
  assert.deepEqual(input, original);
  for (const extra of [{ mode: "expert" }, { maxNestingDepth: 9 }, { model: "wrong/model" }]) {
    assert.throws(() => boundTeammateDispatch({ ...input, ...extra }), /Invalid teammate contract/);
  }
  for (const invalid of [null, {}, { tasks: [] }, { tasks: [{ prompt: "Inspect files" }] }]) {
    assert.throws(() => boundTeammateDispatch(invalid), /Invalid teammate contract/);
  }
  for (const key of ["goal", "access", "allowedPaths", "checks", "stopWhen"]) {
    const missing = { ...task }; delete missing[key];
    assert.throws(() => boundTeammateDispatch({ tasks: [missing] }), /Invalid teammate contract/);
  }
  for (const patch of [{ goal: "  " }, { checks: [] }, { checks: [" "] }, { stopWhen: "" }, { access: "full" }, { prompt: "bypass" }]) {
    assert.throws(() => boundTeammateDispatch({ tasks: [{ ...task, ...patch }] }), /Invalid teammate contract/);
  }
  assert.throws(() => boundTeammateDispatch({ tasks: [{ ...task, access: "edit" }] }), /explicit write paths/);
  assert.throws(() => boundTeammateDispatch({ tasks: [{ ...task, allowedPaths: ["src/a.ts"] }] }), /read-only access requires/);
  for (const badPath of ["/", ".", "../src", "src/../config", "**", "src/*"]) {
    assert.throws(() => boundTeammateDispatch({ tasks: [{ ...task, access: "edit", allowedPaths: [badPath] }] }), /Invalid teammate contract/);
  }
  const edit = boundTeammateDispatch({ tasks: [{ ...task, access: "edit", allowedPaths: ["src/a.ts"] }] });
  assert.equal(edit.tasks[0].agent, "general");
  assert.match(edit.tasks[0].prompt, /src\/a.ts/);
});

test("Pi validates the public schema and streaming previews tolerate incomplete tasks", async () => {
  const { validateToolArguments } = await import("@earendil-works/pi-ai");
  const { TeammateDispatchSchema, boundTeammateDispatch, previewTeammateDispatch } = await jiti.import("../teammate-contract.ts");
  const tool = { name: "teammate", description: "Bounded delegation", parameters: TeammateDispatchSchema };
  const task = { goal: "Review src/a.ts", access: "read-only", allowedPaths: [], checks: ["Cite evidence"], stopWhen: "Return review" };
  const valid = { tasks: [task] };
  const checked = validateToolArguments(tool, { id: "test", name: "teammate", arguments: valid });
  assert.deepEqual(checked, valid);
  assert.equal(boundTeammateDispatch(checked).tasks[0].maxNestingDepth, 0);
  assert.throws(() => validateToolArguments(tool, { id: "test", name: "teammate", arguments: { tasks: [{ prompt: "legacy" }] } }));
  for (const partial of [undefined, {}, { tasks: [null, {}, { goal: "Partial" }] }]) {
    assert.doesNotThrow(() => previewTeammateDispatch(partial));
  }
  assert.equal(previewTeammateDispatch(valid).tasks[0].prompt, task.goal);
});

test("bridge registers a lightweight teammate proxy and loads upstream on first use", async () => {
  const loaded = await jiti.import("../teammate.ts");
  const tools = [], events = [], commands = [], ownershipEvents = [];
  const listeners = new Map();
  const pi = {
    registerTool: tool => tools.push(tool),
    on: name => events.push(name),
    events: {
      on: (name, handler) => { const handlers = listeners.get(name) ?? []; handlers.push(handler); listeners.set(name, handlers); return () => {}; },
      emit: (name, payload) => {
        if (name === "cockpit:ui-ownership") ownershipEvents.push(payload);
        for (const handler of listeners.get(name) ?? []) handler(payload);
      },
    },
    registerCommand: name => commands.push(name),
    registerShortcut() {}, registerMessageRenderer() {},
    getActiveTools: () => [], getAllTools: () => [], setActiveTools() {},
  };
  await loaded.default(pi);
  const dispatch = tools.find(tool => tool.name === "teammate");
  assert.ok(dispatch);
  assert.equal(tools.length, 1);
  const { TeammateDispatchSchema } = await jiti.import("../teammate-contract.ts");
  assert.deepEqual(dispatch.parameters, TeammateDispatchSchema);
  assert.equal(dispatch.parameters.properties.tasks.items.properties.prompt, undefined);
  assert.deepEqual(dispatch.parameters.properties.tasks.items.required, ["goal", "access", "allowedPaths", "checks", "stopWhen"]);
  assert.doesNotMatch(JSON.stringify(dispatch.parameters), /\(\?[=!<]/, "provider JSON schemas reject regex lookaround");
  assert.equal(typeof dispatch.execute, "function");
  assert.equal(commands.length, 5);
  assert.equal(events.includes("session_start"), true);

  // Exercise the real discovery path before loading: activate the registered proxy schema.
  const { createSearchToolBm25 } = await import("../../pi-default-workbench/deferred-tools/search-tool-bm25.ts");
  let active = ["read", "search_tool_bm25"];
  const discovery = createSearchToolBm25({
    getAllTools: () => [dispatch],
    getActiveTools: () => active,
    setActiveTools: names => { active = names; },
  });
  const found = await discovery.execute("discover", { query: "teammate", limit: 1 });
  assert.deepEqual(found.details.activatedTools, ["teammate"]);
  assert.ok(active.includes("teammate"));
  const loadedSchema = [dispatch].find(tool => active.includes(tool.name)).parameters;
  assert.deepEqual(loadedSchema, TeammateDispatchSchema);
  assert.deepEqual(found.details.tools[0].schemaKeys, ["background", "concurrency", "tasks"]);

  const claimed = { agents: true, sessionList: false, quiet: false };
  pi.events.emit("cockpit:ui-ownership", claimed);
  const cancelled = await dispatch.execute("cancelled", { tasks: [{ goal: "Review src/a.ts", access: "read-only", allowedPaths: [], checks: ["Cite evidence"], stopWhen: "Return review" }] }, AbortSignal.abort());
  assert.equal(cancelled.isError, true);
  assert.deepEqual(ownershipEvents, [claimed, claimed], "lazy teammate must receive the earlier agent-widget claim");
  assert.match(cancelled.content[0].text, /cancelled before start/);
  assert.ok(tools.some(tool => tool.name === "observe"));
  assert.ok(events.includes("session_start"));
});
