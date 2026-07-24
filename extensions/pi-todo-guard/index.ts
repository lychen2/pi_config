import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

type TodoStatus = "pending" | "in_progress" | "completed" | "deleted";
type TodoTask = { id: number; subject: string; status: TodoStatus };

const TOOL_ENV = "PI_TODO_GUARD_TOOL";
const DISABLE_ENV = "PI_TODO_GUARD_DISABLE";
const MAX_TASKS = 20;
const MAX_SUBJECT_LENGTH = 240;

function openTasks(value: unknown): TodoTask[] | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const tasks = (value as Record<string, unknown>).tasks;
  if (!Array.isArray(tasks)) return undefined;

  return tasks.flatMap((task) => {
    if (!task || typeof task !== "object" || Array.isArray(task)) return [];
    const item = task as Record<string, unknown>;
    if (typeof item.id !== "number" || typeof item.subject !== "string") return [];
    if (item.status !== "pending" && item.status !== "in_progress") return [];
    return [{ id: item.id, subject: item.subject.slice(0, MAX_SUBJECT_LENGTH), status: item.status }];
  });
}

function getOpenTodos(ctx: ExtensionContext, toolName: string): TodoTask[] {
  let tasks: TodoTask[] = [];
  for (const entry of ctx.sessionManager.getBranch()) {
    if (entry.type !== "message") continue;
    const message = entry.message;
    if (message.role !== "toolResult" || message.toolName !== toolName) continue;
    const next = openTasks(message.details);
    if (next) tasks = next;
  }
  return tasks;
}

function lastRunFailed(ctx: ExtensionContext): boolean {
  const branch = ctx.sessionManager.getBranch();
  for (let index = branch.length - 1; index >= 0; index--) {
    const entry = branch[index];
    if (entry.type !== "message" || entry.message.role !== "assistant") continue;
    return entry.message.stopReason === "error" || entry.message.stopReason === "aborted";
  }
  return false;
}

function reminder(tasks: TodoTask[]): string {
  const visible = tasks.slice(0, MAX_TASKS);
  const lines = visible.map((task) => `- #${task.id} [${task.status}]: ${task.subject}`);
  if (tasks.length > visible.length) lines.push(`- ... and ${tasks.length - visible.length} more`);
  return [
    "Todo guard: unfinished Todo items remain:",
    "",
    ...lines,
    "",
    "Continue working autonomously until every Todo is completed. Do not end with only a status update or plan. Update each Todo as its work is completed, and verify the final result before finishing.",
  ].join("\n");
}

export default function todoGuard(pi: ExtensionAPI): void {
  if (process.env[DISABLE_ENV] === "1") return;
  const toolName = process.env[TOOL_ENV]?.trim() || "todo";
  let queued = false;

  pi.on("session_start", () => { queued = false; });
  pi.on("agent_start", () => { queued = false; });
  pi.on("agent_settled", (_event, ctx) => {
    if (queued || !ctx.isIdle() || ctx.hasPendingMessages() || lastRunFailed(ctx)) return;
    const tasks = getOpenTodos(ctx, toolName);
    if (!tasks.length) return;

    queued = true;
    try {
      pi.sendUserMessage(reminder(tasks), { deliverAs: "followUp" });
    } catch (error) {
      queued = false;
      const message = error instanceof Error ? error.message : String(error);
      if (ctx.hasUI) ctx.ui.notify(`Todo guard could not continue: ${message}`, "error");
    }
  });
}
