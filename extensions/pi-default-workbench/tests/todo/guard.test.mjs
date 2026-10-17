import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import todoGuard from "../../todo/guard.ts";

const root = await mkdtemp(join(tmpdir(), "pi-plan-reminder-"));
process.env.PI_CODING_AGENT_DIR = root;
process.env.PI_OFFLINE = "1";
after(() => rm(root, { recursive: true, force: true }));
const { createAgentSession, DefaultResourceLoader, SessionManager, SettingsManager } = await import("@earendil-works/pi-coding-agent");
const { fauxAssistantMessage, fauxProvider } = await import("@earendil-works/pi-ai/providers/faux");
const open = [{ id: "verify", goal: "Verify the result", status: "in_progress" }];
const done = [{ ...open[0], status: "completed" }];
const state = (plan) => ({ type: "custom", customType: "sol-pi-online-context-state-v1", data: { plan } });
const result = (steps, isError = false) => ({
  type: "message", message: { role: "toolResult", toolName: "update_plan", isError,
    content: [{ type: "text", text: `<sol-pi-plan task_status="active">${JSON.stringify({ steps })}</sol-pi-plan>` }] },
});

function fixture(branch) {
  let handler;
  const notices = [];
  todoGuard({ on: (name, fn) => { assert.equal(name, "agent_before_settle"); handler = fn; } });
  const ctx = { sessionManager: { getBranch: () => branch }, hasPendingMessages: () => false,
    hasUI: true, ui: { notify: (...args) => notices.push(args) } };
  const event = { entries: [], continue: false, outcome: "completed", context: { canContinue: true } };
  return { run: (overrides = {}, context = {}) => handler({ ...event, ...overrides }, { ...ctx, ...context }), notices };
}

test("restores nested-call plan state and direct tool snapshots; completed plan replaces old Todo", () => {
  const todo = { type: "message", message: { role: "toolResult", toolName: "todo",
    details: { tasks: [{ id: 1, subject: "stale Todo", status: "pending" }] } } };
  for (const entry of [state(open), result(open)]) {
    const branch = [todo, entry];
    const guard = fixture(branch);
    const reminder = guard.run();
    assert.equal(reminder.continue, true);
    assert.match(reminder.entries.at(-1).content, /#verify \[in_progress\]/);
    assert.doesNotMatch(reminder.entries.at(-1).content, /stale Todo/);
    branch.push(result(done, true));
    assert.equal(guard.run().continue, true, "failed updates preserve the open plan");
    branch.push(state(done));
    assert.equal(guard.run(), undefined);
  }
  assert.equal(fixture([todo]).run().continue, true, "legacy Todo still receives reminders");
});

test("preserves boundary drafts and skips aborted, failed, pending, or already continuing runs", () => {
  const guard = fixture([state(open)]);
  const draft = { type: "custom", customType: "another-extension" };
  assert.deepEqual(guard.run({ entries: [draft] }).entries[0], draft);
  for (const overrides of [{ outcome: "aborted" }, { outcome: "error" }, { continue: true }]) {
    assert.equal(guard.run(overrides), undefined);
  }
  assert.equal(guard.run({}, { hasPendingMessages: () => true }), undefined);
  assert.equal(guard.run({ context: { canContinue: false } }).continue, true, "the reminder supplies new continuation context");
});

test("caps automatic continuations at three and resets the budget on a new user request", () => {
  const branch = [state(open)];
  const guard = fixture(branch);
  for (let i = 0; i < 3; i++) branch.push(...guard.run().entries);
  assert.equal(guard.run(), undefined);
  assert.match(guard.notices[0][0], /3 automatic continuations/);
  branch.push({ type: "message", message: { role: "user", content: "Continue" } });
  assert.equal(guard.run().continue, true);
});

test("real AgentSession continues unfinished work once and stops after plan completion", { timeout: 15_000 }, async (t) => {
  const faux = fauxProvider({ provider: "reminder-test", api: "reminder-test-api" });
  const requests = [];
  const settingsManager = SettingsManager.inMemory({ compaction: { enabled: false }, retry: { enabled: false } });
  const sessionManager = SessionManager.inMemory(root);
  sessionManager.appendCustomEntry(state(open).customType, { plan: open });
  const resourceLoader = new DefaultResourceLoader({
    cwd: root, agentDir: root, settingsManager,
    extensionFactories: [{ name: "plan-reminder-test", factory: (pi) => {
      pi.registerProvider(faux.provider);
      todoGuard(pi);
    } }],
    noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
    systemPrompt: "Complete the current plan.",
  });
  await resourceLoader.reload();
  const { session } = await createAgentSession({ cwd: root, agentDir: root, settingsManager, sessionManager,
    resourceLoader, model: faux.getModel(), thinkingLevel: "off" });
  t.after(() => session.dispose());
  const errors = [];
  await session.bindExtensions({ onError: (error) => errors.push(error) });
  faux.setResponses([
    (context) => { requests.push(context); return fauxAssistantMessage("Status only."); },
    (context) => {
      requests.push(context);
      sessionManager.appendCustomEntry(state(done).customType, { plan: done });
      return fauxAssistantMessage("Verification complete.");
    },
  ]);
  await session.prompt("Continue the authorized work.");
  assert.equal(requests.length, 2);
  assert.match(JSON.stringify(requests[1].messages), /Plan reminder: unfinished work remains/);
  assert.equal(sessionManager.getBranch().filter((entry) => entry.type === "custom" && entry.customType === "pi-todo-guard-follow-up").length, 1);
  assert.deepEqual(errors, []);
});
