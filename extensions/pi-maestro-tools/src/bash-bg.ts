import { createWriteStream, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, type ChildProcess } from "node:child_process";

import type { AgentToolResult } from "@earendil-works/pi-agent-core";
import { getShellConfig, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { toolFailure } from "./tool-error.ts";

const MAX_ACTIVE_JOBS = 16;
const MAX_LOG_BYTES = 16 * 1024 * 1024;
const MAX_TAIL_BYTES = 64 * 1024;
const TERMINATION_GRACE_MS = 1_000;

const BashBgParams = Type.Object({
  action: Type.Union([Type.Literal("run"), Type.Literal("start"), Type.Literal("status"), Type.Literal("wait"), Type.Literal("kill"), Type.Literal("list")]),
  command: Type.Optional(Type.String({ minLength: 1, description: "Shell command, required for run and start" })),
  jobId: Type.Optional(Type.String({ description: "Job identifier, required for status, wait, and kill" })),
  cwd: Type.Optional(Type.String({ description: "Working directory for run and start" })),
  timeout: Type.Optional(Type.Integer({ minimum: 1, maximum: 3600, description: "Seconds to wait for run or wait; default 30" })),
  tail: Type.Optional(Type.Integer({ minimum: 1, maximum: 500, description: "Output tail lines; default 20" })),
});

type BashBgParamsInput = {
  action: "run" | "start" | "status" | "wait" | "kill" | "list";
  command?: string;
  jobId?: string;
  cwd?: string;
  timeout?: number;
  tail?: number;
};

type Job = {
  id: string;
  command: string;
  cwd: string;
  child: ChildProcess;
  pid: number;
  logPath: string;
  startedAt: number;
  finishedAt?: number;
  exitCode: number | null;
  done: boolean;
  stopped: boolean;
  background: boolean;
  tail: string;
  outputBytes: number;
  logBytes: number;
  terminal: Promise<void>;
  settle: () => void;
};

function tailLines(job: Job, lines: number): string {
  const text = job.tail || (() => {
    try { return readFileSync(job.logPath, "utf8"); } catch { return ""; }
  })();
  const result = text.replace(/\r?\n$/, "").split("\n").slice(-lines).join("\n");
  return result || "(empty)";
}

function status(job: Job): string {
  if (!job.done) return job.stopped ? "stopping" : "running";
  if (job.stopped) return "killed";
  return job.exitCode === 0 ? "completed" : "failed";
}

function snapshot(job: Job, lines: number): string {
  return [
    `job ${job.id}: ${status(job)}${job.done ? ` (exit ${job.exitCode})` : ""}`,
    `pid: ${job.pid}`,
    `command: ${job.command}`,
    `cwd: ${job.cwd}`,
    `output (tail):`,
    tailLines(job, lines),
  ].join("\n");
}

function waitFor(job: Job, milliseconds: number, signal?: AbortSignal): Promise<"done" | "timeout" | "aborted"> {
  if (signal?.aborted) return Promise.resolve("aborted");
  if (job.done) return Promise.resolve("done");
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: "done" | "timeout" | "aborted"): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      resolve(result);
    };
    const onAbort = (): void => finish("aborted");
    const timer = setTimeout(() => finish("timeout"), milliseconds);
    signal?.addEventListener("abort", onAbort, { once: true });
    void job.terminal.then(() => finish("done"));
  });
}

async function terminate(job: Job): Promise<void> {
  if (job.done) return;
  job.stopped = true;
  if (process.platform === "win32") {
    const killer = spawn("taskkill", ["/pid", String(job.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
    await new Promise<void>((resolve) => killer.once("close", () => resolve()));
    return;
  }
  try { process.kill(-job.pid, "SIGTERM"); } catch { job.child.kill("SIGTERM"); }
  const result = await waitFor(job, TERMINATION_GRACE_MS);
  if (result === "timeout" && !job.done) {
    try { process.kill(-job.pid, "SIGKILL"); } catch { job.child.kill("SIGKILL"); }
  }
}

export function registerBashBg(pi: ExtensionAPI): void {
  const jobs = new Map<string, Job>();
  const logDir = mkdtempSync(join(tmpdir(), "pi-bash-bg-"));
  let counter = 0;

  const start = (command: string, cwd: string, background: boolean): Job => {
    const active = [...jobs.values()].filter((job) => !job.done).length;
    if (active >= MAX_ACTIVE_JOBS) throw new Error(`Too many active background jobs (${active}/${MAX_ACTIVE_JOBS}).`);

    const id = `bg-${(++counter).toString(36)}-${Date.now().toString(36)}`;
    const logPath = join(logDir, `${id}.log`);
    const shell = getShellConfig();
    const child = spawn(shell.shell, [...shell.args, command], {
      cwd,
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    const stream = createWriteStream(logPath, { mode: 0o600 });
    let settle!: () => void;
    const terminal = new Promise<void>((resolve) => { settle = resolve; });
    const job: Job = {
      id, command, cwd, child, pid: child.pid ?? -1, logPath, startedAt: Date.now(), exitCode: null,
      done: false, stopped: false, background, tail: "", outputBytes: 0, logBytes: 0, terminal, settle,
    };
    jobs.set(id, job);

    const append = (chunk: Buffer): void => {
      job.outputBytes += chunk.byteLength;
      if (job.logBytes < MAX_LOG_BYTES) {
        const retained = chunk.subarray(0, Math.max(0, MAX_LOG_BYTES - job.logBytes));
        stream.write(retained);
        job.logBytes += retained.byteLength;
      }
      job.tail += chunk.toString("utf8");
      if (job.tail.length > MAX_TAIL_BYTES) job.tail = job.tail.slice(-MAX_TAIL_BYTES);
    };
    const finish = (code: number | null): void => {
      if (job.done) return;
      job.done = true;
      job.exitCode = code;
      job.finishedAt = Date.now();
      stream.end();
      job.settle();
      if (job.background) {
        pi.sendMessage({
          customType: "bash-bg-complete",
          content: `Background bash job ${job.id} ${status(job)} (exit ${job.exitCode}).\ncommand: ${job.command}\noutput (tail):\n${tailLines(job, 20)}`,
          display: true,
          details: { jobId: job.id, exitCode: job.exitCode },
        }, { triggerTurn: true });
      }
    };
    child.stdout?.on("data", append);
    child.stderr?.on("data", append);
    child.once("error", (error) => { append(Buffer.from(`\n${error.message}\n`)); finish(-1); });
    child.once("exit", finish);
    child.unref();
    return job;
  };

  pi.registerTool({
    name: "bash_bg",
    label: "Background Bash",
    description: "Run shell commands with adaptive foreground/background execution. run waits up to timeout then backgrounds automatically; start backgrounds immediately; status, wait, kill, and list control jobs. Completion sends a new turn notification.",
    promptSnippet: "Use bash_bg only for unbounded or long-running commands. run waits then backgrounds automatically; status/wait/kill control jobs.",
    promptGuidelines: [
      "Use native bash for ordinary commands. Use bash_bg for dev servers, watchers, or commands expected to run for minutes.",
      "After a job backgrounds, wait for its completion message or call wait once; do not poll status repeatedly.",
    ],
    parameters: BashBgParams,
    async execute(_id, params: BashBgParamsInput, signal, _onUpdate, ctx): Promise<AgentToolResult<unknown>> {
      const tail = params.tail ?? 20;
      if (params.action === "list") {
        const text = jobs.size ? [...jobs.values()].map((job) => `${job.id}\t${status(job)}\tpid ${job.pid}\t${job.command}`).join("\n") : "No background jobs.";
        return { content: [{ type: "text", text }] } as AgentToolResult<unknown>;
      }
      if (params.action === "start" || params.action === "run") {
        if (!params.command) {
          return toolFailure("INVALID_ARGUMENT", `bash_bg ${params.action} requires command.`, { field: "command" });
        }
        const job = start(params.command, params.cwd || ctx.cwd, params.action === "start");
        if (params.action === "start") {
          return { content: [{ type: "text", text: `Started ${job.id} (pid ${job.pid}). Completion will send a notification.` }], details: { jobId: job.id } } as AgentToolResult<unknown>;
        }
        const outcome = await waitFor(job, (params.timeout ?? 30) * 1000, signal);
        if (outcome === "aborted") {
          await terminate(job);
          throw new Error("bash_bg run aborted and terminated.");
        }
        if (outcome === "done") return { content: [{ type: "text", text: snapshot(job, tail) }], details: { jobId: job.id } } as AgentToolResult<unknown>;
        job.background = true;
        return { content: [{ type: "text", text: `Still running after ${params.timeout ?? 30}s. Moved to background as ${job.id} (pid ${job.pid}). Completion will send a notification.` }], details: { jobId: job.id } } as AgentToolResult<unknown>;
      }
      if (!params.jobId) {
        return toolFailure("INVALID_ARGUMENT", `bash_bg ${params.action} requires jobId.`, { field: "jobId" });
      }
      const job = jobs.get(params.jobId);
      if (!job) {
        return toolFailure("NOT_FOUND", `Unknown bash_bg job: ${params.jobId}`, { field: "jobId" });
      }
      if (params.action === "status") return { content: [{ type: "text", text: snapshot(job, tail) }] } as AgentToolResult<unknown>;
      if (params.action === "kill") {
        await terminate(job);
        return { content: [{ type: "text", text: `Stopped ${job.id}.` }] } as AgentToolResult<unknown>;
      }
      const outcome = await waitFor(job, (params.timeout ?? 30) * 1000, signal);
      if (outcome === "aborted") throw new Error("bash_bg wait aborted.");
      return { content: [{ type: "text", text: snapshot(job, tail) }] } as AgentToolResult<unknown>;
    },
  });

  pi.on("session_shutdown", async () => {
    await Promise.all([...jobs.values()].filter((job) => !job.done).map(terminate));
    jobs.clear();
    rmSync(logDir, { recursive: true, force: true });
  });
}
