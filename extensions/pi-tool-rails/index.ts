import { homedir } from "node:os";
import {
  createEditToolDefinition,
  createGrepToolDefinition,
  createReadToolDefinition,
  createWriteToolDefinition,
  keyHint,
  AssistantMessageComponent,
  type ExtensionAPI,
  type Theme as PiTheme,
  type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { Text, type Component } from "@earendil-works/pi-tui";
import { installThinkingMessageStyle, installThinkingTimingTracker } from "./thinking-message.ts";
import { installThinkingShimmer } from "./thinking-shimmer.ts";
import { installUserMessageStyle } from "./user-message.ts";
import { installPlanWidget } from "./plan-widget.ts";
import { installTeammatePanel } from "./teammate-panel.ts";
import { createSleepProgressBash, SleepProgress } from "./sleep-progress.ts";

type Theme = Pick<PiTheme, "fg" | "bold">;
type ActiveTheme = PiTheme;
type RecordLike = Record<string, unknown>;
type RenderOptions = { expanded?: boolean; isPartial?: boolean };
type RenderContext = {
  args?: unknown;
  executionStarted?: boolean;
  isError?: boolean;
  isPartial?: boolean;
  lastComponent?: unknown;
};
type AssistantMessageRender = (this: AssistantMessageComponent, width: number) => string[];
type AssistantMessagePatch = {
  theme: Theme;
  originalRender: AssistantMessageRender;
  patchedRender: AssistantMessageRender;
  owners: Set<symbol>;
};

const ANSI_ESCAPE = /\x1B(?:\][^\x07\x1B]*(?:\x07|\x1B\\)|\[[0-?]*[ -/]*[@-~]|[@-Z\\-_])/g;
const LEADING_ANSI_SPACE = new RegExp(`^(?:${ANSI_ESCAPE.source})* `);
const ASSISTANT_PATCH_MARK = Symbol.for("pi.toolRails.assistantMessagePatch");
const ASSISTANT_MARKER = "\u25cf";
const OSC133_START = "\x1b]133;A\x07";
const OSC133_END = "\x1b]133;B\x07\x1b]133;C\x07";
const STYLED_BUILTINS = new Set(["bash", "edit", "grep", "read", "write"]);
const PREVIEW_LINES = 5;
const HOME = homedir().replace(/\\/g, "/").replace(/\/$/, "");
const WORKSPACE_HISTORY_IGNORED_WARNINGS = [
  "Workspace history is disabled for this directory: current directory is the user home folder",
  "Workspace history is disabled for this directory: no project marker found",
];
// SoL-Pi announces every mechanism with a transient banner in the chat and a footer status
// entry (`sol-pi-savings`). Both are dropped: the row only restates a mechanism property, and
// the footer timer clears itself so no empty slot is left behind.
const SOL_PI_BANNER_PREFIX = "⚡ SoL-Pi · ";
const SOL_PI_SAVINGS_ROW_PREFIX = "Money saved · ";
const SOL_PI_SAVINGS_STATUS_KEY = "sol-pi-savings";
type ExtensionStatusSetter = (key: string, text: string | undefined) => void;

function addAssistantMarker(line: string, marker: string): string {
  const prefix = LEADING_ANSI_SPACE.exec(line)?.[0];
  return prefix ? `${prefix}${marker} ${line.slice(prefix.length)}` : `${marker} ${line}`;
}
function indentAssistantLine(line: string, indent: string): string {
  const prefix = LEADING_ANSI_SPACE.exec(line)?.[0];
  return prefix ? `${prefix}${indent}${line.slice(prefix.length)}` : `${indent}${line}`;
}
function assistantTextNeedle(component: AssistantMessageComponent): string | undefined {
  const message = (component as unknown as { lastMessage?: { content?: unknown[] } }).lastMessage;
  if (!Array.isArray(message?.content)) return undefined;
  const block = message.content.find((item) => {
    const content = record(item);
    return content.type === "text" && typeof content.text === "string" && content.text.trim().length > 0;
  });
  const text = record(block).text;
  if (typeof text !== "string") return undefined;
  const firstLine = text.trim().split(/\r?\n/).find((line) => line.trim())?.trim();
  if (!firstLine) return undefined;
  const needle = firstLine
    .replace(/^\s*(?:#{1,6}\s+|[-*+]\s+|>\s+)/, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_`~]/g, "")
    .trim();
  return needle ? needle.slice(0, 32) : undefined;
}
function record(value: unknown): RecordLike {
  return value && typeof value === "object" && !Array.isArray(value) ? value as RecordLike : {};
}

function withReasoning(parameters: any): any {
  const reasoning = {
    type: "string",
    description: "Short phrase (12 words or fewer) stating the goal behind this call, not the file, path, or command.",
  };
  return {
    ...(parameters ?? { type: "object", properties: {} }),
    properties: { reasoning, ...(parameters?.properties ?? {}) },
    required: parameters?.required ?? [],
  };
}

function stripReasoning(params: any): { reasoning?: string; rest: any } {
  if (!params || typeof params !== "object" || !Object.hasOwn(params, "reasoning")) return { rest: params };
  const { reasoning, ...rest } = params;
  return { reasoning: typeof reasoning === "string" ? reasoning : undefined, rest };
}

function string(value: unknown, fallback = "..."): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function path(value: unknown): string {
  const normalized = string(value).replace(/\\/g, "/");
  if (normalized === HOME) return "~";
  return normalized.startsWith(`${HOME}/`) ? `~${normalized.slice(HOME.length)}` : normalized;
}

function sourcePath(args: RecordLike): string {
  return path(args.path ?? args.file_path);
}

function brief(value: unknown): string {
  return string(value).replace(/\s+/g, " ").trim();
}

function reusableText(context: { lastComponent?: unknown }, content: string): Text {
  const text = context.lastComponent instanceof Text ? context.lastComponent : new Text("", 0, 0);
  text.setText(content);
  return text;
}

function fallbackGoal(name: string): string {
  switch (name) {
    case "bash": return "正在执行命令";
    case "read": return "正在读取文件";
    case "write": return "正在写入文件";
    case "edit": return "正在更新文件";
    case "grep": return "正在搜索文本";
    case "find": return "正在查找文件";
    case "ls": return "正在列出目录";
    default: return "正在调用工具";
  }
}

function targetText(name: string, args: RecordLike): string {
  if (name === "bash") return brief(args.command);
  if (name === "grep") return `/${brief(args.pattern)}/，位置 ${path(args.path ?? ".")}`;
  if (name === "find") return `${brief(args.pattern)}，位置 ${path(args.path ?? ".")}`;
  if (name === "ls") return path(args.path ?? ".");
  const target = sourcePath(args);
  if (name === "read") {
    const start = typeof args.offset === "number" ? args.offset : undefined;
    const limit = typeof args.limit === "number" ? args.limit : undefined;
    if (start !== undefined || limit !== undefined) {
      const range = `${start ?? 1}${limit === undefined ? "" : `-${(start ?? 1) + limit - 1}`}`;
      return `${target} L${range}`;
    }
  }
  return target;
}

function semanticCall(
  name: string,
  input: unknown,
  theme: Theme,
  context: RenderContext,
): Component | undefined {
  const args = record(input);
  // edit/write: "edit <path> (N edits)" call line, matching the settled box.
  if (name === "edit" || name === "write") {
    const suffix = name === "edit"
      ? (Array.isArray(args.edits)
          ? theme.fg("muted", ` (${args.edits.length} ${args.edits.length === 1 ? "edit" : "edits"})`)
          : "")
      : (typeof args.content === "string"
          ? (() => {
              const count = args.content.length === 0
                ? 0
                : (args.content.match(/\n/g)?.length ?? 0) + (args.content.endsWith("\n") ? 0 : 1);
              return theme.fg("muted", ` (${count} 行)`);
            })()
          : "");
    return reusableText(
      context,
      `${theme.fg("toolTitle", theme.bold(name))} ${theme.fg("accent", targetText(name, args))}${suffix}`,
    );
  }
  const { reasoning } = stripReasoning(input);
  const goal = typeof reasoning === "string" && reasoning.trim() ? brief(reasoning) : fallbackGoal(name);
  const arrow = theme.fg("muted", " → ");
  return reusableText(
    context,
    `${theme.fg("toolTitle", theme.bold(goal))}${arrow}${theme.fg("accent", targetText(name, args))}`,
  );
}

function textOutput(result: unknown): string {
  const content = record(result).content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((block): block is RecordLike => Boolean(block) && typeof block === "object" && !Array.isArray(block))
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text as string)
    .join("\n");
}

function outputLines(result: unknown): string[] {
  const text = textOutput(result).replace(ANSI_ESCAPE, "").replace(/\r/g, "").trimEnd();
  return text ? text.split("\n") : [];
}

function hierarchyPreview(
  lines: string[],
  options: RenderOptions,
  theme: Theme,
  context: RenderContext,
): string {
  const expanded = options.expanded === true;
  const shown = expanded ? lines : lines.slice(0, PREVIEW_LINES);
  const color = context.isError ? "error" : "toolOutput";
  const prefix = (first: boolean) => theme.fg("muted", first ? "↳ " : "  ");
  let text = shown
    .map((line, index) => `${prefix(index === 0)}${theme.fg(color, line || " ")}`)
    .join("\n");

  const remaining = lines.length - shown.length;
  if (remaining > 0) {
    const hint = `${remaining} 行待展开 · ${keyHint("app.tools.expand", "展开")}`;
    const line = `${theme.fg("muted", "  ")}${theme.fg("muted", hint)}`;
    text = `${text}\n${line}`;
  }
  return text;
}

function resultSummary(
  name: string,
  result: unknown,
  args: RecordLike,
  theme: Theme,
  context: RenderContext,
): string {
  const lines = outputLines(result);
  if (context.isError) {
    const message = lines.find((line) => line.trim())?.trim() || "失败";
    return theme.fg("error", message);
  }
  if (name === "read") {
    const count = lines.filter((line) => line.trim() && !/^\[Showing lines /.test(line)).length;
    return theme.fg("toolOutput", `${count} 行`);
  }
  if (name === "write") {
    const count = typeof args.content === "string" && args.content.length > 0
      ? (args.content.match(/\n/g)?.length ?? 0) + (args.content.endsWith("\n") ? 0 : 1)
      : 0;
    return theme.fg("toolOutput", `${count} 行已写入`);
  }
  if (name === "edit") {
    const diffValue = record(record(result).details).diff;
    if (typeof diffValue === "string") {
      const additions = diffValue.split("\n").filter((line) => line.startsWith("+") && !line.startsWith("+++" )).length;
      const removals = diffValue.split("\n").filter((line) => line.startsWith("-") && !line.startsWith("---" )).length;
      return theme.fg("toolOutput", `+${additions}/-${removals}`);
    }
    if (diffValue && typeof diffValue === "object" && !Array.isArray(diffValue)) {
      const diff = diffValue as RecordLike;
      if (typeof diff.additions === "number" && typeof diff.deletions === "number") {
        return theme.fg("toolOutput", `+${diff.additions}/-${diff.deletions}`);
      }
    }
    return theme.fg("toolOutput", "已更新");
  }
  if (name === "bash") return theme.fg("toolOutput", "已完成");
  if (name === "grep") {
    const count = lines.filter((line) => line.trim()).length;
    const color = count > 0 ? "success" : "toolOutput";
    return theme.fg(color, `${count} 处匹配`);
  }
  if (name === "find" || name === "ls") {
    const count = lines.filter((line) => line.trim()).length;
    const noun = name === "find" ? "个文件" : "项";
    return theme.fg("toolOutput", `${count} ${noun}`);
  }
  return theme.fg("toolOutput", lines.length ? "已完成" : "操作完成");
}

function semanticResult(
  name: string,
  result: unknown,
  options: RenderOptions,
  theme: Theme,
  context: RenderContext,
): Component | undefined {
  if (!STYLED_BUILTINS.has(name)) return undefined;
  if (options.isPartial) return reusableText(context, "");
  const args = record(context.args);
  const summary = resultSummary(name, result, args, theme, context);
  if (!options.expanded) return reusableText(context, summary);
  const lines = outputLines(result);
  if (!lines.length) return reusableText(context, summary);
  return reusableText(context, `${summary}\n${hierarchyPreview(lines, options, theme, context)}`);
}

function fallbackResult(
  result: unknown,
  options: RenderOptions,
  theme: Theme,
  context: RenderContext,
): Component {
  if (options.isPartial) return reusableText(context, "");
  const lines = outputLines(result);
  if (!lines.length) {
    return reusableText(context, context.isError ? theme.fg("error", "↳ 失败") : "");
  }
  return reusableText(context, hierarchyPreview(lines, options, theme, context));
}

export function decorateTool(tool: ToolDefinition<any, any, any>): ToolDefinition<any, any, any> {
  const renderCall = tool.renderCall;
  const renderResult = tool.renderResult;
  return {
    ...tool,
    parameters: withReasoning(tool.parameters),
    promptGuidelines: [
      ...(tool.promptGuidelines ?? []),
      `Always pass a short reasoning goal to ${tool.name}; state why this call is needed, not its path, pattern, or command.`,
    ],
    renderShell: "default",
    execute(toolCallId, params, signal, onUpdate, ctx) {
      return tool.execute.call(tool, toolCallId, stripReasoning(params).rest, signal, onUpdate, ctx);
    },
    renderCall(args, theme, context) {
      return semanticCall(tool.name, args, theme, context)
        ?? (renderCall
          ? renderCall(args, theme, context)
          : reusableText(context, theme.fg("toolTitle", theme.bold(tool.name))));
    },
    renderResult(result, options, theme, context) {
      return semanticResult(tool.name, result, options, theme, context)
        ?? (renderResult
          ? renderResult(result, options, theme, context)
          : fallbackResult(result, options, theme, context));
    },
  };
}


function releaseAssistantMessage(
  shared: typeof globalThis & Record<symbol, unknown>,
  patch: AssistantMessagePatch,
  owner: symbol,
 ): void {
  patch.owners.delete(owner);
  if (patch.owners.size > 0) return;
  if (AssistantMessageComponent.prototype.render === patch.patchedRender) {
    AssistantMessageComponent.prototype.render = patch.originalRender;
  }
  if (shared[ASSISTANT_PATCH_MARK] === patch) delete shared[ASSISTANT_PATCH_MARK];
}

function installAssistantMarker(theme: Theme): () => void {
  const shared = globalThis as typeof globalThis & Record<symbol, unknown>;
  const owner = Symbol("pi.toolRails.assistantMarker");
  const existing = shared[ASSISTANT_PATCH_MARK] as Partial<AssistantMessagePatch> | undefined;
  if (existing?.originalRender && typeof existing.originalRender === "function") {
    const patch = existing as AssistantMessagePatch;
    patch.theme = theme;
    patch.owners ??= new Set<symbol>();
    patch.patchedRender ??= AssistantMessageComponent.prototype.render;
    patch.owners.add(owner);
    return () => releaseAssistantMessage(shared, patch, owner);
  }

  const state = { theme, originalRender: AssistantMessageComponent.prototype.render, owners: new Set<symbol>([owner]) };
  const patchedRender: AssistantMessageRender = function (width: number): string[] {
    if (width < 8 || (this as unknown as { hasToolCalls?: boolean }).hasToolCalls) {
      return state.originalRender.call(this, width);
    }
    const textNeedle = assistantTextNeedle(this);
    if (!textNeedle) return state.originalRender.call(this, width);
    const lines = state.originalRender.call(this, width - 2);
    if (!lines.length) return lines;
    if (!lines[0].startsWith(OSC133_START)) return state.originalRender.call(this, width);
    lines[0] = lines[0].slice(OSC133_START.length);
    const last = lines.length - 1;
    if (lines[last].startsWith(OSC133_END)) lines[last] = lines[last].slice(OSC133_END.length);

    const markerIndex = lines.findIndex((line) => line.replace(ANSI_ESCAPE, "").includes(textNeedle));
    if (markerIndex >= 0) {
      lines[markerIndex] = addAssistantMarker(lines[markerIndex], state.theme.fg("text", ASSISTANT_MARKER));
      for (let index = markerIndex + 1; index < lines.length; index++) {
        if (lines[index].replace(ANSI_ESCAPE, "").trim().length > 0) {
          lines[index] = indentAssistantLine(lines[index], "  ");
        }
      }
    }

    lines[0] = OSC133_START + lines[0];
    lines[last] = OSC133_END + lines[last];
    return lines;
  };

  const patch: AssistantMessagePatch = { ...state, patchedRender };
  shared[ASSISTANT_PATCH_MARK] = patch;
  AssistantMessageComponent.prototype.render = patchedRender;
  return () => releaseAssistantMessage(shared, patch, owner);
}

function isUnclaimedBuiltin(pi: ExtensionAPI, name: string): boolean {
  const current = pi.getAllTools().find((tool) => tool.name === name);
  return current?.sourceInfo.source === "builtin";
}

export function shouldSuppressNotification(message: string): boolean {
  if (WORKSPACE_HISTORY_IGNORED_WARNINGS.some((warning) => message.startsWith(warning))) return true;
  const [title = "", savings = ""] = message.split("\n");
  return title.startsWith(SOL_PI_BANNER_PREFIX) && savings.startsWith(SOL_PI_SAVINGS_ROW_PREFIX);
}

export function shouldSuppressStatus(key: string): boolean {
  return key === SOL_PI_SAVINGS_STATUS_KEY;
}

function installNotificationFilter(ui: {
  notify(message: string, type?: "info" | "warning" | "error"): void;
  setStatus?: ExtensionStatusSetter;
}): () => void {
  const originalNotify = ui.notify;
  const originalSetStatus = ui.setStatus;
  const filteredNotify = (message: string, type?: "info" | "warning" | "error"): void => {
    if (!shouldSuppressNotification(message)) originalNotify.call(ui, message, type);
  };
  const filteredSetStatus: ExtensionStatusSetter | undefined = originalSetStatus
    ? (key, text) => {
        if (!shouldSuppressStatus(key)) originalSetStatus.call(ui, key, text);
      }
    : undefined;
  ui.notify = filteredNotify;
  if (filteredSetStatus) ui.setStatus = filteredSetStatus;
  return () => {
    if (ui.notify === filteredNotify) ui.notify = originalNotify;
    if (filteredSetStatus && ui.setStatus === filteredSetStatus) ui.setStatus = originalSetStatus;
  };
}

export default function toolRails(pi: ExtensionAPI): void {
  const sleepProgress = new SleepProgress();
  let activeTheme: ActiveTheme | undefined;
  let cleanupAssistantMarker = () => {};
  let cleanupNotificationFilter = () => {};
  let cleanupThinkingMessage = () => {};
  let cleanupUserMessage = () => {};

  function disposeSessionPresentation(): void {
    sleepProgress.dispose();
    activeTheme = undefined;
    cleanupNotificationFilter();
    cleanupThinkingMessage();
    cleanupAssistantMarker();
    cleanupUserMessage();
    cleanupNotificationFilter = () => {};
    cleanupThinkingMessage = () => {};
    cleanupAssistantMarker = () => {};
    cleanupUserMessage = () => {};
  }

  installPlanWidget(pi);
  installTeammatePanel(pi);
  installThinkingShimmer(pi);
  installThinkingTimingTracker(pi);
  pi.on("session_start", (_event, ctx) => {
    disposeSessionPresentation();
    if (ctx.mode !== "tui") return;

    cleanupNotificationFilter = installNotificationFilter(ctx.ui);
    const builtins = [
      createReadToolDefinition(ctx.cwd),
      createSleepProgressBash(ctx.cwd, sleepProgress, decorateTool),
      createWriteToolDefinition(ctx.cwd),
      createEditToolDefinition(ctx.cwd),
      createGrepToolDefinition(ctx.cwd),
    ];
    for (const tool of builtins) {
      if (STYLED_BUILTINS.has(tool.name) && isUnclaimedBuiltin(pi, tool.name)) {
        pi.registerTool(tool.name === "bash" ? tool : decorateTool(tool));
      }
    }
    const theme = ctx.ui.theme;
    activeTheme = theme;
    cleanupAssistantMarker = installAssistantMarker(theme);
    cleanupThinkingMessage = installThinkingMessageStyle(() => activeTheme);
    cleanupUserMessage = installUserMessageStyle(() => activeTheme);
  });
  pi.on("session_shutdown", disposeSessionPresentation);
}
