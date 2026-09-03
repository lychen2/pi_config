import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
  ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

// Keep these definitions dependency-light. The implementation modules are imported only
// after the corresponding tool is executed.
const BrowserParams = {
  type: "object",
  properties: {
    action: { type: "string", enum: ["open", "close", "run"], description: "open: launch or attach a tab; close: close one or all tabs; run: execute JavaScript in a tab" },
    name: { type: "string", description: "Named tab id; defaults to main" },
    url: { type: "string", description: "URL to navigate on open" },
    app: {
      type: "object",
      properties: {
        path: { type: "string", description: "Chromium/Chrome/Edge executable path" },
        cdp_url: { type: "string", description: "Existing browser CDP endpoint" },
        args: { type: "array", items: { type: "string" }, description: "Extra browser launch arguments" },
        target: { type: "string", description: "Existing page URL/title substring" },
      },
      additionalProperties: false,
    },
    visible: { type: "boolean", description: "Launch a headed browser window; default is headless" },
    viewport: {
      type: "object",
      properties: {
        width: { type: "number", minimum: 1 },
        height: { type: "number", minimum: 1 },
        scale: { type: "number", minimum: 0.1, maximum: 10 },
      },
      required: ["width", "height"],
      additionalProperties: false,
    },
    wait_until: { type: "string", enum: ["load", "domcontentloaded", "networkidle0", "networkidle2"] },
    dialogs: { type: "string", enum: ["accept", "dismiss"] },
    code: { type: "string", minLength: 1, description: "Async JavaScript function body required for run" },
    timeout: { type: "number", minimum: 1, maximum: 300, description: "Timeout in seconds" },
    all: { type: "boolean", description: "Close all named tabs" },
    kill: { type: "boolean", description: "Deprecated close alias" },
  },
  required: ["action"],
  additionalProperties: false,
} as const;

const BashBgParams = Type.Object({
  action: Type.Union([Type.Literal("run"), Type.Literal("start"), Type.Literal("status"), Type.Literal("wait"), Type.Literal("kill"), Type.Literal("list")]),
  command: Type.Optional(Type.String({ minLength: 1, description: "Shell command, required for run and start" })),
  jobId: Type.Optional(Type.String({ description: "Job identifier, required for status, wait, and kill" })),
  cwd: Type.Optional(Type.String({ description: "Working directory for run and start" })),
  timeout: Type.Optional(Type.Integer({ minimum: 1, maximum: 3600, description: "Seconds to wait for run or wait; default 30" })),
  tail: Type.Optional(Type.Integer({ minimum: 1, maximum: 500, description: "Output tail lines; default 20" })),
});

const FffGrepParams = Type.Object({
  pattern: Type.String({ minLength: 1, description: "Literal text to search for" }),
  context: Type.Optional(Type.Integer({ minimum: 0, maximum: 20, description: "Context lines before and after each match" })),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, description: "Maximum matches to return" })),
});

const FffFindParams = Type.Object({
  pattern: Type.String({ minLength: 1, description: "Fuzzy file-path query" }),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, description: "Maximum files to return" })),
});

const ConflictParams = Type.Object({
  action: Type.Union([Type.Literal("list"), Type.Literal("diff"), Type.Literal("resolve")]),
  uri: Type.Optional(Type.String({ description: "Short-lived handle from the latest conflict list" })),
  content: Type.Optional(Type.String({ minLength: 1, description: "@ours, @theirs, or custom resolution text" })),
}, { additionalProperties: false });

const PreviewParams = Type.Object({
  format: Type.Union([Type.Literal("pdf"), Type.Literal("html"), Type.Literal("png")]),
  source: Type.Optional(Type.Union([Type.Literal("last_assistant"), Type.Literal("file"), Type.Literal("markdown")])),
  path: Type.Optional(Type.String()),
  markdown: Type.Optional(Type.String()),
  inputFormat: Type.Optional(Type.Union([Type.Literal("markdown"), Type.Literal("latex")])),
  resourcePath: Type.Optional(Type.String()),
  outputPath: Type.Optional(Type.String()),
  open: Type.Optional(Type.Boolean()),
  fontSizePx: Type.Optional(Type.Number({ minimum: 10, maximum: 24, description: "Font size for HTML/PNG preview output, 10-24px." })),
}, { additionalProperties: false });

type AnyTool = ToolDefinition<any, any>;
type ToolExecutor = (...args: any[]) => Promise<any>;
type RuntimeLoader = (pi: ExtensionAPI) => void | Promise<void>;

type LazyToolSpec = {
  name: string;
  label: string;
  description: string;
  parameters: AnyTool["parameters"];
  executionMode?: "sequential" | "parallel";
};

function runtimeTool(pi: ExtensionAPI, name: string, loader: RuntimeLoader): Promise<AnyTool> {
  let captured: AnyTool | undefined;
  const runtimePi = new Proxy(pi, {
    get(target, property, receiver) {
      if (property === "registerTool") {
        return (tool: AnyTool) => {
          if (tool.name === name) captured = tool;
        };
      }
      const value = Reflect.get(target, property, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  return Promise.resolve(loader(runtimePi as ExtensionAPI)).then(() => {
    if (!captured) throw new Error(`Lazy tool ${name} did not register an implementation.`);
    return captured;
  });
}

function registerLazyTool(pi: ExtensionAPI, spec: LazyToolSpec, loader: RuntimeLoader): void {
  let runtime: Promise<AnyTool> | undefined;
  const load = (): Promise<AnyTool> => runtime ??= runtimeTool(pi, spec.name, loader);
  pi.registerTool({
    name: spec.name,
    label: spec.label,
    description: spec.description,
    parameters: spec.parameters,
    ...(spec.executionMode ? { executionMode: spec.executionMode } : {}),
    async execute(...args: Parameters<ToolExecutor>): Promise<unknown> {
      const tool = await load();
      return (tool.execute as ToolExecutor)(...args);
    },
  } as AnyTool);
}

export function registerLazyTools(pi: ExtensionAPI): void {
  registerLazyTool(pi, {
    name: "browser",
    label: "Browser",
    description: "Control Chromium through named tabs with trusted host-level JavaScript.",
    parameters: BrowserParams,
    executionMode: "sequential",
  }, async (runtimePi) => {
    const module = await import("./browser/index.ts");
    module.default(runtimePi);
  });

  registerLazyTool(pi, {
    name: "ffgrep",
    label: "FFF Grep",
    description: "Fast indexed literal content search in the current workspace.",
    parameters: FffGrepParams,
  }, async (runtimePi) => {
    const module = await import("./maestro/src/fff.ts");
    module.registerFff(runtimePi);
  });

  registerLazyTool(pi, {
    name: "fffind",
    label: "FFF Find",
    description: "Fast indexed fuzzy file-path search in the current workspace.",
    parameters: FffFindParams,
  }, async (runtimePi) => {
    const module = await import("./maestro/src/fff.ts");
    module.registerFff(runtimePi);
  });

  registerLazyTool(pi, {
    name: "bash_bg",
    label: "Background Bash",
    description: "Run shell commands with adaptive foreground/background execution.",
    parameters: BashBgParams,
  }, async (runtimePi) => {
    const module = await import("./maestro/src/bash-bg.ts");
    module.registerBashBg(runtimePi);
  });

  registerLazyTool(pi, {
    name: "conflict",
    label: "Conflict",
    description: "List, inspect, and resolve Git merge conflicts.",
    parameters: ConflictParams,
  }, async (runtimePi) => {
    const module = await import("./maestro/src/conflict.ts");
    module.registerConflictTool(runtimePi);
  });

  registerLazyTool(pi, {
    name: "preview_export",
    label: "Preview",
    description: "Render Markdown/LaTeX, a local file, or the latest assistant response to PDF, HTML, or PNG artifact files.",
    parameters: PreviewParams,
  }, async (runtimePi) => {
    const module = await import("./preview/index.ts");
    await module.default(runtimePi);
  });
}

export function registerLazyLargeCommand(pi: ExtensionAPI): void {
  let runtime: Promise<{ handler: (args: string, ctx: ExtensionCommandContext) => Promise<void> }> | undefined;
  const load = async () => runtime ??= runtimeToolCommand(pi);
  pi.registerCommand("large", {
    description: "切换纯净 Pi 与完整 pi-maestro-flow 配置档",
    getArgumentCompletions: () => [
      { value: "on", label: "完整安装并启用 Flow" },
      { value: "off", label: "恢复 Large 前 profile" },
      { value: "status", label: "查看模式和 Flow 版本" },
      { value: "update", label: "检查 Flow 更新" },
      { value: "update apply", label: "预安装并应用 Flow 更新" },
    ],
    handler: async (args, ctx) => (await load()).handler(args, ctx),
  });
}

async function runtimeToolCommand(pi: ExtensionAPI): Promise<{
  handler: (args: string, ctx: ExtensionCommandContext) => Promise<void>;
}> {
  let command: { handler: (args: string, ctx: ExtensionCommandContext) => Promise<void> } | undefined;
  const runtimePi = new Proxy(pi, {
    get(target, property, receiver) {
      if (property === "registerCommand") {
        return (name: string, definition: { handler: (args: string, ctx: ExtensionCommandContext) => Promise<void> }) => {
          if (name === "large") command = definition;
        };
      }
      const value = Reflect.get(target, property, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  const module = await import("./large-mode.ts");
  module.default(runtimePi as ExtensionAPI);
  if (!command) throw new Error("Lazy large command did not register an implementation.");
  return command;
}
