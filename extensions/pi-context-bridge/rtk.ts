import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { compatibleRtkApi } from "./rtk-compat.ts";

export default async function rtkCompatibility(pi: ExtensionAPI): Promise<void> {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, { interopDefault: true });
  const loaded = await jiti.import("pi-rtk-optimizer") as {
    default?: (api: ExtensionAPI) => void | Promise<void>;
  } | ((api: ExtensionAPI) => void | Promise<void>);
  const register = typeof loaded === "function" ? loaded : loaded.default;
  if (typeof register !== "function") throw new Error("RTK has no default extension factory");
  await register(compatibleRtkApi(pi));
}
