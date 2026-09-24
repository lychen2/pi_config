import { randomUUID } from "node:crypto";
import { readFile, readlink } from "node:fs/promises";
import { basename } from "node:path";
import { performance } from "node:perf_hooks";
import { createBashToolDefinition, type ToolDefinition } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, type Component } from "@earendil-works/pi-tui";

const MARKER = "PI_TOOL_RAILS_SLEEP_ID";
const POLL_MS = 250;
export type SleepProcess = { key: string; seconds: number };
type Wait = SleepProcess & { since: number };
type ActiveCall = { token: string; waits: Wait[]; invalidate?: () => void };

/** Accept finite GNU/POSIX sleep operands, including multiple additive durations. */
export function sleepSeconds(args: readonly string[]): number | undefined {
  const operands = args[0] === "--" ? args.slice(1) : args;
  if (!operands.length) return undefined;
  let total = 0;
  for (const operand of operands) {
    const match = /^(\d+(?:\.\d*)?|\.\d+)([smhd]?)$/.exec(operand);
    if (!match) return undefined;
    total += Number(match[1]) * ({ s: 1, m: 60, h: 3600, d: 86400 }[match[2]] ?? 1);
  }
  return Number.isFinite(total) && total > 0 ? total : undefined;
}

/** Read only descendants of this Pi process; never inspect unrelated processes. */
export async function scanSleeps(tokens: ReadonlySet<string>, rootPid = process.pid): Promise<Map<string, SleepProcess[]>> {
  const found = new Map<string, SleepProcess[]>();
  const seen = new Set<number>();
  async function visit(pid: number): Promise<void> {
    if (seen.has(pid)) return;
    seen.add(pid);
    const root = `/proc/${pid}`;
    try {
      const children = await readFile(`${root}/task/${pid}/children`, "utf8");
      await Promise.all(children.trim().split(/\s+/).filter(Boolean).map((child) => visit(Number(child))));
    } catch { /* Process exit, restricted procfs, or unsupported platform. */ }
    if (pid === rootPid) return;
    try {
      if ((await readFile(`${root}/comm`, "utf8")).trim() !== "sleep") return;
      if (basename(await readlink(`${root}/exe`)) !== "sleep") return;
      const env = await readFile(`${root}/environ`, "utf8");
      const token = env.split("\0").find((item) => item.startsWith(`${MARKER}=`))?.slice(MARKER.length + 1);
      if (!token || !tokens.has(token)) return;
      const argv = (await readFile(`${root}/cmdline`, "utf8")).split("\0");
      if (argv.at(-1) === "") argv.pop();
      const seconds = sleepSeconds(argv.slice(1));
      if (seconds === undefined) return;
      const stat = await readFile(`${root}/stat`, "utf8");
      const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
      if (fields[0] === "Z") return;
      const key = `${pid}:${fields[19]}:${JSON.stringify(argv)}`;
      const waits = found.get(token) ?? [];
      waits.push({ key, seconds });
      found.set(token, waits);
    } catch { /* A disappearing process must never affect command execution. */ }
  }
  await visit(rootPid);
  return found;
}

function duration(seconds: number): string {
  const rounded = Math.max(0, Math.ceil(seconds));
  if (rounded < 60) return `${rounded}s`;
  return `${Math.floor(rounded / 60)}m${String(rounded % 60).padStart(2, "0")}s`;
}

export function sleepProgressLine(seconds: number, elapsed: number, width: number, count = 1): string {
  const fraction = Math.max(0, Math.min(1, elapsed / seconds));
  const label = `sleep${count > 1 ? ` ×${count}` : ""}`;
  const remaining = Math.max(0, seconds - elapsed);
  const detail = remaining > 0 ? `约剩 ${duration(remaining)} / ${duration(seconds)}` : "等待进程结束";
  const percent = Math.min(99, Math.floor(fraction * 100));
  const barWidth = Math.min(20, Math.max(0, width - 42));
  const filled = Math.floor(fraction * barWidth);
  const bar = barWidth >= 8 ? ` [${"━".repeat(filled)}${"─".repeat(barWidth - filled)}]` : "";
  return truncateToWidth(`${label}${bar} ${percent}% · ${detail}`, Math.max(0, width));
}

export class SleepProgress {
  private calls = new Map<string, ActiveCall>();
  private timer?: ReturnType<typeof setInterval>;
  private scanning = false;
  private scan: typeof scanSleeps;
  private now: () => number;
  constructor(scan = scanSleeps, now = () => performance.now()) {
    this.scan = scan;
    this.now = now;
  }

  start(id: string): string {
    const token = randomUUID();
    this.calls.set(id, { token, waits: [] });
    if (!this.timer) {
      this.timer = setInterval(() => { void this.poll(); }, POLL_MS);
      this.timer.unref();
    }
    return token;
  }

  async poll(): Promise<void> {
    if (this.scanning || !this.calls.size) return;
    this.scanning = true;
    try {
      const found = await this.scan(new Set([...this.calls.values()].map((call) => call.token)));
      const now = this.now();
      for (const call of this.calls.values()) {
        const previous = call.waits;
        // Do not use /proc starttime for elapsed time: the shell can exec sleep
        // in place, retaining the shell's earlier birth time. First observation
        // gives a bounded polling delay without counting preceding commands.
        call.waits = (found.get(call.token) ?? []).map((wait) => ({
          ...wait, since: previous.find((item) => item.key === wait.key)?.since ?? now,
        }));
        if (previous.length || call.waits.length) call.invalidate?.();
      }
    } catch { /* UI monitoring is best effort and must never reject a tool call. */ }
    finally { this.scanning = false; }
  }

  stop(id: string): void {
    const call = this.calls.get(id);
    this.calls.delete(id);
    call?.invalidate?.();
    if (!this.calls.size && this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  dispose(): void {
    for (const id of this.calls.keys()) this.stop(id);
  }

  component(id: string, base: Component, invalidate: () => void, color: (text: string) => string): Component {
    const call = this.calls.get(id);
    if (call) call.invalidate = invalidate;
    return {
      invalidate: () => base.invalidate(),
      render: (width) => {
        const lines = base.render(width);
        const current = this.calls.get(id);
        if (!current) return lines;
        current.invalidate = invalidate;
        // Parallel waits get one row; show the longest remaining observed wait.
        const now = this.now();
        const waits = current.waits.map((wait) => ({ ...wait, elapsed: (now - wait.since) / 1000 }));
        waits.sort((a, b) => (b.seconds - b.elapsed) - (a.seconds - a.elapsed));
        const wait = waits[0];
        return wait ? [...lines, color(sleepProgressLine(wait.seconds, wait.elapsed, width, waits.length))] : lines;
      },
    };
  }
}

/** Keep native execution, cancellation, timeout and result handling unchanged. */
export function createSleepProgressBash(
  cwd: string,
  progress: SleepProgress,
  decorate: (tool: ToolDefinition<any, any, any>) => ToolDefinition<any, any, any>,
): ToolDefinition<any, any, any> {
  const native = createBashToolDefinition(cwd);
  const monitoredTool: typeof native = {
    ...native,
    async execute(id, args, signal, onUpdate, ctx) {
      if (process.platform !== "linux") return native.execute(id, args, signal, onUpdate, ctx);
      const token = progress.start(id);
      try {
        const monitored = createBashToolDefinition(cwd, {
          spawnHook: (spawn) => ({ ...spawn, env: { ...spawn.env, [MARKER]: token } }),
        });
        return await monitored.execute(id, args, signal, onUpdate, ctx);
      } finally { progress.stop(id); }
    },
  };
  const tool = decorate(monitoredTool);
  return {
    ...tool,
    renderCall(args, theme, context) {
      // The last component is our wrapper, not the delegate's Text component.
      const base = tool.renderCall!(args, theme, { ...context, lastComponent: undefined });
      return progress.component(context.toolCallId, base, context.invalidate, (text) => theme.fg("muted", text));
    },
  };
}
