import assert from "node:assert/strict";
import test from "node:test";
import {
  advanceStreak,
  assessCacheMiss,
  baselineFrom,
  buildReportLines,
  collectCacheHistory,
  decideSessionMode,
  describeMissingCache,
  formatDuration,
  formatPercent,
  formatTokens,
  formatUsd,
  resolveGuardSettings,
  toRequestUsage,
  trailingObviousStreak,
} from "../index.ts";

const PRICE = { input: 3 / 1e6, cacheRead: 0.3 / 1e6, cacheWrite: 3.75 / 1e6 };
const SETTINGS = { minMissedTokens: 4096, fallbackCacheReadPerToken: PRICE.cacheRead };

function turn({ input = 0, cacheRead = 0, cacheWrite = 0, provider = "litellm", model = "gpt-5.5", timestamp = 1000 } = {}) {
  return {
    role: "assistant",
    provider,
    model,
    timestamp,
    content: [],
    usage: {
      input,
      output: 10,
      cacheRead,
      cacheWrite,
      reasoning: 0,
      totalTokens: input + cacheRead + cacheWrite + 10,
      cost: {
        input: input * PRICE.input,
        output: 10 * 1e-5,
        cacheRead: cacheRead * PRICE.cacheRead,
        cacheWrite: cacheWrite * PRICE.cacheWrite,
        total: 0,
      },
    },
  };
}

function entry(message, index) {
  return {
    type: "message",
    id: `e${index}`,
    parentId: index === 0 ? null : `e${index - 1}`,
    timestamp: new Date(message.timestamp).toISOString(),
    message,
  };
}

/* ------------------------------------------------------------------ *
 * 配置
 * ------------------------------------------------------------------ */

test("guard settings default to a two-drop streak and can be overridden", () => {
  assert.deepEqual(resolveGuardSettings({}), {
    enabled: true,
    streak: 2,
    minMissedTokens: 4096,
    timeoutMs: 60_000,
    statusCommand: undefined,
  });

  const custom = resolveGuardSettings({
    PI_CACHE_DROP_GUARD_DISABLE: "1",
    PI_CACHE_DROP_GUARD_STREAK: "3",
    PI_CACHE_DROP_GUARD_MIN_MISSED_TOKENS: "8192",
    PI_CACHE_DROP_GUARD_TIMEOUT_MS: "0",
    PI_CACHE_DROP_GUARD_STATUS_CMD: "  curl -s http://127.0.0.1:4000/health  ",
  });
  assert.equal(custom.enabled, false);
  assert.equal(custom.streak, 3);
  assert.equal(custom.minMissedTokens, 8192);
  assert.equal(custom.timeoutMs, 0);
  assert.equal(custom.statusCommand, "curl -s http://127.0.0.1:4000/health");
});

test("guard settings reject nonsense values and keep the streak threshold at two or more", () => {
  const settings = resolveGuardSettings({
    PI_CACHE_DROP_GUARD_STREAK: "1",
    PI_CACHE_DROP_GUARD_MIN_MISSED_TOKENS: "10",
    PI_CACHE_DROP_GUARD_TIMEOUT_MS: "-5",
  });
  assert.equal(settings.streak, 2);
  assert.equal(settings.minMissedTokens, 4096);
  assert.equal(settings.timeoutMs, 60_000);
});

/* ------------------------------------------------------------------ *
 * 判定
 * ------------------------------------------------------------------ */

test("usage extraction ignores non-assistant messages and empty prompts", () => {
  assert.equal(toRequestUsage({ role: "user", content: "hi" }), undefined);
  assert.equal(toRequestUsage({ role: "assistant", usage: { input: 0, cacheRead: 0, cacheWrite: 0 } }), undefined);
  assert.equal(toRequestUsage(undefined), undefined);
  const usage = toRequestUsage(turn({ input: 100, cacheRead: 200 }));
  assert.equal(usage.input, 100);
  assert.equal(usage.cacheRead, 200);
  assert.equal(usage.model, "gpt-5.5");
});

test("the first turn of a session has no baseline to compare against", () => {
  const usage = toRequestUsage(turn({ input: 20_000 }));
  assert.equal(assessCacheMiss(undefined, usage, SETTINGS), undefined);
  assert.equal(baselineFrom(usage).promptTokens, 20_000);
  assert.equal(baselineFrom(usage).reportedCache, false);
});

test("a warm cache read is not a miss", () => {
  const warm = toRequestUsage(turn({ input: 20_000, timestamp: 1000 }));
  const hit = toRequestUsage(turn({ cacheRead: 20_000, timestamp: 2000 }));
  assert.equal(assessCacheMiss(baselineFrom(warm), hit, SETTINGS), undefined);
});

test("providers that never report cache fields are never flagged", () => {
  const first = toRequestUsage(turn({ input: 30_000, timestamp: 1000 }));
  const second = toRequestUsage(turn({ input: 31_000, timestamp: 2000 }));
  assert.equal(assessCacheMiss(baselineFrom(first), second, SETTINGS), undefined);
});

test("an obvious drop counts missed tokens, cost, and cause", () => {
  const warm = toRequestUsage(turn({ input: 20_000, timestamp: 1000 }));
  const previous = toRequestUsage(turn({ cacheRead: 20_000, timestamp: 2000 }));
  assert.equal(assessCacheMiss(baselineFrom(warm), previous, SETTINGS), undefined);

  const drop = toRequestUsage(turn({ input: 20_500, timestamp: 3000 }));
  const assessment = assessCacheMiss(baselineFrom(previous), drop, SETTINGS);
  assert.ok(assessment);
  assert.equal(assessment.missedTokens, 20_000);
  assert.equal(assessment.hitRate, 0);
  assert.equal(assessment.counted, true);
  assert.equal(assessment.obvious, true);
  // 20_000 * ($3/M - $0.3/M) = $0.054
  assert.ok(Math.abs(assessment.missedCost - 0.054) < 1e-9, String(assessment.missedCost));
  assert.equal(assessment.idleMs, 1000);
  assert.equal(assessment.modelChanged, false);
  assert.match(assessment.cause, /没有命中|没回报缓存字段/);
});

test("a continued zero-cache outage keeps counting once the provider proved it caches", () => {
  const warm = toRequestUsage(turn({ input: 20_000, timestamp: 1000 }));
  const previous = toRequestUsage(turn({ cacheRead: 20_000, timestamp: 2000 }));
  const firstDrop = toRequestUsage(turn({ input: 20_500, timestamp: 3000 }));
  const secondDrop = toRequestUsage(turn({ input: 21_000, timestamp: 4000 }));

  const first = assessCacheMiss(baselineFrom(previous), firstDrop, SETTINGS);
  assert.ok(first?.obvious);

  // 上一轮自己没回报缓存，但会话里该模型曾经命中过 → 仍然算「该命中」
  const baseline = baselineFrom(firstDrop);
  assert.equal(baseline.reportedCache, false);
  const second = assessCacheMiss(baseline, secondDrop, {
    ...SETTINGS,
    expectCache: true,
  });
  assert.ok(second?.obvious, "持续掉缓存不应被静默忽略");
  assert.equal(second.missedTokens, 20_500);

  // 没有 expectCache 时才回落成 pi 的保守口径
  assert.equal(assessCacheMiss(baseline, secondDrop, SETTINGS), undefined);
});

test("a partial invalidation below the obvious threshold still counts as a miss", () => {
  const previous = toRequestUsage(turn({ cacheRead: 30_000, timestamp: 1000 }));
  const partial = toRequestUsage(turn({ input: 5_000, cacheRead: 26_000, timestamp: 2000 }));
  const assessment = assessCacheMiss(baselineFrom(previous), partial, SETTINGS);
  assert.ok(assessment);
  assert.equal(assessment.missedTokens, 4_000);
  assert.equal(assessment.counted, true);
  assert.equal(assessment.obvious, false);
  assert.ok(Math.abs(assessment.hitRate - 26_000 / 30_000) < 1e-9);
});

test("a tiny miss stays under the noise floor", () => {
  const previous = toRequestUsage(turn({ cacheRead: 30_000, timestamp: 1000 }));
  const tiny = toRequestUsage(turn({ input: 900, cacheRead: 29_600, timestamp: 2000 }));
  assert.equal(assessCacheMiss(baselineFrom(previous), tiny, SETTINGS), undefined);
});

test("idle time beyond the cache TTL and a model switch are reported as causes", () => {
  const previous = toRequestUsage(turn({ cacheRead: 20_000, timestamp: 1000 }));
  const drop = toRequestUsage(turn({ input: 21_000, timestamp: 1000 + 6 * 60 * 1000 }));
  const assessment = assessCacheMiss(baselineFrom(previous), drop, SETTINGS);
  assert.ok(assessment);
  assert.equal(assessment.idleMs, 6 * 60 * 1000);
  assert.match(assessment.cause, /空闲 6m0s/);
  assert.match(assessment.cause, /TTL/);

  const switched = toRequestUsage(turn({ input: 21_000, model: "gpt-5.1", timestamp: 2000 }));
  assert.equal(assessCacheMiss(baselineFrom(previous), switched, SETTINGS).modelChanged, true);
});

test("describeMissingCache separates rewritten caches from missing cache support", () => {
  assert.match(
    describeMissingCache({ cacheRead: 0, cacheWrite: 5_000, idleMs: 0, modelChanged: false }),
    /重新写缓存/,
  );
  assert.match(
    describeMissingCache({ cacheRead: 0, cacheWrite: 0, idleMs: 0, modelChanged: false }),
    /没回报缓存字段/,
  );
});

test("advanceStreak only grows on obvious drops", () => {
  const obvious = { obvious: true };
  const minor = { obvious: false };
  assert.equal(advanceStreak(0, undefined), 0);
  assert.equal(advanceStreak(1, undefined), 0);
  assert.equal(advanceStreak(1, minor), 0);
  assert.equal(advanceStreak(0, obvious), 1);
  assert.equal(advanceStreak(1, obvious), 2);
});

/* ------------------------------------------------------------------ *
 * 历史扫描
 * ------------------------------------------------------------------ */

test("history scan accumulates totals and remembers the last baseline", () => {
  const messages = [
    turn({ input: 20_000, timestamp: 1000 }),
    turn({ cacheRead: 20_000, timestamp: 2000 }),
    turn({ input: 20_500, timestamp: 3000 }),
    turn({ input: 21_000, timestamp: 4000 }),
  ];
  const history = collectCacheHistory(messages.map(entry), SETTINGS);

  assert.equal(history.records.length, 4);
  assert.equal(history.records[0].counted, false);
  assert.equal(history.records[2].obvious, true);
  assert.equal(history.records[3].obvious, true);
  assert.equal(history.totals.missCount, 2);
  assert.equal(history.totals.notableCount, 2);
  assert.equal(history.totals.missedTokens, 40_500);
  assert.equal(history.reportedModels.length, 1);
  assert.equal(history.lastBaseline.promptTokens, 21_000);
  assert.equal(trailingObviousStreak(history.records), 2);
});

test("compaction resets the baseline so the next full re-bill is not a drop", () => {
  const first = turn({ input: 20_000, timestamp: 1000 });
  const compacted = {
    type: "compaction",
    id: "c1",
    parentId: "e0",
    timestamp: new Date(2500).toISOString(),
    summary: "summary",
    firstKeptEntryId: "e0",
    tokensBefore: 20_000,
  };
  const after = turn({ input: 9_000, timestamp: 3000 });
  const history = collectCacheHistory([entry(first, 0), compacted, entry(after, 2)], SETTINGS);

  assert.equal(history.records.length, 2);
  assert.equal(history.totals.missCount, 0);
  assert.equal(history.records[1].counted, false);
  assert.equal(history.records[1].missedTokens, 0);
});

test("a healthy turn clears a recorded streak", () => {
  const messages = [
    turn({ input: 20_000, timestamp: 1000 }),
    turn({ cacheRead: 20_000, timestamp: 2000 }),
    turn({ input: 21_000, timestamp: 3000 }),
    turn({ cacheRead: 21_000, timestamp: 4000 }),
  ];
  const history = collectCacheHistory(messages.map(entry), SETTINGS);
  assert.equal(trailingObviousStreak(history.records), 0);
  assert.equal(history.totals.missCount, 1);
});

/* ------------------------------------------------------------------ *
 * 报告与格式化
 * ------------------------------------------------------------------ */

test("formatting helpers keep reports readable", () => {
  assert.equal(formatTokens(41_203), "41.2k");
  assert.equal(formatTokens(900), "900");
  assert.equal(formatTokens(2_500_000), "2.50M");
  assert.equal(formatUsd(0), "$0");
  assert.equal(formatUsd(0.004), "$0.0040");
  assert.equal(formatUsd(0.054), "$0.05");
  assert.equal(formatUsd(1.5), "$1.50");
  assert.equal(formatDuration(6 * 60 * 1000), "6m0s");
  assert.equal(formatDuration(45_000), "45s");
  assert.equal(formatPercent(0.9765), "98%");
});

test("report lines describe mode, totals, and the latest drop", () => {
  const messages = [
    turn({ input: 20_000, timestamp: 1000 }),
    turn({ cacheRead: 20_000, timestamp: 2000 }),
    turn({ input: 20_500, timestamp: 3000 }),
    turn({ input: 21_000, timestamp: 4000 }),
  ];
  const history = collectCacheHistory(messages.map(entry), SETTINGS);
  const lines = buildReportLines({
    mode: "ask",
    modelLabel: "litellm/gpt-5.5",
    settings: { enabled: true, streak: 2, minMissedTokens: 4096, timeoutMs: 1000 },
    totals: history.totals,
    records: history.records,
    streak: 2,
    probes: ["  ok"],
  });
  const text = lines.join("\n");
  assert.match(text, /提醒开启（连续 2 次明显掉缓存弹窗）/);
  assert.match(text, /模型: litellm\/gpt-5\.5/);
  assert.match(text, /本会话未命中合计: 40.5k tokens/);
  assert.match(text, /当前连续明显掉缓存: 2 次（阈值 2）/);
  assert.match(text, /最近缓存命中（新→旧）: 0%  0%  100%  0%/);
  assert.match(text, /上游体检:/);
  assert.match(text, /\/cache-guard ask \| never \| reset/);

  const clean = buildReportLines({
    mode: "never",
    modelLabel: "",
    settings: { enabled: true, streak: 2, minMissedTokens: 4096, timeoutMs: 1000 },
    totals: { missedTokens: 0, missedCost: 0, missCount: 0, notableCount: 0 },
    records: [],
    streak: 0,
  }).join("\n");
  assert.match(clean, /已关闭（不再提醒）/);
  assert.match(clean, /本会话未发现异常掉缓存/);
  assert.match(clean, /模型: 未知/);
});

/* ------------------------------------------------------------------ *
 * 开关作用域
 * ------------------------------------------------------------------ */

test("the silent switch belongs to the session that chose it", () => {
  const silenced = { mode: "never", sessionId: "session-a" };

  // 新会话 / resume / fork / 冷启动：都回到默认提醒。
  for (const reason of ["startup", "new", "resume", "fork", undefined]) {
    assert.deepEqual(
      decideSessionMode({ previous: silenced, reason, sessionId: "session-a" }),
      { mode: "ask", inherited: false, rearmed: true },
      `${reason} 不继承关闭状态`,
    );
  }

  // 换一个会话同样是默认提醒，但无需提示“恢复”。
  assert.deepEqual(decideSessionMode({ previous: silenced, reason: "new", sessionId: "session-b" }), {
    mode: "ask",
    inherited: false,
    rearmed: true,
  });

  // 同一次会话里的 /reload 会重新实例化扩展，必须继承关闭状态。
  assert.deepEqual(decideSessionMode({ previous: silenced, reason: "reload", sessionId: "session-a" }), {
    mode: "never",
    inherited: true,
    rearmed: false,
  });
  assert.deepEqual(decideSessionMode({ previous: silenced, reason: "reload", sessionId: "session-b" }), {
    mode: "ask",
    inherited: false,
    rearmed: true,
  });
  assert.deepEqual(decideSessionMode({ previous: { mode: "never" }, reason: "reload", sessionId: "session-a" }), {
    mode: "ask",
    inherited: false,
    rearmed: true,
  });

  // 已经是提醒状态时，session_start 不需要提示也不需要重写文件。
  assert.deepEqual(decideSessionMode({ previous: { mode: "ask" }, reason: "startup", sessionId: "session-a" }), {
    mode: "ask",
    inherited: false,
    rearmed: false,
  });
  assert.deepEqual(decideSessionMode({ reason: "startup", sessionId: "session-a" }), {
    mode: "ask",
    inherited: false,
    rearmed: false,
  });
});
