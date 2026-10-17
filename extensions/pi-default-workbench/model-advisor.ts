import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const ENTRY_TYPE = "pi-workbench-model-advice";
const MODELS = ["gpt-6-luna", "gpt-6.1-sol", "gpt-6-astra"];

export default function modelAdvisor(pi: ExtensionAPI): void {
  pi.on("input", async (event, ctx) => {
    if (event.source === "extension" || !ctx.hasUI || process.env.PI_OFFLINE === "1") return;
    const current = ctx.model;
    if (!current || !MODELS.includes(current.id)) return;
    // Inspect the whole session: navigating to an earlier branch does not create a new session.
    if (ctx.sessionManager.getEntries().some((entry) =>
      (entry.type === "message" && entry.message.role === "user")
      || (entry.type === "custom" && entry.customType === ENTRY_TYPE))) return;

    pi.appendEntry(ENTRY_TYPE, { classifier: "typesafe/jev-latest" });
    const jev = ctx.modelRegistry.findOfType("classifier", "typesafe", "jev-latest");
    if (!jev) {
      ctx.ui.notify("Jev model advice is unavailable: typesafe/jev-latest is missing. Keeping the current model.", "warning");
      return;
    }
    try {
      const result = await ctx.modelRegistry.classify(jev, {
        state: { task: event.text.slice(0, 16_000), imageCount: event.images?.length ?? 0 },
        questions: {
          model: {
            type: "choice",
            instructions: "Choose the model best suited to the user's first task. Assess difficulty, scope, and need for creative exploration.",
            criteria: {
              "gpt-6-luna": "Simple, routine, clearly specified tasks with low reasoning demands.",
              "gpt-6.1-sol": "Difficult tasks with a bounded scope and clear completion criteria, including hard debugging or complex implementation.",
              "gpt-6-astra": "Open-ended exploration, creative work, or exceptionally difficult tasks requiring substantial reasoning.",
            },
          },
        },
      }, { signal: AbortSignal.timeout(15_000) });
      const answer = result.stopReason === "stop" ? result.answers.model : undefined;
      if (answer?.type !== "choice" || !MODELS.includes(answer.choice)) {
        ctx.ui.notify("Jev model advice failed. Keeping the current model.", "warning");
        return;
      }
      if (answer.choice === current.id) return;
      const target = ctx.modelRegistry.find(current.provider, answer.choice);
      if (!target) {
        ctx.ui.notify(`Jev recommends ${answer.choice}, which is unavailable for ${current.provider}. Keeping the current model.`, "warning");
        return;
      }
      const approved = await ctx.ui.confirm("Jev model recommendation", `Current: ${current.id}\nRecommended: ${answer.choice}\nSwitch for this session?`);
      if (approved && !await pi.setModel(target)) {
        ctx.ui.notify(`Cannot switch to ${answer.choice}: provider authentication is unavailable. Keeping the current model.`, "warning");
      }
    } catch {
      ctx.ui.notify("Jev model advice failed or timed out. Keeping the current model.", "warning");
    }
  });
}
