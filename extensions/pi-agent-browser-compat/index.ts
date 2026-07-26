import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const DISABLE_ENV = "PI_AGENT_BROWSER_COMPAT_DISABLE";
const TOOL_NAME = "agent_browser";
const EXCLUSIVE_MODE_FIELDS = [
  "semanticAction",
  "job",
  "qa",
  "sourceLookup",
  "networkSourceLookup",
  "electron",
] as const;

function supportsStdin(args: string[]): boolean {
  if (args.includes("batch")) return true;

  const evalIndex = args.indexOf("eval");
  if (evalIndex >= 0 && args.slice(evalIndex + 1).includes("--stdin")) return true;

  const authIndex = args.indexOf("auth");
  const saveIndex = authIndex >= 0 ? args.indexOf("save", authIndex + 1) : -1;
  return saveIndex >= 0 && args.slice(saveIndex + 1).includes("--password-stdin");
}

export function normalizeAgentBrowserInput(input: unknown): boolean {
  if (!input || typeof input !== "object" || Array.isArray(input)) return false;
  const browserInput = input as Record<string, unknown>;
  const args = browserInput.args;
  if (!Array.isArray(args) || args.length === 0 || !args.every((value) => typeof value === "string")) return false;

  let changed = false;
  let hadConflictingMode = false;
  let removedUnsupportedStdin = false;
  for (const field of EXCLUSIVE_MODE_FIELDS) {
    if (!Object.hasOwn(browserInput, field)) continue;
    delete browserInput[field];
    changed = true;
    hadConflictingMode = true;
  }

  if (Object.hasOwn(browserInput, "stdin") && !supportsStdin(args)) {
    delete browserInput.stdin;
    changed = true;
    removedUnsupportedStdin = true;
  }

  if (hadConflictingMode || removedUnsupportedStdin) {
    if (Object.hasOwn(browserInput, "outputPath")) {
      delete browserInput.outputPath;
      changed = true;
    }
    if (Object.hasOwn(browserInput, "timeoutMs")) {
      delete browserInput.timeoutMs;
      changed = true;
    }
    if (browserInput.sessionMode === "auto") {
      delete browserInput.sessionMode;
      changed = true;
    }
  }

  return changed;
}

export default function agentBrowserCompat(pi: ExtensionAPI): void {
  if (process.env[DISABLE_ENV] === "1") return;

  pi.on("tool_call", (event) => {
    if (event.toolName !== TOOL_NAME) return;
    normalizeAgentBrowserInput(event.input);
  });
}
