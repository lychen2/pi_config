import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createAgentSession, DefaultResourceLoader, SessionManager, SettingsManager } from "@earendil-works/pi-coding-agent";
import { fauxAssistantMessage, fauxProvider, fauxToolCall } from "@earendil-works/pi-ai/providers/faux";
import { normalizeLegacyUpdatePlanArgs, registerSolPiCompatibility, tryRegisterSolPiCompatibility } from "../sol-pi-compat.ts";

test("loads the local fork through Pi and keeps first-request observation bytes stable with recall", { timeout: 30_000 }, async (t) => {
  const cwd = await mkdtemp(join(tmpdir(), "bridge-sol-fork-"));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const agentDir = join(cwd, "agent");
  await mkdir(agentDir);
  const config = JSON.parse(await readFile(new URL("../../../config/sol-pi.json", import.meta.url), "utf8"));
  await mkdir(join(cwd, ".pi"));
  await writeFile(join(cwd, ".pi", "sol-pi.json"), JSON.stringify(config));
  const body = `head evidence\n${`${"middle evidence bytes ".repeat(3)}\n`.repeat(200)}tail evidence\n`;
  await writeFile(join(cwd, "evidence.txt"), body);
  const compatPath = fileURLToPath(new URL("../sol-pi-compat.ts", import.meta.url));
  const fixturePath = join(cwd, "bridge-sol.ts");
  await writeFile(fixturePath, `
import { tryRegisterSolPiCompatibility } from ${JSON.stringify(compatPath)};
export default async function (pi) {
  if (!await tryRegisterSolPiCompatibility(pi, ${JSON.stringify(agentDir)})) {
    throw new Error("Local fork did not register through the bridge");
  }
}
`);
  const faux = fauxProvider({ provider: "bridge-sol-test", api: "bridge-sol-test-api" });
  const requests = [];
  const capture = (context) => requests.push(structuredClone(context.messages));
  faux.setResponses([
    fauxAssistantMessage(fauxToolCall("read", { path: "evidence.txt" }), { stopReason: "toolUse" }),
    (context) => {
      capture(context);
      return fauxAssistantMessage(fauxToolCall("write", { path: "small.txt", content: "done\n" }), { stopReason: "toolUse" });
    },
    (context) => {
      capture(context);
      const result = context.messages.find((message) => message.role === "toolResult" && message.toolName === "read");
      const id = result?.content.find((block) => block.type === "text")?.text.match(/obs_[a-f0-9]{24}/)?.[0];
      assert.ok(id, "first read result must have an observation id");
      return fauxAssistantMessage(fauxToolCall("obs_recall", { id, offset: 600 }), { stopReason: "toolUse" });
    },
    (context) => { capture(context); return fauxAssistantMessage("bridge fork verified"); },
  ]);
  const settingsManager = SettingsManager.inMemory({ compaction: { enabled: false }, retry: { enabled: false } }, { projectTrusted: true });
  const resourceLoader = new DefaultResourceLoader({
    cwd, agentDir, settingsManager,
    additionalExtensionPaths: [fixturePath],
    extensionFactories: [{ name: "faux-provider", factory: (pi) => pi.registerProvider(faux.provider) }],
    noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
    systemPrompt: "Deterministic bridge integration assistant.",
  });
  await resourceLoader.reload();
  assert.deepEqual(resourceLoader.getExtensions().errors, []);
  const sessionManager = SessionManager.create(cwd, join(agentDir, "sessions"));
  const { session } = await createAgentSession({ cwd, agentDir, settingsManager, sessionManager, resourceLoader, model: faux.getModel(), thinkingLevel: "off" });
  t.after(() => session.dispose());
  const errors = [];
  await session.bindExtensions({ onError: (error) => errors.push(error) });
  assert.ok(session.getActiveToolNames().includes("obs_recall"));
  assert.ok(session.getActiveToolNames().includes("update_plan"));
  await session.prompt("read, write, and recall the evidence", { expandPromptTemplates: false });
  assert.equal(requests.length, 3);
  const readIndex = requests[0].findIndex((message) => message.role === "toolResult" && message.toolName === "read");
  assert.ok(readIndex >= 0);
  const placeholder = requests[0][readIndex].content[0].text;
  assert.match(placeholder, /^\[large tool result replaced from the first provider request/);
  assert.notEqual(placeholder, body);
  for (const request of requests.slice(1)) {
    assert.deepEqual(request.slice(0, readIndex + 1), requests[0].slice(0, readIndex + 1));
  }
  const results = sessionManager.getBranch().flatMap((entry) => entry.type === "message" && entry.message.role === "toolResult" ? [entry.message] : []);
  assert.deepEqual(results.map((result) => result.isError), [false, false, false]);
  assert.equal(results[0].content[0].text, body);
  assert.ok(results[2].content[0].text.endsWith(body.slice(600)));
  assert.equal(session.getLastAssistantText(), "bridge fork verified");
  assert.deepEqual(errors, []);
});

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

test("bypasses SoL-Pi context-rewriting hooks for Claude models", async () => {
  const handlers = new Map();
  const api = {
    on: (event, handler) => {
      handlers.set(event, handler);
      return () => handlers.delete(event);
    },
  };
  const invoked = [];
  await registerSolPiCompatibility(api, (facade) => {
    for (const event of ["context", "tool_result", "turn_end"]) {
      facade.on(event, () => invoked.push(event));
    }
    facade.on("session_start", () => invoked.push("session_start"));
  });

  const context = { model: { provider: "anthropic", id: "claude-sonnet-4", name: "Claude Sonnet" } };
  for (const event of ["context", "tool_result", "turn_end", "session_start"]) {
    await handlers.get(event)({ type: event }, context);
  }

  assert.deepEqual(invoked, ["session_start"]);
});

test("runs SoL-Pi context-rewriting hooks for non-Claude models", async () => {
  const handlers = new Map();
  const api = { on: (event, handler) => handlers.set(event, handler) };
  const invoked = [];
  await registerSolPiCompatibility(api, (facade) => {
    for (const event of ["context", "tool_result", "turn_end"]) {
      facade.on(event, () => invoked.push(event));
    }
  });

  await handlers.get("context")({ type: "context" }, {
    model: { provider: "openai", id: "gpt-5", name: "GPT-5" },
  });

  assert.deepEqual(invoked, ["context"]);
});
