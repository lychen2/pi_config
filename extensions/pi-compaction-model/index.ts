import { compact } from "@earendil-works/pi-coding-agent";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const PROVIDER_ENV = "PI_COMPACTION_MODEL_PROVIDER";
const MODEL_ENV = "PI_COMPACTION_MODEL";
const DISABLE_ENV = "PI_COMPACTION_MODEL_DISABLE";
const RETRIES_ENV = "PI_COMPACTION_RETRIES";
const DELAY_ENV = "PI_COMPACTION_RETRY_DELAY_MS";

const DEFAULT_PROVIDER = "manager";
const DEFAULT_MODEL = "deepseek-v4-flash";
const DEFAULT_RETRIES = 3;
const DEFAULT_DELAY_MS = 2000;
const MAX_DELAY_MS = 30_000;

// Pi's own retry classifier does not cover every transient upstream phrasing the
// gateways in front of a provider can return; "Upstream HTTP/2 stream failed" is
// one such case, so compaction needs its own classifier.
const TRANSIENT_PATTERN =
  /http2|stream failed|stream closed|stream ended|upstream|overloaded|rate.?limit|too many requests|\b(429|500|502|503|504|524)\b|service.?unavailable|server.?error|internal.?error|network.?error|connection|fetch failed|getaddrinfo|ENOTFOUND|EAI_AGAIN|ECONNRESET|ECONNREFUSED|ECONNABORTED|EPIPE|ETIMEDOUT|socket hang up|terminated|timed? out|timeout|please retry|you can retry/i;
const NON_TRANSIENT_PATTERN =
  /GoUsageLimitError|FreeUsageLimitError|Monthly usage limit reached|available balance|insufficient_quota|out of budget|quota exceeded|billing|no api key|authentication|unauthorized|invalid.?api.?key|token cap|context overflow/i;

export type CompactionTarget = { provider: string; model: string; retries: number; baseDelayMs: number };

export type CompactionOutcome<T> =
  | { ok: true; value: T }
  | { ok: false; aborted: boolean; error: unknown; attempts: number };

function readPositiveInt(value: string | undefined, fallback: number, max: number): number {
  const parsed = Number.parseInt(value?.trim() ?? "", 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.min(parsed, max);
}

/** Resolve the pinned compaction target from the environment. */
export function resolveCompactionTarget(env: NodeJS.ProcessEnv = process.env): CompactionTarget {
  return {
    provider: env[PROVIDER_ENV]?.trim() || DEFAULT_PROVIDER,
    model: env[MODEL_ENV]?.trim() || DEFAULT_MODEL,
    retries: readPositiveInt(env[RETRIES_ENV], DEFAULT_RETRIES, 10),
    baseDelayMs: readPositiveInt(env[DELAY_ENV], DEFAULT_DELAY_MS, MAX_DELAY_MS),
  };
}

export function isCompactionModelDisabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const value = env[DISABLE_ENV]?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

/** Pi accepts `Record<string, string | null>` headers; a null value deletes the header. */
export function withoutNullHeaders(
  headers: Record<string, string | null> | undefined,
): Record<string, string> | undefined {
  if (!headers) return undefined;
  const entries = Object.entries(headers).filter(
    (entry): entry is [string, string] => typeof entry[1] === "string",
  );
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function isAbortError(error: unknown): boolean {
  if (error instanceof Error && error.name === "AbortError") return true;
  return /abort/i.test(errorMessage(error));
}

/** A failure worth retrying at the compaction layer. */
export function isTransientCompactionError(error: unknown): boolean {
  const message = errorMessage(error);
  if (NON_TRANSIENT_PATTERN.test(message)) return false;
  return TRANSIENT_PATTERN.test(message);
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error("Aborted"));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new Error("Aborted"));
      },
      { once: true },
    );
  });
}

/**
 * Run `run` with bounded exponential backoff.
 *
 * Aborts are terminal, non-transient failures fail fast, and the initial call
 * never counts as a retry.
 */
export async function runWithRetry<T>(
  run: () => Promise<T>,
  options: {
    attempts: number;
    baseDelayMs: number;
    signal?: AbortSignal;
    isTransient?: (error: unknown) => boolean;
    onRetry?: (attempt: number, delayMs: number, error: unknown) => void | Promise<void>;
  },
): Promise<CompactionOutcome<T>> {
  const isTransient = options.isTransient ?? isTransientCompactionError;
  let attempt = 0;
  let lastError: unknown;
  for (;;) {
    attempt++;
    try {
      return { ok: true, value: await run() };
    } catch (error) {
      lastError = error;
      if (isAbortError(error) || options.signal?.aborted) {
        return { ok: false, aborted: true, error, attempts: attempt };
      }
      if (attempt >= options.attempts || !isTransient(error)) {
        return { ok: false, aborted: false, error, attempts: attempt };
      }
      const delayMs = Math.min(options.baseDelayMs * 2 ** (attempt - 1), MAX_DELAY_MS);
      await options.onRetry?.(attempt, delayMs, error);
      try {
        await sleep(delayMs, options.signal);
      } catch {
        return { ok: false, aborted: true, error: lastError, attempts: attempt };
      }
    }
  }
}

function notify(ctx: ExtensionContext, message: string, type: "info" | "warning" | "error"): void {
  if (ctx.hasUI) ctx.ui.notify(message, type);
}

export default function compactionModel(pi: ExtensionAPI): void {
  pi.on("session_before_compact", async (event, ctx) => {
    if (isCompactionModelDisabled()) return undefined;
    if (event.signal.aborted) return { cancel: true };

    const target = resolveCompactionTarget();
    const model = ctx.modelRegistry.find(target.provider, target.model);
    if (!model) {
      notify(
        ctx,
        `Compaction model ${target.provider}/${target.model} is not configured; using the session model.`,
        "warning",
      );
      return undefined;
    }

    const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
    if (!auth.ok) {
      notify(ctx, `Compaction model ${target.provider}/${target.model} has no auth: ${auth.error}`, "warning");
      return undefined;
    }

    // `baseUrl` is absent from `getApiKeyAndHeaders` before Pi 0.84, so read it defensively.
    const authBaseUrl = (auth as { baseUrl?: string }).baseUrl;
    const requestModel = authBaseUrl ? { ...model, baseUrl: authBaseUrl } : model;
    const attempts = target.retries + 1;
    const outcome = await runWithRetry(
      () =>
        compact(
          event.preparation,
          requestModel,
          auth.apiKey,
          withoutNullHeaders(auth.headers),
          event.customInstructions,
          event.signal,
          ctx.thinkingLevel,
          undefined,
          auth.env,
        ),
      {
        attempts,
        baseDelayMs: target.baseDelayMs,
        signal: event.signal,
        onRetry: (attempt, delayMs, error) => {
          notify(
            ctx,
            `Compaction retry ${attempt}/${target.retries} in ${delayMs}ms: ${errorMessage(error)}`,
            "warning",
          );
        },
      },
    );

    if (outcome.ok) return { compaction: outcome.value };
    if (outcome.aborted) return { cancel: true };

    notify(
      ctx,
      `Compaction with ${target.provider}/${target.model} failed after ${outcome.attempts} attempt(s): ${errorMessage(outcome.error)}. Falling back to the session model.`,
      "warning",
    );
    return undefined;
  });
}
