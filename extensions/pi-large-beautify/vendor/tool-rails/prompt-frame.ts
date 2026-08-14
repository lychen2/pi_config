import {
  CustomEditor,
  type ExtensionAPI,
  type Theme,
} from "@earendil-works/pi-coding-agent";
import { visibleWidth, type EditorComponent } from "@earendil-works/pi-tui";

const ANSI_ESCAPE = /\x1B(?:\][^\x07\x1B]*(?:\x07|\x1B\\)|\[[0-?]*[ -/]*[@-~]|[@-Z\\-_])/g;
const FRAMED_EDITOR = Symbol.for("pi.toolRails.framedEditor");
const SET_EDITOR_PATCH = Symbol.for("pi.toolRails.setEditorPatch");

function isRule(line: string): boolean {
  const plain = line.replace(ANSI_ESCAPE, "");
  return /^─+$/.test(plain) || /^─── [↑↓] \d+ more ─*$/.test(plain);
}

function top(width: number, theme: Theme): string {
  const label = " prompt ";
  const tail = "─".repeat(Math.max(0, width - label.length - 3));
  return `${theme.fg("borderAccent", "╭─")}${theme.fg("accent", theme.bold(label))}${theme.fg("borderAccent", `${tail}╮`)}`;
}

function bottom(width: number, theme: Theme): string {
  return theme.fg("borderAccent", `╰${"─".repeat(Math.max(0, width - 2))}╯`);
}

function line(content: string, width: number, theme: Theme): string {
  const padding = " ".repeat(Math.max(0, width - 4 - visibleWidth(content)));
  return `${theme.fg("borderAccent", "│")} ${content}${padding} ${theme.fg("borderAccent", "│")}`;
}

function renderFramed(renderBase: (width: number) => string[], width: number, theme: Theme): string[] {
  if (width < 16) return renderBase(width);

  const base = renderBase(width - 4);
  let bottomRule = -1;
  for (let index = base.length - 1; index > 0; index--) {
    if (isRule(base[index])) {
      bottomRule = index;
      break;
    }
  }
  if (!isRule(base[0] ?? "") || bottomRule < 1) return base;

  const completions = base.slice(bottomRule + 1);
  return [
    top(width, theme),
    ...base.slice(1, bottomRule).map((content) => line(content, width, theme)),
    ...(completions.length
      ? [theme.fg("borderAccent", `├${"─".repeat(Math.max(0, width - 2))}┤`)]
      : []),
    ...completions.map((content) => line(content, width, theme)),
    bottom(width, theme),
  ];
}

function decorate(editor: EditorComponent, theme: Theme): EditorComponent {
  const marked = editor as EditorComponent & Record<symbol, unknown>;
  if (marked[FRAMED_EDITOR]) return editor;
  const renderBase = editor.render.bind(editor);
  editor.render = (width: number) => renderFramed(renderBase, width, theme);
  Object.defineProperty(editor, FRAMED_EDITOR, { value: true });
  return editor;
}

export default function promptFrame(pi: ExtensionAPI): void {
  let restoreSetEditor = () => {};

  function disposeSessionEditor(): void {
    restoreSetEditor();
    restoreSetEditor = () => {};
  }

  pi.on("session_start", (_event, ctx) => {
    disposeSessionEditor();
    if (ctx.mode !== "tui") return;

    const ui = ctx.ui as typeof ctx.ui & Record<symbol, unknown>;
    const theme = ctx.ui.theme;
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
        decorate(baseFactory(tui, editorTheme, keybindings), theme)) as typeof baseFactory;
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

    restoreSetEditor = () => {
      if (ui.setEditorComponent === wrapped) ui.setEditorComponent = original;
      if (ui[SET_EDITOR_PATCH] === patch) delete ui[SET_EDITOR_PATCH];
    };
  });

  pi.on("session_shutdown", disposeSessionEditor);
}
