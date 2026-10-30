import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

type Task = { id: string | number; subject: string; status: "pending" | "in_progress" };

const TOOL_ENV = "PI_TODO_GUARD_TOOL";
const DISABLE_ENV = "PI_TODO_GUARD_DISABLE";
const MAX_TASKS = 20;
const MAX_FOLLOW_UPS = 3;
const MAX_SUBJECT_LENGTH = 240;
const FOLLOW_UP_ENTRY_TYPE = "pi-todo-guard-follow-up";
const PLAN_STATE_ENTRY_TYPE = "sol-pi-online-context-state-v1";

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" ? value as Record<string, unknown> : {};
}

function openTasks(value: unknown, plan: boolean): Task[] | undefined {
  if (!Array.isArray(value)) return;
  const tasks: Task[] = [];
  for (const valueItem of value) {
    const item = record(valueItem);
    const subject = plan ? item.goal : item.subject;
    if (typeof item.id !== (plan ? "string" : "number") || typeof subject !== "string"
      || !["pending", "in_progress", "completed", ...(plan ? [] : ["deleted"])].includes(String(item.status))) return;
    if (item.status === "pending" || item.status === "in_progress") {
      tasks.push({ id: item.id as string | number, subject: subject.slice(0, MAX_SUBJECT_LENGTH), status: item.status });
    }
  }
  return tasks;
}

function getOpenWork(ctx: ExtensionContext, toolName: string): Task[] {
  let todos: Task[] = [];
  let plan: Task[] | undefined;
  for (const entry of ctx.sessionManager.getBranch()) {
    if (entry.type === "custom" && entry.customType === PLAN_STATE_ENTRY_TYPE) {
      plan = openTasks(record(entry.data).plan, true) ?? plan;
    }
    if (entry.type !== "message") continue;
    const message = entry.message;
    if (message.role !== "toolResult" || message.isError) continue;
    if (message.toolName === toolName) {
      const details = record(message.details);
      todos = openTasks(details.tasks, false) ?? todos;
      // Explicit clearing retires reminders inherited from earlier SoL plans.
      if (details.action === "clear" && Array.isArray(details.tasks) && details.tasks.length === 0) plan = undefined;
    }
    if (message.toolName !== "update_plan") continue;
    const detailsPlan = openTasks(record(message.details).plan, true);
    if (detailsPlan) {
      plan = detailsPlan;
      continue;
    }
    for (const block of message.content) {
      if (block.type !== "text") continue;
      const snapshot = block.text.match(/<sol-pi-plan\b[^>]*>([\s\S]*?)<\/sol-pi-plan>/);
      if (!snapshot) continue;
      try {
        plan = openTasks(record(JSON.parse(snapshot[1])).steps, true) ?? plan;
      } catch { /* A malformed tool snapshot does not replace the last valid plan. */ }
    }
  }
  // A plan replaces Todo until an explicit clear; later plan updates can resume it.
  return plan ?? todos;
}

function followUpCount(ctx: ExtensionContext): number {
  let count = 0;
  for (const entry of ctx.sessionManager.getBranch()) {
    if (entry.type === "message" && entry.message.role === "user") count = 0;
    if (entry.type === "custom" && entry.customType === FOLLOW_UP_ENTRY_TYPE) count++;
  }
  return count;
}

function reminder(tasks: Task[]): string {
  const visible = tasks.slice(0, MAX_TASKS);
  const lines = visible.map((task) => `- #${task.id} [${task.status}]: ${task.subject}`);
  if (tasks.length > visible.length) lines.push(`- ... and ${tasks.length - visible.length} more`);
  return [
    "Plan reminder: unfinished work remains:",
    "",
    ...lines,
    "",
    "Continue the authorized work from the current plan. Preserve step IDs and record completed work. Verify the result before finishing.",
    "If you need missing information, authorization, or a user decision, state the blocker. Do not perform blocked actions.",
  ].join("\n");
}

export default function todoGuard(pi: ExtensionAPI): void {
  if (process.env[DISABLE_ENV] === "1") return;
  const toolName = process.env[TOOL_ENV]?.trim() || "todo";

  pi.on("agent_before_settle", (event, ctx) => {
    if (event.outcome !== "completed" || event.continue || ctx.hasPendingMessages()) return;
    const tasks = getOpenWork(ctx, toolName);
    if (!tasks.length) return;
    if (followUpCount(ctx) >= MAX_FOLLOW_UPS) {
      if (ctx.hasUI) ctx.ui.notify(`Plan reminder stopped after ${MAX_FOLLOW_UPS} automatic continuations.`, "warning");
      return;
    }
    return {
      entries: [
        ...event.entries,
        { type: "custom" as const, customType: FOLLOW_UP_ENTRY_TYPE, data: { timestamp: Date.now() } },
        { type: "custom_message" as const, customType: FOLLOW_UP_ENTRY_TYPE, content: reminder(tasks), display: true },
      ],
      continue: true,
    };
  });
}
