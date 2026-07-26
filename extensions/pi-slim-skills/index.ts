import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  getAgentDir,
  type ExtensionAPI,
  type ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import type { AutocompleteItem } from "@earendil-works/pi-tui";

const CONFIG_FILE = join(getAgentDir(), "slim-skills-whitelist.json");
const DISABLE_ENV = "SLIM_SKILLS_DISABLE";
const MIN_SKILL_COUNT = 8;

type SkillLike = {
  name: string;
  description: string;
  filePath: string;
  disableModelInvocation?: boolean;
};
type Config = { mode: "all" | "allowlist"; whitelist: string[]; inject: string[] };

function defaultConfig(): Config {
  return { mode: "all", whitelist: [], inject: [] };
}

function loadConfig(): Config {
  try {
    const parsed: unknown = JSON.parse(readFileSync(CONFIG_FILE, "utf8"));
    if (Array.isArray(parsed)) {
      return { mode: "allowlist", whitelist: parsed.filter((value): value is string => typeof value === "string"), inject: [] };
    }
    if (parsed && typeof parsed === "object") {
      const value = parsed as Partial<Config>;
      if (value.mode === "all" || value.mode === "allowlist") {
        return {
          mode: value.mode,
          whitelist: Array.isArray(value.whitelist)
            ? value.whitelist.filter((entry): entry is string => typeof entry === "string")
            : [],
          inject: Array.isArray(value.inject)
            ? value.inject.filter((entry): entry is string => typeof entry === "string")
            : [],
        };
      }
    }
  } catch {
    // Missing or invalid config uses the lossless default.
  }
  return defaultConfig();
}

function saveConfig(config: Config): void {
  try {
    mkdirSync(dirname(CONFIG_FILE), { recursive: true });
    const whitelist = [...new Set(config.whitelist)].sort();
    const inject = [...new Set(config.inject)].sort();
    writeFileSync(CONFIG_FILE, `${JSON.stringify({ mode: config.mode, whitelist, inject }, null, 2)}\n`, "utf8");
  } catch {
    // Persistence failure does not break the running session.
  }
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function parent(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const index = normalized.lastIndexOf("/");
  return index <= 0 ? normalized : normalized.slice(0, index);
}

const skillBodyCache = new Map<string, string>();

async function loadSkillBody(filePath: string): Promise<string> {
  const cached = skillBodyCache.get(filePath);
  if (cached) return cached;
  const raw = await readFile(filePath, "utf8");
  const body = raw.replace(/^---[\s\S]*?---\s*/, "").trim();
  skillBodyCache.set(filePath, body);
  return body;
}

function verboseBlock(skills: SkillLike[]): string {
  const visible = skills.filter((skill) => !skill.disableModelInvocation);
  if (!visible.length) return "";
  const lines = [
    "\n\nThe following skills provide specialized instructions for specific tasks.",
    "Use the read tool to load a skill's file when the task matches its description.",
    "When a skill file references a relative path, resolve it against the skill directory (parent of SKILL.md / dirname of the path) and use that absolute path in tool commands.",
    "",
    "<available_skills>",
  ];
  for (const skill of visible) {
    lines.push(
      "  <skill>",
      `    <name>${escapeXml(skill.name)}</name>`,
      `    <description>${escapeXml(skill.description)}</description>`,
      `    <location>${escapeXml(skill.filePath)}</location>`,
      "  </skill>",
    );
  }
  lines.push("</available_skills>");
  return lines.join("\n");
}

function compactBlock(skills: SkillLike[]): string {
  if (!skills.length) return "";
  const groups = new Map<string, string[]>();
  for (const skill of skills) {
    const root = parent(parent(skill.filePath));
    const names = groups.get(root) ?? [];
    names.push(skill.name);
    groups.set(root, names);
  }

  const lines = [
    "\n\nThe following skills provide specialized instructions for specific tasks. When a skill name matches the task, read the SKILL.md at its location to load full instructions. Resolve relative SKILL.md paths against that skill directory. Other installed skills are available on demand via /skill:<name>.",
  ];
  for (const [root, names] of [...groups.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    names.sort();
    lines.push("", `Skills under ${root}/<name>/SKILL.md:`);
    let current = "  ";
    for (const name of names) {
      const addition = `${current === "  " ? "" : ", "}${name}`;
      if (current.length > 2 && current.length + addition.length > 80) {
        lines.push(`${current},`);
        current = `  ${name}`;
      } else {
        current += addition;
      }
    }
    if (current.length > 2) lines.push(current);
  }
  return lines.join("\n");
}

export default function slimSkills(pi: ExtensionAPI): void {
  let config = loadConfig();
  let knownSkills: SkillLike[] = [];
  saveConfig(config);

  const allowedSet = () => new Set(config.whitelist);
  const injectSet = () => new Set(config.inject);
  const allSkillNames = (): string[] => {
    if (knownSkills.length) {
      return knownSkills.map((skill) => skill.name).sort();
    }
    const names = pi.getCommands()
      .filter((command) => command.name.startsWith("skill:"))
      .map((command) => command.name.slice("skill:".length));
    names.push(...config.whitelist, ...config.inject);
    return [...new Set(names)].sort();
  };
  const knownNames = (): string[] => {
    if (knownSkills.length) {
      return knownSkills
        .filter((skill) => !skill.disableModelInvocation)
        .map((skill) => skill.name)
        .sort();
    }
    const names = pi.getCommands()
      .filter((command) => command.name.startsWith("skill:"))
      .map((command) => command.name.slice("skill:".length));
    names.push(...config.whitelist);
    return [...new Set(names)].sort();
  };

  pi.on("before_agent_start", async (event) => {
    const skills = (event.systemPromptOptions?.skills ?? []) as SkillLike[];
    if (skills.length) knownSkills = skills;
    if (process.env[DISABLE_ENV] === "1" || skills.length < MIN_SKILL_COUNT) return;

    let prompt = event.systemPrompt;

    // Compact the skill index.
    const visible = skills.filter((skill) => !skill.disableModelInvocation);
    const verbose = verboseBlock(skills);
    if (verbose && prompt.includes(verbose)) {
      const allowed = config.mode === "all" ? visible : visible.filter((skill) => allowedSet().has(skill.name));
      const compact = compactBlock(allowed);
      if (compact.length < verbose.length) {
        prompt = prompt.replace(verbose, compact);
      }
    }

    // Inject configured skill bodies once, even if another source already added them.
    const inject = injectSet();
    const toInject = skills.filter((skill) => inject.has(skill.name));
    if (toInject.length) {
      const bodies: string[] = [];
      for (const skill of toInject) {
        try {
          const body = await loadSkillBody(skill.filePath);
          if (!prompt.includes(body) && !bodies.includes(body)) {
            bodies.push(body);
          }
        } catch {
          // Skip skills whose files cannot be read.
        }
      }
      if (bodies.length) {
        prompt += "\n\n" + bodies.join("\n\n");
      }
    }

    if (prompt !== event.systemPrompt) {
      return { systemPrompt: prompt };
    }
  });

  const notify = (ctx: ExtensionCommandContext, message: string) => {
    if (ctx.hasUI) ctx.ui.notify(message, "info");
  };
  const status = () => {
    const names = allSkillNames();
    const allowed = config.mode === "all" ? names : names.filter((name) => allowedSet().has(name));
    const hidden = config.mode === "all" ? [] : names.filter((name) => !allowedSet().has(name));
    const injected = names.filter((name) => injectSet().has(name));
    return [
      `slim-skills: ${config.mode === "all" ? "all skills auto-discoverable" : "allowlist mode"}`,
      `config: ${CONFIG_FILE}`,
      "",
      `auto-discover (${allowed.length}): ${allowed.join(", ") || "(none)"}`,
      "",
      `skill-command only (${hidden.length}): ${hidden.join(", ") || "(none)"}`,
      "",
      `injected (${injected.length}): ${injected.join(", ") || "(none)"}`,
      "",
      "Changes apply to the next prompt.",
    ].join("\n");
  };

  pi.registerCommand("slim-skills", {
    description: "Manage the compressed model-visible skill index",
    getArgumentCompletions(prefix: string): AutocompleteItem[] | null {
      const [command = "", ...rest] = prefix.split(/\s+/);
      if (!rest.length) {
        const items = ["list", "add", "remove", "reset", "all", "none", "inject", "uninject"]
          .filter((choice) => choice.startsWith(command))
          .map((choice) => ({ value: choice, label: choice }));
        return items.length ? items : null;
      }
      if (command !== "add" && command !== "remove" && command !== "inject" && command !== "uninject") return null;
      const query = rest.join(" ");
      const items = allSkillNames()
        .filter((name) => name.startsWith(query))
        .map((name) => ({ value: `${command} ${name}`, label: name }));
      return items.length ? items : null;
    },
    handler: async (args, ctx) => {
      const [command = "", ...rest] = args.trim().split(/\s+/);
      const name = rest.join(" ");
      const names = allSkillNames();

      if (!command) return notify(ctx, status());
      if (command === "list") {
        const allowed = allowedSet();
        const injected = injectSet();
        return notify(ctx, names.map((skill) => {
          const tags: string[] = [];
          if (config.mode === "all" || allowed.has(skill)) tags.push("auto");
          else tags.push("/skill");
          if (injected.has(skill)) tags.push("inject");
          return `[${tags.join("|")}] ${skill}`;
        }).join("\n"));
      }
      if (command === "reset") {
        config = defaultConfig();
        saveConfig(config);
        return notify(ctx, "All settings reset. All skills are auto-discoverable, none injected.");
      }
      if (command === "all") {
        config = { ...config, mode: "all", whitelist: [] };
        saveConfig(config);
        return notify(ctx, "All skills are auto-discoverable in the compressed index.");
      }
      if (command === "none") {
        config = { mode: "allowlist", whitelist: [], inject: config.inject };
        saveConfig(config);
        return notify(ctx, "All skills are now available only through /skill:<name>.");
      }
      if ((command !== "add" && command !== "remove" && command !== "inject" && command !== "uninject") || !name) {
        return notify(ctx, "Usage: /slim-skills [list|add <name>|remove <name>|inject <name>|uninject <name>|reset|all|none]");
      }
      if (knownSkills.length && !names.includes(name)) return notify(ctx, `Unknown skill: ${name}`);

      if (command === "inject") {
        const injected = injectSet();
        if (injected.has(name)) return notify(ctx, `${name} is already injected into every system prompt.`);
        injected.add(name);
        config = { ...config, inject: [...injected] };
        saveConfig(config);
        return notify(ctx, `${name} will be injected into every system prompt.`);
      }
      if (command === "uninject") {
        const injected = injectSet();
        if (!injected.has(name)) return notify(ctx, `${name} is not injected.`);
        injected.delete(name);
        config = { ...config, inject: [...injected] };
        saveConfig(config);
        return notify(ctx, `${name} is no longer injected.`);
      }

      if (command === "add") {
        if (config.mode === "all") return notify(ctx, `${name} is already auto-discoverable.`);
        const allowed = allowedSet();
        allowed.add(name);
        config = { mode: "allowlist", whitelist: [...allowed], inject: config.inject };
        saveConfig(config);
        return notify(ctx, `Added ${name} to auto-discovery.`);
      }

      if (config.mode === "all") {
        config = { mode: "allowlist", whitelist: names.filter((skill) => skill !== name), inject: config.inject };
      } else {
        const allowed = allowedSet();
        allowed.delete(name);
        config = { mode: "allowlist", whitelist: [...allowed], inject: config.inject };
      }
      saveConfig(config);
      return notify(ctx, `${name} remains available through /skill:${name}.`);
    },
  });
}
