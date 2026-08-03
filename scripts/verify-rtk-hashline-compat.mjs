#!/usr/bin/env node

import { access, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const agentDir = path.resolve(
  process.env.PI_CODING_AGENT_DIR || path.join(os.homedir(), ".pi", "agent"),
);
const nodeModules = path.join(agentDir, "npm", "node_modules");

async function packageInfo(name) {
  try {
    const packagePath = path.join(nodeModules, ...name.split("/"), "package.json");
    const packageJson = JSON.parse(await readFile(packagePath, "utf8"));
    return { name: packageJson.name || name, version: packageJson.version || "unknown" };
  } catch {
    return undefined;
  }
}

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

const settingsPath = path.join(agentDir, "settings.json");
let configuredPackages = [];
try {
  const settings = JSON.parse(await readFile(settingsPath, "utf8"));
  configuredPackages = Array.isArray(settings.packages) ? settings.packages : [];
} catch {
  configuredPackages = [];
}

const adapterSource = configuredPackages.find(
  (source) => typeof source === "string" && source.replaceAll("\\", "/").endsWith("/extensions/pi-rtk-hashline-compat"),
);
const adapter = adapterSource
  ? { name: "pi-rtk-hashline-compat-local", version: "local", source: adapterSource }
  : await packageInfo("pi-rtk-hashline-compat-local");
const hashline = await packageInfo("pi-hashline-edit-pro");
const rtk = await packageInfo("pi-rtk-optimizer");
const configPath = path.join(agentDir, "extensions", "pi-rtk-optimizer", "config.json");
console.log(`Pi agent directory: ${agentDir}`);
console.log(`adapter: ${adapter ? `OK (${adapter.version})` : "MISSING"}`);
console.log(`pi-hashline-edit-pro: ${hashline ? `OK (${hashline.version})` : "MISSING"}`);
console.log(`pi-rtk-optimizer: ${rtk ? `OK (${rtk.version})` : "MISSING"}`);
console.log(`RTK config: ${await fileExists(configPath) ? "present" : "absent (adapter stays inactive)"}`);

if (!adapter) {
  console.error("Install local packages with: node install.mjs --yes");
  process.exitCode = 1;
}
