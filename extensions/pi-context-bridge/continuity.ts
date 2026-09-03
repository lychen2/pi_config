import type {
  ContextEvent,
  ExtensionAPI,
  ExtensionContext,
  SessionEntry,
} from "@earendil-works/pi-coding-agent";

type CheckpointKind = "decision" | "failed_attempt" | "checkpoint";

export type ContinuityCheckpoint = {
  kind: CheckpointKind;
  summary: string;
  reason: string;
  next: string;
  verified: boolean;
  refs: string[];
};

type ContinuityEntry = SessionEntry & {
  type: "custom";
  customType: typeof CONTINUITY_ENTRY_TYPE;
  data: ContinuityCheckpoint;
};

type ContextMessage = ContextEvent["messages"][number];
type RecordLike = Record<string, unknown>;

export const CONTINUITY_ENTRY_TYPE = "pi-context-checkpoint";
export const CONTINUITY_MESSAGE_TYPE = "pi-context-continuity";
export const CONTINUITY_MAX_CHARS = 2400;
const MAX_CHECKPOINTS = 6;
const MAX_FIELD_CHARS = 240;
const MAX_REFS = 3;

const CHECKPOINT_PARAMETERS = {
  type: "object",
  additionalProperties: false,
  properties: {
    kind: {
      type: "string",
      enum: ["decision", "failed_attempt", "checkpoint"],
      description: "The state transition being recorded.",
    },
    summary: {
      type: "string",
      description: "Short description of the approach, decision, or current state.",
    },
    reason: {
      type: "string",
      description: "Evidence or rationale; state why an approach failed when applicable.",
    },
    next: {
      type: "string",
      description: "The next action or implication for the continuing agent.",
    },
    verified: {
      type: "boolean",
      description: "Whether this checkpoint was directly verified in the current session.",
    },
    refs: {
      type: "array",
      items: { type: "string" },
      description: "Optional paths, commands, URLs, or identifiers supporting the checkpoint.",
    },
  },
  required: ["kind", "summary", "reason", "next", "verified"],
} as const;

function isRecord(value: unknown): value is RecordLike {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isKind(value: unknown): value is CheckpointKind {
  return value === "decision" || value === "failed_attempt" || value === "checkpoint";
}

const SECRET_PATTERNS = [
  /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi,
  /\b(?:sk|rk|ghp|github_pat|xox[baprs])_[A-Za-z0-9_-]+/g,
  /\b(?:api[_-]?key|token|password|secret)\s*[:=]\s*[^\s,;]+/gi,
];

export function redactCheckpointText(value: string): string {
  return SECRET_PATTERNS.reduce(
    (text, pattern) => text.replace(pattern, "[redacted]"),
    value,
  );
}

function boundedText(value: unknown, fallback = ""): string {
  if (typeof value !== "string") return fallback;
  return redactCheckpointText(value.trim()).slice(0, MAX_FIELD_CHARS);
}

export function normalizeCheckpoint(value: unknown): ContinuityCheckpoint | undefined {
  if (!isRecord(value) || !isKind(value.kind)) return undefined;
  const summary = boundedText(value.summary);
  const reason = boundedText(value.reason);
  const next = boundedText(value.next);
  if (!summary || !reason || !next || typeof value.verified !== "boolean") return undefined;

  const refs = Array.isArray(value.refs)
    ? value.refs
      .filter((ref): ref is string => typeof ref === "string")
      .map((ref) => boundedText(ref))
      .filter(Boolean)
      .slice(0, MAX_REFS)
    : [];

  return { kind: value.kind, summary, reason, next, verified: value.verified, refs };
}

function isContinuityEntry(entry: SessionEntry): entry is ContinuityEntry {
  return entry.type === "custom"
    && entry.customType === CONTINUITY_ENTRY_TYPE
    && normalizeCheckpoint(entry.data) !== undefined;
}

export function checkpointsFromBranch(entries: Iterable<SessionEntry>): ContinuityCheckpoint[] {
  return [...entries]
    .filter(isContinuityEntry)
    .map((entry) => normalizeCheckpoint(entry.data)!)
    .slice(-MAX_CHECKPOINTS);
}

function kindLabel(kind: CheckpointKind): string {
  return kind === "failed_attempt" ? "failed" : kind;
}

function compactLine(checkpoint: ContinuityCheckpoint): string {
  const verified = checkpoint.verified ? "verified" : "unverified";
  const refs = checkpoint.refs.length ? `; refs=${checkpoint.refs.join(", ")}` : "";
  return `- [${kindLabel(checkpoint.kind)}; ${verified}] ${checkpoint.summary}; reason: ${checkpoint.reason}; next: ${checkpoint.next}${refs}`;
}

export function buildContinuitySnapshot(
  checkpoints: readonly ContinuityCheckpoint[],
  maxChars = CONTINUITY_MAX_CHARS,
): string | undefined {
  if (!checkpoints.length) return undefined;
  const header = [
    "<continuity-state>",
    "Use this bounded session state to avoid repeating rejected approaches.",
  ];
  const lines: string[] = [];
  for (const checkpoint of checkpoints) {
    const candidate = [...header, ...lines, compactLine(checkpoint), "</continuity-state>"].join("\n");
    if (candidate.length > maxChars) break;
    lines.push(compactLine(checkpoint));
  }
  if (!lines.length) {
    const fallback = compactLine(checkpoints.at(-1)!);
    return [...header, fallback.slice(0, Math.max(0, maxChars - 22)), "</continuity-state>"].join("\n").slice(0, maxChars);
  }
  return [...header, ...lines, "</continuity-state>"].join("\n");
}

function isContinuityMessage(message: ContextMessage): boolean {
  const candidate = message as ContextMessage & { customType?: unknown };
  return candidate.role === "custom" && candidate.customType === CONTINUITY_MESSAGE_TYPE;
}

function hiddenMessage(content: string): ContextMessage {
  return {
    role: "custom",
    customType: CONTINUITY_MESSAGE_TYPE,
    content,
    display: false,
    timestamp: Date.now(),
  } as ContextMessage;
}

function recordCheckpoint(pi: Pick<ExtensionAPI, "appendEntry">, value: unknown): ContinuityCheckpoint {
  const checkpoint = normalizeCheckpoint(value);
  if (!checkpoint) throw new Error("Invalid checkpoint: kind, summary, reason, next, and verified are required");
  pi.appendEntry(CONTINUITY_ENTRY_TYPE, checkpoint);
  return checkpoint;
}

export function registerContinuity(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "checkpoint",
    label: "Checkpoint",
    description: "Record a short verified decision, failed approach, or handoff state for context continuity.",
    promptSnippet: "Record a bounded checkpoint when an approach fails or a decision is verified",
    promptGuidelines: [
      "Use checkpoint only for meaningful decisions, failed approaches, or phase handoffs; do not log every tool call.",
    ],
    parameters: CHECKPOINT_PARAMETERS,
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const checkpoint = recordCheckpoint(pi, params);
      return {
        content: [{ type: "text", text: `Checkpoint recorded: ${checkpoint.kind}` }],
        details: checkpoint,
      };
    },
  });

  pi.on("context", async (event, ctx: ExtensionContext) => {
    const messages = event.messages.filter((message) => !isContinuityMessage(message));
    const checkpoints = checkpointsFromBranch(ctx.sessionManager.getBranch());
    const snapshot = buildContinuitySnapshot(checkpoints);
    if (!snapshot && messages.length === event.messages.length) return undefined;
    return { messages: snapshot ? [...messages, hiddenMessage(snapshot)] : messages };
  });
}
