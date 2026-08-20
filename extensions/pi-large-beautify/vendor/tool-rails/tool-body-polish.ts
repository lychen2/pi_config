import { visibleWidth } from "@earendil-works/pi-tui";

export type ToolBodyTheme = {
  fg(color: "accent" | "dim" | "error" | "muted" | "success" | "syntaxVariable" | "toolOutput" | "toolTitle" | "warning", text: string): string;
};

export const TOOL_COLLAPSED_MAX_LINES = 12;
export const TOOL_COLLAPSED_MAX_LINE_CHARS = 160;
export const TOOL_EXPANDED_MAX_LINES = 200;
export const BASH_COLLAPSED_TAIL_LINES = 16;

function stripAnsi(text: string): string {
  return text
    .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, "")
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "");
}

function truncatePlain(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1))}…`;
}

function isHeredocOrHugeWrite(lines: readonly string[]): boolean {
  const joined = lines.join("\n");
  if (/<<\s*['"]?EOF['"]?/i.test(joined)) return true;
  if (/cat\s+>/.test(joined) && lines.length > 20) return true;
  if (lines.some((line) => line.trimStart().startsWith("{") && line.length > 200)) return true;
  return lines.length > 40;
}

function looksLikePath(line: string): boolean {
  const value = line.trim();
  if (!value || value.length > 400 || /\s{2,}/.test(value)) return false;
  if (/^(?:~\/?|\.\.?\/|\/)\S+$/.test(value)) return true;
  if (/^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)+$/.test(value)) return true;
  return /\.(?:ts|tsx|js|jsx|mjs|cjs|json|md|py|rs|go|css|html|sh|toml|yaml|yml)$/i.test(value) && !/\s/.test(value);
}

function titleLine(line: string, theme: ToolBodyTheme): string {
  const command = line.match(/^\$\s+(.+)$/)?.[1] ?? line;
  return `${theme.fg("accent", "❯")} ${theme.fg("toolTitle", truncatePlain(command.trim(), TOOL_COLLAPSED_MAX_LINE_CHARS))}`;
}

function pathLine(line: string, theme: ToolBodyTheme): string {
  return `${theme.fg("muted", "›")} ${theme.fg("accent", line.trim())}`;
}

function summarizeHugePayload(lines: readonly string[], theme: ToolBodyTheme, skipCommand = ""): string[] {
  const first = lines.find((line) => line.trim()) ?? "";
  const command = lines.slice(0, 6).find((line) => /\b(?:cat|tee|write|edit|node|python|bash)\b/i.test(line)) ?? first;
  const path = lines.join("\n").match(/(?:[>~]?\/|\.\/)[^\s'"]+\.(?:ts|tsx|js|json|md|py|sh)/)?.[0];
  const bytes = lines.join("\n").length;
  const summary = [theme.fg("dim", "▾ 已折叠大段内容")];
  if (command.trim() && command.trim() !== skipCommand.trim()) summary.push(titleLine(command, theme));
  if (path) summary.push(pathLine(path, theme));
  summary.push(theme.fg("dim", `${lines.length} 行 · ~${Math.round(bytes / 1024)}KB · 展开查看`));
  return summary;
}

export function compactToolBody(
  lines: readonly string[],
  options: {
    expanded?: boolean;
    theme: ToolBodyTheme;
    preserveAll?: boolean;
    formatLine?: (line: string) => string;
  },
): string[] {
  const { expanded = false, theme, preserveAll = false, formatLine = (line) => line } = options;
  if (preserveAll) return lines.map(formatLine);

  if (expanded) {
    if (lines.length <= TOOL_EXPANDED_MAX_LINES) return lines.map(formatLine);
    return [
      ...lines.slice(0, TOOL_EXPANDED_MAX_LINES).map(formatLine),
      theme.fg("dim", `… +${lines.length - TOOL_EXPANDED_MAX_LINES} 行已截断`),
    ];
  }

  const plainLines = lines.map(stripAnsi);
  if (isHeredocOrHugeWrite(plainLines)) {
    const first = plainLines[0]?.trim() ?? "";
    return [
      ...(first && !first.includes("{") ? [titleLine(first, theme)] : []),
      ...summarizeHugePayload(plainLines, theme, first),
    ];
  }

  const output: string[] = [];
  let visibleCount = 0;
  for (const line of lines) {
    const plain = stripAnsi(line);
    if (!plain.trim()) {
      if (output.length > 0 && output.at(-1) !== "") output.push("");
      continue;
    }
    if (visibleCount >= TOOL_COLLAPSED_MAX_LINES) {
      output.push(theme.fg("dim", `… +${Math.max(1, lines.length - visibleCount)} 行 · 展开`));
      break;
    }
    const clipped = plain.length > TOOL_COLLAPSED_MAX_LINE_CHARS
      ? truncatePlain(plain, TOOL_COLLAPSED_MAX_LINE_CHARS)
      : line;
    output.push(formatLine(clipped));
    visibleCount += 1;
  }
  while (output.length > 0 && output.at(-1) === "") output.pop();
  return output;
}

export function compactBashBody(lines: readonly string[], theme: ToolBodyTheme): string[] {
  if (lines.length <= BASH_COLLAPSED_TAIL_LINES + 3) return [...lines];
  const head = lines.slice(0, 3);
  const tail = lines.slice(-BASH_COLLAPSED_TAIL_LINES);
  const omitted = lines.length - head.length - tail.length;
  return [...head, theme.fg("dim", `… +${omitted} 行`), ...tail];
}

export function bodyVisibleWidth(line: string): number {
  return visibleWidth(stripAnsi(line));
}
