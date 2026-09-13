import { copyFile, readFile, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function compatibleRtkPackages(packages) {
  if (!Array.isArray(packages)) return packages;
  const source = entry => typeof entry === "string" ? entry : entry?.source ?? "";
  const bridge = packages.find(entry => /(?:^|[/\\])pi-context-bridge[/\\]?$/.test(source(entry)));
  if (!bridge) return packages; // Never disable a standalone installation without its replacement.
  if (typeof bridge !== "string" && bridge.extensions !== undefined) {
    throw new Error("pi-context-bridge has custom extension filters; enable ./rtk.ts before migrating RTK.");
  }
  return packages.filter(entry => !/^npm:pi-rtk-optimizer(?:@[^/]+)?$/.test(source(entry)));
}

export async function configureRtkCompat(agent, { dryRun = false } = {}) {
  const path = join(agent, "settings.json");
  let text;
  try { text = await readFile(path, "utf8"); } catch (error) { if (error.code === "ENOENT") return; throw error; }
  const settings = JSON.parse(text);
  const packages = compatibleRtkPackages(settings.packages);
  if (JSON.stringify(packages) === JSON.stringify(settings.packages)) return;
  if (dryRun) { console.log("  would migrate standalone RTK to the first-party compatibility entry"); return; }
  const backup = `${path}.pre-rtk-compat-${Date.now()}`;
  await copyFile(path, backup, constants.COPYFILE_EXCL);
  settings.packages = packages;
  await writeFile(path, JSON.stringify(settings, null, 2) + "\n", { mode: 0o600 });
  console.log(`RTK compatibility configured. Backup: ${backup}. Restart Pi.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  configureRtkCompat(resolve(process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent")))
    .catch(error => { console.error(error.message); process.exitCode = 1; });
}
