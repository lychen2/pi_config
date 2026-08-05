import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export const AFT_PROFILES = ["balanced", "minimal", "full"] as const;
export type AftProfile = (typeof AFT_PROFILES)[number];
export type AftConfig = Record<string, unknown>;

const profileSettings: Record<AftProfile, Pick<AftConfig, "search_index" | "semantic_search" | "callgraph_store">> = {
  balanced: {
    search_index: true,
    semantic_search: false,
    callgraph_store: false,
  },
  minimal: {
    search_index: false,
    semantic_search: false,
    callgraph_store: false,
  },
  full: {
    search_index: true,
    semantic_search: true,
    callgraph_store: true,
  },
};

export function aftConfigPath(): string {
  return join(process.env.XDG_CONFIG_HOME?.trim() || join(homedir(), ".config"), "cortexkit", "aft.jsonc");
}

export function loadAftConfig(path = aftConfigPath()): AftConfig {
  if (!existsSync(path)) return {};

  let value: unknown;
  try {
    value = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Cannot read AFT config at ${path}: ${reason}`);
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`AFT config at ${path} must be a JSON object`);
  }
  return value as AftConfig;
}

export function saveAftConfig(config: AftConfig, path = aftConfigPath()): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp-${process.pid}`;
  writeFileSync(temporaryPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  renameSync(temporaryPath, path);
}

export function applyAftProfile(config: AftConfig, profile: AftProfile): AftConfig {
  return { ...config, ...profileSettings[profile] };
}

export function currentAftProfile(config: AftConfig): AftProfile | "custom" {
  for (const profile of AFT_PROFILES) {
    const settings = profileSettings[profile];
    if (
      config.search_index === settings.search_index
      && config.semantic_search === settings.semantic_search
      && config.callgraph_store === settings.callgraph_store
    ) {
      return profile;
    }
  }
  return "custom";
}

export function parseAftProfile(value: string): AftProfile | undefined {
  return AFT_PROFILES.find((profile) => profile === value);
}

export function aftProfileLabel(profile: AftProfile): string {
  switch (profile) {
    case "balanced":
      return "Balanced: indexed search, no language servers";
    case "minimal":
      return "Minimal: no background index or language servers";
    case "full":
      return "Full: semantic search, call graph, and language servers";
  }
}
