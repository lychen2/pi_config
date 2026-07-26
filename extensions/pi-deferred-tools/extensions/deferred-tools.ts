import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getAgentDir, type ExtensionAPI, type ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

type Config = {
  loader?: { name?: string; label?: string };
  extensions: string[];
};

type ToolInfo = ReturnType<ExtensionAPI["getAllTools"]>[number];

type ExtensionGroup = {
  id: string;
  label: string;
  source: string;
  tools: ToolInfo[];
};

type DeferredTool = {
  extension: ExtensionGroup;
  tool: ToolInfo;
};

type LoaderDetails = {
  extension?: string;
  matched?: string;
  added: string[];
};

const TOOL_NAME = /^[A-Za-z_][A-Za-z0-9_-]{0,63}$/;
const LoaderParameters = Type.Object({
  query: Type.String({ description: "One exact inactive tool name, or a task matching one tool" }),
});
const repositoryConfigDir = fileURLToPath(new URL("../../../config/", import.meta.url));
const configPath =
  process.env.PI_DEFERRED_TOOLS_CONFIG?.trim() ||
  (existsSync(repositoryConfigDir)
    ? join(repositoryConfigDir, "deferred-tools.json")
    : join(getAgentDir(), "deferred-tools.json"));

function normalize(value: string): string {
  return value.normalize("NFKC").toLowerCase().trim();
}

function normalizePackageSource(source: string): string {
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

function extensionId(tool: ToolInfo): string {
  const { sourceInfo } = tool;
  if (sourceInfo.origin === "package") return normalizePackageSource(sourceInfo.source);
  return `${sourceInfo.source}:${sourceInfo.path}`;
}

function extensionLabel(id: string): string {
  if (id.startsWith("npm:")) return id.slice(4);
  if (id.startsWith("git:")) return id.slice(4);
  const trimmed = id.replace(/\/+$/, "");
  return basename(trimmed) || id;
}

function loadConfig(): Config {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(configPath, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { extensions: [] };
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Cannot read deferred-tools config at ${configPath}: ${reason}`);
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Deferred-tools config at ${configPath} must be an object`);
  }

  const input = parsed as Partial<Config>;
  if (!Array.isArray(input.extensions) || !input.extensions.every((source) => typeof source === "string" && source.trim())) {
    throw new Error(`Deferred-tools config at ${configPath} must contain an extensions string array`);
  }

  return {
    loader: input.loader,
    extensions: [...new Set(input.extensions.map((source) => normalizePackageSource(source.trim())))],
  };
}

function saveConfig(config: Config): void {
  mkdirSync(dirname(configPath), { recursive: true });
  const temporaryPath = `${configPath}.tmp-${process.pid}`;
  writeFileSync(temporaryPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  renameSync(temporaryPath, configPath);
}

function discoverExtensions(pi: ExtensionAPI, loaderName: string): ExtensionGroup[] {
  const allTools = pi.getAllTools();
  const loader = allTools.find((tool) => tool.name === loaderName);
  const ownExtensionId = loader ? extensionId(loader) : undefined;
  const groups = new Map<string, ExtensionGroup>();

  for (const tool of allTools) {
    if (tool.name === loaderName || tool.sourceInfo.source === "builtin" || tool.sourceInfo.source === "sdk") continue;

    const id = extensionId(tool);
    if (id === ownExtensionId) continue;

    const current = groups.get(id) ?? {
      id,
      label: extensionLabel(id),
      source: tool.sourceInfo.source,
      tools: [],
    };
    current.tools.push(tool);
    groups.set(id, current);
  }

  return [...groups.values()]
    .map((group) => ({ ...group, tools: [...group.tools].sort((left, right) => left.name.localeCompare(right.name)) }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

function deferredCatalog(groups: ExtensionGroup[], configured: ReadonlySet<string>): DeferredTool[] {
  return groups
    .filter((group) => configured.has(group.id))
    .flatMap((extension) => extension.tools.map((tool) => ({ extension, tool })));
}

function matchTool(query: string, catalog: DeferredTool[]): DeferredTool | undefined {
  const normalized = normalize(query);
  if (!normalized || normalized === "all") return undefined;

  const exact = catalog.find(({ tool }) => normalize(tool.name) === normalized);
  if (exact) return exact;

  const terms = normalized.split(/[^\p{L}\p{N}_-]+/u).filter((term) => term.length > 1);
  return catalog
    .map((candidate, index) => {
      const name = normalize(candidate.tool.name.replaceAll("_", " ").replaceAll("-", " "));
      const haystack = `${name} ${normalize(candidate.tool.description)}`;
      const score = terms.reduce((total, term) => total + (haystack.includes(term) ? term.length : 0), 0);
      return { candidate, index, score, nameMatch: name.includes(normalized) ? 1 : 0 };
    })
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.nameMatch - left.nameMatch || right.score - left.score || left.index - right.index)[0]?.candidate;
}

function configuredSet(config: Config): Set<string> {
  return new Set(config.extensions);
}

function deactivateConfigured(pi: ExtensionAPI, groups: ExtensionGroup[], config: Config): string[] {
  const configured = configuredSet(config);
  const deferredNames = new Set(deferredCatalog(groups, configured).map(({ tool }) => tool.name));
  const active = pi.getActiveTools();
  const next = active.filter((name) => !deferredNames.has(name));
  if (next.length !== active.length) pi.setActiveTools(next);
  return active.filter((name) => deferredNames.has(name));
}

function activateExtension(pi: ExtensionAPI, extension: ExtensionGroup): string[] {
  const active = pi.getActiveTools();
  const added = extension.tools.map((tool) => tool.name).filter((name) => !active.includes(name));
  if (added.length) pi.setActiveTools([...new Set([...active, ...added])]);
  return added;
}

function notify(ctx: ExtensionCommandContext, message: string): void {
  if (ctx.hasUI) ctx.ui.notify(message, "info");
}

function formatStatus(groups: ExtensionGroup[], config: Config): string {
  const configured = configuredSet(config);
  const lines = ["Deferred extensions:", `config: ${configPath}`, ""];

  for (const group of groups) {
    const state = configured.has(group.id) ? "deferred" : "active";
    lines.push(`[${state}] ${group.id}: ${group.tools.map((tool) => tool.name).join(", ")}`);
  }

  const discovered = new Set(groups.map((group) => group.id));
  for (const id of config.extensions.filter((id) => !discovered.has(id))) {
    lines.push(`[unavailable] ${id}`);
  }

  return lines.join("\n");
}

export default function deferredTools(pi: ExtensionAPI): void {
  if (process.env.PI_DEFERRED_TOOLS_DISABLE === "1") return;

  let config = loadConfig();
  const loaderName = config.loader?.name?.trim() || "load_tools";
  const loaderLabel = config.loader?.label?.trim() || "Load Tools";
  if (!TOOL_NAME.test(loaderName)) throw new Error(`Invalid deferred-tools loader name: ${loaderName}`);

  const registerLoader = (groups: ExtensionGroup[]) => {
    const configured = configuredSet(config);
    const catalog = deferredCatalog(groups, configured);
    const summary = groups
      .filter((group) => configured.has(group.id))
      .map((group) => `${group.label}: ${group.tools.map((tool) => tool.name).join(", ")}`)
      .join("; ");

    pi.registerTool<typeof LoaderParameters, LoaderDetails>({
      name: loaderName,
      label: loaderLabel,
      description: summary
        ? `Activate one inactive tool from an extension-managed catalog. Available tools by extension: ${summary}.`
        : "Activate one inactive tool from the extension-managed catalog. No extensions are currently deferred.",
      promptSnippet: "Load exactly one inactive extension tool when its specific capability is needed",
      promptGuidelines: [
        `Call ${loaderName} with one exact tool name before using that inactive tool. Never request all or multiple tools; load another tool only when it becomes necessary.`,
      ],
      parameters: LoaderParameters,
      async execute(_toolCallId, params) {
        const currentGroups = discoverExtensions(pi, loaderName);
        const currentCatalog = deferredCatalog(currentGroups, configuredSet(config));
        const match = matchTool(params.query, currentCatalog);
        if (!match) {
          return {
            content: [{
              type: "text",
              text: `No single deferred tool matched. Choose one tool: ${currentCatalog.map(({ tool }) => tool.name).join(", ") || "(none)"}.`,
            }],
            details: { extension: undefined, matched: undefined, added: [] },
          };
        }

        const active = pi.getActiveTools();
        const added = active.includes(match.tool.name) ? [] : [match.tool.name];
        if (added.length) pi.setActiveTools([...new Set([...active, ...added])]);

        return {
          content: [{
            type: "text",
            text: added.length ? `Activated: ${match.tool.name}` : `Already active: ${match.tool.name}`,
          }],
          details: { extension: match.extension.id, matched: match.tool.name, added },
        };
      },
    });
  };

  registerLoader([]);

  pi.registerCommand("deferred-tools", {
    description: "Manage extensions whose tools load on demand",
    getArgumentCompletions(prefix) {
      const [command = "", ...rest] = prefix.trimStart().split(/\s+/);
      if (!rest.length) {
        const items = ["list", "add", "remove"]
          .filter((choice) => choice.startsWith(command))
          .map((choice) => ({ value: choice, label: choice }));
        return items.length ? items : null;
      }

      if (command !== "add" && command !== "remove") return null;
      const query = rest.join(" ");
      const groups = discoverExtensions(pi, loaderName);
      const configured = configuredSet(config);
      const ids = command === "add"
        ? groups.filter((group) => !configured.has(group.id)).map((group) => group.id)
        : config.extensions;
      const items = ids
        .filter((id) => normalize(id).startsWith(normalize(query)))
        .map((id) => ({ value: `${command} ${id}`, label: id }));
      return items.length ? items : null;
    },
    handler: async (args, ctx) => {
      config = loadConfig();
      const [command = "list", ...rest] = args.trim().split(/\s+/);
      const requestedId = rest.join(" ");
      const groups = discoverExtensions(pi, loaderName);

      if (!args.trim() || command === "list") {
        notify(ctx, formatStatus(groups, config));
        return;
      }

      if ((command !== "add" && command !== "remove") || !requestedId) {
        notify(ctx, "Usage: /deferred-tools [list|add <extension-id>|remove <extension-id>]");
        return;
      }

      const requested = normalizePackageSource(requestedId);
      const configured = configuredSet(config);

      if (command === "add") {
        const extension = groups.find((group) => normalize(group.id) === normalize(requested));
        if (!extension) {
          notify(ctx, `Unknown extension: ${requestedId}. Run /deferred-tools list.`);
          return;
        }
        if (configured.has(extension.id)) {
          notify(ctx, `${extension.id} is already deferred.`);
          return;
        }

        configured.add(extension.id);
        config = { ...config, extensions: [...configured].sort() };
        saveConfig(config);
        registerLoader(groups);
        const removed = deactivateConfigured(pi, groups, config);
        notify(ctx, `Deferred ${extension.id}. Hidden now: ${removed.join(", ") || "(none)"}.`);
        return;
      }

      const configuredId = config.extensions.find((id) => normalize(id) === normalize(requested));
      if (!configuredId) {
        notify(ctx, `${requestedId} is not deferred.`);
        return;
      }

      configured.delete(configuredId);
      config = { ...config, extensions: [...configured].sort() };
      saveConfig(config);
      registerLoader(groups);
      const extension = groups.find((group) => group.id === configuredId);
      const added = extension ? activateExtension(pi, extension) : [];
      notify(ctx, `Removed ${configuredId} from deferred loading. Activated now: ${added.join(", ") || "(none)"}.`);
    },
  });

  const refresh = () => {
    const groups = discoverExtensions(pi, loaderName);
    registerLoader(groups);
    deactivateConfigured(pi, groups, config);
  };

  pi.on("session_start", refresh);
  let firstTurn = true;
  pi.on("before_agent_start", () => {
    if (!firstTurn) return;
    firstTurn = false;
    refresh();
  });
}
