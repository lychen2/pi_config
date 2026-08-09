import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
const ENTRY_TYPE = "adhd-mode";

// Do not mention internal reasoning here: DeepSeek v4-flash can treat such
// wording as a deliberation objective and spend its whole output budget on it.
const SYSTEM_PROMPT = `
## ADHD Output Mode
Format only the final reply for an ADHD reader: lead with the result or next action; use short numbered steps when they are actionable; retain necessary details and remove unrelated tangents.
`;

let enabled = true;

export default function adhdMode(pi: ExtensionAPI) {
  // Restore state from previous session entries on startup
  pi.on("session_start", async (_event, ctx) => {
    for (const entry of ctx.sessionManager.getEntries()) {
      if (entry.type === "custom" && entry.customType === ENTRY_TYPE) {
        enabled = (entry.data as { enabled?: boolean })?.enabled ?? true;
      }
    }
  });

  // Keep the persisted full skill available on disk; inject only the compact
  // presentation contract into the model context for each turn.
  pi.on("before_agent_start", async (event, ctx) => {
    if (!enabled) return undefined;

    // v4-flash's reasoning is materially destabilized by any extra ADHD
    // system instruction (verified with controlled same-model A/B tests).
    // Scope this workaround to the affected model only.
    if (
      ctx.model?.provider === "manager" &&
      ctx.model.id === "deepseek-v4-flash"
    ) {
      return undefined;
    }

    return {
      systemPrompt: event.systemPrompt + "\n\n" + SYSTEM_PROMPT,
    };
  });

  // Toggle command
  pi.registerCommand("adhd", {
    description: "Toggle ADHD output mode (auto-injected)",
    handler: async (_args, ctx) => {
      enabled = !enabled;
      pi.appendEntry(ENTRY_TYPE, { enabled });
      ctx.ui.notify(
        enabled ? "ADHD mode enabled" : "ADHD mode disabled",
        "info",
      );
    },
  });
}
