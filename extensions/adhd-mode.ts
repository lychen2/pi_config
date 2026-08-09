import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
const ENTRY_TYPE = "adhd-mode";
let enabled = true;

// Do not mention internal reasoning here: DeepSeek v4-flash can treat such
// wording as a deliberation objective and spend its whole output budget on it.
const SYSTEM_PROMPT = `
## ADHD Output Mode
Format only the final reply for an ADHD reader: lead with the result or next action; use short numbered steps when they are actionable; retain necessary details and remove unrelated tangents.
`;

const DEEPSEEK_V4_FLASH_PROMPT = `
## Analytical Tasks
For analytical, mathematical, and technical questions: read every stated condition carefully, derive the result before answering, check edge cases, and validate the conclusion.
`;

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

    // Do not append ADHD presentation rules to v4-flash: controlled tests
    // showed they distort its reasoning. This narrower task-quality prompt is
    // scoped to the affected model.
    if (
      ctx.model?.provider === "manager" &&
      ctx.model.id === "deepseek-v4-flash"
    ) {
      return {
        systemPrompt: event.systemPrompt + "\n\n" + DEEPSEEK_V4_FLASH_PROMPT,
      };
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
