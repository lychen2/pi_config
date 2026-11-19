import { spawn } from "node:child_process";
import { constants } from "node:os";
import { Type } from "typebox";
import { createBashToolDefinition, getShellConfig, SettingsManager, type BashOperations, type ExtensionAPI } from "@earendil-works/pi-coding-agent";

const DEFAULT_YIELD_MS = 30_000;
const MAX_CAPTURE_BYTES = 1024 * 1024;
type BackgroundInfo = { id: string; pid: number; stdoutFile: string; stderrFile: string };
type AdoptResult = { ok: true; info: BackgroundInfo } | { ok: false; error: string };

export function registerBashBackground(pi: ExtensionAPI, yieldMs = DEFAULT_YIELD_MS): void {
  let shellPath: string | undefined;
  let commandPrefix: string | undefined;
  let native = createBashToolDefinition(process.cwd());
  pi.on("session_start", (_event, ctx) => {
    const settings = SettingsManager.create(ctx.cwd);
    shellPath = settings.getShellPath();
    commandPrefix = settings.getShellCommandPrefix();
    native = createBashToolDefinition(ctx.cwd, { shellPath, commandPrefix });
  });
  pi.registerTool({
    ...native,
    description: `${native.description} Commands still running after ${yieldMs / 1000} seconds continue in the background through process. The result reports status=background and process_id; inspect or stop that process instead of rerunning the command. Explicit timeout still terminates the command.`,
    outputSchema: Type.Object({
      output: Type.String(), truncated: Type.Boolean(), full_output_path: Type.Optional(Type.String()),
      exit_code: Type.Union([Type.Number(), Type.Null()]), wall_time_seconds: Type.Number(),
      status: Type.Optional(Type.Literal("background")), process_id: Type.Optional(Type.String()),
      pid: Type.Optional(Type.Number()), stdout_file: Type.Optional(Type.String()), stderr_file: Type.Optional(Type.String()),
    }),
    async execute(id, params, signal, onUpdate, ctx) {
      // The protocol replies synchronously. Keep Pi's backend when processes is absent.
      let available = false;
      pi.events.emit("processes:request:config", { reply: () => { available = true; } });
      if (!available || process.platform === "win32") return native.execute(id, params, signal, onUpdate, ctx);
      let background: BackgroundInfo | undefined;
      const operations = createBackgroundOperations(pi, yieldMs, (info) => { background = info; }, shellPath);
      const tool = createBashToolDefinition(ctx.cwd, { operations, commandPrefix });
      const result = await tool.execute(id, params, signal, onUpdate, ctx);
      if (!background) return result;
      const info: BackgroundInfo = background;
      const notice = `Command continues in background: ${info.id} (PID ${info.pid}). Use process output/stop with this id. Completion notifications are enabled.\nstdout: ${info.stdoutFile}\nstderr: ${info.stderrFile}`;
      return {
        ...result,
        content: [...result.content, { type: "text" as const, text: notice }],
        details: { ...result.details, background: info },
        structuredContent: {
          ...(result.structuredContent as Record<string, unknown>), exit_code: null, status: "background", process_id: info.id,
          pid: info.pid, stdout_file: info.stdoutFile, stderr_file: info.stderrFile,
        },
      };
    },
  });
}

function createBackgroundOperations(pi: ExtensionAPI, yieldMs: number, onBackground: (info: BackgroundInfo) => void, shellPath?: string): BashOperations {
  return {
    exec(command, cwd, { onData, signal, timeout, env }) {
      if (signal?.aborted) return Promise.reject(new Error("aborted"));
      if (timeout !== undefined && (!Number.isFinite(timeout) || timeout <= 0 || timeout * 1000 > 2_147_483_647)) {
        return Promise.reject(new Error("Invalid timeout: must be positive and within the timer range"));
      }
      return new Promise((resolve, reject) => {
        const shell = getShellConfig(shellPath);
        const startTime = Date.now();
        const child = spawn(shell.shell, [...shell.args, command], { cwd, env, detached: true, stdio: ["ignore", "pipe", "pipe"] });
        let handedOff = false;
        let settled = false;
        let timedOut = false;
        let stdout = Buffer.alloc(0);
        let stderr = Buffer.alloc(0);
        const capture = (previous: Buffer, chunk: Buffer) => Buffer.concat([previous, chunk]).subarray(-MAX_CAPTURE_BYTES);
        const out = (chunk: Buffer) => { stdout = capture(stdout, chunk); onData(chunk); };
        const err = (chunk: Buffer) => { stderr = capture(stderr, chunk); onData(chunk); };
        child.stdout.on("data", out);
        child.stderr.on("data", err);
        const kill = () => {
          if (!child.pid) return;
          try { process.kill(-child.pid, "SIGKILL"); } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
          }
        };
        const onAbort = () => kill();
        signal?.addEventListener("abort", onAbort, { once: true });
        const timeoutTimer = timeout === undefined ? undefined : setTimeout(() => { timedOut = true; kill(); }, timeout * 1000);
        const yieldTimer = setTimeout(() => {
          if (settled || signal?.aborted || timedOut) return;
          let adoption: AdoptResult | undefined;
          pi.events.emit("processes:command:adopt", {
            name: `bash-${child.pid}`, command, cwd, child, startTime,
            initialStdout: stdout, initialStderr: stderr,
            reply: (result: AdoptResult) => { adoption = result; },
          });
          if (!adoption?.ok) return;
          handedOff = true;
          settled = true;
          child.stdout.removeListener("data", out);
          child.stderr.removeListener("data", err);
          stdout = Buffer.alloc(0);
          stderr = Buffer.alloc(0);
          signal?.removeEventListener("abort", onAbort);
          onBackground(adoption.info);
          // The wrapper replaces this internal exit value with null and a background status.
          resolve({ exitCode: 0 });
        }, yieldMs);
        const cleanup = () => {
          clearTimeout(yieldTimer);
          clearTimeout(timeoutTimer);
          signal?.removeEventListener("abort", onAbort);
        };
        child.once("error", (error) => { cleanup(); if (!settled) { settled = true; reject(error); } });
        child.once("close", (code, killedBy) => {
          cleanup();
          if (handedOff || settled) return;
          settled = true;
          if (signal?.aborted) reject(new Error("aborted"));
          else if (timedOut) reject(new Error(`timeout:${timeout}`));
          else resolve({ exitCode: code ?? (killedBy ? 128 + constants.signals[killedBy] : null) });
        });
      });
    },
  };
}
