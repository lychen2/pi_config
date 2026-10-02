import assert from "node:assert/strict";
import test from "node:test";
import { normalizeLegacyUpdatePlanArgs, registerSolPiCompatibility, tryRegisterSolPiCompatibility } from "../sol-pi-compat.ts";

test("isolates SoL loader failure and reports a useful warning", async () => {
  const registered = [];
  const warnings = [];
  const result = await tryRegisterSolPiCompatibility(
    { registerTool: (tool) => registered.push(tool) },
    "/agent",
    async () => { throw new Error("checkout is missing"); },
    (message) => warnings.push(message),
  );

  assert.equal(result, false);
  assert.deepEqual(registered, []);
  assert.deepEqual(warnings, ["pi-context-bridge: SoL-Pi compatibility unavailable: checkout is missing"]);
});

test("isolates an asynchronous SoL factory failure before continuing registration", async () => {
  const registered = [];
  const warnings = [];
  const pi = { registerTool: (tool) => registered.push(tool) };
  const result = await tryRegisterSolPiCompatibility(
    pi,
    "/agent",
    async () => async () => {
      await Promise.resolve();
      throw new Error("async factory failed");
    },
    (message) => warnings.push(message),
  );
  pi.registerTool({ name: "independent-bridge-tool" });
  assert.equal(result, false);
  assert.deepEqual(registered.map((tool) => tool.name), ["independent-bridge-tool"]);
  assert.match(warnings[0], /async factory failed/);
});

test("registers SoL compatibility when loading succeeds", async () => {
  const registered = [];
  const warnings = [];
  const result = await tryRegisterSolPiCompatibility(
    { registerTool: (tool) => registered.push(tool) },
    "/agent",
    async () => (api) => api.registerTool({ name: "sol-tool" }),
    (message) => warnings.push(message),
  );

  assert.equal(result, true);
  assert.deepEqual(registered.map((tool) => tool.name), ["sol-tool"]);
  assert.deepEqual(warnings, []);
});


test("normalizes the previous summary/plan update_plan payload", () => {
  assert.deepEqual(normalizeLegacyUpdatePlanArgs({
    summary: "Plan the implementation",
    plan: [
      { id: "inspect", description: "Inspect the code", status: "completed", result: "Found the entrypoint" },
      { id: "patch", description: "Patch the bridge", status: "in_progress" },
    ],
  }), {
    steps: [
      { id: "inspect", goal: "Inspect the code", status: "completed" },
      { id: "patch", goal: "Patch the bridge", status: "in_progress" },
    ],
    progress: {
      files_changed: [],
      verification: ["inspect: Found the entrypoint"],
      decisions: ["Plan the implementation"],
    },
  });
});

test("preserves canonical, malformed, and unrelated tool arguments", () => {
  const canonical = { steps: [{ id: "a", goal: "A", status: "pending" }] };
  const malformed = { summary: "old", plan: [{ id: "a", description: "A", status: "unknown" }] };
  const unrelated = { command: "pwd" };
  assert.equal(normalizeLegacyUpdatePlanArgs(canonical), canonical);
  assert.equal(normalizeLegacyUpdatePlanArgs(malformed), malformed);
  assert.equal(normalizeLegacyUpdatePlanArgs(unrelated), unrelated);
});

test("wraps only update_plan prepareArguments before forwarding registration", async () => {
  const registered = [];
  const upstream = (api) => {
    api.registerTool({ name: "other", prepareArguments: (args) => args });
    api.registerTool({ name: "update_plan", prepareArguments: (args) => ({ ...args, upstream: true }) });
  };
  await registerSolPiCompatibility({ registerTool: (tool) => registered.push(tool) }, upstream);

  assert.equal(registered.length, 2);
  assert.equal(registered[0].name, "other");
  assert.deepEqual(registered[1].prepareArguments({
    summary: "Legacy",
    plan: [{ id: "a", description: "A", status: "pending" }],
  }), {
    steps: [{ id: "a", goal: "A", status: "pending" }],
    progress: { files_changed: [], verification: [], decisions: ["Legacy"] },
    upstream: true,
  });
});

test("leaves an omitted prepareArguments absent for canonical calls", async () => {
  const registered = [];
  await registerSolPiCompatibility({ registerTool: (tool) => registered.push(tool) }, (api) => {
    api.registerTool({ name: "update_plan" });
  });

  assert.equal(registered[0].prepareArguments({ value: 1 }).value, 1);
});
