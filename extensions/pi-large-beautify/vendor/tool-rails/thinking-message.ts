import {
  AssistantMessageComponent,
  type ExtensionAPI,
  type Theme,
} from "@earendil-works/pi-coding-agent";
import { type Component, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { installPrototypePatch } from "./prototype-patch-registry.ts";

type Cleanup = () => void;
type AssistantContent = {
  type: string;
  text?: string;
  thinking?: string;
};
type AssistantMessageRuntime = {
  contentContainer?: { children?: Component[] };
  hideThinkingBlock?: boolean;
  thinkingVisibilityOverrides?: Map<number, boolean>;
};
type AssistantMessageLike = {
  content?: AssistantContent[];
  timestamp?: number;
};
type ThinkingRun = {
  blockIndices: number[];
  text: string;
};
type ThinkingTimingEvent = {
  assistantMessageEvent?: { type?: string; contentIndex?: number };
  message?: { timestamp?: number };
};
type MouseRegionLike = Component & { child?: Component };

const MAX_BODY_WIDTH = 100;
const MAX_PREVIEW_LINES = 16;
const HIDDEN_LABEL_PLAIN = "✦ 思考";
const TIMING_KEYS_TO_KEEP = 400;
/** Left margin shared by the collapsed row and the expanded trail header. */
const TRAIL_INDENT = "  ";

/**
 * Wall-clock thinking timing per provider content block, keyed by
 * `${message timestamp}:${block index}` so cloned messages still match.
 */
const thinkingTimings = new Map<string, { startMs: number; endMs?: number }>();

export function clearThinkingTimings(): void {
  thinkingTimings.clear();
}

export function thinkingTimingKey(message: AssistantMessageLike | undefined, blockIndex: number): string {
  return `${message?.timestamp ?? 0}:${blockIndex}`;
}

/**
 * Remembers when each thinking block opened and closed. The transcript only
 * carries the text, so this is the sole source for "思考了多久".
 */
export function recordThinkingTiming(event: ThinkingTimingEvent, now = Date.now()): void {
  const evt = event.assistantMessageEvent;
  if (!evt || typeof evt.contentIndex !== "number") return;
  const key = thinkingTimingKey(event.message, evt.contentIndex);
  if (evt.type === "thinking_start") {
    thinkingTimings.set(key, { startMs: now });
    while (thinkingTimings.size > TIMING_KEYS_TO_KEEP) {
      const oldest = thinkingTimings.keys().next().value;
      if (oldest === undefined) break;
      thinkingTimings.delete(oldest);
    }
  } else if (evt.type === "thinking_end") {
    const timing = thinkingTimings.get(key);
    if (timing) timing.endMs = now;
    else thinkingTimings.set(key, { startMs: now, endMs: now });
  }
}

export function formatThinkingDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  if (total < 60) return `${total}s`;
  return `${Math.floor(total / 60)}m${String(total % 60).padStart(2, "0")}s`;
}

function stripAnsi(line: string): string {
  return line
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, "")
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "");
}

function isBlankRenderedLine(line: string): boolean {
  return stripAnsi(line).trim().length === 0;
}

function removeTrailingPadding(line: string): string {
  return line.replace(
    / +((?:(?:\x1b\[[0-?]*[ -/]*[@-~])|(?:\x1b\][^\x07]*(?:\x07|\x1b\\)))*)$/,
    "$1",
  );
}

function removeOutputPadding(line: string): string {
  let index = 0;
  while (index < line.length && line[index] === "\x1b") {
    if (line[index + 1] === "[") {
      const match = line.slice(index).match(/^\x1b\[[0-?]*[ -/]*[@-~]/);
      if (!match) break;
      index += match[0].length;
      continue;
    }
    if (line[index + 1] === "]") {
      const bell = line.indexOf("\x07", index + 2);
      const st = line.indexOf("\x1b\\", index + 2);
      const end = bell >= 0 && (st < 0 || bell < st) ? bell + 1 : st >= 0 ? st + 2 : -1;
      if (end < 0) break;
      index = end;
      continue;
    }
    break;
  }
  return line[index] === " " ? `${line.slice(0, index)}${line.slice(index + 1)}` : line;
}

function isVisibleContent(content: AssistantContent): boolean {
  return (
    (content.type === "text" && Boolean(content.text?.trim())) ||
    (content.type === "thinking" && Boolean(content.thinking?.trim()))
  );
}

/** Pi adds a Spacer before all visible assistant content, including thinking-only messages. */
export function hasLeadingThinkingBlock(message: AssistantMessageLike): boolean {
  return message.content?.find(isVisibleContent)?.type === "thinking";
}

/**
 * Groups thinking blocks into the runs Pi renders as a single child, in the
 * order Pi numbers its per-run visibility overrides. The text is read from the
 * live message object, so a streaming run reports what exists so far.
 */
export function thinkingRuns(message: AssistantMessageLike): ThinkingRun[] {
  const content = message.content ?? [];
  const runs: ThinkingRun[] = [];
  let current: number[] = [];

  const flush = (): void => {
    const parts = current
      .map((index) => content[index]?.thinking?.trim() ?? "")
      .filter((part) => part.length > 0);
    if (parts.length > 0) runs.push({ blockIndices: [...current], text: parts.join("\n\n") });
    current = [];
  };

  for (let index = 0; index < content.length; index++) {
    if (content[index]!.type === "thinking") current.push(index);
    else flush();
  }
  flush();
  return runs;
}

/**
 * True while a run is still being thought: its final block opened on this
 * session's stream and has not closed yet. Used to keep a live run on a single
 * status row instead of streaming the whole chain down the terminal.
 */
export function thinkingRunIsLive(
  message: AssistantMessageLike,
  run: ThinkingRun,
  streaming: boolean,
): boolean {
  if (!streaming) return false;
  const last = run.blockIndices[run.blockIndices.length - 1];
  if (last === undefined) return false;
  const timing = thinkingTimings.get(thinkingTimingKey(message, last));
  return timing !== undefined && timing.endMs === undefined;
}

/** Pi's own per-run decision, including its click-time visibility overrides. */
export function thinkingRunIsHidden(runtime: AssistantMessageRuntime, runIndex: number): boolean {
  return runtime.thinkingVisibilityOverrides?.get(runIndex) ?? runtime.hideThinkingBlock === true;
}

/** Maps protocol content blocks onto Pi's rendered assistant child components. */
export function thinkingChildIndices(message: AssistantMessageLike): number[] {
  const content = message.content ?? [];
  let childIndex = content.some(isVisibleContent) ? 1 : 0;
  const result: number[] = [];

  for (let index = 0; index < content.length; index++) {
    const item = content[index]!;
    if (item.type === "text" && item.text?.trim()) {
      childIndex += 1;
      continue;
    }
    if (item.type !== "thinking") continue;

    let hasThinking = false;
    while (index < content.length && content[index]!.type === "thinking") {
      hasThinking ||= Boolean(content[index]!.thinking?.trim());
      index += 1;
    }
    index -= 1;
    if (!hasThinking) continue;

    result.push(childIndex);
    childIndex += 1;
    if (content.slice(index + 1).some(isVisibleContent)) childIndex += 1;
  }
  return result;
}

function themeItalic(theme: Theme, text: string): string {
  try {
    return theme.italic?.(text) ?? text;
  } catch {
    return text;
  }
}

function themeBold(theme: Theme, text: string): string {
  try {
    return theme.bold?.(text) ?? text;
  } catch {
    return text;
  }
}

function softBody(theme: Theme, text: string): string {
  return themeItalic(theme, theme.fg("thinkingText", text));
}

function thinkingStepSummary(lines: string[]): string {
  const first = stripAnsi(lines.find((line) => stripAnsi(line).trim()) ?? "")
    .replace(/^\s{0,3}(?:#{1,6}\s+|[-*+]\s+|\d+[.)]\s+)/, "")
    .replace(/^(?:I\s+(?:need|should|want|will)\s+to\b|Let(?:'s| me)|First,\s+|Next,\s+|Then,\s+|Now,\s+)/i, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!first) return "继续梳理思路";
  const sentence = first.match(/^.{1,96}?(?:[.!?。！？](?:\s|$)|$)/)?.[0]?.trim() ?? first;
  const punctuation = sentence.match(/[.!?。！？]$/)?.[0];
  const normalized = sentence.replace(/[.!?。！？,;:；：]+$/g, "").trim();
  if (normalized.length > 84) return `${normalized.slice(0, 83).trimEnd()}…`;
  const fallbackPunctuation = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(normalized) ? "。" : ".";
  return `${normalized}${punctuation ?? fallbackPunctuation}`;
}

type ThinkingStepStyle = {
  icon: string;
  color: "accent" | "error" | "mdLink" | "muted" | "success" | "warning";
};

function thinkingStepStyle(summary: string): ThinkingStepStyle {
  if (/(?:失败|错误|无法|阻塞|报错|\b(?:fail(?:ed|ure)?|error|blocked|cannot|unable)\b)/i.test(summary)) {
    return { icon: "!", color: "error" };
  }
  if (/(?:测试|检查|验证|通过|\b(?:tests?|tested|testing|checks?|checked|checking|verify|verified|verification|validat(?:e|ed|ing|ion)|pass(?:ed|ing)?)\b)/i.test(summary)) {
    return { icon: "✓", color: "success" };
  }
  if (/(?:比较|权衡|\b(?:compare|compared|comparing|trade.?off|versus)\b)/i.test(summary)) {
    return { icon: "⇄", color: "warning" };
  }
  if (/(?:搜索|查找|读取|查看|理解|\b(?:inspect|inspected|inspecting|search|searched|searching|find|finding|read|reading|look\s+into)\b)/i.test(summary)) {
    return { icon: "⌕", color: "mdLink" };
  }
  if (/(?:修改|更新|创建|实现|写入|编辑|修复|\b(?:edit|edited|editing|write|writing|create|created|creating|update|updated|updating|implement|implemented|implementing|patch|patched|patching|fix|fixed|fixing)\b)/i.test(summary)) {
    return { icon: "✎", color: "accent" };
  }
  if (/(?:计划|接下来|首先|然后|\b(?:plan|planned|planning|first|next|then)\b)/i.test(summary)) {
    return { icon: "→", color: "accent" };
  }
  return { icon: "◇", color: "muted" };
}

function branch(theme: Theme, text: string): string {
  return theme.fg("borderMuted", text);
}

/** Blank-line separated paragraphs of a thinking run, i.e. its steps. */
export function thinkingSteps(text: string): string[] {
  return text.split(/\n[ \t]*\n/).filter((part) => part.trim().length > 0);
}

/**
 * Elapsed thinking time for a run. Runs that never streamed through this
 * session (history reloaded from a session file) have no timing, so the row
 * shows steps only.
 */
export function thinkingRunDuration(
  message: AssistantMessageLike,
  blockIndices: number[],
  streaming: boolean,
  now = Date.now(),
): { ms: number; live: boolean } | undefined {
  let startMs: number | undefined;
  let endMs: number | undefined;
  let open = false;
  for (const index of blockIndices) {
    const timing = thinkingTimings.get(thinkingTimingKey(message, index));
    if (!timing) continue;
    if (startMs === undefined || timing.startMs < startMs) startMs = timing.startMs;
    if (timing.endMs === undefined) open = true;
    else if (endMs === undefined || timing.endMs > endMs) endMs = timing.endMs;
  }
  if (startMs === undefined) return undefined;
  const live = streaming && open;
  const stopMs = endMs ?? (live ? now : undefined);
  if (stopMs === undefined) return undefined;
  return { ms: Math.max(0, stopMs - startMs), live };
}

/**
 * What the collapsed row reports: the step count, plus the elapsed thinking
 * time once it is at least a second. `18s` grows live while the run streams.
 */
export function thinkingRunStats(
  message: AssistantMessageLike,
  run: ThinkingRun,
  streaming = false,
  now = Date.now(),
): string[] {
  const stats = [`${thinkingSteps(run.text).length} 步`];
  const duration = thinkingRunDuration(message, run.blockIndices, streaming, now);
  if (duration !== undefined && duration.ms >= 1000) stats.push(formatThinkingDuration(duration.ms));
  return stats;
}

/**
 * The collapsed form of a thinking run: one quiet row that says how much
 * thinking happened, replacing Pi's content-free `Thinking...` label. Pi's
 * MouseRegion stays around it, so a click still toggles this run only.
 *
 * Pi rebuilds assistant content on every streamed token, so a live run needs no
 * timer of its own to keep its step count and elapsed time fresh.
 */
export class ThinkingSummaryComponent implements Component {
  private readonly getStats: () => string[];
  private readonly getTheme: () => Theme | undefined;
  private lastWidth = 0;
  private cached: string[] | undefined;

  constructor(getStats: () => string[], getTheme: () => Theme | undefined) {
    this.getStats = getStats;
    this.getTheme = getTheme;
  }

  render(width: number): string[] {
    if (width === this.lastWidth && this.cached) return this.cached;
    this.lastWidth = width;
    const label = `思考 · ${this.getStats().join(" · ")}`;
    const theme = this.getTheme();
    const line = theme
      ? `${TRAIL_INDENT}${theme.fg("accent", "✦")}${theme.fg("toolTitle", ` ${label}`)}`
      : `${TRAIL_INDENT}✦ ${label}`;
    const clipped = truncateToWidth(line, Math.max(1, width), "");
    this.cached = [`${clipped}${" ".repeat(Math.max(0, width - visibleWidth(clipped)))}`];
    return this.cached;
  }

  invalidate(): void {
    this.cached = undefined;
  }
}

/**
 * Reframes Pi's native thinking lines as readable steps while leaving
 * collapse state and the original message content under Pi's control.
 */
export class ThinkingTrailComponent implements Component {
  private readonly inner: Component;
  private readonly getTheme: () => Theme | undefined;
  private readonly getStats: (() => string[]) | undefined;

  constructor(
    inner: Component,
    getTheme: () => Theme | undefined,
    getStats?: () => string[],
  ) {
    this.inner = inner;
    this.getTheme = getTheme;
    this.getStats = getStats;
  }

  invalidate(): void {
    this.inner.invalidate?.();
  }

  render(width: number): string[] {
    if (width < 8) return this.inner.render(width);
    const theme = this.getTheme();
    if (!theme) return this.inner.render(width);

    const contentWidth = Math.max(1, Math.min(width - 5, MAX_BODY_WIDTH));
    const rawLines = this.inner.render(contentWidth);
    const steps: string[][] = [];
    let current: string[] = [];

    for (const line of rawLines) {
      if (isBlankRenderedLine(line)) {
        if (current.length > 0) steps.push(current);
        current = [];
        continue;
      }
      current.push(removeOutputPadding(removeTrailingPadding(line)));
    }
    if (current.length > 0) steps.push(current);
    if (steps.length === 0) return [];

    const stats = this.getStats?.() ?? [`${steps.length} 步`];
    const header = truncateToWidth(
      `${TRAIL_INDENT}${theme.fg("accent", "✦")}${theme.fg("toolTitle", ` 思考 · ${stats.join(" · ")}`)}`,
      width,
      "",
    );
    const renderedSteps = steps.map((lines, index) => {
      const summary = thinkingStepSummary(lines);
      const style = thinkingStepStyle(summary);
      const last = index === steps.length - 1;
      const connector = last ? "╰─" : "├─";
      const bodyConnector = last ? "   " : `${theme.fg("borderMuted", "│")}  `;
      const title = truncateToWidth(
        `${TRAIL_INDENT}${branch(theme, connector)} ${theme.fg(style.color, style.icon)} ${themeBold(theme, theme.fg("thinkingText", summary))}`,
        width,
        "",
      );
      const body = lines.slice(1).map((line) => {
        const plain = stripAnsi(line).trim();
        if (!plain) return `${TRAIL_INDENT}${bodyConnector}`;
        const styled = line.includes("\x1b[") ? line : softBody(theme, plain);
        return truncateToWidth(`${TRAIL_INDENT}${bodyConnector}${styled}`, width, "");
      });
      return [title, ...body];
    });

    const selectedSteps: string[][] = [];
    let omittedRows = 0;
    let remainingRows = MAX_PREVIEW_LINES;
    for (let index = renderedSteps.length - 1; index >= 0; index--) {
      const lines = renderedSteps[index]!;
      if (remainingRows <= 0) {
        omittedRows += lines.length;
        continue;
      }
      const bodyBudget = Math.max(0, remainingRows - 1);
      const keptBody = bodyBudget > 0 ? lines.slice(1).slice(-bodyBudget) : [];
      const kept = [lines[0]!, ...keptBody];
      omittedRows += lines.length - kept.length;
      selectedSteps.unshift(kept);
      remainingRows -= kept.length;
    }

    const visibleRows = selectedSteps.flat();
    const body = omittedRows > 0
      ? [
          truncateToWidth(
            `${TRAIL_INDENT}${branch(theme, "├─")} ${theme.fg("dim", `… 省略 ${omittedRows} 行 · Ctrl+T 显示/隐藏轨迹`)}`,
            width,
            "",
          ),
          ...visibleRows,
        ]
      : visibleRows;
    return [header, ...body];
  }
}

/** Recolor Pi's native collapsed placeholder without changing its collapse state. */
export function recolorHiddenThinkingLines(lines: string[], theme: Theme, hidden = true): string[] {
  if (!hidden) return lines;
  return lines.map((line) => {
    const plain = stripAnsi(line).trim();
    let label: string | undefined;
    if (plain === "Thinking..." || plain === "Thinking" || plain === "Thought" || plain === "Thought..." || plain === "思考中..." || plain === "思考中") {
      label = HIDDEN_LABEL_PLAIN;
    } else if (
      plain === HIDDEN_LABEL_PLAIN ||
      /^✦\s*(?:Thinking|Thought|思考)(?:\s*(?:trail)?(?:\s*·\s*\d+(?:\s*steps)?)?)?$/.test(plain)
    ) {
      label = plain.startsWith("✦") ? plain : `✦ ${plain}`;
    }
    if (!label) return line;
    const visibleIndex = line.indexOf(plain);
    if (visibleIndex < 0) return line;
    return `${line.slice(0, visibleIndex)}${theme.fg("accent", label)}${line.slice(visibleIndex + plain.length)}`;
  });
}

/**
 * Returns the component Pi renders for a thinking run with its click region
 * unwrapped, so a wrapper never ends up rendering the region that holds it.
 */
export function thinkingRegion(child: Component): { region?: MouseRegionLike; content: Component } {
  const region = child as MouseRegionLike;
  const content = region?.child;
  return content && content !== child ? { region, content } : { content: child };
}

/** Swap the content inside Pi's click region, or the child itself when unframed. */
export function replaceThinkingChild(child: Component, index: number, replacement: Component, children: Component[]): void {
  const { region } = thinkingRegion(child);
  if (region) region.child = replacement;
  else children[index] = replacement;
}

export function installThinkingMessageStyle(getTheme: () => Theme | undefined): Cleanup {
  const cleanupContent = installPrototypePatch(
    AssistantMessageComponent.prototype,
    "updateContent",
    "assistant-thinking-content",
    ({ predecessor, receiver, args }) => {
      const result = Reflect.apply(predecessor, receiver, args);
      const runtime = receiver as AssistantMessageRuntime;
      const children = runtime.contentContainer?.children;
      const message = args[0] as AssistantMessageLike | undefined;
      if (!children || !message) return result;

      const leadingSpacerRemoved = hasLeadingThinkingBlock(message) ? 1 : 0;
      if (leadingSpacerRemoved) children.shift();

      const runs = thinkingRuns(message);
      const childIndices = thinkingChildIndices(message);
      const streaming = args[1] === true;
      for (let runIndex = 0; runIndex < childIndices.length; runIndex++) {
        const run = runs[runIndex];
        const childIndex = childIndices[runIndex]! - leadingSpacerRemoved;
        const child = children[childIndex];
        if (!run || !child) continue;

        // Keep Pi's MouseRegion outermost so a click still toggles this run only.
        const live = thinkingRunIsLive(message, run, streaming);
        const replacement: Component = live || thinkingRunIsHidden(runtime, runIndex)
          ? new ThinkingSummaryComponent(() => thinkingRunStats(message, run, streaming), getTheme)
          : new ThinkingTrailComponent(
              thinkingRegion(child).content,
              getTheme,
              () => thinkingRunStats(message, run, streaming),
            );
        replaceThinkingChild(child, childIndex, replacement, children);
      }
      return result;
    },
  );

  const cleanupRender = installPrototypePatch(
    AssistantMessageComponent.prototype,
    "render",
    "assistant-thinking-hidden-render",
    ({ predecessor, receiver, args }) => {
      const rendered = Reflect.apply(predecessor, receiver, args);
      if (!Array.isArray(rendered) || !rendered.every((line) => typeof line === "string")) return rendered;
      const theme = getTheme();
      const runtime = receiver as AssistantMessageRuntime;
      return theme ? recolorHiddenThinkingLines(rendered as string[], theme, runtime.hideThinkingBlock === true) : rendered;
    },
  );

  return () => {
    cleanupRender();
    cleanupContent();
  };
}

/** Starts the clock every provider opens a thinking block, for the collapsed row. */
export function installThinkingTimingTracker(pi: ExtensionAPI): void {
  pi.on("message_update", async (event) => {
    recordThinkingTiming(event as unknown as ThinkingTimingEvent);
  });
  pi.on("session_start", async () => {
    clearThinkingTimings();
  });
  pi.on("session_shutdown", () => {
    clearThinkingTimings();
  });
}
