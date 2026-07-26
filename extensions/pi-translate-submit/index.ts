import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { Api, Model } from "@earendil-works/pi-ai/compat";
import { loadSettings, saveSettings, type TranslationSettings } from "./src/config.js";
import { translateToEnglish } from "./src/translate.js";

const SHORTCUT = "ctrl+alt+t";
const USE_CURRENT_MODEL = "Use current main model (fallback)";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function modelKey(model: Model<Api>): string {
  return `${model.provider}/${model.id}`;
}

function modelsForSelection(ctx: ExtensionContext): Model<Api>[] {
  const available = [...ctx.modelRegistry.getAvailable()];
  if (ctx.model && !available.some((model) => modelKey(model) === modelKey(ctx.model!))) available.push(ctx.model);
  return available.sort((left, right) => modelKey(left).localeCompare(modelKey(right)));
}

function resolveTranslationModel(ctx: ExtensionContext, settings: TranslationSettings): {
  model: Model<Api>;
  usedFallback: boolean;
  unavailableModelId?: string;
} {
  if (!ctx.model) throw new Error("No main model is selected.");
  if (!settings.model) return { model: ctx.model, usedFallback: true };

  const selected = ctx.modelRegistry.find(settings.model.provider, settings.model.id);
  if (selected) return { model: selected, usedFallback: false };
  return {
    model: ctx.model,
    usedFallback: true,
    unavailableModelId: `${settings.model.provider}/${settings.model.id}`,
  };
}

async function chooseTranslationModel(ctx: ExtensionContext, args: string): Promise<void> {
  const settings = await loadSettings();
  const available = modelsForSelection(ctx);
  if (!available.length) {
    if (ctx.hasUI) ctx.ui.notify("No configured models are available for translation.", "warning");
    return;
  }

  const requested = args.trim();
  if (requested === "reset") {
    await saveSettings({});
    if (ctx.hasUI) ctx.ui.notify("Translation model reset. The current main model will be used.", "info");
    return;
  }

  let selected: Model<Api> | undefined;
  if (requested) {
    selected = available.find((model) => modelKey(model) === requested);
  } else {
    if (!ctx.hasUI) return;
    const options = available.map((model) => ({
      label: `${modelKey(model)}${ctx.model && modelKey(model) === modelKey(ctx.model) ? " (current)" : ""}`,
      model,
    }));
    const choice = await ctx.ui.select("Translation model:", [USE_CURRENT_MODEL, ...options.map((option) => option.label)]);
    if (!choice) return;
    if (choice === USE_CURRENT_MODEL) {
      await saveSettings({});
      ctx.ui.notify("Translation model reset. The current main model will be used.", "info");
      return;
    }
    selected = options.find((option) => option.label === choice)?.model;
  }

  if (!selected) {
    if (ctx.hasUI) ctx.ui.notify(`Model ${requested} is not available. Use provider/model.`, "error");
    return;
  }

  await saveSettings({ model: { provider: selected.provider, id: selected.id } });
  if (ctx.hasUI) ctx.ui.notify(`Translation model: ${modelKey(selected)}`, "info");
}

export default function translateSubmit(pi: ExtensionAPI): void {
  let translating = false;

  pi.registerCommand("translate-model", {
    description: "Choose the translation model independently of the main model",
    handler: async (args, ctx) => {
      try {
        await chooseTranslationModel(ctx, args);
      } catch (error) {
        if (ctx.hasUI) ctx.ui.notify(`Translation model was not saved: ${errorMessage(error)}`, "error");
      }
    },
  });

  pi.registerShortcut(SHORTCUT, {
    description: "Translate editor text to English",
    handler: async (ctx) => {
      if (translating) {
        ctx.ui.notify("Translation is already running.", "warning");
        return;
      }
      const source = ctx.ui.getEditorText();
      if (!source.trim()) {
        ctx.ui.notify("Enter a message before translating.", "warning");
        return;
      }

      translating = true;
      try {
        const settings = await loadSettings();
        const { model, usedFallback, unavailableModelId } = resolveTranslationModel(ctx, settings);
        const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
        if (!auth.ok) throw new Error(auth.error);
        if (!auth.apiKey) throw new Error(`No API key for ${model.provider}.`);

        ctx.ui.setStatus("translate-submit", `Translating with ${model.id}...`);
        const translated = await translateToEnglish(source, model, {
          apiKey: auth.apiKey,
          headers: auth.headers,
          env: auth.env,
        });
        if (ctx.ui.getEditorText() !== source) {
          ctx.ui.notify("Editor changed during translation. The result was not inserted.", "warning");
          return;
        }

        ctx.ui.setEditorText(translated);
        if (unavailableModelId) {
          ctx.ui.notify(`Saved model ${unavailableModelId} is unavailable. Used current model and inserted English translation.`, "warning");
        } else if (usedFallback) {
          ctx.ui.notify("No translation model is set. Used current model and inserted English translation.", "info");
        } else {
          ctx.ui.notify(`English translation inserted with ${model.id}.`, "info");
        }
      } catch (error) {
        ctx.ui.notify(`Translation was not inserted: ${errorMessage(error)}`, "error");
      } finally {
        translating = false;
        ctx.ui.setStatus("translate-submit", undefined);
      }
    },
  });
}
