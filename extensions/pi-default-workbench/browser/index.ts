import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createBrowserTool } from "./browser-tool.ts";
import { browserManager } from "./manager.ts";

export default function maestroBrowser(pi: ExtensionAPI): void {
  pi.registerTool(createBrowserTool(browserManager));
  pi.on("session_shutdown", async () => {
    await browserManager.closeAll();
  });
}
