import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// Automatic RTK rewriting is intentionally limited to human-oriented summaries.
// Unknown commands may produce diagnostic evidence or perform exact readback.
const SUMMARY_COMMAND = /^git (?:status(?: --short| -sb)?|diff --stat|log --oneline(?: -[1-9]\d?)?)$/;

type Event = {
  toolName?: string;
  input?: { command?: unknown };
  content?: unknown;
  isError?: boolean;
};

export function isSummaryCommand(command: unknown): boolean {
  return typeof command === "string" && SUMMARY_COMMAND.test(command.trim());
}

export function preserveResult(event: Event): boolean {
  if (event.toolName !== "bash" || event.isError || !isSummaryCommand(event.input?.command)) return true;
  // A downstream reducer/packer owns its receipts, including future formats.
  return Array.isArray(event.content) && event.content.some((block: unknown) => {
    if (!block || typeof block !== "object" || !("text" in block) || typeof block.text !== "string") return false;
    return /sol_pi_evidence_receipt|source_artifact=|obs_recall|<sol-pi-/i.test(block.text);
  });
}

/** Scope only RTK's hooks; never replace the host API or mutate upstream code. */
export function compatibleRtkApi(pi: ExtensionAPI): ExtensionAPI {
  return new Proxy(pi, {
    get(target, property) {
      if (property !== "on") return Reflect.get(target, property);
      return (name: string, handler: (event: Event, context: unknown) => unknown) => {
        const on = target.on as (name: string, handler: (event: Event, context: unknown) => unknown) => void;
        if (name === "tool_call") {
          on.call(target, name, (event, context) => {
            if (event.toolName === "bash" && !isSummaryCommand(event.input?.command)) return;
            return handler(event, context);
          });
        } else if (name === "tool_result") {
          on.call(target, name, (event, context) => preserveResult(event) ? undefined : handler(event, context));
        } else if (name === "tool_execution_update" || name === "tool_execution_end") {
          // RTK's streaming sanitizers mutate shared result objects. Leave these
          // alone: the host renderer and SoL must see the same evidence bytes.
          return;
        } else {
          on.call(target, name, handler);
        }
      };
    },
  });
}
