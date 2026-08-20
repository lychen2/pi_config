import type { SessionEntry } from "@earendil-works/pi-coding-agent";

type JsonRecord = Record<string, unknown>;

export const TARGET_MODEL_IDS = [
  "deepseek-v4-pro",
  "deepseek-v4-flash",
] as const;
export const MINIMAL_PERSONA = "You are a helpful software engineer assistant.";
export const MINIMAL_BASH_DESCRIPTION = `Run commands in a bash shell
* When invoking this tool, the contents of the "command" parameter does NOT need to be XML-escaped.
* You don't have access to the internet via this tool.
* You do have access to a mirror of common linux and python packages via apt and pip.
* State is persistent across command calls and discussions with the user.
* To inspect a particular line range of a file, e.g. lines 10-25, try 'sed -n 10,25p /path/to/the/file'.
* Please avoid commands that may produce a very large amount of output.
* Please run long lived commands in the background, e.g. 'sleep 10 &' or start a server in the background.`;

export const MINIMAL_EDITOR_DESCRIPTION = `Custom editing tool for viewing, creating and editing files
* State is persistent across command calls and discussions with the user
* If \`path\` is a file, \`view\` displays the result of applying \`cat -n\`. If \`path\` is a directory, \`view\` lists non-hidden files and directories up to 2 levels deep
* The \`create\` command cannot be used if the specified \`path\` already exists as a file
* If a \`command\` generates a long output, it will be truncated and marked with \`<response clipped>\`

Notes for using the \`str_replace\` command:
* The \`old_str\` parameter should match EXACTLY one or more consecutive lines from the original file. Be mindful of whitespaces!
* If the \`old_str\` parameter is not unique in the file, the replacement will not be performed. Make sure to include enough context in \`old_str\` to make it unique
* The \`new_str\` parameter should contain the edited lines that should replace the \`old_str\``;

export const DEFAULT_ANCHOR_TEXT =
  "请简单介绍一下你自己，以及你当前可用的工具。";
export const STATE_TYPE = "pi-deepseek-anchored-standard/state-v2";

export type Phase = "bootstrap" | "promoted";
export type PromoteOn = "either" | "tool-call" | "assistant-message";
export type Mode = "progressive" | "direct";

export interface AnchorState {
  version: 2;
  phase: Phase;
  fullTools: string[];
  modelId: string;
}

export function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function canonicalModelId(value: string | undefined): string | undefined {
  const model = value?.trim().toLowerCase();
  if (!model) return undefined;
  return model.split("/").at(-1);
}

export function isTargetModel(value: string | undefined): boolean {
  const model = canonicalModelId(value);
  return model !== undefined && TARGET_MODEL_IDS.includes(model as (typeof TARGET_MODEL_IDS)[number]);
}

export function parseMode(value: string | undefined): Mode {
  const normalized = value?.trim().toLowerCase();
  if (normalized === undefined || normalized === "" || normalized === "progressive") {
    return "progressive";
  }
  if (normalized === "direct") return "direct";
  throw new TypeError(
    `mode must be "progressive" or "direct"; got ${JSON.stringify(value)}`,
  );
}

export function parsePromoteOn(value: string | undefined): PromoteOn {
  const normalized = value?.trim().toLowerCase();
  if (normalized === undefined || normalized === "" || normalized === "either") {
    return "either";
  }
  if (normalized === "tool-call" || normalized === "assistant-message") {
    return normalized;
  }
  throw new TypeError(
    `promoteOn must be "either", "tool-call", or "assistant-message"; got ${JSON.stringify(value)}`,
  );
}

export function uniquePresent(
  available: readonly string[],
  requested: readonly string[],
): string[] {
  const names = new Set(available);
  return [...new Set(requested)].filter((name) => names.has(name));
}

function toolName(tool: unknown): string | undefined {
  if (!isRecord(tool)) return undefined;
  if (typeof tool.name === "string") return tool.name;
  if (isRecord(tool.function) && typeof tool.function.name === "string") {
    return tool.function.name;
  }
  return undefined;
}

/**
 * Keep the bootstrap pair in provider order. If either tool is absent, retain
 * the payload untouched rather than making a partial Minimal preset request.
 */
export function bootstrapToolPayload(
  payload: unknown,
  bootstrapTools: readonly string[],
): unknown {
  if (!isRecord(payload) || !Array.isArray(payload.tools)) return payload;
  const present = uniquePresent(
    payload.tools.flatMap((tool) => {
      const name = toolName(tool);
      return name === undefined ? [] : [name];
    }),
    bootstrapTools,
  );
  if (present.length !== bootstrapTools.length) return payload;
  const allowed = new Set(present);
  return {
    ...payload,
    tools: payload.tools.filter((tool) => {
      const name = toolName(tool);
      return name !== undefined && allowed.has(name);
    }),
  };
}

function minimalSchemaFor(name: string): { description: string; parameters: JsonRecord } | undefined {
  if (name === "bash") {
    return {
      description: MINIMAL_BASH_DESCRIPTION,
      parameters: {
        type: "object",
        properties: { command: { type: "string" } },
        required: ["command"],
      },
    };
  }
  if (name === "str_replace_editor") {
    return {
      description: MINIMAL_EDITOR_DESCRIPTION,
      parameters: {
        type: "object",
        properties: {
          command: { enum: ["view", "create", "str_replace", "insert"] },
          path: { type: "string" },
          file_text: { type: "string" },
          insert_line: { type: "integer" },
          new_str: { type: "string" },
          old_str: { type: "string" },
          view_range: { type: "array", items: { type: "integer" } },
        },
        required: ["command", "path"],
      },
    };
  }
  return undefined;
}

/** Rewrite only the Minimal pair's provider schemas on the bootstrap request. */
export function withMinimalToolSchemas(payload: unknown): unknown {
  if (!isRecord(payload) || !Array.isArray(payload.tools)) return payload;
  let changed = false;
  const tools = payload.tools.map((tool) => {
    if (!isRecord(tool)) return tool;
    const nested = isRecord(tool.function) ? tool.function : undefined;
    const name = nested && typeof nested.name === "string"
      ? nested.name
      : typeof tool.name === "string"
        ? tool.name
        : undefined;
    const schema = name === undefined ? undefined : minimalSchemaFor(name);
    if (!schema) return tool;
    changed = true;
    if (nested) {
      return {
        type: "function",
        function: { name, description: schema.description, parameters: schema.parameters },
      };
    }
    return {
      ...tool,
      description: schema.description,
      parameters: schema.parameters,
    };
  });
  return changed ? { ...payload, tools } : payload;
}
function contentText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .flatMap((part) => {
      if (!isRecord(part)) return [];
      if (typeof part.text === "string") return [part.text];
      if (typeof part.content === "string") return [part.content];
      return [];
    })
    .join("");
}

function replaceSystemInList(list: unknown[], persona: string): unknown[] {
  let replaced = false;
  return list.map((entry) => {
    if (replaced || !isRecord(entry)) return entry;
    if (entry.role !== "system" && entry.role !== "developer") return entry;
    replaced = true;
    return { ...entry, content: persona };
  });
}

/** Replace system instructions in Chat Completions and Responses payloads. */
export function withMinimalPersona(payload: unknown, persona = MINIMAL_PERSONA): unknown {
  if (!isRecord(payload)) return payload;
  let changed = false;
  const result: JsonRecord = { ...payload };
  if (Array.isArray(payload.messages)) {
    result.messages = replaceSystemInList(payload.messages, persona);
    changed = true;
  }
  if (Array.isArray(payload.input)) {
    result.input = replaceSystemInList(payload.input, persona);
    changed = true;
  }
  if (typeof payload.instructions === "string") {
    result.instructions = persona;
    changed = true;
  }
  return changed ? result : payload;
}

const INJECTED_BLOCK_PREFIXES = [
  "<user-profile>",
  "<session-history",
  "<project-memory>",
  "<project-docs>",
  "<knowledge-updates>",
  "<memory-mural>",
  "<new-memories>",
  "<new-user-profile>",
  "<new-compartments>",
] as const;

function injectedContext(text: string): boolean {
  const trimmed = text.trimStart();
  return INJECTED_BLOCK_PREFIXES.some((prefix) => trimmed.startsWith(prefix));
}

function stripLeadingInjectedMessages(list: unknown[]): unknown[] {
  let lastUser = -1;
  for (let index = 0; index < list.length; index += 1) {
    const message = list[index];
    if (isRecord(message) && message.role === "user") lastUser = index;
  }
  if (lastUser < 0) return list;
  return list.filter((message, index) => {
    if (index >= lastUser || !isRecord(message) || message.role !== "user") {
      return true;
    }
    return !injectedContext(contentText(message.content));
  });
}

/** Remove generated leading context from the bootstrap request only. */
export function stripBootstrapContext(payload: unknown): unknown {
  if (!isRecord(payload)) return payload;
  let changed = false;
  const result: JsonRecord = { ...payload };
  if (Array.isArray(payload.messages)) {
    const messages = stripLeadingInjectedMessages(payload.messages);
    if (messages.length !== payload.messages.length) changed = true;
    result.messages = messages;
  }
  if (Array.isArray(payload.input)) {
    const input = stripLeadingInjectedMessages(payload.input);
    if (input.length !== payload.input.length) changed = true;
    result.input = input;
  }
  return changed ? result : payload;
}

export function stripSyntheticAnchorTurn(
  payload: unknown,
  anchorText: string,
): unknown {
  if (!isRecord(payload)) return payload;

  const stripFrom = (list: unknown[]): unknown[] => {
    let anchor = -1;
    let nextUser = -1;
    for (let index = 0; index < list.length; index += 1) {
      const entry = list[index];
      if (!isRecord(entry) || entry.role !== "user") continue;
      if (anchor < 0 && contentText(entry.content) === anchorText) {
        anchor = index;
        continue;
      }
      if (anchor >= 0) {
        nextUser = index;
        break;
      }
    }
    if (anchor < 0 || nextUser < 0) return list;
    return [...list.slice(0, anchor), ...list.slice(nextUser)];
  };

  let changed = false;
  const result: JsonRecord = { ...payload };
  if (Array.isArray(payload.messages)) {
    const messages = stripFrom(payload.messages);
    changed ||= messages !== payload.messages;
    result.messages = messages;
  }
  if (Array.isArray(payload.input)) {
    const input = stripFrom(payload.input);
    changed ||= input !== payload.input;
    result.input = input;
  }
  return changed ? result : payload;
}

export function bootstrapPayload(
  payload: unknown,
  bootstrapTools: readonly string[],
): unknown {
  const filtered = bootstrapToolPayload(payload, bootstrapTools);
  const schemas = filtered === payload ? filtered : withMinimalToolSchemas(filtered);
  return withMinimalPersona(stripBootstrapContext(schemas));
}

export function hasConversation(entries: readonly SessionEntry[]): boolean {
  return entries.some(
    (entry) =>
      entry.type === "message" &&
      (entry.message.role === "user" ||
        entry.message.role === "assistant" ||
        entry.message.role === "toolResult"),
  );
}

export function hasPromotionSignal(
  entries: readonly SessionEntry[],
  promoteOn: PromoteOn,
): boolean {
  return entries.some((entry) => {
    if (entry.type !== "message") return false;
    if (entry.message.role === "toolResult") return promoteOn !== "assistant-message";
    if (entry.message.role !== "assistant") return false;
    const content = entry.message.content;
    const hasToolCall = content.some(
      (part) => isRecord(part) && part.type === "toolCall",
    );
    const hasAssistantContent = content.some(
      (part) =>
        isRecord(part) && (part.type === "text" || part.type === "thinking"),
    );
    if (promoteOn === "tool-call") return hasToolCall;
    if (promoteOn === "assistant-message") return hasAssistantContent;
    return hasToolCall || hasAssistantContent;
  });
}

export function validAnchorState(value: unknown): value is AnchorState {
  return (
    isRecord(value) &&
    value.version === 2 &&
    (value.phase === "bootstrap" || value.phase === "promoted") &&
    typeof value.modelId === "string" &&
    Array.isArray(value.fullTools) &&
    value.fullTools.every((tool) => typeof tool === "string")
  );
}
