import { Type, type Static } from "typebox";
import { Check, Errors } from "typebox/value";

const text = (description: string) => Type.String({ minLength: 1, pattern: "\\S", description });
// Lookaround is rejected by some providers (400 invalid JSON schema), so root and
// parent-traversal checks run in boundTeammateDispatch; the schema blocks blanks and wildcards.
const path = Type.String({ minLength: 1, pattern: "^[^*?]*[^*?\\s][^*?]*$", description: "Concrete file or directory; no root, parent traversal or wildcards." });
const FORBIDDEN_PATH = /^[./\\]+$|(?:^|[/\\])\.\.(?:[/\\]|$)/;
export const TeammateTaskSchema = Type.Object({
  goal: text("One bounded deliverable, including relevant context and read targets."),
  access: Type.Union([Type.Literal("read-only"), Type.Literal("edit")], { description: "Explicit permission. Choose read-only unless edits are authorized." }),
  allowedPaths: Type.Array(path, { description: "Required; [] for read-only. Edit tasks require at least one narrowly scoped write path." }),
  checks: Type.Array(text("Specific verification or evidence to collect."), { minItems: 1 }),
  stopWhen: text("Concrete completion condition; report blockers rather than expanding scope."),
  agent: Type.Optional(Type.String({ enum: ["general", "explorer", "analyst", "planner", "research"], description: "Role; defaults to analyst for read-only and general for edits." })),
  name: Type.Optional(text("Task name, required when referenced by dependsOn.")),
  dependsOn: Type.Optional(Type.Array(text("Name of prerequisite task."))),
}, { additionalProperties: false });

export const TeammateDispatchSchema = Type.Object({
  tasks: Type.Array(TeammateTaskSchema, { minItems: 1 }),
  concurrency: Type.Optional(Type.Integer({ minimum: 1, maximum: 4, description: "Maximum parallel agents; defaults to 2." })),
  background: Type.Optional(Type.Boolean({ description: "Return before completion; use teammate lifecycle tools for results." })),
}, { additionalProperties: false });

type Task = Static<typeof TeammateTaskSchema>;
export const TEAMMATE_SCOPE_RULES = `Delegation boundaries:
- Complete only the assigned deliverable, then stop. Do not add features, refactor unrelated code, or fix adjacent issues.
- Default to read-only investigation. Modify files only with explicit edit access and only within allowed paths. This includes shell writes.
- Do not install dependencies, change configuration, commit, push, or perform external side effects unless explicitly authorized by this task.
- Do not delegate. Report blockers and requests for broader scope to the parent.
- Return the result, changed paths, checks actually run and unresolved blockers. Never claim unperformed verification.`;

function compileTask(task: Task) {
  return {
    agent: task.agent ?? (task.access === "edit" ? "general" : "analyst"),
    ...(task.name ? { name: task.name } : {}),
    ...(task.dependsOn ? { dependsOn: task.dependsOn } : {}),
    maxNestingDepth: 0,
    prompt: `${TEAMMATE_SCOPE_RULES}\n\nAssigned contract:\n${JSON.stringify({ goal: task.goal, access: task.access, allowedPaths: task.allowedPaths, checks: task.checks, stopWhen: task.stopWhen }, null, 2)}`,
  };
}

export function boundTeammateDispatch(input: unknown) {
  if (!Check(TeammateDispatchSchema, input)) {
    const errors = [...Errors(TeammateDispatchSchema, input)].slice(0, 5);
    throw new Error(`Invalid teammate contract: ${errors.map(error => `${error.instancePath || "/"}: ${error.message}`).join("; ")}`);
  }
  for (const [index, task] of input.tasks.entries()) {
    for (const [pathIndex, allowedPath] of task.allowedPaths.entries()) {
      if (FORBIDDEN_PATH.test(allowedPath)) throw new Error(`Invalid teammate contract: tasks[${index}].allowedPaths[${pathIndex}]: use a concrete path; no root or parent traversal.`);
    }
    if (task.access === "edit" && task.allowedPaths.length === 0) throw new Error(`tasks[${index}].allowedPaths: edit access requires explicit write paths.`);
    if (task.access === "read-only" && task.allowedPaths.length !== 0) throw new Error(`tasks[${index}].allowedPaths: read-only access requires []. Put read targets in goal.`);
    if (task.access === "edit" && task.agent && task.agent !== "general") throw new Error(`tasks[${index}].agent: edit access requires general, not a read-only role.`);
  }
  return { tasks: input.tasks.map(compileTask), concurrency: input.concurrency ?? 2, ...(input.background === undefined ? {} : { background: input.background }), maxNestingDepth: 0 };
}

// Renderers see partial arguments during streaming. Never validate/throw there.
export function previewTeammateDispatch(input: unknown) {
  const params = input && typeof input === "object" ? input as Record<string, unknown> : {};
  return { ...params, tasks: Array.isArray(params.tasks) ? params.tasks.map(task => {
    const value = task && typeof task === "object" ? task as Record<string, unknown> : {};
    return { ...value, prompt: typeof value.goal === "string" ? value.goal : "", agent: value.agent ?? (value.access === "edit" ? "general" : "analyst") };
  }) : [] };
}
