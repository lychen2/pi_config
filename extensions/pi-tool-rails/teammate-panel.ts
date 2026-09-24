import type { ExtensionAPI, ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import { Key, Text, matchesKey, truncateToWidth } from "@earendil-works/pi-tui";
import { AGENTS_PANEL_TAG } from "./plan-widget.ts";

export const TEAMMATE_PANEL_KEY = "tool-rails-agents";
export const TEAMMATE_PANEL_TOGGLE = Key.ctrlAlt("a");
type Row = {
  correlationId: string; agent: string; name?: string; task?: string; status: string;
  startedAt?: number; durationMs?: number; toolCount?: number; tokens?: number;
  resolvedModel?: string; lastMessage?: string; error?: string; parent?: string;
};
const object = (v: unknown): Record<string, any> => v !== null && typeof v === "object" ? v as Record<string, any> : {};
const clean = (v: unknown): string => typeof v === "string" ? v.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "").replace(/[\x00-\x1f\x7f-\x9f]/g, " ").replace(/\s+/g, " ").trim() : "";
const active = (row: Row) => ["pending", "running", "retrying"].includes(row.status);
const timestamp = (v: unknown): number | undefined => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Date.parse(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
};
const duration = (ms: number) => ms >= 60_000 ? `${Math.floor(ms / 60_000)}m ${Math.floor(ms % 60_000 / 1000)}s` : `${Math.floor(ms / 1000)}s`;

export class TeammatePanelStore {
  rows = new Map<string, Row>();
  apply(kind: string, value: unknown): void {
    const event = object(value);
    if (kind === "message") {
      if (event.isSend || event.isInteraction) return;
      for (const item of Array.isArray(event.progress) ? event.progress : [event]) {
        const p = object(item);
        if (typeof p.correlationId !== "string") continue;
        const old = this.rows.get(p.correlationId);
        this.rows.set(p.correlationId, {
          ...old, correlationId: p.correlationId, agent: clean(p.agent) || old?.agent || "agent",
          name: clean(p.name) || old?.name, status: clean(p.status) || old?.status || "pending",
          parent: p.correlationId !== event.correlationId ? event.correlationId : old?.parent,
          startedAt: timestamp(p.startedAt) ?? old?.startedAt,
          durationMs: typeof p.durationMs === "number" ? p.durationMs : old?.durationMs,
          toolCount: typeof p.toolCount === "number" ? p.toolCount : old?.toolCount,
          tokens: typeof p.tokens === "number" ? p.tokens : old?.tokens,
          resolvedModel: clean(p.resolvedModel) || old?.resolvedModel,
          lastMessage: clean(p.lastMessage) || old?.lastMessage, error: clean(p.error) || old?.error,
        });
      }
    } else if (typeof event.correlationId === "string") {
      const old = this.rows.get(event.correlationId);
      if (kind === "started") {
        this.rows.set(event.correlationId, {
          ...old, correlationId: event.correlationId, agent: clean(event.agent) || "agent",
          name: clean(event.name) || old?.name, task: clean(event.task) || old?.task,
          status: clean(event.status) || "running", startedAt: timestamp(event.startedAt) ?? old?.startedAt,
          parent: clean(event.spawnedBy) || old?.parent,
        });
      } else if (kind === "complete") {
        this.rows.set(event.correlationId, {
          ...old, correlationId: event.correlationId, agent: clean(event.agent) || old?.agent || "agent",
          status: event.cancelled ? "terminated" : event.exitCode === 0 ? "completed" : "failed",
          durationMs: typeof event.durationMs === "number" ? event.durationMs : old?.durationMs,
        });
        for (const result of Array.isArray(event.structuredResults) ? event.structuredResults : []) {
          const row = this.rows.get(result.correlationId);
          if (row) row.lastMessage = clean(result.output) || row.lastMessage;
        }
      }
    }
    // Keep active work; bound completed history without losing the current run.
    const finished = [...this.rows.values()].filter(row => !active(row));
    for (const row of finished.slice(0, Math.max(0, finished.length - 50))) this.rows.delete(row.correlationId);
  }
  visible(): Row[] {
    // Graph containers remain accessible in details but do not duplicate task rows.
    return [...this.rows.values()].filter(row => !row.agent.startsWith("graph(") || ![...this.rows.values()].some(child => child.parent === row.correlationId))
      .sort((a, b) => Number(active(b)) - Number(active(a)) || (b.startedAt ?? 0) - (a.startedAt ?? 0));
  }
}

export function renderTeammatePanel(store: TeammatePanelStore, theme: Theme, width: number, expanded = true, now = Date.now()): string[] {
  const rows = store.visible();
  if (!rows.length || width < 1) return [];
  const running = rows.filter(active).length;
  const done = rows.filter(row => row.status === "completed").length;
  const failed = rows.filter(row => row.status === "failed").length;
  const lines = [theme.bold("Agents") + theme.fg("dim", `  ${running} active · ${done} done${failed ? ` · ${failed} failed` : ""}  Ctrl+Alt+A`)];
  if (expanded) {
    for (const row of rows.slice(0, 5)) {
      const color = row.status === "failed" ? "error" : row.status === "completed" ? "success" : active(row) ? "warning" : "muted";
      const icon = row.status === "completed" ? "✓" : row.status === "failed" ? "✗" : row.status === "terminated" ? "–" : row.status === "pending" ? "○" : "●";
      const elapsed = active(row) && row.startedAt ? Math.max(0, now - row.startedAt) : row.durationMs ?? 0;
      const usage = `${row.toolCount === undefined ? "" : ` · ${row.toolCount} tools`}${row.tokens === undefined ? "" : ` · ${row.tokens.toLocaleString("en-US")} tok`}`;
      lines.push(`  ${theme.fg(color, icon)} ${theme.fg("text", row.name || row.agent)} ${theme.fg("dim", `${row.status} · ${duration(elapsed)}${usage}`)}`);
      if (width >= 65) {
        const detail = row.error || row.lastMessage || row.task || row.resolvedModel;
        if (detail) lines.push(theme.fg("dim", `    ${detail}`));
      }
    }
    if (rows.length > 5) lines.push(theme.fg("dim", `  +${rows.length - 5} more · /agents-panel open`));
  }
  return lines.map(line => truncateToWidth(line, width, "…"));
}

export function installTeammatePanel(pi: ExtensionAPI): void {
  if (Number(process.env.PI_TEAMMATE_DEPTH ?? 0) > 0) return;
  let store = new TeammatePanelStore();
  let ctx: ExtensionContext | undefined;
  let expanded = true;
  let timer: ReturnType<typeof setInterval> | undefined;
  let requestRender: (() => void) | undefined;
  const own = (agents: boolean) => pi.events.emit("cockpit:ui-ownership", { agents, sessionList: false, quiet: false });
  const draw = () => {
    if (!ctx?.hasUI) return;
    ctx.ui.setWidget(TEAMMATE_PANEL_KEY, store.rows.size ? (tui, theme) => {
      requestRender = () => tui.requestRender();
      return { [AGENTS_PANEL_TAG]: true, render: (width: number) => renderTeammatePanel(store, theme, width, expanded), invalidate() {} };
    } : undefined, { placement: "aboveEditor" });
    if ([...store.rows.values()].some(active)) {
      timer ??= setInterval(() => requestRender?.(), 1000);
      timer.unref?.();
    } else if (timer) { clearInterval(timer); timer = undefined; }
  };
  const dispose = ["started", "message", "complete"].map(kind => pi.events.on(`teammate:${kind}`, event => {
    store.apply(kind, event); draw();
  }));
  pi.on("session_start", (_event, context) => {
    if (timer) clearInterval(timer);
    timer = undefined; requestRender = undefined;
    ctx = context; store = new TeammatePanelStore(); expanded = true;
    if (ctx.hasUI) own(true);
    draw();
  });
  pi.registerShortcut(TEAMMATE_PANEL_TOGGLE, {
    description: "Toggle the teammate panel",
    handler: async () => { expanded = !expanded; draw(); },
  });
  pi.registerCommand("agents-panel", {
    description: "Teammate dashboard: toggle or open task details and results",
    handler: async (args, context) => {
      if (!context.hasUI) return;
      ctx = context;
      if (args.trim() !== "open") { expanded = !expanded; draw(); return; }
      const rows = [...store.rows.values()];
      if (!rows.length) { context.ui.notify("No teammates in this session", "info"); return; }
      const labels = rows.map((row, i) => `${i + 1}. ${row.name || row.agent} · ${row.status} · ${row.correlationId.slice(0, 8)}`);
      const choice = await context.ui.select("Open teammate", labels);
      const index = choice === undefined ? -1 : labels.indexOf(choice);
      if (index >= 0) {
        const row = rows[index];
        await context.ui.custom<void>((tui, theme, _keys, done) => {
          let scroll = 0;
          return {
            invalidate() {},
            handleInput(data) {
              if (matchesKey(data, Key.escape) || data === "q") { done(); return; }
              if (matchesKey(data, Key.up)) scroll = Math.max(0, scroll - 1);
              if (matchesKey(data, Key.down)) scroll++;
              tui.requestRender();
            },
            render(width) {
              const current = store.rows.get(row.correlationId) ?? row;
              const text = [current.name || current.agent, `Status: ${current.status}`, `Model: ${current.resolvedModel || "manager/glm-5.3-flash (policy)"}`, `ID: ${current.correlationId}`, "", "Task", current.task || "No task text received", "", current.error ? "Error" : "Latest result / progress", current.error || current.lastMessage || "No result received yet"].join("\n");
              const lines = new Text(text, 1, 0).render(width);
              const height = Math.max(1, tui.terminal.rows - 4);
              scroll = Math.min(scroll, Math.max(0, lines.length - height));
              return [...lines.slice(scroll, scroll + height), truncateToWidth(theme.fg("dim", " ↑↓ scroll · Esc close"), width)];
            },
          };
        });
      }
    },
  });
  pi.on("session_shutdown", () => {
    if (timer) clearInterval(timer);
    timer = undefined; requestRender = undefined;
    if (ctx?.hasUI) {
      ctx.ui.setWidget(TEAMMATE_PANEL_KEY, undefined);
      own(false);
    }
    for (const off of dispose) off();
    ctx = undefined;
  });
}
