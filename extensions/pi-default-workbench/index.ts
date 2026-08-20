import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import registerToolSelector from "./deferred-tools/deferred-tools.ts";
import registerBrowser from "./browser/index.ts";
import registerTodo from "./todo/index.ts";
import registerMaestroTools from "./maestro/index.ts";
import registerPreview from "./preview/index.ts";

export default async function register(pi: ExtensionAPI): Promise<void> {
  registerToolSelector(pi);
  registerBrowser(pi);
  registerTodo(pi);
  registerMaestroTools(pi);
  await registerPreview(pi);
}

export * from "./todo/index.ts";
export { adaptPreviewTool, validatePngPaths } from "./preview/index.ts";
