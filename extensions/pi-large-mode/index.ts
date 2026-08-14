import { spawn } from "node:child_process";
import {
  access,
  cp,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  rmdir,
  symlink,
  stat,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { getAgentDir, type ExtensionAPI, type ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import {
  BEAUTIFY_PACKAGE_NAME,
  LARGE_PROFILE_VERSION,
  LARGE_THEME,
  PROFILE_MARKER_FILE,
  buildLargeGlobalSettings,
  buildLargeProjectSettings,
  flowSourceForVersion,
  flowVersionFromSource,
  isCompleteFlowSettings,
  mergeModelSettings,
  parseLargeCommand,
  pickModelSettings,
  rewriteAgentPath,
  type FileSnapshot,
  type JsonObject,
  type LargeModeState,
} from "./core.ts";

const CONTROLLER_PATH = fileURLToPath(import.meta.url);
const COMPANION_NAMES = ["pi-maestro-teammate", "pi-cockpit"] as const;
const REQUIRED_MAESTRO_DIRS = ["workflows", "arch-kb", "prepare", "ref", "manifests"] as const;
const ALLOWED_STAGING_AGENT_ENTRIES = new Set([
  "keybindings.json",
  "npm",
  "pi-maestro-flow-companions.json",
  "settings.json",
]);

type ProfileMarker = {
  kind: "pi-large-flow";
  flowSource: string;
  profileVersion?: number;
  createdAt: string;
};

type FlowProfile = {
  root: string;
  npm: string;
  maestro: string;
  templateAgent: string;
};

type ProgressReporter = (percent: number | undefined, label: string) => void;

let progressFrame = 0;

function reportProgress(ctx: ExtensionCommandContext, percent: number | undefined, label: string): void {
  const width = 20;
  if (percent === undefined) {
    const span = 5;
    const start = progressFrame++ % (width - span + 1);
    const bar = `${"-".repeat(start)}${"#".repeat(span)}${"-".repeat(width - start - span)}`;
    ctx.ui.setWidget("pi-large-mode-progress", [`Large [${bar}] 安装中 ${label}`], { placement: "aboveEditor" });
    return;
  }
  const filled = Math.round((Math.max(0, Math.min(100, percent)) / 100) * width);
  const bar = `${"#".repeat(filled)}${"-".repeat(width - filled)}`;
  ctx.ui.setWidget("pi-large-mode-progress", [`Large [${bar}] ${percent}% ${label}`], { placement: "aboveEditor" });
}

function clearProgress(ctx: ExtensionCommandContext): void {
  ctx.ui.setWidget("pi-large-mode-progress", undefined);
}

function agentDir(): string {
  return getAgentDir();
}

function npmDir(): string {
  return join(agentDir(), "npm");
}

function maestroDir(): string {
  return process.env.MAESTRO_HOME?.trim() || join(homedir(), ".maestro");
}

function transactionRoot(): string {
  return join(dirname(agentDir()), ".pi-large-mode");
}

function statePath(): string {
  return join(transactionRoot(), "state.json");
}

function inactiveProfile(): FlowProfile {
  const root = join(transactionRoot(), "inactive");
  return {
    root,
    npm: join(root, "agent", "npm"),
    maestro: join(root, "maestro"),
    templateAgent: join(root, "agent"),
  };
}

function stagingProfile(): FlowProfile {
  const root = join(transactionRoot(), `staging-${Date.now()}-${process.pid}`);
  return {
    root,
    npm: join(root, "agent", "npm"),
    maestro: join(root, "maestro"),
    templateAgent: join(root, "agent"),
  };
}

function markerPath(root: string): string {
  return join(root, PROFILE_MARKER_FILE);
}

function beautifySourceDir(): string {
  // <repo>/extensions/pi-large-beautify, derived from <repo>/extensions/pi-large-mode/index.ts.
  return join(dirname(CONTROLLER_PATH), "..", "..", "extensions", BEAUTIFY_PACKAGE_NAME);
}

function beautifyInstallDir(profile: FlowProfile): string {
  return join(profile.npm, "node_modules", BEAUTIFY_PACKAGE_NAME);
}

function settingsPath(): string {
  return join(agentDir(), "settings.json");
}

function keybindingsPath(): string {
  return join(agentDir(), "keybindings.json");
}

function companionsPath(): string {
  return join(agentDir(), "pi-maestro-flow-companions.json");
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function readJsonObject(path: string): Promise<JsonObject> {
  const parsed = JSON.parse(await readFile(path, "utf8")) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Expected a JSON object: ${path}`);
  }
  return parsed as JsonObject;
}

async function writeTextAtomically(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporary, content, "utf8");
  await rename(temporary, path);
}

async function writeJsonAtomically(path: string, value: unknown): Promise<void> {
  await writeTextAtomically(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function snapshotFile(path: string): Promise<FileSnapshot> {
  const parentExisted = await exists(dirname(path));
  try {
    return { exists: true, content: await readFile(path, "utf8"), parentExisted };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { exists: false, parentExisted };
    throw error;
  }
}

async function restoreFile(path: string, snapshot: FileSnapshot | undefined): Promise<void> {
  if (!snapshot) return;
  if (snapshot.exists) {
    await writeTextAtomically(path, snapshot.content ?? "");
    return;
  }
  await rm(path, { force: true });
  if (snapshot.parentExisted === false) {
    try {
      await rmdir(dirname(path));
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT" && code !== "ENOTEMPTY") throw error;
    }
  }
}

async function readMarker(root: string): Promise<ProfileMarker | undefined> {
  try {
    const value = await readJsonObject(markerPath(root));
    if (value.kind === "pi-large-flow" && typeof value.flowSource === "string" && flowVersionFromSource(value.flowSource)) {
      return value as ProfileMarker;
    }
  } catch {
    // A missing or invalid marker identifies a non-Flow root.
  }
  return undefined;
}

async function writeMarker(root: string, flowSource: string): Promise<void> {
  await writeJsonAtomically(markerPath(root), {
    kind: "pi-large-flow",
    flowSource,
    profileVersion: LARGE_PROFILE_VERSION,
    createdAt: new Date().toISOString(),
  } satisfies ProfileMarker);
}

async function runProcess(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
  onOutput?: (line: string) => void,
): Promise<string> {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, { env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const capture = (target: "stdout" | "stderr", chunk: Buffer) => {
      const text = chunk.toString();
      if (target === "stdout") stdout += text;
      else stderr += text;
      const line = text.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean).at(-1);
      if (line) onOutput?.(line);
    };
    child.stdout.on("data", (chunk: Buffer) => capture("stdout", chunk));
    child.stderr.on("data", (chunk: Buffer) => capture("stderr", chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout.trim());
        return;
      }
      const detail = (stderr || stdout).trim().slice(-6000);
      reject(new Error(`${command} exited with code ${code}${detail ? `: ${detail}` : ""}`));
    });
  });
}

async function runOfficialFlowSetup(
  profile: FlowProfile,
  stagingHome: string,
  progress?: ProgressReporter,
): Promise<void> {
  const flowRoot = join(profile.npm, "node_modules", "pi-maestro-flow");
  const env = {
    ...process.env,
    HOME: stagingHome,
    PI_CODING_AGENT_DIR: profile.templateAgent,
    MAESTRO_HOME: profile.maestro,
  };
  const scripts = [
    ["configure-keybindings.mjs", "配置快捷键"],
    ["install-workflows.mjs", "安装 Maestro workflows"],
    ["register-companion-packages.mjs", "注册 companion packages"],
  ] as const;
  for (const [script, label] of scripts) {
    const scriptPath = join(flowRoot, "scripts", script);
    if (!await exists(scriptPath)) {
      throw new Error(`Flow 当前版本缺少官方配置脚本: ${script}`);
    }
    progress?.(75, label);
    await runProcess(process.execPath, [scriptPath], env);
  }
  const sidecar = join(profile.templateAgent, "pi-maestro-flow-companions.json");
  if (!await exists(sidecar)) {
    throw new Error("Flow 官方配置完成后未生成 companion sidecar");
  }
}

async function exchangeDirectories(left: string, right: string): Promise<void> {
  if (!await exists(left) || !await exists(right)) {
    throw new Error(`Cannot exchange missing directories: ${left}, ${right}`);
  }
  await runProcess("mv", ["--exchange", "--no-target-directory", left, right]);
}

async function piCommand(): Promise<{ command: string; args: string[] }> {
  const override = process.env.PI_LARGE_PI_COMMAND?.trim();
  if (override) return { command: override, args: [] };
  if (!process.argv[1]) throw new Error("Cannot resolve the running Pi CLI entry point");
  return { command: process.execPath, args: [process.argv[1]] };
}

async function rewriteJsonPaths(path: string, fromAgent: string, fromMaestro: string): Promise<void> {
  const value = await readJsonObject(path);
  const agentRewritten = rewriteAgentPath(value, fromAgent, agentDir());
  const maestroRewritten = rewriteAgentPath(agentRewritten, fromMaestro, maestroDir());
  await writeJsonAtomically(path, maestroRewritten);
}

async function rewriteManifestPaths(manifestsDir: string, fromAgent: string, fromMaestro: string): Promise<void> {
  if (!await exists(manifestsDir)) return;
  for (const entry of await readdir(manifestsDir, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith(".json")) {
      await rewriteJsonPaths(join(manifestsDir, entry.name), fromAgent, fromMaestro);
    }
  }
}

async function assertKnownAgentSideEffects(stagingAgent: string): Promise<void> {
  const entries = await readdir(stagingAgent);
  const unexpected = entries.filter((entry) => !ALLOWED_STAGING_AGENT_ENTRIES.has(entry));
  if (unexpected.length > 0) {
    throw new Error(`Flow ${"postinstall"} added unsupported agent files: ${unexpected.join(", ")}`);
  }
}

async function companionVersions(profileNpm: string): Promise<Record<string, string>> {
  const versions: Record<string, string> = {};
  for (const name of COMPANION_NAMES) {
    const manifest = await readJsonObject(join(profileNpm, "node_modules", name, "package.json"));
    if (manifest.name !== name || typeof manifest.version !== "string") {
      throw new Error(`Invalid installed companion manifest: ${name}`);
    }
    versions[name] = manifest.version;
  }
  return versions;
}

async function directoryContainsFile(root: string): Promise<boolean> {
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (entry.isFile()) return true;
    if (entry.isDirectory() && await directoryContainsFile(join(root, entry.name))) return true;
  }
  return false;
}

export async function validateMaestroInstall(maestroRoot: string): Promise<void> {
  for (const name of REQUIRED_MAESTRO_DIRS) {
    const path = join(maestroRoot, name);
    const metadata = await stat(path).catch(() => undefined);
    if (!metadata?.isDirectory() || !await directoryContainsFile(path)) {
      throw new Error(`Flow workflow installation is incomplete: ${name}`);
    }
  }
}

async function validateBeautifyPackage(profile: FlowProfile): Promise<void> {
  const beautifyDir = beautifyInstallDir(profile);
  const manifest = await readJsonObject(join(beautifyDir, "package.json"));
  if (manifest.name !== BEAUTIFY_PACKAGE_NAME) {
    throw new Error("Beautify package manifest name is incorrect");
  }
  const pi = manifest.pi;
  if (!pi || typeof pi !== "object" || Array.isArray(pi)) {
    throw new Error("Beautify package has no pi manifest");
  }
  const extensions = (pi as JsonObject).extensions;
  const requiredExtensions = [
    "./index.ts",
    `../pi-maestro-teammate/src/extension/index.ts`,
    `../pi-cockpit/src/extension/index.ts`,
  ];
  if (!Array.isArray(extensions) || requiredExtensions.some((entry) => !extensions.includes(entry))) {
    throw new Error("Beautify package does not aggregate the Flow companion surface");
  }
  if (!await exists(join(beautifyDir, "index.ts"))) {
    throw new Error("Beautify package entry is missing");
  }
  const theme = await readJsonObject(join(beautifyDir, "themes", `${LARGE_THEME}.json`));
  if (theme.name !== LARGE_THEME) {
    throw new Error(`Beautify package theme is not ${LARGE_THEME}`);
  }
}

async function validateProfile(profile: FlowProfile, flowSource: string): Promise<void> {
  const version = flowVersionFromSource(flowSource);
  if (!version) throw new Error(`Flow source is not an exact version: ${flowSource}`);

  const rootManifest = await readJsonObject(join(profile.npm, "package.json"));
  const rootDependencies = rootManifest.dependencies;
  if (!rootDependencies || typeof rootDependencies !== "object" || Array.isArray(rootDependencies)) {
    throw new Error("Flow npm root has no dependency map");
  }
  if (Object.keys(rootDependencies as JsonObject).join(",") !== "pi-maestro-flow") {
    throw new Error("Flow npm root contains unrelated top-level dependencies");
  }

  const lock = await readJsonObject(join(profile.npm, "package-lock.json"));
  const lockPackages = lock.packages;
  if (!lockPackages || typeof lockPackages !== "object" || Array.isArray(lockPackages)) {
    throw new Error("Flow npm root has no package-lock package map");
  }
  const lockPackageMap = lockPackages as JsonObject;
  const rootLock = lockPackageMap[""];
  if (!rootLock || typeof rootLock !== "object" || Array.isArray(rootLock)) {
    throw new Error("Flow package-lock has no root entry");
  }
  const rootLockDependencies = (rootLock as JsonObject).dependencies;
  if (!rootLockDependencies || typeof rootLockDependencies !== "object" || Array.isArray(rootLockDependencies)
    || Object.keys(rootLockDependencies as JsonObject).join(",") !== "pi-maestro-flow") {
    throw new Error("Flow package-lock contains unrelated top-level dependencies");
  }

  const flowManifest = await readJsonObject(join(profile.npm, "node_modules", "pi-maestro-flow", "package.json"));
  if (flowManifest.name !== "pi-maestro-flow" || flowManifest.version !== version) {
    throw new Error(`Installed Flow manifest does not match ${flowSource}`);
  }
  const flowLock = lockPackageMap["node_modules/pi-maestro-flow"];
  if (!flowLock || typeof flowLock !== "object" || Array.isArray(flowLock)
    || (flowLock as JsonObject).version !== version) {
    throw new Error(`Flow package-lock entry does not match ${flowSource}`);
  }

  const dependencies = flowManifest.dependencies;
  const lockedFlowDependencies = (flowLock as JsonObject).dependencies;
  if (!dependencies || typeof dependencies !== "object" || Array.isArray(dependencies)
    || !lockedFlowDependencies || typeof lockedFlowDependencies !== "object" || Array.isArray(lockedFlowDependencies)) {
    throw new Error("Flow manifest or lock entry has no dependency map");
  }

  const versions = await companionVersions(profile.npm);
  const companionPaths: Record<string, string> = {};
  for (const name of COMPANION_NAMES) {
    const declared = (dependencies as JsonObject)[name];
    if (typeof declared !== "string" || (lockedFlowDependencies as JsonObject)[name] !== declared) {
      throw new Error(`Flow dependency metadata is inconsistent for ${name}`);
    }
    const companionLock = lockPackageMap[`node_modules/${name}`];
    if (!companionLock || typeof companionLock !== "object" || Array.isArray(companionLock)
      || (companionLock as JsonObject).version !== versions[name]) {
      throw new Error(`Companion package-lock entry does not match installed manifest: ${name}`);
    }
    companionPaths[name] = join(agentDir(), "npm", "node_modules", name);
  }

  await validateBeautifyPackage(profile);
  const beautifyPath = join(agentDir(), "npm", "node_modules", BEAUTIFY_PACKAGE_NAME);
  const settings = await readJsonObject(join(profile.templateAgent, "settings.json"));
  if (!isCompleteFlowSettings(settings, flowSource, beautifyPath, CONTROLLER_PATH)) {
    throw new Error("Flow installation did not produce the complete clean package profile");
  }

  const sidecar = await readJsonObject(join(profile.templateAgent, "pi-maestro-flow-companions.json"));
  const companions = sidecar.companions;
  if (sidecar.version !== 1 || !companions || typeof companions !== "object" || Array.isArray(companions)) {
    throw new Error("Flow companion registry is incomplete");
  }
  if (Object.keys(companions as JsonObject).sort().join(",") !== "pi-cockpit,pi-maestro-teammate") {
    throw new Error("Flow companion registry contains unrelated entries");
  }
  for (const name of COMPANION_NAMES) {
    const entry = (companions as JsonObject)[name];
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`Missing companion registry entry: ${name}`);
    }
    const record = entry as JsonObject;
    if (record.source !== companionPaths[name] || record.canonicalSource !== companionPaths[name] || record.version !== versions[name]) {
      throw new Error(`Companion registry does not match installed manifest: ${name}`);
    }
  }

  const keybindings = await readJsonObject(join(profile.templateAgent, "keybindings.json"));
  const thinkingCycle = keybindings["app.thinking.cycle"];
  const keys = Array.isArray(thinkingCycle) ? thinkingCycle : [thinkingCycle];
  if (!keys.includes("ctrl+shift+e") || keys.includes("shift+tab")) {
    throw new Error("Flow keybinding configuration is incomplete");
  }
  await validateMaestroInstall(profile.maestro);
  const npmMarker = await readMarker(profile.npm);
  const maestroMarker = await readMarker(profile.maestro);
  if (npmMarker?.flowSource !== flowSource || maestroMarker?.flowSource !== flowSource) {
    throw new Error("Flow profile markers are inconsistent");
  }
  if (npmMarker?.profileVersion !== LARGE_PROFILE_VERSION || maestroMarker?.profileVersion !== LARGE_PROFILE_VERSION) {
    throw new Error("Flow profile markers are from an outdated profile format");
  }
}

async function installBeautifyPackage(
  profile: FlowProfile,
  flowSource: string,
  progress?: ProgressReporter,
): Promise<void> {
  progress?.(78, "安装 Large 美化包");
  const source = beautifySourceDir();
  const destination = beautifyInstallDir(profile);
  if (!await exists(join(source, "index.ts")) || !await exists(join(source, "package.json"))) {
    throw new Error(`Large 美化包不完整: ${source}`);
  }
  await rm(destination, { recursive: true, force: true });
  const excluded = new Set(["node_modules", "package-lock.json", "tsconfig.json", "tests"]);
  await cp(source, destination, {
    recursive: true,
    filter: (entry) => {
      const name = entry.split(sep).pop() ?? "";
      return !excluded.has(name);
    },
  });

  // Fold the Flow companions into the beautify package so the top-level package
  // list stays at exactly two entries. The staging path is rewritten to the real
  // agent directory by the later rewriteJsonPaths pass.
  const settingsFile = join(profile.templateAgent, "settings.json");
  const settings = await readJsonObject(settingsFile);
  settings.packages = [flowSource, destination];
  await writeJsonAtomically(settingsFile, settings);
}

async function buildStagingProfile(flowSource: string, progress?: ProgressReporter): Promise<FlowProfile> {
  const profile = stagingProfile();
  const stagingAgent = profile.templateAgent;
  const stagingHome = join(profile.root, "home");
  progress?.(25, "准备隔离安装目录");
  try {
    await mkdir(stagingAgent, { recursive: true });
    await mkdir(profile.maestro, { recursive: true });
    await mkdir(join(stagingHome, ".pi"), { recursive: true });
    await symlink(stagingAgent, join(stagingHome, ".pi", "agent"), "dir");
    const currentSettings = await readJsonObject(settingsPath());
    await writeJsonAtomically(join(stagingAgent, "settings.json"), buildLargeGlobalSettings(currentSettings, CONTROLLER_PATH));
    const pi = await piCommand();
    const installStartedAt = Date.now();
    let latestInstallOutput = "等待 npm 输出";
    const refreshInstallProgress = () => {
      const elapsed = Math.max(0, Math.floor((Date.now() - installStartedAt) / 1000));
      progress?.(undefined, `已用 ${elapsed}s · 剩余时间未知 · ${latestInstallOutput}`);
    };
    refreshInstallProgress();
    const progressTimer = setInterval(refreshInstallProgress, 1000);
    try {
      await runProcess(pi.command, [...pi.args, "install", flowSource], {
        ...process.env,
        HOME: stagingHome,
        PI_CODING_AGENT_DIR: stagingAgent,
        MAESTRO_HOME: profile.maestro,
      }, (line) => {
        latestInstallOutput = line.slice(-100);
        refreshInstallProgress();
      });
    } finally {
      clearInterval(progressTimer);
    }
    await runOfficialFlowSetup(profile, stagingHome, progress);
    progress?.(75, "安装完成，整理配置");

    await installBeautifyPackage(profile, flowSource, progress);
    await assertKnownAgentSideEffects(stagingAgent);
    await rewriteJsonPaths(join(stagingAgent, "settings.json"), stagingAgent, profile.maestro);
    await rewriteJsonPaths(join(stagingAgent, "pi-maestro-flow-companions.json"), stagingAgent, profile.maestro);
    await rewriteManifestPaths(join(profile.maestro, "manifests"), stagingAgent, profile.maestro);
    await writeMarker(profile.npm, flowSource);
    await writeMarker(profile.maestro, flowSource);
    await rm(stagingHome, { recursive: true, force: true });
    progress?.(85, "验证完整 Flow profile");
    await validateProfile(profile, flowSource);
    return profile;
  } catch (error) {
    await rm(profile.root, { recursive: true, force: true });
    throw error;
  }
}

async function replaceInactiveProfile(staging: FlowProfile): Promise<void> {
  const inactive = inactiveProfile();
  await mkdir(transactionRoot(), { recursive: true });
  if (!await exists(inactive.root)) {
    await rename(staging.root, inactive.root);
    return;
  }
  await exchangeDirectories(staging.root, inactive.root);
  await rm(staging.root, { recursive: true, force: true });
}

async function latestFlowVersion(): Promise<string> {
  const response = await fetch("https://registry.npmjs.org/pi-maestro-flow/latest", {
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw new Error(`npm registry returned ${response.status}`);
  const manifest = await response.json() as { version?: unknown };
  if (typeof manifest.version !== "string") throw new Error("npm registry response has no version");
  flowSourceForVersion(manifest.version);
  return manifest.version;
}

async function readState(): Promise<LargeModeState> {
  try {
    const value = await readJsonObject(statePath());
    if (value.version === 5 && (value.mode === "default" || value.mode === "active")) {
      return value as LargeModeState;
    }
  } catch {
    // Initialize from roots below.
  }
  const activeMarker = await readMarker(npmDir());
  const inactiveMarker = await readMarker(inactiveProfile().npm);
  return {
    version: 5,
    mode: activeMarker ? "active" : "default",
    phase: "stable",
    flowSource: activeMarker?.flowSource ?? inactiveMarker?.flowSource,
    updatedAt: new Date().toISOString(),
  };
}

async function writeState(state: LargeModeState): Promise<void> {
  await writeJsonAtomically(statePath(), { ...state, updatedAt: new Date().toISOString() });
}

function stableState(
  mode: "default" | "active",
  flowSource: string | undefined,
  state: LargeModeState,
  extra: Partial<LargeModeState> = {},
): LargeModeState {
  return {
    ...state,
    version: 5,
    mode,
    phase: "stable",
    flowSource,
    reloadPending: false,
    updatedAt: new Date().toISOString(),
    ...extra,
  };
}

async function applyLargeConfig(templateAgent: string, state: LargeModeState): Promise<void> {
  const currentSettings = await readJsonObject(settingsPath());
  const templateSettings = await readJsonObject(join(templateAgent, "settings.json"));
  const largeSettings = buildLargeGlobalSettings(currentSettings, CONTROLLER_PATH);
  largeSettings.packages = templateSettings.packages;
  await writeJsonAtomically(settingsPath(), largeSettings);
  await writeTextAtomically(keybindingsPath(), await readFile(join(templateAgent, "keybindings.json"), "utf8"));
  await writeTextAtomically(companionsPath(), await readFile(join(templateAgent, "pi-maestro-flow-companions.json"), "utf8"));

  if (state.projectSettingsPath && state.projectSettings) {
    const original = state.projectSettings.exists
      ? JSON.parse(state.projectSettings.content ?? "{}") as JsonObject
      : {};
    await writeJsonAtomically(state.projectSettingsPath, buildLargeProjectSettings(original, CONTROLLER_PATH));
  }
}

async function restoreDefaultConfig(state: LargeModeState): Promise<void> {
  const currentSettings = await readJsonObject(settingsPath());
  if (state.defaultSettings?.exists) {
    const original = JSON.parse(state.defaultSettings.content ?? "{}") as JsonObject;
    const merged = mergeModelSettings(original, currentSettings);
    const modelSettingsChanged = JSON.stringify(pickModelSettings(currentSettings)) !== JSON.stringify(pickModelSettings(original));
    if (modelSettingsChanged) await writeJsonAtomically(settingsPath(), merged);
    else await restoreFile(settingsPath(), state.defaultSettings);
  } else {
    await restoreFile(settingsPath(), state.defaultSettings);
  }
  await restoreFile(keybindingsPath(), state.defaultKeybindings);
  await restoreFile(companionsPath(), state.defaultCompanions);
  if (state.projectSettingsPath) await restoreFile(state.projectSettingsPath, state.projectSettings);
}

async function captureActiveTemplate(templateAgent: string): Promise<void> {
  await mkdir(templateAgent, { recursive: true });
  await writeTextAtomically(join(templateAgent, "settings.json"), await readFile(settingsPath(), "utf8"));
  await writeTextAtomically(join(templateAgent, "keybindings.json"), await readFile(keybindingsPath(), "utf8"));
  await writeTextAtomically(
    join(templateAgent, "pi-maestro-flow-companions.json"),
    await readFile(companionsPath(), "utf8"),
  );
}


async function removeSyntheticDefaultRoots(state: LargeModeState): Promise<void> {
  if (state.defaultNpmExisted === false && !await readMarker(npmDir())) {
    await rm(npmDir(), { recursive: true, force: true });
  }
  if (state.defaultMaestroExisted === false && !await readMarker(maestroDir())) {
    await rm(maestroDir(), { recursive: true, force: true });
  }
}


async function ensureSwapRoots(): Promise<void> {
  await mkdir(npmDir(), { recursive: true });
  await mkdir(maestroDir(), { recursive: true });
}

async function recoverTransaction(state: LargeModeState): Promise<LargeModeState> {
  const inactive = inactiveProfile();
  if (state.phase === "stable") {
    if (state.mode === "default") {
      const cached = await readMarker(inactive.npm);
      if (cached && cached.flowSource !== state.flowSource) {
        const reconciled = stableState("default", cached.flowSource, state, { reloadPending: state.reloadPending });
        await writeState(reconciled);
        return reconciled;
      }
    }
    return state;
  }

  await ensureSwapRoots();
  if (state.phase === "activating") {
    const target = state.flowSource;
    if (!target) throw new Error("Interrupted activation has no exact Flow source");
    if ((await readMarker(npmDir()))?.flowSource === target) await exchangeDirectories(npmDir(), inactive.npm);
    if ((await readMarker(maestroDir()))?.flowSource === target) await exchangeDirectories(maestroDir(), inactive.maestro);
    await restoreDefaultConfig(state);
    await removeSyntheticDefaultRoots(state);
    const recovered = stableState("default", target, state, { reloadPending: true });
    await writeState(recovered);
    return recovered;
  }

  if (await readMarker(npmDir())) await exchangeDirectories(npmDir(), inactive.npm);
  if (await readMarker(maestroDir())) await exchangeDirectories(maestroDir(), inactive.maestro);
  await restoreDefaultConfig(state);
  await removeSyntheticDefaultRoots(state);
  const recovered = stableState("default", state.flowSource, state, { reloadPending: true });
  await writeState(recovered);
  return recovered;
}

async function reloadAndCommit(ctx: ExtensionCommandContext, state: LargeModeState): Promise<boolean> {
  clearProgress(ctx);
  try {
    await ctx.reload();
  } catch (error) {
    await writeState({ ...state, reloadPending: true });
    ctx.ui.notify(
      `持久配置已提交，但当前会话 reload 失败；执行 /reload 或重试 /large: ${error instanceof Error ? error.message : String(error)}`,
      "warning",
    );
    return false;
  }
  try {
    await writeState({ ...state, reloadPending: false });
  } catch {
    // The committed state remains reloadPending=true and can be retried from the new context.
  }
  return true;
}

async function ensureInactiveVersion(flowSource: string, progress?: ProgressReporter): Promise<void> {
  const inactive = inactiveProfile();
  progress?.(20, "检查本地 Flow 缓存");
  const cached = await readMarker(inactive.npm);
  if (cached?.flowSource === flowSource && cached.profileVersion === LARGE_PROFILE_VERSION) {
    try {
      await validateProfile(inactive, flowSource);
      progress?.(85, "缓存验证完成");
      return;
    } catch (error) {
      throw new Error(`本地 Flow 缓存校验失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  await replaceInactiveProfile(await buildStagingProfile(flowSource, progress));
}

async function activate(ctx: ExtensionCommandContext, progress: ProgressReporter): Promise<boolean> {
  progress(10, "读取 Large 状态");
  let state = await recoverTransaction(await readState());
  if (state.mode === "active") {
    ctx.ui.notify(`Large 已启用: ${state.flowSource}${state.reloadPending ? "（当前会话待 reload）" : ""}`, "info");
    return state.reloadPending ? await reloadAndCommit(ctx, state) : false;
  }

  let flowSource = state.flowSource;
  if (!flowSource) {
    progress(15, "查询 Flow 最新版本");
    flowSource = flowSourceForVersion(await latestFlowVersion());
  }
  await ensureInactiveVersion(flowSource, progress);
  const defaultNpmExisted = await exists(npmDir());
  const defaultMaestroExisted = await exists(maestroDir());
  const projectSettingsPath = join(ctx.cwd, ".pi", "settings.json");
  state = {
    version: 5,
    mode: "default",
    phase: "activating",
    flowSource,
    defaultNpmExisted,
    defaultMaestroExisted,
    defaultSettings: await snapshotFile(settingsPath()),
    defaultKeybindings: await snapshotFile(keybindingsPath()),
    defaultCompanions: await snapshotFile(companionsPath()),
    projectSettingsPath,
    projectSettings: await snapshotFile(projectSettingsPath),
    updatedAt: new Date().toISOString(),
  };
  await writeState(state);
  await ensureSwapRoots();

  try {
    progress(90, "切换 npm 与 Maestro profile");
    const inactive = inactiveProfile();
    await exchangeDirectories(npmDir(), inactive.npm);
    await exchangeDirectories(maestroDir(), inactive.maestro);
    await applyLargeConfig(inactive.templateAgent, state);
    const active = stableState("active", flowSource, state, { reloadPending: true });
    await writeState(active);
    ctx.ui.notify(`已切换到纯净 Pi + 完整 ${flowSource}`, "info");
    progress(98, "重新加载 Pi");
    return await reloadAndCommit(ctx, active);
  } catch (error) {
    await recoverTransaction(state);
    throw error;
  }
}

async function deactivate(ctx: ExtensionCommandContext, progress: ProgressReporter): Promise<boolean> {
  progress(10, "读取 Large 状态");
  let state = await recoverTransaction(await readState());
  if (state.mode === "default") {
    ctx.ui.notify(`Large 已关闭${state.reloadPending ? "（当前会话待 reload）" : ""}`, "info");
    return state.reloadPending ? await reloadAndCommit(ctx, state) : false;
  }

  state = { ...state, phase: "deactivating" };
  await writeState(state);
  const inactive = inactiveProfile();
  try {
    progress(30, "保存 Flow 缓存");
    await captureActiveTemplate(inactive.templateAgent);
    progress(55, "恢复 npm 与 Maestro profile");
    await exchangeDirectories(npmDir(), inactive.npm);
    await exchangeDirectories(maestroDir(), inactive.maestro);
    progress(80, "恢复配置快照");
    await restoreDefaultConfig(state);
    await removeSyntheticDefaultRoots(state);
    const restored = stableState("default", state.flowSource, state, { reloadPending: true });
    await writeState(restored);
    ctx.ui.notify("已恢复 Large 前的 npm、Maestro 与配置状态", "info");
    progress(98, "重新加载 Pi");
    return await reloadAndCommit(ctx, restored);
  } catch (error) {
    await recoverTransaction(state);
    throw error;
  }
}

async function updateFlow(apply: boolean, ctx: ExtensionCommandContext, progress: ProgressReporter): Promise<void> {
  progress(10, "查询 Flow 最新版本");
  const state = await recoverTransaction(await readState());
  if (apply && state.mode === "active") {
    ctx.ui.notify("请先执行 /large off，再用 /large update apply 离线更新完整 Flow profile", "warning");
    return;
  }

  const current = flowVersionFromSource(state.flowSource ?? "") ?? "未安装";
  const latest = await latestFlowVersion();
  if (!apply) {
    ctx.ui.notify(current === latest ? `Flow 已是最新版本 ${latest}` : `Flow 可更新: ${current} -> ${latest}; 使用 /large update apply`, "info");
    return;
  }
  const nextSource = flowSourceForVersion(latest);
  if (current === latest) {
    await ensureInactiveVersion(nextSource, progress);
    const repaired = stableState("default", nextSource, state, { reloadPending: state.reloadPending });
    await writeState(repaired);
    ctx.ui.notify(`Flow 已是最新版本 ${latest}；完整缓存已验证`, "info");
    return;
  }

  await replaceInactiveProfile(await buildStagingProfile(nextSource, progress));
  const updated = stableState("default", nextSource, state, { reloadPending: state.reloadPending });
  await writeState(updated);
  ctx.ui.notify(`已预安装完整 Flow ${latest}；下次 /large on 直接启用`, "info");
}

async function profileStatus(state: LargeModeState): Promise<string> {
  const target = state.flowSource;
  let complete = state.phase === "stable";
  if (complete && target) {
    try {
      if (state.mode === "active") {
        const active: FlowProfile = {
          root: agentDir(),
          npm: npmDir(),
          maestro: maestroDir(),
          templateAgent: agentDir(),
        };
        await validateProfile(active, target);
      } else {
        await validateProfile(inactiveProfile(), target);
      }
    } catch {
      complete = false;
    }
  }
  return `模式: ${state.mode}; Flow: ${target ?? "未选择"}; profile: ${complete ? "完整" : "不完整/事务待恢复"}${state.reloadPending ? "; 当前会话待 reload" : ""}`;
}

export default function register(pi: ExtensionAPI): void {
  pi.registerCommand("large", {
    description: "切换纯净 Pi + 完整 pi-maestro-flow profile",
    getArgumentCompletions: () => [
      { value: "on", label: "完整安装并启用 Flow" },
      { value: "off", label: "恢复 Large 前 profile" },
      { value: "status", label: "查看模式和 Flow 版本" },
      { value: "update", label: "检查 Flow 更新" },
      { value: "update apply", label: "预安装并应用 Flow 更新" },
    ],
    handler: async (rawArgs, ctx) => {
      const args = rawArgs.trim().split(/\s+/).filter(Boolean);
      const command = parseLargeCommand(args);
      if (command === "invalid") {
        ctx.ui.notify("用法: /large [on|off|status|update [apply]]", "warning");
        return;
      }
      const progress: ProgressReporter = (percent, label) => reportProgress(ctx, percent, label);
      const actionLabel = command === "on" ? "启用 Large" : command === "off" ? "关闭 Large" : "检查/更新 Flow";
      let contextReplaced = false;
      ctx.ui.notify(`${actionLabel} 已开始`, "info");
      progress(1, actionLabel);
      try {
        if (command === "status") {
          const state = await recoverTransaction(await readState());
          ctx.ui.notify(await profileStatus(state), "info");
          return;
        }
        if (command === "update") {
          await updateFlow(args[1]?.toLowerCase() === "apply", ctx, progress);
          return;
        }
        contextReplaced = command === "on"
          ? await activate(ctx, progress)
          : await deactivate(ctx, progress);
      } catch (error) {
        if (!contextReplaced) {
          ctx.ui.notify(`Large 操作失败: ${error instanceof Error ? error.message : String(error)}`, "error");
        }
      } finally {
        if (!contextReplaced) clearProgress(ctx);
      }
    },
  });
}
