import type { ExtensionAPI, ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { Text, type TUI } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { TodoCenter } from "./src/center.ts";
import {
  EMPTY_STATE,
  applyMutation,
  cloneState,
  replayFromBranch,
  resultEnvelope,
  type Task,
  type TaskAction,
  type TaskMutationParams,
  type TaskState,
} from "./src/state.ts";
import {
  TODO_TOGGLE_KEY,
  TODO_TOGGLE_LABEL,
  TODO_WIDGET_KEY,
  displayStatusLabel,
  orderedTasks,
  renderPlainTask,
  renderTodoWidget,
  statusSummary,
} from "./src/render.ts";

export const TOOL_NAME = "todo";
export const TOOL_LABEL = "Todo";
export const COMMAND_NAME = "todos";

const PROMPT_GUIDELINES = [
  "Use `todo` for complex work with 3+ steps, when the user gives you a list of tasks, or immediately after receiving new instructions to capture requirements. Skip it for single trivial tasks and purely conversational requests.",
  "When starting any task, mark it in_progress BEFORE beginning work. Mark it completed IMMEDIATELY when done — never batch completions. Exactly one task should be in_progress at a time.",
  "Never mark a task completed if tests are failing, the implementation is partial, or you hit unresolved errors — keep it in_progress and create a new task for the blocker instead.",
  "Task status is a 4-state machine: pending → in_progress → completed, plus deleted as a tombstone. Pass activeForm (present-continuous label, e.g. 'researching existing tool') when marking in_progress.",
  "To change a task's status, call update with the task id and the target status. An update without a mutable field is rejected.",
  "Use blockedBy to express dependencies. On create, pass blockedBy; on update, use addBlockedBy and removeBlockedBy. Cycles are rejected.",
  "List hides deleted tasks by default. Pass includeDeleted:true to include them, or status to filter.",
  "Subject must be short and imperative; description is for long-form detail. activeForm is a present-continuous label shown while in_progress.",
] as const;

export const TodoParamsSchema = Type.Object({
  action: StringEnum(["create", "update", "list", "get", "delete", "clear"] as const),
  subject: Type.Optional(Type.String({ description: "Task subject line (required for create)" })),
  description: Type.Optional(Type.String({ description: "Long-form task description" })),
  activeForm: Type.Optional(Type.String({ description: "Present-continuous label shown while status is in_progress" })),
  status: Type.Optional(StringEnum(["pending", "in_progress", "completed", "deleted"] as const)),
  blockedBy: Type.Optional(Type.Array(Type.Number(), { description: "Initial blockedBy ids (create only)" })),
  addBlockedBy: Type.Optional(Type.Array(Type.Number(), { description: "Task ids to add to blockedBy (update only)" })),
  removeBlockedBy: Type.Optional(Type.Array(Type.Number(), { description: "Task ids to remove from blockedBy (update only)" })),
  owner: Type.Optional(Type.String({ description: "Agent/owner assigned to this task" })),
  metadata: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  id: Type.Optional(Type.Number({ description: "Task id (required for update, get, delete)" })),
  includeDeleted: Type.Optional(Type.Boolean({ description: "Include deleted tasks in list" })),
});

const sessions = new Map<string, TaskState>();
let activeSessionId = "";
let uiContext: ExtensionContext | undefined;
let widgetTui: TUI | undefined;
let widgetMounted = false;
let expanded = false;

function sessionId(ctx: { sessionManager: { getSessionId(): string } }): string {
  return ctx.sessionManager.getSessionId() ?? "";
}

function stateFor(id: string): TaskState {
  return sessions.get(id) ?? cloneState(EMPTY_STATE);
}

function renderState(): TaskState {
  return stateFor(activeSessionId);
}

function visibleTasks(tasks: readonly Task[]): Task[] {
  return orderedTasks(tasks);
}

function refreshWidget(): void {
  const ctx = uiContext;
  if (!ctx?.hasUI || !ctx.ui.setWidget) return;
  const tasks = visibleTasks(renderState().tasks);
  if (!tasks.length) {
    if (widgetMounted) ctx.ui.setWidget(TODO_WIDGET_KEY, undefined);
    widgetMounted = false;
    widgetTui = undefined;
    return;
  }
  if (!widgetMounted) {
    ctx.ui.setWidget(TODO_WIDGET_KEY, (tui, theme) => {
      widgetTui = tui;
      return {
        render(width: number): string[] {
          return renderTodoWidget(theme, renderState().tasks, expanded, width);
        },
        invalidate() {},
      };
    }, { placement: "aboveEditor" });
    widgetMounted = true;
  } else {
    widgetTui?.requestRender();
  }
}

function clearWidget(ctx?: ExtensionContext): void {
  try { ctx?.ui.setWidget?.(TODO_WIDGET_KEY, undefined); } catch { /* session context may already be stale */ }
  widgetMounted = false;
  widgetTui = undefined;
  expanded = false;
}

function taskResultText(result: { content?: Array<{ type?: string; text?: string }> }): string {
  return result.content?.find((item) => item.type === "text")?.text ?? "";
}

function renderCall(args: unknown, theme: Theme): Text {
  const input = (args && typeof args === "object" ? args : {}) as TaskMutationParams & { action?: TaskAction };
  const action = input.action ?? "?";
  const glyph: Record<string, string> = { create: "+", update: "→", delete: "×", get: "›", list: "☰", clear: "∅" };
  let detail = "";
  if (action === "create" && input.subject) detail = ` ${input.subject}`;
  else if (["update", "get", "delete"].includes(action) && input.id !== undefined) detail = ` #${input.id}`;
  else if (action === "list" && input.status) detail = ` ${input.status}`;
  return new Text(`${theme.fg("toolTitle", theme.bold("todo "))}${theme.fg("muted", glyph[action] ?? action)}${theme.fg("dim", detail)}`, 0, 0);
}

function renderResult(result: { details?: unknown; content?: Array<{ type?: string; text?: string }> }, theme: Theme): Text {
  const details = result.details as { action?: string; params?: { id?: number; status?: string }; tasks?: Task[]; error?: string } | undefined;
  if (details?.error) return new Text(theme.fg("error", "× error"), 0, 0);
  const tasks = details?.tasks ?? [];
  if (details?.action === "create") {
    const task = tasks.at(-1);
    return new Text(task ? `${theme.fg("success", "✓")} ${theme.fg("dim", task.subject)}` : theme.fg("success", "✓"), 0, 0);
  }
  if (details?.action === "update" || details?.action === "delete") {
    const task = tasks.find((candidate) => candidate.id === details.params?.id);
    return new Text(task ? `${theme.fg(task.status === "completed" ? "success" : "warning", renderPlainTask(task, tasks))}` : theme.fg("success", "✓"), 0, 0);
  }
  const summary = tasks.length ? statusSummary(tasks) : taskResultText(result);
  return new Text(theme.fg("success", "✓") + theme.fg("dim", ` ${summary.split("\n")[0]}`), 0, 0);
}

async function openTodoCenter(ctx: ExtensionContext): Promise<void> {
  if (!ctx.hasUI || ctx.mode !== "tui") {
    ctx.ui.notify("Todo center requires interactive mode", "error");
    return;
  }
  if (!visibleTasks(renderState().tasks).length) {
    ctx.ui.notify("No todos yet. Ask the agent to add some!", "info");
    return;
  }
  await ctx.ui.custom<void>((tui, theme, _keybindings, done) => new TodoCenter({
    getTasks: () => renderState().tasks,
    requestRender: () => tui.requestRender(),
    close: () => done(undefined),
    theme,
  }), {
    overlay: true,
    overlayOptions: { anchor: "center", width: "94%", maxHeight: "90%" },
  });
}

function registerTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: TOOL_NAME,
    label: TOOL_LABEL,
    description: "Manage a persistent task list for multi-step work. Actions: create, update, list, get, delete, clear. Use blockedBy for dependencies and keep exactly one task in_progress.",
    promptSnippet: "Manage a task list to track multi-step progress",
    promptGuidelines: [...PROMPT_GUIDELINES],
    parameters: TodoParamsSchema,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const id = sessionId(ctx);
      const current = stateFor(id);
      const action = params.action as TaskAction;
      const outcome = applyMutation(current, action, params as TaskMutationParams);
      sessions.set(id, outcome.state);
      if (id === activeSessionId) refreshWidget();
      return resultEnvelope(action, params as TaskMutationParams, outcome);
    },
    renderCall(args, theme) { return renderCall(args, theme); },
    renderResult(result, _opts, theme) { return renderResult(result, theme); },
  });
}

function registerCommands(pi: ExtensionAPI): void {
  pi.registerCommand(COMMAND_NAME, {
    description: "查看和筛选当前待办列表",
    handler: async (_args, ctx) => {
      await openTodoCenter(ctx);
    },
  });
  pi.registerCommand("maestro-todo", {
    description: "打开 Maestro 风格的待办中心",
    handler: async (_args, ctx) => {
      await openTodoCenter(ctx);
    },
  });
}

export default function register(pi: ExtensionAPI): void {
  registerTool(pi);
  registerCommands(pi);

  pi.registerShortcut(TODO_TOGGLE_KEY, {
    description: `Toggle the Todo panel (${TODO_TOGGLE_LABEL})`,
    handler: (ctx) => {
      if (!ctx.hasUI || !widgetMounted) return;
      expanded = !expanded;
      widgetTui?.requestRender(true);
    },
  });

  pi.on("session_start", (_event, ctx) => {
    const id = sessionId(ctx);
    sessions.set(id, replayFromBranch(ctx));
    if (!activeSessionId && ctx.hasUI) activeSessionId = id;
    if (id === activeSessionId && ctx.hasUI) {
      uiContext = ctx;
      expanded = false;
      refreshWidget();
    }
  });

  pi.on("session_tree", (_event, ctx) => {
    const id = sessionId(ctx);
    sessions.set(id, replayFromBranch(ctx));
    if (id === activeSessionId) refreshWidget();
  });

  pi.on("session_compact", (_event, ctx) => {
    const id = sessionId(ctx);
    sessions.set(id, replayFromBranch(ctx));
    if (id === activeSessionId) refreshWidget();
  });

  pi.on("tool_execution_end", (event) => {
    if (event.toolName === TOOL_NAME && !event.isError) refreshWidget();
  });

  pi.on("agent_start", () => {
    expanded = false;
    widgetTui?.requestRender();
  });

  pi.on("session_shutdown", (_event, ctx) => {
    const id = sessionId(ctx);
    sessions.delete(id);
    if (id === activeSessionId) {
      clearWidget(ctx);
      activeSessionId = "";
      uiContext = undefined;
    }
  });
}

export {
  activeTodoContext,
  applyMutation,
  cloneState,
  dependencyState,
  replayFromBranch,
} from "./src/state.ts";
export { renderTodoWidget, statusSummary } from "./src/render.ts";
export type { Task, TaskDetails, TaskMutationParams, TaskState, TaskStatus } from "./src/state.ts";
