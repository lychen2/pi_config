import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createTasteExtension } from "./taste/runtime.mjs";

// Request-local sections apply to every provider without replacing model presets.
export default function registerTaste(pi: ExtensionAPI): void {
  createTasteExtension({
    providers: null,
    modelIdPattern: /^/,
    completedResultTypes: ["teammate-complete"],
  })(pi);
}
