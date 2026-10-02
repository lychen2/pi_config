import { normalizeToolName, parseMcpToolName } from "./tool-presentations.mjs";

type JsonRecord = Record<string, unknown>;
export type McpResult = { isError?: boolean; content?: unknown; structuredContent?: unknown };
const RESOURCE_TOOLS = new Set(["list_mcp_resources", "list_mcp_resource_templates", "read_mcp_resource"]);
const COLLECTION_KEYS = ["items", "results", "resources", "resourceTemplates", "contents", "papers", "models", "matches", "entries", "files", "issues", "pull_requests", "commits", "releases", "tags", "branches", "collections", "attachments", "objects", "data"];
const record = (value: unknown): JsonRecord | undefined => value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : undefined;
const text = (value: unknown): string => typeof value === "string" ? value : "";
const count = (value: unknown): number | undefined => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
const isMcp = (name: string): boolean => Boolean(parseMcpToolName(name)) || RESOURCE_TOOLS.has(normalizeToolName(name));

// Summaries use allowlisted metadata only. Code, credentials, request bodies and
// resource query strings stay in the original expandable renderer.
function safeText(value: unknown): string {
  return text(value).slice(0, 2048)
    .replace(/\x1B(?:\][^\x07\x1B]*(?:\x07|\x1B\\)|\[[0-?]*[ -/]*[@-~]|[@-Z\\-_])/g, "")
    .replace(/[\x00-\x1f\x7f-\x9f]/g, " ")
    .replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s<>"']+/gi, value => {
      try {
        const url = new URL(value);
        url.username = ""; url.password = ""; url.search = ""; url.hash = "";
        return url.toString();
      } catch { return "[链接]"; }
    })
    .replace(/\bBearer\s+[^\s,;]+/gi, "Bearer [已隐藏]")
    .replace(/\b(api[_-]?key|access[_-]?token|refresh[_-]?token|token|password|secret|authorization)\b\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi, "$1=[已隐藏]")
    .replace(/\s+/g, " ").trim().slice(0, 140);
}
function scalar(value: unknown): string {
  return safeText(typeof value === "number" && Number.isFinite(value) ? String(value) : value);
}
function message(value: unknown): string {
  const line = text(value).trim();
  return line && !/^[\[{]|^(?:import |export |const |let |var |function |class |def |from |```)/.test(line) ? safeText(line) : "";
}

/** Undefined means non-MCP; an empty string means no safe MCP target. */
export function mcpToolTarget(name: string, args: JsonRecord): string | undefined {
  if (!isMcp(name)) return undefined;
  const owner = scalar(args.owner), repo = scalar(args.repo);
  if (repo) {
    const repository = owner ? `${owner}/${repo}` : repo;
    const number = scalar(args.issue_number ?? args.pullNumber);
    const path = scalar(args.path);
    const reference = scalar(args.ref ?? args.sha ?? args.tag);
    return [repository, number ? `#${number}` : path || scalar(args.query), reference ? `@${reference}` : "", scalar(args.method)].filter(Boolean).join(" · ");
  }
  const resource = scalar(args.uri);
  if (resource) return [scalar(args.server), resource].filter(Boolean).join(" · ");
  for (const key of ["object_name", "object_names", "path", "paths", "filepath", "query", "pattern", "doi", "key", "collection", "asset_id", "model_id", "uid", "bl_idname", "request_id", "job_id", "name", "url", "org", "user", "server"]) {
    const value = args[key];
    if (Array.isArray(value)) {
      const values = value.filter((entry): entry is string => typeof entry === "string" && Boolean(entry.trim()));
      if (values.length) return `${values.slice(0, 2).map(safeText).join(" · ")}${values.length > 2 ? ` · 共 ${values.length} 项` : ""}`;
    } else if (scalar(value)) return scalar(value);
  }
  if (typeof args.code === "string" && args.code.trim()) return `${args.code.trim().split(/\r?\n/).length} 行代码`;
  return "";
}

function parseJson(value: unknown): unknown {
  if (typeof value !== "string" || value.length > 131072 || !/^\s*[\[{]/.test(value)) return undefined;
  try { return JSON.parse(value); } catch { return undefined; }
}

function inspectResult(result: McpResult) {
  // Pi preserves the MCP CallToolResult at result.structuredContent. Resource
  // tools instead put their payload there directly; history may have text only.
  const envelope = record(result.structuredContent);
  const blocks: unknown[] = Array.isArray(envelope?.content) ? envelope.content : Array.isArray(result.content) ? result.content : [];
  const texts = blocks.flatMap(block => {
    const item = record(block);
    return item?.type === "text" && typeof item.text === "string" ? [item.text] : [];
  });
  let payload: unknown = envelope?.structuredContent ?? (Array.isArray(envelope?.content) ? undefined : result.structuredContent);
  if (payload === undefined && texts.length === 1) payload = parseJson(texts[0]);
  const frames: JsonRecord[] = [result, ...(envelope ? [envelope] : [])];
  // Zotero/Blender may wrap JSON in { result: "..." }; some servers use data.
  // Keep error flags from every inspected wrapper, with a bounded unwrap depth.
  for (let depth = 0; depth < 4; depth++) {
    const item = record(payload);
    if (!item) break;
    frames.push(item);
    const next = item.result ?? item.data;
    const decoded = parseJson(next);
    if (decoded !== undefined) payload = decoded;
    else if (next && typeof next === "object") payload = next;
    else if (typeof next === "string" && Object.keys(item).length === 1) payload = next;
    else break;
  }
  return { payload, frames, blocks, texts };
}

function failure(info: ReturnType<typeof inspectResult>): string | undefined {
  const failed = info.frames.find(item => item.isError === true);
  if (!failed) return undefined;
  for (const item of [failed, ...info.frames]) {
    const detail = message(record(item.error)?.message ?? item.error) || message(item.message);
    if (detail) return detail;
  }
  if (typeof info.payload === "string" && message(info.payload)) return message(info.payload);
  const lines = info.texts.flatMap(value => value.split(/\r?\n/));
  return message(lines.find(line => /^(?:(?:error|failed|failure)\b|错误|失败)/i.test(line.trim())))
    || (lines.length === 1 ? message(lines[0]) : "") || "MCP 调用失败 · 展开查看";
}

export function mcpToolFailure(name: string, result: McpResult | undefined): string | undefined {
  return isMcp(name) && result ? failure(inspectResult(result)) : undefined;
}

function textSummary(value: string): string {
  const normalized = value.replace(/\r\n?/g, "\n");
  const lines = normalized.length ? normalized.replace(/\n$/, "").split("\n").length : 0;
  return lines ? `返回文本 · ${lines} 行` : "返回空文本";
}

export function mcpResultSummary(name: string, result: McpResult | undefined): string | undefined {
  if (!isMcp(name) || !result) return undefined;
  const info = inspectResult(result);
  const error = failure(info);
  if (error) return error;
  const item = record(info.payload);
  const media = ["image", "audio", "resource", "resource_link"].map(type => {
    const n = info.blocks.filter(block => record(block)?.type === type).length;
    const label = type === "image" ? "张图片" : type === "audio" ? "段音频" : "项资源";
    return n ? `${n} ${label}` : "";
  }).filter(Boolean);
  let summary = "";
  const collection = Array.isArray(info.payload) ? info.payload
    : item && COLLECTION_KEYS.map(key => item[key]).find(Array.isArray);
  if (collection) {
    summary = `返回 ${collection.length} 项`;
    const total = [item, ...info.frames.slice().reverse()].map(value => count(value?.total_count ?? value?.total ?? value?.count)).find(value => value !== undefined);
    if (total !== undefined && total >= collection.length && total !== collection.length) summary += ` · 共 ${total} 项`;
  } else if (item) {
    const total = count(item.total_count ?? item.total ?? item.count);
    const bytes = count(item.bytes ?? (item.encoding === "base64" || item.type === "file" ? item.size : undefined));
    if (total !== undefined) summary = `共 ${total} 项`;
    else if (bytes !== undefined) summary = `返回 ${bytes} B`;
    else if (item.encoding === "base64") summary = "返回文件内容 · Base64";
    else if (typeof item.content === "string") summary = textSummary(item.content);
    else summary = message(item.message) || message(item.status) || message(item.name) || message(item.title);
  } else if (typeof info.payload === "string") summary = textSummary(info.payload);
  if (!summary && info.payload !== undefined) summary = "结构化结果 · 展开查看";
  if (!summary && info.texts.length) {
    const output = info.texts.join("\n");
    summary = /^\s*[\[{]/.test(output) ? "结构化结果 · 展开查看" : textSummary(output);
  }
  return [summary, ...media].filter(Boolean).join(" · ") || "调用完成 · 无返回内容";
}
