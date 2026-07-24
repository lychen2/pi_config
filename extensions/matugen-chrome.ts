/**
 * Matugen-aware chrome: footer + working indicator.
 * Uses only Pi theme tokens (matugen). Overrides cometix hard-coded ANSI footer.
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

function packSegments(
  segments: string[],
  sep: string,
  width: number,
  theme: Theme,
): string {
  const sepW = visibleWidth(sep);
  let line = "";
  for (let i = 0; i < segments.length; i++) {
    const next = i === 0 ? segments[i]! : `${sep}${segments[i]!}`;
    if (visibleWidth(line) + visibleWidth(next) > width) {
      if (i === 0) return truncateToWidth(segments[i]!, width, "");
      break;
    }
    line += next;
  }
  if (!line) return theme.fg("dim", "·");
  return line;
}

function installWorkingIndicator(ctx: ExtensionContext): void {
  const t = ctx.ui.theme;
  ctx.ui.setWorkingIndicator({
    frames: [
      t.fg("dim", "·"),
      t.fg("muted", "•"),
      t.fg("accent", "●"),
      t.fg("muted", "•"),
    ],
    intervalMs: 140,
  });
}

function installFooter(pi: ExtensionAPI, ctx: ExtensionContext): void {
  ctx.ui.setFooter((tui: TUI, theme: Theme, footerData: ReadonlyFooterDataProvider) => {
    const unsub = footerData.onBranchChange(() => tui.requestRender());

    return {
      dispose: unsub,
      invalidate() {},
      render(width: number): string[] {
        const home = process.env.HOME || process.env.USERPROFILE;
        const modelId = ctx.model?.name || ctx.model?.id || "no-model";
        const lvl = pi.getThinkingLevel();
        const showLvl = !!ctx.model?.reasoning && !!lvl && lvl !== "off";
        const thinkingToken = (
          {
            off: "thinkingOff",
            minimal: "thinkingMinimal",
            low: "thinkingLow",
            medium: "thinkingMedium",
            high: "thinkingHigh",
            xhigh: "thinkingXhigh",
            max: "thinkingMax",
          } as const
        )[lvl as "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max"] ?? "accent";
        // Prefer thinking* token; fall back to accent if theme token missing at runtime.
        let levelColored: string;
        try {
          levelColored = theme.fg(thinkingToken as any, lvl);
        } catch {
          levelColored = theme.fg("accent", lvl);
        }
        const modelSeg = showLvl
          ? `${theme.fg("accent", modelId)}${theme.fg("dim", " · ")}${levelColored}`
          : theme.fg("accent", modelId);

        const dirSeg = theme.fg("muted", fmtCwd(ctx.sessionManager.getCwd(), home));

        const branch = footerData.getGitBranch();
        const gitSeg = branch ? theme.fg("dim", `⌥ ${branch}`) : "";

        const cu = ctx.getContextUsage();
        const pct = cu?.percent;
        const pctStr = pct != null ? `${Math.round(pct)}%` : "?";
        const tokStr = cu?.tokens != null ? fmtTok(cu.tokens) : "?";
        const winStr = cu?.contextWindow ? fmtTok(cu.contextWindow) : "?";
        // Avoid tokens that can collapse to near-black under content schemes.
        const ctxColor =
          pct == null ? "dim" : pct > 90 ? "error" : pct > 70 ? "warning" : "muted";
        const ctxSeg = theme.fg(ctxColor, `${pctStr} ${tokStr}/${winStr}`);

        let tin = 0;
        let tout = 0;
        for (const e of ctx.sessionManager.getBranch()) {
          if (e.type === "message" && e.message.role === "assistant") {
            const u = (e.message as { usage?: { input?: number; output?: number } }).usage;
            if (u) {
              tin += u.input ?? 0;
              tout += u.output ?? 0;
            }
          }
        }
        const usageSeg = theme.fg("dim", `↑${fmtTok(tin)} ↓${fmtTok(tout)}`);

        const statuses = [...footerData.getExtensionStatuses().values()].filter(Boolean);
        const statusSeg = statuses.length
          ? theme.fg("muted", statuses.slice(0, 2).join(theme.fg("dim", " · ")))
          : "";

        const sep = theme.fg("dim", "  │  ");
        const segments = [modelSeg, dirSeg, gitSeg, ctxSeg, usageSeg, statusSeg].filter(Boolean);
        return [packSegments(segments, sep, Math.max(1, width), theme)];
      },
    };
  });
}

export default function matugenChrome(pi: ExtensionAPI): void {
  let enabled = true;

  const apply = (ctx: ExtensionContext) => {
    if (ctx.mode !== "tui" || !enabled) return;
    installFooter(pi, ctx);
    installWorkingIndicator(ctx);
  };

  // Late enough to override package footers (cometix) that also hook session_start.
  pi.on("session_start", (_event, ctx) => {
    apply(ctx);
    // Re-apply next tick so we win over packages that setFooter in the same event.
    queueMicrotask(() => apply(ctx));
  });

  pi.registerCommand("matugen-chrome", {
    description: "Toggle Matugen theme-aware footer / working indicator",
    handler: async (_args, ctx) => {
      if (ctx.mode !== "tui") return;
      enabled = !enabled;
      if (enabled) {
        apply(ctx);
        ctx.ui.notify("Matugen chrome on", "info");
      } else {
        ctx.ui.setFooter(undefined);
        ctx.ui.setWorkingIndicator();
        ctx.ui.notify("Matugen chrome off (default footer)", "info");
      }
    },
  });
}
