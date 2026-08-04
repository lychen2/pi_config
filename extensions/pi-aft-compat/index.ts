import { isGitWorktree } from "./normalize.mjs";

const AFT_SEARCH = "aft_search";
const ALLOW_NO_GIT_SEARCH = "PI_AFT_SEARCH_ALLOW_NO_GIT";

const integerOrString = (description) => ({
  anyOf: [
    { type: "integer", minimum: 1, maximum: Number.MAX_SAFE_INTEGER },
    { type: "string" },
  ],
  description,
});

const pathProperty = {
  type: "string",
  description: "Path to the file to edit (absolute or relative to project root)",
};

const findReplaceItem = {
  type: "object",
  properties: {
    oldString: { type: "string", description: "Text to find" },
    newString: { type: "string", description: "Replacement text" },
    replaceAll: { type: "boolean", description: "Replace every occurrence" },
    occurrence: integerOrString("1-based occurrence to replace"),
  },
  required: ["oldString", "newString"],
  additionalProperties: false,
};

const lineRangeItem = {
  type: "object",
  properties: {
    startLine: integerOrString("1-based start line"),
    endLine: integerOrString("1-based end line"),
    content: { type: "string", description: "Replacement text; empty deletes the lines" },
  },
  required: ["startLine", "endLine", "content"],
  additionalProperties: false,
};

export const exclusiveEditSchema = {
  oneOf: [
    {
      type: "object",
      properties: {
        path: pathProperty,
        appendContent: { type: "string", description: "Text to append to the file" },
      },
      required: ["path", "appendContent"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: {
        path: pathProperty,
        edits: {
          type: "array",
          minItems: 1,
          items: { oneOf: [findReplaceItem, lineRangeItem] },
          description: "Atomic find/replace or line-range edits; each item uses exactly one mode",
        },
      },
      required: ["path", "edits"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: {
        path: pathProperty,
        symbol: { type: "string", description: "Named symbol to replace" },
        content: { type: "string", description: "Replacement symbol content; empty deletes it" },
      },
      required: ["path", "symbol", "content"],
      additionalProperties: false,
    },
  ],
};

function record(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : undefined;
}

function replaceSchema(recordValue, key) {
  if (!record(recordValue[key])) return false;
  recordValue[key] = structuredClone(exclusiveEditSchema);
  return true;
}

export function rewriteProviderEditSchema(payload) {
  if (!payload || typeof payload !== "object") return payload;
  const rewritten = structuredClone(payload);
  let changed = false;
  const visit = (value) => {
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    const current = record(value);
    if (!current) return;

    if (current.name === "edit") {
      changed = replaceSchema(current, "parameters") || changed;
      changed = replaceSchema(current, "input_schema") || changed;
      changed = replaceSchema(current, "parametersJsonSchema") || changed;
    }
    const fn = record(current.function);
    if (fn?.name === "edit") {
      changed = replaceSchema(fn, "parameters") || changed;
      changed = replaceSchema(fn, "input_schema") || changed;
    }
    for (const child of Object.values(current)) visit(child);
  };
  visit(rewritten);
  return changed ? rewritten : payload;
}

function semanticSearchAllowed(cwd) {
  return process.env[ALLOW_NO_GIT_SEARCH] === "1" || isGitWorktree(cwd);
}

export default function (pi) {
  pi.on("before_provider_request", async (event) => rewriteProviderEditSchema(event.payload));

  pi.on("before_agent_start", async (event, ctx) => {
    if (semanticSearchAllowed(ctx.cwd)) return;

    const active = pi.getActiveTools();
    if (!active.includes(AFT_SEARCH)) return;
    pi.setActiveTools(active.filter((name) => name !== AFT_SEARCH));
    return {
      systemPrompt: `${event.systemPrompt}\n\nAFT semantic search is unavailable because the current directory is not a Git worktree. Use grep or ffgrep for content search, and fffind for file discovery.`,
    };
  });

  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName === AFT_SEARCH && !semanticSearchAllowed(ctx.cwd)) {
      return {
        block: true,
        reason: "aft_search is disabled outside a Git worktree. Start Pi from the project root, or use grep, ffgrep, or fffind.",
      };
    }
  });
}
