import { UserMessageComponent, type Theme, type ThemeColor } from "@earendil-works/pi-coding-agent";
import { Markdown, type MarkdownTheme, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { installPrototypePatch } from "./prototype-patch-registry.ts";

const OSC_ZONE_START = "\x1b]133;A\x07";
const OSC_ZONE_END = "\x1b]133;B\x07\x1b]133;C\x07";
const USER_PATCH_ADAPTER = "user-message-render";
const USER_INVALIDATE_ADAPTER = "user-message-invalidate";
const USER_EMOJI = "💬";
const USER_MATERIAL = String.fromCodePoint(0xe0b7);
const USER_RAIL = "▐";

type RecordLike = Record<string, unknown>;
type UserMessageInstance = {
  children?: unknown[];
};

type UserMessageCache = {
  text: string;
  width: number;
  theme?: Theme;
  renderedLines: string[];
};

const cache = new WeakMap<object, UserMessageCache>();

function isRecord(value: unknown): value is RecordLike {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function findMarkdownText(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  if (typeof value.text === "string") return value.text;
  if (!Array.isArray(value.children)) return undefined;
  for (const child of value.children) {
    const text = findMarkdownText(child);
    if (text !== undefined) return text;
  }
  return undefined;
}

function markdownText(instance: object): string | undefined {
  const existing = cache.get(instance);
  if (existing) return existing.text;
  const text = findMarkdownText(instance);
  return text;
}

function themeFg(theme: Theme | undefined, color: string, text: string): string {
  if (!theme) return text;
  try {
    return theme.fg(color as ThemeColor, text);
  } catch {
    return text;
  }
}

function themeBg(theme: Theme | undefined, color: string, text: string): string {
  if (!theme) return text;
  try {
    return theme.bg(color as never, text);
  } catch {
    return text;
  }
}

function markdownTheme(theme: Theme | undefined): MarkdownTheme {
  const fg = (color: string, text: string) => themeFg(theme, color, text);
  return {
    heading: (text) => fg("mdHeading", text),
    link: (text) => fg("mdLink", text),
    linkUrl: (text) => fg("mdLinkUrl", text),
    code: (text) => fg("mdCode", text),
    codeBlock: (text) => fg("mdCodeBlock", text),
    codeBlockBorder: (text) => fg("mdCodeBlockBorder", text),
    quote: (text) => fg("mdQuote", text),
    quoteBorder: (text) => fg("mdQuoteBorder", text),
    hr: (text) => fg("mdHr", text),
    listBullet: (text) => fg("mdListBullet", text),
    bold: (text) => theme?.bold(text) ?? text,
    italic: (text) => theme?.italic(text) ?? text,
    underline: (text) => theme?.underline(text) ?? text,
    strikethrough: (text) => theme?.strikethrough(text) ?? text,
  };
}

function icon(): string {
  const style = (process.env.PI_TOOL_RAILS_ICON_STYLE || "emoji").trim().toLowerCase();
  return style === "material" ? USER_MATERIAL : style === "text" ? ">" : USER_EMOJI;
}

function stripZone(line: string): string {
  return line.startsWith(OSC_ZONE_START) ? line.slice(OSC_ZONE_START.length) : line;
}

function rail(theme: Theme | undefined): string {
  return `${themeFg(theme, "borderAccent", USER_RAIL)} `;
}

function fillLine(line: string, width: number, theme: Theme | undefined): string {
  const leftRail = rail(theme);
  const contentWidth = Math.max(0, width - visibleWidth(leftRail));
  const content = truncateToWidth(line, contentWidth, "");
  const padding = " ".repeat(Math.max(0, contentWidth - visibleWidth(content)));
  return themeBg(theme, "userMessageBg", `${leftRail}${content}${padding}`);
}

function topLine(width: number, theme: Theme | undefined): string {
  const label = ` ${icon()} `;
  const left = Math.max(0, Math.floor((width - visibleWidth(label)) / 2));
  const right = Math.max(0, width - left - visibleWidth(label));
  return themeBg(
    theme,
    "userMessageBg",
    `${themeFg(theme, "borderAccent", "─".repeat(left))}${themeFg(theme, "accent", label)}${themeFg(theme, "borderAccent", "─".repeat(right))}`,
  );
}

function bottomLine(width: number, theme: Theme | undefined): string {
  return themeBg(theme, "userMessageBg", themeFg(theme, "borderAccent", "─".repeat(Math.max(0, width))));
}

function renderUserMessage(instance: UserMessageInstance, width: number, theme: Theme | undefined): string[] | undefined {
  const text = markdownText(instance as object);
  if (text === undefined) return undefined;
  const cached = cache.get(instance as object);
  if (cached?.text === text && cached.width === width && cached.theme === theme) return cached.renderedLines;
  if (width < 16) return undefined;

  const body = new Markdown(text, 0, 0, markdownTheme(theme), {
    color: (content) => themeFg(theme, "userMessageText", content),
  }).render(Math.max(1, width - visibleWidth(rail(theme))));
  const lines = [
    topLine(width, theme),
    fillLine("", width, theme),
    ...((body.length > 0 ? body : [""]).map((line) => fillLine(stripZone(line), width, theme))),
    fillLine("", width, theme),
    bottomLine(width, theme),
  ];
  cache.set(instance as object, { text, width, theme, renderedLines: lines });
  return lines;
}

function withZones(lines: string[]): string[] {
  if (lines.length === 0) return lines;
  const marked = [...lines];
  marked[0] = `${OSC_ZONE_START}${marked[0]}`;
  marked[marked.length - 1] = `${OSC_ZONE_END}${marked[marked.length - 1]}`;
  return marked;
}

export function installUserMessageStyle(getTheme: () => Theme | undefined): () => void {
  const prototype = UserMessageComponent.prototype;
  const cleanupInvalidate = installPrototypePatch(prototype, "invalidate", USER_INVALIDATE_ADAPTER, ({ predecessor, receiver, args }) => {
    cache.delete(receiver as object);
    return Reflect.apply(predecessor, receiver, args);
  });
  const cleanupRender = installPrototypePatch(prototype, "render", USER_PATCH_ADAPTER, ({ predecessor, receiver, args }) => {
    const width = args[0];
    if (typeof width !== "number") return Reflect.apply(predecessor, receiver, args);
    const rendered = renderUserMessage(receiver as UserMessageInstance, width, getTheme());
    return rendered ? withZones(rendered) : Reflect.apply(predecessor, receiver, args);
  });
  return () => {
    cleanupRender();
    cleanupInvalidate();
  };
}

export function sanitizeUserMessageForTest(text: string, width: number): string[] {
  return renderUserMessage({ children: [{ text }] }, width, undefined) ?? [];
}

