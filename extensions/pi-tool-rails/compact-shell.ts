import {
  BashExecutionComponent,
  ToolExecutionComponent,
  type ExtensionAPI,
  type Theme,
} from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth, type Component } from "@earendil-works/pi-tui";
import { normalizeToolName, shortToolName, toolIcon } from "./tool-presentations.mjs";
import { backgroundToolStatus, collapsedToolCard, hasToolCardFailure } from "./tool-card-summary.ts";
import { cleanCodemodeText, codemodeCallTarget, measuredSavingsLine, renderCodemodeTree, summarizeCodemodeOutput } from "./codemode-tree.ts";
import { installPrototypePatch } from "./prototype-patch-registry.ts";
import { compactToolBody, TOOL_COLLAPSED_MAX_LINES, TOOL_EXPANDED_MAX_LINES } from "./tool-body-polish.ts";
import { renderSoftFrame, softFrameTop, softFrameBottom, softFrameLine, softFrameInnerWidth, type VisualTheme, type VisualState } from "./visual-style.ts";

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
type ToolTheme = VisualTheme & Pick<Theme, "bg" | "bold"> & {
  getBgAnsi?(color: "toolErrorBg" | "toolPendingBg" | "toolSuccessBg"): string;
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
  result?: { isError?: boolean; content?: unknown; details?: unknown };
  selfRenderContainer?: Component;
  toolName?: string;
  args?: { steps?: unknown; [key: string]: unknown };
  expanded?: boolean;
  cancelled?: boolean;
  showImages?: boolean;
};

const ANSI_ESCAPE = /\x1B(?:\][^\x07\x1B]*(?:\x07|\x1B\\)|\[[0-?]*[ -/]*[@-~]|[@-Z\\-_])/g;
const DIFF_BACKGROUND = /\x1b\[48;(?:2;\d+;\d+;\d+|5;(?:22|52))m/;
const SHELL_PATCH = Symbol.for("pi.toolRails.labeledShellPatch");
// Two cells keep the leading emoji from crowding the centered tool text.
const LABEL_WIDTH = 12;
function boxStatus(execution: ExecutionState): { status: string; state: VisualState } {
  if (execution.cancelled) return { status: "⊘ 已取消", state: "cancelled" };
  if (hasToolCardFailure(execution)) return { status: "× 失败", state: "error" };
  if (execution.isPartial !== false) return { status: "◐ 执行中", state: "running" };
  const background = backgroundToolStatus(execution);
  if (background) return { status: `↗ ${background}`, state: "running" };
  return { status: "✓ 完成", state: "success" };
}

function boxTitle(execution: ExecutionState): string {
  const name = execution.toolName ?? "tool";
  return `${toolIcon(name)} ${shortToolName(name)}`;
}

export function toolBoxTop(execution: ExecutionState, width: number, theme: ToolTheme): string {
  return softFrameTop({ title: boxTitle(execution), ...boxStatus(execution), width, theme });
}

export function toolBoxBottom(width: number, theme: ToolTheme): string {
  return softFrameBottom(width, theme);
}

export function toolBoxLine(line: string, width: number, theme: ToolTheme): string {
  return softFrameLine(line, width, theme);
}

function executionFrame(execution: ExecutionState, lines: string[], width: number, theme: ToolTheme): string[] {
  const { state, status } = boxStatus(execution);
  const surface = state === "error" ? "toolErrorBg" : state === "running" ? "toolPendingBg" : "toolSuccessBg";
  return renderSoftFrame({ theme, title: boxTitle(execution), status, state, lines, width, surface });
}
function solResultLines(result: ExecutionState["result"]): string[] {
  const content = result?.content;
  if (!Array.isArray(content)) return [];
  return content
    .filter((block): block is { type?: unknown; text?: unknown } => Boolean(block) && typeof block === "object")
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .flatMap((block) => (block.text as string).replace(ANSI_ESCAPE, "").replace(/\r/g, "").split("\n"));
}

function usefulSolLine(line: string): boolean {
  const value = railStripped(line);
  if (!value || isInternalToolDiagnosticLine(value) || isFrameLine(value)) return false;
  if (/^(?:codemode|obs_recall|SoL-Pi|⚡ SoL-Pi)/i.test(value)) return false;
  if (/^(?:\[AFT\b|Use .* to (?:continue|expand)|Tip:)/i.test(value)) return false;
  return true;
}

function codemodeBody(execution: ExecutionState, expanded: boolean, theme: ToolTheme, width: number): string[] {
  const args = execution.args ?? {};
  const source = [args.code, args.source, args.script].find((value): value is string => typeof value === "string") ?? "";
  const purpose = [args.reasoning, args.description, args.purpose].find((value): value is string => typeof value === "string" && Boolean(value.trim()));
  const details = execution.result?.details && typeof execution.result.details === "object"
    ? execution.result.details as Record<string, unknown> : {};
  const nativeCallsPresent = Array.isArray(details.calls);
  const calls = nativeCallsPresent
    ? (details.calls as unknown[]).filter((call): call is Record<string, unknown> => Boolean(call) && typeof call === "object") : [];
  let nativeDuration: number | undefined;
  const content = execution.result?.content;
  const nativeHeader = /^Script (completed|failed)\nWall time ([\d.]+) seconds\nOutput:\n/;
  const resultLines = Array.isArray(content) ? content
    .filter((block): block is { type?: unknown; text?: unknown } => Boolean(block) && typeof block === "object")
    .filter(block => block.type === "text" && typeof block.text === "string")
    .flatMap(block => {
      let text = (block.text as string).replace(ANSI_ESCAPE, "").replace(/\r/g, "");
      if (nativeDuration === undefined) {
        const header = text.match(nativeHeader);
        if (header) { nativeDuration = Number(header[2]) * 1000; text = text.slice(header[0].length); }
      }
      return text.split("\n");
    }) : [];
  const meaningful = filterSoLStaticSavingsLines(resultLines).filter(usefulSolLine);
  const duration = [details.duration_ms, details.durationMs, nativeDuration]
    .find((value): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0);
  const durationText = duration === undefined ? "" : ` · ${duration < 1000 ? `${Math.round(duration)}ms` : `${(duration / 1000).toFixed(1)}s`}`;
  const body: string[] = purpose ? [theme.fg("accent", cleanCodemodeText(purpose))] : [];
  if (calls.length) {
    const completed = calls.filter(call => ["ok", "error", "cancelled"].includes(String(call.status))).length;
    const failed = calls.filter(call => call.status === "error").length;
    const cancelled = calls.filter(call => call.status === "cancelled").length;
    const color = failed || execution.result?.isError ? "error" : execution.isPartial !== false ? "warning" : "success";
    body.push(theme.fg(color, `工具调用 ${completed}/${calls.length}${failed ? ` · ${failed} 失败` : ""}${cancelled ? ` · ${cancelled} 取消` : ""}`) + theme.fg("muted", durationText));
  } else {
    body.push(theme.fg("muted", `${execution.isPartial !== false ? "等待调用记录" : "脚本执行"}${durationText}`));
  }
  const fullOutputPath = typeof details.fullOutputPath === "string" ? cleanCodemodeText(details.fullOutputPath) : undefined;
  if (fullOutputPath) body.push(theme.fg("muted", `完整输出: ${fullOutputPath}`));
  body.push(...renderCodemodeTree(calls, expanded, width, theme));
  if (!nativeCallsPresent && source) {
    const refs = [...new Set(Array.from(source.matchAll(/\btools?\.([A-Za-z_$][\w$]*)\s*\(/g), match => match[1]!))];
    if (refs.length) body.push(theme.fg("muted", `代码引用 · ${refs.map(shortToolName).join("、")}`));
  }
  if (meaningful.length) {
    if (expanded) {
      body.push(theme.fg("syntaxFunction", "结果"));
      const limit = Math.min(80, Math.max(0, 200 - body.length - 12));
      body.push(...meaningful.slice(0, limit).map(line => theme.fg(execution.result?.isError ? "error" : "toolOutput", line)));
      if (meaningful.length > limit) body.push(theme.fg("muted", `… +${meaningful.length - limit} 行结果`));
    } else {
      const summaries = summarizeCodemodeOutput(meaningful).filter(line =>
        !line.startsWith("计划 · ") || !calls.some(call => call.name === "update_plan" && codemodeCallTarget(call) === line.slice("计划 · ".length)));
      body.push(...summaries.map(line => theme.fg(execution.result?.isError ? "error" : "toolOutput", `结果 · ${line}`)));
      const saving = meaningful.map(measuredSavingsLine).find((line): line is string => Boolean(line));
      if (saving && !body.some(line => plain(line).includes(saving))) body.push(theme.fg("muted", saving));
    }
  } else if (execution.isPartial === false && !calls.length && !execution.result?.isError) {
    body.push(theme.fg("muted", "无输出"));
  }
  if (expanded) {
    body.push(theme.fg("syntaxVariable", "源代码"));
    const sourceLines = source ? source.replace(/\r/g, "").split("\n") : [];
    const limit = Math.min(80, Math.max(0, 200 - body.length - 1));
    body.push(...sourceLines.slice(0, limit).map(line => theme.fg("toolOutput", line || " ")));
    if (sourceLines.length > limit) body.push(theme.fg("muted", `… +${sourceLines.length - limit} 行代码`));
  }
  return body.slice(0, expanded ? 200 : 12);
}

function recallBody(execution: ExecutionState, expanded: boolean, theme: ToolTheme): string[] {
  const args = execution.args ?? {};
  const id = [args.id, args.observation_id, args.observationId].find((value) => typeof value === "string" || typeof value === "number");
  const offset = [args.offset, args.start].find((value) => typeof value === "number" && Number.isFinite(value));
  const details = execution.result?.details && typeof execution.result.details === "object"
    ? execution.result.details as Record<string, unknown>
    : {};
  const nextOffset = [details.nextOffset, details.next_offset, args.next_offset, args.nextOffset]
    .find((value) => typeof value === "number" && Number.isFinite(value));
  const reference = [id === undefined ? "" : `#${id}`, offset === undefined ? "" : `偏移 ${offset}`, details.eof === true ? "已到末尾" : nextOffset === undefined ? "" : `下次 ${nextOffset}`].filter(Boolean).join(" · ");
  const resultLines = solResultLines(execution.result);
  // SoL puts two transport metadata rows before the actual recovered evidence.
  if (/^\[obs_recall id=\S+ offset=\d+ next_offset=\d+ eof=(?:true|false)\]$/.test(resultLines[0] ?? "")
    && /^\[chunk_bytes=\d+ chunk_lines=\d+; use next_offset to continue\]$/.test(resultLines[1] ?? "")) {
    resultLines.splice(0, 2);
  }
  const lines = filterSoLStaticSavingsLines(resultLines).filter(usefulSolLine);
  if (execution.isPartial !== false && lines.length === 0) return [theme.fg("warning", "正在回读")];
  const preview = lines.slice(0, expanded ? 80 : 2).map((line) => theme.fg(execution.result?.isError ? "error" : "toolOutput", line || " "));
  return [
    `${theme.fg("toolTitle", "🧠 回读")}${reference ? theme.fg("muted", ` · ${reference}`) : ""}`,
    ...preview,
    ...(lines.length > preview.length ? [theme.fg("muted", `… +${lines.length - preview.length} 行`)] : []),
  ];
}

function semanticSolBody(execution: ExecutionState, expanded: boolean, theme: ToolTheme, width: number): string[] | undefined {
  const name = normalizeToolName(execution.toolName ?? "");
  if (name === "codemode") return codemodeBody(execution, expanded, theme, width);
  if (name === "obs_recall") return recallBody(execution, expanded, theme);
  return undefined;
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

// SoL-Pi prints one unconditional `Money saved · <slogan>` row in every tool box it
// renders (update_plan, Action Fusion edit/write, obs_recall). The row restates a
// mechanism property instead of reporting a measurement, so it is dropped here. The
// slogans are matched by prefix because the box wraps them across rows: numeric savings
// such as `12,345 context tokens removed` or `4 KiB removed from future prompts` are real
// measurements and stay visible.
const SOL_PI_STATIC_SAVINGS = [
  "Money saved · compacts only when projected savings are positive",
  "Money saved · 1 model round-trip avoided",
  "Money saved · full observation replay avoided",
];

function railStripped(line: string): string {
  return plain(line).trim().replace(/^[┃│]\s*/u, "").trim();
}

export function isSoLStaticSavingsLine(line: string): boolean {
  const value = railStripped(line);
  return SOL_PI_STATIC_SAVINGS.includes(value);
}

/**
 * Drops SoL-Pi's static savings rows, including the continuation rows the tool box
 * produces when a slogan is wider than the box.
 */
export function filterSoLStaticSavingsLines(lines: readonly string[]): string[] {
  const kept: string[] = [];
  let pending: string | undefined;
  for (const line of lines) {
    const value = railStripped(line);
    if (pending !== undefined) {
      if (value.length > 0 && pending.startsWith(value)) {
        pending = pending.slice(value.length).trimStart() || undefined;
        continue;
      }
      pending = undefined;
    }
    const slogan = value.length > 0
      ? SOL_PI_STATIC_SAVINGS.find((text) => text.startsWith(value))
      : undefined;
    if (slogan !== undefined) {
      pending = slogan.slice(value.length).trimStart() || undefined;
      continue;
    }
    kept.push(line);
  }
  return kept;
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
      if (typeof width !== "number" || width <= 3) return Reflect.apply(predecessor, receiver, args);
      const innerWidth = softFrameInnerWidth(width);
      const rendered = Reflect.apply(predecessor, receiver, [innerWidth, ...args.slice(1)]);
      if (!Array.isArray(rendered) || !rendered.every(line => typeof line === "string")) return rendered;
      const lines = rendered as string[];
      if (lines.some(line => line.includes("\x1b_G") || line.includes("\x1b]1337;File="))) return lines;
      const component = receiver as unknown as {
        status?: string; expanded?: boolean; exitCode?: number; fullOutputPath?: string;
        getCommand(): string; getOutput(): string;
      };
      const originalBody = lines.filter(line => !isFrameLine(line) && !isInternalToolDiagnosticLine(line));
      const execution: ExecutionState = {
        toolName: "bash", args: { command: component.getCommand() },
        isPartial: component.status === "running", cancelled: component.status === "cancelled",
        result: {
          isError: component.status === "error" || component.status === "cancelled",
          content: [{ type: "text", text: component.getOutput() }],
          details: { exitCode: component.exitCode, fullOutputPath: component.fullOutputPath },
        },
      };
      const body = component.expanded
        ? originalBody.map(line => styleBashBodyLine(line, theme))
        : collapsedToolCard(execution, originalBody, theme, innerWidth);
      return executionFrame(execution, body, width, theme);
    },
  );
}

// Strip only SGR backgrounds; keep syntax/diff foregrounds and text intact.
export function withoutBackground(line: string): string {
  return line.replace(/\x1b\[([0-9;:]*)m/g, (sequence, value: string) => {
    const codes = value.split(";");
    const kept: string[] = [];
    for (let i = 0; i < codes.length; i++) {
      const code = Number(codes[i]);
      if (codes[i]?.startsWith("48:")) continue;
      if (code === 38 || code === 58) {
        const count = codes[i + 1] === "2" ? 5 : codes[i + 1] === "5" ? 3 : 1;
        kept.push(...codes.slice(i, i + count));
        i += count - 1;
        continue;
      }
      if (code === 48) {
        if (codes[i + 1] === "5") i += 2;
        else if (codes[i + 1] === "2") i += 4;
        continue;
      }
      if ((code >= 40 && code <= 49) || (code >= 100 && code <= 107)) continue;
      kept.push(codes[i]!);
    }
    return kept.length ? `\x1b[${kept.join(";")}m` : "";
  });
}

export function planBody(steps: unknown, expanded = false): string[] | undefined {
  if (!Array.isArray(steps) || !steps.length) return undefined;
  const valid = steps.filter((step) => step && typeof step.goal === "string" &&
    ["pending", "in_progress", "completed"].includes(step.status));
  if (valid.length !== steps.length) return undefined;
  const completed = valid.filter((step) => step.status === "completed").length;
  const limit = expanded ? TOOL_EXPANDED_MAX_LINES : TOOL_COLLAPSED_MAX_LINES - 1;
  const shown = valid.length <= limit ? valid : [
    ...valid.filter((step) => step.status === "in_progress"),
    ...valid.filter((step) => step.status === "pending"),
    ...valid.filter((step) => step.status === "completed"),
  ].slice(0, limit);
  return [
    `📋 计划 · ${completed}/${valid.length} 完成`,
    ...shown.map((step) => `${step.status === "completed" ? "✓" : step.status === "in_progress" ? "◐" : "○"} ${step.goal.replace(/[\r\n\t]+/g, " ")}`),
    ...(shown.length < valid.length ? [`… +${valid.length - shown.length} 步 · 展开`] : []),
  ];
}

export function mutationBody(lines: readonly string[], expanded: boolean, theme: ToolTheme): string[] {
  const clean = lines.map(withoutBackground);
  const limit = expanded ? TOOL_EXPANDED_MAX_LINES : TOOL_COLLAPSED_MAX_LINES;
  return clean.length <= limit ? clean : [
    ...clean.slice(0, limit),
    theme.fg("dim", `… +${clean.length - limit} 行 · 展开`),
  ];
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

    const innerWidth = softFrameInnerWidth(width);
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

    const capturedLines = rendered.contentLines ?? execution.selfRenderContainer.render(innerWidth);
    const contentLines = capturedLines.length ? capturedLines : lines;
    const name = normalizeToolName(execution.toolName ?? "tool");
    const customSolBody = semanticSolBody(execution, Boolean(execution.expanded), state.theme, innerWidth);
    const framedBody = filterSoLStaticSavingsLines(
      contentLines.filter((line) => !isFrameLine(line)),
    );
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
    const plan = name === "update_plan" && !execution.result?.isError
      ? planBody(execution.args?.steps, Boolean(execution.expanded)) : undefined;
    const expanded = Boolean(execution.expanded);
    const selectedBody = !expanded && name !== "codemode"
      ? plan ?? collapsedToolCard(execution, bodySource, state.theme, innerWidth)
      : customSolBody ?? (plan
        ? plan.map(line => styleStructuredLine(line, state.theme, selection))
        : name === "edit" || name === "write"
          ? mutationBody(bodySource, expanded, state.theme)
          : compactToolBody(bodySource, {
              expanded,
              theme: state.theme,
              formatLine: content => styleStructuredLine(content, state.theme, selection),
            }));
    const bodyLines = stabilizeToolBoxBody(name, selectedBody);
    const output = executionFrame(execution, bodyLines, width, state.theme);
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
