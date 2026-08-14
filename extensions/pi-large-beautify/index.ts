import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import labeledToolShell from "./vendor/tool-rails/compact-shell.ts";
import toolRails from "./vendor/tool-rails/index.ts";
import resultBridge from "./vendor/tool-rails/result-bridge.ts";
import promptFrame from "./vendor/tool-rails/prompt-frame.ts";
import brandHeader from "./vendor/brand-header.ts";
import matugenChrome from "./vendor/matugen-chrome.ts";

export default function largeBeautify(pi: ExtensionAPI): void {
  labeledToolShell(pi);
  toolRails(pi);
  resultBridge(pi);
  promptFrame(pi);
  brandHeader(pi);
  matugenChrome(pi);

  pi.on("session_shutdown", (_event, ctx) => {
    if (ctx.mode === "tui") {
      ctx.ui.setHeader(undefined);
    }
  });
}
