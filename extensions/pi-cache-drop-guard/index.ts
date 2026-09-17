/**
 * pi-cache-drop-guard — 提示缓存掉链看门狗
 *
 * 监控每个 assistant 回合的提示缓存命中情况。当连续 N 次请求把上一轮的大部分提示
 * 重新计费（而不是从上游缓存读回）时——也就是俗称的「掉缓存」——弹一个窗，问：
 *
 *   1. 继续任务（本次忽略，稍后仍会提醒）
 *   2. 查看状态（缓存与上游诊断）
 *   3. 继续，并保留后续掉缓存提醒（我已换上游）  → 持久化 mode=ask
 *   4. 不再提醒（不在乎成本，尽快完成）          → 仅本次会话静默（不跨会话继承）
 *
 * 「不再提醒」只属于做出选择的那个会话：新会话、resume、fork、冷启动都会回到默认的
 * ask；只有同一次会话内的 /reload 会继承关闭状态（扩展被重新实例化）。
 *
 * 判定口径对齐 pi 内建的 cache-stats：missedTokens = min(上一轮 promptTokens, 本轮 promptTokens)
 * - cacheRead，忽略 1024 tokens 以下的噪声，compaction / branch summary 之后重置基线。
 * 基线每轮都从已落盘的会话条目现算（与 pi 的 detectCacheMiss 同一做法），所以压缩以后
 * 第一次重新计费不会被算成掉缓存，实时统计与重启扫描也不会互相矛盾。
 * 在此之上再加一层「明显」门槛（默认 4096 tokens），只有明显的掉缓存才计入连续计数。
 */
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  getAgentDir,
  type ExtensionAPI,
  type ExtensionCommandContext,
  type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { Box, Text } from "@earendil-works/pi-tui";

export const REPORT_ENTRY = "cache-drop-guard-report";
const STATUS_KEY = "cache-drop-guard";
const STATE_FILE_NAME = "cache-drop-guard.json";

/** 与 pi 内建 cache-stats 一致的噪声地板。 */
export const NOISE_FLOOR_TOKENS = 1024;
/** 隐式提示缓存的常见 TTL，用来把「空闲太久」识别为自然过期。 */
export const CACHE_TTL_MS = 5 * 60 * 1000;

const DEFAULT_STREAK = 2;
const DEFAULT_MIN_MISSED_TOKENS = 4096;
const DEFAULT_TIMEOUT_MS = 60_000;
/** 报告里保留的最近回合数。 */
const RECENT_LIMIT = 20;

/* ------------------------------------------------------------------ *
 * 配置
 * ------------------------------------------------------------------ */

export interface GuardSettings {
  /** 总开关，PI_CACHE_DROP_GUARD_DISABLE=1 时整个扩展不注册。 */
  enabled: boolean;
  /** 连续多少次「明显掉缓存」触发弹窗。 */
  streak: number;
  /** 单次未命中多少 tokens 才算「明显」。 */
  minMissedTokens: number;
  /** 弹窗自动继续的毫秒数，0 表示一直等。 */
  timeoutMs: number;
  /** 可选的上游体检命令，在「查看状态」里执行。 */
  statusCommand?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function isTruthy(value: string | undefined): boolean {
  if (value === undefined) return false;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

export function readPositiveInt(raw: string | undefined, fallback: number, min = 1): number {
  if (raw === undefined) return fallback;
  const parsed = Number.parseInt(raw.trim(), 10);
  if (!Number.isFinite(parsed) || parsed < min) return fallback;
  return parsed;
}

/** 允许 0（=一直等），非法值回落默认。 */
export function readNonNegativeInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined) return fallback;
  const parsed = Number.parseInt(raw.trim(), 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
}

export function resolveGuardSettings(
  env: Record<string, string | undefined> = process.env,
): GuardSettings {
  const statusCommand = env.PI_CACHE_DROP_GUARD_STATUS_CMD?.trim();
  return {
    enabled: !isTruthy(env.PI_CACHE_DROP_GUARD_DISABLE),
    streak: readPositiveInt(env.PI_CACHE_DROP_GUARD_STREAK, DEFAULT_STREAK, 2),
    minMissedTokens: readPositiveInt(
      env.PI_CACHE_DROP_GUARD_MIN_MISSED_TOKENS,
      DEFAULT_MIN_MISSED_TOKENS,
      NOISE_FLOOR_TOKENS,
    ),
    timeoutMs: readNonNegativeInt(env.PI_CACHE_DROP_GUARD_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
    statusCommand: statusCommand ? statusCommand : undefined,
  };
}

/* ------------------------------------------------------------------ *
 * 掉缓存判定（纯函数，可单测）
 * ------------------------------------------------------------------ */

export interface CacheRequestUsage {
  provider: string;
  model: string;
  timestamp: number;
  input: number;
  cacheRead: number;
  cacheWrite: number;
  costInput: number;
  costCacheRead: number;
  costCacheWrite: number;
}

export interface CacheBaseline {
  promptTokens: number;
  modelKey: string;
  timestamp: number;
  reportedCache: boolean;
}

export interface CacheMissAssessment {
  promptTokens: number;
  cacheRead: number;
  cacheWrite: number;
  input: number;
  /** 本轮相对「可复用前缀」的命中率，1 表示完全命中。 */
  hitRate: number;
  missedTokens: number;
  missedCost: number;
  idleMs: number;
  modelChanged: boolean;
  /** 本轮是否本来就该命中缓存。 */
  expectedCache: boolean;
  /** 超过噪声地板、算作一次真实未命中。 */
  counted: boolean;
  /** 未命中量够大，算作「明显掉缓存」。 */
  obvious: boolean;
  cause: string;
  timestamp: number;
}

export interface CacheAssessOptions {
  minMissedTokens: number;
  /** 模型定价里 cacheRead 的单价（每 token），用于估算多花的钱。 */
  fallbackCacheReadPerToken?: number;
  /**
   * 本轮是否「本来就该命中缓存」。默认取上一轮的 reportedCache。
   * 会话内只要某个 provider/model 上报过一次缓存，后续即使它一路回报 0,
   * 也仍然算「该命中」——否则持续掉缓存反而会被静默忽略。
   */
  expectCache?: boolean;
}

export function toRequestUsage(message: unknown): CacheRequestUsage | undefined {
  if (!isRecord(message) || message.role !== "assistant") return undefined;
  const usage = message.usage;
  if (!isRecord(usage)) return undefined;
  const input = num(usage.input);
  const cacheRead = num(usage.cacheRead);
  const cacheWrite = num(usage.cacheWrite);
  if (input + cacheRead + cacheWrite <= 0) return undefined;
  const cost = isRecord(usage.cost) ? usage.cost : {};
  return {
    provider: str(message.provider),
    model: str(message.model),
    timestamp: num(message.timestamp),
    input,
    cacheRead,
    cacheWrite,
    costInput: num(cost.input),
    costCacheRead: num(cost.cacheRead),
    costCacheWrite: num(cost.cacheWrite),
  };
}

export function baselineFrom(usage: CacheRequestUsage): CacheBaseline | undefined {
  const promptTokens = usage.input + usage.cacheRead + usage.cacheWrite;
  if (promptTokens <= 0) return undefined;
  return {
    promptTokens,
    modelKey: `${usage.provider}/${usage.model}`,
    timestamp: usage.timestamp,
    reportedCache: usage.cacheRead > 0 || usage.cacheWrite > 0,
  };
}

export function describeMissingCache(input: {
  cacheRead: number;
  cacheWrite: number;
  idleMs: number;
  modelChanged: boolean;
}): string {
  if (input.modelChanged) return "上游 / 模型刚切换过，切换本身会让整段提示重新计费";
  if (input.idleMs > CACHE_TTL_MS) {
    return `空闲 ${formatDuration(input.idleMs)}，超过 CACHE_TTL_MS（5 分钟）缓存自然过期`;
  }
  if (input.cacheRead === 0 && input.cacheWrite === 0) {
    return "上游完全没回报缓存字段：可能没开缓存透传，或该 provider 不支持隐式缓存";
  }
  if (input.cacheRead === 0 && input.cacheWrite > 0) {
    return "上游在重新写缓存却没有命中：上游缓存被清空或换了后端";
  }
  return "命中率骤降但仍有部分命中：上游缓存被部分驱逐，或被注入的前缀变化打断";
}

/**
 * 对齐 pi 内建 detectCacheMiss，并额外给出 hitRate / counted / obvious / cause。
 * 没有基线（会话首轮、compaction 之后）或没上报缓存能力时返回 undefined。
 */
export function assessCacheMiss(
  prev: CacheBaseline | undefined,
  usage: CacheRequestUsage,
  options: CacheAssessOptions,
): CacheMissAssessment | undefined {
  if (!prev) return undefined;
  const promptTokens = usage.input + usage.cacheRead + usage.cacheWrite;
  if (promptTokens <= 0) return undefined;
  const reportedCache = usage.cacheRead > 0 || usage.cacheWrite > 0 || prev.reportedCache;
  const expectedCache = options.expectCache ?? reportedCache;
  if (usage.cacheRead + usage.cacheWrite === 0 && !expectedCache) return undefined;

  const modelKey = `${usage.provider}/${usage.model}`;
  const modelChanged = prev.modelKey !== modelKey;
  const reusableTokens = Math.min(prev.promptTokens, promptTokens);
  const missedTokens = Math.max(0, reusableTokens - usage.cacheRead);
  if (missedTokens <= NOISE_FLOOR_TOKENS) return undefined;

  const paidTokens = usage.input + usage.cacheWrite;
  const paidPerToken =
    paidTokens > 0 ? (usage.costInput + usage.costCacheWrite) / paidTokens : 0;
  const readPerToken =
    usage.cacheRead > 0
      ? usage.costCacheRead / usage.cacheRead
      : (options.fallbackCacheReadPerToken ?? 0);
  const missedCost = missedTokens * Math.max(0, paidPerToken - readPerToken);

  const idleMs =
    prev.timestamp > 0 && usage.timestamp > prev.timestamp ? usage.timestamp - prev.timestamp : 0;
  const hitRate = reusableTokens > 0 ? Math.max(0, Math.min(1, usage.cacheRead / reusableTokens)) : 1;

  return {
    promptTokens,
    cacheRead: usage.cacheRead,
    cacheWrite: usage.cacheWrite,
    input: usage.input,
    hitRate,
    missedTokens,
    missedCost,
    idleMs,
    modelChanged,
    expectedCache,
    counted: true,
    obvious: missedTokens >= options.minMissedTokens,
    cause: describeMissingCache({
      cacheRead: usage.cacheRead,
      cacheWrite: usage.cacheWrite,
      idleMs,
      modelChanged,
    }),
    timestamp: usage.timestamp,
  };
}

/** 连续计数：未命中不明显（或本轮正常命中）就清零。 */
export function advanceStreak(
  streak: number,
  assessment: CacheMissAssessment | undefined,
): number {
  if (!assessment) return 0;
  return assessment.obvious ? streak + 1 : 0;
}

/* ------------------------------------------------------------------ *
 * 会话历史扫描
 * ------------------------------------------------------------------ */

export interface CacheTurnRecord {
  provider: string;
  model: string;
  timestamp: number;
  promptTokens: number;
  input: number;
  cacheRead: number;
  cacheWrite: number;
  hitRate: number;
  missedTokens: number;
  missedCost: number;
  idleMs: number;
  modelChanged: boolean;
  counted: boolean;
  obvious: boolean;
  cause: string;
}

export interface CacheTotals {
  missedTokens: number;
  missedCost: number;
  /** 超过噪声地板的未命中次数。 */
  missCount: number;
  /** 其中的「明显掉缓存」次数。 */
  notableCount: number;
}

export interface CacheHistory {
  records: CacheTurnRecord[];
  totals: CacheTotals;
  /** 最后一条 assistant 回合的基线，用于给当前回合做对比。 */
  lastBaseline?: CacheBaseline;
  /** 会话里曾经上报过缓存的 provider/model（key 为 provider/model）。 */
  reportedModels: string[];
}

export interface CollectOptions extends CacheAssessOptions {
  fallbackCacheReadPerTokenFor?: (provider: string, model: string) => number;
}

/**
 * 按时间顺序扫描会话条目。compaction / branch_summary 会打断基线：
 * 它们改变了上下文前缀，之后第一次请求的重新计费是正常行为。
 */
export function collectCacheHistory(
  entries: readonly unknown[],
  options: CollectOptions,
): CacheHistory {
  const records: CacheTurnRecord[] = [];
  const totals: CacheTotals = emptyTotals();
  const reportedModels = new Set<string>();
  let prev: CacheBaseline | undefined;

  for (const entry of entries) {
    if (!isRecord(entry)) continue;
    if (entry.type === "compaction" || entry.type === "branch_summary") {
      prev = undefined;
      continue;
    }
    if (entry.type !== "message") continue;
    const usage = toRequestUsage(entry.message);
    if (!usage) continue;

    const modelKey = `${usage.provider}/${usage.model}`;
    const fallback = options.fallbackCacheReadPerTokenFor?.(usage.provider, usage.model);
    const assessment = assessCacheMiss(prev, usage, {
      minMissedTokens: options.minMissedTokens,
      fallbackCacheReadPerToken: fallback ?? options.fallbackCacheReadPerToken ?? 0,
      expectCache: reportedModels.has(modelKey) || usage.cacheRead > 0 || usage.cacheWrite > 0,
    });
    if (usage.cacheRead > 0 || usage.cacheWrite > 0) reportedModels.add(modelKey);

    if (assessment) {
      totals.missedTokens += assessment.missedTokens;
      totals.missedCost += assessment.missedCost;
      totals.missCount += 1;
      if (assessment.obvious) totals.notableCount += 1;
    }

    records.push(cacheTurnRecord(prev, usage, assessment));
    prev = baselineFrom(usage) ?? prev;
  }

  return { records, totals, lastBaseline: prev, reportedModels: [...reportedModels] };
}

/** 把一轮请求整理成报告用的记录（未命中为 0 时也保留命中率）。 */
export function cacheTurnRecord(
  prev: CacheBaseline | undefined,
  usage: CacheRequestUsage,
  assessment: CacheMissAssessment | undefined,
): CacheTurnRecord {
  const promptTokens = usage.input + usage.cacheRead + usage.cacheWrite;
  const reusable = prev ? Math.min(prev.promptTokens, promptTokens) : promptTokens;
  return {
    provider: usage.provider,
    model: usage.model,
    timestamp: usage.timestamp,
    promptTokens,
    input: usage.input,
    cacheRead: usage.cacheRead,
    cacheWrite: usage.cacheWrite,
    hitRate: assessment
      ? assessment.hitRate
      : reusable > 0
        ? Math.max(0, Math.min(1, usage.cacheRead / reusable))
        : 1,
    missedTokens: assessment?.missedTokens ?? 0,
    missedCost: assessment?.missedCost ?? 0,
    idleMs: assessment?.idleMs ?? 0,
    modelChanged: assessment?.modelChanged ?? false,
    counted: assessment?.counted ?? false,
    obvious: assessment?.obvious ?? false,
    cause: assessment?.cause ?? "",
  };
}

/** 累加一次未命中到统计里。 */
export function accumulateTotals(totals: CacheTotals, assessment: CacheMissAssessment): CacheTotals {
  return {
    missedTokens: totals.missedTokens + assessment.missedTokens,
    missedCost: totals.missedCost + assessment.missedCost,
    missCount: totals.missCount + 1,
    notableCount: totals.notableCount + (assessment.obvious ? 1 : 0),
  };
}

export function emptyTotals(): CacheTotals {
  return { missedTokens: 0, missedCost: 0, missCount: 0, notableCount: 0 };
}

/** 尾部连续明显掉缓存的长度（报告用）。 */
export function trailingObviousStreak(records: readonly CacheTurnRecord[]): number {
  let streak = 0;
  for (let index = records.length - 1; index >= 0; index -= 1) {
    const record = records[index];
    if (!record.counted) break;
    if (!record.obvious) break;
    streak += 1;
  }
  return streak;
}

/* ------------------------------------------------------------------ *
 * 格式化
 * ------------------------------------------------------------------ */

export function formatTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return `${Math.round(value)}`;
}

export function formatUsd(value: number): string {
  if (value <= 0) return "$0";
  if (value < 0.01) return `$${value.toFixed(4)}`;
  return `$${value.toFixed(2)}`;
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return "0s";
  const totalSeconds = Math.round(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h${minutes}m`;
  if (minutes > 0) return `${minutes}m${seconds}s`;
  return `${seconds}s`;
}

export function formatPercent(ratio: number): string {
  return `${Math.round(Math.max(0, Math.min(1, ratio)) * 100)}%`;
}

/* ------------------------------------------------------------------ *
 * 持久化状态
 * ------------------------------------------------------------------ */

export type GuardMode = "ask" | "never";

export interface GuardState {
  mode: GuardMode;
  updatedAt?: string;
  /** 用户确认「我已换上游，继续提醒」的时间。 */
  acknowledgedAt?: string;
  /** 做出该选择的 pi 会话 id。开关只对做出选择的会话有效。 */
  sessionId?: string;
}

/** 一次会话开始时的模式判定结果。 */
export interface SessionModeDecision {
  /** 本次会话生效的模式。 */
  mode: GuardMode;
  /** true 表示这是同一次会话内的 /reload 继承下来的关闭状态。 */
  inherited: boolean;
  /** true 表示上一个会话关掉了提醒，本次已回到默认的 ask。 */
  rearmed: boolean;
}

/**
 * 决定一次 session_start 之后看门狗用哪个模式。
 *
 * 「不再提醒」只属于做出选择的那个会话：新会话、resume、fork、冷启动一律回到默认的
 * ask（resume 也要重新开起来）；只有同一次会话内的 /reload 会继承关闭状态，因为那会
 * 重新实例化扩展、丢掉内存里的开关。
 */
export function decideSessionMode(input: {
  previous?: GuardState;
  reason?: string;
  sessionId?: string;
}): SessionModeDecision {
  const previous = input.previous;
  if (
    previous?.mode === "never" &&
    input.reason === "reload" &&
    previous.sessionId !== undefined &&
    previous.sessionId === input.sessionId
  ) {
    return { mode: "never", inherited: true, rearmed: false };
  }
  return { mode: "ask", inherited: false, rearmed: previous?.mode === "never" };
}

export function guardStatePath(): string {
  return join(getAgentDir(), STATE_FILE_NAME);
}

export async function loadGuardState(file = guardStatePath()): Promise<GuardState> {
  try {
    const parsed: unknown = JSON.parse(await readFile(file, "utf8"));
    if (isRecord(parsed) && parsed.mode === "never") {
      return {
        mode: "never",
        updatedAt: str(parsed.updatedAt) || undefined,
        sessionId: str(parsed.sessionId) || undefined,
      };
    }
    if (isRecord(parsed) && parsed.mode === "ask") {
      return {
        mode: "ask",
        updatedAt: str(parsed.updatedAt) || undefined,
        acknowledgedAt: str(parsed.acknowledgedAt) || undefined,
        sessionId: str(parsed.sessionId) || undefined,
      };
    }
  } catch {
    // 文件不存在或损坏：回到默认的 ask。
  }
  return { mode: "ask" };
}

export async function saveGuardState(
  state: GuardState,
  file = guardStatePath(),
): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  const temporary = `${file}.tmp`;
  await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  await rename(temporary, file);
}

/* ------------------------------------------------------------------ *
 * 状态报告
 * ------------------------------------------------------------------ */

export interface ReportInput {
  mode: GuardMode;
  modelLabel: string;
  settings: GuardSettings;
  totals: CacheTotals;
  records: readonly CacheTurnRecord[];
  streak: number;
  samples?: number;
  probes?: readonly string[];
}

/** 报告所需的会话数据。 */
export interface ReportView {
  records: readonly CacheTurnRecord[];
  totals: CacheTotals;
}

export function buildReportLines(input: ReportInput): string[] {
  const lines: string[] = [];
  lines.push(
    `看门狗: ${input.mode === "never" ? "本次会话已关闭（不再提醒）" : `提醒开启（连续 ${input.settings.streak} 次明显掉缓存弹窗）`}`,
  );
  lines.push("作用域: 每个会话独立；新会话与 resume 都从默认提醒开始");
  lines.push(`模型: ${input.modelLabel || "未知"}`);

  const samples = input.records.slice(-(input.samples ?? 8));
  if (samples.length > 0) {
    lines.push(
      `最近缓存命中（新→旧）: ${samples
        .slice()
        .reverse()
        .map((record) => formatPercent(record.hitRate))
        .join("  ")}`,
    );
  }

  lines.push(`当前连续明显掉缓存: ${input.streak} 次（阈值 ${input.settings.streak}）`);

  if (input.totals.missCount === 0) {
    lines.push("本会话未发现异常掉缓存。");
  } else {
    lines.push(
      `本会话未命中合计: ${formatTokens(input.totals.missedTokens)} tokens ≈ ${formatUsd(input.totals.missedCost)}（计费 ${input.totals.missCount} 次，其中明显 ${input.totals.notableCount} 次）`,
    );
  }

  const last = [...input.records].reverse().find((record) => record.counted);
  if (last) {
    lines.push(
      `最近一次未命中: ${formatTokens(last.missedTokens)} tokens ≈ ${formatUsd(last.missedCost)} · 空闲 ${formatDuration(last.idleMs)} · ${
        last.modelChanged ? "模型已切换" : "模型未变"
      } · ${last.provider}/${last.model}`,
    );
    if (last.cause) lines.push(`线索: ${last.cause}`);
  }

  if (input.probes && input.probes.length > 0) {
    lines.push("上游体检:");
    for (const probe of input.probes) lines.push(`  ${probe}`);
  }

  lines.push(`开关: /cache-guard ask | never | reset（状态: /cache-guard status）`);
  return lines;
}

/* ------------------------------------------------------------------ *
 * 扩展注册
 * ------------------------------------------------------------------ */

const CHOICE_CONTINUE = "继续任务（本次忽略，稍后仍会提醒）";
const CHOICE_STATUS = "查看状态（缓存与上游诊断）";
const CHOICE_KEEP_ASKING = "继续，并保留后续掉缓存提醒（我已换上游）";
const CHOICE_NEVER = "不再提醒（不在乎成本，尽快完成）";

interface ReportEntryData {
  title: string;
  lines: string[];
}

function reportEntryData(input: ReportInput): ReportEntryData {
  return { title: "掉缓存看门狗 · 状态", lines: buildReportLines(input) };
}

export default function cacheDropGuard(pi: ExtensionAPI): void {
  const settings = resolveGuardSettings();
  if (!settings.enabled) return;

  let state: GuardState = { mode: "ask" };
  let streak = 0;
  let alerted = false;
  let totals: CacheTotals = emptyTotals();
  let recent: CacheTurnRecord[] = [];
  let lastMessageKey = "";

  const sessionIdOf = (ctx: ExtensionContext): string | undefined => {
    try {
      return ctx.sessionManager.getSessionId();
    } catch {
      return undefined;
    }
  };

  /** 更新内存开关并落盘：只记录当前会话的选择，不供其他会话继承。 */
  const persistState = async (
    mode: GuardMode,
    ctx: ExtensionContext,
    extra: Pick<GuardState, "acknowledgedAt"> | undefined = undefined,
  ): Promise<void> => {
    state = {
      mode,
      updatedAt: new Date().toISOString(),
      sessionId: sessionIdOf(ctx),
      ...(extra ?? {}),
    };
    await saveGuardState(state);
  };

  const fallbackReadPrice = (ctx: ExtensionContext) => (provider: string, model: string): number => {
    try {
      const found = ctx.modelRegistry.find(provider, model);
      return found ? found.cost.cacheRead / 1_000_000 : 0;
    } catch {
      return 0;
    }
  };

  const collect = (ctx: ExtensionContext, entries: readonly unknown[]): CacheHistory =>
    collectCacheHistory(entries, {
      minMissedTokens: settings.minMissedTokens,
      fallbackCacheReadPerTokenFor: fallbackReadPrice(ctx),
    });

  const modelLabel = (ctx: ExtensionContext): string => {
    try {
      if (ctx.model) return `${ctx.model.provider}/${ctx.model.id}`;
    } catch {
      // 某些上下文没有模型信息，退回空标签。
    }
    return "";
  };

  const applyStatus = (ctx: ExtensionContext): void => {
    if (!ctx.hasUI) return;
    ctx.ui.setStatus(STATUS_KEY, state.mode === "never" ? "掉缓存看门狗: 已关闭" : undefined);
  };

  const runProbe = async (command: string): Promise<string[]> => {
    try {
      const shell = process.env.SHELL ?? "/bin/sh";
      const result = await pi.exec(shell, ["-c", command], { timeout: 15_000 });
      const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
      const lines = output.split("\n").filter((line) => line.trim().length > 0).slice(-12);
      if (lines.length === 0) return [`  （无输出，退出码 ${result.code}）`];
      return lines.map((line) => `  ${line}`);
    } catch (error) {
      return [`  体检命令执行失败: ${error instanceof Error ? error.message : String(error)}`];
    }
  };

  const showReport = async (ctx: ExtensionContext, view: ReportView): Promise<void> => {
    const probes = settings.statusCommand ? await runProbe(settings.statusCommand) : undefined;
    const input: ReportInput = {
      mode: state.mode,
      modelLabel: modelLabel(ctx),
      settings,
      totals: view.totals,
      records: view.records,
      streak,
      probes,
    };
    pi.appendEntry<ReportEntryData>(REPORT_ENTRY, reportEntryData(input));
    const verdict = view.totals.missCount === 0
      ? "缓存正常"
      : `连续明显掉缓存 ${streak} 次，本会话多花 ${formatTokens(view.totals.missedTokens)} tokens ≈ ${formatUsd(view.totals.missedCost)}`;
    ctx.ui.notify(verdict, streak >= settings.streak ? "warning" : "info");
  };

  const dialogOptions = (includeStatus: boolean): string[] =>
    includeStatus
      ? [CHOICE_CONTINUE, CHOICE_STATUS, CHOICE_KEEP_ASKING, CHOICE_NEVER]
      : [CHOICE_CONTINUE, CHOICE_KEEP_ASKING, CHOICE_NEVER];

  const askUser = async (
    ctx: ExtensionContext,
    assessment: CacheMissAssessment,
    view: ReportView,
  ): Promise<void> => {
    const dialogTimeout = settings.timeoutMs > 0 ? { timeout: settings.timeoutMs } : {};
    const title =
      `连续 ${streak} 次明显掉缓存：最近一次 ${formatTokens(assessment.missedTokens)} tokens ≈ ${formatUsd(assessment.missedCost)} 未命中`;
    ctx.ui.notify(`${title}\n${assessment.cause}`, "warning");

    let includeStatus = true;
    for (let pass = 0; pass < 2; pass += 1) {
      const choice = await ctx.ui.select(title, dialogOptions(includeStatus), dialogTimeout);
      if (choice === undefined) return; // 超时或 Esc：按「继续」处理
      if (choice === CHOICE_STATUS) {
        includeStatus = false;
        await showReport(ctx, view);
        continue;
      }
      if (choice === CHOICE_NEVER) {
        await persistState("never", ctx);
        applyStatus(ctx);
        ctx.ui.notify(
          "已关闭掉缓存提醒（仅本次会话）；新会话或 resume 会恢复默认提醒，/cache-guard ask 可立即重开。",
          "info",
        );
        return;
      }
      if (choice === CHOICE_KEEP_ASKING) {
        await persistState("ask", ctx, { acknowledgedAt: new Date().toISOString() });
        ctx.ui.notify("保持提醒：后续再次连续掉缓存时仍会弹窗。", "info");
        return;
      }
      return; // 继续任务
    }
  };

  pi.on("session_start", async (event, ctx) => {
    // 开关不跨会话：新会话 / resume / fork / 冷启动一律回到默认的 ask，
    // 只有同一次会话里的 /reload 继承关闭状态。
    const previous = await loadGuardState();
    const decision = decideSessionMode({
      previous,
      reason: event.reason,
      sessionId: sessionIdOf(ctx),
    });
    state = decision.inherited
      ? previous
      : { mode: "ask", updatedAt: new Date().toISOString(), sessionId: sessionIdOf(ctx) };

    streak = 0;
    alerted = false;
    lastMessageKey = "";
    // 恢复会话时从已有记录里接上统计，避免恢复后前几轮无法识别掉缓存。
    // 基线不在这里留存：每轮都从落盘条目现算（见 message_end）。
    const history = collect(ctx, ctx.sessionManager.getEntries());
    totals = history.totals;
    recent = history.records.slice(-RECENT_LIMIT);

    if (decision.rearmed) {
      // 上个会话关掉的提醒已重新打开：更新记录，免得每次启动都提示一遍。
      try {
        await saveGuardState(state);
      } catch (error) {
        console.error("[cache-drop-guard]", error);
      }
    }

    applyStatus(ctx);
    if (decision.rearmed && ctx.hasUI) {
      ctx.ui.notify(
        "掉缓存提醒已恢复默认开启：「不再提醒」只对单个会话有效，新会话与 resume 都会重新开启。",
        "info",
      );
    }
  });

  pi.on("message_end", async (event, ctx) => {
    try {
      const usage = toRequestUsage(event.message);
      if (!usage) return;

      const messageKey = `${usage.provider}/${usage.model}:${usage.timestamp}:${usage.input}:${usage.cacheRead}:${usage.cacheWrite}`;
      if (messageKey === lastMessageKey) return; // 重试会产生同一条消息的第二次事件
      lastMessageKey = messageKey;

      const modelKey = `${usage.provider}/${usage.model}`;
      const reportsCache = usage.cacheRead > 0 || usage.cacheWrite > 0;
      // 基线每轮从已落盘条目现算，而不是留在内存里递推：compaction 与
      // branch summary 会写入条目并打断基线，现算才能让压缩后的第一次
      // 重新计费不算掉缓存（口径与 pi 内建的 detectCacheMiss 一致）。
      const history = collect(ctx, ctx.sessionManager.getEntries());
      const baseline = history.lastBaseline;
      const assessment = assessCacheMiss(baseline, usage, {
        minMissedTokens: settings.minMissedTokens,
        fallbackCacheReadPerToken: fallbackReadPrice(ctx)(usage.provider, usage.model),
        expectCache: history.reportedModels.includes(modelKey) || reportsCache,
      });

      recent = [...recent, cacheTurnRecord(baseline, usage, assessment)].slice(-RECENT_LIMIT);
      streak = advanceStreak(streak, assessment);
      if (assessment) totals = accumulateTotals(totals, assessment);

      if (!assessment || !assessment.obvious) {
        if (alerted && streak === 0) {
          alerted = false;
          if (ctx.hasUI) ctx.ui.notify("缓存已恢复正常，掉缓存计数归零。", "info");
        }
        return;
      }

      if (state.mode === "never" || !ctx.hasUI) return;
      if (streak < settings.streak) return;

      await askUser(ctx, assessment, { records: recent, totals });
      // 弹窗后重新计数，避免持续故障时每轮都骚扰。
      streak = 0;
      alerted = true;
    } catch (error) {
      console.error("[cache-drop-guard]", error);
    }
  });

  pi.registerEntryRenderer<ReportEntryData>(REPORT_ENTRY, (entry, _options, theme) => {
    const data = entry.data;
    if (!data) return undefined;
    const box = new Box(1, 0, (text) => theme.bg("customMessageBg", text));
    box.addChild(new Text(theme.bold(theme.fg("accent", data.title)), 0, 0));
    for (const line of data.lines) {
      box.addChild(new Text(theme.fg("muted", line), 0, 0));
    }
    return box;
  });

  const handleCommand = async (args: string, ctx: ExtensionCommandContext): Promise<void> => {
    const action = args.trim().toLowerCase() || "status";

    if (action === "status" || action === "s") {
      if (!ctx.hasUI) return;
      await showReport(ctx, { records: recent, totals });
      return;
    }

    if (action === "never" || action === "off") {
      await persistState("never", ctx);
      applyStatus(ctx);
      ctx.ui.notify("掉缓存提醒已关闭（仅本次会话；新会话或 resume 会重新开启）。", "info");
      return;
    }

    if (action === "ask" || action === "on") {
      await persistState("ask", ctx);
      applyStatus(ctx);
      ctx.ui.notify(`掉缓存提醒已开启：连续 ${settings.streak} 次明显掉缓存时弹窗。`, "info");
      return;
    }

    if (action === "reset") {
      streak = 0;
      alerted = false;
      totals = emptyTotals();
      recent = [];
      await persistState("ask", ctx);
      applyStatus(ctx);
      ctx.ui.notify("计数与统计已重置。", "info");
      return;
    }

    ctx.ui.notify("用法: /cache-guard status | ask | never | reset", "warning");
  };

  pi.registerCommand("cache-guard", {
    description: "掉缓存看门狗：查看缓存状态，切换提醒模式（status | ask | never | reset；开关仅对当前会话有效）",
    getArgumentCompletions: (prefix: string) => {
      const items = [
        { value: "status", label: "status", description: "显示缓存命中与上游诊断报告" },
        { value: "ask", label: "ask", description: "恢复提醒（连续掉缓存时弹窗）" },
        { value: "never", label: "never", description: "关闭本次会话的提醒（新会话恢复默认）" },
        { value: "reset", label: "reset", description: "清零计数与统计" },
      ];
      const filtered = items.filter((item) => item.value.startsWith(prefix.trim()));
      return filtered.length > 0 ? filtered : null;
    },
    handler: handleCommand,
  });
}
