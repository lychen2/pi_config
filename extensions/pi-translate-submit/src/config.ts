import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

export const DEFAULT_CONFIG_PATH = join(getAgentDir(), "translate-submit.json");

export type TranslationModel = { provider: string; id: string };
export type TranslationSettings = { model?: TranslationModel };
type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown, name: string): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${name} must be a JSON object.`);
  return value as JsonRecord;
}

function parseModel(value: unknown, name: string): TranslationModel {
  const record = asRecord(value, name);
  if (typeof record.provider !== "string" || !record.provider.trim() || typeof record.id !== "string" || !record.id.trim()) {
    throw new Error(`${name} must contain non-empty provider and id strings.`);
  }
  return { provider: record.provider.trim(), id: record.id.trim() };
}

function parseLegacyModels(value: unknown): TranslationModel | undefined {
  const entries = Object.entries(asRecord(value, "translate-submit settings.models"));
  if (!entries.length) return undefined;
  if (entries.length > 1) {
    throw new Error("translate-submit settings.models has multiple entries. Run /translate-model to choose one independent translation model.");
  }
  const [provider, id] = entries[0];
  if (!provider.trim() || typeof id !== "string" || !id.trim()) {
    throw new Error("translate-submit settings.models must map provider names to model IDs.");
  }
  return { provider: provider.trim(), id: id.trim() };
}

export function parseSettings(value: unknown): TranslationSettings {
  const record = asRecord(value, "translate-submit settings");
  if (record.model !== undefined) return { model: parseModel(record.model, "translate-submit settings.model") };
  if (record.models !== undefined) return { model: parseLegacyModels(record.models) };
  return {};
}

export async function loadSettings(path = DEFAULT_CONFIG_PATH): Promise<TranslationSettings> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }

  try {
    const value = JSON.parse(raw);
    const settings = parseSettings(value);
    const record = asRecord(value, "translate-submit settings");
    if (record.model === undefined && record.models !== undefined && settings.model) await saveSettings(settings, path);
    return settings;
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error(`Settings at ${path} are not valid JSON.`);
    throw error;
  }
}

export async function saveSettings(settings: TranslationSettings, path = DEFAULT_CONFIG_PATH): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
  await rename(temporaryPath, path);
}
