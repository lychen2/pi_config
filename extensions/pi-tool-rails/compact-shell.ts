import {
  ToolExecutionComponent,
  type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth, type Component } from "@earendil-works/pi-tui";

type ShellMode = "default" | "self";
type GetRenderShell = (this: ToolExecutionComponent) => ShellMode;
type ToolRender = (this: ToolExecutionComponent, width: number) => string[];
type ShellPrototype = {
  getRenderShell?: GetRenderShell;
  render: ToolRender;
};
type ToolTheme = {
  bg(color: "toolErrorBg" | "toolPendingBg" | "toolSuccessBg", text: string): string;
  fg(color: "error" | "text" | "toolTitle" | "warning", text: string): string;
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
};

const ANSI_ESCAPE = /\x1B(?:\][^\x07\x1B]*(?:\x07|\x1B\\)|\[[0-?]*[ -/]*[@-~]|[@-Z\\-_])/g;
const SHELL_PATCH = Symbol.for("pi.toolRails.labeledShellPatch");
const LABEL_WIDTH = 10;
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

function labelText(name: string): string {
  const upper = name.toUpperCase();
  return visibleWidth(upper) <= LABEL_WIDTH
    ? upper
    : `${plain(truncateToWidth(upper, LABEL_WIDTH - 1, ""))}…`;
}

export function labelLines(name: string): string[] {
  const words = name.split("_").filter(Boolean);
  return words.length > 1 ? words.map(labelText) : [labelText(name)];
}

export function labelPadding(label: string): { left: number; right: number } {
  const total = Math.max(0, LABEL_WIDTH - visibleWidth(label));
  return { left: Math.floor(total / 2), right: Math.ceil(total / 2) };
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
    const lines = state.originalRender.call(this, innerWidth);
    if (execution.hideComponent || !execution.selfRenderContainer) return lines;

    const contentLines = execution.selfRenderContainer.render(innerWidth);
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
    const prefixFor = (label: string): string => {
      const padding = labelPadding(label);
      const leftLabelPadding = " ".repeat(padding.left);
      const rightLabelPadding = " ".repeat(padding.right);
      return ` ${leftLabelPadding}${boldLabel(label, state.theme, labelColor)}${rightLabelPadding}${separator} `;
    };

    const hasStandaloneHeader =
      isStandaloneToolNameLine(lines[firstContent], name) &&
      isStandaloneToolNameLine(contentLines[0] ?? "", name);
    const contentStart = firstContent + (hasStandaloneHeader ? 1 : 0);
    const renderedContentLineCount = Math.max(0, contentLines.length - (hasStandaloneHeader ? 1 : 0));
    const contentEnd = Math.min(lines.length, contentStart + renderedContentLineCount);
    const body = Array.from({ length: Math.max(renderedContentLineCount, labels.length) }, (_, index) => {
      const content = index < renderedContentLineCount
        ? lines[contentStart + index]
        : "";
      return backgroundLine(`${prefixFor(labels[index] ?? "")}${content}`, width, background, state.theme);
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
