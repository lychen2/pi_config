import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createAgentSession, DefaultResourceLoader, SessionManager, SettingsManager } from "@earendil-works/pi-coding-agent";
import { getSystemMessageText } from "@earendil-works/pi-ai";
import { fauxProvider, fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai/providers/faux";

const section = "<gpt-with-taste>";
const userSteer = "<gpt-with-taste-user-steer>";
const agentSteer = "<gpt-with-taste-agent-steer>";
const text = context => JSON.stringify(context.messages);

// Exercise the installed entry through Pi's resource loader, then inspect what
// the provider receives. No remote model or credentials are used.
test("shared taste survives model switches, routes input/completion hooks, and respects branch controls", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "taste-session-"));
  const agentDir = join(cwd, "agent");
  await mkdir(agentDir);
  const faux = fauxProvider({
    provider: "taste-test-manager",
    api: "taste-test-api",
    models: [{ id: "gpt-fixture" }, { id: "claude-fixture" }, { id: "gemini-fixture" }],
  });
  const requests = [];
  const capture = context => {
    requests.push(structuredClone(context));
    return fauxAssistantMessage("fixture reply");
  };
  faux.setResponses([
    context => {
      requests.push(structuredClone(context));
      return fauxAssistantMessage(fauxToolCall("taste_probe", {}, { id: "probe" }), { stopReason: "toolUse" });
    },
    capture, capture, capture, capture, capture, capture, capture, capture,
  ]);
  const settingsManager = SettingsManager.inMemory({ compaction: { enabled: false }, retry: { enabled: false } });
  const resourceLoader = new DefaultResourceLoader({
    cwd, agentDir, settingsManager,
    additionalExtensionPaths: [fileURLToPath(new URL("../taste.ts", import.meta.url))],
    extensionFactories: [{ name: "taste-fixture-provider", factory: pi => {
      pi.registerProvider(faux.provider);
      pi.on("before_agent_start", event => ({ systemPrompt: `${event.systemPrompt}\n\nEXISTING MODEL PRESET` }));
      pi.registerTool({
        name: "taste_probe", label: "probe", description: "Fixture tool", parameters: { type: "object", properties: {} },
        execute: async () => ({ content: [{ type: "text", text: "probe complete" }] }),
      });
    } }],
    noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
  });
  await resourceLoader.reload();
  assert.deepEqual(resourceLoader.getExtensions().errors, []);
  const sessionManager = SessionManager.inMemory(cwd);
  const { session } = await createAgentSession({
    cwd, agentDir, model: faux.getModel(), thinkingLevel: "off", tools: ["taste_probe"],
    resourceLoader, settingsManager, sessionManager,
  });
  const errors = [];
  await session.bindExtensions({ onError: error => errors.push(error) });
  try {
    await session.prompt("first input");
    assert.ok(text(requests[0]).includes(userSteer));
    assert.ok(!text(requests[1]).includes(userSteer), "tool continuation does not repeat input steering");
    for (const model of ["claude-fixture", "gemini-fixture"]) {
      await session.setModel(faux.getModel(model));
      await session.prompt(`${model} input`);
    }
    for (const request of requests) {
      const system = getSystemMessageText(request.messages[0]);
      assert.equal(system.split(section).length - 1, 1);
      assert.ok(system.includes("EXISTING MODEL PRESET"));
      assert.ok(request.messages[0].toolsAdded?.some(tool => tool.name === "taste_probe"), "native tool declarations are preserved");
    }
    assert.ok(text(requests[2]).includes(userSteer));
    assert.ok(text(requests[3]).includes(userSteer));
    assert.ok(!session.messages.some(message => message.customType === "gpt-with-taste:steer"), "steers stay request-local");

    await session.sendCustomMessage({ customType: "teammate-complete", content: "RESULT TO PRESERVE", display: true });
    await session.prompt("integrate the completed result");
    assert.ok(text(requests.at(-1)).includes(agentSteer));
    assert.ok(text(requests.at(-1)).includes("RESULT TO PRESERVE"));
    await session.sendCustomMessage({ customType: "teammate-progress", content: "still running", display: true });
    await session.prompt("inspect progress");
    assert.ok(!text(requests.at(-1)).includes(agentSteer));

    await session.prompt("/taste steer off");
    await session.prompt("without steering");
    assert.ok(text(requests.at(-1)).includes(section));
    assert.ok(!text(requests.at(-1)).includes(userSteer));
    await session.prompt("/taste off");
    await session.prompt("disabled");
    assert.ok(!text(requests.at(-1)).includes(section));
    await session.prompt("/taste reset");
    await session.prompt("enabled again");
    assert.ok(text(requests.at(-1)).includes(section));
    assert.ok(text(requests.at(-1)).includes(userSteer));
    assert.deepEqual(errors, []);

    // Use Pi's actual request runner to check the OpenAI final-payload guard.
    await session.setModel({ ...faux.getModel(), api: "openai-responses" });
    const payload = { model: "gpt-fixture", instructions: "HOST PERMISSIONS", input: [{ role: "user", content: "hello" }], tools: [{ name: "probe" }] };
    const snapshot = structuredClone(payload);
    const guarded = await session.extensionRunner.emitBeforeProviderRequest(payload);
    assert.ok(guarded.instructions.includes(section));
    assert.ok(guarded.instructions.includes("HOST PERMISSIONS"));
    assert.deepEqual(guarded.tools, payload.tools);
    assert.deepEqual(payload, snapshot);
    assert.equal(await session.extensionRunner.emitBeforeProviderRequest(guarded), guarded);
    await session.setModel({ ...faux.getModel("claude-fixture"), api: "anthropic-messages" });
    const anthropicPayload = { system: "HOST", messages: [] };
    assert.equal(await session.extensionRunner.emitBeforeProviderRequest(anthropicPayload), anthropicPayload);
  } finally {
    session.dispose();
  }
});
