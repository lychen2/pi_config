import {
  ToolExecutionComponent,
  keyHint,
  type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import { Text, type Component } from "@earendil-works/pi-tui";

type Theme = {
  fg(color: "error" | "muted" | "toolOutput", text: string): string;
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

const ANSI_ESCAPE = /\x1B(?:\][^\x07\x1B]*(?:\x07|\x1B\\)|\[[0-?]*[ -/]*[@-~]|[@-Z\\-_])/g;
const RESULT_PATCH = Symbol.for("pi.toolRails.resultRendererPatch");
const COMPACT_RESULTS = new Set(["bash", "find", "grep", "ls"]);
const PREVIEW_LINES = 5;

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
  pi.on("session_start", (_event, ctx) => {
    if (ctx.mode === "tui") cleanup = installResultBridge();
  });
  pi.on("session_shutdown", () => {
    cleanup();
    cleanup = () => {};
  });
}
