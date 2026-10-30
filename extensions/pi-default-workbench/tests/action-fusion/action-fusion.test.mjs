/*
 * SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
 * SPDX-License-Identifier: MIT
 * Behavior cases adapted from SoL-Pi's action-fusion tests for node:test.
 */
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import registerWorkbench from "../../index.ts";
import { createActionFusionExtension } from "../../action-fusion/index.ts";
import { assertUnchangedBeforeCommand } from "../../action-fusion/then-run.ts";

const root = await mkdtemp(join(tmpdir(), "workbench-then-run-"));
process.env.PI_CODING_AGENT_DIR = root;
process.env.PI_OFFLINE = "1";
process.env.PI_WORKBENCH_NO_EMBEDDING = "1";
after(() => rm(root, { recursive: true, force: true }));

function tools(options = {}) {
  const registered = new Map();
  createActionFusionExtension(options)({ registerTool: (tool) => registered.set(tool.name, tool) });
  return Object.fromEntries(registered);
}

async function fixture(t, options) {
  const cwd = await mkdtemp(join(root, "case-"));
  return { ...tools(options), cwd, ctx: {
    cwd, mode: "json", hasUI: false,
    sessionManager: { getSessionId: () => "workbench-then-run-test", getSessionFile: () => undefined },
  } };
}

const text = (result) => result.content.filter((block) => block.type === "text").map((block) => block.text).join("\n");
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};

test("plain edit/write keep their native parameters and skip bash", async (t) => {
  let calls = 0;
  const { edit, write, cwd, ctx } = await fixture(t, {
    bashOptions: { operations: { exec: async () => { calls++; return { exitCode: 0 }; } } },
  });
  for (const tool of [edit, write]) {
    assert.equal(tool.parameters.properties.then_run.type, "object");
    assert.deepEqual(tool.parameters.properties.then_run.required, ["command"]);
    assert.equal(tool.parameters.required.includes("then_run"), false);
    assert.equal(tool.parameters.properties.then_run.properties.timeout.type, "number");
  }
  assert.ok(edit.parameters.properties.edits);
  assert.ok(write.parameters.properties.content);
  await write.execute("plain-write", { path: "target.txt", content: "before\n" }, undefined, undefined, ctx);
  const result = await edit.execute("plain-edit", {
    path: "target.txt", edits: [{ oldText: "before", newText: "after" }],
  }, undefined, undefined, ctx);
  assert.equal(await readFile(join(cwd, "target.txt"), "utf8"), "after\n");
  assert.equal(calls, 0);
  assert.doesNotMatch(text(result), /\[then_run:/);
});

test("write and edit complete before the command and forward timeout and cancellation", async (t) => {
  let expected = "before\n";
  const abort = new AbortController();
  const commands = [];
  let cwd;
  const fixtureValue = await fixture(t, { bashOptions: { operations: {
    exec: async (command, commandCwd, { timeout, signal, onData }) => {
      assert.equal(commandCwd, cwd);
      assert.equal(await readFile(join(cwd, "target.txt"), "utf8"), expected);
      assert.equal(timeout, 12);
      assert.equal(signal, abort.signal);
      commands.push(command);
      onData(Buffer.from("check passed\n"));
      return { exitCode: 0 };
    },
  } } });
  cwd = fixtureValue.cwd;
  const { write, edit, ctx } = fixtureValue;
  const first = await write.execute("write", {
    path: "target.txt", content: expected, then_run: { command: "check write", timeout: 12 },
  }, abort.signal, undefined, ctx);
  expected = "after\n";
  const second = await edit.execute("edit", {
    path: "target.txt", edits: [{ oldText: "before", newText: "after" }],
    then_run: { command: "check edit", timeout: 12 },
  }, abort.signal, undefined, ctx);
  assert.deepEqual(commands, ["check write", "check edit"]);
  for (const result of [first, second]) assert.match(text(result), /\[then_run:succeeded\]\ncheck passed/);
});

test("a failed follow-up reports the failure and preserves the mutation", async (t) => {
  const { write, cwd, ctx } = await fixture(t, { bashOptions: { operations: {
    exec: async (_command, _cwd, { onData }) => { onData(Buffer.from("validation failed\n")); return { exitCode: 7 }; },
  } } });
  await assert.rejects(write.execute("failure", {
    path: "target.txt", content: "keep me\n", then_run: { command: "check" },
  }, undefined, undefined, ctx), /\[then_run:failed\][\s\S]*validation failed/);
  assert.equal(await readFile(join(cwd, "target.txt"), "utf8"), "keep me\n");
});

test("a failed mutation skips its command", async (t) => {
  let calls = 0;
  const { edit, ctx } = await fixture(t, { bashOptions: { operations: {
    exec: async () => { calls++; return { exitCode: 0 }; },
  } } });
  await assert.rejects(edit.execute("missing", {
    path: "missing.txt", edits: [{ oldText: "before", newText: "after" }], then_run: { command: "must not run" },
  }, undefined, undefined, ctx), /\[then_run:skipped\]/);
  assert.equal(calls, 0);
});

test("the same file stays queued until its follow-up command ends", async (t) => {
  const started = deferred(), finish = deferred();
  const events = [];
  const { write, ctx } = await fixture(t, {
    writeOptions: { operations: {
      mkdir: async () => {},
      writeFile: async (path, content) => { events.push(content); await writeFile(path, content); },
    } },
    bashOptions: { operations: { exec: async () => {
      events.push("command started");
      started.resolve();
      await finish.promise;
      events.push("command ended");
      return { exitCode: 0 };
    } } },
  });
  const first = write.execute("first", { path: "target.txt", content: "first", then_run: { command: "wait" } }, undefined, undefined, ctx);
  await started.promise;
  const second = write.execute("second", { path: "./target.txt", content: "second" }, undefined, undefined, ctx);
  try {
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.deepEqual(events, ["first", "command started"]);
  } finally {
    finish.resolve();
    await Promise.all([first, second]);
  }
  assert.deepEqual(events, ["first", "command started", "command ended", "second"]);
});

test("external changes between mutation and command reject the follow-up", async (t) => {
  const { cwd } = await fixture(t);
  const path = join(cwd, "target.txt");
  await writeFile(path, "mutation\n");
  await assert.rejects(assertUnchangedBeforeCommand(path, () => writeFile(path, "external change\n")),
    /\[then_run:skipped\] target content changed/);
});

test("workbench executes then_run in a real session without a SoL-Pi extension", { timeout: 20_000 }, async (t) => {
  const { createAgentSession, DefaultResourceLoader, SessionManager, SettingsManager } = await import("@earendil-works/pi-coding-agent");
  const { fauxAssistantMessage, fauxProvider, fauxToolCall } = await import("@earendil-works/pi-ai/providers/faux");
  const cwd = await mkdtemp(join(root, "session-"));
  const faux = fauxProvider({ provider: "workbench-fusion-test", api: "workbench-fusion-test-api" });
  const settingsManager = SettingsManager.inMemory({ compaction: { enabled: false }, retry: { enabled: false } });
  const registrations = [];
  const resourceLoader = new DefaultResourceLoader({
    cwd, agentDir: root, settingsManager,
    extensionFactories: [{ name: "workbench-fusion-test", factory: (pi) => {
      pi.registerProvider(faux.provider);
      const facade = Object.create(pi);
      facade.registerTool = (tool) => { registrations.push(tool.name); pi.registerTool(tool); };
      registerWorkbench(facade);
    } }],
    noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
    systemPrompt: "Verify file mutations and follow-up commands.",
  });
  await resourceLoader.reload();
  assert.deepEqual(resourceLoader.getExtensions().errors, []);
  const sessionManager = SessionManager.inMemory(cwd);
  const { session } = await createAgentSession({ cwd, agentDir: root, settingsManager, sessionManager, resourceLoader,
    model: faux.getModel(), thinkingLevel: "off" });
  t.after(() => session.dispose());
  const errors = [];
  await session.bindExtensions({ onError: (error) => errors.push(error) });
  faux.setResponses([
    fauxAssistantMessage(fauxToolCall("write", { path: "target.txt", content: "first\n",
      then_run: { command: "grep -qx first target.txt && printf 'write verified\\n'" } }), { stopReason: "toolUse" }),
    fauxAssistantMessage(fauxToolCall("edit", { path: "target.txt", edits: [{ oldText: "first", newText: "second" }],
      then_run: { command: "grep -qx second target.txt && printf 'edit verified\\n'" } }), { stopReason: "toolUse" }),
    fauxAssistantMessage(fauxToolCall("edit", { path: "target.txt", edits: [{ oldText: "second", newText: "retained" }],
      then_run: { command: "printf 'failed verification\\n'; exit 7" } }), { stopReason: "toolUse" }),
    fauxAssistantMessage("Verified."),
  ]);
  await session.prompt("Write, edit and verify the file.");
  const results = sessionManager.getBranch().flatMap((entry) => entry.type === "message" && entry.message.role === "toolResult" ? [entry.message] : []);
  assert.deepEqual(results.map((result) => result.isError), [false, false, true]);
  assert.match(text(results[0]), /\[then_run:succeeded\][\s\S]*write verified/);
  assert.match(text(results[1]), /\[then_run:succeeded\][\s\S]*edit verified/);
  assert.match(text(results[2]), /\[then_run:failed\][\s\S]*failed verification/);
  assert.equal(await readFile(join(cwd, "target.txt"), "utf8"), "retained\n");
  assert.equal(registrations.filter((name) => name === "edit").length, 1);
  assert.equal(registrations.filter((name) => name === "write").length, 1);
  assert.equal(registrations.includes("obs_recall"), false);
  assert.equal(session.getLastAssistantText(), "Verified.");
  assert.deepEqual(errors, []);
});
