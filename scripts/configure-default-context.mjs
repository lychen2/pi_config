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

export function magicOwnsCompaction(config) {
  return {
    ...config,
    enabled: true,
    compaction: { ...config.compaction, enabled: true },
    todowrite: { ...config.todowrite, enabled: false, overlay: false },
  };
}

async function exists(path) {
  try { await access(path); return true; } catch (error) { if (error.code === "ENOENT") return false; throw error; }
}

async function save(path, content) {
  await mkdir(dirname(path), { recursive: true });
  if (await exists(path)) {
    const backup = `${path}.pre-context-${Date.now()}`;
    await copyFile(path, backup, constants.COPYFILE_EXCL);
    console.log(`Backup: ${backup}`);
  }
  await writeFile(path, content, { mode: 0o600 });
  console.log(`Configured: ${path}`);
}

async function main() {
  const args = new Set(process.argv.slice(2));
  if ([...args].some(arg => !["--approve-shared-memory", "--tun"].includes(arg))) {
    throw new Error("Usage: node scripts/configure-default-context.mjs --approve-shared-memory [--tun]");
  }
  if (!args.has("--approve-shared-memory")) {
    throw new Error("Requires --approve-shared-memory: Magic Context configuration is shared across hosts.");
  }
  const agent = resolve(process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent"));
  const xdg = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
  const magicPath = join(xdg, "cortexkit", "magic-context.jsonc");
  const require = createRequire(join(agent, "npm", "package.json"));
  const { parse, stringify } = require("comment-json");
  const magic = await exists(magicPath) ? parse(await readFile(magicPath, "utf8")) : {};
  const settingsPath = join(agent, "settings.json");
  const settings = JSON.parse(await readFile(settingsPath, "utf8"));
  const webPath = process.env.PI_CODING_AGENT_DIR
    ? join(agent, "web-search.json")
    : process.env.XDG_CONFIG_HOME ? join(xdg, "pi", "web-search.json") : join(homedir(), ".pi", "web-search.json");
  const web = args.has("--tun")
    ? enableTun(await exists(webPath) ? JSON.parse(await readFile(webPath, "utf8")) : {}) : undefined;
  settings.compaction = { ...settings.compaction, enabled: true };
  await save(settingsPath, JSON.stringify(settings, null, 2) + "\n");
  await save(magicPath, stringify(magicOwnsCompaction(magic), null, 2) + "\n");
  if (web) await save(webPath, JSON.stringify(web, null, 2) + "\n");
  console.log("Restart Pi. Magic Context owns session compaction; pi-default-workbench owns then_run and Todo.");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
