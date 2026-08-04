export type ToolRef = {
  name: string;
};

export type ToolGroupRef = {
  id: string;
  tools: readonly ToolRef[];
};

export type ToolSelectionConfig = {
  disabledExtensions: string[];
  disabledTools: string[];
};

export const EMPTY_TOOL_SELECTION: ToolSelectionConfig = {
  disabledExtensions: [],
  disabledTools: [],
};

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
    disabledExtensions?: unknown;
    disabledTools?: unknown;
    extensions?: unknown;
  };

  return {
    // `extensions` is the legacy deferred-tools field. Treat it as disabled
    // when an existing config is explicitly reused through the env override.
    disabledExtensions: normalizedStrings(
      input.disabledExtensions ?? input.extensions,
      "disabledExtensions",
      true,
    ),
    disabledTools: normalizedStrings(input.disabledTools, "disabledTools"),
  };
}

function canonicalConfig(disabledExtensions: Set<string>, disabledTools: Set<string>): ToolSelectionConfig {
  return {
    disabledExtensions: [...disabledExtensions].sort(),
    disabledTools: [...disabledTools].sort(),
  };
}

export function isToolDisabled(
  config: ToolSelectionConfig,
  extensionId: string,
  toolName: string,
): boolean {
  return config.disabledExtensions.includes(extensionId) || config.disabledTools.includes(toolName);
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

  for (const tool of group.tools) disabledTools.delete(tool.name);
  return canonicalConfig(disabledExtensions, disabledTools);
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
    for (const tool of group.tools) disabledTools.add(tool.name);
  }

  if (enabled) disabledTools.delete(toolName);
  else disabledTools.add(toolName);

  const allDisabled = group.tools.length > 0 && group.tools.every((tool) => disabledTools.has(tool.name));
  if (allDisabled) {
    disabledExtensions.add(group.id);
    for (const tool of group.tools) disabledTools.delete(tool.name);
  }

  return canonicalConfig(disabledExtensions, disabledTools);
}
