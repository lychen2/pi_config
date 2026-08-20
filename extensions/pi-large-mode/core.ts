import type { PackageSource } from "@earendil-works/pi-coding-agent";

export const FLOW_PACKAGE_NAME = "pi-maestro-flow";
export const RESOURCE_BLOCK_ALL = "!**/*";
export const PROFILE_MARKER_FILE = "pi-large-profile.json";
export const LARGE_THEME = "matugen";
export const LARGE_PROFILE_VERSION = 4;
export const BEAUTIFY_PACKAGE_NAME = "pi-large-beautify";

export const MODEL_SETTING_KEYS = [
  "defaultProvider",
  "defaultModel",
  "defaultThinkingLevel",
  "enabledModels",
  "thinkingBudgets",
] as const;

export type JsonObject = Record<string, unknown>;

export type FileSnapshot = {
  exists: boolean;
  content?: string;
  parentExisted?: boolean;
};

export type LargeModeState = {
  version: 5;
  mode: "default" | "active";
  phase: "stable" | "activating" | "deactivating";
  flowSource?: string;
  defaultSettings?: FileSnapshot;
  defaultKeybindings?: FileSnapshot;
  defaultCompanions?: FileSnapshot;
  defaultNpmExisted?: boolean;
  defaultMaestroExisted?: boolean;
  projectSettingsPath?: string;
  projectSettings?: FileSnapshot;
  reloadPending?: boolean;
  updatedAt: string;
};

function hasOwn(value: JsonObject, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function cloneValue<T>(value: T): T {
  return structuredClone(value);
}

export function pickModelSettings(settings: JsonObject): JsonObject {
  const result: JsonObject = {};
  for (const key of MODEL_SETTING_KEYS) {
    if (hasOwn(settings, key)) result[key] = cloneValue(settings[key]);
  }
  return result;
}

export function mergeModelSettings(base: JsonObject, current: JsonObject): JsonObject {
  const result = cloneValue(base);
  for (const key of MODEL_SETTING_KEYS) delete result[key];
  return { ...result, ...pickModelSettings(current) };
}

export function buildLargeGlobalSettings(settings: JsonObject, controllerPath: string): JsonObject {
  return {
    ...pickModelSettings(settings),
    theme: LARGE_THEME,
    // Collapse the startup header and the loaded skills/prompts/extensions/themes lists by default.
    quietStartup: true,
    packages: [],
    extensions: [controllerPath, RESOURCE_BLOCK_ALL, `+${controllerPath}`],
    skills: [RESOURCE_BLOCK_ALL],
    prompts: [RESOURCE_BLOCK_ALL],
    themes: [RESOURCE_BLOCK_ALL],
  };
}

export function buildLargeProjectSettings(settings: JsonObject, controllerPath: string): JsonObject {
  return {
    ...pickModelSettings(settings),
    theme: LARGE_THEME,
    // Collapse the startup header and the loaded skills/prompts/extensions/themes lists by default.
    quietStartup: true,
    packages: [],
    extensions: [controllerPath, RESOURCE_BLOCK_ALL, `+${controllerPath}`],
    skills: [RESOURCE_BLOCK_ALL],
    prompts: [RESOURCE_BLOCK_ALL],
    themes: [RESOURCE_BLOCK_ALL],
  };
}

export function sourceOf(entry: PackageSource): string {
  return typeof entry === "string" ? entry : entry.source;
}

export function flowSourceForVersion(version: string): string {
  const normalized = version.trim();
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(normalized)) {
    throw new Error(`Invalid pi-maestro-flow version: ${version}`);
  }
  return `npm:${FLOW_PACKAGE_NAME}@${normalized}`;
}

export function flowVersionFromSource(source: string): string | undefined {
  const match = /^npm:pi-maestro-flow@(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/.exec(source.trim());
  return match?.[1];
}

export function companionNameFromPath(source: string): "pi-maestro-teammate" | "pi-cockpit" | undefined {
  const normalized = source.replaceAll("\\", "/").replace(/\/+$/, "");
  if (normalized.endsWith("/node_modules/pi-maestro-teammate")) return "pi-maestro-teammate";
  if (normalized.endsWith("/node_modules/pi-cockpit")) return "pi-cockpit";
  return undefined;
}

export function isCompleteFlowSettings(
  settings: JsonObject,
  flowSource: string,
  beautifyPath: string,
  controllerPath: string,
): boolean {
  const packages = Array.isArray(settings.packages) ? settings.packages as PackageSource[] : [];
  const sources = packages.map(sourceOf);
  if (sources.length !== 2) return false;
  if (sources.filter((source) => source === flowSource).length !== 1) return false;
  if (sources.filter((source) => source === beautifyPath).length !== 1) return false;
  return JSON.stringify(settings.extensions) === JSON.stringify([controllerPath, RESOURCE_BLOCK_ALL, `+${controllerPath}`])
    && JSON.stringify(settings.skills) === JSON.stringify([RESOURCE_BLOCK_ALL])
    && JSON.stringify(settings.prompts) === JSON.stringify([RESOURCE_BLOCK_ALL])
    && JSON.stringify(settings.themes) === JSON.stringify([RESOURCE_BLOCK_ALL]);
}

export function rewriteAgentPath(value: unknown, fromAgentDir: string, toAgentDir: string): unknown {
  if (typeof value === "string") {
    return value === fromAgentDir || value.startsWith(`${fromAgentDir}/`)
      ? `${toAgentDir}${value.slice(fromAgentDir.length)}`
      : value;
  }
  if (Array.isArray(value)) return value.map((entry) => rewriteAgentPath(entry, fromAgentDir, toAgentDir));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, rewriteAgentPath(entry, fromAgentDir, toAgentDir)]));
  }
  return value;
}

export function parseLargeCommand(args: string[]): "on" | "off" | "status" | "update" | "invalid" {
  const value = args[0]?.toLowerCase() ?? "on";
  if (value === "on" || value === "off" || value === "status" || value === "update") return value;
  return "invalid";
}

