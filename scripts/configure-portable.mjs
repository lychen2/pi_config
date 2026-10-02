import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

// Templates seed new machines; existing values (including credentials and /mcp choices) win.
function merge(template, current) {
  const result = { ...template };
  for (const [key, value] of Object.entries(current)) {
    result[key] = value && typeof value === "object" && !Array.isArray(value) &&
      result[key] && typeof result[key] === "object" && !Array.isArray(result[key])
      ? merge(result[key], value) : value;
  }
  return result;
}

export function configurePortable({ repoDir, agentDir, homeDir = homedir(), xdgConfigHome = process.env.XDG_CONFIG_HOME, customAgentDir = Boolean(process.env.PI_CODING_AGENT_DIR), dryRun = false }) {
  const webRoot = customAgentDir ? agentDir : xdgConfigHome ? join(xdgConfigHome, "pi") : join(homeDir, ".pi");
  const targets = [
    ["models-public.json", join(agentDir, "models.json")],
    ["mcp-public.json", join(agentDir, "mcp.json")],
    ["web-search-public.json", join(webRoot, "web-search.json")],
    ["tool-selector-public.json", join(homeDir, ".pi", "tool-selector.json")],
  ];
  for (const [source, target] of targets) {
    const template = JSON.parse(readFileSync(join(repoDir, "config", source), "utf8"));
    if (source === "mcp-public.json") {
      template.mcpServers["obsidian-files"].args = template.mcpServers["obsidian-files"].args.map(arg => arg.replace("${HOME}", homeDir));
    }
    const current = existsSync(target) ? JSON.parse(readFileSync(target, "utf8")) : {};
    const next = JSON.stringify(merge(template, current), null, 2) + "\n";
    if (dryRun) {
      console.log(`  merge public ${source} -> ${target}`);
    } else {
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, next, { mode: 0o600 });
    }
  }
}
