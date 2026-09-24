import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  getAgentDir,
  type ExtensionAPI,
  type ProviderModelConfig,
} from "@earendil-works/pi-coding-agent";

const PROVIDER_ENV = "PI_MANAGER_MODELS_PROVIDER";
const CONFIG_ENV = "PI_MANAGER_MODELS_CONFIG";
const REFRESH_ON_START_ENV = "PI_MANAGER_MODELS_REFRESH_ON_START";
const providerId = process.env[PROVIDER_ENV]?.trim() || "manager";
const configPath = process.env[CONFIG_ENV]?.trim() || join(getAgentDir(), "models.json");
const defaultCost = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

type ConfiguredModel = Partial<ProviderModelConfig> & { id: string };
type ProviderConfig = {
  name?: string;
  baseUrl: string;
  apiKey?: string;
  api?: ProviderModelConfig["api"];
  headers?: Record<string, string>;
  authHeader?: boolean;
  modelsEndpoint?: string;
  compat?: ProviderModelConfig["compat"];
  models?: ConfiguredModel[];
};
type ModelsFile = { providers?: Record<string, ProviderConfig | undefined> };
type ModelsResponse = { data?: Array<{ id?: unknown }> };
type JsonRecord = Record<string, unknown>;
const MODEL_DISCOVERY_TIMEOUT_MS = 10_000;

function safeEndpoint(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.username = "";
    parsed.password = "";
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return "<invalid endpoint>";
  }
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Drop static session IDs so pi-ai/the gateway can use per-session affinity. */
export function sanitizeProviderHeaders(
  headers?: Record<string, string>,
): Record<string, string> | undefined {
  if (!headers) return undefined;
  const sanitized = Object.fromEntries(
    Object.entries(headers).filter(([name, value]) => {
      const normalizedName = name.toLowerCase();
      return normalizedName !== "x-opencode-session"
        && !(normalizedName === "x-client-request-id" && value.trim() === "");
    }),
  );
  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}

export function patchDeepSeekResponsesReasoningPayload(payload: unknown): unknown | undefined {
  if (
    !isRecord(payload)
    || typeof payload.model !== "string"
    || !payload.model.toLowerCase().startsWith("deepseek")
    || !Array.isArray(payload.input)
  ) {
    return undefined;
  }

  let changed = false;
  const input = payload.input.map((item) => {
    if (!isRecord(item) || item.type !== "reasoning" || !Array.isArray(item.summary)) return item;
    if (typeof item.encrypted_content === "string" && item.encrypted_content.length > 0) return item;

    const summary = item.summary
      .flatMap((part) => isRecord(part) && typeof part.text === "string" ? [part.text] : [])
      .join("\n");
    if (!summary) return item;

    changed = true;
    return { ...item, encrypted_content: summary };
  });

  return changed ? { ...payload, input } : undefined;
}
async function loadProviderConfig(optional: boolean): Promise<ProviderConfig | undefined> {
  let contents: string;
  try {
    contents = await readFile(configPath, "utf8");
  } catch (error) {
    if (optional && (error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }

  const parsed = JSON.parse(contents) as ModelsFile;
  const config = parsed.providers?.[providerId];
  if (!config) {
    if (optional) return undefined;
    throw new Error(`Missing providers.${providerId} in ${configPath}`);
  }
  if (!config.baseUrl) throw new Error(`Missing providers.${providerId}.baseUrl in ${configPath}`);
  return config;
}

function completeModel(model: ConfiguredModel, compat?: ProviderModelConfig["compat"]): ProviderModelConfig {
  return {
    ...model,
    ...(compat || model.compat ? { compat: { ...compat, ...model.compat } } : {}),
    id: model.id,
    name: model.name ?? model.id,
    reasoning: model.reasoning ?? true,
    thinkingLevelMap: model.thinkingLevelMap ?? { xhigh: "xhigh", max: "max" },
    input: model.input ?? ["text"],
    cost: model.cost ?? defaultCost,
    contextWindow: model.contextWindow ?? 128_000,
    maxTokens: model.maxTokens ?? 16_384,
  };
}

async function resolveInitialKey(pi: ExtensionAPI, value?: string): Promise<string | undefined> {
  if (!value) return undefined;
  const env = value.match(/^\$(?:\{([^}]+)\}|([A-Za-z_][A-Za-z0-9_]*))$/);
  if (env) return process.env[env[1] ?? env[2]];
  if (!value.startsWith("!")) return value;

  const command = value.slice(1).trim();
  if (!command) return undefined;
  const shell = process.platform === "win32" ? "cmd.exe" : "sh";
  const args = process.platform === "win32" ? ["/d", "/s", "/c", command] : ["-c", command];
  const result = await pi.exec(shell, args, { timeout: 10_000 });
  if (result.code !== 0) throw new Error(`API-key command failed for ${providerId}: ${result.stderr.trim()}`);
  return result.stdout.trim() || undefined;
}

export async function discoverModels(config: ProviderConfig, apiKey?: string, signal?: AbortSignal): Promise<ProviderModelConfig[]> {
  const configured = new Map((config.models ?? []).map((model) => [model.id, model]));
  const endpoint = config.modelsEndpoint?.trim() || "models";
  const url = `${config.baseUrl.replace(/\/$/, "")}/${endpoint.replace(/^\//, "")}`;
  const timeoutSignal = AbortSignal.timeout(MODEL_DISCOVERY_TIMEOUT_MS);
  const requestSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
  let response: Response;
  try {
    response = await fetch(url, {
      signal: requestSignal,
      headers: {
        Accept: "application/json",
        ...sanitizeProviderHeaders(config.headers),
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
    });
  } catch (error) {
    if (timeoutSignal.aborted && !signal?.aborted) {
      throw new Error(`${providerId} model discovery timed out after ${MODEL_DISCOVERY_TIMEOUT_MS}ms (endpoint ${safeEndpoint(url)})`);
    }
    const reason = signal?.aborted ? "aborted" : timeoutSignal.aborted ? "timed out" : "request failed";
    throw new Error(`${providerId} model discovery failed (${reason}) for endpoint ${safeEndpoint(url)}`);
  }
  if (!response.ok) throw new Error(`${providerId} model discovery failed for endpoint ${safeEndpoint(url)}: HTTP ${response.status}`);

  const payload = await response.json() as ModelsResponse;
  if (!Array.isArray(payload.data)) throw new Error(`${providerId} model response has no data array (endpoint ${safeEndpoint(url)})`);
  const seen = new Set<string>();
  const models = payload.data.flatMap((entry) => {
    if (typeof entry.id !== "string" || !entry.id || seen.has(entry.id)) return [];
    seen.add(entry.id);
    return [completeModel(configured.get(entry.id) ?? { id: entry.id }, config.compat)];
  });
  if (!models.length) throw new Error(`${providerId} returned an empty model list (endpoint ${safeEndpoint(url)})`);
  return models;
}

export function configuredModels(config: ProviderConfig): ProviderModelConfig[] {
  return (config.models ?? []).map((model) => completeModel(model, config.compat));
}

export async function loadModels(config: ProviderConfig, apiKey?: string): Promise<ProviderModelConfig[]> {
  const configured = configuredModels(config);
  try {
    return await discoverModels(config, apiKey);
  } catch (error) {
    if (!configured.length) throw error;
    return configured;
  }
}

async function loadInitialModels(config: ProviderConfig, apiKey?: string): Promise<ProviderModelConfig[]> {
  const configured = configuredModels(config);
  if (configured.length > 0 && process.env[REFRESH_ON_START_ENV] !== "1") return configured;
  return loadModels(config, apiKey);
}

export default async function managerModels(pi: ExtensionAPI): Promise<void> {
  const initial = await loadProviderConfig(true);
  if (!initial) return;

  // Resolve $ENV / !command key references up front so a statically configured
  // model catalog can still source its credential from the environment. Plain
  // text keys pass through unchanged (no behavior change for existing configs).
  const apiKey = await resolveInitialKey(pi, initial.apiKey);
  let models = await loadInitialModels(initial, apiKey);

  pi.on("before_provider_request", (event, ctx) => {
    if (ctx.model?.provider !== providerId || ctx.model.api !== "openai-responses") return;
    return patchDeepSeekResponsesReasoningPayload(event.payload);
  });

  const providerHeaders = sanitizeProviderHeaders(initial.headers);
  pi.registerProvider(providerId, {
    ...(initial.name ? { name: initial.name } : {}),
    baseUrl: initial.baseUrl,
    ...(apiKey ? { apiKey } : {}),
    ...(initial.api ? { api: initial.api } : {}),
    ...(providerHeaders ? { headers: providerHeaders } : {}),
    ...(initial.authHeader !== undefined ? { authHeader: initial.authHeader } : {}),
    models,
    async refreshModels({ credential, allowNetwork, signal }) {
      if (!allowNetwork) return models;
      const config = await loadProviderConfig(false);
      if (!config) return models;
      const credentialKey = credential?.type === "oauth" ? credential.access : credential?.key;
      models = await discoverModels(config, credentialKey ?? await resolveInitialKey(pi, config.apiKey), signal);
      return models;
    },
  });
}
