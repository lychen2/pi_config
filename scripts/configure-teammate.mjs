import { existsSync, readFileSync, writeFileSync, copyFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const teammateConfigPath = new URL("../extensions/pi-context-bridge/teammate-config.json", import.meta.url);
const teammateConfig = JSON.parse(readFileSync(teammateConfigPath, "utf8"));
if (typeof teammateConfig.model !== "string" || !teammateConfig.model.includes("/") || typeof teammateConfig.profile?.id !== "string" || typeof teammateConfig.profile?.name !== "string") {
  throw new Error("teammate-config.json must define model and profile id/name");
}

export function configureTeammate(agentDir, { dryRun = false } = {}) {
  const path = join(agentDir, "teammate-models.json");
  const current = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : { version: 3, profiles: {} };
  if (current.version !== 3) throw new Error("Migrate teammate-models.json to v3 before configuring the teammate profile");
  const { model, profile: { id, name } } = teammateConfig;
  const types = ["explore", "analysis", "debug", "planning", "development", "review", "testing"];
  const roles = ["general", "explorer", "analyst", "planner", "research", "verifier", "workflow"];
  const next = { ...current, defaultProfile: id, profiles: {
    ...current.profiles,
    [id]: {
      name, mappings: Object.fromEntries(types.map(type => [type, model])),
      fallbackMappings: Object.fromEntries(types.map(type => [type, []])), thinkingLevels: {},
      roleMappings: Object.fromEntries(roles.map(role => [role, { model, fallbackModels: [] }])),
    },
  } };
  const text = JSON.stringify(next, null, 2) + "\n";
  if (existsSync(path) && readFileSync(path, "utf8") === text) return;
  if (dryRun) { console.log(`Would configure teammate profile ${id}: ${path}`); return; }
  mkdirSync(agentDir, { recursive: true });
  if (existsSync(path)) copyFileSync(path, `${path}.pre-${id}-${Date.now()}`);
  writeFileSync(path, text, { mode: 0o600 });
  console.log(`Configured teammate profile ${id}: ${path}`);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  configureTeammate(process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent"), { dryRun: process.argv.includes("--dry-run") });
}
