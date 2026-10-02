import { createHash } from "node:crypto";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

type RecordLike = Record<string, unknown>;
type Target = { provider: string; id: string; api: string; baseUrl: string };
const RECEIPT_TYPE = "sol-cache-request";

function isRecord(value: unknown): value is RecordLike {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isSolCacheTarget(model: Target | undefined): boolean {
  if (!model || model.provider !== "manager" || model.api !== "openai-responses"
    || !/^gpt-\d+(?:\.\d+)?-sol$/.test(model.id)) return false;
  try {
    return new URL(model.baseUrl).hostname === "cpa.zonazcy.xyz";
  } catch {
    return false;
  }
}

/** Keep function declarations deterministic without changing the available tool set. */
export function stabilizeSolTools(payload: unknown): unknown | undefined {
  if (!isRecord(payload) || !Array.isArray(payload.tools) || payload.tools.length < 2) return undefined;
  const tools = payload.tools;
  // Mixed/built-in declarations and duplicate names keep their provider-defined order.
  if (!tools.every((tool) => isRecord(tool) && tool.type === "function" && typeof tool.name === "string")) {
    return undefined;
  }
  const names = tools.map((tool) => (tool as RecordLike).name as string);
  if (new Set(names).size !== names.length) return undefined;
  const sorted = [...tools].sort((a, b) => {
    const left = (a as RecordLike).name as string;
    const right = (b as RecordLike).name as string;
    return left < right ? -1 : left > right ? 1 : 0;
  });
  if (tools.every((tool, index) => tool === sorted[index])) return undefined;
  return { ...payload, tools: sorted };
}

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value) ?? "null").digest("hex");
}

type Fingerprint = {
  model: string;
  cacheKey: string;
  tools: string;
  settings: string;
  input: string[];
};

export type RequestComparison = {
  changes: string[];
  inputItems: number;
  commonPrefixItems: number;
  reusablePrefix: boolean;
};

export class SolRequestTracker {
  private previous: Fingerprint | undefined;

  reset(): void {
    this.previous = undefined;
  }

  observe(payload: unknown): RequestComparison | undefined {
    if (!isRecord(payload) || typeof payload.model !== "string" || !Array.isArray(payload.input)) return undefined;
    const { input, tools, prompt_cache_key, ...settings } = payload;
    const current: Fingerprint = {
      model: payload.model,
      cacheKey: digest(prompt_cache_key),
      tools: digest(tools),
      settings: digest(settings),
      input: (input as unknown[]).map(digest),
    };
    const previous = this.previous;
    this.previous = current;
    let commonPrefixItems = 0;
    const changes: string[] = [];
    if (!previous || previous.model !== current.model) {
      changes.push("cold");
    } else {
      if (previous.cacheKey !== current.cacheKey) changes.push("cache-key");
      if (previous.tools !== current.tools) changes.push("tools");
      if (previous.settings !== current.settings) changes.push("settings");
      while (commonPrefixItems < Math.min(previous.input.length, current.input.length)
        && previous.input[commonPrefixItems] === current.input[commonPrefixItems]) commonPrefixItems += 1;
      if (commonPrefixItems < previous.input.length) changes.push("history");
    }
    return {
      changes,
      inputItems: current.input.length,
      commonPrefixItems,
      reusablePrefix: changes.length === 0,
    };
  }
}

export function registerSolCacheCompatibility(pi: ExtensionAPI): void {
  let enabled = process.env.PI_SOL_CACHE_COMPAT_DISABLE !== "1";
  const tracker = new SolRequestTracker();
  let pending: (RequestComparison & { model: string }) | undefined;
  let requests = 0;
  let reordered = 0;
  let stableZeros = 0;
  let last: { changes: string[]; input: number; cached: number } | undefined;

  const reset = (): void => {
    tracker.reset();
    pending = undefined;
    requests = reordered = stableZeros = 0;
    last = undefined;
  };
  pi.on("session_start", reset);
  pi.on("session_tree", reset);

  pi.on("before_provider_request", (event, ctx) => {
    pending = undefined;
    if (!enabled || !ctx.model || !isSolCacheTarget(ctx.model) || !isRecord(event.payload)
      || event.payload.model !== ctx.model?.id) return undefined;
    const normalized = stabilizeSolTools(event.payload);
    const comparison = tracker.observe(normalized ?? event.payload);
    pending = comparison ? { ...comparison, model: ctx.model.id } : undefined;
    if (pending) requests += 1;
    if (normalized) reordered += 1;
    return normalized;
  });

  pi.on("message_end", (event) => {
    const message = event.message;
    if (!enabled || !pending || message.role !== "assistant" || message.provider !== "manager"
      || message.api !== "openai-responses" || message.model !== pending.model
      || message.stopReason === "error" || message.stopReason === "aborted") return;
    const cached = message.usage.cacheRead;
    const input = message.usage.input + cached;
    if (typeof input !== "number" || !Number.isFinite(input) || input < 0
      || typeof cached !== "number" || !Number.isFinite(cached) || cached < 0 || cached > input) return;
    const stableZero = pending.reusablePrefix && cached === 0;
    if (stableZero) stableZeros += 1;
    last = { changes: pending.changes, input, cached };
    // Only counts and comparison labels enter the session; prompts, keys and headers stay private.
    pi.appendEntry(RECEIPT_TYPE, {
      version: 1,
      ...pending,
      inputTokens: input,
      cachedTokens: cached,
      stableZero,
    });
    pending = undefined;
  });

  pi.registerCommand("sol-cache", {
    description: "Show or toggle Sol tool-order compatibility and request-prefix diagnostics",
    handler: async (args, ctx) => {
      const command = args.trim().toLowerCase();
      if (command === "on" || command === "off") {
        enabled = command === "on";
        reset();
      } else if (command && command !== "status") {
        ctx.ui.notify("Usage: /sol-cache [status|on|off]", "warning");
        return;
      }
      ctx.ui.notify(
        `sol-cache: ${enabled ? "on" : "off"}; ${requests} requests, ${reordered} tool-order normalizations, `
        + `${stableZeros} zero-cache responses with reusable observed prefixes`
        + (last ? `; last ${last.cached}/${last.input} cached tokens, changes: ${last.changes.join(", ") || "none"}` : ""),
        "info",
      );
    },
  });
}
