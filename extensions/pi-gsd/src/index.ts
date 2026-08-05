import {
  defineTool,
  type ExtensionAPI,
  type ExtensionCommandContext,
  type MessageRenderer,
  type ModelRegistry,
  type RegisteredCommand,
  type SessionEntry,
  type SessionMessageEntry,
  type Theme,
  type ToolDefinition,
} from "@earendil-works/pi-coding-agent";

import type { Api, Model } from "@earendil-works/pi-ai";

import { Box, Text, type AutocompleteItem } from "@earendil-works/pi-tui";

import { Type, type Static } from "typebox";

import { renderTextContent, taskResultTextContent } from "./text-content.js";

type RoleProfile = {
  name: string;
  focus: string;
  boundary: string;
  output: string;
};

const ROLE_PROFILES: Record<string, RoleProfile> = {
  explore: {
    name: "explore",
    focus: "Locate relevant files, symbols, entry points, dependencies, and recent history.",
    boundary: "Read-only unless the task prompt explicitly authorizes a small fixture or note.",
    output: "Return evidence with paths and line numbers; separate facts from guesses.",
  },
  map: {
    name: "map",
    focus: "Build a structural map of modules, imports, ownership boundaries, and data flow.",
    boundary: "Read-only; do not redesign or modify the codebase.",
    output: "Return a compact map and the highest-value files to inspect next.",
  },
  analyze: {
    name: "analyze",
    focus: "Compare technical options or a proposal across correctness, constraints, and trade-offs.",
    boundary: "Read-only; do not turn the analysis into an implementation without authorization.",
    output: "Return a recommendation, rejected alternatives, assumptions, and evidence.",
  },
  research: {
    name: "research",
    focus: "Investigate documentation, upstream implementations, and relevant prior decisions.",
    boundary: "Do not modify project files; identify source quality and uncertainty.",
    output: "Return sources, findings, applicability, and unresolved questions.",
  },
  "external-research": {
    name: "external-research",
    focus: "Research external APIs, libraries, standards, or design patterns.",
    boundary: "Read-only; verify claims against primary sources where possible.",
    output: "Return citations, version details, compatibility risks, and a practical conclusion.",
  },
  synthesize: {
    name: "synthesize",
    focus: "Merge multiple research or review inputs into one decision-ready summary.",
    boundary: "Do not silently resolve contradictory evidence; call conflicts out.",
    output: "Return agreements, conflicts, gaps, recommendation, and confidence.",
  },
  plan: {
    name: "plan",
    focus: "Decompose a requirement into bounded tasks with dependencies and verification criteria.",
    boundary: "Do not modify implementation files; keep the plan proportional to the request.",
    output: "Return ordered tasks, affected paths, dependencies, and concrete checks.",
  },
  roadmap: {
    name: "roadmap",
    focus: "Turn a larger goal into phases, milestones, and convergence criteria.",
    boundary: "Planning only; avoid inventing dates or requirements not supported by evidence.",
    output: "Return phases, milestone outcomes, risks, and the smallest viable first phase.",
  },
  "plan-check": {
    name: "plan-check",
    focus: "Check whether a plan covers the requirement, dependencies, risks, and validation.",
    boundary: "Read-only; report missing work instead of rewriting the plan silently.",
    output: "Return blocking gaps, questionable assumptions, and pass/fail criteria.",
  },
  implement: {
    name: "implement",
    focus: "Implement one clearly scoped feature or fix using existing repository patterns.",
    boundary: "Change only the requested scope and preserve unrelated work.",
    output: "Return changed paths, behavior, verification commands, and remaining risks.",
  },
  execute: {
    name: "execute",
    focus: "Carry out a bounded task atomically and verify its acceptance criteria.",
    boundary: "Do not expand scope; stop and report when a prerequisite is missing.",
    output: "Return completed actions, evidence, failed checks, and follow-up blockers.",
  },
  debug: {
    name: "debug",
    focus: "Reproduce a failure, test hypotheses, isolate the root cause, and validate the fix.",
    boundary: "Preserve the reproducer and avoid speculative broad refactors.",
    output: "Return reproduction, evidence, root cause, fix, and regression coverage.",
  },
  migrate: {
    name: "migrate",
    focus: "Update an API, dependency, configuration, schema, or data format across its consumers.",
    boundary: "Identify compatibility and rollback concerns before changing shared contracts.",
    output: "Return affected consumers, migration steps, compatibility window, and verification.",
  },
  integrate: {
    name: "integrate",
    focus: "Check cross-module or cross-phase integration at the boundaries between changed parts.",
    boundary: "Prefer validation and targeted fixes; do not rewrite independent components.",
    output: "Return interface checks, integration failures, and the smallest corrective changes.",
  },
  review: {
    name: "review",
    focus: "Review changed code for correctness, regressions, edge cases, and missing tests.",
    boundary: "Read-only; findings need concrete file and line evidence.",
    output: "Return findings ordered by severity, then residual test gaps.",
  },
  audit: {
    name: "audit",
    focus: "Audit one risk dimension such as security, architecture, maintainability, or compliance.",
    boundary: "Stay within the assigned dimension and do not modify files.",
    output: "Return severity, evidence, impact, and an actionable recommendation.",
  },
  security: {
    name: "security",
    focus: "Inspect trust boundaries, input validation, authorization, secrets, and data exposure.",
    boundary: "Read-only audit; do not handle or print real secrets.",
    output: "Return severity-ranked findings with exploit path, impact, and remediation.",
  },
  performance: {
    name: "performance",
    focus: "Find measurable bottlenecks, resource leaks, unnecessary work, and useful benchmark points.",
    boundary: "Measure before optimizing and preserve behavior.",
    output: "Return evidence, baseline, proposed change, and before/after verification.",
  },
  test: {
    name: "test",
    focus: "Add or run focused tests and identify coverage gaps around the requested behavior.",
    boundary: "Keep test changes scoped; do not weaken assertions to make a suite pass.",
    output: "Return commands, results, covered cases, and remaining gaps.",
  },
  verify: {
    name: "verify",
    focus: "Perform final checks across the changed files, diagnostics, tests, and diff.",
    boundary: "Read-only unless the prompt explicitly authorizes fixing a discovered issue.",
    output: "Return pass/fail status, exact commands, failures, and residual risk.",
  },
  design: {
    name: "design",
    focus: "Develop an API, architecture, UI, or interaction design grounded in repository constraints.",
    boundary: "Produce a decision-ready design before implementing it.",
    output: "Return options, recommendation, interfaces, trade-offs, and open decisions.",
  },
  docs: {
    name: "docs",
    focus: "Update user-facing documentation, examples, links, and setup instructions.",
    boundary: "Keep claims aligned with the current implementation and verify commands and links.",
    output: "Return changed documents and a consistency check against the code.",
  },
  release: {
    name: "release",
    focus: "Prepare version, changelog, packaging, and release-readiness checks.",
    boundary: "Do not publish or tag unless the task prompt explicitly authorizes it.",
    output: "Return release artifacts, checks, blockers, and exact publication steps.",
  },
};

const ROLE_ALIASES: Record<string, string> = {
  scout: "explore",
  explorer: "explore",
  "codebase-mapper": "map",
  mapper: "map",
  researcher: "research",
  "phase-researcher": "research",
  "project-researcher": "research",
  "research-synthesizer": "synthesize",
  analyzer: "analyze",
  synthesizer: "synthesize",
  planner: "plan",
  "collab-planner": "plan",
  "roadmap-planner": "roadmap",
  roadmapper: "roadmap",
  "plan-checker": "plan-check",
  builder: "implement",
  executor: "execute",
  debugger: "debug",
  migrator: "migrate",
  reviewer: "review",
  auditor: "audit",
  tester: "test",
  verifier: "verify",
  "ui-design": "design",
  "ui-designer": "design",
  designer: "design",
  "role-design": "design",
  "external-researcher": "external-research",
  "integration-checker": "integrate",
  integrator: "integrate",
};

function roleKey(role: string): string {
  return role.trim().toLowerCase().replace(/[_\s]+/g, "-");
}

function getRoleProfile(role: string | undefined): RoleProfile | undefined {
  if (!role) return undefined;
  const key = roleKey(role);
  return ROLE_PROFILES[ROLE_ALIASES[key] ?? key];
}

function buildTaskPrompt(prompt: string, role: string | undefined): string {
  const profile = getRoleProfile(role);
  if (!profile) return role ? `Role: ${role}\n\n${prompt}` : prompt;
  return [
    `Role profile: ${profile.name}`,
    `Focus: ${profile.focus}`,
    `Default boundary: ${profile.boundary}`,
    `Expected output: ${profile.output}`,
    "",
    prompt,
  ].join("\n");
}

export function toolPushTask(pi: PushTaskAPI): ToolDefinition {
  return defineTool({
    name: "push-task",
    label: "Subagent Task",
    description:
      "Queue a session-tree subagent for isolated work in a fresh-context branch. Use when the user requests a subagent or a bounded independent task would materially benefit from clean context, parallel progress, or independent review. Skip trivial or tightly coupled work. The task starts only through /start-task or /auto.",
    promptGuidelines: [
      "Use push-task proactively for a bounded independent subtask when fresh context, parallel progress, or independent review materially improves the result. Keep trivial, tightly coupled, and continuously context-dependent work in the parent agent.",
      "push-task queues the subagent; it does not start immediately. Never claim execution started until the user runs /start-task or /auto.",
      "Give the subagent only the context it needs: goal, scoped paths or current state, constraints, acceptance checks, and expected output. Do not paste the full conversation or unrelated exploration logs.",
      "Keep each subagent within one ownership boundary. The parent agent owns integration, verification, and the final answer; use model only when a cheaper or specialized registered model is appropriate.",
    ],
    parameters: pushTaskParameters,
    renderCall(args: PushTaskParams, theme, context) {
      const title = args.title.trim();
      const role = args.role?.trim();
      const model = args.model?.trim();
      const metadata = [role && `role ${role}`, model && `model ${model}`]
        .filter(Boolean)
        .join(" · ");
      const status = `${theme.fg("muted", "○")} ${theme.fg("toolTitle", theme.bold(title))}${theme.fg("dim", ` · queued${metadata ? ` · ${metadata}` : ""}`)}`;
      if (!context.expanded) return new Text(status, 0, 0);

      const prompt = args.prompt
        .split("\n")
        .map((line) => theme.fg("dim", line.trimEnd() || " "));
      return new Text([status, ...prompt].join("\n"), 0, 0);
    },
    renderResult() {
      return new Text("", 0, 0);
    },
    async execute(_toolCallId, params: PushTaskParams, signal, _onUpdate, ctx) {
      if (signal?.aborted) {
        throw new Error("Task storage aborted.");
      }

      const title = params.title.trim();
      const role = params.role?.trim() || undefined;
      const model = params.model?.trim() || undefined;
      const prompt = buildTaskPrompt(params.prompt, role);

      pi.appendEntry(TASK_ENTRY_TYPE, {
        title,
        prompt,
        ...(role ? { role } : {}),
        ...(model ? { model } : {}),
      });

      if (ctx.hasUI) {
        refreshTaskStatus(ctx);
        ctx.ui.notify(
          "Task stored. Use `/start-task` or `/auto` to start it.",
          "info",
        );
      }

      return {
        content: [],
        details: {
          title,
          prompt,
          ...(role ? { role } : {}),
          ...(model ? { model } : {}),
        },
        terminate: true,
      };
    },
  });
}

export function cmdStartTask(pi: TaskCommandAPI): CommandOptions {
  return {
    description:
      "Navigate to a fresh context and inject the active task prompt",
    getArgumentCompletions: (argumentPrefix: string) => {
      if (!modelRegistry) return null;
      return getModelCompletions(argumentPrefix, modelRegistry);
    },
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      await ctx.waitForIdle();
      const modelArg = args.trim() || undefined;
      await startTask(pi, ctx, { modelArg });
    },
  };
}

export function cmdDiscardTask(pi: TaskCommandAPI): CommandOptions {
  return {
    description: "Discard the active task without executing it",
    handler: async (_args: string, ctx: ExtensionCommandContext) => {
      await ctx.waitForIdle();
      await discardTask(pi, ctx);
    },
  };
}

export function cmdFinishTask(pi: TaskCommandAPI): CommandOptions {
  return {
    description: "Finish the current task and return to the task start point",
    handler: async (_args: string, ctx: ExtensionCommandContext) => {
      await ctx.waitForIdle();
      await finishTask(pi, ctx);
    },
  };
}

export function cmdAbortTask(pi: TaskCommandAPI): CommandOptions {
  return {
    description: "Abort the current task without finishing",
    handler: async (_args: string, ctx: ExtensionCommandContext) => {
      await ctx.waitForIdle();
      await abortTask(pi, ctx);
    },
  };
}

export function cmdAuto(pi: AutoCommandAPI): CommandOptions {
  let running = false;
  let stopCurrentRun: (() => void) | null = null;
  let taskSettledVersion = 0;
  let resolveTaskSettled: (() => void) | null = null;

  const wakeTaskSettledWaiter = () => {
    const resolve = resolveTaskSettled;
    resolveTaskSettled = null;
    resolve?.();
  };

  pi.on("agent_settled", async (_event, ctx) => {
    recordTaskSettled(pi, ctx.sessionManager);
    taskSettledVersion++;
    wakeTaskSettledWaiter();
  });

  pi.on("session_shutdown", async () => {
    stopCurrentRun?.();
  });

  return {
    description: "Automatically run pushed task branches",
    handler: async (_args: string, ctx: ExtensionCommandContext) => {
      if (running) {
        ctx.ui.notify("Auto is already running.", "warning");
        return;
      }

      running = true;
      let stopped = false;
      let sawTaskActivity = false;
      stopCurrentRun = () => {
        stopped = true;
        wakeTaskSettledWaiter();
      };

      const autoStatusOptions = {
        prefix: "[auto] ",
      } satisfies TaskStatusOptions;
      refreshTaskStatus(ctx, autoStatusOptions);

      try {
        while (!stopped) {
          await ctx.waitForIdle();

          // Re-check after idle: userCtrlC/stopped may have been set
          // while we were waiting (the reaction engine runs before the
          // waiter resolves). Without this, we'd fall through to task
          // processing and might call finishTask even though the session
          // was shut down.
          if (stopped) break;

          if (lastAssistantWasAborted(ctx.sessionManager)) break;

          if (pendingTask(ctx.sessionManager)) {
            const result = await startTask(pi, ctx, {
              statusPrefix: autoStatusOptions.prefix,
            });
            if (result === "cancelled") break;
            sawTaskActivity = true;
            continue;
          }

          const taskStart = currentTask(ctx.sessionManager);
          if (taskStart) {
            if (taskSettledAt(ctx.sessionManager, taskStart) === undefined) {
              const observedVersion = taskSettledVersion;
              if (taskSettledAt(ctx.sessionManager, taskStart) === undefined) {
                await new Promise<void>((resolve) => {
                  resolveTaskSettled = resolve;
                  if (stopped || taskSettledVersion !== observedVersion) {
                    wakeTaskSettledWaiter();
                  }
                });
              }
              continue;
            }

            const result = await finishTask(pi, ctx, {
              statusPrefix: autoStatusOptions.prefix,
            });
            if (result === "cancelled") break;
            sawTaskActivity = true;
            continue;
          }

          // No pending tasks and no current task
          if (!sawTaskActivity) {
            // Never had any task activity — nothing to process
            ctx.ui.notify("No pending tasks to run.", "info");
            break;
          }

          if (!ctx.hasPendingMessages()) {
            break;
          }
        }
      } finally {
        stopCurrentRun = null;
        refreshTaskStatus(ctx);
        running = false;
      }
    },
  };
}

type TaskResultDetails = {
  title?: string;
  durationMs?: number;
};

type TaskResultTheme = Pick<Theme, "bold" | "fg">;

export function formatTaskDuration(durationMs: number | undefined): string | undefined {
  if (typeof durationMs !== "number" || !Number.isFinite(durationMs) || durationMs < 0) return undefined;
  if (durationMs < 1_000) return "<1s";
  if (durationMs < 10_000) return `${(durationMs / 1_000).toFixed(1)}s`;

  const totalSeconds = Math.round(durationMs / 1_000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (totalMinutes < 60) return `${totalMinutes}m ${String(seconds).padStart(2, "0")}s`;
  const hours = Math.floor(totalMinutes / 60);
  return `${hours}h ${String(totalMinutes % 60).padStart(2, "0")}m`;
}

export function taskResultDisplay(
  details: TaskResultDetails | undefined,
  body: string,
  expanded: boolean,
  theme: TaskResultTheme,
): string {
  const title = taskTitle(details?.title);
  const duration = formatTaskDuration(details?.durationMs);
  const header = [
    theme.fg("success", "✓"),
    theme.fg("customMessageLabel", theme.bold(`🧵 ${title}`)),
    theme.fg("dim", `· completed${duration ? ` · ${duration}` : ""}`),
  ].join(" ");
  return expanded && body ? `${header}\n${body}` : header;
}

export const rendererTaskResult: MessageRenderer<TaskResultDetails> = (
  message,
  options,
  theme,
): Box => {
  const text = taskResultDisplay(
    message.details,
    renderTextContent(message.content),
    options.expanded,
    theme,
  );
  const box = new Box(1, 1, (value: string) => theme.bg("customMessageBg", value));
  box.addChild(new Text(text, 0, 0));
  return box;
};

export function updateTaskStatus(
  session: ReadonlySessionLike,
  setStatus: (key: string, value: string | undefined) => void,
  theme: TaskStatusTheme,
  options: TaskStatusOptions = {},
): void {
  const prefix = options.prefix ?? "";
  const pending = pendingTask(session);
  if (pending) {
    setStatus(
      "task",
      `${prefix}${theme.fg("muted", "○")} ${theme.fg("dim", `subagent ${taskTitle(pending.data.title)} · queued`)}`,
    );
    return;
  }

  const active = currentTask(session);
  if (active) {
    setStatus(
      "task",
      `${prefix}${theme.fg("accent", "●")} ${theme.fg("dim", `subagent ${taskTitle(active.data.title)} · running`)}`,
    );
    return;
  }

  setStatus("task", undefined);
}

export function recordTaskSettled(
  pi: Pick<ExtensionAPI, "appendEntry">,
  session: ReadonlySessionLike,
  endedAt = Date.now(),
): void {
  const taskStart = currentTask(session);
  const assistant = findLastEntry(session, isAssistantMessageEntry);
  if (typeof taskStart?.data.startedAt !== "number" || !assistant) return;

  const latest = findLastEntry(session, isTaskSettledEntry);
  if (latest?.data.taskStartId === taskStart.id && latest.data.assistantEntryId === assistant.id) return;
  pi.appendEntry(TASK_SETTLED_ENTRY_TYPE, {
    taskStartId: taskStart.id,
    assistantEntryId: assistant.id,
    endedAt,
  } satisfies TaskSettledData);
}

type CommandOptions = Omit<RegisteredCommand, "name" | "sourceInfo">;

type PushTaskAPI = Pick<ExtensionAPI, "appendEntry">;

interface AutoCommandAPI extends TaskCommandAPI {
  on: ExtensionAPI["on"];
}

type TaskStatusTheme = Pick<Theme, "fg">;

type TaskStatusOptions = {
  prefix?: string;
};

type PushTaskParams = Static<typeof pushTaskParameters>;

type TaskActionOptions = {
  statusPrefix?: string;
  modelArg?: string;
};

function lastAssistantWasAborted(session: ReadonlySessionLike): boolean {
  const branch = session.getBranch();
  const last = branch[branch.length - 1];
  return (
    last?.type === "message" &&
    last.message.role === "assistant" &&
    last.message.stopReason === "aborted"
  );
}

async function startTask(
  pi: TaskCommandAPI,
  ctx: ExtensionCommandContext,
  options: TaskActionOptions = {},
): Promise<TaskActionResult> {
  const activeTask = pendingTask(ctx.sessionManager);
  if (!activeTask) {
    ctx.ui.notify("No pending task. Use push-task first.", "warning");
    return;
  }

  // ── Model switching ─────────────────────────────────────────────
  let previousModel: TaskStartData["previousModel"];
  const requestedModel = options.modelArg?.trim() || activeTask.data.model;
  if (requestedModel) {
    const matched = resolveModelPattern(requestedModel, ctx.modelRegistry);
    if (matched === null) {
      ctx.ui.notify(`No model matching "${requestedModel}".`, "warning");
      return;
    }
    if (matched === "ambiguous") {
      const names = matchModels(requestedModel, ctx.modelRegistry)
        .map((m) => `${m.provider}/${m.id}`)
        .join(", ");
      ctx.ui.notify(`Ambiguous model: matches ${names}.`, "warning");
      return;
    }

    const currentModel = ctx.model;
    if (currentModel) {
      previousModel = {
        provider: currentModel.provider,
        modelId: currentModel.id,
      };
    }

    const switched = await pi.setModel(matched);
    if (!switched) {
      ctx.ui.notify(
        `No API key configured for ${matched.provider}/${matched.id}.`,
        "warning",
      );
      return;
    }
  }

  // ── Task start ──────────────────────────────────────────────────
  const departureLeafId = ctx.sessionManager.getLeafId()!;
  const freshTargetId = findFreshTargetId(ctx.sessionManager);
  if (!freshTargetId) {
    ctx.ui.notify("No starting point found on current branch.", "warning");
    return;
  }

  const result = await ctx.navigateTree(freshTargetId, { summarize: false });
  if (result.cancelled) return "cancelled";

  const startEntryData: TaskStartData = {
    title: taskTitle(activeTask.data.title),
    returnTo: departureLeafId,
    startedAt: Date.now(),
  };
  if (previousModel) {
    startEntryData.previousModel = previousModel;
  }
  pi.appendEntry(TASK_START_ENTRY_TYPE, startEntryData);

  pi.sendUserMessage(activeTask.data.prompt);

  refreshTaskStatus(ctx, { prefix: options.statusPrefix });
}

async function discardTask(
  pi: TaskCommandAPI,
  ctx: ExtensionCommandContext,
): Promise<TaskActionResult> {
  const activeTask = pendingTask(ctx.sessionManager);
  if (!activeTask) {
    ctx.ui.notify("No pending task to discard.", "warning");
    return;
  }

  pi.appendEntry(TASK_DONE_ENTRY_TYPE, {});
  ctx.ui.notify("Task discarded.", "info");

  refreshTaskStatus(ctx);
}

async function finishTask(
  pi: TaskCommandAPI,
  ctx: ExtensionCommandContext,
  options: TaskActionOptions = {},
): Promise<TaskActionResult> {
  const taskStart = currentTask(ctx.sessionManager);
  if (!taskStart) {
    ctx.ui.notify("Not inside task, nothing to finish.", "warning");
    return;
  }

  // Capture last assistant message content before navigation. Only text blocks
  // are valid for custom_message content; provider-specific thinking/tool blocks
  // must not be replayed into the parent branch.
  const lastAssistant = findLastEntry(
    ctx.sessionManager,
    isAssistantMessageEntry,
  );
  const lastAssistantContent = lastAssistant
    ? taskResultTextContent(lastAssistant.message.content)
    : undefined;
  const lastAssistantId = lastAssistant?.id;

  const title = taskTitle(taskStart.data.title);
  const endedAt = taskSettledAt(ctx.sessionManager, taskStart) ?? Date.now();
  const durationMs = typeof taskStart.data.startedAt === "number"
    ? Math.max(0, endedAt - taskStart.data.startedAt)
    : undefined;

  const result = await ctx.navigateTree(taskStart.data.returnTo, {
    summarize: false,
  });
  if (result.cancelled) return "cancelled";

  // Inject last assistant message after navigation
  if (lastAssistantId && lastAssistantContent !== undefined) {
    pi.sendMessage(
      {
        customType: "task-result",
        // Content is filtered to only TextContent blocks (or original string)
        content: lastAssistantContent,
        display: true,
        details: { title, ...(durationMs !== undefined ? { durationMs } : {}) },
      },
      { triggerTurn: true },
    );
  }

  if (pendingTask(ctx.sessionManager)) {
    pi.appendEntry(TASK_DONE_ENTRY_TYPE, {});
  }

  const label = lastAssistantId
    ? "Last response attached."
    : "No last response to attach.";
  ctx.ui.notify(`Task finished. ${label}`, "info");

  await restorePreviousModel(pi, taskStart, ctx);

  refreshTaskStatus(ctx, { prefix: options.statusPrefix });
}

type TaskCommandAPI = Pick<
  ExtensionAPI,
  "appendEntry" | "sendMessage" | "sendUserMessage" | "setModel"
>;

async function abortTask(
  pi: TaskCommandAPI,
  ctx: ExtensionCommandContext,
): Promise<TaskActionResult> {
  const taskStart = currentTask(ctx.sessionManager);
  if (!taskStart) {
    ctx.ui.notify("Not inside task, nothing to abort.", "warning");
    return;
  }

  const result = await ctx.navigateTree(taskStart.data.returnTo, {
    summarize: false,
  });
  if (result.cancelled) return "cancelled";

  ctx.ui.notify("Task aborted. Branch abandoned without summary.", "info");

  await restorePreviousModel(pi, taskStart, ctx);

  refreshTaskStatus(ctx);
}

/** Restore the model that was active before a task started, if one was recorded. */
async function restorePreviousModel(
  pi: TaskCommandAPI,
  taskStart: TaskStartEntry,
  ctx: ExtensionCommandContext,
): Promise<void> {
  if (!taskStart.data.previousModel) return;

  const { provider, modelId } = taskStart.data.previousModel;
  const restoredModel = ctx.modelRegistry.find(provider, modelId);
  if (restoredModel) {
    if (!(await pi.setModel(restoredModel))) {
      ctx.ui.notify(
        `Failed to restore previous model ${provider}/${modelId}.`,
        "warning",
      );
    }
  } else {
    ctx.ui.notify(
      `Previous model ${provider}/${modelId} no longer available.`,
      "warning",
    );
  }
}

type TaskActionResult = "cancelled" | void;

function refreshTaskStatus(
  ctx: TaskStatusContext,
  options: TaskStatusOptions = {},
): void {
  if (ctx.hasUI) {
    updateTaskStatus(
      ctx.sessionManager,
      ctx.ui.setStatus.bind(ctx.ui),
      ctx.ui.theme,
      options,
    );
  }
}

type TaskStatusContext = Pick<
  ExtensionCommandContext,
  "hasUI" | "sessionManager" | "ui"
>;

/** Type guard: is the entry an assistant message with content? */
function isAssistantMessageEntry(
  entry: SessionEntry,
): entry is SessionMessageEntry & { message: { role: "assistant" } } {
  return entry.type === "message" && entry.message.role === "assistant";
}

/**
 * Find the target ID for navigating to a fresh context.
 * Returns the parent of the first model-visible entry, or the branch root as fallback.
 * Returns null if no valid target is found.
 */
function findFreshTargetId(session: ReadonlySessionLike): string | null {
  const branch = session.getBranch();
  if (branch.length === 0) return null;

  const firstVisible = findPreConversationEntry(session);
  if (firstVisible) {
    return firstVisible.parentId ?? firstVisible.id;
  }

  // Fallback: use branch root's parent (or the root itself if no parent)
  return branch[0].parentId ?? branch[0].id;
}

/**
 * Find the first model-visible entry on the current branch (closest to root).
 *
 * "Model-visible" means the entry participates in LLM context via buildSessionContext:
 * messages (user/assistant), compaction summaries, branch summaries, and custom messages.
 * Entries like thinking_level_change, model_change, custom (data-only), label, and
 * session_info are NOT visible — Pi may insert them before the conversation begins.
 *
 * Returns null if the branch has no model-visible entries (e.g., only non-visible setup
 * entries) or if there is no leaf.
 */
function findPreConversationEntry(
  session: ReadonlySessionLike,
): SessionEntry | null {
  if (!session.getLeafId()) return null;

  const branch = session.getBranch();
  for (const entry of branch) {
    if (
      entry.type === "message" ||
      entry.type === "compaction" ||
      entry.type === "branch_summary" ||
      entry.type === "custom_message"
    ) {
      return entry;
    }
  }

  return null;
}

// ── Lookup utilities ──────────────────────────────────────────────

function pendingTask(session: ReadonlySessionLike): TaskEntry | null {
  const branch = session.getBranch();
  let skip = 0;

  for (let i = branch.length - 1; i >= 0; i--) {
    const entry = branch[i];
    if (entry.type === "custom" && entry.customType === TASK_START_ENTRY_TYPE) {
      return null;
    }
    if (entry.type === "custom" && entry.customType === TASK_DONE_ENTRY_TYPE) {
      skip++;
      continue;
    }
    if (isTaskEntry(entry)) {
      if (skip === 0) return entry;
      skip--;
    }
  }

  return null;
}

const TASK_DONE_ENTRY_TYPE = "task-done";

function currentTask(session: ReadonlySessionLike): TaskStartEntry | null {
  return findLastEntry(session, isTaskStartEntry) ?? null;
}

function taskSettledAt(session: ReadonlySessionLike, taskStart: TaskStartEntry): number | undefined {
  const settled = [...session.getBranch()]
    .reverse()
    .find((entry): entry is TaskSettledEntry => isTaskSettledEntry(entry) && entry.data.taskStartId === taskStart.id);
  return settled?.data.endedAt;
}

function findLastEntry<T extends SessionEntry>(
  session: ReadonlySessionLike,
  predicate: (entry: SessionEntry) => entry is T,
): T | undefined {
  const branch = session.getBranch();
  for (let i = branch.length - 1; i >= 0; i--) {
    const entry = branch[i];
    if (predicate(entry)) return entry;
  }
  return undefined;
}

/**
 * Minimal read-only session interface needed by lookup functions.
 * Compatible with both ReadonlySessionManager (from ExtensionCommandContext)
 * and SessionManager (full mutable version).
 */
interface ReadonlySessionLike {
  getLeafId(): string | null;
  getBranch(): SessionEntry[];
}

function isTaskEntry(entry: SessionEntry): entry is TaskEntry {
  return isCustomEntry(entry, TASK_ENTRY_TYPE, isTaskData);
}

type TaskEntry = CustomEntry<typeof TASK_ENTRY_TYPE, TaskData>;

const TASK_ENTRY_TYPE = "task";

function isTaskData(value: unknown): value is TaskData {
  return (
    isRecord(value) &&
    typeof value.prompt === "string" &&
    (value.title === undefined || typeof value.title === "string") &&
    (value.role === undefined || typeof value.role === "string") &&
    (value.model === undefined || typeof value.model === "string")
  );
}

interface TaskData {
  title?: string;
  prompt: string;
  role?: string;
  model?: string;
}

function isTaskStartEntry(entry: SessionEntry): entry is TaskStartEntry {
  return isCustomEntry(entry, TASK_START_ENTRY_TYPE, isTaskStartData);
}

type TaskStartEntry = CustomEntry<typeof TASK_START_ENTRY_TYPE, TaskStartData>;

const TASK_START_ENTRY_TYPE = "task-start";

function isCustomEntry<TCustomType extends string, TData>(
  entry: SessionEntry,
  customType: TCustomType,
  isData: (value: unknown) => value is TData,
): entry is CustomEntry<TCustomType, TData> {
  return (
    entry.type === "custom" &&
    entry.customType === customType &&
    isData(entry.data)
  );
}

type CustomEntry<TCustomType extends string, TData> = SessionEntry & {
  type: "custom";
  customType: TCustomType;
  data: TData;
};

function isTaskStartData(value: unknown): value is TaskStartData {
  if (
    !isRecord(value) ||
    typeof value.returnTo !== "string" ||
    (value.title !== undefined && typeof value.title !== "string") ||
    (value.startedAt !== undefined && (typeof value.startedAt !== "number" || !Number.isFinite(value.startedAt)))
  ) {
    return false;
  }
  if (value.previousModel !== undefined) {
    return (
      isRecord(value.previousModel) &&
      typeof value.previousModel.provider === "string" &&
      typeof value.previousModel.modelId === "string"
    );
  }
  return true;
}

interface TaskStartData {
  title?: string;
  returnTo: string;
  startedAt?: number;
  previousModel?: { provider: string; modelId: string };
}

function isTaskSettledEntry(entry: SessionEntry): entry is TaskSettledEntry {
  return isCustomEntry(entry, TASK_SETTLED_ENTRY_TYPE, isTaskSettledData);
}

type TaskSettledEntry = CustomEntry<typeof TASK_SETTLED_ENTRY_TYPE, TaskSettledData>;

const TASK_SETTLED_ENTRY_TYPE = "task-settled";

interface TaskSettledData {
  taskStartId: string;
  assistantEntryId: string;
  endedAt: number;
}

function isTaskSettledData(value: unknown): value is TaskSettledData {
  return isRecord(value) &&
    typeof value.taskStartId === "string" &&
    typeof value.assistantEntryId === "string" &&
    typeof value.endedAt === "number" &&
    Number.isFinite(value.endedAt);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Normalize an optional title to a non-empty display string. */
function taskTitle(title?: string): string {
  return title || "untitled";
}

/** Case-insensitive substring match of `pattern` against each available model's id, name, or provider/id. */
function matchModels(pattern: string, registry: ModelRegistry): Model<Api>[] {
  const lower = pattern.toLowerCase();
  return registry
    .getAvailable()
    .filter(
      (m) =>
        m.id.toLowerCase().includes(lower) ||
        m.name.toLowerCase().includes(lower) ||
        `${m.provider}/${m.id}`.toLowerCase().includes(lower),
    );
}

/**
 * Resolve a model pattern to a single model, null (no match), or "ambiguous".
 *
 * Matching order:
 * 1. If pattern contains "/": split as provider/modelId, try exact lookup.
 *    Falls through to substring matching even if the exact lookup fails.
 * 2. Substring, case-insensitive match against each available model's
 *    id, name, and provider/id.
 */
function resolveModelPattern(
  pattern: string,
  registry: ModelRegistry,
): Model<Api> | "ambiguous" | null {
  if (pattern.includes("/")) {
    const slashIdx = pattern.indexOf("/");
    const found = registry.find(
      pattern.slice(0, slashIdx),
      pattern.slice(slashIdx + 1),
    );
    if (found) return found;
  }

  const matches = matchModels(pattern, registry);
  if (matches.length === 0) return null;
  if (matches.length > 1) return "ambiguous";
  return matches[0];
}

/**
 * Autocompletion for /start-task model argument, mirroring the /model
 * command: label is the model id, description is the provider, and value
 * is provider/id (what gets typed and resolved). Returns up to 20 items.
 */
function getModelCompletions(
  argumentPrefix: string,
  registry: ModelRegistry,
): AutocompleteItem[] {
  return matchModels(argumentPrefix, registry)
    .slice(0, 20)
    .map((m) => ({
      value: `${m.provider}/${m.id}`,
      label: m.id,
      description: m.provider,
    }));
}

const pushTaskParameters = Type.Object({
  title: Type.String({
    description:
      "Short task title shown in status, results, and tool rendering.",
  }),
  prompt: Type.String({
    description:
      "Minimal self-contained task brief: goal, scoped paths or current state, constraints, acceptance checks, and expected output.",
  }),
  role: Type.Optional(
    Type.String({
      description:
        "Optional concise role label, such as explore, review, or test.",
    }),
  ),
  model: Type.Optional(
    Type.String({
      description:
        "Optional model pattern selected when /start-task begins this task.",
    }),
  ),
});

let modelRegistry: ModelRegistry | undefined;

export function setModelRegistry(mr: ModelRegistry): void {
  modelRegistry = mr;
}
