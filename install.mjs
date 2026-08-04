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
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";

const repoDir = path.dirname(fileURLToPath(import.meta.url));
const isWindows = process.platform === "win32";
const homeDir = os.homedir();
const defaultAgentDir = path.join(homeDir, ".pi", "agent");
const agentDir = path.resolve(process.env.PI_CODING_AGENT_DIR || defaultAgentDir);
const retiredPackageSources = new Set([
  "git:github.com/Xichun123/pi-cometix-footer",
  "npm:@narumitw/pi-goal",
  "npm:@narumitw/pi-subagents",
  "npm:@narumitw/pi-btw",
  "npm:pi-add-dir",
  "npm:@tmustier/pi-raw-paste",
  "npm:pi-autoresearch",
  "npm:@monotykamary/pi-tps",
  "npm:pi-agent-browser-native",
  "npm:pi-hashline-edit-pro",
 ]);
const retiredLocalPackageNames = new Set([
  "pi-agent-browser-compat",
  "pi-goal-verifier",
  "pi-rtk-hashline-compat",
  "pi-semantic-code",
]);

const lateLocalPackageNames = new Set([
  "pi-rtk-aft-restore",
]);

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
    magicContext: undefined,
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
      case "--with-magic-context":
        setChoice(options, "magicContext", true, "Magic Context");
        break;
      case "--skip-magic-context":
        setChoice(options, "magicContext", false, "Magic Context");
        break;
      case "--with-external":
        setChoice(options, "external", true, "external package");
        break;
      case "--skip-external":
        setChoice(options, "external", false, "external package");
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
      --with-magic-context  Run the official Magic Context setup script
      --skip-magic-context  Skip Magic Context setup
      --with-external      Install packages from config/external-packages.txt
      --skip-external      Skip external Pi packages
      --with-rtk           Install the RTK binary used by pi-rtk-optimizer
      --skip-rtk           Skip the RTK binary
      --with-model-defaults  Apply provider/model defaults from public settings
      --skip-model-defaults  Keep the machine's provider/model selection
  Local extensions/pi-*/package.json packages are always installed.
  -h, --help               Show this help

Recommended install (Magic Context runs its own setup wizard):
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

function configuredPackageSource(value) {
  if (typeof value === "string") return value;
  if (isPlainObject(value) && typeof value.source === "string") return value.source;
  return undefined;
}

function isRetiredPackageSource(value) {
  const source = configuredPackageSource(value)?.replaceAll("\\", "/").replace(/\/+$/, "");
  if (!source) return false;
  if (retiredPackageSources.has(source)) return true;
  if ([...retiredPackageSources].some((retired) => source.startsWith(`${retired}@`))) return true;
  return [...retiredLocalPackageNames].some((name) => source.endsWith(`/extensions/${name}`));
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

async function copyPathIfMissing(source, destination) {
  if (await pathExists(destination)) {
    console.log(`  preserve existing ${destination}`);
    return;
  }
  await copyPath(source, destination);
}

async function mergeMissingTree(source, destination) {
  if (!(await pathExists(destination))) {
    await copyPath(source, destination);
    return;
  }

  for (const entry of await readdir(source, { withFileTypes: true })) {
    const sourceEntry = path.join(source, entry.name);
    const destinationEntry = path.join(destination, entry.name);
    if (entry.isDirectory()) {
      if (!(await pathExists(destinationEntry))) {
        await copyPath(sourceEntry, destinationEntry);
        continue;
      }
      try {
        await readdir(destinationEntry);
      } catch {
        continue;
      }
      await mergeMissingTree(sourceEntry, destinationEntry);
      continue;
    }
    if (!(await pathExists(destinationEntry))) {
      await copyPath(sourceEntry, destinationEntry);
    }
  }
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
    const magicContext = installerOptions.magicContext ??
      (await promptYesNo(rl, "Install Magic Context and disable Pi auto-compaction?", true));
    const external = installerOptions.external ??
      (await promptYesNo(rl, "Install the external Pi package manifest?", true));
    const rtk = installerOptions.rtk ??
      (await promptYesNo(rl, "Install the RTK binary used by pi-rtk-optimizer?", true));
    const modelDefaults = installerOptions.modelDefaults ??
      (await promptYesNo(
        rl,
        "Apply the repository's provider and model defaults?",
        false,
      ));


    return { magicContext, external, rtk, modelDefaults };
  } finally {
    rl.close();
  }
}

async function backupExistingConfig() {
  const cortexConfigPaths = ["aft.jsonc", "magic-context.jsonc"]
    .map((name) => cortexConfigPath(name));
  const existingCortexConfigPaths = [];
  for (const configPath of cortexConfigPaths) {
    if (await pathExists(configPath)) {
      existingCortexConfigPaths.push(configPath);
    }
  }
  const hasAgentConfig = await pathExists(agentDir);
  if (!hasAgentConfig && existingCortexConfigPaths.length === 0) {
    console.log("\n[1/7] No existing Pi configuration to back up.");
    return null;
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupDir = path.join(homeDir, `.pi-backup-${timestamp}`);
  console.log(`\n[1/7] Backing up existing configuration -> ${backupDir}`);
  if (installerOptions.dryRun) {
    return backupDir;
  }

  await mkdir(backupDir, { recursive: true });
  if (hasAgentConfig) {
    await cp(agentDir, path.join(backupDir, "agent"), {
      recursive: true,
      force: false,
      errorOnExist: true,
    });
  }
  for (const configPath of existingCortexConfigPaths) {
    const backupPath = path.join(backupDir, "cortexkit", path.basename(configPath));
    await mkdir(path.dirname(backupPath), { recursive: true });
    await cp(configPath, backupPath, {
      force: false,
      errorOnExist: true,
    });
  }
  return backupDir;
}

async function restoreFiles() {
  console.log("\n[2/7] Merging missing skills, themes, and extension configuration");
  if (!installerOptions.dryRun) {
    await mkdir(agentDir, { recursive: true });
  }

  await mergeMissingTree(path.join(repoDir, "skills"), path.join(agentDir, "skills"));
  await mergeMissingTree(path.join(repoDir, "themes"), path.join(agentDir, "themes"));

  const configFiles = [
    "APPEND_SYSTEM.md",
    "slim-skills-whitelist.json",
    "pi-plan-mode.json",
  ];
  for (const file of configFiles) {
    await copyPath(path.join(repoDir, "config", file), path.join(agentDir, file));
  }

  for (const file of ["adhd-mode.ts", "matugen-chrome.ts"]) {
    await copyPathIfMissing(
      path.join(repoDir, "extensions", file),
      path.join(agentDir, "extensions", file),
    );
  }
  await copyPath(
    path.join(repoDir, "config", "aft.jsonc"),
    cortexConfigPath("aft.jsonc"),
  );
}

async function mergePublicSettings(includeModelDefaults) {
  console.log("\n[3/7] Merging public settings");
  const publicSettingsPath = path.join(repoDir, "config", "settings-public.json");
  const settingsPath = path.join(agentDir, "settings.json");
  const publicSettings = await readJson(publicSettingsPath);

  if (!includeModelDefaults) {
    delete publicSettings.defaultProvider;
    delete publicSettings.defaultModel;
    delete publicSettings.enabledModels;
    console.log("  keeping the machine's provider and model defaults");
  }


  const currentSettings = await readJson(settingsPath);
  const mergedSettings = mergeObjects(currentSettings, publicSettings);
  if (Array.isArray(mergedSettings.packages)) {
    const retiredPackages = mergedSettings.packages.filter(isRetiredPackageSource);
    mergedSettings.packages = mergedSettings.packages.filter((entry) => !isRetiredPackageSource(entry));
    if (retiredPackages.length) {
      console.log(`  removed retired packages: ${retiredPackages.map(configuredPackageSource).filter(Boolean).join(", ")}`);
    }
  }
  if (installerOptions.dryRun) {
    console.log(`  merge ${publicSettingsPath} -> ${settingsPath}`);
    return;
  }
  await mkdir(agentDir, { recursive: true });
  await writeFile(settingsPath, `${JSON.stringify(mergedSettings, null, 2)}\n`, "utf8");
}


async function installLocalPackages() {
  console.log("\n[4/7] Installing local Pi packages");
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
  console.log(`  discovered local packages: ${packageDirs.map((packageDir) => path.basename(packageDir)).join(", ") || "none"}`);
  for (const packageDir of packageDirs.filter((entry) => !lateLocalPackageNames.has(path.basename(entry)))) {
    run(commandName("pi"), ["install", packageDir]);
  }

  run(process.execPath, [path.join(repoDir, "scripts", "verify-tool-presentations.mjs")]);
}

async function installLateLocalPackages() {
  const packageDir = path.join(repoDir, "extensions", "pi-rtk-aft-restore");
  if (!(await pathExists(path.join(packageDir, "package.json")))) return;
  console.log("  installing late local package: pi-rtk-aft-restore");
  run(commandName("pi"), ["install", packageDir]);
}

function isNamedPackageSource(value, name) {
  const source = configuredPackageSource(value)?.replaceAll("\\", "/").replace(/\/+$/, "");
  return source?.endsWith(`/extensions/${name}`) || source === `npm:${name}`;
}

async function reorderRtkAftPackages() {
  if (installerOptions.dryRun) return;
  const settingsPath = path.join(agentDir, "settings.json");
  const settings = await readJson(settingsPath);
  if (!Array.isArray(settings.packages)) return;

  const originalPackages = settings.packages;
  let packages = [...originalPackages];
  const capture = packages.find((entry) => isNamedPackageSource(entry, "pi-rtk-aft-capture"));
  const restore = packages.find((entry) => isNamedPackageSource(entry, "pi-rtk-aft-restore"));
  const rtk = packages.find((entry) => {
    const source = configuredPackageSource(entry);
    return typeof source === "string" && (source === "npm:pi-rtk-optimizer" || source.startsWith("npm:pi-rtk-optimizer@"));
  });
  if (capture && restore && rtk) {
    const withoutRtkAdapters = packages.filter((entry) => entry !== capture && entry !== restore);
    const rtkIndex = withoutRtkAdapters.indexOf(rtk);
    withoutRtkAdapters.splice(rtkIndex, 0, capture);
    withoutRtkAdapters.splice(rtkIndex + 2, 0, restore);
    packages = withoutRtkAdapters;
  }


  if (JSON.stringify(packages) === JSON.stringify(originalPackages)) return;
  settings.packages = packages;
  await writeFile(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
  if (capture && restore && rtk) console.log("  ordered AFT Bash capture -> RTK -> restore");
}

async function installExternalPackages(enabled) {
  console.log("\n[5/7] Installing external Pi packages");
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
    run(commandName("pi"), ["install", packageSource], commandOptions);
  }
}


function cortexConfigHome() {
  const xdgConfigHome = process.env.XDG_CONFIG_HOME;
  return xdgConfigHome && path.isAbsolute(xdgConfigHome)
    ? xdgConfigHome
    : path.join(homeDir, ".config");
}

function cortexConfigPath(name) {
  return path.join(cortexConfigHome(), "cortexkit", name);
}

function magicContextConfigPath() {
  return cortexConfigPath("magic-context.jsonc");
}

async function configureMagicContextThreshold() {
  const configPath = magicContextConfigPath();
  console.log(`  set Magic Context execute threshold to 55% -> ${configPath}`);
  if (installerOptions.dryRun) return;

  const packageRoot = path.join(agentDir, "npm", "node_modules", "@cortexkit", "pi-magic-context");
  const packageJsonPath = path.join(packageRoot, "package.json");
  if (!(await pathExists(packageJsonPath))) {
    throw new Error(`Magic Context package is missing after installation: ${packageRoot}`);
  }

  const requireFromMagicContext = createRequire(packageJsonPath);
  const { parse, stringify } = requireFromMagicContext("comment-json");
  const existing = await pathExists(configPath)
    ? parse(await readFile(configPath, "utf8"))
    : {};
  if (!isPlainObject(existing)) {
    throw new Error(`Magic Context config at ${configPath} must be a JSONC object`);
  }

  existing.execute_threshold_percentage = 55;
  await mkdir(path.dirname(configPath), { recursive: true });
  await writeFile(configPath, `${stringify(existing, null, 2)}\n`, "utf8");
}

async function installMagicContext(enabled) {
  console.log("\n[6/7] Installing Magic Context");
  if (!enabled) {
    console.log("  skipped");
    return;
  }

  if (isWindows) {
    run("powershell.exe", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      "irm https://raw.githubusercontent.com/cortexkit/magic-context/master/scripts/install.ps1 | iex",
    ]);
  } else {
    run("sh", [
      "-c",
      "curl -fsSL https://raw.githubusercontent.com/cortexkit/magic-context/master/scripts/install.sh | bash",
    ]);
  }
  await configureMagicContextThreshold();
}

async function installOptionalTools(choices) {
  console.log("\n[7/7] Installing optional command-line tools");
  let installedAny = false;


  if (choices.rtk) {
    installedAny = true;
    if (isWindows) {
      run(
        "powershell.exe",
        [
          "-NoProfile",
          "-ExecutionPolicy",
          "Bypass",
          "-File",
          path.join(repoDir, "scripts", "install-rtk.ps1"),
        ],
      );
    } else {
      run(
        "sh",
        [
          "-c",
          "curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/refs/heads/master/install.sh | sh",
        ],
      );
    }
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
console.log(`  Magic Context: ${choices.magicContext ? "yes" : "no"}`);
console.log(`  external packages: ${choices.external ? "yes" : "no"}`);
console.log(`  RTK binary: ${choices.rtk ? "yes" : "no"}`);
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
await installLateLocalPackages();
await reorderRtkAftPackages();
await installMagicContext(choices.magicContext);
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
