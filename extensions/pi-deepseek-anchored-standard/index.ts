import {
  type ExtensionAPI,
  type ExtensionContext,
  type InputEvent,
} from "@earendil-works/pi-coding-agent";

import {
  bootstrapPayload,
  DEFAULT_ANCHOR_TEXT,
  hasConversation,
  hasPromotionSignal,
  isTargetModel,
  MINIMAL_PERSONA,
  parseMode,
  parsePromoteOn,
  STATE_TYPE,
  stripSyntheticAnchorTurn,
  type AnchorState,
  type Mode,
  type PromoteOn,
  uniquePresent,
  validAnchorState,
} from "./core.ts";
import { registerMinimalEditor } from "./minimal-editor.ts";

const BOOTSTRAP_TOOLS = ["bash", "str_replace_editor"] as const;
const STATUS_KEY = "deepseek-anchor";

type PendingTask = {
  text: string;
  images: NonNullable<InputEvent["images"]>;
};

function modelId(ctx: ExtensionContext): string | undefined {
  return ctx.model?.id;
}

function latestState(ctx: ExtensionContext): AnchorState | undefined {
  let latest: AnchorState | undefined;
  for (const entry of ctx.sessionManager.getBranch()) {
    if (
      entry.type === "custom" &&
      entry.customType === STATE_TYPE &&
      validAnchorState(entry.data)
    ) {
      latest = entry.data;
    }
  }
  return latest;
}

/**
 * DeepSeek V4 Pro and V4 Flash Minimal anchor for Pi.
 *
 * Bootstrap requests carry the DSH Minimal persona and the exact pair
 * `bash` + `str_replace_editor`. The first assistant/tool signal promotes the
 * branch to the caller's original full catalog. Progressive mode inserts only
 * a short anchor turn; the real task is replayed after promotion with its
 * original attachments and the normal Pi context.
 */
export default function deepseekAnchoredStandard(pi: ExtensionAPI): void {
  if (process.env.PI_DEEPSEEK_ANCHORED_STANDARD_DISABLE === "1") return;

  const mode: Mode = parseMode(
    process.env.PI_DEEPSEEK_ANCHORED_STANDARD_MODE,
  );
  const promoteOn: PromoteOn = parsePromoteOn(
    process.env.PI_DEEPSEEK_ANCHORED_STANDARD_PROMOTE_ON,
  );
  const anchorText = (
    process.env.PI_DEEPSEEK_ANCHORED_STANDARD_ANCHOR_TEXT ??
    DEFAULT_ANCHOR_TEXT
  ).trim() || DEFAULT_ANCHOR_TEXT;

  registerMinimalEditor(pi);

  let state: AnchorState | undefined;
  let bootstrapApplied = false;
  let pendingTask: PendingTask | undefined;
  let progressiveAnchorInFlight = false;
  let stripSyntheticAnchor = false;

  const availableTools = () => pi.getAllTools().map((tool) => tool.name);
  const restorableTools = (names: readonly string[]): string[] =>
    uniquePresent(
      availableTools(),
      names.filter((name) => name !== "str_replace_editor"),
    );
  const removeMinimalEditor = (): void => {
    const active = pi.getActiveTools();
    if (active.includes("str_replace_editor")) {
      pi.setActiveTools(active.filter((name) => name !== "str_replace_editor"));
    }
  };
  const bootstrapTools = () => uniquePresent(availableTools(), BOOTSTRAP_TOOLS);
  const fullCatalog = (): string[] =>
    pi.getActiveTools().filter((name) => name !== "str_replace_editor");

  const persist = (): void => {
    if (state) pi.appendEntry<AnchorState>(STATE_TYPE, state);
  };

  const applyBootstrap = (): void => {
    const tools = bootstrapTools();
    if (tools.length !== BOOTSTRAP_TOOLS.length) {
      throw new Error("DeepSeek anchor bootstrap tools are not registered");
    }
    pi.setActiveTools(tools);
    bootstrapApplied = true;
  };

  const restoreFullCatalog = (): void => {
    if (!state || !bootstrapApplied) return;
    pi.setActiveTools(restorableTools(state.fullTools));
    bootstrapApplied = false;
  };

  const updateStatus = (ctx: ExtensionContext): void => {
    if (!ctx.hasUI) return;
    ctx.ui.setStatus(
      STATUS_KEY,
      state?.phase === "bootstrap"
        ? `DeepSeek bootstrap: ${BOOTSTRAP_TOOLS.join("/")}`
        : undefined,
    );
  };

  const armFreshSession = (
    ctx: ExtensionContext,
    selectedModel: string,
  ): AnchorState | undefined => {
    const saved = latestState(ctx);
    if (saved) {
      const promoted =
        saved.phase === "promoted" ||
        hasPromotionSignal(ctx.sessionManager.getBranch(), promoteOn);
      state = promoted ? { ...saved, phase: "promoted" } : saved;
      return state;
    }
    if (hasConversation(ctx.sessionManager.getBranch())) {
      state = undefined;
      return undefined;
    }
    state = {
      version: 2,
      phase: "bootstrap",
      fullTools: fullCatalog(),
      modelId: selectedModel,
    };
    persist();
    return state;
  };

  const restoreBranch = (
    ctx: ExtensionContext,
    selectedModel = modelId(ctx),
  ): void => {
    restoreFullCatalog();
    pendingTask = undefined;
    progressiveAnchorInFlight = false;
    stripSyntheticAnchor = false;
    bootstrapApplied = false;
    if (!isTargetModel(selectedModel)) {
      state = undefined;
      removeMinimalEditor();
      updateStatus(ctx);
      return;
    }
    const restored = armFreshSession(ctx, selectedModel ?? "");
    if (!restored) {
      updateStatus(ctx);
      return;
    }
    if (restored.phase === "bootstrap") applyBootstrap();
    else pi.setActiveTools(restorableTools(restored.fullTools));
    updateStatus(ctx);
  };

  const promote = (ctx: ExtensionContext): void => {
    if (!state || state.phase !== "bootstrap") return;
    state = { ...state, phase: "promoted" };
    persist();
    pi.setActiveTools(restorableTools(state.fullTools));
    bootstrapApplied = false;
    updateStatus(ctx);
  };

  pi.on("session_start", (_event, ctx) => {
    restoreBranch(ctx);
  });

  pi.on("session_tree", (_event, ctx) => {
    restoreBranch(ctx);
  });

  pi.on("session_shutdown", (_event, ctx) => {
    restoreFullCatalog();
    state = undefined;
    pendingTask = undefined;
    progressiveAnchorInFlight = false;
    stripSyntheticAnchor = false;
    removeMinimalEditor();
    if (ctx.hasUI) ctx.ui.setStatus(STATUS_KEY, undefined);
  });

  pi.on("model_select", (event, ctx) => {
    restoreFullCatalog();
    restoreBranch(ctx, event.model.id);
  });

  pi.on("before_agent_start", (_event, ctx) => {
    const selectedModel = modelId(ctx);
    if (!isTargetModel(selectedModel)) return undefined;
    const active = state ?? armFreshSession(ctx, selectedModel ?? "");
    if (!active || active.phase !== "bootstrap") return undefined;
    applyBootstrap();
    return { systemPrompt: MINIMAL_PERSONA };
  });

  pi.on("before_provider_request", (event, ctx) => {
    const payloadModel =
      typeof (event.payload as { model?: unknown } | null)?.model === "string"
        ? (event.payload as { model: string }).model
        : modelId(ctx);
    if (!isTargetModel(payloadModel)) return undefined;
    if (stripSyntheticAnchor) {
      stripSyntheticAnchor = false;
      const payload = stripSyntheticAnchorTurn(event.payload, anchorText);
      return payload === event.payload ? undefined : payload;
    }
    if (state?.phase !== "bootstrap") {
      return undefined;
    }
    return bootstrapPayload(event.payload, BOOTSTRAP_TOOLS);
  });

  pi.on("tool_execution_start", (_event, ctx) => {
    if (state?.phase !== "bootstrap" || !isTargetModel(modelId(ctx))) return;
    if (promoteOn !== "assistant-message") promote(ctx);
  });

  pi.on("message_end", (event, ctx) => {
    if (event.message.role !== "assistant") return;
    if (progressiveAnchorInFlight) {
      progressiveAnchorInFlight = false;
      stripSyntheticAnchor = true;
      promote(ctx);
      return;
    }
    if (state?.phase !== "bootstrap" || !isTargetModel(modelId(ctx))) return;
    if (promoteOn !== "tool-call") promote(ctx);
  });

  pi.on("input", (event, ctx) => {
    if (mode !== "progressive" || !isTargetModel(modelId(ctx))) return undefined;
    if (event.source !== "interactive" || event.text.startsWith("/")) {
      return undefined;
    }
    if (
      !state ||
      state.phase !== "bootstrap" ||
      pendingTask ||
      hasConversation(ctx.sessionManager.getBranch())
    ) {
      return undefined;
    }
    pendingTask = { text: event.text, images: [...(event.images ?? [])] };
    progressiveAnchorInFlight = true;
    // Attachments are explicitly withheld from the synthetic turn and are
    // carried only by the queued original task.
    return { action: "transform", text: anchorText, images: [] };
  });

  pi.on("agent_start", () => {
    if (!pendingTask) return;
    const task = pendingTask;
    pendingTask = undefined;
    const content =
      task.images.length > 0
        ? [{ type: "text" as const, text: task.text }, ...task.images]
        : task.text;
    const followUpOptions = {
      deliverAs: "followUp" as const,
      // Pi 0.82 ignores this option; Pi 0.84+ uses it to expand templates.
      expandPromptTemplates: true,
    };
    pi.sendUserMessage(
      content,
      followUpOptions as Parameters<typeof pi.sendUserMessage>[1],
    );
  });

  pi.registerCommand("dsh-anchor", {
    description: "查看或控制 DeepSeek V4 Pro/Flash Minimal 的启动阶段。",
    handler: async (args, ctx) => {
      const command = args.trim().toLowerCase();
      if (command === "promote") {
        progressiveAnchorInFlight = false;
        stripSyntheticAnchor = false;
        promote(ctx);
      } else if (command === "rearm" && isTargetModel(modelId(ctx))) {
        pendingTask = undefined;
        progressiveAnchorInFlight = false;
        stripSyntheticAnchor = false;
        state = {
          version: 2,
          phase: "bootstrap",
          fullTools: state?.fullTools ?? fullCatalog(),
          modelId: modelId(ctx) ?? "",
        };
        persist();
        applyBootstrap();
        updateStatus(ctx);
      }
      const phase = state?.phase ?? "inactive";
      ctx.ui.notify(
        `DeepSeek anchor: ${phase}; mode: ${mode}; bootstrap: ${BOOTSTRAP_TOOLS.join(", ")}`,
        "info",
      );
    },
  });
}
