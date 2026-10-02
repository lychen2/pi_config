import { truncateToWidth, visibleWidth, wrapTextWithAnsi, parseColor } from "@earendil-works/pi-tui";
import type { Theme } from "@earendil-works/pi-coding-agent";

export type VisualState = "idle" | "running" | "success" | "warning" | "error" | "cancelled";
export type VisualSurface = "userMessageBg" | "customMessageBg" | "toolPendingBg" | "toolSuccessBg" | "toolErrorBg";
export type VisualTheme = Pick<Theme, "fg"> & Partial<Pick<Theme, "bg" | "bold" | "style" | "colors" | "appearance">>;

export const SOFT_LAYOUT = Object.freeze({ compactWidth: 48, padding: 1 });
const ERROR_INK = "#241217";

export function resolveVisualStyle(theme: VisualTheme) {
  return { theme, ...SOFT_LAYOUT };
}

export function softFrameInnerWidth(width: number): number {
  return Math.max(1, Math.floor(width) - (width < SOFT_LAYOUT.compactWidth ? 2 : 4));
}

function fg(theme: VisualTheme, color: Parameters<Theme["fg"]>[0], text: string): string {
  return theme.fg(color, text);
}

function stateColor(state: VisualState): Parameters<Theme["fg"]>[0] {
  switch (state) {
    case "error": return "error";
    case "warning": return "warning";
    case "success": return "success";
    case "running": return "accent";
    case "cancelled": return "muted";
    default: return "muted";
  }
}

/** Status words and symbols remain present in monochrome and 256-color terminals. */
export function renderSoftLabel(theme: VisualTheme, label: string, state: VisualState = "idle"): string {
  if (state === "error" && theme.style && theme.colors?.error !== undefined) {
    return theme.style(` ${label} `, {
      fg: parseColor(theme.appearance === "light" ? "#fff9fa" : ERROR_INK),
      bg: theme.colors.error,
      bold: true,
    });
  }
  return fg(theme, stateColor(state), label);
}

export type SoftFrameOptions = {
  theme: VisualTheme;
  title: string;
  status?: string;
  state?: VisualState;
  lines: readonly string[];
  width: number;
  footer?: string;
  surface?: VisualSurface;
  /** Already laid-out content retains its line boundaries; overflows still wrap safely. */
  preserveLines?: boolean;
};

function border(theme: VisualTheme, text: string): string {
  return fg(theme, "borderAccent", text);
}

export function softFrameTop(options: Omit<SoftFrameOptions, "lines">): string {
  const { theme, title, status, state = "idle" } = options;
  const width = Math.max(0, Math.floor(options.width));
  if (!width) return "";
  // Status precedes the title on narrow screens, so truncation cannot hide failure.
  if (width < SOFT_LAYOUT.compactWidth) {
    const label = status ? `${renderSoftLabel(theme, status, state)} · ` : "";
    return truncateToWidth(`${label}${fg(theme, "toolTitle", title)}`, width, "…");
  }
  const badge = status ? truncateToWidth(renderSoftLabel(theme, status, state), width - 6, "…") : "";
  const titleWidth = Math.max(0, width - 6 - visibleWidth(badge) - (badge ? 1 : 0));
  const name = truncateToWidth(title, titleWidth, "…");
  const text = `${border(theme, "╭─ ")}${fg(theme, "toolTitle", name)}`;
  const tail = badge ? ` ${badge} ${border(theme, "╮")}` : border(theme, " ╮");
  const gap = Math.max(0, width - visibleWidth(text) - visibleWidth(tail));
  return `${text}${border(theme, "─".repeat(gap))}${tail}`;
}

export function softFrameBottom(width: number, theme: VisualTheme, footer = ""): string {
  width = Math.max(0, Math.floor(width));
  if (!width) return "";
  if (width < SOFT_LAYOUT.compactWidth) {
    return footer ? `${border(theme, "│ ")}${truncateToWidth(footer, Math.max(0, width - 2), "…")}` : "";
  }
  if (!footer) return border(theme, `╰${"─".repeat(width - 2)}╯`);
  const label = truncateToWidth(footer, width - 6, "…");
  return `${border(theme, "╰─ ")}${label}${border(theme, ` ${"─".repeat(Math.max(0, width - 5 - visibleWidth(label)))}╯`)}`;
}

export function softFrameLine(
  line: string, width: number, theme: VisualTheme, surface?: VisualSurface, state: VisualState = "idle",
): string {
  width = Math.max(0, Math.floor(width));
  if (!width) return "";
  const compact = width < SOFT_LAYOUT.compactWidth;
  const rail = fg(theme, state === "error" ? "error" : "borderAccent", "│");
  const inset = compact ? 2 : 4;
  const contentWidth = Math.max(0, width - inset);
  const content = truncateToWidth(line, contentWidth, "");
  const filled = ` ${content}${" ".repeat(Math.max(0, contentWidth - visibleWidth(content)))}${compact ? "" : " "}`;
  // Keep terminal transparency visible. Semantic color fills belong to small
  // status badges, never to the full-width card body (including its padding).
  return truncateToWidth(`${rail}${filled}${compact ? "" : border(theme, "│")}`, width, "");
}

export function renderSoftFrame(options: SoftFrameOptions): string[] {
  const { theme, title, status, state = "idle", surface } = options;
  const width = Math.max(0, Math.floor(options.width));
  if (!width) return [""];
  const innerWidth = softFrameInnerWidth(width);
  const lines = options.lines.flatMap(line => {
    // Native code/diff rows are normally pre-wrapped to innerWidth. Never truncate
    // long unbroken paths, CJK text, or OSC-8 links supplied by third-party tools.
    return line.split("\n").flatMap(part => visibleWidth(part) > innerWidth
      ? wrapTextWithAnsi(part, innerWidth) : [part]);
  });
  let footer = options.footer ?? "";
  if (footer && visibleWidth(footer) > Math.max(0, width - 6)) {
    lines.push(...wrapTextWithAnsi(footer, innerWidth));
    footer = "";
  }
  const body = (lines.length ? lines : [""]).map(line => softFrameLine(line, width, theme, surface, state));
  const bottom = softFrameBottom(width, theme, footer);
  return [softFrameTop({ theme, title, status, state, width }), ...body, ...(bottom ? [bottom] : [])];
}
