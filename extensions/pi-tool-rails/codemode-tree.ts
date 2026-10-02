import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { shortToolName } from "./tool-presentations.mjs";
import { mcpToolTarget } from "./mcp-tool-summary.ts";

export type CodemodeCall = Record<string, unknown>;
export type CodemodeTreeTheme = {
  fg(color: "accent" | "dim" | "error" | "muted" | "success" | "toolOutput" | "toolTitle" | "warning", text: string): string;
};

const ANSI = /\x1B(?:\][^\x07\x1B]*(?:\x07|\x1B\\)|\[[0-?]*[ -/]*[@-~]|[@-Z\\-_])/g;
const OMITTED_ARGUMENT_KEYS = /^(?:content|code|script|token|api.?key|password|authorization|secret)$/i;
const COLLAPSED_CALLS = 5;
const EXPANDED_CALLS = 60;

export function cleanCodemodeText(value: string): string {
  return value.replace(ANSI, "").replace(/[\x00-\x1f\x7f-\x9f]/g, " ").replace(/\s+/g, " ").trim();
}

/** Keep measured report lines, never a JSON/source line merely containing one. */
export function measuredSavingsLine(value: string): string | undefined {
  const line = cleanCodemodeText(value).replace(/^[│┃]\s*/, "").replace(/\s*[│┃]$/, "");
  return /^(?:Money saved\s*·\s*)?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?\s+(?:context\s+tokens?|tokens?|[KMGT]?i?B|bytes?)\s+(?:removed|saved)(?:\s+from\s+future\s+prompts)?\.?$/i.test(line) ? line : undefined;
}

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function argumentRecord(args: string): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(args);
    if (record(parsed)) return parsed;
  } catch {
    // Pi truncates compact arguments mid-object. Extract only complete display fields.
    const fields: Record<string, unknown> = {};
    for (const key of ["path", "command", "pattern", "query", "reasoning", "description", "summary", "action", "id", "goal", "owner", "repo", "ref", "sha", "tag", "method", "object_name", "filepath", "doi", "key", "collection", "asset_id", "model_id", "uid", "bl_idname", "request_id", "job_id", "name", "url", "org", "user", "server", "uri"]) {
      const match = args.match(new RegExp(`"${key}"\\s*:\\s*("(?:[^"\\\\]|\\\\.)*")`));
      if (match) {
        try { fields[key] = JSON.parse(match[1]!); } catch { /* Incomplete string. */ }
      }
    }
    for (const key of ["issue_number", "pullNumber"]) {
      const match = args.match(new RegExp(`"${key}"\\s*:\\s*(\\d+)(?=\\s*[,}])`));
      if (match && Number.isSafeInteger(Number(match[1]))) fields[key] = Number(match[1]);
    }
    if (Object.keys(fields).length) return fields;
  }
  return undefined;
}

export function summarizeShellCommand(command: unknown): string | undefined {
  if (typeof command !== "string" || !command.trim()) return undefined;
  const text = command.trim();
  if (/\b(?:api[_-]?key|password|access_token)\s*[:=]|authorization\s*:/i.test(text)) return "执行命令";
  if (text.length <= 90 && !/[\r\n;]|&&|\|\||<<|`|\$\(/.test(text) && !/(?:^|\s)(?:-[ce]|--eval)(?:\s|=)/.test(text)) return cleanCodemodeText(text);
  const tokens = [...text.matchAll(/(?:^|\n|[;&|])\s*(?:[A-Z_]\w*=\S+\s+)*([a-z][\w.+-]*)/g)].map(match => match[1]!);
  const known = [...new Set(tokens.filter(token => /^(?:npm|npx|pnpm|yarn|bun|node|python\d?|uv|pytest|git|cargo|go|make|bash|sh|zsh|powershell|pwsh|rg|grep|find|ls|cat|head|tail|test|printf|echo)$/.test(token)))];
  return known.length ? `批量脚本 · ${known.slice(0, 4).join(" / ")}${known.length > 4 ? " …" : ""}` : "运行多行脚本";
}

function targetPath(value: string): string {
  const path = cleanCodemodeText(value).replace(/\\/g, "/");
  const parts = path.split("/").filter(Boolean);
  return parts.length > 3 ? `…/${parts.slice(-2).join("/")}` : path;
}

function planSummary(value: unknown): string | undefined {
  if (!record(value) || !Array.isArray(value.steps)) return undefined;
  const steps = value.steps.filter(record);
  if (!steps.length) return "计划已更新";
  const done = steps.filter(step => step.status === "completed").length;
  const current = steps.find(step => step.status === "in_progress");
  const goal = typeof current?.goal === "string" ? cleanCodemodeText(current.goal) : undefined;
  return `${done}/${steps.length} 步完成${goal ? ` · ${goal}` : ""}`;
}

/** A safe, useful target; large payloads and credentials never become tree labels. */
export function codemodeCallTarget(call: CodemodeCall): string {
  if (typeof call.args !== "string") return "";
  const args = call.args;
  const parsed = argumentRecord(args);
  const mcp = typeof call.name === "string" ? mcpToolTarget(call.name, parsed ?? {}) : undefined;
  if (mcp !== undefined) return mcp;
  if (!parsed) return /^[\s]*[\[{]/.test(args) ? "" : cleanCodemodeText(args);
  if (typeof parsed.command === "string") return summarizeShellCommand(parsed.command) ?? "";
  if (call.name === "teammate" && Array.isArray(parsed.tasks)) {
    const tasks = parsed.tasks.filter(record);
    const names = tasks.slice(0, 2).map(task => typeof task.name === "string" ? cleanCodemodeText(task.name) : "任务");
    return `${names.join("、")}${tasks.length > 2 ? ` 等 ${tasks.length} 项任务` : ""}`;
  }
  if (call.name === "update_plan") return planSummary(parsed)
    ?? cleanCodemodeText(String(parsed.goal ?? parsed.summary ?? "更新计划"));
  if (typeof parsed.path === "string") {
    const path = targetPath(parsed.path);
    const pattern = typeof parsed.pattern === "string" ? cleanCodemodeText(parsed.pattern) : undefined;
    return pattern ? `${path} · ${pattern}` : path;
  }
  for (const key of ["command", "query", "pattern", "reasoning", "description", "action", "id"]) {
    if (typeof parsed[key] === "string") return cleanCodemodeText(parsed[key]);
  }
  return "";
}

function callLabel(call: CodemodeCall, expanded: boolean): string {
  const name = typeof call.name === "string" ? cleanCodemodeText(call.name) : "tool";
  const label = shortToolName(name);
  return expanded && label !== name ? `${label} · ${name}` : label;
}

function milliseconds(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return "";
  return value < 1000 ? `${Math.round(value)}ms` : `${(value / 1000).toFixed(1)}s`;
}

function safeArguments(call: CodemodeCall): string {
  if (typeof call.args !== "string") return "";
  const parsed = argumentRecord(call.args);
  if (!parsed) return /^[\s]*[\[{]/.test(call.args) ? "参数已截断" : cleanCodemodeText(call.args);
  const safe = Object.fromEntries(Object.entries(parsed).map(([key, value]) => [
    key, OMITTED_ARGUMENT_KEYS.test(key) ? "…" : value,
  ]));
  return cleanCodemodeText(JSON.stringify(safe));
}

/** The native records are siblings under one script; preserve their invocation order. */
export function renderCodemodeTree(
  calls: readonly CodemodeCall[], expanded: boolean, width: number, theme: CodemodeTreeTheme,
): string[] {
  const limit = expanded ? EXPANDED_CALLS : COLLAPSED_CALLS;
  const indexes = calls.map((_, index) => index);
  const selected = calls.length <= limit ? indexes : [
    ...indexes.filter(i => calls[i]!.status === "error"),
    ...indexes.filter(i => calls[i]!.status === "running"),
    ...indexes.filter(i => calls[i]!.status === "cancelled"),
    ...indexes.filter(i => !["error", "running", "cancelled"].includes(String(calls[i]!.status))),
  ].slice(0, limit).sort((a, b) => a - b);
  const selectedSet = new Set(selected);
  const omitted = calls.filter((_, i) => !selectedSet.has(i));
  const lines: string[] = [];
  for (let position = 0; position < selected.length; position++) {
    const call = calls[selected[position]!]!;
    const last = position === selected.length - 1 && omitted.length === 0;
    const branch = last ? "└─" : "├─";
    const status = call.status;
    const icon = status === "ok" ? "✓" : status === "error" ? "×" : status === "cancelled" ? "⊘" : "◐";
    const color = status === "ok" ? "success" : status === "error" ? "error" : status === "cancelled" ? "muted" : "warning";
    const prefix = `${theme.fg("muted", branch)} ${theme.fg(color, icon)} ${theme.fg("toolTitle", callLabel(call, expanded))}`;
    const duration = milliseconds(call.durationMs);
    const cost = typeof call.cost === "number" && Number.isFinite(call.cost) && call.cost >= 0
      ? `$${call.cost >= 0.01 ? call.cost.toFixed(2) : call.cost.toPrecision(2)}` : "";
    const tail = [duration, cost].filter(Boolean).join(" · ");
    const target = codemodeCallTarget(call);
    const error = typeof call.error === "string" ? cleanCodemodeText(call.error) : "";
    const text = !expanded && error ? [error, target].filter(Boolean).join(" · ") : target;
    const tailFits = tail && width - visibleWidth(prefix) - visibleWidth(tail) >= 9;
    const available = Math.max(0, width - visibleWidth(prefix) - 2 - (tailFits ? visibleWidth(tail) + 2 : 0));
    const middle = text && available > 1 ? `  ${theme.fg(error && !expanded ? "error" : "muted", truncateToWidth(text, available, "…"))}` : "";
    const row = `${prefix}${middle}`;
    lines.push(tailFits
      ? `${row}${" ".repeat(Math.max(2, width - visibleWidth(row) - visibleWidth(tail)))}${theme.fg("dim", tail)}`
      : truncateToWidth(row, width, "…"));
    if (expanded) {
      const continuation = last ? "   " : "│  ";
      if (tail && !tailFits) lines.push(`${theme.fg("muted", continuation)}  ${theme.fg("dim", tail)}`);
      if (error) lines.push(`${theme.fg("muted", continuation)}  ${theme.fg("error", `↳ ${error}`)}`);
      const args = safeArguments(call);
      if (args && args !== target) lines.push(`${theme.fg("muted", continuation)}  ${theme.fg("dim", args)}`);
    }
  }
  if (omitted.length) {
    const counts = new Map<string, number>();
    for (const call of omitted) {
      const name = callLabel(call, false);
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    const names = [...counts].slice(0, 3).map(([name, count]) => `${name}×${count}`).join("、");
    lines.push(theme.fg("muted", `└─ … 另外 ${omitted.length} 次 · ${names}${counts.size > 3 ? "等" : ""} · 展开`));
  }
  return lines.map(line => truncateToWidth(line, width, "…"));
}

function structuredSummary(value: unknown): string {
  const plan = planSummary(value);
  if (plan) return `计划 · ${plan}`;
  if (Array.isArray(value)) return `${value.length} 项结构化结果 · 展开查看`;
  if (record(value)) {
    if (value.status === "rejected") return "调用返回错误 · 展开查看";
    if (value.status === "fulfilled") return "调用结果已返回 · 展开查看";
    return `${Object.keys(value).length} 项结构化结果 · 展开查看`;
  }
  return cleanCodemodeText(String(value));
}

/** Collapse transport JSON and SoL state markers into reader-facing results. */
export function summarizeCodemodeOutput(lines: readonly string[]): string[] {
  const nonempty = lines.filter(line => line.trim());
  if (!nonempty.length) return [];
  const first = nonempty[0]!.trim();
  if (/^(?:Script error:|Error:)$/i.test(first) && nonempty[1]) return [cleanCodemodeText(nonempty[1])];
  if (/^(?:[A-Za-z]*Error|Error|Failed|Fatal):/i.test(first)) return [cleanCodemodeText(first)];
  if (/^<sol-pi-plan\b/.test(first)) {
    const match = nonempty.join("\n").match(/<sol-pi-plan\b[^>]*>([\s\S]*?)<\/sol-pi-plan>/);
    if (match) {
      try { return [structuredSummary(JSON.parse(match[1]!))]; } catch { /* A partial streaming frame. */ }
    }
    return ["计划已更新 · 展开查看"];
  }
  if (/^[\[{]/.test(first)) {
    try { return [structuredSummary(JSON.parse(nonempty.join("\n")))]; } catch { /* JSONL or partial JSON. */ }
    const rows: unknown[] = [];
    for (const line of nonempty) {
      try { rows.push(JSON.parse(line)); } catch { /* Plain output mixed with records. */ }
    }
    if (rows.length > 1) {
      const rejected = rows.filter(row => record(row) && row.status === "rejected").length;
      return [`${rows.length} 份结果已返回${rejected ? ` · ${rejected} 项失败` : ""} · 展开查看`];
    }
    if (rows.length === 1) return [structuredSummary(rows[0])];
    if (/^[\[{]\s*(?:["{\[]|$)/.test(first)) return ["结构化结果 · 展开查看"];
  }
  if (/^(?:(?:import|export|const|let|var|function|class|def|from|async|await|return|for|if|while|struct|interface|package|using|public|private|func)\b|#(?:include|define|!\/)|\/\/|\/\*|<[/!?A-Za-z]|[{}];?$|\s*\w+\s*=[^=])/.test(first) || /\w+\s+\{\s*"|"[^"\n]+"\s*:/.test(first)) {
    return ["代码或结构化内容已返回 · 展开查看"];
  }
  return [cleanCodemodeText(first)];
}
