import type { ExtensionAPI, ExtensionContext, ExtensionFactory } from "@earendil-works/pi-coding-agent";

function isClaudeModel(model: { id?: string; name?: string; provider?: string } | undefined): boolean {
  if (!model) return false;
  return model.provider?.toLowerCase() === "anthropic"
    || `${model.provider ?? ""} ${model.id ?? ""} ${model.name ?? ""}`.toLowerCase().includes("claude");
}

export type SolPiExtensionLoader = (agentDir: string) => Promise<ExtensionFactory>;

type LegacyPlanStep = {
  id: string;
  description: string;
  status: string;
  result?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isLegacyStep(value: unknown): value is LegacyPlanStep {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value);
  return keys.every((key) => ["id", "description", "status", "result"].includes(key))
    && typeof value.id === "string"
    && typeof value.description === "string"
    && ["pending", "in_progress", "completed"].includes(value.status as string)
    && (value.result === undefined || typeof value.result === "string");
}

/** Convert the former summary/plan format before Pi validates the registered schema. */
export function normalizeLegacyUpdatePlanArgs(args: unknown): unknown {
  if (!isRecord(args) || "steps" in args || typeof args.summary !== "string" || !Array.isArray(args.plan)) {
    return args;
  }
  if (!args.plan.every(isLegacyStep)) return args;

  const steps = args.plan.map(({ id, description, status }) => ({ id, goal: description, status }));
  const verification = args.plan.flatMap(({ id, result }) => result ? [`${id}: ${result}`] : []);
  const progress = {
    files_changed: [] as string[],
    verification,
    decisions: args.summary ? [args.summary] : [],
  };
  return { steps, progress };
}

/** Load SoL-Pi through a facade that normalizes legacy update_plan calls. */
export async function registerSolPiCompatibility(pi: ExtensionAPI, solPi: ExtensionFactory): Promise<void> {
  const facade = Object.create(pi) as ExtensionAPI;
  if (typeof pi.on === "function") {
    const originalOn = pi.on.bind(pi) as unknown as (
      event: string,
      handler: (payload: unknown, context: ExtensionContext) => unknown,
    ) => () => void;
    facade.on = ((event: string, handler: (payload: unknown, context: ExtensionContext) => unknown) => {
      if (event === "context" || event === "tool_result" || event === "turn_end") {
        return originalOn(event, (payload, context) => {
          if (isClaudeModel(context.model)) return;
          return handler(payload, context);
        });
      }
      return originalOn(event, handler);
    }) as ExtensionAPI["on"];
  }
  facade.registerTool = ((tool) => {
    if (tool.name !== "update_plan") return pi.registerTool(tool);

    const prepareArguments = tool.prepareArguments;
    pi.registerTool({
      ...tool,
      prepareArguments: (args) => {
        const normalized = normalizeLegacyUpdatePlanArgs(args);
        return prepareArguments ? prepareArguments(normalized) : normalized as never;
      },
    } as typeof tool);
  }) as ExtensionAPI["registerTool"];

  await solPi(facade);
}

export async function tryRegisterSolPiCompatibility(
  pi: ExtensionAPI,
  agentDir: string,
  load: SolPiExtensionLoader = loadSolPiExtension,
  warn: (message: string) => void = (message) => console.warn(message),
): Promise<boolean> {
  try {
    await registerSolPiCompatibility(pi, await load(agentDir));
    return true;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    warn(`pi-context-bridge: SoL-Pi compatibility unavailable: ${detail}`);
    return false;
  }
}

export const SOL_PI_ENTRYPOINT = "sol-pi/src/sol-pi/index.ts";

export async function loadSolPiExtension(_agentDir: string): Promise<ExtensionFactory> {
  // Let Pi's module loader map host-provided peers for the local fork too.
  const loaded = await import("sol-pi/src/sol-pi/index.ts");
  if (typeof loaded.default !== "function") {
    throw new Error(`SoL-Pi entrypoint ${SOL_PI_ENTRYPOINT} has no default extension factory`);
  }
  return loaded.default;
}
