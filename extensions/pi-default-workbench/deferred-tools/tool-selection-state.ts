export type ToolRef = {
  name: string;
};

export type ToolGroupRef = {
  id: string;
  tools: readonly ToolRef[];
};

export type ToolMode = "adaptive" | "fast" | "full";

export type ToolSelectionConfig = {
  toolMode: ToolMode;
  disabledExtensions: string[];
  disabledTools: string[];
};

export const DEFAULT_TOOL_MODE: ToolMode = "adaptive";
export const SEARCH_TOOL_NAME = "search_tool_bm25";

export const EMPTY_TOOL_SELECTION: ToolSelectionConfig = {
  toolMode: DEFAULT_TOOL_MODE,
  disabledExtensions: [],
  disabledTools: [],
};

export const TOOL_CAPABILITY_GROUPS = {
  core: [
    "read",
    "bash",
    "write",
    "edit",
    "grep",
    "fffind",
    "ffgrep",
    "web_search",
    "todo",
    "ask_user_question",
    "search_skill_bm25",
    "bash_bg",
  ],
  web: ["source_check", "fetch_content", "get_search_content"],
  memory: ["ctx_search", "ctx_memory", "ctx_note", "ctx_expand"],
  ops: ["conflict"],
  preview: ["preview_export"],
  workflow: ["execute_command"],
} as const;

export const FAST_TOOL_NAMES: readonly string[] = TOOL_CAPABILITY_GROUPS.core;
const ADAPTIVE_DEFAULT_TOOL_NAMES = new Set<string>(TOOL_CAPABILITY_GROUPS.memory);

export function capabilityToolsForMatches(
  matchedNames: readonly string[],
  registeredNames: readonly string[],
): string[] {
  const registered = new Set(registeredNames);
  return [...new Set(matchedNames)].filter((name) => registered.has(name));
}

export function missingCoreToolNames(registeredNames: readonly string[]): string[] {
  const registered = new Set(registeredNames);
  return FAST_TOOL_NAMES.filter((name) => !registered.has(name));
}

export function assertCoreToolsRegistered(registeredNames: readonly string[]): void {
  const missing = missingCoreToolNames(registeredNames);
  if (missing.length > 0) {
    throw new Error(`adaptive fast core has unregistered tools: ${missing.join(", ")}`);
  }
}

export function isCoreToolName(name: string): boolean {
  return FAST_TOOL_NAMES.includes(name);
}

export function fastSelectionConfig(groups: readonly ToolGroupRef[]): ToolSelectionConfig {
  const keep = new Set(FAST_TOOL_NAMES);
  const disabledTools = [...new Set(
    groups.flatMap((group) => group.tools.map((tool) => tool.name))
      .filter((name) => !keep.has(name)),
  )].sort();
  return { toolMode: "fast", disabledExtensions: [], disabledTools };
}

export function normalizePackageSource(source: string): string {
  if (source.startsWith("npm:")) {
    const packageName = source.slice(4);
    const versionAt = packageName.lastIndexOf("@");
    const slashAt = packageName.lastIndexOf("/");
    return `npm:${versionAt > slashAt ? packageName.slice(0, versionAt) : packageName}`;
  }

  if (source.startsWith("git:")) {
    const refAt = source.lastIndexOf("@");
    return refAt > source.lastIndexOf("/") ? source.slice(0, refAt) : source;
  }

  return source;
}

export function packageSourceId(source: string): string {
  const normalized = normalizePackageSource(source);
  if (normalized.startsWith("npm:") || normalized.startsWith("git:") || normalized.startsWith("local:")) {
    return normalized;
  }

  const path = normalized.replaceAll("\\", "/").replace(/\/+$/, "");
  const name = path.slice(path.lastIndexOf("/") + 1);
  return `local:${name || normalized}`;
}

function normalizedStrings(value: unknown, field: string, normalizeEntries = false): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string" && entry.trim())) {
    throw new Error(`${field} must be a string array`);
  }

  const values = value.map((entry) => {
    const trimmed = entry.trim();
    return normalizeEntries ? normalizePackageSource(trimmed) : trimmed;
  });
  return [...new Set(values)].sort();
}

export function parseToolSelectionConfig(value: unknown): ToolSelectionConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("tool selector config must be an object");
  }

  const input = value as {
    toolMode?: unknown;
    disabledExtensions?: unknown;
    disabledTools?: unknown;
    extensions?: unknown;
  };
  const toolMode = input.toolMode ?? DEFAULT_TOOL_MODE;
  if (toolMode !== "adaptive" && toolMode !== "fast" && toolMode !== "full") {
    throw new Error("toolMode must be adaptive, fast, or full");
  }

  return {
    toolMode,
    disabledExtensions: normalizedStrings(
      input.disabledExtensions ?? input.extensions,
      "disabledExtensions",
      true,
    ),
    disabledTools: normalizedStrings(input.disabledTools, "disabledTools"),
  };
}

function canonicalConfig(
  toolMode: ToolMode,
  disabledExtensions: Set<string>,
  disabledTools: Set<string>,
): ToolSelectionConfig {
  return {
    toolMode,
    disabledExtensions: [...disabledExtensions].sort(),
    disabledTools: [...disabledTools].sort(),
  };
}

export function setToolMode(config: ToolSelectionConfig, toolMode: ToolMode): ToolSelectionConfig {
  return { ...config, toolMode };
}

export function isToolDisabled(
  config: ToolSelectionConfig,
  extensionId: string,
  toolName: string,
): boolean {
  return config.disabledTools.includes(toolName)
    || (!isCoreToolName(toolName) && config.disabledExtensions.includes(extensionId));
}

export function enabledToolCount(config: ToolSelectionConfig, group: ToolGroupRef): number {
  return group.tools.filter((tool) => !isToolDisabled(config, group.id, tool.name)).length;
}

export function setExtensionEnabled(
  config: ToolSelectionConfig,
  group: ToolGroupRef,
  enabled: boolean,
): ToolSelectionConfig {
  const disabledExtensions = new Set(config.disabledExtensions);
  const disabledTools = new Set(config.disabledTools);

  if (enabled) disabledExtensions.delete(group.id);
  else disabledExtensions.add(group.id);

  for (const tool of group.tools) {
    if (!isCoreToolName(tool.name)) disabledTools.delete(tool.name);
  }
  return canonicalConfig(config.toolMode, disabledExtensions, disabledTools);
}

export function setToolEnabled(
  config: ToolSelectionConfig,
  group: ToolGroupRef,
  toolName: string,
  enabled: boolean,
): ToolSelectionConfig {
  if (!group.tools.some((tool) => tool.name === toolName)) return config;

  const disabledExtensions = new Set(config.disabledExtensions);
  const disabledTools = new Set(config.disabledTools);

  if (disabledExtensions.delete(group.id)) {
    for (const tool of group.tools) {
      if (!isCoreToolName(tool.name)) disabledTools.add(tool.name);
    }
  }

  if (enabled) {
    if (!isCoreToolName(toolName)) disabledTools.delete(toolName);
  } else {
    disabledTools.add(toolName);
  }

  const allDisabled = group.tools.length > 0 && group.tools
    .filter((tool) => !isCoreToolName(tool.name))
    .every((tool) => disabledTools.has(tool.name));
  if (allDisabled) {
    disabledExtensions.add(group.id);
    for (const tool of group.tools) {
      if (!isCoreToolName(tool.name)) disabledTools.delete(tool.name);
    }
  }

  return canonicalConfig(config.toolMode, disabledExtensions, disabledTools);
}

export function activeToolsForMode(
  baseToolNames: readonly string[],
  groups: readonly ToolGroupRef[],
  config: ToolSelectionConfig,
  activatedTools: ReadonlySet<string> = new Set(),
  allToolNames: readonly string[] = baseToolNames,
  preservedActiveTools: readonly string[] = [],
): string[] {
  const extensionTools = groups.flatMap((group) => group.tools.map((tool) => ({ group, name: tool.name })));
  const core = new Set(FAST_TOOL_NAMES);
  const disabledByExtension = new Set(
    extensionTools
      .filter(({ group, name }) => config.disabledExtensions.includes(group.id) && !core.has(name))
      .map(({ name }) => name),
  );
  const desired = config.toolMode === "full"
    ? [...new Set([...allToolNames, ...preservedActiveTools])]
      .filter((name) => !disabledByExtension.has(name))
    : baseToolNames.filter((name) => !config.disabledTools.includes(name));

  for (const { group, name } of extensionTools) {
    if (config.disabledTools.includes(name)) continue;
    if (config.disabledExtensions.includes(group.id) && !core.has(name)) continue;
    const enabled = config.toolMode === "full"
      || (config.toolMode === "fast" && (core.has(name) || name === "update_plan" || name === "obs_recall"))
      || (config.toolMode === "adaptive" && (
        core.has(name)
        || ADAPTIVE_DEFAULT_TOOL_NAMES.has(name)
        || name === "update_plan"
        || name === "obs_recall"
        || name === SEARCH_TOOL_NAME
        || activatedTools.has(name)
      ));
    if (enabled && !desired.includes(name)) desired.push(name);
  }

  const solPlanActive = desired.includes("update_plan") && !config.disabledTools.includes("update_plan");
  return desired.filter((name) => !config.disabledTools.includes(name)
    && (config.toolMode === "adaptive" || name !== SEARCH_TOOL_NAME)
    && (!solPlanActive || (name !== "todo" && name !== "todowrite")));
}
