import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import managerModels from "./manager-models.ts";
import { registerContinuity } from "./continuity.ts";

type ExtensionFactory = (pi: ExtensionAPI) => void | Promise<void>;

async function loadExtension(specifier: string): Promise<ExtensionFactory> {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, { interopDefault: true });
  const loaded = await jiti.import(specifier) as { default?: ExtensionFactory } | ExtensionFactory;
  const extension = typeof loaded === "function" ? loaded : loaded.default;
  if (typeof extension !== "function") {
    throw new Error(`Extension ${specifier} has no default factory`);
  }
  return extension;
}

export default function contextBridge(pi: ExtensionAPI): void {
  let initialized = false;
  pi.on("session_start", async (_event, ctx) => {
    if (initialized) return;
    initialized = true;

    try {
      const registerWebAccess = await loadExtension("pi-web-access");
      await registerWebAccess(pi);
      await managerModels(pi);
      registerContinuity(pi);
    } catch (error) {
      initialized = false;
      ctx.ui.notify(`pi-context-bridge initialization failed (${(error as Error).message}). Web access and continuity will retry next session.`, "error");
    }
  });
}
