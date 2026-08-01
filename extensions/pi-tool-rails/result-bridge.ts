import { readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import {
  ToolExecutionComponent,
  keyHint,
  type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import { sliceByColumn, Text, truncateToWidth, visibleWidth, type Component } from "@earendil-works/pi-tui";

type Theme = {
  fg(
    color: "dim" | "error" | "muted" | "toolDiffAdded" | "toolDiffRemoved" | "toolOutput",
    text: string,
  ): string;
};
type ResultOptions = { expanded?: boolean; isPartial?: boolean };
type ResultContext = { isError?: boolean; lastComponent?: unknown; [key: string]: unknown };
type ResultRenderer = (
  result: unknown,
  options: ResultOptions,
  theme: Theme,
  context: ResultContext,
) => Component;
type GetResultRenderer = (this: ToolExecutionComponent) => ResultRenderer | undefined;
type RendererPrototype = { getResultRenderer?: GetResultRenderer };
type ResultPatch = {
  original: GetResultRenderer;
  patched: GetResultRenderer;
  owners: Set<symbol>;
};
type RecordLike = Record<string, unknown>;
type DiffKind = "add" | "context" | "meta" | "remove";
type ReplaceDiffEntry = {
  kind: DiffKind;
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
};
type ReplaceDiffRow = { left?: ReplaceDiffEntry; right?: ReplaceDiffEntry; meta?: string };
type ReadDisplayEntry =
  | { kind: "line"; content: string; lineNumber: number }
  | { kind: "meta"; content: string };

const ANSI_ESCAPE = /\x1B(?:\][^\x07\x1B]*(?:\x07|\x1B\\)|\[[0-?]*[ -/]*[@-~]|[@-Z\\-_])/g;
const HASHLINE_DIFF = /^([ +\-])((?:[A-Za-z0-9_-]{3}| {3}))│(.*)$/;
const HASHLINE_READ = /^[A-Za-z0-9_-]{3}│(.*)$/;
const RESULT_PATCH = Symbol.for("pi.toolRails.resultRendererPatch");
const REPLACE_LINE_NUMBERS = "toolRailsNewLineNumbers";
const REPLACE_FINAL_LINE_COUNT = "toolRailsFinalLineCount";
const COMPACT_RESULTS = new Set(["bash", "find", "grep", "ls"]);
const PREVIEW_LINES = 5;
const REPLACE_PREVIEW_ROWS = 10;
const SPLIT_SEPARATOR = " │ ";
const MIN_SPLIT_WIDTH = 58;

function record(value: unknown): RecordLike {
  return value && typeof value === "object" && !Array.isArray(value) ? value as RecordLike : {};
}

function outputLines(result: unknown): string[] {
  const content = record(result).content;
  if (!Array.isArray(content)) return [];
  const text = content
    .filter((block): block is RecordLike => Boolean(block) && typeof block === "object" && !Array.isArray(block))
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text as string)
    .join("\n")
    .replace(ANSI_ESCAPE, "")
    .replace(/\r/g, "")
    .trimEnd();
  return text ? text.split("\n") : [];
}

function reusableText(context: ResultContext, content: string): Text {
  const text = context.lastComponent instanceof Text ? context.lastComponent : new Text("", 0, 0);
  text.setText(content);
  return text;
}

function preview(
  lines: string[],
  options: ResultOptions,
  theme: Theme,
  context: ResultContext,
  direction: "head" | "tail",
): string {
  const shown = options.expanded
    ? lines
    : direction === "tail"
      ? lines.slice(-PREVIEW_LINES)
      : lines.slice(0, PREVIEW_LINES);
  const color = context.isError ? "error" : "toolOutput";
  let text = shown.map((line) => theme.fg(color, line || " ")).join("\n");

  const remaining = lines.length - shown.length;
  if (remaining > 0) {
    const position = direction === "tail" ? "earlier" : "more";
    const hint = theme.fg(
      "muted",
      `${remaining} ${position} ${remaining === 1 ? "line" : "lines"} · ${keyHint("app.tools.expand", "expand")}`,
    );
    text = direction === "tail" ? `${hint}\n${text}` : `${text}\n${hint}`;
  }
  return text;
}

function compactResult(
  name: string,
  result: unknown,
  options: ResultOptions,
  theme: Theme,
  context: ResultContext,
): Component {
  const lines = outputLines(result);

  if (name === "bash") {
    const bashLines = lines.length === 1 && /^\(?no output\)?$/i.test(lines[0]!.trim()) ? [] : lines;
    if (options.isPartial && bashLines.length === 0) return reusableText(context, "");
    if (context.isError && bashLines.length === 0) {
      return reusableText(context, theme.fg("error", "command failed"));
    }
    if (bashLines.length === 0) return reusableText(context, theme.fg("muted", "completed"));
    return reusableText(context, preview(bashLines, options, theme, context, "tail"));
  }

  if (options.isPartial) return reusableText(context, "");
  if (context.isError) {
    return reusableText(context, preview(lines.length ? lines : ["tool failed"], options, theme, context, "head"));
  }
  if (options.expanded) {
    return reusableText(context, preview(lines.length ? lines : ["(no results)"], options, theme, context, "head"));
  }

  const count = lines.filter((line) => line.trim()).length;
  const unit = name === "grep"
    ? (count === 1 ? "match" : "matches")
    : (count === 1 ? "result" : "results");
  const hint = count > 0 ? ` · ${keyHint("app.tools.expand", "expand")}` : "";
  return reusableText(context, theme.fg("muted", `${count} ${unit}${hint}`));
}

export function parseHashlineReadOutput(lines: string[], startLine = 1): ReadDisplayEntry[] {
  let nextLine = Number.isInteger(startLine) && startLine > 0 ? startLine : 1;
  return lines.map((rawLine) => {
    const match = rawLine.match(HASHLINE_READ);
    if (!match) return { kind: "meta", content: rawLine };
    return { kind: "line", content: match[1] ?? "", lineNumber: nextLine++ };
  });
}

function hasHashlineReadRows(result: unknown): boolean {
  return outputLines(result).some((line) => HASHLINE_READ.test(line));
}

function readLineNumberWidth(entries: ReadDisplayEntry[]): number {
  const maximum = entries.reduce(
    (value, entry) => entry.kind === "line" ? Math.max(value, entry.lineNumber) : value,
    0,
  );
  return Math.max(3, String(maximum || 1).length);
}

function formatReadEntryLines(
  entry: ReadDisplayEntry,
  width: number,
  numberWidth: number,
  theme: Theme,
 ): string[] {
  const divider = theme.fg("dim", "│");
  if (entry.kind === "meta") {
    if (!entry.content) return [fitCell("", width)];
    const prefix = `${" ".repeat(numberWidth)} ${divider} `;
    return wrapCellContent(prefix, prefix, theme.fg("muted", entry.content), width);
  }

  const prefix = `${theme.fg("muted", String(entry.lineNumber).padStart(numberWidth))} ${divider} `;
  const continuationPrefix = `${" ".repeat(numberWidth)} ${divider} `;
  const content = entry.content.replace(/\t/g, "    ");
  return wrapCellContent(prefix, continuationPrefix, theme.fg("toolOutput", content), width);
}

class HashlineReadComponent implements Component {
  private entries: ReadDisplayEntry[];
  private remaining: number;
  private theme: Theme;

  constructor(entries: ReadDisplayEntry[], remaining: number, theme: Theme) {
    this.entries = entries;
    this.remaining = remaining;
    this.theme = theme;
  }

  update(entries: ReadDisplayEntry[], remaining: number, theme: Theme): void {
    this.entries = entries;
    this.remaining = remaining;
    this.theme = theme;
  }

  render(width: number): string[] {
    const safeWidth = Math.max(1, width);
    const numberWidth = readLineNumberWidth(this.entries);
    const lines = this.entries.flatMap((entry) =>
      formatReadEntryLines(entry, safeWidth, numberWidth, this.theme)
    );
    if (this.remaining > 0) {
      lines.push(fitCell(this.theme.fg(
        "muted",
        `${this.remaining} more ${this.remaining === 1 ? "line" : "lines"} · ${keyHint("app.tools.expand", "expand")}`,
      ), safeWidth));
    }
    return lines.map((line) => truncateToWidth(line, safeWidth, ""));
  }

  invalidate(): void {}
}

export function renderHashlineReadResult(
  result: unknown,
  options: ResultOptions,
  theme: Theme,
  context: ResultContext,
 ): Component {
  if (!options.expanded && !context.isError) return reusableText(context, "");
  const args = record(context.args);
  const startLine = typeof args.offset === "number" && Number.isInteger(args.offset) && args.offset > 0
    ? args.offset
    : 1;
  const entries = parseHashlineReadOutput(outputLines(result), startLine);
  const maxEntries = options.expanded ? entries.length : 10;
  const shown = entries.slice(0, maxEntries);
  const remaining = entries.length - shown.length;
  const existing = context.lastComponent;
  if (existing instanceof HashlineReadComponent) {
    existing.update(shown, remaining, theme);
    return existing;
  }
  return new HashlineReadComponent(shown, remaining, theme);
}

export function parseReplaceDiff(diff: string): ReplaceDiffEntry[] {
  const entries: ReplaceDiffEntry[] = [];
  for (const rawLine of diff.replace(/\r/g, "").split("\n")) {
    const hashline = rawLine.match(HASHLINE_DIFF);
    if (hashline) {
      const prefix = hashline[1];
      entries.push({
        kind: prefix === "+" ? "add" : prefix === "-" ? "remove" : "context",
        content: hashline[3] ?? "",
      });
      continue;
    }

    if (rawLine.startsWith("+") && !rawLine.startsWith("+++")) {
      entries.push({ kind: "add", content: rawLine.slice(1) });
    } else if (rawLine.startsWith("-") && !rawLine.startsWith("---")) {
      entries.push({ kind: "remove", content: rawLine.slice(1) });
    } else if (rawLine.startsWith(" ") && rawLine.trim() !== "...") {
      entries.push({ kind: "context", content: rawLine.slice(1) });
    } else if (rawLine.trim()) {
      entries.push({ kind: "meta", content: rawLine.trim() });
    }
  }
  return entries;
}

function visibleFileLines(content: string): string[] {
  const lines = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  if (lines.at(-1) === "") lines.pop();
  return lines;
}

export function locateNewLineNumbers(
  entries: ReplaceDiffEntry[],
  fileContent: string,
  firstChangedLine?: number,
): Array<number | null> {
  const fileLines = visibleFileLines(fileContent);
  const firstChange = entries.findIndex((entry) => entry.kind === "add" || entry.kind === "remove");
  let segmentStart = firstChange < 0 ? 0 : firstChange;
  while (segmentStart > 0 && entries[segmentStart - 1]?.kind !== "meta") segmentStart--;
  const visibleBeforeChange = firstChange < 0
    ? 0
    : entries.slice(segmentStart, firstChange).filter((entry) => entry.kind !== "remove").length;
  let cursor = firstChangedLine === undefined
    ? 0
    : Math.max(0, firstChangedLine - 1 - visibleBeforeChange);

  return entries.map((entry) => {
    if (entry.kind === "remove" || entry.kind === "meta") return null;
    let found = -1;
    for (let index = cursor; index < fileLines.length; index++) {
      if (fileLines[index] === entry.content) {
        found = index;
        break;
      }
    }
    if (found < 0) return null;
    cursor = found + 1;
    return found + 1;
  });
}

function fallbackNewLineNumbers(entries: ReplaceDiffEntry[], firstChangedLine?: number): Array<number | null> {
  const numbers = entries.map(() => null as number | null);
  if (firstChangedLine === undefined) return numbers;
  const firstChange = entries.findIndex((entry) => entry.kind === "add" || entry.kind === "remove");
  if (firstChange < 0) return numbers;

  let segmentStart = firstChange;
  while (segmentStart > 0 && entries[segmentStart - 1]?.kind !== "meta") segmentStart--;
  const visibleBeforeChange = entries
    .slice(segmentStart, firstChange)
    .filter((entry) => entry.kind !== "remove").length;
  let cursor = Math.max(1, firstChangedLine - visibleBeforeChange);
  for (let index = segmentStart; index < entries.length; index++) {
    const entry = entries[index]!;
    if (index > firstChange && entry.kind === "meta") break;
    if (entry.kind === "add" || entry.kind === "context") numbers[index] = cursor++;
  }
  return numbers;
}

function numberedEntries(
  entries: ReplaceDiffEntry[],
  storedNewNumbers: Array<number | null>,
  firstChangedLine?: number,
  finalLineCount?: number,
): ReplaceDiffEntry[] {
  const fallback = fallbackNewLineNumbers(entries, firstChangedLine);
  const newNumbers = entries.map((_, index) => storedNewNumbers[index] ?? fallback[index] ?? null);
  let delta = 0;
  let newCursor: number | undefined;

  const nextKnownNewLine = (start: number): number | undefined => {
    for (let index = start; index < newNumbers.length; index++) {
      const line = newNumbers[index];
      if (line !== null) return line;
    }
    return finalLineCount === undefined ? undefined : finalLineCount + 1;
  };

  return entries.map((entry, index) => {
    if (entry.kind === "meta") {
      newCursor = undefined;
      return { ...entry };
    }
    if (entry.kind === "remove") {
      const position = newCursor ?? nextKnownNewLine(index + 1);
      const oldLineNumber = position === undefined ? undefined : position - delta;
      delta--;
      return { ...entry, oldLineNumber };
    }

    const newLineNumber = newNumbers[index] ?? newCursor;
    if (newLineNumber !== undefined && newLineNumber !== null) newCursor = newLineNumber + 1;
    if (entry.kind === "add") {
      delta++;
      return { ...entry, newLineNumber: newLineNumber ?? undefined };
    }
    return {
      ...entry,
      oldLineNumber: newLineNumber === undefined || newLineNumber === null ? undefined : newLineNumber - delta,
      newLineNumber: newLineNumber ?? undefined,
    };
  });
}

function buildReplaceRows(entries: ReplaceDiffEntry[]): ReplaceDiffRow[] {
  const rows: ReplaceDiffRow[] = [];
  let removed: ReplaceDiffEntry[] = [];
  let added: ReplaceDiffEntry[] = [];

  const flushChanges = () => {
    const count = Math.max(removed.length, added.length);
    for (let index = 0; index < count; index++) {
      rows.push({ left: removed[index], right: added[index] });
    }
    removed = [];
    added = [];
  };

  for (const entry of entries) {
    if (entry.kind === "remove") {
      removed.push(entry);
      continue;
    }
    if (entry.kind === "add") {
      added.push(entry);
      continue;
    }

    flushChanges();
    if (entry.kind === "context") {
      rows.push({ left: entry, right: entry });
    } else {
      rows.push({ meta: entry.content });
    }
  }
  flushChanges();
  return rows;
}

function fitCell(text: string, width: number): string {
  const clipped = truncateToWidth(text, Math.max(0, width), "");
  return clipped + " ".repeat(Math.max(0, width - visibleWidth(clipped)));
}

function lineNumberWidth(rows: ReplaceDiffRow[]): number {
  let maximum = 0;
  for (const row of rows) {
    maximum = Math.max(
      maximum,
      row.left?.oldLineNumber ?? 0,
      row.right?.newLineNumber ?? 0,
    );
  }
  return Math.max(3, String(maximum || 1).length);
}

function formatLineNumber(value: number | undefined, width: number): string {
  return value === undefined ? " ".repeat(width) : String(value).padStart(width);
}
function wrapCellContent(
  prefix: string,
  continuationPrefix: string,
  content: string,
  width: number,
): string[] {
  const contentWidth = visibleWidth(content);
  if (contentWidth === 0) return [fitCell(prefix, width)];

  const lines: string[] = [];
  let column = 0;
  while (column < contentWidth) {
    const currentPrefix = lines.length === 0 ? prefix : continuationPrefix;
    const availableWidth = Math.max(1, width - visibleWidth(currentPrefix));
    let chunk = sliceByColumn(content, column, availableWidth, true);
    let chunkWidth = visibleWidth(chunk);
    if (chunkWidth === 0) {
      chunk = sliceByColumn(content, column, availableWidth, false);
      chunkWidth = visibleWidth(chunk);
    }
    lines.push(fitCell(`${currentPrefix}${chunk}`, width));
    column += chunkWidth;
  }
  return lines;
}

function formatDiffEntryLines(
  entry: ReplaceDiffEntry | undefined,
  side: "left" | "right",
  width: number,
  numberWidth: number,
  theme: Theme,
): string[] {
  const number = side === "left" ? entry?.oldLineNumber : entry?.newLineNumber;
  const prefix = `${theme.fg("muted", formatLineNumber(number, numberWidth))} ${theme.fg("dim", "│")} `;
  if (!entry) return [fitCell(prefix, width)];

  const code = entry.content.replace(/\t/g, "    ");
  const indentation = code.match(/^\s*/)?.[0] ?? "";
  const continuationPrefix = `${" ".repeat(numberWidth)} ${theme.fg("dim", "│")} ${" ".repeat(2 + visibleWidth(indentation))}`;
  const marker = entry.kind === "add" ? "+" : entry.kind === "remove" ? "-" : " ";
  const color = entry.kind === "add"
    ? "toolDiffAdded"
    : entry.kind === "remove"
      ? "toolDiffRemoved"
      : "toolOutput";
  const firstPrefix = `${prefix}${theme.fg(color, marker)} `;
  return wrapCellContent(firstPrefix, continuationPrefix, theme.fg(color, code), width);
}

function formatMetaCellLines(text: string, width: number, numberWidth: number, theme: Theme): string[] {
  const prefix = `${" ".repeat(numberWidth)} ${theme.fg("dim", "│")} `;
  return wrapCellContent(prefix, prefix, theme.fg("muted", text), width);
}

function topBorderCell(width: number, numberWidth: number, theme: Theme): string {
  const chars = "─".repeat(Math.max(0, width)).split("");
  const divider = numberWidth + 1;
  if (divider < chars.length) chars[divider] = "┬";
  return theme.fg("dim", chars.join(""));
}

function headerCell(label: "old" | "new", width: number, numberWidth: number, theme: Theme): string {
  const prefix = `${theme.fg("muted", label.padEnd(numberWidth))} ${theme.fg("dim", "│")} `;
  return fitCell(prefix, width);
}

function diffSummary(width: number, additions: number, removals: number, mode: "split" | "unified", theme: Theme): string {
  const text = [
    theme.fg("toolOutput", "↳ diff"),
    theme.fg("toolDiffAdded", `+${additions}`),
    theme.fg("toolDiffRemoved", `-${removals}`),
    theme.fg("muted", mode),
  ].join(" ");
  return fitCell(text, width);
}

function visibleRows(rows: ReplaceDiffRow[], expanded: boolean): { rows: ReplaceDiffRow[]; remaining: number } {
  if (expanded || rows.length <= REPLACE_PREVIEW_ROWS) return { rows, remaining: 0 };
  return { rows: rows.slice(0, REPLACE_PREVIEW_ROWS), remaining: rows.length - REPLACE_PREVIEW_ROWS };
}

function renderSplitDiff(
  rows: ReplaceDiffRow[],
  width: number,
  theme: Theme,
  additions: number,
  removals: number,
): string[] {
  const separatorWidth = visibleWidth(SPLIT_SEPARATOR);
  const leftWidth = Math.floor((width - separatorWidth) / 2);
  const rightWidth = width - separatorWidth - leftWidth;
  const numberWidth = lineNumberWidth(rows);
  const separator = theme.fg("dim", SPLIT_SEPARATOR);
  const topSeparator = theme.fg("dim", "─┼─");
  const output = [
    diffSummary(width, additions, removals, "split", theme),
    `${topBorderCell(leftWidth, numberWidth, theme)}${topSeparator}${topBorderCell(rightWidth, numberWidth, theme)}`,
    `${headerCell("old", leftWidth, numberWidth, theme)}${separator}${headerCell("new", rightWidth, numberWidth, theme)}`,
  ];

  const emptyLeft = formatDiffEntryLines(undefined, "left", leftWidth, numberWidth, theme)[0]!;
  const emptyRight = formatDiffEntryLines(undefined, "right", rightWidth, numberWidth, theme)[0]!;
  for (const row of rows) {
    const leftLines = row.meta !== undefined
      ? formatMetaCellLines(row.meta, leftWidth, numberWidth, theme)
      : formatDiffEntryLines(row.left, "left", leftWidth, numberWidth, theme);
    const rightLines = row.meta !== undefined
      ? formatMetaCellLines(row.meta, rightWidth, numberWidth, theme)
      : formatDiffEntryLines(row.right, "right", rightWidth, numberWidth, theme);
    const height = Math.max(leftLines.length, rightLines.length);
    for (let index = 0; index < height; index++) {
      output.push(
        `${leftLines[index] ?? emptyLeft}${separator}${rightLines[index] ?? emptyRight}`,
      );
    }
  }
  return output;
}

function renderUnifiedDiff(
  rows: ReplaceDiffRow[],
  width: number,
  theme: Theme,
  additions: number,
  removals: number,
): string[] {
  const numberWidth = lineNumberWidth(rows);
  const gutter = (oldLine?: number, newLine?: number) =>
    `${theme.fg("muted", formatLineNumber(oldLine, numberWidth))} ${theme.fg("muted", formatLineNumber(newLine, numberWidth))} ${theme.fg("dim", "│")} `;
  const output = [
    diffSummary(width, additions, removals, "unified", theme),
    fitCell(`${theme.fg("muted", "old".padEnd(numberWidth))} ${theme.fg("muted", "new".padEnd(numberWidth))} ${theme.fg("dim", "│")}`, width),
  ];
  for (const row of rows) {
    if (row.meta !== undefined) {
      output.push(...wrapCellContent(gutter(), gutter(), theme.fg("muted", row.meta), width));
      continue;
    }
    const entries = row.left?.kind === "context"
      ? [row.left]
      : [row.left, row.right].filter((entry): entry is ReplaceDiffEntry => entry !== undefined);
    for (const entry of entries) {
      const marker = entry.kind === "add" ? "+" : entry.kind === "remove" ? "-" : " ";
      const color = entry.kind === "add"
        ? "toolDiffAdded"
        : entry.kind === "remove"
          ? "toolDiffRemoved"
          : "toolOutput";
      const code = entry.content.replace(/\t/g, "    ");
      const indentation = code.match(/^\s*/)?.[0] ?? "";
      const firstPrefix = `${gutter(entry.oldLineNumber, entry.newLineNumber)}${theme.fg(color, marker)} `;
      const continuationPrefix = `${gutter()}${" ".repeat(2 + visibleWidth(indentation))}`;
      output.push(...wrapCellContent(
        firstPrefix,
        continuationPrefix,
        theme.fg(color, code),
        width,
      ));
    }
  }
  return output;
}

class ReplaceDiffComponent implements Component {
  private entries: ReplaceDiffEntry[];
  private expanded: boolean;
  private theme: Theme;

  constructor(entries: ReplaceDiffEntry[], expanded: boolean, theme: Theme) {
    this.entries = entries;
    this.expanded = expanded;
    this.theme = theme;
  }

  update(entries: ReplaceDiffEntry[], expanded: boolean, theme: Theme): void {
    this.entries = entries;
    this.expanded = expanded;
    this.theme = theme;
  }

  render(width: number): string[] {
    const safeWidth = Math.max(1, width);
    const additions = this.entries.filter((entry) => entry.kind === "add").length;
    const removals = this.entries.filter((entry) => entry.kind === "remove").length;
    const preview = visibleRows(buildReplaceRows(this.entries), this.expanded);
    const lines = safeWidth >= MIN_SPLIT_WIDTH
      ? renderSplitDiff(preview.rows, safeWidth, this.theme, additions, removals)
      : renderUnifiedDiff(preview.rows, safeWidth, this.theme, additions, removals);

    if (preview.remaining > 0) {
      lines.push(fitCell(this.theme.fg(
        "muted",
        `${preview.remaining} more ${preview.remaining === 1 ? "row" : "rows"} · ${keyHint("app.tools.expand", "expand")}`,
      ), safeWidth));
    }
    return lines.map((line) => truncateToWidth(line, safeWidth, ""));
  }

  invalidate(): void {}
}

function diffFromResult(result: unknown): string {
  const diff = record(record(result).details).diff;
  return typeof diff === "string" ? diff : "";
}

export function renderReplaceDiffResult(
  result: unknown,
  options: ResultOptions,
  theme: Theme,
  context: ResultContext,
): Component {
  if (options.isPartial) return reusableText(context, "");
  const details = record(record(result).details);
  const diff = typeof details.diff === "string" ? details.diff : "";
  const rawEntries = diff ? parseReplaceDiff(diff) : [];
  const hasChanges = rawEntries.some((entry) => entry.kind === "add" || entry.kind === "remove");
  if (!hasChanges) {
    const lines = outputLines(result);
    const fallback = lines.length ? lines : [context.isError ? "replace failed" : "replace completed"];
    return reusableText(context, preview(fallback, options, theme, context, "head"));
  }

  const storedNumbers = Array.isArray(details[REPLACE_LINE_NUMBERS])
    ? details[REPLACE_LINE_NUMBERS].map((value) => typeof value === "number" ? value : null)
    : [];
  const firstChangedLine = typeof details.firstChangedLine === "number" ? details.firstChangedLine : undefined;
  const finalLineCount = typeof details[REPLACE_FINAL_LINE_COUNT] === "number"
    ? details[REPLACE_FINAL_LINE_COUNT]
    : undefined;
  const entries = numberedEntries(rawEntries, storedNumbers, firstChangedLine, finalLineCount);
  const existing = context.lastComponent;
  if (existing instanceof ReplaceDiffComponent) {
    existing.update(entries, options.expanded === true, theme);
    return existing;
  }
  return new ReplaceDiffComponent(entries, options.expanded === true, theme);
}

function release(
  shared: typeof globalThis & Record<symbol, unknown>,
  prototype: RendererPrototype,
  patch: ResultPatch,
  owner: symbol,
): void {
  patch.owners.delete(owner);
  if (patch.owners.size > 0) return;
  if (prototype.getResultRenderer === patch.patched) {
    prototype.getResultRenderer = patch.original;
  }
  if (shared[RESULT_PATCH] === patch) delete shared[RESULT_PATCH];
}

function installResultBridge(): () => void {
  const shared = globalThis as typeof globalThis & Record<symbol, unknown>;
  const prototype = ToolExecutionComponent.prototype as unknown as RendererPrototype;
  const owner = Symbol("pi.toolRails.resultRenderer");
  const existing = shared[RESULT_PATCH] as Partial<ResultPatch> | undefined;
  if (existing?.original && existing.patched && existing.owners) {
    const patch = existing as ResultPatch;
    patch.owners.add(owner);
    return () => release(shared, prototype, patch, owner);
  }
  if (typeof prototype.getResultRenderer !== "function") return () => {};

  const state = {
    original: prototype.getResultRenderer,
    owners: new Set<symbol>([owner]),
  };
  const patched: GetResultRenderer = function (): ResultRenderer | undefined {
    const nativeRenderer = state.original.call(this);
    const name = (this as unknown as { toolName?: string }).toolName;
    if (name === "replace") {
      return (result, options, theme, context) => renderReplaceDiffResult(result, options, theme, context);
    }
    if (name === "read") {
      return (result, options, theme, context) => {
        if (hasHashlineReadRows(result)) {
          return renderHashlineReadResult(result, options, theme, context);
        }
        if (nativeRenderer) return nativeRenderer(result, options, theme, context);
        const lines = outputLines(result);
        return reusableText(
          context,
          preview(lines.length ? lines : [context.isError ? "read failed" : ""], options, theme, context, "head"),
        );
      };
    }
    if (!name || !COMPACT_RESULTS.has(name)) return nativeRenderer;
    return (result, options, theme, context) => compactResult(name, result, options, theme, context);
  };

  const patch: ResultPatch = { ...state, patched };
  shared[RESULT_PATCH] = patch;
  prototype.getResultRenderer = patched;
  return () => release(shared, prototype, patch, owner);
}

export default function resultBridge(pi: ExtensionAPI): void {
  let cleanup = () => {};

  pi.on("tool_result", async (event, ctx) => {
    if (event.toolName !== "replace" || event.isError) return;
    const details = record(event.details);
    if (typeof details.diff !== "string" || !details.diff.trim()) return;
    const input = record(event.input);
    const rawPath = typeof input.path === "string" ? input.path.replace(/^@/, "") : "";
    if (!rawPath) return;

    try {
      const absolutePath = isAbsolute(rawPath) ? rawPath : resolve(ctx.cwd, rawPath);
      const fileContent = await readFile(absolutePath, "utf8");
      const entries = parseReplaceDiff(details.diff);
      const firstChangedLine = typeof details.firstChangedLine === "number" ? details.firstChangedLine : undefined;
      return {
        details: {
          ...details,
          [REPLACE_LINE_NUMBERS]: locateNewLineNumbers(entries, fileContent, firstChangedLine),
          [REPLACE_FINAL_LINE_COUNT]: visibleFileLines(fileContent).length,
        },
      };
    } catch {
      return;
    }
  });

  pi.on("session_start", (_event, ctx) => {
    if (ctx.mode === "tui") cleanup = installResultBridge();
  });
  pi.on("session_shutdown", () => {
    cleanup();
    cleanup = () => {};
  });
}
