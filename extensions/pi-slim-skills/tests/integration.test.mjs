import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdir, mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = await mkdtemp(join(tmpdir(), "pi-slim-integration-"));
process.env.PI_CODING_AGENT_DIR = root;
process.env.PI_WORKBENCH_NO_EMBEDDING = "1";
process.env.PI_OFFLINE = "1";
after(() => rm(root, { recursive: true, force: true }));
const { createAgentSession, DefaultResourceLoader, SessionManager, SettingsManager } = await import("@earendil-works/pi-coding-agent");
const { getCurrentSystemPrompt } = await import("@earendil-works/pi-ai");
const { fauxAssistantMessage, fauxProvider, fauxToolCall } = await import("@earendil-works/pi-ai/providers/faux");

for (const forced of [false, true]) {
  test(`real requests compact ${forced ? "overridden" : "structured"} prompts and preserve skill access`, { timeout: 30_000 }, async (t) => {
    await writeFile(join(root, "slim-skills-whitelist.json"), JSON.stringify({ mode: "allowlist", whitelist: [], inject: [] }));
    const cwd = join(root, forced ? "override" : "structured");
    await mkdir(cwd);
    const paths = [];
    for (const [name, description, manual] of [
      ["alpha", "Alpha migration review", false],
      ["beta", "Beta scientific figure design", false],
      ["manual", "Manual-only workflow", true],
    ]) {
      const filePath = join(cwd, `${name}.md`);
      await writeFile(filePath, `---\nname: ${name}\ndescription: ${description}\ndisable-model-invocation: ${manual}\n---\nINSTRUCTIONS FOR ${name}\n`);
      paths.push(filePath);
    }
    const overridePath = join(cwd, "prompt-override.ts");
    await writeFile(overridePath, `export default function (pi) {
      pi.on("before_agent_start", (event) => {
        if (event.prompt === "Verify injection.") event.systemPromptOptions.appendSystemPrompt += "\\n\\nINSTRUCTIONS FOR beta";
        if (${forced}) return { systemPrompt: "PREFIX\\n" + event.systemPrompt + "\\nSUFFIX" };
      });
    }`);
    const faux = fauxProvider({ provider: `slim-${forced}`, api: `slim-${forced}-api` });
    const requests = [];
    const reply = (...content) => (context) => {
      requests.push({ prompt: getCurrentSystemPrompt(context.messages), messages: structuredClone(context.messages) });
      return fauxAssistantMessage(...content);
    };
    faux.setResponses([
      reply(fauxToolCall("search_skill_bm25", { action: "search", query: "Alpha migration review", limit: 1 }), { stopReason: "toolUse" }),
      reply(fauxToolCall("search_skill_bm25", { action: "load", name: "alpha" }), { stopReason: "toolUse" }),
      reply("guidance loaded"),
      reply("fallback inspected"),
      reply("injection inspected"),
      reply("manual command inspected"),
    ]);
    const settingsManager = SettingsManager.inMemory({
      compaction: { enabled: false }, retry: { enabled: false },
    }, { projectTrusted: true });
    const resourceLoader = new DefaultResourceLoader({
      cwd, agentDir: root, settingsManager,
      additionalSkillPaths: paths,
      additionalExtensionPaths: [
        overridePath,
        fileURLToPath(new URL("../index.ts", import.meta.url)),
        fileURLToPath(new URL("../../pi-default-workbench/skill-search.ts", import.meta.url)),
      ],
      extensionFactories: [{ name: "faux", factory: (pi) => pi.registerProvider(faux.provider) }],
      noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
      systemPrompt: "Preserve this custom preamble.",
      appendSystemPrompt: ["Preserve these user instructions."],
    });
    await resourceLoader.reload();
    assert.deepEqual(resourceLoader.getExtensions().errors, []);
    const { session } = await createAgentSession({
      cwd, agentDir: root, settingsManager, resourceLoader,
      sessionManager: SessionManager.inMemory(cwd), model: faux.getModel(), thinkingLevel: "off",
    });
    t.after(() => session.dispose());
    const errors = [];
    await session.bindExtensions({ onError: (error) => errors.push(error) });
    await session.prompt("Find and load migration guidance.", { expandPromptTemplates: false });
    assert.equal(requests.length, 3);
    const first = requests[0];
    assert.match(first.prompt, /search_skill_bm25/);
    assert.doesNotMatch(first.prompt, /<available_skills>|Alpha migration review|INSTRUCTIONS FOR/);
    assert.match(first.prompt, /Preserve this custom preamble/);
    assert.match(first.prompt, /Preserve these user instructions/);
    assert.equal(resourceLoader.getSkills().skills.length, 3);
    if (forced) {
      assert.match(first.prompt, /^PREFIX\n/);
      assert.match(first.prompt, /\nSUFFIX$/);
    } else {
      const system = first.messages.find((message) => message.role === "system");
      assert.match(system.sections.skills, /search_skill_bm25/);
      assert.equal(system.content, "", "keep Pi's independently updatable prompt sections");
    }
    const toolText = (request) => request.messages.filter((message) => message.role === "toolResult")
      .flatMap((message) => message.content.filter((block) => block.type === "text").map((block) => block.text)).join("\n");
    assert.match(toolText(requests[1]), /Alpha migration review/);
    assert.doesNotMatch(toolText(requests[1]), /INSTRUCTIONS FOR/);
    assert.match(toolText(requests[2]), /INSTRUCTIONS FOR alpha/);
    assert.ok(toolText(requests[2]).includes(paths[0]));

    session.setActiveToolsByName(session.getActiveToolNames().filter((name) => name !== "search_skill_bm25"));
    await session.prompt("Inspect the fallback skill index.", { expandPromptTemplates: false });
    const fallback = requests.at(-1).prompt;
    assert.match(fallback, /Alpha migration review/);
    assert.ok(fallback.includes(paths[0]));
    assert.match(fallback, /Beta scientific figure design/);
    assert.doesNotMatch(fallback, /Manual-only workflow|search_skill_bm25|<available_skills>/);

    await session.prompt("/slim-skills inject alpha");
    await session.prompt("/slim-skills inject beta");
    await session.prompt("Verify injection.", { expandPromptTemplates: false });
    const injected = requests.at(-1).prompt;
    assert.equal(injected.split("INSTRUCTIONS FOR alpha").length - 1, 1);
    assert.equal(injected.split("INSTRUCTIONS FOR beta").length - 1, 1);
    assert.doesNotMatch(injected, /INSTRUCTIONS FOR manual/);
    if (!forced) assert.match(injected, /<slim_skill_bodies>/);

    await session.prompt("/skill:manual");
    const manual = requests.at(-1).messages.findLast((message) => message.role === "user");
    assert.match(JSON.stringify(manual.content), /INSTRUCTIONS FOR manual/);
    assert.deepEqual(errors, []);
  });
}
