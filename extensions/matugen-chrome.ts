/**
 * Theme-aware Cometix chrome: footer + working indicator.
 * Uses Pi theme tokens so the footer follows Matugen and other active themes.
 * Toggle: /matugen-chrome
 */
import type {
  ExtensionAPI,
  ExtensionContext,
  ReadonlyFooterDataProvider,
  Theme,
} from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth, type TUI } from "@earendil-works/pi-tui";
import { isAbsolute, relative, resolve, sep } from "node:path";

const cp = (value: number) => String.fromCodePoint(value);
const ICONS = {
  model: "\ue22c",
  dir: "\ue285",
  git: cp(0xf02a2),
  context: "\uf49b",
  usage: cp(0xf0a9e),
};
const GIT_STATUS_TTL_MS = 3000;

interface GitStatus {
  dirty: boolean;
  conflicts: boolean;
  ahead: number;
  behind: number;
}

function emptyGitStatus(): GitStatus {
  return { dirty: false, conflicts: false, ahead: 0, behind: 0 };
}

function parseGitPorcelain(output: string): GitStatus {
  const status = emptyGitStatus();
  for (const line of output.split("\n")) {
    if (line.startsWith("## ")) {
      const match = line.match(
        /\[(?:ahead (\d+)(?:,? behind (\d+))?|behind (\d+)(?:,? ahead (\d+))?)\]/,
      );
      if (match) {
        status.ahead = Number(match[1] ?? match[4] ?? 0);
        status.behind = Number(match[2] ?? match[3] ?? 0);
      }
      continue;
    }
    if (line.length < 2) continue;
    const state = line.slice(0, 2);
    if (/^(UU|AA|DD|AU|UA|DU|UD)$/.test(state)) status.conflicts = true;
    status.dirty = true;
  }
  return status;
}

function fmtCwd(cwd: string, home: string | undefined): string {
  if (!home) return cwd;
  const r = relative(resolve(home), resolve(cwd));
  if (r === "") return "~";
  if (r === ".." || r.startsWith(`..${sep}`) || isAbsolute(r)) return cwd;
  return `~${sep}${r}`;
}

function fmtTok(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10_000) return `${(n / 1000).toFixed(1)}k`;
  if (n < 1_000_000) return `${Math.round(n / 1000)}k`;
  if (n < 10_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  return `${Math.round(n / 1_000_000)}M`;
}

function packSegments(segments: string[], separator: string, width: number): string {
  let line = "";
  for (let i = 0; i < segments.length; i++) {
    const next = i === 0 ? segments[i]! : `${separator}${segments[i]!}`;
    if (visibleWidth(line) + visibleWidth(next) > width) {
      if (i === 0) return truncateToWidth(segments[i]!, width, "");
      break;
    }
    line += next;
  }
  return line;
}

function installWorkingIndicator(ctx: ExtensionContext): void {
  const theme = ctx.ui.theme;
  ctx.ui.setWorkingIndicator({
    frames: [
      theme.fg("dim", "·"),
      theme.fg("muted", "•"),
      theme.fg("accent", "●"),
      theme.fg("muted", "•"),
    ],
    intervalMs: 140,
  });
}

function installFooter(pi: ExtensionAPI, ctx: ExtensionContext): void {
  let gitCache = { ts: 0, data: emptyGitStatus() };
  let gitInFlight = false;

  ctx.ui.setFooter((tui: TUI, theme: Theme, footerData: ReadonlyFooterDataProvider) => {
    let disposed = false;

    const refreshGit = async (): Promise<void> => {
      if (gitInFlight) return;
      const branch = footerData.getGitBranch();
      if (!branch) {
        gitCache = { ts: Date.now(), data: emptyGitStatus() };
        return;
      }

      gitInFlight = true;
      try {
        const result = await pi.exec(
          "git",
          ["status", "-b", "--porcelain=v1"],
          { cwd: ctx.sessionManager.getCwd(), timeout: GIT_STATUS_TTL_MS },
        );
        if (result.code === 0) gitCache = { ts: Date.now(), data: parseGitPorcelain(result.stdout) };
      } catch {
        // Keep the previous status when Git is temporarily unavailable.
      } finally {
        gitInFlight = false;
        if (!disposed) tui.requestRender();
      }
    };

    const unsubscribe = footerData.onBranchChange(() => void refreshGit());
    const timer = setInterval(() => void refreshGit(), GIT_STATUS_TTL_MS);
    timer.unref?.();
    void refreshGit();

    return {
      dispose() {
        disposed = true;
        clearInterval(timer);
        unsubscribe();
      },
      invalidate() {},
      render(width: number): string[] {
        if (Date.now() - gitCache.ts > GIT_STATUS_TTL_MS) void refreshGit();

        const home = process.env.HOME || process.env.USERPROFILE;
        const modelId = ctx.model?.name || ctx.model?.id || "no-model";
        const level = pi.getThinkingLevel();
        const showLevel = Boolean(ctx.model?.reasoning && level && level !== "off");
        const thinkingToken = ({
          off: "thinkingOff",
          minimal: "thinkingMinimal",
          low: "thinkingLow",
          medium: "thinkingMedium",
          high: "thinkingHigh",
          xhigh: "thinkingXhigh",
          max: "thinkingMax",
        } as const)[level as "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max"] ?? "accent";

        let levelText = "";
        if (showLevel) {
          try {
            levelText = theme.fg(thinkingToken as any, level);
          } catch {
            levelText = theme.fg("accent", level);
          }
        }
        const modelText = theme.bold(theme.fg("accent", `${ICONS.model}  ${modelId}`));
        const modelSegment = showLevel
          ? `${modelText}${theme.fg("dim", " · ")}${levelText}`
          : modelText;

        const directorySegment = [
          theme.fg("warning", ICONS.dir),
          theme.fg("muted", fmtCwd(ctx.sessionManager.getCwd(), home)),
        ].join(" ");

        const branch = footerData.getGitBranch();
        let gitSegment = "";
        if (branch) {
          const git = gitCache.data;
          const state = git.conflicts ? "⚠" : git.dirty ? "●" : "✓";
          const remote = `${git.ahead > 0 ? ` ↑${git.ahead}` : ""}${git.behind > 0 ? ` ↓${git.behind}` : ""}`;
          const color = git.conflicts ? "error" : git.dirty || remote ? "warning" : "success";
          gitSegment = theme.bold(theme.fg(color, `${ICONS.git} ${branch} ${state}${remote}`));
        }

        const context = ctx.getContextUsage();
        const percent = context?.percent;
        const percentText = percent == null ? "?" : `${Math.round(percent)}%`;
        const tokenText = context?.tokens == null ? "?" : fmtTok(context.tokens);
        const windowText = context?.contextWindow ? fmtTok(context.contextWindow) : "?";
        const contextColor = percent == null ? "dim" : percent > 90 ? "error" : percent > 70 ? "warning" : "muted";
        const contextSegment = theme.fg(
          contextColor,
          `${ICONS.context} ${percentText} ${tokenText}/${windowText}`,
        );

        let input = 0;
        let output = 0;
        for (const entry of ctx.sessionManager.getBranch()) {
          if (entry.type !== "message" || entry.message.role !== "assistant") continue;
          const usage = (entry.message as { usage?: { input?: number; output?: number } }).usage;
          input += usage?.input ?? 0;
          output += usage?.output ?? 0;
        }
        const usageSegment = theme.fg(
          "dim",
          `${ICONS.usage} ↑${fmtTok(input)} ↓${fmtTok(output)}`,
        );

        const statuses = [...footerData.getExtensionStatuses().values()].filter(Boolean);
        const statusSegment = statuses.length > 0
          ? theme.fg("muted", statuses.slice(0, 2).join(theme.fg("dim", " · ")))
          : "";
        const separator = theme.fg("dim", "  │  ");
        const segments = [
          modelSegment,
          directorySegment,
          gitSegment,
          contextSegment,
          usageSegment,
          statusSegment,
        ].filter(Boolean);
        return [packSegments(segments, separator, Math.max(1, width))];
      },
    };
  });
}

export default function matugenChrome(pi: ExtensionAPI): void {
  let enabled = true;

  const apply = (ctx: ExtensionContext): void => {
    if (ctx.mode !== "tui" || !enabled) return;
    installFooter(pi, ctx);
    installWorkingIndicator(ctx);
  };

  pi.on("session_start", (_event, ctx) => {
    apply(ctx);
    setTimeout(() => apply(ctx), 0);
  });

  pi.registerCommand("matugen-chrome", {
    description: "Toggle the theme-aware Cometix footer and working indicator",
    handler: async (_args, ctx) => {
      if (ctx.mode !== "tui") return;
      enabled = !enabled;
      if (enabled) {
        apply(ctx);
        ctx.ui.notify("Theme-aware Cometix chrome on", "info");
      } else {
        ctx.ui.setFooter(undefined);
        ctx.ui.setWorkingIndicator();
        ctx.ui.notify("Theme-aware Cometix chrome off", "info");
      }
    },
  });
}
