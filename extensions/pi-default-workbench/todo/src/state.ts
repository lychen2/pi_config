export type TaskStatus = "pending" | "in_progress" | "completed" | "deleted";
export type TaskAction = "create" | "update" | "list" | "get" | "delete" | "clear";

export interface Task {
  id: number;
  subject: string;
  description?: string;
  activeForm?: string;
  status: TaskStatus;
  blockedBy?: number[];
  owner?: string;
  metadata?: Record<string, unknown>;
}

export interface TaskState {
  tasks: Task[];
  nextId: number;
}

export interface TaskDetails {
  action: TaskAction;
  params: Record<string, unknown>;
  tasks: Task[];
  nextId: number;
  error?: string;
}

export interface TaskMutationParams {
  [key: string]: unknown;
  subject?: string;
  description?: string;
  activeForm?: string;
  status?: TaskStatus;
  blockedBy?: number[];
  addBlockedBy?: number[];
  removeBlockedBy?: number[];
  owner?: string;
  metadata?: Record<string, unknown>;
  id?: number;
  includeDeleted?: boolean;
}

export const EMPTY_STATE: TaskState = { tasks: [], nextId: 1 };

export function cloneState(state: TaskState): TaskState {
  return {
    tasks: state.tasks.map((task) => ({
      ...task,
      ...(task.blockedBy ? { blockedBy: [...task.blockedBy] } : {}),
      ...(task.metadata ? { metadata: { ...task.metadata } } : {}),
    })),
    nextId: state.nextId,
  };
}

export function isTaskDetails(value: unknown): value is TaskDetails {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Partial<TaskDetails>;
  return Array.isArray(candidate.tasks) && typeof candidate.nextId === "number";
}

export function activeTodoContext(state: TaskState): string | undefined {
  const active = state.tasks.filter((task) => task.status === "pending" || task.status === "in_progress");
  if (active.length === 0) return undefined;

  const ids = new Set(active.map((task) => task.id));
  const lines = active.map((task) => {
    const status = task.status === "in_progress" ? "in_progress" : dependencyState(task, state.tasks);
    const blockedBy = task.blockedBy?.filter((id) => ids.has(id));
    const dependency = blockedBy?.length ? `; blockedBy=${blockedBy.map((id) => `#${id}`).join(",")}` : "";
    const form = task.status === "in_progress" && task.activeForm ? `; activeForm=${task.activeForm}` : "";
    return `- #${task.id} [${status}] ${task.subject}${form}${dependency}`;
  });
  return [
    "<todo-state source=pi-maestro-todo>",
    "The following project Todo tasks remain active. Keep this state current; do not recreate completed tasks.",
    ...lines,
    "</todo-state>",
  ].join("\n");
}

export function replayFromBranch(ctx: {
  sessionManager: { getBranch(): Iterable<unknown> };
}): TaskState {
  let state = cloneState(EMPTY_STATE);
  for (const entry of ctx.sessionManager.getBranch()) {
    const candidate = entry as {
      type?: string;
      message?: { role?: string; toolName?: string; details?: unknown };
    };
    const message = candidate.type === "message" ? candidate.message : undefined;
    if (message?.role !== "toolResult" || message.toolName !== "todo") continue;
    if (!isTaskDetails(message.details)) continue;
    state = cloneState({ tasks: message.details.tasks, nextId: message.details.nextId });
  }
  return state;
}

export function dependencyState(task: Task, tasks: readonly Task[]): "blocked" | TaskStatus {
  if (task.status !== "pending" || !task.blockedBy?.length) return task.status;
  const byId = new Map(tasks.map((candidate) => [candidate.id, candidate]));
  return task.blockedBy.some((id) => {
    const dependency = byId.get(id);
    return dependency !== undefined && dependency.status !== "completed" && dependency.status !== "deleted";
  }) ? "blocked" : "pending";
}

const VALID_TRANSITIONS: Record<TaskStatus, ReadonlySet<TaskStatus>> = {
  pending: new Set(["in_progress", "completed", "deleted"]),
  in_progress: new Set(["pending", "completed", "deleted"]),
  completed: new Set(["deleted"]),
  deleted: new Set(),
};

function isTransitionValid(from: TaskStatus, to: TaskStatus): boolean {
  return from === to || VALID_TRANSITIONS[from].has(to);
}

function detectCycle(tasks: readonly Task[], targetId: number, blockedBy: readonly number[]): boolean {
  const dependencies = new Map<number, readonly number[]>();
  for (const task of tasks) dependencies.set(task.id, task.id === targetId ? blockedBy : task.blockedBy ?? []);
  const visiting = new Set<number>();
  const visited = new Set<number>();
  const visit = (id: number): boolean => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    for (const dependency of dependencies.get(id) ?? []) {
      if (visit(dependency)) return true;
    }
    visiting.delete(id);
    visited.add(id);
    return false;
  };
  return visit(targetId);
}

function taskChanged(before: Task, after: Task): boolean {
  return JSON.stringify(before) !== JSON.stringify(after);
}

export type MutationOutcome = {
  state: TaskState;
  text: string;
  error?: string;
};

function failure(state: TaskState, message: string): MutationOutcome {
  return { state, text: `Error: ${message}`, error: message };
}

function validateDependency(state: TaskState, id: number, field: string): string | undefined {
  const dependency = state.tasks.find((task) => task.id === id);
  if (!dependency) return `${field}: #${id} not found`;
  if (dependency.status === "deleted") return `${field}: #${id} is deleted`;
  return undefined;
}

function listLine(task: Task): string {
  const form = task.status === "in_progress" && task.activeForm ? ` (${task.activeForm})` : "";
  const dependencies = task.blockedBy?.length ? ` <- ${task.blockedBy.map((id) => `#${id}`).join(",")}` : "";
  return `[${task.status}] #${task.id} ${task.subject}${form}${dependencies}`;
}

function getText(task: Task, state: TaskState): string {
  const blocks = state.tasks.filter((candidate) => candidate.blockedBy?.includes(task.id)).map((candidate) => candidate.id);
  const lines = [`#${task.id} [${task.status}] ${task.subject}`];
  if (task.description) lines.push(`  description: ${task.description}`);
  if (task.activeForm) lines.push(`  activeForm: ${task.activeForm}`);
  if (task.blockedBy?.length) lines.push(`  blockedBy: ${task.blockedBy.map((id) => `#${id}`).join(", ")}`);
  if (blocks.length) lines.push(`  blocks: ${blocks.map((id) => `#${id}`).join(", ")}`);
  if (task.owner) lines.push(`  owner: ${task.owner}`);
  return lines.join("\n");
}

export function applyMutation(
  state: TaskState,
  action: TaskAction,
  params: TaskMutationParams,
): MutationOutcome {
  if (action === "create") {
    if (!params.subject?.trim()) return failure(state, "subject required for create");
    for (const dependency of params.blockedBy ?? []) {
      const error = validateDependency(state, dependency, "blockedBy");
      if (error) return failure(state, error);
    }
    const task: Task = { id: state.nextId, subject: params.subject, status: "pending" };
    if (params.description) task.description = params.description;
    if (params.activeForm) task.activeForm = params.activeForm;
    if (params.blockedBy?.length) task.blockedBy = [...new Set(params.blockedBy)];
    if (params.owner) task.owner = params.owner;
    if (params.metadata) task.metadata = { ...params.metadata };
    return {
      state: { tasks: [...state.tasks, task], nextId: state.nextId + 1 },
      text: `Created #${task.id}: ${task.subject} (pending)`,
    };
  }

  if (action === "update") {
    if (params.id === undefined) return failure(state, "id required for update");
    const index = state.tasks.findIndex((task) => task.id === params.id);
    if (index < 0) return failure(state, `#${params.id} not found`);
    const current = state.tasks[index]!;
    const hasMutation = params.subject !== undefined || params.description !== undefined ||
      params.activeForm !== undefined || params.status !== undefined || params.owner !== undefined ||
      params.metadata !== undefined || Boolean(params.addBlockedBy?.length) || Boolean(params.removeBlockedBy?.length);
    if (!hasMutation) {
      return failure(state, "update requires at least one mutable field: subject, description, activeForm, status, owner, metadata, addBlockedBy, or removeBlockedBy");
    }
    if (params.status !== undefined && !isTransitionValid(current.status, params.status)) {
      return failure(state, `illegal transition ${current.status} -> ${params.status}`);
    }
    if (
      params.status === "in_progress"
      && current.status !== "in_progress"
      && state.tasks.some((task) => task.id !== current.id && task.status === "in_progress")
    ) {
      return failure(state, "only one task may be in_progress at a time");
    }

    let blockedBy = [...(current.blockedBy ?? [])];
    if (params.removeBlockedBy?.length) {
      const removed = new Set(params.removeBlockedBy);
      blockedBy = blockedBy.filter((id) => !removed.has(id));
    }
    for (const dependency of params.addBlockedBy ?? []) {
      if (dependency === current.id) return failure(state, `cannot block #${current.id} on itself`);
      const error = validateDependency(state, dependency, "addBlockedBy");
      if (error) return failure(state, error);
      if (!blockedBy.includes(dependency)) blockedBy.push(dependency);
    }
    if (detectCycle(state.tasks, current.id, blockedBy)) {
      return failure(state, "addBlockedBy would create a cycle in the blockedBy graph");
    }

    const updated: Task = { ...current, status: params.status ?? current.status };
    if (params.subject !== undefined) updated.subject = params.subject;
    if (params.description !== undefined) updated.description = params.description;
    if (params.activeForm !== undefined) updated.activeForm = params.activeForm;
    if (params.owner !== undefined) updated.owner = params.owner;
    if (blockedBy.length) updated.blockedBy = blockedBy;
    else delete updated.blockedBy;
    if (params.metadata !== undefined) {
      const metadata = { ...(current.metadata ?? {}) };
      for (const [key, value] of Object.entries(params.metadata)) {
        if (value === null) delete metadata[key];
        else metadata[key] = value;
      }
      if (Object.keys(metadata).length) updated.metadata = metadata;
      else delete updated.metadata;
    }

    const tasks = [...state.tasks];
    tasks[index] = updated;
    const transition = current.status !== updated.status ? ` (${current.status} -> ${updated.status})` : "";
    return {
      state: { tasks, nextId: state.nextId },
      text: taskChanged(current, updated)
        ? `Updated #${updated.id}${transition}`
        : `No change: #${updated.id} already matches the requested values (status: ${updated.status})`,
    };
  }

  if (action === "list") {
    let tasks = state.tasks;
    if (!params.includeDeleted) tasks = tasks.filter((task) => task.status !== "deleted");
    if (params.status) tasks = tasks.filter((task) => task.status === params.status);
    return { state, text: tasks.length ? tasks.map(listLine).join("\n") : "No tasks" };
  }

  if (action === "get") {
    if (params.id === undefined) return failure(state, "id required for get");
    const task = state.tasks.find((candidate) => candidate.id === params.id);
    return task ? { state, text: getText(task, state) } : failure(state, `#${params.id} not found`);
  }

  if (action === "delete") {
    if (params.id === undefined) return failure(state, "id required for delete");
    const index = state.tasks.findIndex((task) => task.id === params.id);
    if (index < 0) return failure(state, `#${params.id} not found`);
    const current = state.tasks[index]!;
    if (current.status === "deleted") return failure(state, `#${current.id} is already deleted`);
    const tasks = [...state.tasks];
    tasks[index] = { ...current, status: "deleted" };
    return { state: { tasks, nextId: state.nextId }, text: `Deleted #${current.id}: ${current.subject}` };
  }

  const count = state.tasks.length;
  return { state: cloneState(EMPTY_STATE), text: `Cleared ${count} tasks` };
}

export function resultEnvelope(
  action: TaskAction,
  params: TaskMutationParams,
  outcome: MutationOutcome,
): { content: Array<{ type: "text"; text: string }>; details: TaskDetails; isError?: boolean } {
  return {
    content: [{ type: "text", text: outcome.text }],
    details: {
      action,
      params: params as Record<string, unknown>,
      tasks: outcome.state.tasks,
      nextId: outcome.state.nextId,
      ...(outcome.error ? { error: outcome.error } : {}),
    },
    ...(outcome.error ? { isError: true } : {}),
  };
}
