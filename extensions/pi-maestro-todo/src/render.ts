import type { Theme } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { dependencyState, type Task } from "./state.ts";

export const TODO_WIDGET_KEY = "todo-panel";
export const TODO_TOGGLE_KEY = "alt+t";
export const TODO_TOGGLE_LABEL = "Alt+T";

export type DisplayStatus = "pending" | "in_progress" | "blocked" | "completed" | "deleted";

const STATUS_RANK: Record<DisplayStatus, number> = {
  in_progress: 0,
  blocked: 1,
  pending: 2,
  completed: 3,
  deleted: 4,
};

function fit(line: string, width: number): string {
  return truncateToWidth(line, Math.max(1, width), "...");
}

function orderedTasks(tasks: readonly Task[], includeDeleted = false): Task[] {
  return tasks
    .filter((task) => includeDeleted || task.status !== "deleted")
    .slice()
    .sort((left, right) => {
      const status = STATUS_RANK[dependencyState(left, tasks)] - STATUS_RANK[dependencyState(right, tasks)];
      return status || left.id - right.id;
    });
}

function statusLabel(status: DisplayStatus): string {
  switch (status) {
    case "in_progress": return "running";
    case "blocked": return "blocked";
    case "completed": return "done";
    case "deleted": return "deleted";
    default: return "pending";
  }
}

function statusGlyph(theme: Theme, status: DisplayStatus): string {
  switch (status) {
    case "in_progress": return theme.fg("warning", "■");
    case "blocked": return theme.fg("error", "!");
    case "completed": return theme.fg("success", "✓");
    case "deleted": return theme.fg("dim", "x");
    default: return theme.fg("dim", "□");
  }
}

function subjectText(theme: Theme, task: Task, status: DisplayStatus): string {
  if (status === "in_progress") return theme.bold(theme.fg("warning", task.subject));
  if (status === "blocked") return theme.fg("error", task.subject);
  if (status === "completed") return theme.strikethrough(theme.fg("muted", task.subject));
  if (status === "deleted") return theme.strikethrough(theme.fg("dim", task.subject));
  return theme.fg("text", task.subject);
}

function taskLine(theme: Theme, task: Task, allTasks: readonly Task[]): string {
  const status = dependencyState(task, allTasks);
  const owner = task.owner ? ` ${theme.fg("accent", `@${task.owner}`)}` : "";
  const color = status === "in_progress" ? "warning" : status === "blocked" ? "error" : status === "completed" ? "muted" : "text";
  const subject = status === "completed"
    ? theme.strikethrough(theme.fg(color, task.subject))
    : status === "in_progress"
      ? theme.bold(theme.fg(color, task.subject))
      : theme.fg(color, task.subject);
  let line = `  ${statusGlyph(theme, status)}${owner} ${subject}`;
  if (status === "in_progress" && task.activeForm) line += ` ${theme.fg("muted", `(${task.activeForm})`)}`;
  if (status === "blocked" && task.blockedBy?.length) {
    const byId = new Map(allTasks.map((candidate) => [candidate.id, candidate]));
    const dependencies = task.blockedBy.map((id) => {
      const dependency = byId.get(id);
      return dependency
        ? `${theme.fg("dim", "←")} ${statusGlyph(theme, dependencyState(dependency, allTasks))} ${theme.fg("dim", dependency.subject)}`
        : theme.fg("dim", "← ?");
    });
    line += `  ${dependencies.join("  ")}`;
  }
  return line;
}

export function renderTodoWidget(
  theme: Theme,
  tasks: readonly Task[],
  expanded: boolean,
  width: number,
): string[] {
  const visible = orderedTasks(tasks);
  if (!visible.length) return [];
  const done = visible.filter((task) => task.status === "completed").length;
  const running = visible.filter((task) => task.status === "in_progress").length;
  const blocked = visible.filter((task) => dependencyState(task, visible) === "blocked").length;
  const toggle = expanded ? "collapse" : "expand";
  const full = `${theme.bold("Todo")}  ${theme.fg("dim", `${visible.length} tasks · ${done} done · ${running} running${blocked ? ` · ${blocked} blocked` : ""}  (${TODO_TOGGLE_LABEL} ${toggle})`)}`;
  const compact = `${theme.bold("Todo")}  ${theme.fg("dim", `${done}/${visible.length} · ${running} running  (${TODO_TOGGLE_LABEL} ${toggle})`)}`;
  const minimal = `${theme.bold("Todo")}  ${theme.fg("dim", `${done}/${visible.length}`)}`;
  const heading = [full, compact, minimal].find((candidate) => visibleWidth(candidate) <= Math.max(1, width)) ?? minimal;
  const lines = [fit(heading, width)];
  if (!expanded) return lines;
  for (const task of visible.slice(0, 8)) lines.push(fit(taskLine(theme, task, visible), width));
  if (visible.length > 8) lines.push(fit(theme.fg("dim", `  … ${visible.length - 8} more · ${TODO_TOGGLE_LABEL} collapse`), width));
  return lines;
}

export function renderPlainTask(task: Task, tasks: readonly Task[]): string {
  const status = dependencyState(task, tasks);
  const form = status === "in_progress" && task.activeForm ? ` (${task.activeForm})` : "";
  const owner = task.owner ? ` @${task.owner}` : "";
  return `${statusGlyphPlain(status)} #${task.id}${owner} ${task.subject}${form}`;
}

function statusGlyphPlain(status: DisplayStatus): string {
  if (status === "in_progress") return "■";
  if (status === "blocked") return "!";
  if (status === "completed") return "✓";
  if (status === "deleted") return "x";
  return "□";
}

export function statusSummary(tasks: readonly Task[]): string {
  const visible = tasks.filter((task) => task.status !== "deleted");
  const done = visible.filter((task) => task.status === "completed").length;
  const running = visible.filter((task) => task.status === "in_progress").length;
  const blocked = visible.filter((task) => dependencyState(task, visible) === "blocked").length;
  const open = visible.length - done - running;
  return `${visible.length} tasks (${done} done, ${running} in progress, ${open} open${blocked ? `, ${blocked} blocked` : ""})`;
}

export function displayStatusLabel(task: Task, tasks: readonly Task[]): string {
  return statusLabel(dependencyState(task, tasks));
}

export { orderedTasks };
