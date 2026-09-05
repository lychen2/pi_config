#!/usr/bin/env node

import { constants as fsConstants, realpathSync } from "node:fs";
import {
  access,
  chmod,
  cp,
  mkdir,
  readFile,
  readlink,
  rm,
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
const retiredLocalPackageNames = new Set([
  "pi-agent-browser-compat",
  "pi-deferred-tools",
  "pi-maestro-browser",
  "pi-maestro-todo",
  "pi-maestro-tools",
  "pi-markdown-preview-compat",
  "pi-goal-verifier",
  "pi-rtk-hashline-compat",
  "pi-semantic-code",
  "pi-aft-compat",
  "pi-rtk-aft-capture",
  "pi-rtk-aft-restore",
  "pi-large-beautify",
  "pi-brand-header",
  "pi-deepseek-anchored-standard",
  "pi-large-mode",
  "pi-manager-models",
  "pi-todo-guard",
  "pi-zh-localizer",
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

let installerOptions = parseArgs([]);

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
    rtk: undefined,
    modelDefaults: undefined,
    cleanPlugins: true,
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
      case "--clean-plugins":
        options.cleanPlugins = true;
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
      --with-rtk           Install the RTK binary used by pi-rtk-optimizer
      --skip-rtk           Skip the RTK binary
      --with-model-defaults  Apply provider/model defaults from public settings
      --skip-model-defaults  Keep the machine's provider/model selection
      --clean-plugins        Compatibility flag; cleanup is always enabled
   Local extensions/pi-*/package.json packages are always installed.
  -h, --help               Show this help

Recommended install:
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

function installStep(step) {
  const offset = installerOptions.cleanPlugins && step > 1 ? 1 : 0;
  const total = installerOptions.cleanPlugins ? 7 : 6;
  return `[${step + offset}/${total}]`;
}

const DEFAULT_RUN_TIMEOUT_MS = 20 * 60 * 1000;

function run(command, args, options = {}) {
  console.log(`  $ ${formatCommand(command, args)}`);
  if (installerOptions.dryRun) {
    return;
  }

  const timeout = options.timeout ?? DEFAULT_RUN_TIMEOUT_MS;
  const result = spawnSync(command, args, {
    cwd: options.cwd || repoDir,
    env: options.env || process.env,
    stdio: "inherit",
    shell: options.shell ?? commandNeedsShell(command),
    timeout,
  });

  if (result.error) {
    if (result.error.code === "ETIMEDOUT") {
      const formattedTimeout = timeout >= 1000 ? `${Math.round(timeout / 1000)}s` : `${timeout}ms`;
      throw new Error(
        `Timed out after ${formattedTimeout} running ${formatCommand(command, args)}: ` +
        `${result.error.message} — check your network or proxy and retry; re-running the installer is safe`,
      );
    }
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

function isLocalPackageSource(value, packageName) {
  const source = configuredPackageSource(value)?.replaceAll("\\", "/").replace(/\/+$/, "");
  return source?.endsWith(`/extensions/${packageName}`) ?? false;
}

async function normalizeAnchoredStandardOrder() {
  const settingsPath = path.join(agentDir, "settings.json");
  const settings = await readJson(settingsPath, {});
  if (!Array.isArray(settings.packages)) return;

  const anchorIndex = settings.packages.findIndex((entry) =>
    isLocalPackageSource(entry, "pi-deepseek-anchored-standard")
  );
  const workbenchIndex = settings.packages.findIndex((entry) =>
    isLocalPackageSource(entry, "pi-default-workbench")
  );
  if (anchorIndex < 0 || workbenchIndex < 0 || anchorIndex === workbenchIndex + 1) return;

  const [anchor] = settings.packages.splice(anchorIndex, 1);
  const nextWorkbenchIndex = settings.packages.findIndex((entry) =>
    isLocalPackageSource(entry, "pi-default-workbench")
  );
  settings.packages.splice(nextWorkbenchIndex + 1, 0, anchor);
  console.log("  ordered pi-deepseek-anchored-standard after pi-default-workbench");
  if (!installerOptions.dryRun) {
    await writeFile(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
  }
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


function externalSkillRoots() {
  return [
    path.join(homeDir, ".pi", "skills"),
    path.join(homeDir, ".agents", "skills"),
  ];
}

async function skillExistsInOtherRoot(name) {
  for (const root of externalSkillRoots()) {
    if (await pathExists(path.join(root, name, "SKILL.md"))) {
      return root;
    }
  }
  return undefined;
}

async function mergeSkillTree(source, destination, overwriteFiles = false) {
  if (!(await pathExists(destination)) && !installerOptions.dryRun) {
    await mkdir(destination, { recursive: true });
  }

  for (const entry of await readdir(source, { withFileTypes: true })) {
    const sourceEntry = path.join(source, entry.name);
    const destinationEntry = path.join(destination, entry.name);
    if (entry.isDirectory()) {
      await mergeSkillTree(sourceEntry, destinationEntry, overwriteFiles);
    } else if (overwriteFiles || !(await pathExists(destinationEntry))) {
      await copyPath(sourceEntry, destinationEntry);
    }
  }
}

async function mergeRepositorySkills() {
  const source = path.join(repoDir, "skills");
  const destination = path.join(agentDir, "skills");
  if (!installerOptions.dryRun) {
    await mkdir(destination, { recursive: true });
  }

  for (const entry of await readdir(source, { withFileTypes: true })) {
    const externalRoot = entry.isDirectory()
      ? await skillExistsInOtherRoot(entry.name)
      : undefined;
    if (externalRoot) {
      console.log(`  preserve existing skill ${entry.name} from ${externalRoot}`);
      continue;
    }
    await mergeSkillTree(path.join(repoDir, "skills", entry.name), path.join(destination, entry.name), true);
  }
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


    return { external, rtk, modelDefaults };
  } finally {
    rl.close();
  }
}

async function backupExistingConfig() {
  const hasAgentConfig = await pathExists(agentDir);
  if (!hasAgentConfig) {
    console.log(`\n${installStep(1)} No existing Pi configuration to back up.`);
    return null;
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupDir = path.join(homeDir, `.pi-backup-${timestamp}`);
  console.log(`\n${installStep(1)} Backing up existing configuration -> ${backupDir}`);
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
  return backupDir;
}

async function cleanPlugins() {
  const total = installerOptions.cleanPlugins ? 7 : 6;
  console.log(`\n[2/${total}] Clearing installed Pi plugins for a clean reinstall`);
  const extensionsPath = path.join(agentDir, "extensions");
  const npmPath = path.join(agentDir, "npm");
  const settingsPath = path.join(agentDir, "settings.json");

  console.log(`  remove ${extensionsPath}`);
  console.log(`  remove ${npmPath}`);
  console.log(`  clear packages in ${settingsPath}`);
  if (installerOptions.dryRun) return;

  await rm(extensionsPath, { recursive: true, force: true });
  await rm(npmPath, { recursive: true, force: true });

  const settings = await readJson(settingsPath);
  if (!isPlainObject(settings)) {
    throw new Error(`Invalid settings object in ${settingsPath}`);
  }
  delete settings.packages;
  await writeFile(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
}

async function restoreFiles() {
  console.log(`\n${installStep(2)} Merging missing skills, themes, and extension configuration`);
  if (!installerOptions.dryRun) {
    await mkdir(agentDir, { recursive: true });
  }

  await mergeRepositorySkills();
  await mergeMissingTree(path.join(repoDir, "themes"), path.join(agentDir, "themes"));

  const configFiles = [
    "APPEND_SYSTEM.md",
    "slim-skills-whitelist.json",
    "pi-plan-mode.json",
  ];
  for (const file of configFiles) {
    await copyPath(path.join(repoDir, "config", file), path.join(agentDir, file));
  }

  for (const file of ["matugen-chrome.ts", "matugen-footer-core.mjs"]) {
    await copyPath(
      path.join(repoDir, "extensions", file),
      path.join(agentDir, "extensions", file),
    );
  }
  await copyPath(
    path.join(repoDir, "extensions", "matugen-footer"),
    path.join(agentDir, "extensions", "matugen-footer"),
  );
}

async function mergeModelOverrides() {
  console.log("  applying public model capability overrides");
  const overridesPath = path.join(repoDir, "config", "models-overrides.json");
  const modelsPath = path.join(agentDir, "models.json");
  const overrides = await readJson(overridesPath);
  const modelsConfig = await readJson(modelsPath);

  if (!isPlainObject(modelsConfig) || !isPlainObject(modelsConfig.providers)) {
    console.log(`  skip ${modelsPath}: no provider model configuration`);
    return;
  }

  const overrideProviders = isPlainObject(overrides.providers) ? overrides.providers : {};
  let changed = false;
  for (const [providerId, providerOverrides] of Object.entries(overrideProviders)) {
    const providerConfig = modelsConfig.providers[providerId];
    if (!isPlainObject(providerConfig) || !isPlainObject(providerOverrides)) continue;
    const configuredModels = providerConfig.models;
    const modelOverrides = providerOverrides.models;
    if (!Array.isArray(configuredModels) || !Array.isArray(modelOverrides)) continue;

    const overridesById = new Map(
      modelOverrides
        .filter((model) => isPlainObject(model) && typeof model.id === "string")
        .map((model) => [model.id, model]),
    );
    providerConfig.models = configuredModels.map((model) => {
      if (!isPlainObject(model) || typeof model.id !== "string") return model;
      const override = overridesById.get(model.id);
      if (!override) return model;
      changed = true;
      return mergeObjects(model, override);
    });
  }

  if (!changed) {
    console.log("  no matching local model entries to update");
    return;
  }
  console.log(`  merge ${overridesPath} -> ${modelsPath}`);
  if (installerOptions.dryRun) return;
  await writeFile(modelsPath, `${JSON.stringify(modelsConfig, null, 2)}\n`, "utf8");
}

async function mergePublicSettings(includeModelDefaults) {
  console.log(`\n${installStep(3)} Merging public settings`);
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
  if (installerOptions.cleanPlugins) {
    delete mergedSettings.packages;
  }
  if (installerOptions.dryRun) {
    console.log(`  merge ${publicSettingsPath} -> ${settingsPath}`);
    return;
  }
  await mkdir(agentDir, { recursive: true });
  await writeFile(settingsPath, `${JSON.stringify(mergedSettings, null, 2)}\n`, "utf8");
}


async function retireLegacyLargeLauncher() {
  if (isWindows) return;

  const legacySource = path.join(repoDir, "bin", "pi-large");
  const destination = path.join(homeDir, ".local", "bin", "pi-large");
  let linkTarget;
  try {
    linkTarget = await readlink(destination);
  } catch (error) {
    if (error?.code === "ENOENT" || error?.code === "EINVAL") return;
    throw error;
  }

  const resolvedTarget = path.resolve(path.dirname(destination), linkTarget);
  if (resolvedTarget !== legacySource) return;

  console.log(`  remove retired pi-large launcher ${destination}`);
  if (!installerOptions.dryRun) {
    await rm(destination, { force: true });
  }
}

async function installLocalPackages() {
  console.log(`\n${installStep(4)} Installing local Pi packages`);
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
  for (const packageDir of packageDirs.filter((entry) => !retiredLocalPackageNames.has(path.basename(entry)))) {
    const packageJson = await readJson(path.join(packageDir, "package.json"), {});
    if (isPlainObject(packageJson.dependencies) && Object.keys(packageJson.dependencies).length > 0) {
      run(commandName("npm"), ["install", "--omit=dev", "--omit=peer"], { cwd: packageDir });
    }
    run(commandName("pi"), ["install", packageDir]);
  }
  await normalizeAnchoredStandardOrder();

  console.log("  apply Pi Chinese UI localization");
  run(process.execPath, [path.join(extensionsDir, "pi-zh-localizer", "localize.mjs")]);
  console.log("  verify Default/Large presentation bundle sync");
  run(process.execPath, [path.join(repoDir, "scripts", "sync-large-beautify.mjs"), "--check"]);
  run(process.execPath, [path.join(repoDir, "scripts", "verify-tool-presentations.mjs")]);
  await retireLegacyLargeLauncher();
}

async function installExternalPackages(enabled) {
  console.log(`\n${installStep(5)} Installing external Pi packages`);
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


async function installOptionalTools(choices) {
  console.log(`\n${installStep(6)} Installing optional command-line tools`);
  let installedAny = false;


  if (choices.rtk) {
    installedAny = true;
    try {
      // All platforms use the verified installer: GitHub release checksums.txt,
      // sha256 verification, atomic extraction, and a --version smoke run.
      run(process.execPath, [path.join(repoDir, "scripts", "install-rtk.mjs")]);
    } catch (error) {
      console.warn(`  RTK installation skipped: ${error.message}`);
      console.warn("  Pi configuration is complete; install RTK manually after resolving the local script policy.");
    }
  }

  if (!installedAny) {
    console.log("  skipped");
  }
}

async function securePrivateFiles(backupDir) {
  if (installerOptions.dryRun) return;

  for (const entry of await readdir(agentDir, { withFileTypes: true })) {
    if (entry.isFile() && (entry.name === "models.json" || entry.name.startsWith("models.json."))) {
      await chmod(path.join(agentDir, entry.name), 0o600);
    }
  }

  async function secureTree(root) {
    if (!(await pathExists(root))) return;
    await chmod(root, 0o700);
    for (const entry of await readdir(root, { withFileTypes: true })) {
      const target = path.join(root, entry.name);
      if (entry.isDirectory()) {
        await secureTree(target);
      } else if (entry.isFile()) {
        await chmod(target, 0o600);
      }
    }
  }

  if (backupDir) await secureTree(path.join(backupDir, "agent"));
}

function verifyPi() {
  if (installerOptions.dryRun) {
    return;
  }
  if (!commandExists(commandName("pi"))) {
    throw new Error("Pi is not available on PATH. Run install.sh or install.ps1 first.");
  }
}

async function main() {
  installerOptions = parseArgs(process.argv.slice(2));
  const choices = await resolveChoices();

  console.log("pi_config cross-platform installer");
  console.log(`  platform: ${process.platform} ${process.arch}`);
  console.log(`  repository: ${repoDir}`);
  console.log(`  target: ${agentDir}`);
  console.log(`  external packages: ${choices.external ? "yes" : "no"}`);
  console.log(`  RTK binary: ${choices.rtk ? "yes" : "no"}`);
  console.log(`  provider/model defaults: ${choices.modelDefaults ? "apply" : "keep current"}`);
  console.log(`  clean plugins: ${installerOptions.cleanPlugins ? "yes" : "no"}`);
  if (installerOptions.cleanPlugins && !choices.external) {
    console.warn("  warning: external packages are disabled and will not be restored after plugin cleanup");
  }
  if (installerOptions.dryRun) {
    console.log("  mode: dry run");
  }

  verifyPi();
  const backupDir = await backupExistingConfig();
  if (installerOptions.cleanPlugins) {
    await cleanPlugins();
  }
  await restoreFiles();
  await mergeModelOverrides();
  await mergePublicSettings(choices.modelDefaults);
  await installLocalPackages();
  await installExternalPackages(choices.external);
  await installOptionalTools(choices);
  await securePrivateFiles(backupDir);

  if (installerOptions.dryRun) {
    console.log("\nDry run complete. No changes were made.");
  } else {
    console.log("\nInstallation complete.");
    if (backupDir) {
      console.log(`Backup: ${backupDir}`);
    }
    console.log("Next: run pi, use /provider add to configure a provider, then select it with /model.");
  }
}

export { run };

const isMainModule = process.argv[1] &&
  (() => { try { return realpathSync(process.argv[1]); } catch { return undefined; } })() ===
  realpathSync(fileURLToPath(import.meta.url));
if (isMainModule) {
  try {
    await main();
  } catch (error) {
    console.error(`\nInstallation failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
