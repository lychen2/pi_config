import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const SKILL_PATH = join(homedir(), ".pi/agent/skills/i-have-adhd/SKILL.md");
const ENTRY_TYPE = "adhd-mode";

let enabled = true;
let cachedBody: string | null = null;

async function loadSkillBody(): Promise<string> {
  if (cachedBody) return cachedBody;
  const raw = await readFile(SKILL_PATH, "utf8");
  // Strip YAML frontmatter (--- ... ---)
  const body = raw.replace(/^---[\s\S]*?---\s*/, "").trim();
  cachedBody = body;
  return body;
}

export default function adhdMode(pi: ExtensionAPI) {
  // Restore state from previous session entries on startup
  pi.on("session_start", async (_event, ctx) => {
    for (const entry of ctx.sessionManager.getEntries()) {
      if (entry.type === "custom" && entry.customType === ENTRY_TYPE) {
        enabled = (entry.data as { enabled?: boolean })?.enabled ?? true;
      }
    }
  });

  // Inject ADHD rules into system prompt every turn
  pi.on("before_agent_start", async (event) => {
    if (!enabled) return undefined;

    const body = await loadSkillBody();
    return {
      systemPrompt:
        event.systemPrompt +
        "\n\n" +
        body,
    };
  });

  // Toggle command
  pi.registerCommand("adhd", {
    description: "Toggle ADHD output mode (auto-injected)",
    handler: async (_args, ctx) => {
      enabled = !enabled;
      pi.appendEntry(ENTRY_TYPE, { enabled });
      ctx.ui.notify(
        enabled ? "ADHD mode enabled" : "ADHD mode disabled",
        "info",
      );
    },
  });
}
