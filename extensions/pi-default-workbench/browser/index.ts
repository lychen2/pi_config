import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createBrowserTool } from "./browser-tool.ts";

export default function maestroBrowser(pi: ExtensionAPI): void {
  pi.registerTool(createBrowserTool());
}
