import { execSync } from "node:child_process";
import { log } from "./log.ts";

type Protocol = "kitty" | "iterm2" | "ascii";

/**
 * Check whether tmux has `allow-passthrough` enabled.
 * Queries the running tmux server — requires being inside a tmux session.
 */
export function checkTmuxPassthrough(): boolean {
  try {
    const out = execSync("tmux show-options -g allow-passthrough", {
      encoding: "utf-8",
      timeout: 2000,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const enabled = /allow-passthrough\s+(on|all)/.test(out);
    log(`tmux: allow-passthrough → ${enabled ? "on" : "off"}`);
    return enabled;
  } catch {
    log("tmux: allow-passthrough check failed (option unset or command error)");
    return false;
  }
}

/**
 * Detect the outer terminal's image protocol by querying tmux's environment.
 *
 * Uses `tmux show-environment TERM_PROGRAM` (session-level, updated on attach)
 * with a fallback to global (`-g`). This is more reliable than sniffing
 * `process.env` which contains leaked vars from the terminal that started
 * the tmux server, not the currently attached terminal.
 */
export function detectOuterTerminal(): Protocol {
  const termProgram = queryTmuxEnv("TERM_PROGRAM");
  if (!termProgram) {
    log("tmux: could not detect outer TERM_PROGRAM");
    return "ascii";
  }

  log(`tmux: outer TERM_PROGRAM="${termProgram}"`);
  const name = termProgram.toLowerCase();

  if (name === "ghostty" || name === "kitty") return "kitty";
  if (name === "iterm.app") return "iterm2";
  if (name === "wezterm") return "iterm2";

  log(`tmux: unknown outer terminal "${termProgram}", falling back to ascii`);
  return "ascii";
}

/**
 * Query a variable from tmux's environment.
 * Tries session-level first (reflects current attachment),
 * falls back to global (server-level).
 */
function queryTmuxEnv(varName: string): string | null {
  // Session-level first
  const session = runTmuxShowEnv(varName, false);
  if (session) return session;

  // Global fallback
  return runTmuxShowEnv(varName, true);
}

function runTmuxShowEnv(varName: string, global: boolean): string | null {
  try {
    const flag = global ? "-g" : "";
    const cmd = `tmux show-environment ${flag} ${varName}`.replace(/\s+/g, " ").trim();
    const out = execSync(cmd, {
      encoding: "utf-8",
      timeout: 2000,
      stdio: ["pipe", "pipe", "pipe"],
    });
    // Output format: "VAR=value\n" or "-VAR\n" (if unset)
    const match = out.match(new RegExp(`^${varName}=(.+)$`, "m"));
    return match?.[1]?.trim() ?? null;
  } catch {
    return null;
  }
}

/**
 * Wrap an escape sequence in tmux DCS passthrough.
 *
 * tmux requires `allow-passthrough on` in tmux.conf.
 * Format: \x1bPtmux;<content>\x1b\\
 * Every \x1b inside <content> must be doubled to \x1b\x1b.
 */
export function wrapTmuxPassthrough(sequence: string): string {
  const escaped = sequence.replaceAll("\x1b", "\x1b\x1b");
  return `\x1bPtmux;${escaped}\x1b\\`;
}
