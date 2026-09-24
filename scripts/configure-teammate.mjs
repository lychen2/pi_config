import { existsSync, readFileSync, writeFileSync, copyFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function configureTeammate(agentDir, { dryRun = false } = {}) {
  const path = join(agentDir, "teammate-models.json");
  const current = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : { version: 3, profiles: {} };
  if (current.version !== 3) throw new Error("Migrate teammate-models.json to v3 before configuring the DeepSeek profile");
  const model = "manager/glm-5.3-flash";
  const types = ["explore", "analysis", "debug", "planning", "development", "review", "testing"];
  const roles = ["general", "explorer", "analyst", "planner", "research", "verifier", "workflow"];
  const next = { ...current, defaultProfile: "glm-flash", profiles: {
    ...current.profiles,
    "glm-flash": {
      name: "GLM 5.3 Flash", mappings: Object.fromEntries(types.map(type => [type, model])),
      fallbackMappings: Object.fromEntries(types.map(type => [type, []])), thinkingLevels: {},
      roleMappings: Object.fromEntries(roles.map(role => [role, { model, fallbackModels: [] }])),
    },
  } };
  const text = JSON.stringify(next, null, 2) + "\n";
  if (existsSync(path) && readFileSync(path, "utf8") === text) return;
  if (dryRun) { console.log(`Would configure teammate DeepSeek profile: ${path}`); return; }
  mkdirSync(agentDir, { recursive: true });
  if (existsSync(path)) copyFileSync(path, `${path}.pre-glm-${Date.now()}`);
  writeFileSync(path, text, { mode: 0o600 });
  console.log(`Configured teammate profile: ${path}`);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  configureTeammate(process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent"), { dryRun: process.argv.includes("--dry-run") });
}
