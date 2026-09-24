import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Key } from "@earendil-works/pi-tui";

export default function registerSessionTools(pi: ExtensionAPI): void {
  // One slot per session, kept only for this extension instance/process.
  const drafts = new Map<string, string>();
  const refresh = (ctx: ExtensionContext) => ctx.ui.setStatus("workbench-stash", drafts.has(ctx.sessionManager.getSessionId()) ? "Draft stashed" : undefined);
  const stash = async (ctx: ExtensionContext) => {
    if (!ctx.hasUI) return;
    const id = ctx.sessionManager.getSessionId();
    const current = ctx.ui.getEditorText();
    const stored = drafts.get(id) ?? "";
    if (!current && !stored) { ctx.ui.notify("No draft to stash.", "info"); return; }
    // Set the editor first so a failed UI operation cannot discard the slot.
    ctx.ui.setEditorText(stored);
    if (current) drafts.set(id, current); else drafts.delete(id);
    refresh(ctx);
  };
  pi.registerCommand("stash", { description: "Stash, restore, or swap the current input draft (memory only)", handler: (_args, ctx) => stash(ctx) });
  pi.registerShortcut(Key.ctrlAlt("s"), { description: "Stash or swap input draft", handler: stash });
  pi.on("session_start", (_event, ctx) => { if (ctx.hasUI) refresh(ctx); });

  const copy = async (args: string, ctx: ExtensionContext) => {
    if (!ctx.hasUI) return;
    try { await (await import("./copy-browser.ts")).openCopyBrowser(args, ctx); }
    catch (error) { ctx.ui.notify(`Copy failed: ${error instanceof Error ? error.message : String(error)}`, "error"); }
  };
  pi.registerCommand("anycopy", { description: "Preview and copy history; optional all includes other branches", handler: copy });
  pi.registerShortcut(Key.ctrlAlt("y"), { description: "Copy history without changing the input draft", handler: (ctx) => copy("", ctx) });
  pi.registerCommand("md", {
    description: "Export Markdown: [N | all] [t] [tc] [+tool] [-tool] [save]",
    handler: async (args, ctx) => {
      if (!ctx.hasUI) return;
      try { await (await import("./markdown.ts")).exportMarkdown(args, ctx); }
      catch (error) { ctx.ui.notify(`Export failed: ${error instanceof Error ? error.message : String(error)}`, "error"); }
    },
  });
}
