import assert from "node:assert/strict";
import test from "node:test";
import { validateToolArguments, getSystemMessageText } from "@earendil-works/pi-ai";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createAgentSession, createToolSearchExtension, DefaultResourceLoader, SessionManager, SettingsManager } from "@earendil-works/pi-coding-agent";
import { fauxProvider, fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai/providers/faux";
import { deploySkills } from "../../../scripts/deploy-skills.mjs";
import registerSkillSearch from "../../pi-default-workbench/skill-search.ts";
import {
  RESEARCH_DECISION_ENTRY_TYPE,
  RESEARCH_DECISION_MAX_CHARS,
  RESEARCH_DECISION_MESSAGE_TYPE,
  buildResearchDecisionSnapshot,
  normalizeResearchDecision,
  registerResearchDecision,
  researchDecisionsFromBranch,
} from "../research-decision.ts";

function decision(overrides = {}) {
  return {
    question: "Does treatment A reduce the measured response?",
    action: "Run a blinded, randomized follow-up",
    evidence: "Pilot mean decreased; variance and raw values are not available",
    evidenceOrigin: "Reported pilot summary inherited from project notes",
    interpretation: "The pilot is suggestive but does not isolate the treatment effect",
    alternatives: "Batch drift predicts a shift in both arms; measurement artifact predicts disagreement with an orthogonal assay",
    measurementChain: "Instrument calibration unknown; acquisition settings reported; analysis code unavailable",
    chainStatus: "partial",
    chainReason: "Calibration records and analysis code were not provided",
    discriminatingTest: "Repeat both randomized arms in each batch and validate a subset with an orthogonal assay",
    predictedOutcomes: "Treatment effect persists under both assays if causal; batch drift moves both arms together",
    switchCondition: "Do not scale up if the batch-adjusted estimate reverses or the orthogonal assay disagrees",
    reversibility: "partly_reversible",
    ...overrides,
  };
}

test("normalizes scientific checkpoints and redacts credential-shaped values", () => {
  assert.deepEqual(normalizeResearchDecision(decision({ evidence: "API key=secret-value appeared in a log" })),
    decision({ evidence: "[redacted] appeared in a log" }));
  assert.equal(normalizeResearchDecision(decision({ chainStatus: "unknown" })), undefined);
  assert.equal(normalizeResearchDecision(decision({ evidence: "  " })), undefined);
  assert.equal(normalizeResearchDecision(decision({ evidence: "x".repeat(800) })), undefined);
});

test("restores only bounded research entries from the session branch", () => {
  const entries = [
    { type: "custom", customType: RESEARCH_DECISION_ENTRY_TYPE, data: decision({ question: "old" }) },
    { type: "message", message: { role: "user", content: "unrelated" } },
    ...Array.from({ length: 6 }, (_, index) => ({
      type: "custom", customType: RESEARCH_DECISION_ENTRY_TYPE, data: decision({ question: `question ${index}` }),
    })),
  ];
  assert.deepEqual(researchDecisionsFromBranch(entries).map(({ question }) => question), [
    "question 2", "question 3", "question 4", "question 5",
  ]);
});

test("builds bounded context while retaining evidence origin, chain status, and switch condition", () => {
  const snapshot = buildResearchDecisionSnapshot([
    decision(),
    ...Array.from({ length: 4 }, (_, index) => decision({ question: `Older question ${index}` })),
  ]);
  assert.ok(snapshot);
  assert.ok(snapshot.length <= RESEARCH_DECISION_MAX_CHARS);
  assert.match(snapshot, /Reported pilot summary inherited from project notes/);
  assert.match(snapshot, /Measurement chain: partial/);
  assert.match(snapshot, /Do not scale up if the batch-adjusted estimate reverses/);
  assert.match(snapshot, /Agent-recorded evidence and interpretations/);
});

test("keeps the newest decision when the snapshot budget is tight", () => {
  const snapshot = buildResearchDecisionSnapshot([
    decision({ question: "Older decision" }),
    decision({ question: "Latest decision" }),
  ], 1800);
  assert.ok(snapshot);
  assert.match(snapshot, /Latest decision/);
  assert.doesNotMatch(snapshot, /Older decision/);
});

test("registered tool records normalized session data and refreshes its hidden snapshot", async () => {
  const handlers = new Map();
  const tools = new Map();
  const entries = [];
  const pi = {
    appendEntry(type, data) { entries.push({ type: "custom", customType: type, data }); },
    registerTool(tool) { tools.set(tool.name, tool); },
    on(name, handler) { handlers.set(name, handler); },
  };
  registerResearchDecision(pi);

  const tool = tools.get("research_decision");
  assert.ok(tool);
  assert.equal(tool.parameters.additionalProperties, false);
  const valid = decision();
  assert.deepEqual(validateToolArguments(tool, { id: "research-check", name: tool.name, arguments: valid }), valid);
  assert.throws(() => validateToolArguments(tool, {
    id: "research-check", name: tool.name, arguments: { ...valid, autoConclude: true },
  }));
  const input = decision({ evidence: "Token=do-not-store-this" });
  await tool.execute("call-1", input, undefined, undefined, {});
  assert.equal(entries.length, 1);
  assert.equal(entries[0].customType, RESEARCH_DECISION_ENTRY_TYPE);
  assert.equal(entries[0].data.evidence, "[redacted]");
  assert.equal(tool.name, "research_decision");

  const context = handlers.get("context");
  const result = await context({ messages: [
    { role: "user", content: "Continue" },
    { role: "custom", customType: RESEARCH_DECISION_MESSAGE_TYPE, content: "stale", display: false, timestamp: 1 },
  ] }, { sessionManager: { getBranch: () => entries } });
  const records = result.messages.filter((message) => message.customType === RESEARCH_DECISION_MESSAGE_TYPE);
  assert.equal(records.length, 1);
  assert.equal(records[0].display, false);
  assert.match(records[0].content, /origin:/);
  assert.match(records[0].content, /Agent-recorded evidence and interpretations/);
  const clean = { role: "user", content: "Routine question" };
  assert.equal(await context({ messages: [clean] }, { sessionManager: { getBranch: () => [] } }), undefined);
  const switched = await context({ messages: [clean, ...records] }, { sessionManager: { getBranch: () => [] } });
  assert.deepEqual(switched.messages, [clean]);
  for (const patch of [{ evidence: " " }, { evidence: "x".repeat(421) }, { chainStatus: "unknown" }, { autoConclude: true }]) {
    const invalid = { ...valid, ...patch };
    assert.throws(() => validateToolArguments(tool, { id: "invalid", name: tool.name, arguments: invalid }));
    await assert.rejects(tool.execute("invalid", invalid), /Invalid research decision/);
  }
  assert.equal(entries.length, 1, "invalid records must not be persisted");
});

test("snapshot preserves maximum-length fields and decision conditions in full", () => {
  const full = decision();
  for (const key of Object.keys(full).filter(key => !["chainStatus", "reversibility"].includes(key))) {
    const condition = " Do not scale up unless the independent assay agrees";
    full[key] = `${key}: `.padEnd(420 - condition.length, "x") + condition;
  }
  assert.ok(normalizeResearchDecision(full));
  const snapshot = buildResearchDecisionSnapshot([decision(), full]);
  assert.ok(snapshot.length <= RESEARCH_DECISION_MAX_CHARS);
  for (const value of Object.values(full)) assert.ok(snapshot.includes(value), value);
});

test("Pi discovers the deployed skill and deferred tool, persists records, and restores only the active branch after compaction", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "research-session-"));
  const agentDir = join(cwd, "agent");
  await mkdir(agentDir);
  const repoDir = fileURLToPath(new URL("../../../", import.meta.url));
  await deploySkills({ repoDir, agentDir, only: ["research-decision"], log: () => {} });
  const faux = fauxProvider({ provider: "research-test", api: "research-test-api", models: [{ id: "fixture" }] });
  const requests = [];
  const capture = context => {
    requests.push(structuredClone(context));
    return fauxAssistantMessage("fixture reply");
  };
  const call = (name, args) => context => {
    requests.push(structuredClone(context));
    return fauxAssistantMessage(fauxToolCall(name, args), { stopReason: "toolUse" });
  };
  const input = decision({ evidence: "Independent pilot assay: mean = 3.2 mV; n = 8.", evidenceOrigin: "Direct inspection of pilot.csv rows 2–9" });
  faux.setResponses([
    capture,
    call("search_skill_bm25", { action: "search", query: "research-decision", limit: 1 }), capture,
    call("search_skill_bm25", { action: "load", name: "research-decision" }), capture,
    call("tool_search", { query: "research_decision", limit: 1 }),
    call("research_decision", input), capture,
    capture, capture,
  ]);
  const errors = [];
  let registeredTools;
  const open = async sessionManager => {
    const settingsManager = SettingsManager.inMemory({ defaultTools: ["+tool_search"], compaction: { enabled: false }, retry: { enabled: false } });
    const resourceLoader = new DefaultResourceLoader({
      cwd, agentDir, settingsManager,
      noExtensions: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
      extensionFactories: [
        { name: "research-decision", factory: registerResearchDecision },
        { name: "skill-search", factory: registerSkillSearch },
        createToolSearchExtension(),
        { name: "fixture-provider", factory: pi => { pi.registerProvider(faux.provider); registeredTools = () => pi.getAllTools(); } },
      ],
    });
    await resourceLoader.reload();
    assert.deepEqual(resourceLoader.getExtensions().errors, []);
    const found = resourceLoader.getSkills();
    assert.equal(found.skills.filter(skill => skill.name === "research-decision").length, 1);
    assert.equal(found.skills.find(skill => skill.name === "research-decision").filePath, join(agentDir, "skills/research-decision/SKILL.md"));
    assert.ok(!found.diagnostics.some(item => JSON.stringify(item).includes("research-decision")));
    const { session } = await createAgentSession({
      cwd, agentDir, model: faux.getModel(), thinkingLevel: "off", resourceLoader,
      settingsManager, sessionManager,
    });
    await session.bindExtensions({ onError: error => errors.push(error) });
    return session;
  };
  let session;
  try {
    const manager = SessionManager.create(cwd, join(cwd, "sessions"));
    session = await open(manager);
    assert.ok(!session.getActiveToolNames().includes("research_decision"));
    await session.prompt("Answer a routine question");
    const ordinaryLeaf = manager.getLeafId();
    assert.doesNotMatch(getSystemMessageText(requests[0].messages[0]), /Before a costly|Before costly|Decide from evidence/);
    assert.doesNotMatch(JSON.stringify(requests[0].messages), /<research-decision-context>/);
    await session.prompt("Find guidance for interpreting research results");
    const search = session.messages.find(message => message.toolName === "search_skill_bm25");
    assert.equal(search.details.skills[0].name, "research-decision");
    assert.doesNotMatch(JSON.stringify(search.content), /Decide from evidence/);
    await session.prompt("Load the discovered research skill");
    const loaded = session.messages.filter(message => message.toolName === "search_skill_bm25").at(-1);
    assert.match(JSON.stringify(loaded.content), /Decide from evidence/);
    await session.prompt("Find and record the decision checkpoint");
    assert.ok(session.getActiveToolNames().includes("research_decision"), JSON.stringify({ tools: registeredTools().map(({ name, exposure }) => ({ name, exposure })), results: session.messages.filter(message => message.toolName === "tool_search") }));
    const result = session.messages.find(message => message.toolName === "research_decision");
    assert.equal(result.isError, false);
    assert.deepEqual(result.details, input);
    const records = manager.getBranch().filter(entry => entry.customType === RESEARCH_DECISION_ENTRY_TYPE);
    assert.equal(records.length, 1);
    assert.deepEqual(records[0].data, input);

    // Persist a real compaction entry, then rebuild the session from its JSONL file.
    const keep = manager.appendMessage({ role: "user", content: "Continue after compaction", timestamp: Date.now() });
    manager.appendCompaction("Earlier messages summarized without the research record", keep, 8000);
    const sessionFile = manager.getSessionFile();
    session.dispose();
    session = undefined;
    const resumed = SessionManager.open(sessionFile);
    assert.doesNotMatch(JSON.stringify(resumed.buildSessionContext().messages), /Independent pilot assay/);
    session = await open(resumed);
    await session.prompt("Resume research");
    assert.ok(JSON.stringify(requests.at(-1).messages).includes(input.evidence));
    assert.ok(JSON.stringify(requests.at(-1).messages).includes(input.switchCondition));
    assert.ok(!session.messages.some(message => message.customType === RESEARCH_DECISION_MESSAGE_TYPE));
    session.dispose();
    session = undefined;

    resumed.branch(ordinaryLeaf);
    session = await open(resumed);
    await session.prompt("Continue the earlier ordinary branch");
    assert.doesNotMatch(JSON.stringify(requests.at(-1).messages), /<research-decision-context>|Independent pilot assay/);
    assert.deepEqual(errors, []);
  } finally {
    session?.dispose();
    await rm(cwd, { recursive: true, force: true });
  }
});
