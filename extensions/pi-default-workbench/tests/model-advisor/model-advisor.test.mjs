import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = await mkdtemp(join(tmpdir(), "pi-model-advisor-"));
process.env.PI_CODING_AGENT_DIR = root;
delete process.env.PI_OFFLINE;
after(() => rm(root, { recursive: true, force: true }));
const { createAgentSession, DefaultResourceLoader, SessionManager, SettingsManager } = await import("@earendil-works/pi-coding-agent");
const { fauxAssistantMessage, fauxProvider } = await import("@earendil-works/pi-ai/providers/faux");
const ids = ["gpt-6-luna", "gpt-6.1-sol", "gpt-6-astra"];

async function fixture(t, { choice = ids[1], approve = true, current = ids[0], priorUser = false, ui = true, failure = false, missingTarget = false } = {}) {
  const provider = `advisor-${Math.random().toString(36).slice(2)}`;
  const faux = fauxProvider({ provider, api: `${provider}-api`, models: ids.filter((id) => !missingTarget || id !== choice).map((id) => ({ id })) });
  const requests = [];
  const settingsManager = SettingsManager.inMemory({ compaction: { enabled: false }, retry: { enabled: false } });
  const sessionManager = SessionManager.inMemory(root);
  if (priorUser) sessionManager.appendMessage({ role: "user", content: "Existing task", timestamp: Date.now() });
  const resourceLoader = new DefaultResourceLoader({
    cwd: root, agentDir: root, settingsManager,
    additionalExtensionPaths: [fileURLToPath(new URL("../../model-advisor.ts", import.meta.url))],
    extensionFactories: [{ name: "faux", factory: (pi) => pi.registerProvider(faux.provider) }],
    noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
    systemPrompt: "Complete the user's task.",
  });
  await resourceLoader.reload();
  assert.deepEqual(resourceLoader.getExtensions().errors, []);
  const { session } = await createAgentSession({ cwd: root, agentDir: root, settingsManager, sessionManager,
    resourceLoader, model: faux.getModel(current), thinkingLevel: "off" });
  t.after(() => session.dispose());
  await session.modelRuntime.setRuntimeApiKey(provider, "faux-test-key");
  const classifications = [];
  t.mock.method(session.modelRuntime, "classify", async (model, context, options) => {
    classifications.push({ model, context, options });
    if (failure) return { stopReason: "error", errorMessage: "Classifier network failure", answers: {} };
    return { stopReason: "stop", answers: { model: { type: "choice", choice, probabilities: { [choice]: 1 }, confidence: 1 } } };
  });
  const confirmations = [];
  const notices = [];
  const errors = [];
  await session.bindExtensions({ mode: ui ? "tui" : "print", onError: (error) => errors.push(error),
    ...(ui ? { uiContext: {
      confirm: async (...args) => { confirmations.push(args); return approve; },
      notify: (...args) => notices.push(args),
    } } : {}),
  });
  const reply = (_context, options) => { requests.push(options.model.id); return fauxAssistantMessage("Task complete."); };
  faux.setResponses([reply, reply]);
  return { session, sessionManager, classifications, confirmations, notices, requests, errors };
}

test("first prompt uses the approved recommendation before its first provider request; later prompts and rebinding skip advice", async (t) => {
  const f = await fixture(t);
  await f.session.prompt("Debug a bounded but difficult concurrency defect.");
  assert.equal(f.classifications.length, 1);
  assert.equal(f.classifications[0].model.id, "jev-latest");
  assert.equal(f.classifications[0].model.provider, "typesafe");
  assert.equal(f.classifications[0].context.state.task, "Debug a bounded but difficult concurrency defect.");
  assert.deepEqual(Object.keys(f.classifications[0].context.questions.model.criteria), ids);
  assert.equal(f.confirmations.length, 1);
  assert.match(f.confirmations[0][1], /Current: gpt-6-luna\nRecommended: gpt-6.1-sol/);
  assert.deepEqual(f.requests, [ids[1]]);
  await f.session.bindExtensions({ mode: "tui", uiContext: { confirm: async () => assert.fail("Unexpected second confirmation") } });
  await f.session.prompt("Continue with the next task.");
  assert.equal(f.classifications.length, 1);
  assert.deepEqual(f.requests, [ids[1], ids[1]]);
  assert.equal(f.sessionManager.getEntries().filter((entry) => entry.type === "custom" && entry.customType === "pi-workbench-model-advice").length, 1);
  assert.deepEqual(f.errors, []);
});

for (const [name, options] of [
  ["declined recommendation", { approve: false, choice: ids[2] }],
  ["matching recommendation", { choice: ids[0] }],
  ["classifier failure", { failure: true }],
  ["missing target model", { missingTarget: true }],
]) {
  test(`${name} preserves the active model`, async (t) => {
    const f = await fixture(t, options);
    await f.session.prompt("Perform the first task.");
    assert.deepEqual(f.requests, [ids[0]]);
    assert.equal(f.classifications.length, 1);
    assert.equal(f.confirmations.length, options.approve === false ? 1 : 0);
    assert.equal(f.notices.length, options.failure || options.missingTarget ? 1 : 0);
    assert.deepEqual(f.errors, []);
  });
}

for (const [name, options] of [["resumed session", { priorUser: true }], ["headless session", { ui: false }]]) {
  test(`${name} skips classification and switching`, async (t) => {
    const f = await fixture(t, options);
    await f.session.prompt("Continue the task.");
    assert.equal(f.classifications.length, 0);
    assert.equal(f.confirmations.length, 0);
    assert.deepEqual(f.requests, [ids[0]]);
    assert.deepEqual(f.errors, []);
  });
}
