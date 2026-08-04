import type { ExtensionAPI, ToolResultEvent } from "@earendil-works/pi-coding-agent";

const STATE_KEY = Symbol.for("pi_config.rtkAftBashResults");

type SavedResult = Pick<ToolResultEvent, "content" | "details">;

type ResultState = Map<string, SavedResult>;

function state(): ResultState | undefined {
  const existing = (globalThis as Record<PropertyKey, unknown>)[STATE_KEY];
  return existing instanceof Map ? existing as ResultState : undefined;
}

export default function (pi: ExtensionAPI) {
  pi.on("tool_result", (event) => {
    if (event.toolName !== "bash" || typeof event.toolCallId !== "string") return;
    const saved = state()?.get(event.toolCallId);
    state()?.delete(event.toolCallId);
    if (!saved) return;
    return { content: saved.content, details: saved.details };
  });
}
