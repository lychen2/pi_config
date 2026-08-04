import type { ExtensionAPI, ToolResultEvent } from "@earendil-works/pi-coding-agent";

const STATE_KEY = Symbol.for("pi_config.rtkAftBashResults");

type SavedResult = Pick<ToolResultEvent, "content" | "details">;

type ResultState = Map<string, SavedResult>;

function state(): ResultState {
  const globals = globalThis as Record<PropertyKey, unknown>;
  const existing = globals[STATE_KEY];
  if (existing instanceof Map) return existing as ResultState;
  const created: ResultState = new Map();
  globals[STATE_KEY] = created;
  return created;
}

export default function (pi: ExtensionAPI) {
  pi.on("tool_result", (event) => {
    if (event.toolName !== "bash" || typeof event.toolCallId !== "string") return;
    state().set(event.toolCallId, {
      content: event.content,
      details: event.details,
    });
  });
}
