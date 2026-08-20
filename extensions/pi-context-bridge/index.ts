import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { interopDefault: true });

type ExtensionFactory = (pi: ExtensionAPI) => void | Promise<void>;

const TEAMMATE_CONTEXT_BLOCKS = [
  ["<available_teammate_models>", "</available_teammate_models>"],
  ["<!-- teammate-agent-catalog:start -->", "<!-- teammate-agent-catalog:end -->"],
  ["<!-- teammate-tasktype-routing:start -->", "<!-- teammate-tasktype-routing:end -->"],
  ["<teammate_nesting_context>", "</teammate_nesting_context>"],
] as const;

function stripPromptBlock(systemPrompt: string, startMarker: string, endMarker: string): string {
  let result = systemPrompt;
  let start = result.indexOf(startMarker);
  while (start >= 0) {
    const end = result.indexOf(endMarker, start);
    if (end < 0) break;
    result = `${result.slice(0, start)}${result.slice(end + endMarker.length)}`;
    start = result.indexOf(startMarker);
  }
  return result;
}

export function stripTeammateContext(systemPrompt: string): string {
  let result = systemPrompt;
  for (const [startMarker, endMarker] of TEAMMATE_CONTEXT_BLOCKS) {
    result = stripPromptBlock(result, startMarker, endMarker);
  }
  return result.replace(/\n{3,}/g, "\n\n").trimEnd();
}

export function filterTeammateContext(systemPrompt: string, activeTools: readonly string[]): string {
  return activeTools.includes("teammate") ? systemPrompt : stripTeammateContext(systemPrompt);
}

async function loadExtension(specifier: string): Promise<ExtensionFactory> {
  const loaded = await jiti.import(specifier) as { default?: ExtensionFactory } | ExtensionFactory;
  const extension = typeof loaded === "function" ? loaded : loaded.default;
  if (typeof extension !== "function") {
    throw new Error(`Extension ${specifier} has no default factory`);
  }
  return extension;
}

export default async function contextBridge(pi: ExtensionAPI): Promise<void> {
  const [registerWebAccess, registerTeammate] = await Promise.all([
    loadExtension("pi-web-access"),
    loadExtension("pi-maestro-teammate/src/extension/index.ts"),
  ]);

  await registerWebAccess(pi);
  await registerTeammate(pi);

  pi.on("before_agent_start", (event) => {
    const systemPrompt = filterTeammateContext(event.systemPrompt, pi.getActiveTools());
    return systemPrompt === event.systemPrompt ? undefined : { systemPrompt };
  });
}
