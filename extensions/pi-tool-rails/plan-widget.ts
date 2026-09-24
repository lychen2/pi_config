import type { ExtensionAPI, ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import { Key, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

export const PLAN_WIDGET_KEY = "tool-rails-plan";
// Alt+T is the panel slot's historic key: the Default profile hides the todo tool while
// `update_plan` is active, so the Plan panel inherits it instead of stacking another panel key.
export const PLAN_TOGGLE_KEY = Key.alt("t");
export const PLAN_TOGGLE_LABEL = "Alt+T";
const STATE_ENTRY = "sol-pi-online-context-state-v1";
const MAX_VISIBLE_STEPS = 8;
type Step = { id: string; goal: string; status: "pending" | "in_progress" | "completed" };
const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" ? value as Record<string, unknown> : {};

function parseSteps(value: unknown): Step[] | undefined {
  if (!Array.isArray(value) || value.length > 128) return;
  if (!value.every(step => typeof step?.id === "string" && typeof step?.goal === "string"
    && ["pending", "in_progress", "completed"].includes(step.status))) return;
  return value.map(({ id, goal, status }) => ({ id, goal, status }));
}

export function restorePlan(entries: readonly unknown[]): Step[] {
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = record(entries[i]);
    if (entry.type === "custom" && entry.customType === STATE_ENTRY) {
      const steps = parseSteps(record(entry.data).plan);
      if (steps) return steps;
    }
    const message = record(entry.message);
    if (entry.type !== "message" || message.role !== "toolResult"
      || message.toolName !== "update_plan" || message.isError || !Array.isArray(message.content)) continue;
    for (const block of message.content) {
      const text = record(block).text;
      if (typeof text !== "string") continue;
      const snapshot = text.match(/<sol-pi-plan\b[^>]*>([\s\S]*?)<\/sol-pi-plan>/);
      if (!snapshot) continue;
      try {
        const steps = parseSteps(record(JSON.parse(snapshot[1])).steps);
        if (steps) return steps;
      } catch { /* Ignore malformed snapshots and try earlier state. */ }
    }
  }
  return [];
}

function stepLine(theme: Theme, step: Step): string {
  const goal = step.goal.replace(/[\x00-\x1f\x7f-\x9f]/g, " ");
  if (step.status === "completed") {
    return `  ${theme.fg("success", "✓")} ${theme.strikethrough(theme.fg("muted", goal))}`;
  }
  if (step.status === "in_progress") {
    return `  ${theme.fg("warning", "■")} ${theme.bold(theme.fg("warning", goal))}`;
  }
  return `  ${theme.fg("dim", "□")} ${theme.fg("text", goal)}`;
}

export function renderPlanWidget(
  steps: readonly Step[],
  theme: Theme,
  width: number,
  expanded = true,
): string[] {
  if (!steps.length || width <= 0) return [];
  const done = steps.filter(step => step.status === "completed").length;
  const running = steps.filter(step => step.status === "in_progress").length;
  const toggle = expanded ? "collapse" : "expand";
  const full = `${theme.bold("Plan")}  ${theme.fg("dim", `${steps.length} steps · ${done} done · ${running} running  (${PLAN_TOGGLE_LABEL} ${toggle})`)}`;
  const compact = `${theme.bold("Plan")}  ${theme.fg("dim", `${done}/${steps.length}${running ? ` · ${running} running` : ""}  (${PLAN_TOGGLE_LABEL} ${toggle})`)}`;
  const minimal = `${theme.bold("Plan")}  ${theme.fg("dim", `${done}/${steps.length}`)}`;
  const heading = [full, compact, minimal].find(candidate => visibleWidth(candidate) <= Math.max(1, width)) ?? minimal;
  const lines = [heading];
  if (!expanded) return lines.map(line => truncateToWidth(line, width, "…"));

  // Keep the current step visible without allowing a large plan to fill the TUI.
  const active = steps.findIndex(step => step.status === "in_progress");
  const start = Math.max(0, Math.min(active - 3, steps.length - MAX_VISIBLE_STEPS));
  if (start > 0) lines.push(theme.fg("dim", `  … ${start} earlier steps`));
  for (const step of steps.slice(start, start + MAX_VISIBLE_STEPS)) lines.push(stepLine(theme, step));
  const hidden = steps.length - start - MAX_VISIBLE_STEPS;
  if (hidden > 0) lines.push(theme.fg("dim", `  … ${hidden} more · ${PLAN_TOGGLE_LABEL} collapse`));
  return lines.map(line => truncateToWidth(line, width, "…"));
}

type AnyRecord = Record<string, unknown>;
type LayoutNode = { container: AnyRecord; children: unknown[]; entries?: unknown[] };
export type PlanLayoutMemory = { status?: unknown };
const SWAP_TAG = Symbol.for("pi.toolRails.planStatusSwap");
export const AGENTS_PANEL_TAG = Symbol.for("pi.toolRails.agentsPanel");
type SwapTag = { widget: unknown; status: unknown };

const isObject = (value: unknown): value is AnyRecord => typeof value === "object" && value !== null;

function parallelEntries(node: AnyRecord): unknown[] | undefined {
  const children = node.children;
  const entries = node.entries;
  if (!Array.isArray(children) || !Array.isArray(entries) || entries.length !== children.length) return undefined;
  return entries.every(entry => isObject(entry) && "component" in entry) ? entries : undefined;
}

/**
 * Collect every component list in the mounted TUI tree, so the plan widget can
 * reorder the containers it lives in without knowing Pi's layout classes.
 */
function layoutNodes(tui: unknown): LayoutNode[] {
  const nodes: LayoutNode[] = [];
  const visited = new Set<unknown>();
  const visit = (node: unknown, depth: number): void => {
    if (depth > 8 || !isObject(node) || visited.has(node)) return;
    visited.add(node);
    if (Array.isArray(node.children)) {
      const entries = parallelEntries(node);
      nodes.push({ container: node, children: node.children, ...(entries ? { entries } : {}) });
      for (const child of node.children) visit(child, depth + 1);
    }
    if (Array.isArray(node.entries)) {
      for (const entry of node.entries) visit(isObject(entry) ? entry.component : undefined, depth + 1);
    }
  };
  visit(tui, 0);
  if (isObject(tui)) visit(tui.layoutRoot, 0);
  return nodes;
}

/** Move `widget` to sit directly before `status`, keeping parallel stack entries aligned. */
function moveBefore(node: LayoutNode, widget: unknown, status: unknown): boolean {
  const from = node.children.indexOf(widget);
  const to = node.children.indexOf(status);
  if (from < 0 || to < 0 || from < to) return false;
  const order = node.children.slice();
  order.splice(from, 1);
  order.splice(order.indexOf(status), 0, widget);
  for (let index = 0; index < order.length; index++) node.children[index] = order[index];
  const entries = node.entries;
  if (entries) {
    const source = entries.slice();
    for (let index = 0; index < order.length; index++) {
      const entry = source.find(candidate => isObject(candidate) && candidate.component === order[index]);
      if (entry !== undefined) entries[index] = entry;
    }
  }
  return true;
}

/**
 * Remember which sibling holds Pi's working status line. The swap itself is
 * tagged on the owning container so a widget remount or extension reload reuses
 * the recorded container instead of mistaking the already-reordered sibling for
 * the status line.
 */
function learnStatus(parent: LayoutNode, widget: unknown, memory: PlanLayoutMemory): boolean {
  const tagged = (parent.container as Record<symbol, unknown>)[SWAP_TAG];
  const stored = isObject(tagged) && tagged.widget === widget && isObject(tagged.status) ? tagged.status : undefined;
  if (stored !== undefined && parent.children.includes(stored)) {
    memory.status = stored;
    return true;
  }
  const index = parent.children.indexOf(widget);
  if (index < 1) return false;
  memory.status = parent.children[index - 1];
  (parent.container as Record<symbol, unknown>)[SWAP_TAG] = { widget, status: memory.status } satisfies SwapTag;
  return true;
}

/**
 * Pi stacks the working-status line above the extension widgets, so a mounted
 * plan would render underneath the spinner. Keep the plan container ahead of the
 * status container.
 */
export function syncPlanLayout(tui: unknown, self: unknown, memory: PlanLayoutMemory): boolean {
  if (!isObject(tui)) return false;
  const nodes = layoutNodes(tui);
  const home = nodes.find(node => node.children.includes(self));
  if (!home) return false;
  const agents = home.children.find(child => isObject(child) && (child as Record<symbol, unknown>)[AGENTS_PANEL_TAG]);
  let changed = agents !== undefined && moveBefore(home, agents, self);
  const widget = home.container;
  const parent = nodes.find(node => node.children.includes(widget));
  if (!parent) return changed;
  if (memory.status === undefined || !parent.children.includes(memory.status)) {
    memory.status = undefined;
    if (!learnStatus(parent, widget, memory)) return changed;
  }
  for (const node of nodes) {
    if (moveBefore(node, widget, memory.status)) changed = true;
  }
  return changed;
}

export function installPlanWidget(pi: ExtensionAPI): void {
  let steps: Step[] = [];
  let expanded = false;
  // Survives widget remounts and renderer switches; container identities do too.
  const memory: PlanLayoutMemory = {};
  let mountedContext: ExtensionContext | undefined;
  let mountedTui: { requestRender?: (force?: boolean) => void } | undefined;
  function refresh(ctx: ExtensionContext): void {
    if (!ctx.hasUI || ctx.mode !== "tui") return;
    if (!steps.length) {
      if (mountedContext) ctx.ui.setWidget(PLAN_WIDGET_KEY, undefined);
      mountedContext = undefined;
      mountedTui = undefined;
      return;
    }
    mountedContext = ctx;
    const snapshot = steps;
    ctx.ui.setWidget(PLAN_WIDGET_KEY, (tui, theme) => {
      mountedTui = tui as { requestRender?: (force?: boolean) => void };
      const component = {
        render: (width: number): string[] => {
          const lines = renderPlanWidget(snapshot, theme, width, expanded);
          if (lines.length && syncPlanLayout(tui, component, memory)) tui.requestRender?.();
          return lines;
        },
        invalidate() {},
      };
      return component;
    }, { placement: "aboveEditor" });
  }
  function restore(_event: unknown, ctx: ExtensionContext): void {
    steps = restorePlan(ctx.sessionManager?.getBranch() ?? []);
    refresh(ctx);
  }
  function restoreNewSession(event: unknown, ctx: ExtensionContext): void {
    expanded = false;
    restore(event, ctx);
  }
  pi.registerShortcut(PLAN_TOGGLE_KEY, {
    description: `Toggle the Plan panel (${PLAN_TOGGLE_LABEL})`,
    handler: (ctx) => {
      if (!ctx.hasUI || !mountedContext) return;
      expanded = !expanded;
      mountedTui?.requestRender?.(true);
    },
  });
  pi.on("session_start", restoreNewSession);
  pi.on("session_tree", restore);
  pi.on("session_compact", restore);
  pi.on("tool_result", (event, ctx) => {
    if (event.toolName !== "update_plan" || event.isError) return;
    const next = parseSteps(record(event.input).steps);
    if (!next) return;
    steps = next;
    refresh(ctx);
  });
  pi.on("session_shutdown", () => {
    mountedContext?.ui.setWidget(PLAN_WIDGET_KEY, undefined);
    mountedContext = undefined;
    mountedTui = undefined;
    steps = [];
  });
}
