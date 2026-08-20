import type { AgentToolResult } from "@earendil-works/pi-agent-core";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/**
 * Structured failure shape shared by the default-mode custom tools
 * (fffind/ffgrep, bash_bg, conflict). A tool returns this as a normal result;
 * {@link installToolFailureMarker} then marks it as an error via the
 * `tool_result` event. This mirrors the ReadSeek `{ ok: false, error }`
 * convention so the model sees a stable, machine-readable error instead of a
 * bare natural-language `Error`.
 */
export type ToolFailureDetails = {
  ok: false;
  code: string;
  message: string;
  field?: string;
  retryable?: boolean;
};

export function toolFailure(
  code: string,
  message: string,
  options: { field?: string; retryable?: boolean } = {},
): AgentToolResult<ToolFailureDetails> {
  return {
    content: [{ type: "text", text: message }],
    details: {
      ok: false,
      code,
      message,
      ...(options.field ? { field: options.field } : {}),
      ...(options.retryable !== undefined ? { retryable: options.retryable } : {}),
    },
  };
}

export function isToolFailure(details: unknown): details is ToolFailureDetails {
  return Boolean(
    details
    && typeof details === "object"
    && !Array.isArray(details)
    && (details as { ok?: unknown }).ok === false
    && typeof (details as { code?: unknown }).code === "string",
  );
}

export function installToolFailureMarker(pi: ExtensionAPI): void {
  pi.on("tool_result", (event) => {
    if (!isToolFailure(event.details)) return;
    return { isError: true };
  });
}
