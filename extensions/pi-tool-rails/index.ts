import { homedir } from "node:os";
import {
  createBashToolDefinition,
  createEditToolDefinition,
  createFindToolDefinition,
  createGrepToolDefinition,
  createLsToolDefinition,
  createReadToolDefinition,
  createWriteToolDefinition,
  keyHint,
  UserMessageComponent,
  type ExtensionAPI,
  type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { Text, visibleWidth, type Component } from "@earendil-works/pi-tui";

type Theme = {
  fg(color: "accent" | "borderAccent" | "borderMuted" | "error" | "muted" | "toolOutput" | "toolTitle" | "warning", text: string): string;
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

const ANSI_ESCAPE = /\x1B(?:\][^\x07\x1B]*(?:\x07|\x1B\\)|\[[0-?]*[ -/]*[@-~]|[@-Z\\-_])/g;
const OSC133_START = "\x1b]133;A\x07";
const OSC133_END = "\x1b]133;B\x07\x1b]133;C\x07";
const USER_PATCH_MARK = Symbol.for("pi.toolRails.userMessagePatch");
const STYLED_BUILTINS = new Set(["bash", "edit", "find", "grep", "ls", "read", "write"]);
const PREVIEW_LINES = 5;
const HOME = homedir().replace(/\\/g, "/").replace(/\/$/, "");

function record(value: unknown): RecordLike {
  return value && typeof value === "object" && !Array.isArray(value) ? value as RecordLike : {};
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

function semanticCall(
  name: string,
  input: unknown,
  theme: Theme,
  context: RenderContext,
): Component | undefined {
  const args = record(input);
  const label = (value: string) => theme.fg("toolTitle", theme.bold(value));
  const target = (value: string) => theme.fg("accent", value);
  const meta = (value: string) => value ? theme.fg("muted", `  ${value}`) : "";
  const pending = context.executionStarted && context.isPartial ? theme.fg("warning", "  ...") : "";
  let content: string | undefined;

  switch (name) {
    case "bash": {
      const timeout = typeof args.timeout === "number" ? `timeout ${args.timeout}s` : "";
      content = `${label("$")} ${target(brief(args.command))}${meta(timeout)}`;
      break;
    }
    case "read": {
      const start = typeof args.offset === "number" ? args.offset : undefined;
      const limit = typeof args.limit === "number" ? args.limit : undefined;
      const range = start === undefined && limit === undefined
        ? ""
        : `${start ?? 1}${limit === undefined ? "" : `-${(start ?? 1) + limit - 1}`}`;
      content = `${label("read")} ${target(sourcePath(args))}${meta(range)}`;
      break;
    }
    case "write": {
      const lines = typeof args.content === "string" ? args.content.split(/\r?\n/).length : 0;
      content = `${label("write")} ${target(sourcePath(args))}${meta(lines ? `${lines} ${lines === 1 ? "line" : "lines"}` : "")}`;
      break;
    }
    case "edit": {
      const changes = Array.isArray(args.edits)
        ? args.edits.length
        : (typeof args.oldText === "string" || typeof args.newText === "string" ? 1 : 0);
      content = `${label("edit")} ${target(sourcePath(args))}${meta(changes ? `${changes} ${changes === 1 ? "change" : "changes"}` : "")}`;
      break;
    }
    case "grep":
      content = `${label("grep")} ${target(`/${brief(args.pattern)}/`)}${meta(path(args.path ?? "."))}`;
      break;
    case "find":
      content = `${label("find")} ${target(brief(args.pattern))}${meta(path(args.path ?? "."))}`;
      break;
    case "ls":
      content = `${label("ls")} ${target(path(args.path ?? "."))}`;
      break;
    default:
      return undefined;
  }

  return reusableText(context, content + pending);
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
  direction: "head" | "tail" = "head",
): string {
  const expanded = options.expanded === true;
  const shown = expanded
    ? lines
    : direction === "tail"
      ? lines.slice(-PREVIEW_LINES)
      : lines.slice(0, PREVIEW_LINES);
  const color = context.isError ? "error" : "toolOutput";
  const prefix = (first: boolean) => theme.fg("muted", first ? "↳ " : "  ");
  let text = shown
    .map((line, index) => `${prefix(index === 0)}${theme.fg(color, line || " ")}`)
    .join("\n");

  const remaining = lines.length - shown.length;
  if (remaining > 0) {
    const position = direction === "tail" ? "earlier" : "more";
    const hint = `${remaining} ${position} ${remaining === 1 ? "line" : "lines"} · ${keyHint("app.tools.expand", "expand")}`;
    const line = `${theme.fg("muted", "  ")}${theme.fg("muted", hint)}`;
    text = direction === "tail" ? `${line}\n${text}` : `${text}\n${line}`;
  }
  return text;
}

function semanticResult(
  name: string,
  result: unknown,
  options: RenderOptions,
  theme: Theme,
  context: RenderContext,
): Component | undefined {
  const lines = outputLines(result);

  if (name === "bash") {
    if (options.isPartial && lines.length === 0) return reusableText(context, "");
    if (context.isError && lines.length === 0) {
      return reusableText(context, `${theme.fg("muted", "↳ ")}${theme.fg("error", "command failed")}`);
    }
    if (lines.length === 0) {
      return reusableText(context, `${theme.fg("muted", "↳ completed")}`);
    }
    return reusableText(context, hierarchyPreview(lines, options, theme, context, "tail"));
  }

  if (name === "grep" || name === "find" || name === "ls") {
    if (options.isPartial) return reusableText(context, "");
    if (context.isError) {
      const errorLines = lines.length ? lines : ["tool failed"];
      return reusableText(context, hierarchyPreview(errorLines, options, theme, context));
    }
    if (options.expanded) {
      return reusableText(context, hierarchyPreview(lines.length ? lines : ["(no results)"], options, theme, context));
    }
    const count = lines.filter((line) => line.trim()).length;
    const unit = name === "grep" ? (count === 1 ? "match" : "matches") : (count === 1 ? "result" : "results");
    const hint = count > 0 ? ` · ${keyHint("app.tools.expand", "expand")}` : "";
    return reusableText(context, theme.fg("muted", `↳ ${count} ${unit}${hint}`));
  }

  return undefined;
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

function decorateTool(tool: ToolDefinition<any, any, any>): ToolDefinition<any, any, any> {
  const renderCall = tool.renderCall;
  const renderResult = tool.renderResult;
  return {
    ...tool,
    renderShell: "default",
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

function releaseUserFrame(shared: typeof globalThis & Record<symbol, unknown>, patch: UserMessagePatch, owner: symbol): void {
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
        // Paint the full row (border + content + pad) so the frame never sits on a different bg.
        return state.theme.bg(
          "userMessageBg",
          `${edge("│")} ${line}${padding} ${edge("│")}`,
        );
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
  let cleanupUserFrame = () => {};
  pi.on("session_start", (_event, ctx) => {
    if (ctx.mode !== "tui") return;

    const builtins = [
      createReadToolDefinition(ctx.cwd),
      createBashToolDefinition(ctx.cwd),
      createWriteToolDefinition(ctx.cwd),
      createEditToolDefinition(ctx.cwd),
      createGrepToolDefinition(ctx.cwd),
      createFindToolDefinition(ctx.cwd),
      createLsToolDefinition(ctx.cwd),
    ];
    for (const tool of builtins) {
      if (STYLED_BUILTINS.has(tool.name) && isUnclaimedBuiltin(pi, tool.name)) {
        pi.registerTool(decorateTool(tool));
      }
    }
    cleanupUserFrame = installUserFrame(ctx.ui.theme);
  });
  pi.on("session_shutdown", () => {
    cleanupUserFrame();
    cleanupUserFrame = () => {};
  });
}
