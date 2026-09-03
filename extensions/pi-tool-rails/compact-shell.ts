import {
  BashExecutionComponent,
  ToolExecutionComponent,
  type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth, type Component } from "@earendil-works/pi-tui";
import { shortToolName, toolIcon } from "./tool-presentations.mjs";
import { installPrototypePatch } from "./prototype-patch-registry.ts";
import { compactBashBody, compactToolBody } from "./tool-body-polish.ts";

type ShellMode = "default" | "self";
type GetRenderShell = (this: ToolExecutionComponent) => ShellMode;
type ToolRender = (this: ToolExecutionComponent, width: number) => string[];
type ToolInvalidate = (this: ToolExecutionComponent) => void;
type ShellPrototype = {
  getRenderShell?: GetRenderShell;
  render: ToolRender;
  invalidate?: ToolInvalidate;
};
type SettledRender = {
  width: number;
  result: object;
  expanded: boolean;
  showImages: boolean;
  lines: string[];
};
type ToolTheme = {
  bg(color: "toolErrorBg" | "toolPendingBg" | "toolSuccessBg", text: string): string;
  fg(color: "accent" | "borderAccent" | "dim" | "error" | "muted" | "success" | "syntaxFunction" | "syntaxVariable" | "text" | "toolOutput" | "toolTitle" | "warning", text: string): string;
  getBgAnsi?(color: "toolErrorBg" | "toolPendingBg" | "toolSuccessBg"): string;
  bold(text: string): string;
};
type ShellPatch = {
  originalShell: GetRenderShell;
  patchedShell: GetRenderShell;
  originalRender: ToolRender;
  patchedRender: ToolRender;
  originalInvalidate?: ToolInvalidate;
  patchedInvalidate?: ToolInvalidate;
  settledRenders: WeakMap<object, SettledRender>;
  owners: Set<symbol>;
  theme: ToolTheme;
};
type ExecutionState = {
  hideComponent?: boolean;
  imageComponents?: unknown[];
  isPartial?: boolean;
  result?: { isError?: boolean };
  selfRenderContainer?: Component;
  toolName?: string;
  expanded?: boolean;
  showImages?: boolean;
};

const ANSI_ESCAPE = /\x1B(?:\][^\x07\x1B]*(?:\x07|\x1B\\)|\[[0-?]*[ -/]*[@-~]|[@-Z\\-_])/g;
const DIFF_BACKGROUND = /\x1b\[48;(?:2;\d+;\d+;\d+|5;(?:22|52))m/;
const SHELL_PATCH = Symbol.for("pi.toolRails.labeledShellPatch");
// Two cells keep the leading emoji from crowding the centered tool text.
const LABEL_WIDTH = 12;
const BOX_LEFT_RAIL = "┃ ";
const BOX_RIGHT_RAIL = "│";

function boxStatusLabel(execution: ExecutionState): { label: string; color: "error" | "toolTitle" | "warning" } {
  const name = shortToolName(execution.toolName ?? "tool").toUpperCase();
  const icon = toolIcon(execution.toolName ?? "tool");
  if (execution.isPartial !== false) return { label: `◆ ${icon} ${name} · 执行中`, color: "warning" };
  if (execution.result?.isError) return { label: `× ${icon} ${name} · 失败`, color: "error" };
  return { label: `✓ ${icon} ${name} · 完成`, color: "toolTitle" };
}

function fitBorderLabel(label: string, width: number): string {
  // Reserve ╭─, one trailing ╮, and two spaces around the status label.
  const available = Math.max(1, width - 5);
  if (visibleWidth(label) <= available) return label;
  return `${plain(truncateToWidth(label, Math.max(1, available - 1), ""))}…`;
}

export function toolBoxTop(execution: ExecutionState, width: number, theme: ToolTheme): string {
  if (width <= 0) return "";
  const status = boxStatusLabel(execution);
  const label = ` ${fitBorderLabel(status.label, width)} `;
  const remaining = Math.max(0, width - 3 - visibleWidth(label));
  const line = `${theme.fg("borderAccent", "╭─")}${theme.fg(status.color, theme.bold(label))}${theme.fg("borderAccent", `${"─".repeat(remaining)}╮`)}`;
  return truncateToWidth(line, width, "");
}

export function toolBoxBottom(width: number, theme: ToolTheme): string {
  return theme.fg("borderAccent", `╰${"─".repeat(Math.max(0, width - 2))}╯`);
}

export function toolBoxLine(line: string, width: number, theme: ToolTheme): string {
  const left = theme.fg("borderAccent", BOX_LEFT_RAIL);
  const right = theme.fg("borderAccent", BOX_RIGHT_RAIL);
  const contentWidth = Math.max(0, width - visibleWidth(BOX_LEFT_RAIL) - visibleWidth(BOX_RIGHT_RAIL));
  const content = truncateToWidth(line, contentWidth, "");
  return `${left}${content}${" ".repeat(Math.max(0, contentWidth - visibleWidth(content)))}${right}`;
}
function release(
  shared: typeof globalThis & Record<symbol, unknown>,
  prototype: ShellPrototype,
  patch: ShellPatch,
  owner: symbol,
): void {
  patch.owners.delete(owner);
  if (patch.owners.size > 0) return;
  if (prototype.getRenderShell === patch.patchedShell) {
    prototype.getRenderShell = patch.originalShell;
  }
  if (prototype.render === patch.patchedRender) {
    prototype.render = patch.originalRender;
  }
  if (patch.patchedInvalidate && prototype.invalidate === patch.patchedInvalidate) {
    if (patch.originalInvalidate) prototype.invalidate = patch.originalInvalidate;
    else delete prototype.invalidate;
  }
  if (shared[SHELL_PATCH] === patch) delete shared[SHELL_PATCH];
}

function plain(line: string): string {
  return line.replace(ANSI_ESCAPE, "");
}

function fitLabel(text: string, width = LABEL_WIDTH): string {
  return visibleWidth(text) <= width
    ? text
    : `${plain(truncateToWidth(text, Math.max(1, width - 1), ""))}…`;
}

function labelText(name: string): string {
  const reserved = visibleWidth(toolIcon(name)) * 2;
  return fitLabel(shortToolName(name), Math.max(1, LABEL_WIDTH - reserved));
}

export function labelLines(name: string): string[] {
  return [labelText(name)];
}

export function labelPadding(label: string): { left: number; right: number } {
  const total = Math.max(0, LABEL_WIDTH - visibleWidth(label));
  return { left: Math.floor(total / 2), right: Math.ceil(total / 2) };
}
export function labelLayout(name: string, index: number, label: string): { emoji: string; text: string; left: number; right: number } {
  const emoji = index === 0 ? toolIcon(name) : "";
  const emojiWidth = visibleWidth(emoji);
  const text = fitLabel(label, Math.max(1, LABEL_WIDTH - emojiWidth * 2));
  const padding = labelPadding(text);
  return {
    emoji,
    text,
    left: Math.max(0, padding.left - emojiWidth),
    right: padding.right,
  };
}
type ContentSelection = {
  isError?: boolean;
  toolName?: string;
};

export function isInternalToolDiagnosticLine(line: string): boolean {
  return /^\s*RTK rewrite:\s*/i.test(plain(line));
}

function isUsefulContentLine(line: string): boolean {
  const text = plain(line).trim();
  if (!text || isInternalToolDiagnosticLine(line) || /^(?:\.{3}|…)\s*$/.test(text)) return false;
  if (/^\[AFT\s/i.test(text)) return false;
  if (/^(?:Zoom any result|More results available|Use .* to (?:continue|expand)|Tip:)/i.test(text)) return false;
  if (/\b(?:more|earlier) (?:line|lines|row|rows)\b.*\bexpand\b/i.test(text)) return false;
  return true;
}

function semanticResultLine(lines: string[], selection: ContentSelection): string | undefined {
  const candidates = lines.filter(isUsefulContentLine);
  if (candidates.length === 0) return undefined;

  const text = (line: string) => plain(line).trim();
  const matching = (pattern: RegExp) => candidates.find((line) => pattern.test(text(line)));
  const active = matching(/^◐\s/);
  if (active) return active;

  if (selection.isError) {
    return matching(/^(?:×\s*)?(?:error|failed|failure|fatal|exception|denied|invalid|not found|exit\s+[1-9]\d*)\b/i)
      ?? candidates[0];
  }

  const name = selection.toolName ?? "";
  if (/^(?:edit|replace|write|readSeek_edit|readSeek_write|readSeek_rename|conflict)$/.test(name)) {
    const mutation = matching(/^\+\d+\/-\d+(?:\s|$)|^(?:created|updated|written|applied|deleted|restored|no net change)\b/i);
    if (mutation) return mutation;
  }
  if (/^(?:bash|bash_bg|bash_status|bash_watch|bash_kill)$/.test(name)) {
    const command = matching(/^(?:completed|running|background task|task\s+\S+|exit\s+\d+|command failed)\b/i);
    if (command) return command;
  }

  return matching(/^(?:✓\s*)?(?:found|matched|completed|succeeded|passed|created|updated|written|applied|deleted|restored|saved|loaded|sent|started|running|closed|cancelled)\b/i)
    ?? matching(/^\d+\s+(?:matches?|results?|files?|entries|lines?|items?|tasks?|tools?|warnings?|errors?)\b/i)
    ?? matching(/^\+\d+\/-\d+(?:\s|$)|^exit\s+\d+\b/i)
    ?? candidates[0];
}

export function visibleToolContentLines(
  lines: string[],
  expanded = false,
  selection: ContentSelection = {},
): string[] {
  if (expanded || lines.length <= 1) return lines;
  const visibleLines = lines.filter(isUsefulContentLine);
  if (visibleLines.length === 0) return [];
  const headline = visibleLines[0]!;
  const result = semanticResultLine(visibleLines.slice(1), selection);
  return result ? [headline, result] : [headline];
}

export function isStandaloneToolNameLine(line: string, name: string): boolean {
  return plain(line).trim().toLowerCase() === name.toLowerCase();
}

/** chalk.bold / nested theme.fg can emit full SGR reset and drop the tool-row background mid-line. */
function bgOpenCode(
  theme: ToolTheme,
  background: "toolErrorBg" | "toolPendingBg" | "toolSuccessBg",
): string {
  if (typeof theme.getBgAnsi === "function") return theme.getBgAnsi(background);
  const sample = theme.bg(background, " ");
  const match = sample.match(/^\x1b\[[0-9;]*m/);
  return match?.[0] ?? "";
}

function keepBackground(text: string, bgOpen: string): string {
  if (!bgOpen) return text;
  // Re-open tool background after full reset or explicit bg-default.
  return text
    .replace(/\x1b\[0m/g, `\x1b[0m${bgOpen}`)
    .replace(/\x1b\[49m/g, bgOpen);
}

function tintToolDivider(text: string): string {
  const match = text.match(DIFF_BACKGROUND);
  const matchIndex = match?.index;
  const dividerIndex = text.indexOf("│");
  if (!match || matchIndex === undefined || dividerIndex < 0 || dividerIndex >= matchIndex) return text;
  if (plain(text.slice(dividerIndex + 1, matchIndex)).trim() !== "") return text;
  return `${text.slice(0, dividerIndex)}${match[0]}${text.slice(dividerIndex)}`;
}

const DELIMITED_SUMMARY_TOOLS = new Set(["readSeek_digest"]);
// Pi has no generic secondary foreground slot; Matugen maps syntaxFunction to secondary.
const DELIMITED_SUMMARY_COLORS = ["success", "accent", "syntaxFunction", "toolOutput", "muted"] as const;

function styleDelimitedSummary(line: string, theme: ToolTheme, selection: ContentSelection): string | undefined {
  if (selection.isError || !selection.toolName || !DELIMITED_SUMMARY_TOOLS.has(selection.toolName)) return undefined;
  const visible = plain(line);
  const leading = visible.match(/^\s*/)?.[0] ?? "";
  const segments = visible.slice(leading.length).split(" · ");
  if (segments.length < 2 || segments.some((segment) => !segment)) return undefined;
  return `${leading}${segments
    .map((segment, index) => `${index === 0 ? "" : theme.fg("muted", " · ")}${theme.fg(DELIMITED_SUMMARY_COLORS[index % DELIMITED_SUMMARY_COLORS.length]!, segment)}`)
    .join("")}`;
}

export function styleStructuredLine(line: string, theme: ToolTheme, selection: ContentSelection = {}): string {
  const delimited = styleDelimitedSummary(line, theme, selection);
  if (delimited) return delimited;
  if (line.includes("\x1b[")) return line;
  if (/^\s*Todos\b/.test(line)) return theme.fg("toolTitle", line);
  const match = line.match(/^(\s*)([✓◐○×•★✦✧🌸♥🍡])(.*)$/);
  if (!match) return line;
  const symbol = match[2]!;
  const color = (symbol === "✓" || symbol === "★" || symbol === "🌸" || symbol === "♥")
    ? "success"
    : symbol === "×"
      ? "error"
      : symbol === "○"
        ? "muted"
        : (symbol === "✦" || symbol === "✧" || symbol === "🍡")
          ? "accent"
          : "warning";
  const rest = match[3]!.replace(/^(\s+)(#[^\s]+)/, (_value, spacing, id) => `${spacing}${theme.fg("accent", id)}`);
  return `${match[1]}${theme.fg(color, match[2])}${rest}`;
}

export function backgroundLine(
  line: string,
  width: number,
  background: "toolErrorBg" | "toolPendingBg" | "toolSuccessBg",
  theme: ToolTheme,
): string {
  const bgOpen = bgOpenCode(theme, background);
  const clipped = tintToolDivider(truncateToWidth(line, width, ""));
  const padded = clipped + " ".repeat(Math.max(0, width - visibleWidth(clipped)));
  return theme.bg(background, keepBackground(padded, bgOpen));
}

export function renderWithCapturedSelf(
  component: ToolExecutionComponent,
  originalRender: ToolRender,
  container: Component,
  width: number,
): { lines: string[]; contentLines?: string[] } {
  const originalContainerRender = container.render;
  let contentLines: string[] | undefined;
  container.render = (contentWidth: number): string[] => {
    const lines = originalContainerRender.call(container, contentWidth);
    if (contentWidth === width) contentLines = lines;
    return lines;
  };
  try {
    return {
      lines: originalRender.call(component, width),
      contentLines,
    };
  } finally {
    container.render = originalContainerRender;
  }
}

function isFrameLine(line: string): boolean {
  const value = plain(line).trim();
  return /^[╭┌╔].*[╮┐╗]$/.test(value)
    || /^[╰└╚].*[╯┘╝]$/.test(value)
    || /^[─═]{3,}$/.test(value);
}

const STABLE_MUTATION_BODY_TOOLS = new Set([
  "edit",
  "readSeek_edit",
  "readSeek_write",
  "replace",
  "write",
]);

export function stabilizeToolBoxBody(name: string, lines: string[]): string[] {
  if (!STABLE_MUTATION_BODY_TOOLS.has(name) || lines.length >= 2) return lines;
  return [...lines, ""];
}

function styleBashBodyLine(line: string, theme: ToolTheme): string {
  const command = plain(line).trim().match(/^\$\s+(.+)$/);
  if (!command) return line;
  return `${theme.fg("accent", "❯")} ${theme.fg("toolOutput", command[1] ?? "")}`;
}

function installBashBox(theme: ToolTheme): () => void {
  return installPrototypePatch(
    BashExecutionComponent.prototype,
    "render",
    "bash-tool-box",
    ({ predecessor, receiver, args }) => {
      const width = args[0];
      const rendered = Reflect.apply(predecessor, receiver, args);
      if (
        typeof width !== "number" ||
        width <= 2 ||
        !Array.isArray(rendered) ||
        !rendered.every((line) => typeof line === "string")
      ) return rendered;
      const lines = rendered as string[];
      if (lines.some((line) => line.includes("\x1b_G") || line.includes("\x1b]1337;File="))) return lines;
      const body = lines.filter((line) => !isFrameLine(line) && !isInternalToolDiagnosticLine(line));
      const compactedBody = compactBashBody(body, theme);
      const running = compactedBody.some((line) => /(?:Running\.\.\.|运行中)/.test(plain(line)));
      const execution: ExecutionState = {
        toolName: "bash",
        isPartial: running,
        result: { isError: body.some((line) => /(?:^|\s)(?:Error|failed|exit\s+[1-9])/i.test(plain(line))) },
      };
      return [
        toolBoxTop(execution, width, theme),
        ...(compactedBody.length > 0 ? compactedBody : [""]).map((line) => toolBoxLine(styleBashBodyLine(line, theme), width, theme)),
        toolBoxBottom(width, theme),
      ];
    },
  );
}

function installLabeledShell(theme: ToolTheme): () => void {
  const shared = globalThis as typeof globalThis & Record<symbol, unknown>;
  const prototype = ToolExecutionComponent.prototype as unknown as ShellPrototype;
  const owner = Symbol("pi.toolRails.labeledShell");
  const existing = shared[SHELL_PATCH] as Partial<ShellPatch> | undefined;
  if (
    existing?.originalShell && existing.patchedShell &&
    existing.originalRender && existing.patchedRender && existing.owners
  ) {
    const patch = existing as ShellPatch;
    patch.theme = theme;
    patch.settledRenders ??= new WeakMap<object, SettledRender>();
    patch.owners.add(owner);
    const cleanupBash = installBashBox(theme);
    return () => {
      cleanupBash();
      release(shared, prototype, patch, owner);
    };
  }
  if (typeof prototype.getRenderShell !== "function" || typeof prototype.render !== "function") {
    return () => {};
  }

  const state = {
    originalShell: prototype.getRenderShell,
    originalRender: prototype.render,
    originalInvalidate: prototype.invalidate,
    settledRenders: new WeakMap<object, SettledRender>(),
    owners: new Set<symbol>([owner]),
    theme,
  };
  const patchedShell: GetRenderShell = function (): ShellMode {
    state.originalShell.call(this);
    return "self";
  };
  const patchedRender: ToolRender = function (width: number): string[] {
    if (width <= 3) return state.originalRender.call(this, width);
    const execution = this as unknown as ExecutionState;
    const cacheable = execution.isPartial === false && !execution.hideComponent &&
      !execution.imageComponents?.length && Boolean(execution.result);
    const cached = cacheable ? state.settledRenders.get(this) : undefined;
    if (cached && cached.width === width && cached.result === execution.result &&
      cached.expanded === Boolean(execution.expanded) && cached.showImages === Boolean(execution.showImages)) {
      return cached.lines;
    }

    const innerWidth = Math.max(1, width - visibleWidth(BOX_LEFT_RAIL) - visibleWidth(BOX_RIGHT_RAIL));
    const rendered = execution.selfRenderContainer
      ? renderWithCapturedSelf(
          this,
          state.originalRender,
          execution.selfRenderContainer,
          innerWidth,
        )
      : { lines: state.originalRender.call(this, innerWidth) };
    const lines = rendered.lines;
    if (execution.hideComponent || !execution.selfRenderContainer) return lines;
    if (lines.some((line) => line.includes("\x1b_G") || line.includes("\x1b]1337;File="))) return lines;

    const contentLines = rendered.contentLines ?? execution.selfRenderContainer.render(innerWidth);
    if (contentLines.length === 0) return lines;
    const name = execution.toolName ?? "tool";
    const framedBody = contentLines.filter((line) => !isFrameLine(line));
    const withoutHeader = framedBody[0] && isStandaloneToolNameLine(framedBody[0], name)
      ? framedBody.slice(1)
      : framedBody;
    const selection = {
      isError: execution.result?.isError,
      toolName: name,
    };
    const bodySource = execution.expanded
      ? withoutHeader
      : withoutHeader.filter((line) => !isInternalToolDiagnosticLine(line));
    const bodyLines = stabilizeToolBoxBody(name, compactToolBody(bodySource, {
      expanded: Boolean(execution.expanded),
      theme: state.theme,
      formatLine: (content) => styleStructuredLine(content, state.theme, selection),
    }));
    const body = (bodyLines.length > 0 ? bodyLines : [""]).map((content) => toolBoxLine(content, width, state.theme));
    const output = [
      toolBoxTop(execution, width, state.theme),
      ...body,
      toolBoxBottom(width, state.theme),
    ];
    if (cacheable && execution.result) {
      state.settledRenders.set(this, {
        width,
        result: execution.result,
        expanded: Boolean(execution.expanded),
        showImages: Boolean(execution.showImages),
        lines: output,
      });
    }
    return output;
  };
  const patchedInvalidate: ToolInvalidate | undefined = typeof state.originalInvalidate === "function"
    ? function (this: ToolExecutionComponent): void {
        state.settledRenders.delete(this);
        state.originalInvalidate!.call(this);
      }
    : undefined;

  const patch: ShellPatch = { ...state, patchedShell, patchedRender, patchedInvalidate };
  shared[SHELL_PATCH] = patch;
  prototype.getRenderShell = patchedShell;
  prototype.render = patchedRender;
  if (patchedInvalidate) prototype.invalidate = patchedInvalidate;
  const cleanupBash = installBashBox(theme);
  return () => {
    cleanupBash();
    release(shared, prototype, patch, owner);
  };
}

export default function labeledToolShell(pi: ExtensionAPI): void {
  let cleanup = () => {};

  function disposeSessionShell(): void {
    cleanup();
    cleanup = () => {};
  }

  pi.on("session_start", (_event, ctx) => {
    disposeSessionShell();
    if (ctx.mode === "tui") cleanup = installLabeledShell(ctx.ui.theme);
  });
  pi.on("session_shutdown", disposeSessionShell);
}
