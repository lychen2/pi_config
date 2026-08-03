import { readFileSync } from "node:fs";
import { join } from "node:path";

import { getAgentDir } from "@earendil-works/pi-coding-agent";

import type { CompatLimits } from "./compact.ts";

type RecordLike = Record<string, unknown>;

const DEFAULT_MAX_CHARS = 12_000;
const MIN_MAX_CHARS = 1_000;
const MAX_MAX_CHARS = 200_000;
const MIN_MAX_LINES = 40;
const MAX_MAX_LINES = 4_000;

function record(value: unknown): RecordLike {
  return value && typeof value === "object" && !Array.isArray(value) ? value as RecordLike : {};
}

function boolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function boundedInteger(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, Math.floor(value)))
    : fallback;
}

export function limitsFromRtkConfig(value: unknown): CompatLimits | undefined {
  const config = record(value);
  const output = record(config.outputCompaction);
  const readCompaction = record(output.readCompaction);
  const truncate = record(output.truncate);
  const smartTruncate = record(output.smartTruncate);

  if (!boolean(config.enabled, true)) return undefined;
  if (!boolean(output.enabled, true)) return undefined;
  if (!boolean(readCompaction.enabled, false)) return undefined;
  const hardTruncateEnabled = boolean(truncate.enabled, true);
  const smartTruncateEnabled = boolean(smartTruncate.enabled, false);
  if (!hardTruncateEnabled && !smartTruncateEnabled) return undefined;

  const maxChars = hardTruncateEnabled
    ? boundedInteger(
      truncate.maxChars,
      DEFAULT_MAX_CHARS,
      MIN_MAX_CHARS,
      MAX_MAX_CHARS,
    )
    : undefined;
  const maxLines = smartTruncateEnabled
    ? boundedInteger(smartTruncate.maxLines, 220, MIN_MAX_LINES, MAX_MAX_LINES)
    : undefined;

  return {
    ...(maxChars === undefined ? {} : { maxChars }),
    ...(maxLines === undefined ? {} : { maxLines }),
  };
}

function configPath(): string {
  return join(getAgentDir(), "extensions", "pi-rtk-optimizer", "config.json");
}

export function loadCompatLimits(): CompatLimits | undefined {
  if (process.env.PI_RTK_HASHLINE_COMPAT_DISABLE === "1") return undefined;

  const override = Number.parseInt(process.env.PI_RTK_HASHLINE_MAX_CHARS ?? "", 10);
  if (Number.isFinite(override)) {
    return {
      maxChars: boundedInteger(override, DEFAULT_MAX_CHARS, MIN_MAX_CHARS, MAX_MAX_CHARS),
    };
  }

  try {
    return limitsFromRtkConfig(JSON.parse(readFileSync(configPath(), "utf8")));
  } catch {
    return undefined;
  }
}
