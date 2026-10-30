import type { ExtensionAPI, SessionEntry } from "@earendil-works/pi-coding-agent";
import { Type, type Static } from "typebox";
import { Check } from "typebox/value";

export const RESEARCH_DECISION_ENTRY_TYPE = "pi-research-decision";
export const RESEARCH_DECISION_MESSAGE_TYPE = "pi-research-decision-context";
export const RESEARCH_DECISION_MAX_CHARS = 6000;
const MAX_DECISIONS = 4;
const text = (description: string) => Type.String({ minLength: 1, maxLength: 420, pattern: "\\S", description });

const RESEARCH_DECISION_PARAMETERS = Type.Object({
  question: text("The scientific question this record informs."),
  action: text("The decision or action being considered."),
  evidence: text("Direct observations and available evidence; mark missing evidence explicitly."),
  evidenceOrigin: text("Sources for key evidence: direct observation, cited report, inherited project note, or inference. Include source references."),
  interpretation: text("Current interpretation, kept distinct from observations."),
  alternatives: text("Plausible alternative explanations and what evidence distinguishes them."),
  measurementChain: text("Relevant source/instrument, controls, acquisition, transformations, units/range, and analysis; state which links were checked."),
  chainStatus: Type.Union([
    Type.Literal("checked"), Type.Literal("partial"), Type.Literal("not_applicable"), Type.Literal("not_checked"),
  ], { description: "Status of the relevant measurement-chain review." }),
  chainReason: text("Evidence for the review status, missing links, or why a check cannot or does not apply."),
  discriminatingTest: text("Smallest feasible test that could distinguish the leading explanations, or why none is needed."),
  predictedOutcomes: text("Expected result under each consequential explanation."),
  switchCondition: text("Observed result or changed premise that would alter the action."),
  reversibility: Type.Union([
    Type.Literal("reversible"), Type.Literal("partly_reversible"), Type.Literal("hard_to_reverse"), Type.Literal("not_applicable"),
  ], { description: "Reversibility of the considered action." }),
}, { additionalProperties: false });

export type ResearchDecision = Static<typeof RESEARCH_DECISION_PARAMETERS>;

const SECRET_PATTERNS = [
  /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi,
  /\b(?:sk|rk|ghp|github_pat|xox[baprs])_[A-Za-z0-9_-]+/g,
  /\b(?:api\s*[_-]?\s*key|token|password|secret)\s*[:=]\s*[^\s,;]+/gi,
];

export function normalizeResearchDecision(value: unknown): ResearchDecision | undefined {
  if (!Check(RESEARCH_DECISION_PARAMETERS, value)) return undefined;
  const normalized = Object.fromEntries(Object.entries(value).map(([key, field]) => [
    key, SECRET_PATTERNS.reduce((result, pattern) => result.replace(pattern, "[redacted]"), field.trim()),
  ]));
  return Check(RESEARCH_DECISION_PARAMETERS, normalized) ? normalized : undefined;
}

export function researchDecisionsFromBranch(entries: Iterable<SessionEntry>): ResearchDecision[] {
  return [...entries].flatMap((entry) => {
    if (entry.type !== "custom" || entry.customType !== RESEARCH_DECISION_ENTRY_TYPE) return [];
    const decision = normalizeResearchDecision(entry.data);
    return decision ? [decision] : [];
  }).slice(-MAX_DECISIONS);
}

export function buildResearchDecisionSnapshot(
  decisions: readonly ResearchDecision[],
  maxChars = RESEARCH_DECISION_MAX_CHARS,
): string | undefined {
  const lines = [
    "<research-decision-context>",
    "Agent-recorded evidence and interpretations, newest first. Measurement checks and conclusions are supplied by the agent.",
  ];
  for (const decision of [...decisions].reverse()) {
    // Keep each accepted record complete: truncation can erase negations, units, or switch conditions.
    const item = [
      `Question: ${decision.question}`,
      `Action: ${decision.action} (${decision.reversibility})`,
      `Evidence: ${decision.evidence}`,
      `Evidence origin: ${decision.evidenceOrigin}`,
      `Interpretation: ${decision.interpretation}`,
      `Alternatives: ${decision.alternatives}`,
      `Measurement chain: ${decision.chainStatus}; ${decision.measurementChain}`,
      `Chain reason: ${decision.chainReason}`,
      `Test: ${decision.discriminatingTest}`,
      `Predictions: ${decision.predictedOutcomes}`,
      `Switch if: ${decision.switchCondition}`,
    ].join("\n");
    const candidate = [...lines, item, "</research-decision-context>"].join("\n");
    if (candidate.length > maxChars) break;
    lines.push(item);
  }
  return lines.length > 2 ? [...lines, "</research-decision-context>"].join("\n") : undefined;
}

export function registerResearchDecision(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "research_decision",
    label: "Research decision",
    description: "Store a scientific decision checkpoint with evidence sources, alternatives, measurement checks, predictions, switch conditions, and reversibility in the current session branch.",
    exposure: "deferred",
    parameters: RESEARCH_DECISION_PARAMETERS,
    async execute(_toolCallId, params) {
      const decision = normalizeResearchDecision(params);
      if (!decision) throw new Error("Invalid research decision: provide all fields, nonblank text up to 420 characters, and valid status values");
      pi.appendEntry(RESEARCH_DECISION_ENTRY_TYPE, decision);
      return {
        content: [{ type: "text", text: "Research decision recorded in the session." }],
        details: decision,
      };
    },
  });

  pi.on("context", async (event, ctx) => {
    const messages = event.messages.filter((message) =>
      !(message.role === "custom" && message.customType === RESEARCH_DECISION_MESSAGE_TYPE));
    const snapshot = buildResearchDecisionSnapshot(researchDecisionsFromBranch(ctx.sessionManager.getBranch()));
    if (!snapshot && messages.length === event.messages.length) return undefined;
    return { messages: snapshot ? [...messages, {
      role: "custom" as const,
      customType: RESEARCH_DECISION_MESSAGE_TYPE,
      content: snapshot,
      display: false,
      timestamp: Date.now(),
    }] : messages };
  });
}
