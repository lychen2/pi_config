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
  let webAccessInitialized = false;
  let managerModelsInitialized = false;
  let continuityInitialized = false;

  pi.on("session_start", async (_event, ctx) => {
    const failures: string[] = [];

    if (!webAccessInitialized) {
      try {
        const registerWebAccess = await loadExtension("pi-web-access");
        await registerWebAccess(pi);
        webAccessInitialized = true;
      } catch (error) {
        failures.push(`web access: ${errorMessage(error)}`);
      }
    }

    if (!managerModelsInitialized) {
      try {
        await managerModels(pi);
        managerModelsInitialized = true;
      } catch (error) {
        failures.push(`manager models: ${errorMessage(error)}`);
      }
    }

    if (!continuityInitialized) {
      try {
        registerContinuity(pi);
        continuityInitialized = true;
      } catch (error) {
        failures.push(`continuity: ${errorMessage(error)}`);
      }
    }

    if (failures.length > 0 && ctx.hasUI) {
      ctx.ui.notify(`pi-context-bridge initialization failed: ${failures.join("; ")}`, "error");
    }
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
