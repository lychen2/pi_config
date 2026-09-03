// Project-scoped tool modes: adaptive starts with the fast core and loads
// registered tools through BM25 discovery; fast and full remain fixed presets.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import {
  CONFIG_DIR_NAME,
  type ExtensionAPI,
  type ExtensionCommandContext,
  type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { Key, matchesKey, truncateToWidth, visibleWidth, type AutocompleteItem } from "@earendil-works/pi-tui";
import { createSearchToolBm25 } from "./search-tool-bm25.ts";
import {
  activeToolsForMode,
  assertCoreToolsRegistered,
  EMPTY_TOOL_SELECTION,
  isCoreToolName,
  enabledToolCount,
  isToolDisabled,
  packageSourceId,
  parseToolSelectionConfig,
  SEARCH_TOOL_NAME,
  setExtensionEnabled,
  setToolEnabled,
  setToolMode,
  type ToolMode,
  type ToolSelectionConfig,
} from "./tool-selection-state.ts";

type ToolInfo = ReturnType<ExtensionAPI["getAllTools"]>[number];
type SelectorTheme = ExtensionCommandContext["ui"]["theme"];

type ExtensionGroup = {
  id: string;
  label: string;
  source: string;
  tools: ToolInfo[];
};

type SelectorMode =
  | { kind: "extensions" }
  | { kind: "tools"; extensionId: string };

type ToolContext = Pick<ExtensionContext, "hasUI" | "ui">;

const CONFIG_FILE = "tool-selector.json";
const MAX_VISIBLE_ITEMS = 12;

const TOOL_COMMAND_ARGUMENTS = [
  { value: "adaptive", description: "先启用核心工具，按需发现其他工具" },
  { value: "fast", description: "仅保留最小核心工具集" },
  { value: "full", description: "启用全部已注册工具，明确禁用的除外" },
  { value: "reset", description: "清除禁用规则并切换到完整模式" },
  { value: "list", description: "显示当前工具选择和已启用工具" },
] as const;

const TOOL_MODE_CYCLE: readonly ToolMode[] = ["fast", "adaptive", "full"];

function nextToolMode(mode: ToolMode): ToolMode {
  const index = TOOL_MODE_CYCLE.indexOf(mode);
  return TOOL_MODE_CYCLE[(index + 1) % TOOL_MODE_CYCLE.length]!;
}

function completeToolCommand(prefix: string): AutocompleteItem[] | null {
  const query = prefix.trim();
  if (/\s/.test(query)) return null;
  const items = TOOL_COMMAND_ARGUMENTS
    .filter(({ value }) => value.startsWith(query))
    .map(({ value, description }) => ({ value, label: value, description }));
  return items.length ? items : null;
}

function registerToolCommands(
  pi: ExtensionAPI,
  handler: (args: string, ctx: ExtensionCommandContext) => Promise<void>,
): void {
  pi.registerCommand("tools", {
    description: "配置项目工具：自适应、快速或完整模式",
    getArgumentCompletions: completeToolCommand,
    handler,
  });
  pi.registerCommand("deferred-tools", {
    description: "打开项目工具选择器（兼容旧命令）",
    getArgumentCompletions: completeToolCommand,
    handler,
  });
}

function normalize(value: string): string {
  return value.normalize("NFKC").toLowerCase().trim();
}

function extensionId(tool: ToolInfo): string {
  const { sourceInfo } = tool;
  if (sourceInfo.origin === "package") return packageSourceId(sourceInfo.source);
  return `${sourceInfo.source}:${sourceInfo.path}`;
}

function extensionLabel(id: string): string {
  if (id.startsWith("npm:")) return id.slice(4);
  if (id.startsWith("git:")) return id.slice(4);
  if (id.startsWith("local:")) return id.slice(6);
  const trimmed = id.replace(/\/+$/, "");
  return basename(trimmed) || id;
}

function discoverExtensionGroups(pi: ExtensionAPI): ExtensionGroup[] {
  const groups = new Map<string, ExtensionGroup>();

  for (const tool of pi.getAllTools()) {
    if (tool.sourceInfo.source === "builtin") continue;

    const id = extensionId(tool);
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
    .map((group) => ({
      ...group,
      tools: [...group.tools].sort((left, right) => left.name.localeCompare(right.name)),
    }))
    .sort((left, right) => left.label.localeCompare(right.label) || left.id.localeCompare(right.id));
}

function projectConfigPath(ctx: ExtensionContext): string | undefined {
  const override = process.env.PI_TOOL_SELECTOR_CONFIG?.trim();
  if (override) return isAbsolute(override) ? override : resolve(ctx.cwd, override);
  if (!ctx.isProjectTrusted()) return undefined;
  return join(ctx.cwd, CONFIG_DIR_NAME, CONFIG_FILE);
}

function loadConfig(path: string): ToolSelectionConfig {
  if (!existsSync(path)) return { ...EMPTY_TOOL_SELECTION };

  try {
    return parseToolSelectionConfig(JSON.parse(readFileSync(path, "utf8")));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Cannot read tool selector config at ${path}: ${reason}`);
  }
}

function saveConfig(path: string, config: ToolSelectionConfig): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp-${process.pid}`;
  writeFileSync(temporaryPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  renameSync(temporaryPath, path);
}

function sameTools(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((name, index) => name === right[index]);
}

function baseToolNames(pi: ExtensionAPI): string[] {
  return pi.getAllTools()
    .map((tool) => tool.name)
    .filter(isCoreToolName);
}

function applyModeSelection(
  pi: ExtensionAPI,
  groups: ExtensionGroup[],
  config: ToolSelectionConfig,
  activatedTools: ReadonlySet<string>,
): void {
  const allToolNames = pi.getAllTools().map((tool) => tool.name);
  const preservedActiveTools = config.toolMode === "full" ? pi.getActiveTools() : [];
  const next = activeToolsForMode(
    baseToolNames(pi),
    groups,
    config,
    activatedTools,
    allToolNames,
    preservedActiveTools,
  );
  if (!sameTools(pi.getActiveTools(), next)) pi.setActiveTools(next);
}

function isAllowedTool(config: ToolSelectionConfig, groups: ExtensionGroup[], name: string): boolean {
  if (config.disabledTools.includes(name)) return false;
  const group = groups.find((candidate) => candidate.tools.some((tool) => tool.name === name));
  if (!group || isCoreToolName(name)) return true;
  return !config.disabledExtensions.includes(group.id);
}

function notify(ctx: ToolContext, message: string, level: "info" | "warning" | "error" = "info"): void {
  if (ctx.hasUI) ctx.ui.notify(message, level);
}


function paddedLine(text: string, width: number): string {
  const safeWidth = Math.max(1, width);
  const clipped = truncateToWidth(text, safeWidth, "");
  return clipped + " ".repeat(Math.max(0, safeWidth - visibleWidth(clipped)));
}

function twoColumns(left: string, right: string, width: number): string {
  const safeWidth = Math.max(1, width);
  const rightWidth = visibleWidth(right);
  if (rightWidth + 1 >= safeWidth) return truncateToWidth(right, safeWidth, "");

  const leftWidth = safeWidth - rightWidth - 1;
  const clippedLeft = truncateToWidth(left, leftWidth, "");
  return `${clippedLeft}${" ".repeat(Math.max(1, leftWidth - visibleWidth(clippedLeft) + 1))}${right}`;
}

class ToolSelector {
  private mode: SelectorMode = { kind: "extensions" };
  private selectedIndex = 0;
  private scrollOffset = 0;
  private readonly groups: ExtensionGroup[];
  private readonly configPath: string;
  private readonly theme: SelectorTheme;
  private readonly getConfig: () => ToolSelectionConfig;
  private readonly onExtensionChange: (group: ExtensionGroup, enabled: boolean) => void;
  private readonly onToolChange: (group: ExtensionGroup, toolName: string, enabled: boolean) => void;
  private readonly onClose: () => void;

  constructor(
    groups: ExtensionGroup[],
    configPath: string,
    theme: SelectorTheme,
    getConfig: () => ToolSelectionConfig,
    onExtensionChange: (group: ExtensionGroup, enabled: boolean) => void,
    onToolChange: (group: ExtensionGroup, toolName: string, enabled: boolean) => void,
    onClose: () => void,
  ) {
    this.groups = groups;
    this.configPath = configPath;
    this.theme = theme;
    this.getConfig = getConfig;
    this.onExtensionChange = onExtensionChange;
    this.onToolChange = onToolChange;
    this.onClose = onClose;
  }

  invalidate(): void {}

  private currentGroup(): ExtensionGroup | undefined {
    if (this.mode.kind !== "tools") return undefined;
    const { extensionId } = this.mode;
    return this.groups.find((group) => group.id === extensionId);
  }

  private itemCount(): number {
    return this.mode.kind === "extensions"
      ? this.groups.length
      : (this.currentGroup()?.tools.length ?? 0);
  }

  private clampSelection(): void {
    const count = this.itemCount();
    this.selectedIndex = Math.max(0, Math.min(this.selectedIndex, Math.max(0, count - 1)));
    const maxOffset = Math.max(0, count - MAX_VISIBLE_ITEMS);
    this.scrollOffset = Math.max(0, Math.min(this.scrollOffset, maxOffset));
    if (this.selectedIndex < this.scrollOffset) this.scrollOffset = this.selectedIndex;
    if (this.selectedIndex >= this.scrollOffset + MAX_VISIBLE_ITEMS) {
      this.scrollOffset = this.selectedIndex - MAX_VISIBLE_ITEMS + 1;
    }
  }

  private move(delta: number): void {
    this.selectedIndex += delta;
    this.clampSelection();
  }

  private goTo(index: number): void {
    this.selectedIndex = index;
    this.clampSelection();
  }

  private toggleExtension(group: ExtensionGroup): void {
    const config = this.getConfig();
    const enabled = enabledToolCount(config, group) !== group.tools.length;
    this.onExtensionChange(group, enabled);
  }

  private toggleTool(group: ExtensionGroup, toolName: string): void {
    const config = this.getConfig();
    this.onToolChange(group, toolName, isToolDisabled(config, group.id, toolName));
  }

  handleInput(data: string): void {
    if (matchesKey(data, Key.up)) {
      this.move(-1);
      return;
    }
    if (matchesKey(data, Key.down)) {
      this.move(1);
      return;
    }
    if (matchesKey(data, Key.home)) {
      this.goTo(0);
      return;
    }
    if (matchesKey(data, Key.end)) {
      this.goTo(this.itemCount() - 1);
      return;
    }
    if (matchesKey(data, Key.ctrl("c"))) {
      this.onClose();
      return;
    }

    if (matchesKey(data, Key.escape)) {
      if (this.mode.kind === "tools") {
        const extensionId = this.mode.extensionId;
        this.mode = { kind: "extensions" };
        this.selectedIndex = Math.max(0, this.groups.findIndex((group) => group.id === extensionId));
        this.scrollOffset = 0;
        this.clampSelection();
      } else {
        this.onClose();
      }
      return;
    }

    if (this.mode.kind === "extensions") {
      const group = this.groups[this.selectedIndex];
      if (!group) return;
      if (matchesKey(data, Key.space)) {
        this.toggleExtension(group);
      } else if (matchesKey(data, Key.enter)) {
        this.mode = { kind: "tools", extensionId: group.id };
        this.selectedIndex = 0;
        this.scrollOffset = 0;
        this.clampSelection();
      }
      return;
    }

    const group = this.currentGroup();
    const tool = group?.tools[this.selectedIndex];
    if (!group || !tool) return;
    if (matchesKey(data, Key.space) || matchesKey(data, Key.enter)) {
      this.toggleTool(group, tool.name);
    } else if (matchesKey(data, Key.backspace)) {
      const extensionId = group.id;
      this.mode = { kind: "extensions" };
      this.selectedIndex = Math.max(0, this.groups.findIndex((candidate) => candidate.id === extensionId));
      this.scrollOffset = 0;
      this.clampSelection();
    }
  }

  private renderExtensionRow(group: ExtensionGroup, width: number): string {
    const enabled = enabledToolCount(this.getConfig(), group);
    const total = group.tools.length;
    const state = enabled === total
      ? this.theme.fg("success", `${enabled}/${total} enabled`)
      : enabled === 0
        ? this.theme.fg("muted", `${enabled}/${total} enabled`)
        : this.theme.fg("warning", `${enabled}/${total} enabled`);
    return twoColumns(group.label, state, width);
  }

  private renderToolRow(group: ExtensionGroup, tool: ToolInfo, width: number): string {
    const enabled = !isToolDisabled(this.getConfig(), group.id, tool.name);
    const state = enabled
      ? this.theme.fg("success", "enabled")
      : this.theme.fg("muted", "disabled");
    return twoColumns(tool.name, state, width);
  }

  render(width: number): string[] {
    const safeWidth = Math.max(1, width);
    const config = this.getConfig();
    const group = this.currentGroup();
    const title = group ? `Tools: ${group.label}` : `Tool Extensions (${this.getConfig().toolMode})`;
    const count = this.itemCount();
    const end = Math.min(count, this.scrollOffset + MAX_VISIBLE_ITEMS);
    const lines = [
      this.theme.fg("border", "-".repeat(safeWidth)),
      paddedLine(this.theme.fg("accent", this.theme.bold(title)), safeWidth),
      paddedLine(this.theme.fg("dim", `Project config: ${this.configPath}`), safeWidth),
      "",
    ];

    if (count === 0) {
      lines.push(paddedLine(this.theme.fg("muted", "No extension tools discovered."), safeWidth));
    } else {
      for (let index = this.scrollOffset; index < end; index += 1) {
        const selected = index === this.selectedIndex;
        const content = group
          ? this.renderToolRow(group, group.tools[index]!, Math.max(1, safeWidth - 2))
          : this.renderExtensionRow(this.groups[index]!, Math.max(1, safeWidth - 2));
        const row = paddedLine(`${selected ? ">" : " "} ${content}`, safeWidth);
        lines.push(selected ? this.theme.bg("selectedBg", row) : row);
      }
    }

    while (lines.length < 4 + Math.min(MAX_VISIBLE_ITEMS, Math.max(1, count))) lines.push(" ".repeat(safeWidth));

    if (count > MAX_VISIBLE_ITEMS) {
      lines.push(paddedLine(this.theme.fg("dim", `${this.scrollOffset + 1}-${end} of ${count}`), safeWidth));
    }

    const disabledCount = config.disabledTools.length + config.disabledExtensions.length;
    const help = group
      ? "Up/Down navigate  Space/Enter toggle  Esc back"
      : "Up/Down navigate  Enter tools  Space toggle extension  Esc close";
    lines.push("", paddedLine(this.theme.fg("dim", help), safeWidth));
    lines.push(paddedLine(this.theme.fg("dim", `${disabledCount} project disable rule(s); entries show permission, not current activation`), safeWidth));
    lines.push(this.theme.fg("border", "-".repeat(safeWidth)));
    return lines;
  }
}

function formatStatus(
  groups: ExtensionGroup[],
  config: ToolSelectionConfig,
  path: string,
  activeTools: readonly string[],
): string {
  const lines = [
    `Tool selection: ${path}`,
    `Mode: ${config.toolMode}`,
    `Active tools: ${activeTools.length}`,
    "",
  ];
  for (const group of groups) {
    lines.push(`${group.label}: ${enabledToolCount(config, group)}/${group.tools.length} allowed`);
  }
  if (!groups.length) lines.push("No extension tools discovered.");
  return lines.join("\n");
}

export default function toolSelector(pi: ExtensionAPI): void {
  if (process.env.PI_TOOL_SELECTOR_DISABLE === "1" || process.env.PI_DEFERRED_TOOLS_DISABLE === "1") return;

  let config: ToolSelectionConfig = { ...EMPTY_TOOL_SELECTION };
  let configPath: string | undefined;
  let groups: ExtensionGroup[] = [];
  const activatedTools = new Set<string>();

  pi.registerTool(createSearchToolBm25(pi, {
    canDiscover: (name) => isAllowedTool(config, groups, name),
    canActivate: (name) => config.toolMode === "adaptive"
      && isAllowedTool(config, groups, name)
      && groups.some((group) => group.tools.some((tool) => tool.name === name)),
    onActivated: (names) => {
      for (const name of names) activatedTools.add(name);
    },
  }));

  const refresh = (
    ctx: ExtensionContext,
    resetActivated = true,
    validateCore = true,
  ): void => {
    const nextPath = projectConfigPath(ctx);
    if (validateCore) {
      try {
        assertCoreToolsRegistered(pi.getAllTools().map((tool) => tool.name));
      } catch (error) {
        if (ctx.hasUI) ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
      }
    }
    const previousConfig = JSON.stringify(config);
    const previousPath = configPath;
    try {
      const nextConfig = nextPath ? loadConfig(nextPath) : { ...EMPTY_TOOL_SELECTION };
      const nextGroups = discoverExtensionGroups(pi);
      configPath = nextPath;
      config = nextConfig;
      groups = nextGroups;
      if (resetActivated || previousPath !== nextPath || previousConfig !== JSON.stringify(nextConfig)) {
        activatedTools.clear();
      }
      applyModeSelection(pi, groups, config, activatedTools);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      configPath = nextPath;
      config = { ...EMPTY_TOOL_SELECTION };
      groups = discoverExtensionGroups(pi);
      activatedTools.clear();
      applyModeSelection(pi, groups, config, activatedTools);
      if (ctx.hasUI) ctx.ui.notify(reason, "error");
    }
  };

  const changeMode = (
    mode: ToolMode,
    path: string,
    ctx: ToolContext,
    clearDisabled = false,
  ): void => {
    config = clearDisabled
      ? { toolMode: mode, disabledExtensions: [], disabledTools: [] }
      : setToolMode(config, mode);
    activatedTools.clear();
    saveConfig(path, config);
    groups = discoverExtensionGroups(pi);
    applyModeSelection(pi, groups, config, activatedTools);
    notify(ctx, `Tool mode: ${mode} (${pi.getActiveTools().length} active tools).`, "info");
  };

  const openSelector = async (args: string, ctx: ExtensionCommandContext): Promise<void> => {
    const path = projectConfigPath(ctx);
    if (!path) {
      notify(ctx, "Project tool selection requires a trusted project. Run /trust, restart Pi, then use /tools.", "warning");
      return;
    }

    try {
      config = loadConfig(path);
      configPath = path;
    } catch (error) {
      notify(ctx, error instanceof Error ? error.message : String(error), "error");
      return;
    }

    groups = discoverExtensionGroups(pi);
    const command = normalize(args);
    if (command === "list") {
      notify(ctx, formatStatus(groups, config, path, pi.getActiveTools()));
      return;
    }
    if (command === "adaptive" || command === "fast" || command === "full") {
      changeMode(command, path, ctx);
      return;
    }
    if (command === "reset") {
      changeMode("full", path, ctx, true);
      return;
    }
    if (args.trim()) {
      notify(ctx, "Usage: /tools [list|adaptive|fast|full|reset]", "warning");
      return;
    }
    if (ctx.mode !== "tui") {
      notify(ctx, "/tools requires TUI mode. Use /tools list to inspect the current project selection.", "error");
      return;
    }

    const persist = (next: ToolSelectionConfig): void => {
      try {
        saveConfig(path, next);
        config = next;
        applyModeSelection(pi, groups, config, activatedTools);
      } catch (error) {
        notify(ctx, error instanceof Error ? error.message : String(error), "error");
      }
    };

    await ctx.ui.custom<void>((tui, theme, _keybindings, done) => {
      const selector = new ToolSelector(
        groups,
        path,
        theme,
        () => config,
        (group, enabled) => persist(setExtensionEnabled(config, group, enabled)),
        (group, toolName, enabled) => persist(setToolEnabled(config, group, toolName, enabled)),
        () => done(undefined),
      );

      return {
        render: (width) => selector.render(width),
        invalidate: () => selector.invalidate(),
        handleInput: (data) => {
          selector.handleInput(data);
          tui.requestRender();
        },
      };
    });
  };

  registerToolCommands(pi, openSelector);

  pi.registerShortcut(Key.ctrlAlt("t"), {
    description: "Cycle tool mode: fast, adaptive, full",
    handler: (ctx) => {
      const path = projectConfigPath(ctx);
      if (!path) {
        notify(ctx, "Tool mode cycling requires a trusted project.", "warning");
        return;
      }
      changeMode(nextToolMode(config.toolMode), path, ctx);
    },
  });

  pi.on("session_start", (_event, ctx) => refresh(ctx, true, false));
  pi.on("before_agent_start", (_event, ctx) => refresh(ctx, false, true));
}
