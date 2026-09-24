import { copyFileSync, existsSync, readFileSync, writeFileSync, constants } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Change only this profile's browser exposure; preserve commands, credentials and other servers.
export function proxyBrowser(config) {
  const server = config.mcpServers?.["zen-browser"];
  if (!server) return config;
  return {
    ...config,
    mcpServers: {
      ...config.mcpServers,
      "zen-browser": { ...server, directTools: false, lifecycle: "lazy-keep-alive" },
    },
  };
}

export function configureMcpProxy(agentDir, { dryRun = false } = {}) {
  const path = join(agentDir, "mcp.json");
  if (!existsSync(path)) return false;
  const original = readFileSync(path, "utf8");
  const current = JSON.parse(original);
  const next = proxyBrowser(current);
  if (JSON.stringify(current) === JSON.stringify(next)) return false;
  if (dryRun) { console.log("Would configure Zen browser through the lazy MCP proxy"); return true; }
  const backup = `${path}.pre-proxy-${Date.now()}`;
  copyFileSync(path, backup, constants.COPYFILE_EXCL);
  writeFileSync(path, JSON.stringify(next, null, 2) + "\n", { mode: 0o600 });
  console.log(`Configured lazy MCP proxy; backup: ${backup}`);
  return true;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.some(arg => arg !== "--dry-run")) throw new Error("Usage: node scripts/configure-mcp-proxy.mjs [--dry-run]");
  configureMcpProxy(resolve(process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent")), { dryRun: args.includes("--dry-run") });
}
