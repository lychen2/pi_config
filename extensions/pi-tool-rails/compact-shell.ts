import {
  ToolExecutionComponent,
  type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth, type Component } from "@earendil-works/pi-tui";
import { shortToolName, toolEmoji } from "./tool-presentations.mjs";

type ShellMode = "default" | "self";
type GetRenderShell = (this: ToolExecutionComponent) => ShellMode;
type ToolRender = (this: ToolExecutionComponent, width: number) => string[];
type ShellPrototype = {
  getRenderShell?: GetRenderShell;
  render: ToolRender;
};
type ToolTheme = {
  bg(color: "toolErrorBg" | "toolPendingBg" | "toolSuccessBg", text: string): string;
  fg(color: "accent" | "error" | "muted" | "success" | "text" | "toolTitle" | "warning", text: string): string;
  getBgAnsi?(color: "toolErrorBg" | "toolPendingBg" | "toolSuccessBg"): string;
  bold(text: string): string;
};
type ShellPatch = {
  originalShell: GetRenderShell;
  patchedShell: GetRenderShell;
  originalRender: ToolRender;
  patchedRender: ToolRender;
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
};

const ANSI_ESCAPE = /\x1B(?:\][^\x07\x1B]*(?:\x07|\x1B\\)|\[[0-?]*[ -/]*[@-~]|[@-Z\\-_])/g;
const SHELL_PATCH = Symbol.for("pi.toolRails.labeledShellPatch");
// Two cells keep the leading emoji from crowding the centered tool text.
const LABEL_WIDTH = 12;
const PREFIX_WIDTH = LABEL_WIDTH + 3;
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
  const reserved = visibleWidth(toolEmoji(name)) * 2;
  return fitLabel(shortToolName(name), Math.max(1, LABEL_WIDTH - reserved));
}

export function labelLines(name: string): string[] {
  if (shortToolName(name) === "todowrite") return [fitLabel("todo"), "write"];
  return [labelText(name)];
}

export function labelPadding(label: string): { left: number; right: number } {
  const total = Math.max(0, LABEL_WIDTH - visibleWidth(label));
  return { left: Math.floor(total / 2), right: Math.ceil(total / 2) };
}
export function labelLayout(name: string, index: number, label: string): { emoji: string; text: string; left: number; right: number } {
  const emoji = index === 0 ? toolEmoji(name) : "";
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

const STRUCTURED_RESULT_TOOLS = new Set(["push-task"]);

function isUsefulContentLine(line: string): boolean {
  const text = plain(line).trim();
  if (!text || /^(?:\.{3}|…)\s*$/.test(text)) return false;
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
  if (/^(?:edit|replace|write|ast_grep_replace|aft_import|aft_refactor)$/.test(name)) {
    const mutation = matching(/^\+\d+\/-\d+(?:\s|$)|^(?:created|updated|written|applied|deleted|restored|no net change)\b/i);
    if (mutation) return mutation;
  }
  if (/^(?:bash|bash_status|bash_watch|bash_kill)$/.test(name)) {
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
  if (selection.toolName && STRUCTURED_RESULT_TOOLS.has(selection.toolName)) return lines;
  const headline = lines[0]!;
  const result = semanticResultLine(lines.slice(1), selection);
  return result ? [headline, result] : [headline];
}
function removeRepeatedToolName(line: string, name: string): string {
  const visible = plain(line).trimStart();
  const lowerName = name.toLowerCase();
  if (visible.toLowerCase() !== lowerName && !visible.toLowerCase().startsWith(`${lowerName} `)) {
    return line;
  }
  const index = line.toLowerCase().indexOf(lowerName);
  if (index < 0) return line;

  const withoutName = `${line.slice(0, index)}${line.slice(index + name.length)}`;
  const leftoverGap = withoutName.indexOf(" ", index);
  return leftoverGap < 0
    ? withoutName
    : `${withoutName.slice(0, leftoverGap)}${withoutName.slice(leftoverGap + 1)}`;
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

function boldLabel(text: string, theme: ToolTheme, color: "error" | "toolTitle" | "warning"): string {
  // Avoid chalk.bold (often emits \x1b[0m). Use intensity only.
  return `\x1b[1m${theme.fg(color, text)}\x1b[22m`;
}

export function styleStructuredLine(line: string, theme: ToolTheme): string {
  if (line.includes("\x1b[")) return line;
  if (/^\s*Todos\b/.test(line)) return theme.fg("toolTitle", line);
  const match = line.match(/^(\s*)([✓◐○×•])(.*)$/);
  if (!match) return line;
  const color = match[2] === "✓" ? "success" : match[2] === "×" ? "error" : match[2] === "○" ? "muted" : "warning";
  const rest = match[3]!.replace(/^(\s+)(#[^\s]+)/, (_value, spacing, id) => `${spacing}${theme.fg("accent", id)}`);
  return `${match[1]}${theme.fg(color, match[2])}${rest}`;
}

function backgroundLine(
  line: string,
  width: number,
  background: "toolErrorBg" | "toolPendingBg" | "toolSuccessBg",
  theme: ToolTheme,
): string {
  const bgOpen = bgOpenCode(theme, background);
  const clipped = truncateToWidth(line, width, "");
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
    patch.owners.add(owner);
    return () => release(shared, prototype, patch, owner);
  }
  if (typeof prototype.getRenderShell !== "function" || typeof prototype.render !== "function") {
    return () => {};
  }

  const state = {
    originalShell: prototype.getRenderShell,
    originalRender: prototype.render,
    owners: new Set<symbol>([owner]),
    theme,
  };
  const patchedShell: GetRenderShell = function (): ShellMode {
    state.originalShell.call(this);
    return "self";
  };
  const patchedRender: ToolRender = function (width: number): string[] {
    const execution = this as unknown as ExecutionState;
    const innerWidth = Math.max(1, width - PREFIX_WIDTH);
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

    const contentLines = rendered.contentLines ?? execution.selfRenderContainer.render(innerWidth);
    if (contentLines.length === 0) return lines;
    const firstContent = lines.findIndex((line) => plain(line).trim() !== "");
    if (firstContent < 0) return lines;

    const background = execution.isPartial
      ? "toolPendingBg"
      : execution.result?.isError
        ? "toolErrorBg"
        : "toolSuccessBg";
    const labelColor = execution.isPartial
      ? "warning"
      : execution.result?.isError
        ? "error"
        : "toolTitle";
    const name = execution.toolName ?? "tool";
    const labels = labelLines(name);
    const separator = state.theme.fg("text", "│");
    const prefixFor = (label: string, index: number): string => {
      const layout = labelLayout(name, index, label);
      const emojiText = layout.emoji ? state.theme.fg(labelColor, layout.emoji) : "";
      return ` ${" ".repeat(layout.left)}${emojiText}${boldLabel(layout.text, state.theme, labelColor)}${" ".repeat(layout.right)}${separator} `;
    };

    const hasStandaloneHeader =
      isStandaloneToolNameLine(lines[firstContent], name) &&
      isStandaloneToolNameLine(contentLines[0] ?? "", name);
    const contentStart = firstContent + (hasStandaloneHeader ? 1 : 0);
    const fullContentLines = contentLines.slice(hasStandaloneHeader ? 1 : 0);
    const renderedContentLineCount = fullContentLines.length;
    const visibleContentLines = visibleToolContentLines(fullContentLines, execution.expanded, {
      isError: execution.result?.isError,
      toolName: name,
    });
    const contentEnd = Math.min(lines.length, contentStart + renderedContentLineCount);
    const body = Array.from({ length: Math.max(visibleContentLines.length, labels.length) }, (_, index) => {
      const content = index < visibleContentLines.length
        ? visibleContentLines[index]
        : "";
      return backgroundLine(`${prefixFor(labels[index] ?? "", index)}${styleStructuredLine(content, state.theme)}`, width, background, state.theme);
    });
    const blank = backgroundLine("", width, background, state.theme);

    return [
      ...lines.slice(0, firstContent),
      blank,
      ...body,
      blank,
      ...lines.slice(contentEnd),
    ];
  };

  const patch: ShellPatch = { ...state, patchedShell, patchedRender };
  shared[SHELL_PATCH] = patch;
  prototype.getRenderShell = patchedShell;
  prototype.render = patchedRender;
  return () => release(shared, prototype, patch, owner);
}

export default function labeledToolShell(pi: ExtensionAPI): void {
  let cleanup = () => {};
  pi.on("session_start", (_event, ctx) => {
    if (ctx.mode === "tui") cleanup = installLabeledShell(ctx.ui.theme);
  });
  pi.on("session_shutdown", () => {
    cleanup();
    cleanup = () => {};
  });
}
