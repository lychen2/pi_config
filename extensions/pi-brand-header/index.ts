import { homedir } from "node:os";
import {
  keyHint,
  VERSION,
  type ExtensionAPI,
  type ExtensionContext,
  type Theme,
} from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth, type TUI } from "@earendil-works/pi-tui";

const SIDE_BY_SIDE_MIN_WIDTH = 56;
const LOGO_DETAIL_GAP = 2;

function displayPath(path: string): string {
  const home = homedir();
  if (path === home) return "~";
  return path.startsWith(`${home}/`) ? `~/${path.slice(home.length + 1)}` : path;
}

function logo(theme: Theme): string[] {
  const solid = (text: string) => theme.bold(theme.fg("accent", text));
  const shade = (text: string) => theme.fg("dim", text);
  const columns = 20;
  const rows = 8;
  const body: boolean[][] = Array.from({ length: rows }, () => Array(columns).fill(false));

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < columns; x++) {
      if (y < 2) body[y][x] = x < 15;
      else if (y < 4) body[y][x] = x < 5 || (x >= 10 && x < 15);
      else if (y < 6) body[y][x] = x < 10 || (x >= 15 && x < 20);
      else body[y][x] = x < 5 || (x >= 15 && x < 20);
    }
  }

  const cells: string[][] = Array.from({ length: rows + 1 }, () => Array(columns + 1).fill(" "));
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < columns; x++) {
      if (body[y][x]) cells[y + 1][x + 1] = shade("▒");
    }
  }
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < columns; x++) {
      if (body[y][x]) cells[y][x] = solid("█");
    }
  }

  return cells.map((row) => `  ${row.join("").trimEnd()}`);
}

function details(pi: ExtensionAPI, ctx: ExtensionContext, tui: TUI, theme: Theme): string[] {
  const label = (text: string) => theme.fg("dim", text.padEnd(10));
  const value = (text: string) => theme.fg("muted", text);
  const model = ctx.model;
  const modelLine = model
    ? `${label("model")}${value(model.provider)}${theme.fg("dim", " / ")}${theme.fg("accent", model.id)}`
    : `${label("model")}${theme.fg("dim", "none selected")}`;

  return [
    `${theme.bold(theme.fg("accent", "PI AGENT"))}${theme.fg("dim", `  v${VERSION}`)}`,
    modelLine,
    `${label("thinking")}${theme.fg("warning", pi.getThinkingLevel())}`,
    `${label("path")}${value(displayPath(ctx.cwd))}`,
    `${label("theme")}${value(theme.name || "default")}`,
    `${label("skills")}${theme.fg("accent", String(pi.getCommands().filter((command) => command.source === "skill").length))}${theme.fg("dim", " loaded")}`,
    `${label("tools")}${theme.fg("accent", String(pi.getActiveTools().length))}${theme.fg("dim", " active")}`,
    `${label("terminal")}${value(`${tui.terminal.columns} x ${tui.terminal.rows}`)}`,
    `${theme.fg("accent", "/")} ${theme.fg("dim", "commands")}  ${theme.fg("warning", "!")} ${theme.fg("dim", "shell")}  ${theme.fg("dim", keyHint("app.tools.expand", "tools"))}`,
  ];
}

function renderHeader(pi: ExtensionAPI, ctx: ExtensionContext, tui: TUI, theme: Theme, width: number): string[] {
  const safeWidth = Math.max(1, width);
  const logoLines = logo(theme);
  const detailLines = details(pi, ctx, tui, theme);
  let content: string[];

  if (safeWidth >= SIDE_BY_SIDE_MIN_WIDTH) {
    const logoWidth = Math.max(...logoLines.map(visibleWidth));
    const divider = theme.fg("borderMuted", "│");
    const details = [...Array<string>(Math.max(0, logoLines.length - detailLines.length)).fill(""), ...detailLines];
    content = Array.from({ length: Math.max(logoLines.length, details.length) }, (_, index) => {
      const logoLine = logoLines[index] ?? "";
      const logoCell = logoLine + " ".repeat(logoWidth - visibleWidth(logoLine));
      return `${logoCell}${" ".repeat(LOGO_DETAIL_GAP)}${divider}  ${details[index] ?? ""}`;
    });
  } else {
    content = [...logoLines, "", ...detailLines.map((line) => `  ${line}`)];
  }

  return ["", ...content.map((line) => truncateToWidth(line, safeWidth, "")), ""];
}

function installHeader(pi: ExtensionAPI, ctx: ExtensionContext): void {
  ctx.ui.setHeader((tui, theme) => ({
    render: (width) => renderHeader(pi, ctx, tui, theme, width),
    invalidate() {},
  }));
}

export default function brandHeader(pi: ExtensionAPI): void {
  let enabled = true;
  const refresh = (ctx: ExtensionContext) => {
    if (enabled && ctx.mode === "tui") installHeader(pi, ctx);
  };

  pi.on("session_start", (_event, ctx) => refresh(ctx));
  pi.on("model_select", (_event, ctx) => refresh(ctx));
  pi.on("thinking_level_select", (_event, ctx) => refresh(ctx));

  pi.registerCommand("logo", {
    description: "Toggle the Pi brand header",
    handler: async (_args, ctx) => {
      if (ctx.mode !== "tui") return;
      enabled = !enabled;
      if (enabled) installHeader(pi, ctx);
      else ctx.ui.setHeader(undefined);
      ctx.ui.notify(`Pi logo ${enabled ? "shown" : "hidden"}`, "info");
    },
  });
}
