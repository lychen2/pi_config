import { readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import {
  ToolExecutionComponent,
  getLanguageFromPath,
  highlightCode,
  keyHint,
  type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import { sliceByColumn, Text, truncateToWidth, visibleWidth, type Component } from "@earendil-works/pi-tui";

type DiffColor = "toolDiffAdded" | "toolDiffContext" | "toolDiffRemoved";
type Theme = {
  fg(
    color: "accent" | "dim" | "error" | "muted" | "success" | "syntaxFunction" | DiffColor | "toolOutput" | "warning",
    text: string,
  ): string;
  getFgAnsi?(color: DiffColor): string;
};
type ResultOptions = { expanded?: boolean; isPartial?: boolean; toolName?: string };
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
type CodeLineHighlighter = (line: string) => string;
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
const NUMBERED_DIFF = /^([ +\-])(\s*\d+)\s(.*)$/;
const HASHLINE_READ = /^[A-Za-z0-9_-]{3}│(.*)$/;
const RESULT_PATCH = Symbol.for("pi.toolRails.resultRendererPatch");
const REPLACE_LINE_NUMBERS = "toolRailsNewLineNumbers";
const REPLACE_FINAL_LINE_COUNT = "toolRailsFinalLineCount";
const COMPACT_RESULTS = new Set(["bash", "bash_status", "bash_watch", "bash_write", "bash_kill", "find", "grep", "ls"]);
const BACKGROUND_SHELL_TOOLS = new Set(["bash_status", "bash_watch", "bash_write", "bash_kill"]);
const PREVIEW_LINES = 5;
const REPLACE_PREVIEW_ROWS = 10;
const SPLIT_SEPARATOR = " │ ";
const MIN_SPLIT_WIDTH = 58;
const DIFF_BACKGROUND_INTENSITY = 0.32;
const TRUECOLOR_FOREGROUND = /^\x1b\[38;2;(\d+);(\d+);(\d+)m$/;
const INDEXED_FOREGROUND = /^\x1b\[38;5;\d+m$/;
const ANSI_SGR = /\x1b\[[0-?]*[ -/]*m/g;
const DIFF_BACKGROUND = /\x1b\[48;(?:2;\d+;\d+;\d+|5;(?:22|52))m/;

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

function sourcePathFromContext(context: ResultContext): string | undefined {
  const args = record(context.args);
  for (const key of ["path", "filePath", "file_path"]) {
    const value = args[key];
    if (typeof value === "string" && value.trim()) return value.replace(/^@/, "").trim();
  }
  return undefined;
}

function createCodeLineHighlighter(sourcePath: string | undefined): CodeLineHighlighter {
  if (!sourcePath) return (line) => line.replace(ANSI_ESCAPE, "");

  let language: string | undefined;
  try {
    language = getLanguageFromPath(sourcePath);
  } catch {
    return (line) => line.replace(ANSI_ESCAPE, "");
  }
  if (!language) return (line) => line.replace(ANSI_ESCAPE, "");

  const cache = new Map<string, string>();
  return (line) => {
    const source = line.replace(ANSI_ESCAPE, "");
    const cached = cache.get(source);
    if (cached !== undefined) return cached;
    try {
      const highlighted = highlightCode(source, language)[0] ?? source;
      cache.set(source, highlighted);
      return highlighted;
    } catch {
      cache.set(source, source);
      return source;
    }
  };
}

function reusableText(context: ResultContext, content: string): Text {
  const text = context.lastComponent instanceof Text ? context.lastComponent : new Text("", 0, 0);
  text.setText(content);
  return text;
}

type SummaryColor = "accent" | "error" | "muted" | "success" | "syntaxFunction" | "toolOutput" | "warning";
type SummarySegment = { color: SummaryColor; text: string };

function styledSummary(theme: Theme, segments: SummarySegment[]): string {
  return segments
    .map((segment, index) => `${index === 0 ? "" : theme.fg("muted", " · ")}${theme.fg(segment.color, segment.text)}`)
    .join("");
}

function preview(
  lines: string[],
  options: ResultOptions,
  theme: Theme,
  context: ResultContext,
): string {
  const shown = options.expanded ? lines : lines.slice(0, PREVIEW_LINES);
  const color = context.isError ? "error" : "toolOutput";
  let text = shown.map((line) => theme.fg(color, line || " ")).join("\n");

  const remaining = lines.length - shown.length;
  if (remaining > 0) {
    const hint = theme.fg(
      "muted",
      `${remaining} more ${remaining === 1 ? "line" : "lines"} · ${keyHint("app.tools.expand", "expand")}`,
    );
    text = `${text}\n${hint}`;
  }
  return text;
}

function numberDetail(details: RecordLike, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const value = details[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return undefined;
}

function durationLabel(milliseconds: number): string {
  if (milliseconds < 1000) return `${Math.round(milliseconds)}ms`;
  if (milliseconds < 60_000) return `${(milliseconds / 1000).toFixed(milliseconds < 10_000 ? 1 : 0)}s`;
  const minutes = Math.floor(milliseconds / 60_000);
  const seconds = Math.floor((milliseconds % 60_000) / 1000);
  return `${minutes}m ${seconds}s`;
}

function conciseLine(line: string, limit = 100): string {
  const compact = line.replace(/\s+/g, " ").trim();
  return compact.length <= limit ? compact : `${compact.slice(0, limit - 1)}…`;
}

function jsonLine(line: string): RecordLike | undefined {
  const text = line.trim();
  if (!text.startsWith("{")) return undefined;
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as RecordLike
      : undefined;
  } catch {
    return undefined;
  }
}

export function summarizeBackgroundShell(lines: string[]): string[] {
  const summary: string[] = [];
  const add = (line: string | undefined) => {
    const value = line ? conciseLine(line, 140) : "";
    if (value && !summary.includes(value)) summary.push(value);
  };

  for (const line of lines) {
    const text = line.trim();
    if (/^Task\s+\S+:/i.test(text)) add(text);
    else if (/^Waited\s+.*;\s*matched\s+/i.test(text)) add(text);
    else if (/^(?:PTY task is still running|background task .* (?:completed|failed))/i.test(text)) add(text);

    const event = jsonLine(text);
    if (!event) continue;
    if (event.type === "extension_ui_request") {
      const message = event.message;
      if (event.method === "notify" && typeof message === "string") add(message);
      if (event.method === "setStatus") {
        const status = record(event).statusText;
        if (typeof status === "string") add(status.replace(/\x1B\[[0-9;]*m/g, ""));
      }
    }
    if (event.type === "agent_settled") add("agent settled");
  }

  if (summary.length > 0) return summary.slice(0, 3);
  return lines
    .filter((line) => line.trim() && !jsonLine(line))
    .slice(0, 2)
    .map((line) => conciseLine(line, 140));
}

function renderBashSummary(
  result: unknown,
  options: ResultOptions,
  theme: Theme,
  context: ResultContext,
  lines: string[],
): Component {
  const details = record(record(result).details);
  const bashLines = lines.length === 1 && /^\(?no output\)?$/i.test(lines[0]!.trim()) ? [] : lines;
  const isBackgroundShell = BACKGROUND_SHELL_TOOLS.has(options.toolName ?? "");
  const normalizedLines = isBackgroundShell ? summarizeBackgroundShell(bashLines) : bashLines;
  const exitCode = numberDetail(details, "exit_code", "exitCode");
  const duration = numberDetail(details, "duration_ms", "durationMs");
  const taskIdValue = details.task_id ?? details.taskId;
  const taskId = typeof taskIdValue === "string" || typeof taskIdValue === "number"
    ? String(taskIdValue)
    : undefined;

  if (options.isPartial) {
    const running = theme.fg("warning", "running");
    if (!options.expanded || bashLines.length === 0) return reusableText(context, running);
    return reusableText(context, `${running}\n${preview(bashLines, options, theme, context)}`);
  }

  if (context.isError) {
    const status = exitCode === undefined ? "command failed" : `exit ${exitCode}`;
    const errorLine = (isBackgroundShell ? normalizedLines : bashLines).find((line) => /(?:error|failed|fatal|exception|denied|not found|invalid)/i.test(line))
      ?? (isBackgroundShell ? normalizedLines : bashLines).find((line) => line.trim());
    const summary = styledSummary(theme, [
      { color: "error", text: status },
      ...(errorLine ? [{ color: "toolOutput" as const, text: conciseLine(errorLine) }] : []),
    ]);
    if (!options.expanded || bashLines.length === 0) return reusableText(context, summary);
    return reusableText(context, `${summary}\n${preview(bashLines, options, theme, context)}`);
  }

  const status = taskId && exitCode === undefined
    ? `background task ${taskId} started`
    : "completed";
  const summary = styledSummary(theme, [
    { color: "success", text: status },
    ...(exitCode === undefined ? [] : [{ color: "accent" as const, text: `exit ${exitCode}` }]),
    // Matugen maps Pi's syntaxFunction slot to its generated secondary color.
    ...(duration === undefined ? [] : [{ color: "syntaxFunction" as const, text: durationLabel(duration) }]),
    ...(bashLines.length === 0
      ? []
      : [{ color: "toolOutput" as const, text: `${bashLines.length} output ${bashLines.length === 1 ? "line" : "lines"}` }]),
    ...(details.truncated === true ? [{ color: "error" as const, text: "truncated" }] : []),
  ]);
  if (!options.expanded || bashLines.length === 0) {
    if (isBackgroundShell && normalizedLines.length > 0) {
      return reusableText(context, `${summary}\n${normalizedLines.map((line) => theme.fg("toolOutput", line)).join("\n")}`);
    }
    return reusableText(context, summary);
  }
  return reusableText(context, `${summary}\n${preview(bashLines, options, theme, context)}`);
}

export function compactResult(
  name: string,
  result: unknown,
  options: ResultOptions,
  theme: Theme,
  context: ResultContext,
): Component {
  const lines = outputLines(result);

  if (name === "bash" || BACKGROUND_SHELL_TOOLS.has(name)) {
    return renderBashSummary(result, { ...options, toolName: name }, theme, context, lines);
  }

  if (options.isPartial) return reusableText(context, "");
  if (context.isError) {
    return reusableText(context, preview(lines.length ? lines : ["tool failed"], options, theme, context));
  }
  if (options.expanded) {
    return reusableText(context, preview(lines.length ? lines : ["(no results)"], options, theme, context));
  }

  const count = lines.filter((line) => line.trim()).length;
  const unit = name === "grep"
    ? (count === 1 ? "match" : "matches")
    : (count === 1 ? "result" : "results");
  const segments: SummarySegment[] = [{
    color: name === "grep" && count > 0 ? "success" : "muted",
    text: `${count} ${unit}`,
  }];
  if (count > 0) segments.push({ color: "accent", text: keyHint("app.tools.expand", "expand") });
  return reusableText(context, styledSummary(theme, segments));
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
  const args = record(context.args);
  const startLine = typeof args.offset === "number" && Number.isInteger(args.offset) && args.offset > 0
    ? args.offset
    : 1;
  const entries = parseHashlineReadOutput(outputLines(result), startLine);
  if (!options.expanded && !context.isError) {
    const count = entries.filter((entry) => entry.kind === "line").length;
    return reusableText(context, theme.fg("toolDiffAdded", `${count} ${count === 1 ? "line" : "lines"}`));
  }
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

export function parseAftEditDiff(diff: string): ReplaceDiffEntry[] {
  const entries: ReplaceDiffEntry[] = [];
  let lineDelta = 0;

  for (const rawLine of diff.replace(/\r/g, "").split("\n")) {
    const numbered = rawLine.match(NUMBERED_DIFF);
    if (!numbered) {
      if (rawLine.trim()) entries.push({ kind: "meta", content: rawLine.trim() });
      continue;
    }

    const prefix = numbered[1];
    const lineNumber = Number(numbered[2]);
    const content = numbered[3] ?? "";
    if (prefix === "-") {
      entries.push({ kind: "remove", content, oldLineNumber: lineNumber });
      lineDelta--;
    } else if (prefix === "+") {
      entries.push({ kind: "add", content, newLineNumber: lineNumber });
      lineDelta++;
    } else {
      entries.push({
        kind: "context",
        content,
        oldLineNumber: lineNumber,
        newLineNumber: lineNumber + lineDelta,
      });
    }
  }
  return entries;
}

function stripCommonIndent(entries: ReplaceDiffEntry[]): ReplaceDiffEntry[] {
  const normalized: ReplaceDiffEntry[] = [];
  let segment: ReplaceDiffEntry[] = [];

  const flush = () => {
    const expanded = segment.map((entry) => ({ ...entry, content: entry.content.replace(/\t/g, "    ") }));
    const contentLines = expanded.filter((entry) => entry.content.trim().length > 0);
    const commonIndent = contentLines.length === 0
      ? 0
      : Math.min(...contentLines.map((entry) => entry.content.match(/^ */)?.[0].length ?? 0));
    normalized.push(...expanded.map((entry) => ({
      ...entry,
      content: entry.content.trim().length === 0 ? "" : entry.content.slice(commonIndent),
    })));
    segment = [];
  };

  for (const entry of entries) {
    if (entry.kind === "meta") {
      flush();
      normalized.push({ ...entry });
    } else {
      segment.push(entry);
    }
  }
  flush();
  return normalized;
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

function diffColor(kind: DiffKind): DiffColor {
  return kind === "add"
    ? "toolDiffAdded"
    : kind === "remove"
      ? "toolDiffRemoved"
      : "toolDiffContext";
}

function applyDiffBackground(kind: DiffKind, line: string, theme: Theme): string {
  if (kind !== "add" && kind !== "remove") return line;

  const foreground = theme.getFgAnsi?.(diffColor(kind));
  const truecolor = foreground?.match(TRUECOLOR_FOREGROUND);
  const background = truecolor
    ? `\x1b[48;2;${truecolor.slice(1)
      .map((channel) => Math.round(Number(channel) * DIFF_BACKGROUND_INTENSITY))
      .join(";")}m`
    : foreground && INDEXED_FOREGROUND.test(foreground)
      ? kind === "add" ? "\x1b[48;5;22m" : "\x1b[48;5;52m"
      : undefined;
  if (!background) return line;

  const coloredLine = line.replace(
    ANSI_SGR,
    (sequence) => sequence === "\x1b[49m" ? background : `${sequence}${background}`,
  );
  return `${background}${coloredLine}\x1b[49m`;
}

function firstDiffBackground(line: string): string | undefined {
  return line.match(DIFF_BACKGROUND)?.[0];
}

function tintSeparatorPart(text: string, background: string | undefined): string {
  if (!background) return text;
  const coloredText = text.replace(ANSI_SGR, (sequence) => `${sequence}${background}`);
  return `${background}${coloredText}\x1b[49m`;
}

function splitRowSeparator(left: string, right: string, theme: Theme): string {
  const leftGap = tintSeparatorPart(theme.fg("dim", " "), firstDiffBackground(left));
  const rightBoundary = tintSeparatorPart(theme.fg("dim", "│ "), firstDiffBackground(right));
  return `${leftGap}${rightBoundary}`;
}

function formatDiffEntryLines(
  entry: ReplaceDiffEntry | undefined,
  side: "left" | "right",
  width: number,
  numberWidth: number,
  theme: Theme,
  highlightLine: CodeLineHighlighter,
): string[] {
  const number = side === "left" ? entry?.oldLineNumber : entry?.newLineNumber;
  const color = entry ? diffColor(entry.kind) : "toolDiffContext";
  const numberColor = entry?.kind === "add" || entry?.kind === "remove" ? color : "muted";
  const prefix = `${theme.fg(numberColor, formatLineNumber(number, numberWidth))} ${theme.fg("dim", "│")} `;
  if (!entry) return [fitCell(prefix, width)];

  const code = entry.content.replace(/\t/g, "    ");
  const indentation = code.match(/^\s*/)?.[0] ?? "";
  const continuationPrefix = `${" ".repeat(numberWidth)} ${theme.fg("dim", "│")} ${" ".repeat(2 + visibleWidth(indentation))}`;
  const marker = entry.kind === "add" ? "+" : entry.kind === "remove" ? "-" : " ";
  const firstPrefix = `${prefix}${theme.fg(color, marker)} `;
  return wrapCellContent(firstPrefix, continuationPrefix, highlightLine(code), width)
    .map((line) => applyDiffBackground(entry.kind, line, theme));
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

function changeRatioBar(additions: number, removals: number, width: number, theme: Theme): string | undefined {
  const total = additions + removals;
  if (total === 0 || width < 20) return undefined;

  const slots = Math.max(8, Math.min(24, Math.floor(width / 12)));
  let additionSlots = Math.max(0, Math.min(slots, Math.round((additions / total) * slots)));
  if (additions > 0 && additionSlots === 0) additionSlots = 1;
  if (removals > 0 && additionSlots >= slots) additionSlots = slots - 1;
  const removalSlots = slots - additionSlots;
  return [
    theme.fg("dim", "["),
    additionSlots > 0 ? theme.fg("toolDiffAdded", "━".repeat(additionSlots)) : "",
    removalSlots > 0 ? theme.fg("toolDiffRemoved", "━".repeat(removalSlots)) : "",
    theme.fg("dim", "]"),
  ].join("");
}

function summaryWithChangeRatio(
  summary: string,
  additions: number,
  removals: number,
  width: number,
  theme: Theme,
): string {
  const bar = changeRatioBar(additions, removals, width, theme);
  if (!bar || visibleWidth(summary) + 1 + visibleWidth(bar) > width) return truncateToWidth(summary, width, "");
  return `${summary} ${bar}`;
}

function diffSummary(
  width: number,
  additions: number,
  removals: number,
  mode: "split" | "unified",
  theme: Theme,
  showRatioBar: boolean,
): string {
  const text = [
    theme.fg("toolOutput", "↳ diff"),
    theme.fg("toolDiffAdded", `+${additions}`),
    theme.fg("toolDiffRemoved", `-${removals}`),
    theme.fg("muted", mode),
  ].join(" ");
  return fitCell(showRatioBar ? summaryWithChangeRatio(text, additions, removals, width, theme) : text, width);
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
  highlightLine: CodeLineHighlighter,
  showRatioBar: boolean,
): string[] {
  const separatorWidth = visibleWidth(SPLIT_SEPARATOR);
  const leftWidth = Math.floor((width - separatorWidth) / 2);
  const rightWidth = width - separatorWidth - leftWidth;
  const numberWidth = lineNumberWidth(rows);
  const separator = theme.fg("dim", SPLIT_SEPARATOR);
  const topSeparator = theme.fg("dim", "─┼─");
  const output = [
    diffSummary(width, additions, removals, "split", theme, showRatioBar),
    `${topBorderCell(leftWidth, numberWidth, theme)}${topSeparator}${topBorderCell(rightWidth, numberWidth, theme)}`,
    `${headerCell("old", leftWidth, numberWidth, theme)}${separator}${headerCell("new", rightWidth, numberWidth, theme)}`,
  ];

  const emptyLeft = formatDiffEntryLines(undefined, "left", leftWidth, numberWidth, theme, highlightLine)[0]!;
  const emptyRight = formatDiffEntryLines(undefined, "right", rightWidth, numberWidth, theme, highlightLine)[0]!;
  for (const row of rows) {
    const leftLines = row.meta !== undefined
      ? formatMetaCellLines(row.meta, leftWidth, numberWidth, theme)
      : formatDiffEntryLines(row.left, "left", leftWidth, numberWidth, theme, highlightLine);
    const rightLines = row.meta !== undefined
      ? formatMetaCellLines(row.meta, rightWidth, numberWidth, theme)
      : formatDiffEntryLines(row.right, "right", rightWidth, numberWidth, theme, highlightLine);
    const height = Math.max(leftLines.length, rightLines.length);
    for (let index = 0; index < height; index++) {
      const leftLine = leftLines[index] ?? emptyLeft;
      const rightLine = rightLines[index] ?? emptyRight;
      output.push(`${leftLine}${splitRowSeparator(leftLine, rightLine, theme)}${rightLine}`);
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
  highlightLine: CodeLineHighlighter,
  showRatioBar: boolean,
): string[] {
  const numberWidth = lineNumberWidth(rows);
  const gutter = (oldLine?: number, newLine?: number, kind?: DiffKind) => {
    const color = kind ? diffColor(kind) : "toolDiffContext";
    const oldColor = kind === "remove" ? color : "muted";
    const newColor = kind === "add" ? color : "muted";
    return `${theme.fg(oldColor, formatLineNumber(oldLine, numberWidth))} ${theme.fg(newColor, formatLineNumber(newLine, numberWidth))} ${theme.fg("dim", "│")} `;
  };
  const output = [
    diffSummary(width, additions, removals, "unified", theme, showRatioBar),
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
      const color = diffColor(entry.kind);
      const code = entry.content.replace(/\t/g, "    ");
      const indentation = code.match(/^\s*/)?.[0] ?? "";
      const firstPrefix = `${gutter(entry.oldLineNumber, entry.newLineNumber, entry.kind)}${theme.fg(color, marker)} `;
      const continuationPrefix = `${gutter()}${" ".repeat(2 + visibleWidth(indentation))}`;
      output.push(...wrapCellContent(
        firstPrefix,
        continuationPrefix,
        highlightLine(code),
        width,
      ).map((line) => applyDiffBackground(entry.kind, line, theme)));
    }
  }
  return output;
}

class ReplaceDiffComponent implements Component {
  private entries: ReplaceDiffEntry[];
  private expanded: boolean;
  private theme: Theme;
  private sourcePath: string | undefined;
  private highlightLine: CodeLineHighlighter;
  private showRatioBar: boolean;

  constructor(
    entries: ReplaceDiffEntry[],
    expanded: boolean,
    theme: Theme,
    sourcePath: string | undefined,
    showRatioBar: boolean,
  ) {
    this.entries = stripCommonIndent(entries);
    this.expanded = expanded;
    this.theme = theme;
    this.sourcePath = sourcePath;
    this.highlightLine = createCodeLineHighlighter(sourcePath);
    this.showRatioBar = showRatioBar;
  }

  update(
    entries: ReplaceDiffEntry[],
    expanded: boolean,
    theme: Theme,
    sourcePath: string | undefined,
    showRatioBar: boolean,
  ): void {
    this.entries = stripCommonIndent(entries);
    this.expanded = expanded;
    this.theme = theme;
    this.showRatioBar = showRatioBar;
    if (this.sourcePath !== sourcePath) {
      this.sourcePath = sourcePath;
      this.highlightLine = createCodeLineHighlighter(sourcePath);
    }
  }

  render(width: number): string[] {
    const safeWidth = Math.max(1, width);
    const additions = this.entries.filter((entry) => entry.kind === "add").length;
    const removals = this.entries.filter((entry) => entry.kind === "remove").length;
    const preview = visibleRows(buildReplaceRows(this.entries), this.expanded);
    const lines = safeWidth >= MIN_SPLIT_WIDTH
      ? renderSplitDiff(preview.rows, safeWidth, this.theme, additions, removals, this.highlightLine, this.showRatioBar)
      : renderUnifiedDiff(preview.rows, safeWidth, this.theme, additions, removals, this.highlightLine, this.showRatioBar);

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

function renderDiffComponent(
  entries: ReplaceDiffEntry[],
  options: ResultOptions,
  theme: Theme,
  context: ResultContext,
  sourcePath: string | undefined,
  showRatioBar: boolean,
): Component {
  const existing = context.lastComponent;
  if (existing instanceof ReplaceDiffComponent) {
    existing.update(entries, options.expanded === true, theme, sourcePath, showRatioBar);
    return existing;
  }
  return new ReplaceDiffComponent(entries, options.expanded === true, theme, sourcePath, showRatioBar);
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
    return reusableText(context, preview(fallback, options, theme, context));
  }
  if (!options.expanded && hasChanges) {
    const additions = rawEntries.filter((entry) => entry.kind === "add").length;
    const removals = rawEntries.filter((entry) => entry.kind === "remove").length;
    const summary = `${theme.fg("toolDiffAdded", `+${additions}`)}${theme.fg("muted", "/")}${theme.fg("toolDiffRemoved", `-${removals}`)}`;
    return reusableText(context, summary);
  }
  const storedNumbers = Array.isArray(details[REPLACE_LINE_NUMBERS])
    ? details[REPLACE_LINE_NUMBERS].map((value) => typeof value === "number" ? value : null)
    : [];
  const firstChangedLine = typeof details.firstChangedLine === "number" ? details.firstChangedLine : undefined;
  const finalLineCount = typeof details[REPLACE_FINAL_LINE_COUNT] === "number"
    ? details[REPLACE_FINAL_LINE_COUNT]
    : undefined;
  const entries = numberedEntries(rawEntries, storedNumbers, firstChangedLine, finalLineCount);
  return renderDiffComponent(entries, options, theme, context, sourcePathFromContext(context), false);
}

class MutationSummaryComponent implements Component {
  private summary: string;
  private additions: number;
  private removals: number;
  private theme: Theme;

  constructor(summary: string, additions: number, removals: number, theme: Theme) {
    this.summary = summary;
    this.additions = additions;
    this.removals = removals;
    this.theme = theme;
  }

  update(summary: string, additions: number, removals: number, theme: Theme): void {
    this.summary = summary;
    this.additions = additions;
    this.removals = removals;
    this.theme = theme;
  }

  render(width: number): string[] {
    return [summaryWithChangeRatio(this.summary, this.additions, this.removals, Math.max(0, width), this.theme)];
  }

  invalidate(): void {}
}

function renderMutationSummary(
  summary: string,
  additions: number,
  removals: number,
  theme: Theme,
  context: ResultContext,
): Component {
  const existing = context.lastComponent;
  if (existing instanceof MutationSummaryComponent) {
    existing.update(summary, additions, removals, theme);
    return existing;
  }
  return new MutationSummaryComponent(summary, additions, removals, theme);
}

function renderAftMutationResult(
  operation: "edit" | "write",
  result: unknown,
  options: ResultOptions,
  theme: Theme,
  context: ResultContext,
): Component {
  if (options.isPartial) return reusableText(context, "");
  const details = record(record(result).details);
  if (context.isError) {
    const lines = outputLines(result);
    return reusableText(context, preview(lines.length ? lines : [`${operation} failed`], options, theme, context));
  }
  const lines = outputLines(result);
  const textCounts = lines.join(" ").match(/\(\+(\d+)\/-(\d+)(?:,\s*(\d+)\s+edits?)?\)/i);
  const diffMetadata = record(details.diff);
  const additions = typeof details.additions === "number"
    ? details.additions
    : typeof diffMetadata.additions === "number"
      ? diffMetadata.additions
      : textCounts
        ? Number(textCounts[1])
        : undefined;
  const deletions = typeof details.deletions === "number"
    ? details.deletions
    : typeof diffMetadata.deletions === "number"
      ? diffMetadata.deletions
      : textCounts
        ? Number(textCounts[2])
        : undefined;
  const editsApplied = typeof details.editsApplied === "number"
    ? details.editsApplied
    : typeof details.edits_applied === "number"
      ? details.edits_applied
      : textCounts?.[3]
        ? Number(textCounts[3])
        : undefined;
  const summary = additions !== undefined && deletions !== undefined
    ? `${theme.fg("toolDiffAdded", `+${additions}`)}${theme.fg("muted", "/")}${theme.fg("toolDiffRemoved", `-${deletions}`)}${editsApplied === undefined ? "" : theme.fg("muted", ` · ${editsApplied} edits`)}`
    : theme.fg("muted", "updated");
  if (!options.expanded) {
    return additions !== undefined && deletions !== undefined
      ? renderMutationSummary(summary, additions, deletions, theme, context)
      : reusableText(context, summary);
  }

  const diffText = typeof details.diff === "string" ? details.diff : "";
  const entries = diffText ? parseAftEditDiff(diffText) : [];
  const hasChanges = entries.some((entry) => entry.kind === "add" || entry.kind === "remove");
  return hasChanges
    ? renderDiffComponent(entries, options, theme, context, sourcePathFromContext(context), true)
    : reusableText(context, [summary, ...lines].filter(Boolean).join("\n"));
}

export function renderAftEditResult(
  result: unknown,
  options: ResultOptions,
  theme: Theme,
  context: ResultContext,
): Component {
  return renderAftMutationResult("edit", result, options, theme, context);
}

export function renderAftWriteResult(
  result: unknown,
  options: ResultOptions,
  theme: Theme,
  context: ResultContext,
): Component {
  return renderAftMutationResult("write", result, options, theme, context);
}

export function renderAftEditBridgeResult(
  _nativeRenderer: ResultRenderer | undefined,
  result: unknown,
  options: ResultOptions,
  theme: Theme,
  context: ResultContext,
): Component {
  return renderAftEditResult(result, options, theme, context);
}

export function renderAftWriteBridgeResult(
  _nativeRenderer: ResultRenderer | undefined,
  result: unknown,
  options: ResultOptions,
  theme: Theme,
  context: ResultContext,
): Component {
  return renderAftWriteResult(result, options, theme, context);
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
    if (name === "edit" || name === "write") {
      return (result, options, theme, context) => name === "write"
        ? renderAftWriteBridgeResult(nativeRenderer, result, options, theme, context)
        : renderAftEditBridgeResult(nativeRenderer, result, options, theme, context);
    }
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
          preview(lines.length ? lines : [context.isError ? "read failed" : ""], options, theme, context),
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
  // Install immediately so extension reloads patch subsequent tool results too.
  const cleanup = installResultBridge();

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

  pi.on("session_shutdown", cleanup);
}
