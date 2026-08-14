import type { ExtensionAPI, ToolDefinition } from "@earendil-works/pi-coding-agent";
import { createReadToolDefinition } from "@earendil-works/pi-coding-agent";
import { createJiti } from "jiti";
import { Type } from "typebox";

const jiti = createJiti(import.meta.url, { interopDefault: true });
const loadRuntimeExtension = async (specifier: string): Promise<(pi: ExtensionAPI) => void> => {
  const loaded = await jiti.import(specifier) as { default?: (pi: ExtensionAPI) => void } | ((pi: ExtensionAPI) => void);
  const extension = typeof loaded === "function" ? loaded : loaded.default;
  if (typeof extension !== "function") throw new Error(`Extension ${specifier} has no default factory`);
  return extension;
};

const IMAGE_EXTENSIONS = new Set([".bmp", ".gif", ".jpeg", ".jpg", ".png", ".webp"]);

export const READSEEK_LANGUAGES = [
  "assembly", "bash", "c", "cpp", "csharp", "css", "dockerfile", "gdscript", "go",
  "html", "java", "javascript", "json", "jsx", "just", "kconfig", "latex", "lua",
  "make", "markdown", "meson", "nix", "odin", "perl", "php", "puppet", "python",
  "riscv", "ruby", "rust", "sql", "swift", "toml", "tsx", "typescript", "typst",
  "vimscript", "xml", "yaml", "zig",
] as const;

const READSEEK_LANGUAGE_SCHEMA = Type.Union(
  READSEEK_LANGUAGES.map((language) => Type.Literal(language)),
  {
    description:
      "Readseek parser language. Omit this field for auto-detection; do not pass text, an empty string, or a file extension.",
  },
);

const REASONING_PROPERTY = Type.String({
  description: "Short phrase (12 words or fewer) stating the goal behind this call, not the file, path, or command.",
});

const NATIVE_READ_SCHEMA = Type.Object({
  reasoning: REASONING_PROPERTY,
  path: Type.String({ description: "Path to the file to read (relative or absolute)" }),
  offset: Type.Optional(Type.Integer({ minimum: 1, description: "Line number to start reading from (1-indexed)" })),
  limit: Type.Optional(Type.Integer({ minimum: 1, description: "Maximum number of lines to read" })),
});

const OBSERVE_DESCRIPTION = `Observe teammate and workspace targets through one status/wait/watch interface.

- "status": one-shot snapshot of every target
- "wait": block on an all/any/count barrier with one request-level timeout; set until="completed" to block until agents fully terminate instead of first result
- "watch": poll every target until the bounded timeoutMs you provide, returning the full status-transition timeline
- view="turns" (status only): list the target's session turn history instead of the live snapshot; add turn=<n> to expand one 1-based turn

Targets use { kind, id }, where kind is "teammate" or "workspace". Background shell jobs are not observation targets; control them with bash_bg(action="status"|"wait"|"kill").`;

const OBSERVE_GUIDELINES = [
  "Use observe for teammate and workspace status or waits; use one bounded wait instead of polling status.",
  "Use action=watch to follow status transitions over time; always pass a bounded timeoutMs. Use action=wait until=completed to block until agents fully terminate.",
  "Use detail=full only when recent output is required; summary is the compact default.",
  "Use view=turns with action=status to read a session's history; view=turns is not supported by wait or watch.",
  "For background shell jobs, call bash_bg directly; observe does not accept bash_bg targets.",
];

const TEAMMATE_DESCRIPTION = `Dispatch tasks to teammate agents. Teammates run as Pi subprocesses with their own tools and context. Minimal call: { tasks: [{ prompt: "Inspect auth" }] }.

Every dispatch uses a non-empty tasks array; prompt is the only required per-task field. Optional per-task fields: name, dependsOn, agent, taskType, model, thinking, context, cwd, outputSchema, maxNestingDepth, description, todo, timeoutMs. Use an exact agent name from the Available Teammate Agents list; unknown names are rejected. Set concurrency for parallel fan-out; {name} or {name.field} references inject one task's output into a dependent task's prompt, and dependsOn declares ordering without injecting output.

Omit model to use task-type routing; an explicit model id not in the current catalog fails fast. A call that outlives its wait window moves to the background and delivers its result via a later automatic completion notification.`;

const TEAMMATE_SNIPPET = "Dispatch bounded tasks to teammate subprocess agents; use for parallel, independent, or review work.";

const TEAMMATE_GUIDELINES = [
  "Use teammate for bounded independent subtasks, parallel progress, or independent review; keep trivial, tightly coupled, or context-dependent work in the parent agent.",
  "Give every task a minimal self-contained brief: goal, relevant paths or state, constraints, acceptance checks, and expected output.",
  "After a background dispatch, end the current turn and wait for the automatic completion notification instead of polling.",
];

type JsonSchema = Record<string, any>;
type AnyTool = ToolDefinition<any, any> & Record<string, any>;
type ToolAdapter = (tool: AnyTool) => AnyTool;
type ToolInput = Record<string, unknown>;
type ReadSeekValue = {
  ok?: unknown;
  error?: { code?: unknown };
};
type ToolDetails = { readSeekValue?: ReadSeekValue };

function schemaOf(tool: AnyTool): JsonSchema {
  return tool.parameters as JsonSchema;
}

function withProperties(schema: JsonSchema, properties: JsonSchema): JsonSchema {
  return {
    ...schema,
    properties: {
      ...(schema.properties ?? {}),
      ...properties,
    },
  };
}

function withAllOf(schema: JsonSchema, clauses: JsonSchema[]): JsonSchema {
  return {
    ...schema,
    allOf: [...(Array.isArray(schema.allOf) ? schema.allOf : []), ...clauses],
  };
}

function withReasoning(schema: JsonSchema): JsonSchema {
  return {
    ...schema,
    properties: {
      reasoning: REASONING_PROPERTY,
      ...(schema.properties ?? {}),
    },
    required: Array.from(new Set(["reasoning", ...(schema.required ?? [])])),
  };
}

function stripReasoning(input: unknown): unknown {
  if (!input || typeof input !== "object" || Array.isArray(input)) return input;
  const { reasoning: _reasoning, ...rest } = input as Record<string, unknown>;
  return rest;
}

export function adaptReadSeekTool(tool: AnyTool): AnyTool {
  let parameters = schemaOf(tool);
  if (parameters.properties?.language) {
    parameters = withProperties(parameters, { language: READSEEK_LANGUAGE_SCHEMA });
  }

  if (tool.name === "readSeek_digest") {
    parameters = withAllOf(parameters, [
      { not: { required: ["end", "limit"] } },
      {
        if: { required: ["visionLevel"] },
        then: { required: ["visionMode"] },
      },
    ]);
  }

  if (tool.name === "readSeek_view") {
    parameters = withProperties(parameters, {
      node: Type.Optional(Type.String({
        minLength: 1,
        description:
          "Short-lived node ID returned by readSeek_view(path, outline=true). Copy an exact current ID; do not guess IDs such as root. Refresh the outline after document changes.",
      })),
      page: Type.Optional(Type.Union([
        Type.Integer({ minimum: 1, description: "One-based source page" }),
        Type.String({ pattern: "^0*[1-9]\\d*$", description: "One-based source page as a positive base-10 integer string" }),
      ])),
    });
    parameters = withAllOf(parameters, [
      {
        if: { properties: { outline: { const: true } }, required: ["outline"] },
        then: {
          not: {
            anyOf: [{ required: ["visionMode"] }, { required: ["visionLevel"] }],
          },
        },
      },
      {
        if: { required: ["visionLevel"] },
        then: { required: ["visionMode"] },
      },
    ]);
  }

  // Native write and grep are replaced by ReadSeek in default mode; add the
  // shared reasoning field here so all five core file/shell tools expose the
  // same contract (tool-rails owns reasoning for bash and the native edit).
  if (tool.name === "write" || tool.name === "grep") {
    parameters = withReasoning(parameters);
  }

  return { ...tool, parameters };
}

export function adaptWebAccessTool(tool: AnyTool): AnyTool {
  if (tool.name !== "get_search_content") return tool;
  let parameters = withProperties(schemaOf(tool), {
    offset: Type.Optional(Type.Integer({
      minimum: 0,
      description: "Character offset for bounded content slices. Cannot be combined with findText.",
    })),
    limit: Type.Optional(Type.Integer({
      minimum: 1,
      description: "Maximum characters to return. Cannot be combined with findText.",
    })),
  });
  parameters = {
    ...parameters,
    oneOf: [
      {
        required: ["findText"],
        not: { anyOf: [{ required: ["offset"] }, { required: ["limit"] }] },
      },
      {
        allOf: [
          { not: { required: ["findText"] } },
          { not: { required: ["findMode"] } },
        ],
      },
    ],
  };
  return { ...tool, parameters };
}

export function adaptTeammateTool(tool: AnyTool): AnyTool {
  if (tool.name === "teammate") {
    return {
      ...tool,
      description: TEAMMATE_DESCRIPTION,
      promptSnippet: TEAMMATE_SNIPPET,
      promptGuidelines: TEAMMATE_GUIDELINES,
    };
  }
  if (tool.name !== "observe") return tool;

  const parameters = schemaOf(tool);
  const targets = parameters.properties?.targets as JsonSchema | undefined;
  const target = targets?.items as JsonSchema | undefined;
  const adaptedTargets = targets && target
    ? {
        ...targets,
        items: withProperties(target, {
          kind: Type.Union([Type.Literal("teammate"), Type.Literal("workspace")], {
            description: "Observation provider kind. Background shell jobs use bash_bg directly.",
          }),
        }),
      }
    : targets;

  return {
    ...tool,
    description: OBSERVE_DESCRIPTION,
    promptSnippet: "Observe, wait for, or watch teammate and workspace targets; background shell jobs use bash_bg.",
    promptGuidelines: OBSERVE_GUIDELINES,
    parameters: adaptedTargets ? withProperties(parameters, { targets: adaptedTargets }) : parameters,
  };
}

export function createToolAdaptingApi(pi: ExtensionAPI, adapt: ToolAdapter): ExtensionAPI {
  let registerTool = (tool: AnyTool): void => {
    pi.registerTool(adapt(tool) as never);
  };

  return new Proxy(pi, {
    get(target, property) {
      if (property === "registerTool") return registerTool;
      const value = Reflect.get(target as object, property, target as object);
      return typeof value === "function" ? value.bind(target) : value;
    },
    set(target, property, value) {
      if (property === "registerTool" && typeof value === "function") {
        registerTool = value as (tool: AnyTool) => void;
        return true;
      }
      return Reflect.set(target as object, property, value, target as object);
    },
  }) as ExtensionAPI;
}

export function isStandaloneImage(path: unknown): boolean {
  if (typeof path !== "string") return false;
  const normalized = path.trim().replace(/[?#].*$/, "").toLowerCase();
  const slash = normalized.lastIndexOf("/");
  const dot = normalized.lastIndexOf(".");
  return dot > slash && IMAGE_EXTENSIONS.has(normalized.slice(dot));
}

export function normalizeDigestInput(input: ToolInput): void {
  if (!isStandaloneImage(input.path)) {
    delete input.visionMode;
    delete input.visionLevel;
    return;
  }

  if (input.visionMode === undefined || input.visionMode === "none") {
    delete input.visionLevel;
  }
}

export function isReadSeekFailure(details: unknown): boolean {
  if (!details || typeof details !== "object" || Array.isArray(details)) return false;
  const value = (details as ToolDetails).readSeekValue;
  return Boolean(value && value.ok === false);
}

export function readSeekErrorCode(details: unknown): string | undefined {
  if (!details || typeof details !== "object" || Array.isArray(details)) return undefined;
  const code = (details as ToolDetails).readSeekValue?.error?.code;
  return typeof code === "string" ? code : undefined;
}

export function createRecoveringReadSeekAdapter(): ToolAdapter {
  const tools = new Map<string, AnyTool>();

  return (sourceTool) => {
    const tool = adaptReadSeekTool(sourceTool);
    tools.set(tool.name, tool);
    const stripsReasoning = tool.name === "write" || tool.name === "grep";
    const recoversAnchor = tool.name === "edit" || tool.name === "readSeek_edit";
    if (!stripsReasoning && !recoversAnchor) return tool;

    const execute = tool.execute.bind(tool);
    return {
      ...tool,
      async execute(
        id: Parameters<typeof execute>[0],
        params: Parameters<typeof execute>[1],
        signal: Parameters<typeof execute>[2],
        onUpdate: Parameters<typeof execute>[3],
        ctx: Parameters<typeof execute>[4],
      ) {
        const clean = stripsReasoning ? stripReasoning(params) : params;
        const first = await execute(id, clean, signal, onUpdate, ctx);
        if (!recoversAnchor) return first;
        if (readSeekErrorCode(first.details) !== "file-not-read") return first;

        const digest = tools.get("readSeek_digest") ?? tools.get("read");
        const path = clean && typeof clean === "object" ? (clean as ToolInput).path : undefined;
        if (!digest || typeof path !== "string") return first;

        const recovered = await digest.execute(
          `${id}:anchor-recovery`,
          { path, limit: 1 },
          signal,
          undefined,
          ctx,
        );
        if (isReadSeekFailure(recovered.details)) return first;
        return execute(id, clean, signal, onUpdate, ctx);
      },
    };
  };
}

export function registerNativeRead(pi: ExtensionAPI): void {
  const nativeRead = createReadToolDefinition(process.cwd());
  const execute = nativeRead.execute.bind(nativeRead);
  pi.registerTool({
    ...nativeRead,
    parameters: NATIVE_READ_SCHEMA,
    async execute(
      id: Parameters<typeof execute>[0],
      params: Parameters<typeof execute>[1],
      signal: Parameters<typeof execute>[2],
      onUpdate: Parameters<typeof execute>[3],
      ctx: Parameters<typeof execute>[4],
    ) {
      const clean = stripReasoning(params) as Parameters<typeof execute>[1];
      if (!Number.isInteger(clean.offset ?? 1) || (clean.offset ?? 1) < 1) {
        throw new Error("read offset must be an integer >= 1");
      }
      if (!Number.isInteger(clean.limit ?? 1) || (clean.limit ?? 1) < 1) {
        throw new Error("read limit must be an integer >= 1");
      }
      return execute(id, clean, signal, onUpdate, ctx);
    },
  } as never);
}

export default async function readSeekCompat(pi: ExtensionAPI): Promise<void> {
  const [registerReadSeek, registerWebAccess, registerTeammate] = await Promise.all([
    loadRuntimeExtension("pi-readseek"),
    loadRuntimeExtension("pi-web-access"),
    loadRuntimeExtension("pi-maestro-teammate/src/extension/index.ts"),
  ]);

  registerReadSeek(createToolAdaptingApi(pi, createRecoveringReadSeekAdapter()));
  registerWebAccess(createToolAdaptingApi(pi, adaptWebAccessTool));
  registerTeammate(createToolAdaptingApi(pi, adaptTeammateTool));
  registerNativeRead(pi);

  pi.on("tool_call", (event) => {
    if (event.toolName !== "readSeek_digest") return;
    normalizeDigestInput(event.input as ToolInput);
  });

  pi.on("tool_result", (event) => {
    if (!isReadSeekFailure(event.details)) return;
    return { isError: true };
  });
}
