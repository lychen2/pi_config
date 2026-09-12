import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  getAgentDir,
  formatSkillsForPrompt,
  type ExtensionAPI,
  type ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import type { AutocompleteItem } from "@earendil-works/pi-tui";

const CONFIG_FILE = join(getAgentDir(), "slim-skills-whitelist.json");
const DISABLE_ENV = "SLIM_SKILLS_DISABLE";
const SKILL_COMMAND_ARGUMENTS = [
  { value: "list", description: "查看技能索引状态" },
  { value: "add", description: "加入自动发现列表" },
  { value: "remove", description: "移出自动发现列表" },
  { value: "reset", description: "恢复默认技能设置" },
  { value: "all", description: "让全部技能自动发现" },
  { value: "none", description: "仅通过 /skill:名称 使用技能" },
  { value: "inject", description: "将技能内容注入提示词" },
  { value: "uninject", description: "停止注入技能内容" },
] as const;

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

const skillBodyCache = new Map<string, string>();

async function loadSkillBody(filePath: string): Promise<string> {
  const cached = skillBodyCache.get(filePath);
  if (cached) return cached;
  const raw = await readFile(filePath, "utf8");
  const body = raw.replace(/^---[\s\S]*?---\s*/, "").trim();
  skillBodyCache.set(filePath, body);
  return body;
}

export function compactBlock(skills: SkillLike[], searchable = false): string {
  const lines = [searchable
    ? "\n\nSkills: use search_skill_bm25 to discover specialized guidance and load a relevant result. Load only what the task needs; user commands remain available via /skill:<name>."
    : "\n\nSkills: read the matching file for specialized guidance. User commands are available via /skill:<name>."];
  if (skills.length) lines.push("Resolve relative references against the loaded skill's directory.");
  for (const skill of [...skills].sort((left, right) => left.name.localeCompare(right.name))) {
    lines.push(`- ${skill.name}: ${skill.description.replace(/\s+/g, " ").trim()} (${skill.filePath})`);
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
    knownSkills = skills;
    if (process.env[DISABLE_ENV] === "1") return;

    let prompt = event.systemPrompt;

    // Compact the skill index.
    const visible = skills.filter((skill) => !skill.disableModelInvocation);
    const verbose = formatSkillsForPrompt(skills as Parameters<typeof formatSkillsForPrompt>[0]);
    if (verbose && prompt.includes(verbose)) {
      const allowed = config.mode === "all" ? visible : visible.filter((skill) => allowedSet().has(skill.name));
      const searchable = pi.getActiveTools().includes("search_skill_bm25");
      const compact = compactBlock(searchable ? allowed : visible, searchable);
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
      `on-demand (${hidden.length}): ${hidden.join(", ") || "(none)"}`,
      "",
      `injected (${injected.length}): ${injected.join(", ") || "(none)"}`,
      "",
      "Changes apply to the next prompt.",
    ].join("\n");
  };

  pi.registerCommand("slim-skills", {
    description: "管理压缩后的模型可见技能索引",
    getArgumentCompletions(prefix: string): AutocompleteItem[] | null {
      const [command = "", ...rest] = prefix.split(/\s+/);
      if (!rest.length) {
        const items = SKILL_COMMAND_ARGUMENTS
          .filter(({ value }) => value.startsWith(command))
          .map(({ value, description }) => ({ value, label: value, description }));
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
        return notify(ctx, "Skills are available on demand through search_skill_bm25 or /skill:<name>.");
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
