import {
  CustomEditor,
  type ExtensionAPI,
  type Theme,
} from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth, type EditorComponent } from "@earendil-works/pi-tui";

const ANSI_ESCAPE = /\x1B(?:\][^\x07\x1B]*(?:\x07|\x1B\\)|\[[0-?]*[ -/]*[@-~]|[@-Z\\-_])/g;
const FRAMED_EDITOR = Symbol.for("pi.toolRails.framedEditor");
const SET_EDITOR_PATCH = Symbol.for("pi.toolRails.setEditorPatch");
const RAIL = "▐";

type EditorMeta = {
  modelLabel: string;
  providerLabel: string;
};

function plain(line: string): string {
  return line.replace(ANSI_ESCAPE, "");
}

function isRule(line: string): boolean {
  const text = plain(line);
  return /^─+$/.test(text) || /^─── [↑↓] \d+ (?:more|更多) ─*$/.test(text);
}

function themeFg(theme: Theme, color: Parameters<Theme["fg"]>[0], text: string): string {
  try {
    return theme.fg(color, text);
  } catch {
    return text;
  }
}

function frameBorder(width: number, theme: Theme): string {
  return truncateToWidth(
    themeFg(theme, "borderAccent", "─".repeat(Math.max(0, width))),
    Math.max(0, width),
    "",
  );
}

function rail(theme: Theme): string {
  return `${themeFg(theme, "borderAccent", RAIL)} `;
}

function fillLine(content: string, width: number): string {
  const truncated = truncateToWidth(content, Math.max(0, width), "");
  const pad = " ".repeat(Math.max(0, width - visibleWidth(truncated)));
  return `${truncated}${pad}`;
}

function thinkingColor(level: string): Parameters<Theme["fg"]>[0] {
  switch (level.toLowerCase()) {
    case "minimal":
      return "thinkingMinimal";
    case "low":
      return "thinkingLow";
    case "medium":
      return "thinkingMedium";
    case "high":
      return "thinkingHigh";
    case "xhigh":
      return "thinkingXhigh";
    case "max":
      return "thinkingMax";
    default:
      return "thinkingText";
  }
}

function metaLabel(theme: Theme, meta: EditorMeta, thinking: string | undefined): string | undefined {
  const model = meta.modelLabel ? themeFg(theme, "accent", theme.bold(meta.modelLabel)) : "";
  const provider = meta.providerLabel ? themeFg(theme, "muted", meta.providerLabel) : "";
  const modelProvider = [model, provider].filter(Boolean).join(themeFg(theme, "borderMuted", "  "));
  const parts: string[] = [];
  if (modelProvider) parts.push(modelProvider);
  if (thinking && thinking !== "off") {
    parts.push(themeFg(theme, thinkingColor(thinking), ({
      minimal: "极简",
      low: "低",
      medium: "中",
      high: "高",
      xhigh: "很高",
      max: "最大",
    }[thinking.toLowerCase()] ?? thinking.toUpperCase())));
  }
  return parts.length > 0 ? parts.join(themeFg(theme, "border", "  ")) : undefined;
}

function renderFramed(
  renderBase: (width: number) => string[],
  width: number,
  theme: Theme,
  getMeta: () => EditorMeta,
  getThinking: () => string | undefined,
): string[] {
  if (width < 16) return renderBase(width);

  const railWidth = visibleWidth(rail(theme));
  const innerWidth = Math.max(1, width - railWidth);
  const base = renderBase(innerWidth);

  let bottomRule = -1;
  for (let index = base.length - 1; index > 0; index--) {
    if (isRule(base[index])) {
      bottomRule = index;
      break;
    }
  }
  if (!isRule(base[0] ?? "") || bottomRule < 1) return base;

  const completions = base.slice(bottomRule + 1);
  const body = base.slice(1, bottomRule);
  const railed = (content: string) => `${rail(theme)}${fillLine(content, innerWidth)}`;
  const meta = metaLabel(theme, getMeta(), getThinking());
  const lines = [
    frameBorder(width, theme),
    railed(""),
    ...body.map(railed),
    railed(""),
    ...(meta ? [railed(meta)] : []),
    frameBorder(width, theme),
  ];
  return [...lines, ...completions];
}

function decorate(
  editor: EditorComponent,
  theme: Theme,
  getMeta: () => EditorMeta,
  getThinking: () => string | undefined,
): EditorComponent {
  const marked = editor as EditorComponent & Record<symbol, unknown>;
  if (marked[FRAMED_EDITOR]) return editor;
  const renderBase = editor.render.bind(editor);
  editor.render = (width: number) => renderFramed(renderBase, width, theme, getMeta, getThinking);
  Object.defineProperty(editor, FRAMED_EDITOR, { value: true });
  return editor;
}

function providerLabel(provider: string | undefined): string {
  if (!provider) return "未知提供商";
  const known: Record<string, string> = {
    anthropic: "Anthropic",
    gemini: "Google",
    google: "Google",
    ollama: "Ollama",
    openai: "OpenAI",
    "openai-codex": "OpenAI",
  };
  return (
    known[provider] ?? provider.replace(/[-_]/g, " ").replace(/\b\w/g, (char) => char.toUpperCase())
  );
}

export default function promptFrame(pi: ExtensionAPI, installDefaultEditor = true): void {
  let restoreSetEditor = () => {};
  let meta: EditorMeta = { modelLabel: "未选择模型", providerLabel: "未知提供商" };
  pi.on("model_select", (event) => {
    meta = {
      modelLabel: event.model.id ?? "未选择模型",
      providerLabel: providerLabel(event.model.provider),
    };
  });

  function disposeSessionEditor(): void {
    restoreSetEditor();
    restoreSetEditor = () => {};
  }

  pi.on("session_start", (_event, ctx) => {
    disposeSessionEditor();
    if (ctx.mode !== "tui") return;

    const ui = ctx.ui as typeof ctx.ui & Record<symbol, unknown>;
    const theme = ctx.ui.theme;
    meta = {
      modelLabel: ctx.model?.id ?? "未选择模型",
      providerLabel: providerLabel(ctx.model?.provider),
    };
    const getMeta = () => meta;
    const getThinking = () => (typeof pi.getThinkingLevel === "function" ? pi.getThinkingLevel() : undefined);

    type Setter = typeof ctx.ui.setEditorComponent;
    type Patch = { original: Setter; wrapped: Setter };
    const stale = ui[SET_EDITOR_PATCH] as Patch | undefined;
    if (stale && ctx.ui.setEditorComponent === stale.wrapped) {
      ctx.ui.setEditorComponent = stale.original;
      delete ui[SET_EDITOR_PATCH];
    }

    const previous = ctx.ui.getEditorComponent();
    const original = ctx.ui.setEditorComponent;
    const wrapped: Setter = (factory) => {
      const baseFactory = factory ?? ((tui, editorTheme, keybindings) =>
        new CustomEditor(tui, editorTheme, keybindings));
      const decorated = ((tui, editorTheme, keybindings) =>
        decorate(baseFactory(tui, editorTheme, keybindings), theme, getMeta, getThinking)) as typeof baseFactory;
      // Preserve symbol-keyed identity (e.g. Cockpit's editor-factory marker)
      // so other extensions still recognise their own factory after this wrap;
      // otherwise a reload sees a "foreign" factory and disables its editor.
      for (const key of Object.getOwnPropertySymbols(baseFactory)) {
        (decorated as unknown as Record<symbol, unknown>)[key] =
          (baseFactory as unknown as Record<symbol, unknown>)[key];
      }
      original.call(ui, decorated);
    };
    const patch: Patch = { original, wrapped };
    ui[SET_EDITOR_PATCH] = patch;
    ctx.ui.setEditorComponent = wrapped;
    // Only re-decorate an editor that already exists. Installing a default
    // editor here would occupy the slot and block other extensions (Cockpit)
    // from installing their own editor later in the same session_start.
    if (previous) wrapped(previous);
    else if (installDefaultEditor) wrapped(undefined);

    restoreSetEditor = () => {
      if (ui.setEditorComponent === wrapped) ui.setEditorComponent = original;
      if (ui[SET_EDITOR_PATCH] === patch) delete ui[SET_EDITOR_PATCH];
    };
  });

  pi.on("session_shutdown", disposeSessionEditor);
}
