import { readFile, writeFile, mkdir, copyFile, access } from "node:fs/promises";
import { constants } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function enableTun(config) {
  const ssrf = config.ssrf ?? {};
  if (typeof ssrf !== "object" || Array.isArray(ssrf)) throw new Error("ssrf must be an object");
  if (ssrf.allowRanges !== undefined && !Array.isArray(ssrf.allowRanges)) throw new Error("ssrf.allowRanges must be an array");
  return { ...config, ssrf: { ...ssrf, allowRanges: [...new Set([...(ssrf.allowRanges ?? []), "198.18.0.0/15"])] } };
}

export function orderSolFirst(packages) {
  if (!Array.isArray(packages)) throw new Error("Install SoL-Pi before configuration.");
  const isSol = entry => /(?:github\.com[/:]NVlabs\/SoL-Pi)(?:@|$)/i.test(typeof entry === "string" ? entry : entry?.source ?? "");
  const sol = packages.filter(isSol);
  if (sol.length !== 1) throw new Error("Expected exactly one standalone NVlabs/SoL-Pi package.");
  return [...sol, ...packages.filter(entry => !isSol(entry))];
}

export function knowledgeOnly(config) {
  config.compaction = { ...config.compaction, enabled: false };
  config.todowrite = { ...config.todowrite, enabled: false, overlay: false };
  return config;
}

async function exists(path) {
  try { await access(path); return true; } catch (error) { if (error.code === "ENOENT") return false; throw error; }
}

async function save(path, content) {
  await mkdir(dirname(path), { recursive: true });
  if (await exists(path)) {
    const backup = `${path}.pre-sol-${Date.now()}`;
    await copyFile(path, backup, constants.COPYFILE_EXCL);
    console.log(`Backup: ${backup}`);
  }
  await writeFile(path, content, { mode: 0o600 });
  console.log(`Configured: ${path}`);
}

async function main() {
  const args = new Set(process.argv.slice(2));
  if ([...args].some(arg => !["--approve-shared-memory", "--tun"].includes(arg))) throw new Error("Usage: node scripts/configure-default-sol.mjs --approve-shared-memory [--tun]");
  if (!args.has("--approve-shared-memory")) throw new Error("Requires --approve-shared-memory: disabling Magic Context compaction affects every host sharing its user config.");
  const agent = resolve(process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent"));
  const xdg = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
  const magicPath = join(xdg, "cortexkit", "magic-context.jsonc");
  const require = createRequire(join(agent, "npm", "package.json"));
  const { parse, stringify } = require("comment-json");
  const magic = await exists(magicPath) ? parse(await readFile(magicPath, "utf8")) : {};
  const settingsPath = join(agent, "settings.json");
  const settings = JSON.parse(await readFile(settingsPath, "utf8"));
  const sol = JSON.parse(await readFile(new URL("../config/sol-pi.json", import.meta.url), "utf8"));
  if (!settings.defaultProvider || !settings.defaultModel) throw new Error("Set Pi's default provider/model before configuring the reducer.");
  sol.evidencePreservingReducerProvider = settings.defaultProvider;
  sol.evidencePreservingReducerModel = settings.defaultModel;
  const projectSol = join(process.cwd(), ".pi", "sol-pi.json");
  if (await exists(projectSol)) throw new Error(`Project override exists: ${projectSol}; reconcile it before migration.`);
  const webPath = process.env.PI_CODING_AGENT_DIR
    ? join(agent, "web-search.json")
    : process.env.XDG_CONFIG_HOME ? join(xdg, "pi", "web-search.json") : join(homedir(), ".pi", "web-search.json");
  const web = args.has("--tun")
    ? enableTun(await exists(webPath) ? JSON.parse(await readFile(webPath, "utf8")) : {}) : undefined;
  settings.packages = orderSolFirst(settings.packages);
  settings.compaction = { ...settings.compaction, enabled: true };
  // Standalone SoL uses Pi's default retained-tail estimate.
  if (settings.compaction.keepRecentTokens !== undefined && settings.compaction.keepRecentTokens !== 20000) {
    throw new Error("Custom compaction.keepRecentTokens needs a matching SoL programmatic integration; no files changed.");
  }
  await save(join(agent, "sol-pi.json"), JSON.stringify(sol, null, 2) + "\n");
  await save(settingsPath, JSON.stringify(settings, null, 2) + "\n");
  await save(magicPath, stringify(knowledgeOnly(magic), null, 2) + "\n");
  if (web) await save(webPath, JSON.stringify(web, null, 2) + "\n");
  console.log("Restart Pi. Shared Magic Context now supplies knowledge only; enable native compaction in other affected hosts.");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
