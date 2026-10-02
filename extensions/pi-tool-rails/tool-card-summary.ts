import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { normalizeToolName, shortToolName, TOOL_PRESENTATIONS } from "./tool-presentations.mjs";
import { cleanCodemodeText, measuredSavingsLine, summarizeCodemodeOutput, summarizeShellCommand } from "./codemode-tree.ts";
import { mcpToolTarget, mcpResultSummary, mcpToolFailure } from "./mcp-tool-summary.ts";

export type ToolCardExecution = {
  toolName?: string;
  args?: Record<string, unknown>;
  isPartial?: boolean;
  result?: { isError?: boolean; content?: unknown; details?: unknown; structuredContent?: unknown };
};
export type ToolCardTheme = {
  fg(color: "accent" | "dim" | "error" | "muted" | "success" | "toolOutput" | "toolTitle" | "warning", text: string): string;
};
const ANSI = /\x1B(?:\][^\x07\x1B]*(?:\x07|\x1B\\)|\[[0-?]*[ -/]*[@-~]|[@-Z\\-_])/g;
const MUTATIONS = /^(?:edit|write|replace|readSeek_(?:edit|write|rename))$/;
const READS = /^(?:read|readSeek_(?:view|def|digest)|code_outline|obs_recall|ctx_expand)$/;
const SEARCHES = /^(?:grep|find|ls|ffgrep|fffind|readSeek_(?:grep|search|refs)|web_search|tool_search|search_(?:tool|skill)_bm25|ctx_search)$/;
const BACKGROUND = /^(?:teammate|bash_bg|bash_watch|bash_status|observe)$/;
const INTERNAL = /(?:correlationId\s*=|<\/?sol-pi-|<\/?[a-z][^>]*>|Money saved\s*·|teammate-complete notification|completion durability|Do NOT poll|Tool calls made before|Script completed|^\[then_run:)/i;

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function textLines(result: ToolCardExecution["result"]): string[] {
  if (!Array.isArray(result?.content)) return [];
  return result.content.flatMap(block => {
    const value = record(block);
    return value.type === "text" && typeof value.text === "string" ? value.text.replace(/\r/g, "").split("\n") : [];
  });
}
function plain(value: string): string { return value.replace(ANSI, ""); }
function readable(value: unknown, limit = 130): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = cleanCodemodeText(value);
  if (!text || INTERNAL.test(text) || /^[\[{]/.test(text)) return undefined;
  if (/^(?:import|export|const|let|var|function|class|def|from)\b|=>|<<\s*['"]?\w|\b(?:api[_-]?key|password|authorization|access_token)\s*[:=]/i.test(text)) return undefined;
  return truncateToWidth(text, limit, "…");
}
function count(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : undefined;
}
function shortPath(value: unknown): string | undefined {
  const path = readable(value, 300);
  if (!path) return undefined;
  const parts = path.replace(/\\/g, "/").split("/").filter(Boolean);
  return parts.length > 4 ? `…/${parts.slice(-3).join("/")}` : path;
}
function structuredBody(lines: readonly string[]): Record<string, unknown> {
  const text = lines.join("\n").trim();
  if (!text.startsWith("{") || text.length > 128_000) return {};
  try { return record(JSON.parse(text)); } catch { return {}; }
}
function facts(execution: ToolCardExecution): Record<string, unknown> {
  return { ...structuredBody(textLines(execution.result)), ...record(execution.result?.details) };
}
function errorMessage(execution: ToolCardExecution): string | undefined {
  const mcp = mcpToolFailure(execution.toolName ?? "", execution.result);
  if (mcp) return mcp;
  const lines = textLines(execution.result);
  const diagnostic = lines.find(line => /\b(?:error:|failed|failure|denied|not found|exception|fatal|exit(?:ed)?\s+(?:code\s*)?[1-9])\b/i.test(plain(line)) && readable(line));
  if (diagnostic) return readable(diagnostic);
  const data = facts(execution);
  const error = typeof data.error === "string" ? data.error : record(data.error).message;
  return readable(error) ?? readable(data.stderr) ?? lines.map(line => readable(line)).find(Boolean);
}
export function hasToolCardFailure(execution: ToolCardExecution): boolean {
  return Boolean(execution.result?.isError) || Boolean(mcpToolFailure(execution.toolName ?? "", execution.result)) || textLines(execution.result).some(line => /^\[then_run:(?:failed|error)/i.test(line.trim()));
}
export function backgroundToolStatus(execution: ToolCardExecution): "已派发" | "后台运行" | undefined {
  const name = normalizeToolName(execution.toolName ?? "");
  if (!BACKGROUND.test(name) || !execution.result || hasToolCardFailure(execution)) return undefined;
  const lines = textLines(execution.result).map(line => plain(line).trim());
  const text = lines.join("\n");
  const data = facts(execution);
  const status = data.status;
  if (status === "running" || /(?:running in background|\bstill running\b)/i.test(text)) return name === "teammate" ? "已派发" : "后台运行";
  if (lines.some(line => /^Started\s+(?:bg-|task\b)|^Task\s+\S+:.*(?:started|running)|\b(?:task|process)\s+(?:was\s+)?(?:started|launched|dispatched)\b/i.test(line))) return "已派发";
  return undefined;
}
function mutationSummary(lines: readonly string[], details: Record<string, unknown>, width: number, theme: ToolCardTheme): string | undefined {
  const native = lines.find(line => /^\s*\+\d+(?:\s*\/\s*|\s+)-\d+(?:\s|$)/.test(plain(line)));
  if (native) return native;
  const diff = record(details.diff);
  const added = count(diff.additions ?? diff.added ?? details.additions);
  const removed = count(diff.deletions ?? diff.removals ?? diff.removed ?? details.removals);
  if (added === undefined || removed === undefined) return undefined;
  const label = `${theme.fg("success", `+${added}`)} ${theme.fg("error", `-${removed}`)}`;
  const size = Math.min(24, Math.max(8, width - visibleWidth(label) - 3));
  if (width < 20 || width < visibleWidth(label) + size + 3) return label;
  const green = added + removed === 0 ? 0 : Math.round(size * added / (added + removed));
  const bar = added + removed === 0 ? theme.fg("muted", "━".repeat(size))
    : theme.fg("success", "━".repeat(green)) + theme.fg("error", "━".repeat(size - green));
  return `${label} [${bar}]`;
}
function targetFor(name: string, args: Record<string, unknown>): string | undefined {
  const mcp = mcpToolTarget(name, args);
  if (mcp !== undefined) return mcp || undefined;
  if (name === "obs_recall" && typeof args.id === "string") return `#${cleanCodemodeText(args.id)}`;
  if (/^(?:bash|powershell|bash_bg|bash_write)$/.test(name)) return summarizeShellCommand(args.command) ?? readable(args.action);
  const path = shortPath(args.path ?? args.file ?? args.filePath);
  if (path) {
    const start = count(args.offset ?? args.startLine);
    return READS.test(name) && start !== undefined ? `${path} · 从第 ${start} 行` : path;
  }
  return readable(args.query ?? args.pattern ?? args.action ?? args.name ?? args.id);
}
function resultSummary(name: string, execution: ToolCardExecution, rendered: readonly string[]): string | undefined {
  if (!execution.result) return "等待结果";
  const mcp = mcpResultSummary(name, execution.result);
  if (mcp !== undefined) return execution.isPartial !== false ? "执行中" : mcp;
  const data = facts(execution);
  const lines = textLines(execution.result).filter(line => line.trim());
  if (READS.test(name)) {
    const lineCount = count(data.lines ?? data.lineCount ?? record(data.truncation).outputLines);
    if (lineCount !== undefined) return `已读取 ${lineCount} 行`;
    const native = rendered.map(plain).find(line => /^\s*\d+\s*行\s*$/.test(line));
    return native?.trim() ?? "内容已读取 · 展开查看";
  }
  if (SEARCHES.test(name)) {
    const matches = count(data.totalMatches ?? data.totalResults ?? data.matchCount ?? data.count);
    if (matches !== undefined) return `${matches} 项结果`;
    const native = rendered.map(plain).find(line => /^\s*\d+\s*(?:处匹配|项结果|files?|matches?)\s*$/i.test(line));
    return native?.trim() ?? (execution.isPartial !== false ? "正在检索" : "结果已返回 · 展开查看");
  }
  if (/^(?:bash|bash_bg|powershell)$/.test(name)) {
    const exitCode = count(data.exit_code ?? data.exitCode);
    if (exitCode !== undefined) return `退出码 ${exitCode}`;
    const passing = lines.filter(line => /^(?:ℹ\s*)?pass\s+\d+$/i.test(plain(line).trim())).at(-1);
    const failing = lines.filter(line => /^(?:ℹ\s*)?fail\s+\d+$/i.test(plain(line).trim())).at(-1);
    if (passing && failing) return `测试：${passing.match(/\d+/)?.[0]} 通过 · ${failing.match(/\d+/)?.[0]} 失败`;
    if (!lines.length) return execution.isPartial !== false ? "执行中" : "无输出";
    const summary = summarizeCodemodeOutput(lines)[0];
    return readable(summary) ?? "输出已返回 · 展开查看";
  }
  if (MUTATIONS.test(name)) return execution.isPartial !== false ? "变更处理中" : "变更已返回 · 展开查看";
  const raw = summarizeCodemodeOutput(lines)[0];
  if (!(name in TOOL_PRESENTATIONS)) {
    return raw && /^(?:\d+ (?:项结构化结果|份结果已返回)|结构化结果|代码或结构化内容)/.test(raw)
      ? raw : execution.isPartial !== false ? "等待结果" : "结果已返回 · 展开查看";
  }
  return readable(raw) ?? (execution.isPartial !== false ? "等待结果" : "结果已返回 · 展开查看");
}

/** One coherent folded surface; raw execution evidence stays in the expanded renderer. */
export function collapsedToolCard(execution: ToolCardExecution, renderedLines: readonly string[], theme: ToolCardTheme, width: number): string[] {
  if (width <= 0) return [];
  const name = normalizeToolName(execution.toolName ?? "tool");
  const args = execution.args ?? {};
  const purpose = readable(args.reasoning ?? args.description ?? args.summary);
  const body: string[] = [];
  if (purpose) body.push(theme.fg("accent", purpose));
  const finish = (limit = 5) => body.filter(Boolean).slice(0, limit).map(line => truncateToWidth(line, width, "…"));
  const target = targetFor(name, args);
  const details = facts(execution);
  const isFailure = hasToolCardFailure(execution);
  const failedThenRun = textLines(execution.result).some(line => /^\[then_run:(?:failed|error)/i.test(line.trim()));

  if (name === "teammate" && Array.isArray(args.tasks)) {
    const tasks = args.tasks.map(record);
    const budget = purpose ? 2 : 3;
    for (const task of tasks.slice(0, budget)) {
      const label = readable(task.name);
      const goal = readable(task.goal);
      body.push(theme.fg("toolTitle", [label, goal].filter(Boolean).join(" · ") || "委派任务"));
    }
    if (tasks.length > budget) body.push(theme.fg("muted", `另有 ${tasks.length - budget} 项任务`));
    if (isFailure) body.splice(purpose ? 1 : 0, 0, theme.fg("error", `委派失败${errorMessage(execution) ? ` · ${errorMessage(execution)}` : ""}`));
    return finish();
  }
  if (target && target !== purpose) body.push(theme.fg("toolTitle", target));
  if (!body.length) body.push(theme.fg("toolTitle", shortToolName(name)));
  if (name === "obs_recall") {
    const offset = count(details.offset ?? args.offset) ?? 0;
    const next = count(details.nextOffset ?? details.next_offset);
    body.push(theme.fg("muted", `偏移 ${offset}${details.eof === true ? " · 已到末尾" : next !== undefined ? ` · 下次 ${next}` : ""}`));
  }
  const liveProgress = execution.isPartial !== false
    ? renderedLines.find(line => /^\s*◐/.test(plain(line)) || /约剩/.test(plain(line))) : undefined;
  const mutation = MUTATIONS.test(name) ? mutationSummary(renderedLines, details, width, theme) : undefined;
  if (mutation) body.push(mutation);
  if (isFailure) {
    body.push(theme.fg("error", `${failedThenRun ? "附加命令失败" : "执行失败"}${errorMessage(execution) ? ` · ${errorMessage(execution)}` : " · 展开查看"}`));
  } else if (liveProgress) {
    body.push(liveProgress);
  } else if (!mutation) {
    const background = backgroundToolStatus(execution);
    const summary = background ?? resultSummary(name, execution, renderedLines);
    if (summary) body.push(theme.fg(execution.isPartial !== false ? "warning" : "muted", summary));
  }
  const savings = textLines(execution.result).map(measuredSavingsLine).find((line): line is string => Boolean(line));
  if (savings && !body.some(line => plain(line).includes(savings))) body.push(theme.fg("muted", savings));
  return finish();
}
