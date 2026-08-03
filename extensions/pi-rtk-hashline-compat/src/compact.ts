import type { ToolResultEvent } from "@earendil-works/pi-coding-agent";

export type CompatLimits = {
  maxChars?: number;
  maxLines?: number;
};

type ReadEvent = Pick<ToolResultEvent, "content" | "details" | "input">;
type CompatResult = { content: ToolResultEvent["content"]; details: unknown };
type RecordLike = Record<string, unknown>;

const HASHLINE_PATTERN = /^[A-Za-z0-9]{3}│/u;
const RTK_BANNER = "[RTK compacted output:";

function record(value: unknown): RecordLike {
  return value && typeof value === "object" && !Array.isArray(value) ? value as RecordLike : {};
}

function positiveInteger(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

function alreadyHandled(text: string, details: unknown): boolean {
  if (text.startsWith(RTK_BANNER)) return true;
  const root = record(details);
  const metadata = record(root.metadata);
  return record(root.rtkCompaction).truncated === true || record(metadata.rtkCompaction).truncated === true;
}

function findAnchorBlock(lines: string[], details: unknown): { start: number; end: number } | undefined {
  const start = lines.findIndex((line) => HASHLINE_PATTERN.test(line));
  if (start < 0) return undefined;

  let end = start;
  while (end < lines.length && HASHLINE_PATTERN.test(lines[end] ?? "")) end += 1;

  const count = end - start;
  const snapshotId = record(details).snapshotId;
  if (count < 2 && !(typeof snapshotId === "string" && snapshotId.startsWith("v1|"))) return undefined;
  return { start, end };
}

function marker(kept: number, returned: number, nextOffset: number): string {
  const omitted = returned - kept;
  return `[RTK hashline compat: ${kept}/${returned} complete anchored lines kept; ${omitted} omitted. Continue with read offset=${nextOffset}.]`;
}

function render(prefix: string[], kept: string[], notice: string): string {
  return [...prefix, ...kept, "", notice].join("\n");
}

function compactText(
  text: string,
  input: Record<string, unknown>,
  details: unknown,
  limits: CompatLimits,
): { text: string; keptLines: number; returnedLines: number; nextOffset: number } | undefined {
  if (alreadyHandled(text, details)) return undefined;

  const lines = text.split(/\r?\n/);
  const block = findAnchorBlock(lines, details);
  if (!block) return undefined;

  const anchored = lines.slice(block.start, block.end);
  if (anchored.length <= 80) return undefined;
  const maxChars = limits.maxChars ?? Number.POSITIVE_INFINITY;
  if (text.length <= maxChars && (limits.maxLines === undefined || anchored.length <= limits.maxLines)) {
    return undefined;
  }

  const prefix = lines.slice(0, block.start);
  const startOffset = positiveInteger(input.offset, 1);
  const lineLimit = limits.maxLines ?? Number.POSITIVE_INFINITY;
  const kept: string[] = [];

  for (const line of anchored) {
    if (kept.length >= lineLimit) break;
    const nextCount = kept.length + 1;
    const nextOffset = startOffset + nextCount;
    const candidate = render(prefix, [...kept, line], marker(nextCount, anchored.length, nextOffset));
    if (candidate.length > maxChars) break;
    kept.push(line);
  }

  if (kept.length === 0 || kept.length === anchored.length) return undefined;

  const nextOffset = startOffset + kept.length;
  return {
    text: render(prefix, kept, marker(kept.length, anchored.length, nextOffset)),
    keptLines: kept.length,
    returnedLines: anchored.length,
    nextOffset,
  };
}

function updatedDetails(
  details: unknown,
  compacted: { keptLines: number; returnedLines: number; nextOffset: number },
  originalChars: number,
  compactedChars: number,
): RecordLike {
  const root = record(details);
  const metrics = record(root.metrics);
  return {
    ...root,
    nextOffset: compacted.nextOffset,
    metrics: {
      ...metrics,
      truncated: true,
      next_offset: compacted.nextOffset,
    },
    rtkHashlineCompat: {
      applied: true,
      originalCharCount: originalChars,
      compactedCharCount: compactedChars,
      returnedLineCount: compacted.returnedLines,
      keptLineCount: compacted.keptLines,
      nextOffset: compacted.nextOffset,
    },
  };
}

export function compactHashlineRead(event: ReadEvent, limits: CompatLimits): CompatResult | undefined {
  let changed: ReturnType<typeof compactText>;
  const content = event.content.map((block) => {
    if (block.type !== "text" || changed) return block;
    const result = compactText(block.text, event.input, event.details, limits);
    if (!result) return block;
    changed = result;
    return { ...block, text: result.text };
  });

  if (!changed) return undefined;

  const originalChars = event.content.reduce(
    (total, block) => total + (block.type === "text" ? block.text.length : 0),
    0,
  );
  const compactedChars = content.reduce(
    (total, block) => total + (block.type === "text" ? block.text.length : 0),
    0,
  );

  return {
    content,
    details: updatedDetails(event.details, changed, originalChars, compactedChars),
  };
}
