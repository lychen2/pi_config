import type { SessionEntry } from "@earendil-works/pi-coding-agent";

export interface ExportOptions {
  all: boolean;
  thinking: boolean;
  tools: boolean;
  last?: number;
  include: string[];
  exclude: string[];
  save: boolean;
}

export function parseExportArgs(args: string): ExportOptions {
  const options: ExportOptions = { all: false, thinking: false, tools: false, include: [], exclude: [], save: false };
  for (const token of args.trim().split(/\s+/).filter(Boolean)) {
    if (token === "all") options.all = true;
    else if (token === "t") options.thinking = true;
    else if (token === "tc") options.tools = true;
    else if (token === "save") options.save = true;
    else if (/^[1-9]\d*$/.test(token) && Number.isSafeInteger(Number(token)) && options.last === undefined) options.last = Number(token);
    else if (/^[+-][\w.-]+$/.test(token)) (token[0] === "+" ? options.include : options.exclude).push(token.slice(1).toLowerCase());
    else throw new Error(`Unknown argument: ${token}. Usage: /md [N | all] [t] [tc] [+tool] [-tool] [save]`);
  }
  if (!options.tools && (options.include.length || options.exclude.length)) throw new Error("Tool filters require tc.");
  if (options.all && options.last) throw new Error("Choose either all or a last-N turn limit.");
  return options;
}

export const copyOptions: ExportOptions = { all: false, thinking: false, tools: true, include: [], exclude: [], save: false };

function fence(text: string, language = ""): string {
  const runs = text.match(/`+/g) ?? [];
  const marker = "`".repeat(Math.max(3, ...runs.map((s) => s.length + 1)));
  return `${marker}${language}\n${text}\n${marker}`;
}

export function contentText(content: unknown, thinking = false): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((block) => {
    if (block?.type === "text") return block.text ?? "";
    if (block?.type === "thinking" && thinking) return `### Thinking\n\n${block.thinking ?? ""}`;
    if (block?.type === "image") return "[Image omitted]";
    return "";
  }).filter(Boolean).join("\n\n");
}

function allowedTool(name: string, options: ExportOptions): boolean {
  const normalized = name.toLowerCase();
  return options.tools && (!options.include.length || options.include.includes(normalized)) && !options.exclude.includes(normalized);
}

export interface CopyRecord {
  id: string;
  parentId: string | null;
  role: string;
  // Small eager labels, full formatting only when previewing/copying/exporting.
  label: string;
  text: () => string;
}

export function buildRecords(entries: readonly SessionEntry[], options: ExportOptions, includeInternal = false): CopyRecord[] {
  const calls = new Map<string, { name: string; arguments: unknown }>();
  for (const entry of entries) {
    if (entry.type === "message" && entry.message.role === "assistant") {
      for (const block of entry.message.content) {
        if (block.type === "toolCall") calls.set(block.id, block);
      }
    }
  }
  let start = 0;
  if (options.last) {
    let turns = 0;
    for (let i = entries.length - 1; i >= 0; i--) {
      const entry = entries[i]!;
      if (entry.type === "message" && entry.message.role === "user" && ++turns === options.last) { start = i; break; }
    }
  }
  const records: CopyRecord[] = [];
  for (const entry of entries.slice(start)) {
    let role: string;
    let raw: unknown;
    let format: () => string;
    if (entry.type === "message") {
      const message = entry.message;
      role = message.role;
      if (message.role === "toolResult") {
        if (!allowedTool(message.toolName, options)) continue;
        role = `Tool: ${message.toolName}`;
        raw = message.content;
        format = () => {
          const call = calls.get(message.toolCallId);
          const request = call ? `### Call\n\n${fence(JSON.stringify(call.arguments, null, 2), "json")}\n\n` : "";
          return `${request}### Result${message.isError ? " (error)" : ""}\n\n${fence(contentText(message.content))}`;
        };
      } else if (message.role === "assistant") {
        raw = message.content;
        format = () => {
          const text = contentText(message.content, options.thinking);
          const toolCalls = message.content.filter((b) => b.type === "toolCall" && allowedTool(b.name, options))
            .map((b) => b.type === "toolCall" ? `### Call: ${b.name}\n\n${fence(JSON.stringify(b.arguments, null, 2), "json")}` : "");
          return [text, ...toolCalls].filter(Boolean).join("\n\n");
        };
        if (!message.content.some((b) => b.type === "text" && b.text || b.type === "thinking" && options.thinking || b.type === "toolCall" && allowedTool(b.name, options))) continue;
      } else if (message.role === "user") {
        raw = message.content;
        format = () => contentText(message.content);
      } else continue;
    } else if (entry.type === "custom_message") {
      role = `Custom: ${entry.customType}`;
      raw = entry.content;
      format = () => contentText(entry.content);
    } else if (entry.type === "compaction" || entry.type === "branch_summary") {
      role = entry.type === "compaction" ? "Compaction summary" : "Branch summary";
      raw = entry.summary;
      format = () => entry.summary;
    } else if (entry.type === "custom") {
      role = `Record: ${entry.customType}`;
      raw = entry.customType;
      format = () => fence(JSON.stringify(entry.data ?? null, null, 2), "json");
      // Internal records are visible in the explicit copy browser, not default exports.
      if (!includeInternal) continue;
    } else continue;
    const preview = typeof raw === "string" ? raw.slice(0, 200) : Array.isArray(raw)
      ? raw.map((b) => b.type === "text" ? String(b.text).slice(0, 200) : b.type === "toolCall" ? b.name : `[${b.type}]`).join(" ").slice(0, 200) : "";
    records.push({ id: entry.id, parentId: entry.parentId, role, label: `${role} · ${preview.replace(/\s+/g, " ")}`, text: format });
  }
  return records;
}

export function recordsMarkdown(records: readonly CopyRecord[], all = false): string {
  return records.map((record) => `## ${record.role}${all ? ` · ${record.id} (parent: ${record.parentId ?? "root"})` : ""}\n\n${record.text()}`).join("\n\n---\n\n") + "\n";
}
