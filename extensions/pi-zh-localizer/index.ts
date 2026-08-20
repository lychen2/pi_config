import { localizeSlashSuggestions } from "./command-descriptions.mjs";

export default function localizeSlashCommands(pi: any): void {
  pi.on("session_start", (_event: unknown, ctx: any) => {
    if (!ctx.hasUI) return;

    ctx.ui.addAutocompleteProvider((current: any) => ({
      triggerCharacters: ["/"],
      async getSuggestions(...args: any[]) {
        return localizeSlashSuggestions(await current.getSuggestions(...args));
      },
      applyCompletion(...args: any[]) {
        return current.applyCompletion(...args);
      },
      shouldTriggerFileCompletion(...args: any[]) {
        return current.shouldTriggerFileCompletion?.(...args) ?? true;
      },
    }));
  });
}
