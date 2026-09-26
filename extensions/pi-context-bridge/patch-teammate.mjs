import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const TEAMMATE_VERSION = "2.6.2";
const teammateConfig = JSON.parse(readFileSync(new URL("./teammate-config.json", import.meta.url), "utf8"));
if (typeof teammateConfig.model !== "string" || !teammateConfig.model.includes("/")) throw new Error("teammate-config.json must define a provider/model identifier");
export const TEAMMATE_MODEL = teammateConfig.model;
const marker = "// pi-config: single-model teammate policy v1";

// Remove a previously applied policy block (written with any model) so that a
// model swap re-patches cleanly instead of stacking assignments. The block is
// everything from the marker line up to (excluding) the untouched anchor. The
// vendor sources use CRLF endings, so this is index-based, not line-based.
function revertPolicy(text, anchor) {
  if (!text.includes(marker)) return text;
  const markerIdx = text.indexOf(marker);
  const lineStart = text.lastIndexOf("\n", markerIdx) + 1;
  const anchorIdx = text.indexOf(anchor, markerIdx);
  if (anchorIdx === -1) throw new Error("Teammate policy marker present but its anchor is missing; refusing to double-patch");
  return text.slice(0, lineStart) + text.slice(anchorIdx);
}

export function patchTeammate(root) {
  const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  if (manifest.version !== TEAMMATE_VERSION) throw new Error(`Review teammate patch before upgrading ${manifest.version}`);
  const patches = [
    ["src/models/model-routing.ts", "  const topLevelModel = params.model;", `  ${marker}\n  params = { ...params, model: "${TEAMMATE_MODEL}", fallbackModels: [], tasks: params.tasks.map(task => ({ ...task, model: "${TEAMMATE_MODEL}", fallbackModels: [] })) };\n  const topLevelModel = params.model;`],
    ["src/runs/execution.ts", "  const admittedOptions = { ...options, correlationId };", `  ${marker}\n  if (params.backend || options.backendRegistry || options.modelRegistryAuthority || options.modelRegistryDispatch || (backendRegistryConfigSync(options.baseCwd).mode ?? "legacy") !== "legacy") throw new Error("Single-model teammate policy requires the local Pi backend");\n  params = { ...params, model: "${TEAMMATE_MODEL}", fallbackModels: [] };\n  const admittedOptions = { ...options, correlationId };`],
  ];
  // Validate every anchor before writing anything. Reinstallation reapplies the patch.
  const files = new Map();
  for (const [relative, before, after] of patches) {
    const path = join(root, relative);
    let text = files.get(path) ?? readFileSync(path, "utf8");
    if (text.includes(after)) continue;
    text = revertPolicy(text, before);
    if (text.split(before).length !== 2) throw new Error(`Teammate patch anchor changed: ${relative}`);
    files.set(path, text.replace(before, after));
  }
  for (const [path, text] of files) writeFileSync(path, text);
  return files.size;
}

export function installedTeammateRoot() {
  return dirname(dirname(createRequire(import.meta.url).resolve("pi-maestro-teammate")));
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  console.log(`Teammate policy: ${patchTeammate(installedTeammateRoot())} files patched (${TEAMMATE_MODEL})`);
}
