import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { CONFIG_DIR_NAME, getAgentDir, type ExtensionAPI } from "@earendil-works/pi-coding-agent";

type VerificationCommand = {
  command: string;
  args?: string[];
  cwd?: string;
  timeoutSeconds?: number;
};
type VerificationConfig = { commands: VerificationCommand[] };
type ToolCall = { toolName: string; input: Record<string, unknown> };

const CONFIG_NAME = "goal-verification.json";
const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_COMMANDS = 5;
const MAX_OUTPUT = 1_500;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readConfig(path: string): VerificationConfig | undefined {
  if (!existsSync(path)) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`Invalid goal verification config ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.commands)) throw new Error(`Goal verification config ${path} requires commands[]`);
  if (parsed.commands.length > MAX_COMMANDS) throw new Error(`Goal verification config ${path} allows at most ${MAX_COMMANDS} commands`);
  const commands = parsed.commands.map((entry, index): VerificationCommand => {
    if (!isRecord(entry) || typeof entry.command !== "string" || !entry.command.trim()) {
      throw new Error(`Goal verification command ${index + 1} in ${path} requires a non-empty command`);
    }
    if (entry.args !== undefined && (!Array.isArray(entry.args) || !entry.args.every((arg) => typeof arg === "string"))) {
      throw new Error(`Goal verification command ${index + 1} in ${path} has invalid args`);
    }
    if (entry.cwd !== undefined && (typeof entry.cwd !== "string" || !entry.cwd.trim())) {
      throw new Error(`Goal verification command ${index + 1} in ${path} has invalid cwd`);
    }
    if (entry.timeoutSeconds !== undefined && (typeof entry.timeoutSeconds !== "number" || !Number.isFinite(entry.timeoutSeconds) || entry.timeoutSeconds < 1 || entry.timeoutSeconds > 120)) {
      throw new Error(`Goal verification command ${index + 1} in ${path} requires timeoutSeconds between 1 and 120`);
    }
    return {
      command: entry.command.trim(),
      ...(entry.args ? { args: entry.args as string[] } : {}),
      ...(typeof entry.cwd === "string" ? { cwd: entry.cwd.trim() } : {}),
      ...(typeof entry.timeoutSeconds === "number" ? { timeoutSeconds: Math.floor(entry.timeoutSeconds) } : {}),
    };
  });
  return { commands };
}

function configFor(cwd: string, trusted: boolean): { path: string; config?: VerificationConfig } {
  const userPath = join(getAgentDir(), CONFIG_NAME);
  const projectPath = join(cwd, CONFIG_DIR_NAME, CONFIG_NAME);
  if (trusted && existsSync(projectPath)) return { path: projectPath, config: readConfig(projectPath) };
  return { path: userPath, config: readConfig(userPath) };
}

function shorten(value: string): string {
  const clean = value.trim();
  return clean.length <= MAX_OUTPUT ? clean : `${clean.slice(0, MAX_OUTPUT)}...`;
}

function commandLabel(command: VerificationCommand): string {
  return [command.command, ...(command.args ?? [])].join(" ");
}

function verificationCwd(root: string, configured?: string): string {
  const cwd = resolve(root, configured ?? ".");
  const rel = relative(root, cwd);
  if (rel.startsWith("..") || isAbsolute(rel)) throw new Error(`Verification cwd escapes the project root: ${configured}`);
  return cwd;
}
function isGoalCompleteCall(event: ToolCall): boolean {
  return event.toolName === "goal_complete" || event.toolName === "goal_complete:1";
}

export default function goalVerifier(pi: ExtensionAPI): void {
  pi.on("tool_call", async (event, ctx) => {
    if (!isGoalCompleteCall(event as ToolCall)) return;
    try {
      const { path, config } = configFor(ctx.cwd, ctx.isProjectTrusted());
    if (!config?.commands.length) return;

    const failures: string[] = [];
    const evidence: string[] = [];
    for (const command of config.commands) {
      const cwd = verificationCwd(ctx.cwd, command.cwd);
      const result = await pi.exec(command.command, command.args ?? [], {
        cwd,
        timeout: (command.timeoutSeconds ?? DEFAULT_TIMEOUT_MS / 1_000) * 1_000,
        signal: ctx.signal,
      });
      const output = shorten([result.stdout, result.stderr].filter(Boolean).join("\n"));
      const label = commandLabel(command);
      if (result.code !== 0 || result.killed) {
        failures.push(`${label} (exit ${result.code ?? "unknown"}${result.killed ? ", killed" : ""})${output ? `: ${output}` : ""}`);
      } else {
        evidence.push(`${label}: passed${output ? ` (${output})` : ""}`);
      }
    }

    if (failures.length) {
      return {
        block: true,
        reason: `Goal completion blocked by verification from ${path}:\n${failures.join("\n")}${evidence.length ? `\nPassed:\n${evidence.join("\n")}` : ""}`,
      };
    }
      if (ctx.hasUI) ctx.ui.notify(`Goal verification passed (${config.commands.length} command${config.commands.length === 1 ? "" : "s"})`, "info");
    } catch (error) {
      return {
        block: true,
        reason: `Goal completion blocked because verification could not run: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  });

  pi.registerCommand("goal-verify", {
    description: "Run configured Goal verification commands without completing a Goal",
    handler: async (_args, ctx) => {
      const { path, config } = configFor(ctx.cwd, ctx.isProjectTrusted());
      if (!config?.commands.length) {
        ctx.ui.notify(`No verification commands configured. Add ${path}`, "warning");
        return;
      }
      const lines: string[] = [];
      for (const command of config.commands) {
        const cwd = verificationCwd(ctx.cwd, command.cwd);
        const result = await pi.exec(command.command, command.args ?? [], {
          cwd,
          timeout: (command.timeoutSeconds ?? DEFAULT_TIMEOUT_MS / 1_000) * 1_000,
        });
        lines.push(`${result.code === 0 && !result.killed ? "PASS" : "FAIL"} ${commandLabel(command)}`);
      }
      ctx.ui.notify(lines.join("\n"), lines.every((line) => line.startsWith("PASS")) ? "info" : "error");
    },
  });
}
