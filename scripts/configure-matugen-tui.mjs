#!/usr/bin/env node
import { createHash, randomUUID } from "node:crypto";
import {
  lstat, mkdir, readFile, rename, rm, writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repoDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const managed = {
  template: {
    edits: {
      appearance: { before: undefined, after: "dark" },
      "vars.diffRemoved": { before: "{{colors.diff_removed.default.hex}}", after: "#DE9EAC" },
      "vars.error": { before: undefined, after: "#FF6B81" },
      "vars.errorSurface": { before: undefined, after: "#301C24" },
      "vars.errorInk": { before: undefined, after: "#241217" },
      "vars.success": { before: undefined, after: "#A6DFB5" },
      "vars.warning": { before: undefined, after: "#F2C879" },
      "colors.success": { before: "diffAdded", after: "success" },
      "colors.error": { before: "diffRemoved", after: "error" },
      "colors.warning": { before: "warningColor", after: "warning" },
      "colors.selectedBg": { before: "surfaceHighest", after: "surfaceHigh" },
      "colors.userMessageBg": { before: "secondaryContainer", after: "surfaceLow" },
      "colors.toolPendingBg": { before: "surfaceBright", after: "surfaceContainer" },
      "colors.toolSuccessBg": { before: "surfaceVariant", after: "surfaceLow" },
      "colors.toolErrorBg": { before: "surfaceVariant", after: "errorSurface" },
      "colors.thinkingMax": { before: "diffRemoved", after: "primaryBright" },
    },
  },
  generated: {
    edits: {
      appearance: { before: undefined, after: "dark" },
      "vars.diffRemoved": { before: "#ffb3ad", after: "#DE9EAC" },
      "vars.error": { before: undefined, after: "#FF6B81" },
      "vars.errorSurface": { before: undefined, after: "#301C24" },
      "vars.errorInk": { before: undefined, after: "#241217" },
      "vars.success": { before: undefined, after: "#A6DFB5" },
      "vars.warning": { before: undefined, after: "#F2C879" },
      "colors.success": { before: "diffAdded", after: "success" },
      "colors.error": { before: "diffRemoved", after: "error" },
      "colors.warning": { before: "warningColor", after: "warning" },
      "colors.selectedBg": { before: "surfaceHighest", after: "surfaceHigh" },
      "colors.userMessageBg": { before: "secondaryContainer", after: "surfaceLow" },
      "colors.toolPendingBg": { before: "surfaceBright", after: "surfaceContainer" },
      "colors.toolSuccessBg": { before: "surfaceVariant", after: "surfaceLow" },
      "colors.toolErrorBg": { before: "surfaceVariant", after: "errorSurface" },
      "colors.thinkingMax": { before: "diffRemoved", after: "primaryBright" },
    },
  },
};
const footerFiles = [
  "extensions/matugen-chrome.ts", "extensions/matugen-footer-core.mjs",
  ...["config.ts", "extension-status.ts", "footer-format.ts", "footer.ts", "format.ts", "git.ts", "gradient.ts", "icons.ts", "live-context.ts", "package-version.ts", "project-refresh.ts", "project-state.ts", "pulse.test.mjs", "runtime.ts", "session-lifecycle.ts", "state.ts", "style.ts"].map((file) => `extensions/matugen-footer/${file}`),
];
const nativeThemeColors = [
  "accent", "border", "borderAccent", "borderMuted", "success", "error", "warning", "muted", "dim", "text", "thinkingText",
  "selectedBg", "userMessageBg", "userMessageText", "customMessageBg", "customMessageText", "customMessageLabel",
  "toolPendingBg", "toolSuccessBg", "toolErrorBg", "toolTitle", "toolOutput",
  "mdHeading", "mdLink", "mdLinkUrl", "mdCode", "mdCodeBlock", "mdCodeBlockBorder", "mdQuote", "mdQuoteBorder", "mdHr", "mdListBullet",
  "toolDiffAdded", "toolDiffRemoved", "toolDiffContext",
  "syntaxComment", "syntaxKeyword", "syntaxFunction", "syntaxVariable", "syntaxString", "syntaxNumber", "syntaxType", "syntaxOperator", "syntaxPunctuation",
  "thinkingOff", "thinkingMinimal", "thinkingLow", "thinkingMedium", "thinkingHigh", "thinkingXhigh", "bashMode",
];
const validColorValue = (value) => typeof value === "string" || (Number.isInteger(value) && value >= 0 && value <= 255);
function validatePiTheme(theme, label) {
  const errors = [];
  if (!theme || typeof theme !== "object" || Array.isArray(theme)) throw new Error(`${label}: Pi theme must be an object`);
  if (theme.$schema !== undefined && typeof theme.$schema !== "string") errors.push("$schema must be a string");
  if (theme.appearance !== undefined && !["dark", "light"].includes(theme.appearance)) errors.push("appearance must be 'dark' or 'light'");
  for (const field of ["vars", "colors", "export"]) {
    if (theme[field] !== undefined && (!theme[field] || typeof theme[field] !== "object" || Array.isArray(theme[field]))) errors.push(`${field} must be an object`);
  }
  for (const key of nativeThemeColors) {
    if (!validColorValue(theme.colors?.[key])) errors.push(`colors.${key} is required and must be a string or 0..255 integer`);
  }
  for (const field of ["vars", "colors", "export"]) {
    for (const [key, value] of Object.entries(theme[field] ?? {})) {
      if (!validColorValue(value)) errors.push(`${field}.${key} must be a string or 0..255 integer`);
    }
  }
  if (errors.length) throw new Error(`${label}: invalid Pi theme schema:\n${errors.map((error) => `- ${error}`).join("\n")}`);
}
const hash = (data) => createHash("sha256").update(data).digest("hex");
const get = (obj, path) => path.split(".").reduce((value, key) => value?.[key], obj);
function set(obj, path, value) {
  const parts = path.split(".");
  const key = parts.pop();
  let cursor = obj;
  for (const part of parts) cursor = cursor[part] ??= {};
  cursor[key] = value;
}
function targetPath(key, xdg, agent) {
  return key === "template" ? join(xdg, "matugen/templates/pi-theme.json") : join(agent, "themes/matugen.json");
}
async function readExisting(path) {
  try {
    const info = await lstat(path);
    if (!info.isFile() || info.isSymbolicLink()) throw new Error(`Refusing non-regular managed path: ${path}`);
    return await readFile(path);
  } catch (error) {
    if (error.code === "ENOENT") return undefined;
    throw error;
  }
}
async function atomicWrite(path, bytes) {
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.matugen-${randomUUID()}.tmp`;
  try {
    await writeFile(temp, bytes, { flag: "wx", mode: 0o600 });
    await rename(temp, path);
  } catch (error) {
    await rm(temp, { force: true });
    throw error;
  }
}
function applyEdits(data, edits, label) {
  const changed = structuredClone(data);
  const conflicts = [];
  const sourceRemoved = get(data, "vars.diffRemoved");
  if (!(typeof sourceRemoved === "string" && (/^#[a-f\d]{6}$/i.test(sourceRemoved) || /^\{\{colors\.[a-z_]+\.default\.hex\}\}$/.test(sourceRemoved)))) {
    conflicts.push(`${label}: unsupported wallpaper diffRemoved value (${JSON.stringify(sourceRemoved)})`);
  } else {
    const existingWallpaperValue = get(data, "vars.wallpaperDiffRemoved");
    if (existingWallpaperValue === undefined) set(changed, "vars.wallpaperDiffRemoved", sourceRemoved);
    else if (sourceRemoved !== "#DE9EAC" && existingWallpaperValue !== sourceRemoved) conflicts.push(`${label}: wallpaperDiffRemoved does not match original diffRemoved`);
    else if (!(typeof existingWallpaperValue === "string" && (/^#[a-f\d]{6}$/i.test(existingWallpaperValue) || /^\{\{colors\.[a-z_]+\.default\.hex\}\}$/.test(existingWallpaperValue)))) conflicts.push(`${label}: unsupported wallpaperDiffRemoved value`);
    set(changed, "vars.diffRemoved", "#DE9EAC");
  }
  for (const [path, edit] of Object.entries(edits)) {
    if (path === "vars.diffRemoved") continue;
    const present = get(changed, path);
    if (present === edit.after) continue;
    if (present !== edit.before) {
      conflicts.push(`${label}: unknown overlapping edit at ${path} (${JSON.stringify(present)})`);
      continue;
    }
    set(changed, path, edit.after);
  }
  return { changed, conflicts };
}
async function getContext() {
  const home = homedir();
  const xdg = resolve(process.env.XDG_CONFIG_HOME || join(home, ".config"));
  const agent = resolve(process.env.PI_CODING_AGENT_DIR || join(home, ".pi", "agent"));
  const baseline = JSON.parse(await readFile(join(repoDir, "config/matugen/migration-baseline.json"), "utf8"));
  const targets = [];
  const conflicts = [];
  for (const [key, entry] of Object.entries(managed)) {
    const path = targetPath(key, xdg, agent);
    const original = await readExisting(path);
    if (!original) throw new Error(`Required Matugen Pi file is missing: ${path}`);
    let parsed;
    try { parsed = JSON.parse(original.toString("utf8")); }
    catch { throw new Error(`Invalid JSON in managed file: ${path}`); }
    const { changed, conflicts: fileConflicts } = applyEdits(parsed, entry.edits, path);
    validatePiTheme(changed, path);
    conflicts.push(...fileConflicts);
    targets.push({ path, original, output: Buffer.from(`${JSON.stringify(changed, null, 2)}\n`) });
  }
  for (const source of footerFiles) {
    const path = join(agent, source);
    const original = await readExisting(path);
    if (!original) continue;
    const sourceBytes = await readFile(join(repoDir, source));
    if (original.equals(sourceBytes)) continue;
    if (baseline.liveFiles?.[source] !== hash(original)) {
      conflicts.push(`${path}: unknown overlapping edit (preserved; no copy performed)`);
      continue;
    }
    targets.push({ path, original, output: sourceBytes });
  }
  return { xdg, agent, targets, conflicts };
}
async function createBackup(targets, agent) {
  const backupDir = join(agent, `matugen-backup-${new Date().toISOString().replaceAll(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`);
  await mkdir(backupDir, { recursive: true, mode: 0o700 });
  const files = [];
  try {
    for (let i = 0; i < targets.length; i++) {
      const item = targets[i];
      const backup = `${i}.original`;
      await writeFile(join(backupDir, backup), item.original, { flag: "wx", mode: 0o600 });
      files.push({ path: item.path, backup, originalHash: hash(item.original), appliedHash: hash(item.output) });
    }
    await writeFile(join(backupDir, "manifest.json"), `${JSON.stringify({ version: 1, files }, null, 2)}\n`, { flag: "wx", mode: 0o600 });
  } catch (error) {
    await rm(backupDir, { recursive: true, force: true });
    throw error;
  }
  return backupDir;
}
async function check() {
  const { targets, conflicts } = await getContext();
  if (conflicts.length) throw new Error(`Migration check found conflicts:\n${conflicts.join("\n")}`);
  for (const item of targets) console.log(`${item.original.equals(item.output) ? "current" : "migration available"}: ${item.path}`);
}
async function apply() {
  const { agent, targets, conflicts } = await getContext();
  if (conflicts.length) throw new Error(`Migration stopped before writes:\n${conflicts.join("\n")}`);
  const changed = targets.filter((item) => !item.original.equals(item.output));
  if (!changed.length) { console.log("Matugen Pi files already match; no changes needed."); return; }
  const backupDir = await createBackup(changed, agent);
  try {
    for (const item of changed) await atomicWrite(item.path, item.output);
  } catch (error) {
    throw new Error(`Apply stopped after backup ${backupDir}: ${error.message}`);
  }
  console.log(`Updated ${changed.length} Matugen Pi file(s). Backup manifest: ${join(backupDir, "manifest.json")}`);
}
async function rollback(backupDir) {
  const home = homedir();
  const xdg = resolve(process.env.XDG_CONFIG_HOME || join(home, ".config"));
  const agent = resolve(process.env.PI_CODING_AGENT_DIR || join(home, ".pi", "agent"));
  const fullDir = resolve(backupDir);
  const manifest = JSON.parse(await readFile(join(fullDir, "manifest.json"), "utf8"));
  if (manifest.version !== 1 || !Array.isArray(manifest.files)) throw new Error("Unsupported backup manifest.");
  const allowed = new Set([...Object.keys(managed).map((key) => targetPath(key, xdg, agent)), ...footerFiles.map((file) => join(agent, file))]);
  const entries = [];
  for (const item of manifest.files) {
    if (!allowed.has(item.path) || !isAbsolute(item.path) || typeof item.backup !== "string" || item.backup.includes(sep) || !/^[a-f0-9]{64}$/.test(item.appliedHash) || !/^[a-f0-9]{64}$/.test(item.originalHash)) throw new Error("Invalid backup manifest entry.");
    const current = await readExisting(item.path);
    if (!current || hash(current) !== item.appliedHash) throw new Error(`Rollback refused; post-apply hash mismatch: ${item.path}`);
    const original = await readFile(join(fullDir, item.backup));
    if (hash(original) !== item.originalHash) throw new Error(`Backup hash mismatch: ${item.path}`);
    entries.push({ path: item.path, original });
  }
  for (const item of entries) await atomicWrite(item.path, item.original);
  console.log(`Rolled back ${entries.length} Matugen Pi file(s) from ${fullDir}`);
}
export async function run(args = process.argv.slice(2)) {
  if (args.length === 1 && args[0] === "--check") return check();
  if (args.length === 1 && args[0] === "--apply") return apply();
  if (args.length === 2 && args[0] === "--rollback") return rollback(args[1]);
  throw new Error("Usage: node scripts/configure-matugen-tui.mjs --check | --apply | --rollback <backup-dir>");
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
