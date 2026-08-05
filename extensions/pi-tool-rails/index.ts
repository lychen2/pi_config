import { homedir } from "node:os";
import {
  createBashToolDefinition,
  createEditToolDefinition,
  createGrepToolDefinition,
  createReadToolDefinition,
  createWriteToolDefinition,
  keyHint,
  AssistantMessageComponent,
  UserMessageComponent,
  type ExtensionAPI,
  type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { Text, visibleWidth, type Component } from "@earendil-works/pi-tui";

type Theme = {
  fg(color: "accent" | "borderAccent" | "borderMuted" | "error" | "muted" | "success" | "text" | "toolOutput" | "toolTitle" | "warning", text: string): string;
  bg(color: "userMessageBg", text: string): string;
  bold(text: string): string;
};
type RecordLike = Record<string, unknown>;
type RenderOptions = { expanded?: boolean; isPartial?: boolean };
type RenderContext = {
  args?: unknown;
  executionStarted?: boolean;
  isError?: boolean;
  isPartial?: boolean;
  lastComponent?: unknown;
};
type UserMessageRender = (this: UserMessageComponent, width: number) => string[];
type UserMessagePatch = {
  theme: Theme;
  originalRender: UserMessageRender;
  patchedRender: UserMessageRender;
  owners: Set<symbol>;
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
const USER_PATCH_MARK = Symbol.for("pi.toolRails.userMessagePatch");
const STYLED_BUILTINS = new Set(["bash", "edit", "grep", "read", "write"]);
const PREVIEW_LINES = 5;
const HOME = homedir().replace(/\\/g, "/").replace(/\/$/, "");

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
    required: Array.from(new Set(["reasoning", ...(parameters?.required ?? [])])),
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
    case "bash": return "run command";
    case "read": return "inspect file";
    case "write": return "write file";
    case "edit": return "update file";
    case "grep": return "find matching lines";
    case "find": return "find files";
    case "ls": return "list directory";
    default: return "run tool";
  }
}

function targetText(name: string, args: RecordLike): string {
  if (name === "bash") return brief(args.command);
  if (name === "grep") return `/${brief(args.pattern)}/ in ${path(args.path ?? ".")}`;
  if (name === "find") return `${brief(args.pattern)} in ${path(args.path ?? ".")}`;
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
    const hint = `${remaining} more ${remaining === 1 ? "line" : "lines"} · ${keyHint("app.tools.expand", "expand")}`;
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
    const message = lines.find((line) => line.trim())?.trim() || "failed";
    return theme.fg("error", message);
  }
  if (name === "read") {
    const count = lines.filter((line) => line.trim() && !/^\[Showing lines /.test(line)).length;
    return theme.fg("toolOutput", `${count} ${count === 1 ? "line" : "lines"}`);
  }
  if (name === "write") {
    const count = typeof args.content === "string" && args.content.length > 0
      ? (args.content.match(/\n/g)?.length ?? 0) + (args.content.endsWith("\n") ? 0 : 1)
      : 0;
    return theme.fg("toolOutput", `${count} ${count === 1 ? "line" : "lines"} written`);
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
    return theme.fg("toolOutput", "updated");
  }
  if (name === "bash") return theme.fg("toolOutput", "done");
  if (name === "grep") {
    const count = lines.filter((line) => line.trim()).length;
    const color = count > 0 ? "success" : "toolOutput";
    return theme.fg(color, `${count} ${count === 1 ? "match" : "matches"}`);
  }
  if (name === "find" || name === "ls") {
    const count = lines.filter((line) => line.trim()).length;
    const noun = name === "find" ? (count === 1 ? "file" : "files") : (count === 1 ? "entry" : "entries");
    return theme.fg("toolOutput", `${count} ${noun}`);
  }
  return theme.fg("toolOutput", lines.length ? "done" : "completed");
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
    return reusableText(context, context.isError ? theme.fg("error", "↳ failed") : "");
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

function frameTop(width: number, theme: Theme): string {
  const label = " you ";
  // borderAccent (primary) contrasts on userMessageBg; borderMuted blends into it under Matugen.
  const edge = (s: string) => theme.fg("borderAccent", s);
  return `${edge("╭─")}${theme.fg("accent", theme.bold(label))}${edge("─".repeat(Math.max(0, width - label.length - 3)) + "╮")}`;
}

function frameBottom(width: number, theme: Theme): string {
  return theme.fg("borderAccent", `╰${"─".repeat(Math.max(0, width - 2))}╯`);
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
function releaseUserFrame(
  shared: typeof globalThis & Record<symbol, unknown>,
  patch: UserMessagePatch,
  owner: symbol,
 ): void {
  patch.owners.delete(owner);
  if (patch.owners.size > 0) return;
  if (UserMessageComponent.prototype.render === patch.patchedRender) {
    UserMessageComponent.prototype.render = patch.originalRender;
  }
  if (shared[USER_PATCH_MARK] === patch) delete shared[USER_PATCH_MARK];
}

function installUserFrame(theme: Theme): () => void {
  if (process.env.PI_TOOL_RAILS_DISABLE_USER_FRAME === "1") return () => {};
  const shared = globalThis as typeof globalThis & Record<symbol, unknown>;
  const owner = Symbol("pi.toolRails.userFrame");
  const existing = shared[USER_PATCH_MARK] as Partial<UserMessagePatch> | undefined;
  if (existing?.originalRender && typeof existing.originalRender === "function") {
    const patch = existing as UserMessagePatch;
    patch.theme = theme;
    patch.owners ??= new Set<symbol>();
    patch.patchedRender ??= UserMessageComponent.prototype.render;
    patch.owners.add(owner);
    return () => releaseUserFrame(shared, patch, owner);
  }

  const state = { theme, originalRender: UserMessageComponent.prototype.render, owners: new Set<symbol>([owner]) };
  const patchedRender: UserMessageRender = function (width: number): string[] {
    if (width < 16) return state.originalRender.call(this, width);
    const lines = state.originalRender.call(this, width - 4);
    if (!lines.length) return lines;
    if (lines[0].startsWith(OSC133_START)) lines[0] = lines[0].slice(OSC133_START.length);
    const last = lines.length - 1;
    if (lines[last].startsWith(OSC133_END)) lines[last] = lines[last].slice(OSC133_END.length);

    const framed = [
      state.theme.bg("userMessageBg", frameTop(width, state.theme)),
      ...lines.map((line) => {
        const padding = " ".repeat(Math.max(0, width - 4 - visibleWidth(line)));
        const edge = (s: string) => state.theme.fg("borderAccent", s);
        // The native content line resets its own background; restart it for the right side.
        const left = state.theme.bg("userMessageBg", `${edge("│")} ${line}`);
        const right = state.theme.bg("userMessageBg", `${padding} ${edge("│")}`);
        return left + right;
      }),
      state.theme.bg("userMessageBg", frameBottom(width, state.theme)),
    ];
    framed[0] = OSC133_START + framed[0];
    framed[framed.length - 1] = OSC133_END + framed[framed.length - 1];
    return framed;
  };

  const patch: UserMessagePatch = { ...state, patchedRender };
  shared[USER_PATCH_MARK] = patch;
  UserMessageComponent.prototype.render = patchedRender;
  return () => releaseUserFrame(shared, patch, owner);
}

function isUnclaimedBuiltin(pi: ExtensionAPI, name: string): boolean {
  const current = pi.getAllTools().find((tool) => tool.name === name);
  return current?.sourceInfo.source === "builtin";
}

export default function toolRails(pi: ExtensionAPI): void {
  let cleanupAssistantMarker = () => {};
  let cleanupUserFrame = () => {};
  pi.on("session_start", (_event, ctx) => {
    if (ctx.mode !== "tui") return;

    const builtins = [
      createReadToolDefinition(ctx.cwd),
      createBashToolDefinition(ctx.cwd),
      createWriteToolDefinition(ctx.cwd),
      createEditToolDefinition(ctx.cwd),
      createGrepToolDefinition(ctx.cwd),
    ];
    for (const tool of builtins) {
      if (STYLED_BUILTINS.has(tool.name) && isUnclaimedBuiltin(pi, tool.name)) {
        pi.registerTool(decorateTool(tool));
      }
    }
    cleanupAssistantMarker = installAssistantMarker(ctx.ui.theme);
    cleanupUserFrame = installUserFrame(ctx.ui.theme);
  });
  pi.on("session_shutdown", () => {
    cleanupAssistantMarker();
    cleanupUserFrame();
    cleanupUserFrame = () => {};
  });
}
