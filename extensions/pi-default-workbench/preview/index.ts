import type { ExtensionAPI, ToolDefinition } from "@earendil-works/pi-coding-agent";
import { createJiti } from "jiti";
import { adaptPreviewTool, validatePngPaths } from "./compat.ts";

export { adaptPreviewTool, validatePngPaths } from "./compat.ts";

const jiti = createJiti(import.meta.url, { interopDefault: true });

type AnyTool = ToolDefinition<any, any>;

function createToolAdaptingApi(pi: ExtensionAPI): ExtensionAPI {
  return new Proxy(pi, {
    get(target, property, receiver) {
      if (property === "registerTool") {
        return (tool: AnyTool) => target.registerTool(adaptPreviewTool(tool) as never);
      }
      const value = Reflect.get(target, property, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

export default async function markdownPreviewCompat(pi: ExtensionAPI): Promise<void> {
  const loaded = await jiti.import("pi-markdown-preview") as
    | { default?: (api: ExtensionAPI) => void }
    | ((api: ExtensionAPI) => void);
  const registerPreview = typeof loaded === "function" ? loaded : loaded.default;
  if (typeof registerPreview !== "function") throw new Error("pi-markdown-preview has no default factory");
  registerPreview(createToolAdaptingApi(pi));
}
