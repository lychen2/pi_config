#!/usr/bin/env node

import { constants as fsConstants } from "node:fs";
import {
  access,
  cp,
  mkdir,
  readFile,
  readdir,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import readline from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const repoDir = path.dirname(fileURLToPath(import.meta.url));
const isWindows = process.platform === "win32";
const homeDir = os.homedir();
const defaultAgentDir = path.join(homeDir, ".pi", "agent");
const agentDir = path.resolve(process.env.PI_CODING_AGENT_DIR || defaultAgentDir);

function normalizeChildPath() {
  const pathKey = Object.keys(process.env).find((key) => key.toLowerCase() === "path") || "PATH";
  const nodeDirectory = path.dirname(process.execPath);
  const currentEntries = (process.env[pathKey] || "").split(path.delimiter);
  const seen = new Set();
  const entries = [];

  for (const entry of [nodeDirectory, ...currentEntries]) {
    const trimmed = entry.trim();
    if (!trimmed) {
      continue;
    }
    const comparisonKey = isWindows
      ? trimmed.replace(/[\\/]+$/, "").toLowerCase()
      : trimmed.replace(/\/+$/, "");
    if (!seen.has(comparisonKey)) {
      seen.add(comparisonKey);
      entries.push(trimmed);
    }
  }

  process.env[pathKey] = entries.join(path.delimiter);
}

normalizeChildPath();

function setChoice(options, key, value, label) {
  if (options[key] !== undefined && options[key] !== value) {
    throw new Error(`Conflicting ${label} options were provided.`);
  }
  options[key] = value;
}

function parseArgs(argv) {
  const options = {
    yes: false,
    dryRun: false,
    external: undefined,
    browser: undefined,
    rtk: undefined,
    modelDefaults: undefined,
  };

  for (const arg of argv) {
    switch (arg) {
      case "--yes":
      case "-y":
        options.yes = true;
        break;
      case "--dry-run":
        options.dryRun = true;
        break;
      case "--with-external":
        setChoice(options, "external", true, "external package");
        break;
      case "--skip-external":
        setChoice(options, "external", false, "external package");
        break;
      case "--with-browser":
        setChoice(options, "browser", true, "browser");
        break;
      case "--skip-browser":
        setChoice(options, "browser", false, "browser");
        break;
      case "--with-rtk":
        setChoice(options, "rtk", true, "RTK");
        break;
      case "--skip-rtk":
        setChoice(options, "rtk", false, "RTK");
        break;
      case "--with-model-defaults":
        setChoice(options, "modelDefaults", true, "model default");
        break;
      case "--skip-model-defaults":
        setChoice(options, "modelDefaults", false, "model default");
        break;
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

function printHelp() {
  console.log(`pi_config installer

Usage:
  node install.mjs [options]

Options:
  -y, --yes                Accept recommended defaults without prompting
      --dry-run            Print actions without changing the system
      --with-external      Install packages from config/external-packages.txt
      --skip-external      Skip external Pi packages
      --with-browser       Install agent-browser and its browser runtime
      --skip-browser       Skip browser automation
      --with-rtk           Install RTK (Linux and macOS only)
      --skip-rtk           Skip RTK
      --with-model-defaults  Apply provider/model defaults from public settings
      --skip-model-defaults  Keep the machine's provider/model selection
  -h, --help               Show this help

Recommended non-interactive install:
  node install.mjs --yes
`);
}

function commandName(name) {
  return isWindows ? `${name}.cmd` : name;
}

function commandNeedsShell(command) {
  return isWindows && /\.(cmd|bat)$/i.test(command);
}

function formatCommand(command, args) {
  return [command, ...args]
    .map((part) => (/^[A-Za-z0-9_./:@=-]+$/.test(part) ? part : JSON.stringify(part)))
    .join(" ");
}

function run(command, args, options = {}) {
  console.log(`  $ ${formatCommand(command, args)}`);
  if (installerOptions.dryRun) {
    return;
  }

  const result = spawnSync(command, args, {
    cwd: options.cwd || repoDir,
    env: options.env || process.env,
    stdio: "inherit",
    shell: options.shell ?? commandNeedsShell(command),
  });

  if (result.error) {
    throw new Error(`Failed to start ${command}: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`${command} exited with status ${result.status}`);
  }
}

function commandExists(command, args = ["--version"]) {
  const result = spawnSync(command, args, {
    env: process.env,
    stdio: "ignore",
    shell: commandNeedsShell(command),
  });
  return !result.error && result.status === 0;
}

async function pathExists(target) {
  try {
    await access(target, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function mergeObjects(base, overlay) {
  const merged = { ...base };
  for (const [key, value] of Object.entries(overlay)) {
    if (isPlainObject(value) && isPlainObject(merged[key])) {
      merged[key] = mergeObjects(merged[key], value);
    } else {
      merged[key] = value;
    }
  }
  return merged;
}

async function readJson(file, fallback = {}) {
  if (!(await pathExists(file))) {
    return fallback;
  }

  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    throw new Error(`Invalid JSON in ${file}: ${error.message}`);
  }
}

async function copyPath(source, destination) {
  console.log(`  copy ${path.relative(repoDir, source)} -> ${destination}`);
  if (installerOptions.dryRun) {
    return;
  }
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(source, destination, {
    recursive: true,
    force: true,
    errorOnExist: false,
  });
}

async function promptYesNo(rl, question, defaultValue) {
  if (installerOptions.yes || !process.stdin.isTTY) {
    return defaultValue;
  }

  const marker = defaultValue ? "Y/n" : "y/N";
  const answer = (await rl.question(`${question} [${marker}] `)).trim().toLowerCase();
  if (!answer) {
    return defaultValue;
  }
  return answer === "y" || answer === "yes";
}

async function resolveChoices() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const external = installerOptions.external ??
      (await promptYesNo(rl, "Install the external Pi package manifest?", true));
    const browser = installerOptions.browser ??
      (await promptYesNo(rl, "Install browser automation?", false));
    const rtk = isWindows
      ? false
      : installerOptions.rtk ?? (await promptYesNo(rl, "Install RTK support?", false));
    const modelDefaults = installerOptions.modelDefaults ??
      (await promptYesNo(
        rl,
        "Apply the repository's provider and model defaults?",
        false,
      ));

    if (installerOptions.rtk && isWindows) {
      console.warn("RTK installation is unavailable on native Windows and will be skipped.");
    }

    return { external, browser, rtk, modelDefaults };
  } finally {
    rl.close();
  }
}

async function backupExistingConfig() {
  if (!(await pathExists(agentDir))) {
    console.log("\n[1/6] No existing Pi configuration to back up.");
    return null;
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupDir = path.join(homeDir, `.pi-backup-${timestamp}`);
  console.log(`\n[1/6] Backing up ${agentDir} -> ${backupDir}`);
  if (!installerOptions.dryRun) {
    await mkdir(backupDir, { recursive: true });
    await cp(agentDir, path.join(backupDir, "agent"), {
      recursive: true,
      force: false,
      errorOnExist: true,
    });
  }
  return backupDir;
}

async function restoreFiles() {
  console.log("\n[2/6] Restoring skills, themes, and extension configuration");
  if (!installerOptions.dryRun) {
    await mkdir(agentDir, { recursive: true });
  }

  await copyPath(path.join(repoDir, "skills"), path.join(agentDir, "skills"));
  await copyPath(path.join(repoDir, "themes"), path.join(agentDir, "themes"));

  const configFiles = [
    "APPEND_SYSTEM.md",
    "deferred-tools.json",
    "slim-skills-whitelist.json",
    "translate-submit.json",
  ];
  for (const file of configFiles) {
    await copyPath(path.join(repoDir, "config", file), path.join(agentDir, file));
  }

  for (const file of ["adhd-mode.ts", "matugen-chrome.ts"]) {
    await copyPath(
      path.join(repoDir, "extensions", file),
      path.join(agentDir, "extensions", file),
    );
  }
}

async function mergePublicSettings(includeModelDefaults) {
  console.log("\n[3/6] Merging public settings");
  const publicSettingsPath = path.join(repoDir, "config", "settings-public.json");
  const settingsPath = path.join(agentDir, "settings.json");
  const publicSettings = await readJson(publicSettingsPath);

  if (!includeModelDefaults) {
    delete publicSettings.defaultProvider;
    delete publicSettings.defaultModel;
    delete publicSettings.enabledModels;
    console.log("  keeping the machine's provider and model defaults");
  }

  if (installerOptions.dryRun) {
    console.log(`  merge ${publicSettingsPath} -> ${settingsPath}`);
    return;
  }

  const currentSettings = await readJson(settingsPath);
  const mergedSettings = mergeObjects(currentSettings, publicSettings);
  await mkdir(agentDir, { recursive: true });
  await writeFile(settingsPath, `${JSON.stringify(mergedSettings, null, 2)}\n`, "utf8");
}


async function installLocalPackages() {
  console.log("\n[4/6] Installing local Pi packages");
  const extensionsDir = path.join(repoDir, "extensions");
  const entries = await readdir(extensionsDir, { withFileTypes: true });
  const packageDirs = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith("pi-")) {
      continue;
    }
    const packageDir = path.join(extensionsDir, entry.name);
    if (await pathExists(path.join(packageDir, "package.json"))) {
      packageDirs.push(packageDir);
    }
  }

  packageDirs.sort();
  for (const packageDir of packageDirs) {
    run(commandName("pi"), ["install", packageDir]);
  }
}

async function installExternalPackages(enabled) {
  console.log("\n[5/6] Installing external Pi packages");
  if (!enabled) {
    console.log("  skipped");
    return;
  }

  const manifestPath = path.join(repoDir, "config", "external-packages.txt");
  const packages = (await readFile(manifestPath, "utf8"))
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));

  const gitAvailable = commandExists("git");
  for (const packageSource of packages) {
    if (packageSource.startsWith("git:") && !gitAvailable) {
      console.warn(`  skip ${packageSource}: Git is unavailable`);
      continue;
    }
    const commandOptions = {};
    if (packageSource === "npm:@monotykamary/pi-tps") {
      console.log("  skipping pi-tps developer-only Git hook setup");
      commandOptions.env = {
        ...process.env,
        npm_config_ignore_scripts: "true",
      };
    }
    run(commandName("pi"), ["install", packageSource], commandOptions);
  }
}

async function installOptionalTools(choices) {
  console.log("\n[6/6] Installing optional command-line tools");
  let installedAny = false;

  if (choices.browser) {
    installedAny = true;
    run(commandName("npm"), ["install", "-g", "agent-browser"]);
    run(commandName("agent-browser"), ["install"]);
  }

  if (choices.rtk) {
    installedAny = true;
    run(
      "sh",
      [
        "-c",
        "curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/refs/heads/master/install.sh | sh",
      ],
    );
  }

  if (!installedAny) {
    console.log("  skipped");
  }
}

function verifyPi() {
  if (installerOptions.dryRun) {
    return;
  }
  if (!commandExists(commandName("pi"))) {
    throw new Error("Pi is not available on PATH. Run install.sh or install.ps1 first.");
  }
}

const installerOptions = parseArgs(process.argv.slice(2));
const choices = await resolveChoices();

console.log("pi_config cross-platform installer");
console.log(`  platform: ${process.platform} ${process.arch}`);
console.log(`  repository: ${repoDir}`);
console.log(`  target: ${agentDir}`);
console.log(`  external packages: ${choices.external ? "yes" : "no"}`);
console.log(`  browser automation: ${choices.browser ? "yes" : "no"}`);
console.log(`  RTK: ${choices.rtk ? "yes" : "no"}`);
console.log(`  provider/model defaults: ${choices.modelDefaults ? "apply" : "keep current"}`);
if (installerOptions.dryRun) {
  console.log("  mode: dry run");
}

verifyPi();
const backupDir = await backupExistingConfig();
await restoreFiles();
await mergePublicSettings(choices.modelDefaults);
await installLocalPackages();
await installExternalPackages(choices.external);
await installOptionalTools(choices);

if (installerOptions.dryRun) {
  console.log("\nDry run complete. No changes were made.");
} else {
  console.log("\nInstallation complete.");
  if (backupDir) {
    console.log(`Backup: ${backupDir}`);
  }
  console.log("Next: run pi, use /provider add to configure a provider, then select it with /model.");
}
