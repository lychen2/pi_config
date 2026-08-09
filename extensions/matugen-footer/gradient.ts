import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

export type GaugeTier = "normal" | "warning" | "error";

export function pulsePhase(_now = Date.now(), _periodMs = 1800): number {
  return 0;
}

// The reference footer calls this a gradient. Matugen owns color selection here,
// so the helper preserves the layout text and lets the caller apply theme.fg().
export function renderSakuraGradient(text: string, _phase = 0): string {
  return text;
}

export function renderSakuraSolid(text: string, _position = 0): string {
  return text;
}

export function renderSakuraFrameGradient(text: string, _phase = 0): string {
  return text;
}

export function renderMacaronGauge(
  percent: number | undefined,
  width: number,
  _options: { phase?: number; frame?: boolean; tier?: GaugeTier } = {},
): string {
  const safeWidth = Math.max(1, Math.floor(width));
  const ratio = Math.max(0, Math.min(100, percent ?? 0)) / 100;
  const filled = Math.round(safeWidth * ratio);
  return "█".repeat(filled) + "░".repeat(Math.max(0, safeWidth - filled));
}

export function renderGradientHairline(width: number, _phase = 0, glyph = "━"): string {
  return glyph.repeat(Math.max(0, width));
}

export function renderBoxedLine(
  line: string,
  width: number,
  leftRail = "┃ ",
  rightRail = "│",
): string {
  const contentWidth = Math.max(0, width - visibleWidth(leftRail) - visibleWidth(rightRail));
  const content = truncateToWidth(line, contentWidth, "");
  return `${leftRail}${content}${" ".repeat(Math.max(0, contentWidth - visibleWidth(content)))}${rightRail}`;
}
