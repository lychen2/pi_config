import { AssistantMessageComponent, type Theme } from "@earendil-works/pi-coding-agent";
import { type Component, truncateToWidth } from "@earendil-works/pi-tui";
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
};
type AssistantMessageLike = {
  content?: AssistantContent[];
};

const MAX_BODY_WIDTH = 100;
const MAX_PREVIEW_LINES = 16;
const HIDDEN_LABEL_PLAIN = "✦ Thought";

function stripAnsi(line: string): string {
  return line
    .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, "")
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

function softBody(theme: Theme, text: string): string {
  return themeItalic(theme, theme.fg("thinkingText", text));
}

function branch(theme: Theme, text: string): string {
  return theme.fg("borderMuted", text);
}

/**
 * A compact, line-bounded rendering of Pi's native expanded thinking block.
 * Pi retains ownership of collapsing the block through Ctrl+T.
 */
export class ThinkingTrailComponent implements Component {
  private readonly inner: Component;
  private readonly getTheme: () => Theme | undefined;

  constructor(inner: Component, getTheme: () => Theme | undefined) {
    this.inner = inner;
    this.getTheme = getTheme;
  }

  invalidate(): void {
    this.inner.invalidate?.();
  }

  render(width: number): string[] {
    if (width < 8) return this.inner.render(width);
    const theme = this.getTheme();
    if (!theme) return this.inner.render(width);

    const prefixWidth = 6; // "├─ ◇ " / "│    "
    const contentWidth = Math.max(1, Math.min(width - prefixWidth, MAX_BODY_WIDTH));
    const rawLines = this.inner.render(contentWidth);

    const rows: Array<{ line: string; step: boolean }> = [];
    let startsStep = true;
    for (const line of rawLines) {
      if (isBlankRenderedLine(line)) {
        startsStep = true;
        continue;
      }
      rows.push({ line: removeOutputPadding(removeTrailingPadding(line)), step: startsStep });
      startsStep = false;
    }
    if (rows.length === 0) return [];

    const stepCount = rows.filter((row) => row.step).length;
    const label = stepCount > 1 ? ` Thought trail · ${stepCount} steps` : " Thought trail";
    const header = truncateToWidth(
      `  ${theme.fg("accent", "✦")}${theme.fg("toolTitle", label)}`,
      width,
      "",
    );

    const visibleRows = rows.slice(-MAX_PREVIEW_LINES);
    const omittedRows = rows.length - visibleRows.length;
    const body: string[] = [];
    let currentStep = 0;
    const rowSteps = rows.map(({ step }) => {
      if (step) currentStep += 1;
      return currentStep;
    });

    if (omittedRows > 0) {
      const hint = softBody(theme, `… +${omittedRows} earlier lines · Ctrl+T collapses trail`);
      body.push(truncateToWidth(`  ${branch(theme, "├─ ")}${hint}`, width, ""));
    }

    for (let index = omittedRows; index < rows.length; index++) {
      const { line, step } = rows[index]!;
      const isLastStep = rowSteps[index] === stepCount;
      const branchText = step
        ? isLastStep ? "╰─ " : "├─ "
        : isLastStep ? "   " : "│  ";
      const marker = step ? `${theme.fg("accent", "◇")} ` : "  ";
      const plain = stripAnsi(line);
      const bodyText = line.includes("\x1b[") ? line : softBody(theme, plain);
      body.push(truncateToWidth(`  ${branch(theme, branchText)}${marker}${bodyText}`, width, ""));
    }

    return [header, ...body];
  }
}

/** Recolor Pi's native collapsed placeholder without changing its collapse state. */
export function recolorHiddenThinkingLines(lines: string[], theme: Theme): string[] {
  return lines.map((line) => {
    const plain = stripAnsi(line).trim();
    let label: string | undefined;
    if (plain === "Thinking..." || plain === "Thinking" || plain === "Thought" || plain === "Thought...") {
      label = HIDDEN_LABEL_PLAIN;
    } else if (
      plain === HIDDEN_LABEL_PLAIN ||
      /^✦\s*(?:Thinking|Thought)(?:\s*(?:trail)?(?:\s*·\s*\d+(?:\s*steps)?)?)?$/.test(plain)
    ) {
      label = plain.startsWith("✦") ? plain : `✦ ${plain}`;
    }
    if (!label) return line;
    const pad = line.match(/^\s*/)?.[0] ?? "";
    return `${pad}${theme.fg("accent", label)}`;
  });
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
      if (!children || !message || runtime.hideThinkingBlock) return result;

      for (const index of thinkingChildIndices(message)) {
        const child = children[index];
        if (child) children[index] = new ThinkingTrailComponent(child, getTheme);
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
      return theme ? recolorHiddenThinkingLines(rendered as string[], theme) : rendered;
    },
  );

  return () => {
    cleanupRender();
    cleanupContent();
  };
}
