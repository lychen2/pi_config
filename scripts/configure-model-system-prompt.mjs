import { existsSync, copyFileSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const begin = "<!-- pi_config:gpt-overrides:start -->";
const end = "<!-- pi_config:gpt-overrides:end -->";
const defaultRepo = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function configureModelSystemPrompt({ repoDir = defaultRepo, homeDir = homedir(), agentDir = process.env.PI_CODING_AGENT_DIR || join(homeDir, ".pi", "agent"), dryRun = false } = {}) {
  // The npm extension reads prompts from homedir(), even with a custom agent directory.
  const promptDir = join(homeDir, ".pi", "agent", "model-system-prompt");
  const presets = join(agentDir, "npm", "node_modules", "pi-model-system-prompt", "presets");
  if (!existsSync(presets)) {
    if (dryRun) { console.log("  would configure npm model presets and retire the global addendum"); return; }
    throw new Error(`Missing npm model presets: ${presets}`);
  }
  const guidance = readFileSync(join(repoDir, "config", "model-system-prompt", "gpt-overrides.md"), "utf8").trim();
  const names = new Set(readdirSync(presets).filter(name => /\.md$/i.test(name)));
  if (existsSync(promptDir)) for (const name of readdirSync(promptDir)) if (/\.md$/i.test(name)) names.add(name);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupDir = join(agentDir, "backups", `model-system-prompt-${stamp}`);
  const backup = (file, name) => {
    mkdirSync(backupDir, { recursive: true, mode: 0o700 });
    copyFileSync(file, join(backupDir, `preset-${name}`));
  };
  const updated = [];
  const plans = [];
  // Prepare all edits before retiring the shared addendum.
  for (const name of [...names].sort()) {
    const target = join(promptDir, name);
    const present = existsSync(target);
    const original = readFileSync(present ? target : join(presets, name), "utf8");
    let text = original;
    if (/^gpt-/i.test(name)) {
      const start = text.indexOf(begin);
      if (start !== -1) {
        const finish = text.indexOf(end, start);
        if (finish === -1 || text.indexOf(begin, start + begin.length) !== -1) throw new Error(`Malformed managed block: ${target}`);
        text = text.slice(0, start).trimEnd() + text.slice(finish + end.length);
      } else if (text.includes(end)) throw new Error(`Malformed managed block: ${target}`);
      // An empty preset explicitly disables the npm injection. Preserve that state.
      if (text.trim()) text = `${text.trimEnd()}\n\n${begin}\n${guidance}\n${end}\n`;
    }
    if (!present || original !== text) plans.push({ target, text, present, name });
  }
  // The npm package has no Gemini preset. Seed the local fallback once; preserve user edits.
  if (!existsSync(join(promptDir, "gemini.md")) && !names.has("gemini.md")) {
    plans.push({
      target: join(promptDir, "gemini.md"),
      text: readFileSync(join(repoDir, "config", "model-system-prompt", "gemini.md"), "utf8"),
      present: false,
      name: "gemini.md",
    });
  }
  for (const { target, text, present, name } of plans) {
    console.log(`  configure model preset: ${target}`);
    updated.push(name);
    if (dryRun) continue;
    if (present) backup(target, name);
    mkdirSync(promptDir, { recursive: true });
    writeFileSync(target, text);
  }
  const global = join(agentDir, "APPEND_SYSTEM.md");
  if (existsSync(global)) {
    console.log(`  archive global addendum: ${global}`);
    if (!dryRun) {
      mkdirSync(backupDir, { recursive: true, mode: 0o700 });
      renameSync(global, join(backupDir, "APPEND_SYSTEM.md"));
    }
  }
  if (!dryRun && existsSync(backupDir)) console.log(`  prompt backup: ${backupDir}`);
  return { updated, backupDir };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  configureModelSystemPrompt({ dryRun: process.argv.includes("--dry-run") });
}
