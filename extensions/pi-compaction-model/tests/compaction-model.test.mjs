import assert from "node:assert/strict";
import test from "node:test";

import {
  errorMessage,
  isAbortError,
  isCompactionModelDisabled,
  isTransientCompactionError,
  resolveCompactionTarget,
  runWithRetry,
  withoutNullHeaders,
} from "../index.ts";

test("resolveCompactionTarget falls back to the pinned defaults", () => {
  assert.deepEqual(resolveCompactionTarget({}), {
    provider: "manager",
    model: "deepseek-v4-flash",
    retries: 3,
    baseDelayMs: 2000,
  });
});

test("resolveCompactionTarget reads overrides and clamps out-of-range values", () => {
  assert.deepEqual(
    resolveCompactionTarget({
      PI_COMPACTION_MODEL_PROVIDER: " openrouter ",
      PI_COMPACTION_MODEL: "gemini-3-pro",
      PI_COMPACTION_RETRIES: "99",
      PI_COMPACTION_RETRY_DELAY_MS: "999999",
    }),
    {
      provider: "openrouter",
      model: "gemini-3-pro",
      retries: 10,
      baseDelayMs: 30000,
    },
  );
  assert.equal(resolveCompactionTarget({ PI_COMPACTION_RETRIES: "abc" }).retries, 3);
});

test("isCompactionModelDisabled accepts the documented truthy spellings", () => {
  assert.equal(isCompactionModelDisabled({ PI_COMPACTION_MODEL_DISABLE: "1" }), true);
  assert.equal(isCompactionModelDisabled({ PI_COMPACTION_MODEL_DISABLE: "TRUE" }), true);
  assert.equal(isCompactionModelDisabled({ PI_COMPACTION_MODEL_DISABLE: "yes" }), true);
  assert.equal(isCompactionModelDisabled({ PI_COMPACTION_MODEL_DISABLE: "0" }), false);
  assert.equal(isCompactionModelDisabled({}), false);
});

test("withoutNullHeaders drops null deletions and empty results", () => {
  assert.deepEqual(withoutNullHeaders({ a: "1", b: null }), { a: "1" });
  assert.equal(withoutNullHeaders({ a: null }), undefined);
  assert.equal(withoutNullHeaders(undefined), undefined);
});

test("isTransientCompactionError classifies gateway and quota failures", () => {
  assert.equal(isTransientCompactionError(new Error("Upstream HTTP/2 stream failed")), true);
  assert.equal(isTransientCompactionError(new Error("429 Too Many Requests")), true);
  assert.equal(isTransientCompactionError(new Error("socket hang up")), true);
  assert.equal(isTransientCompactionError(new Error("GoUsageLimitError: monthly limit")), false);
  assert.equal(isTransientCompactionError(new Error("context overflow")), false);
  assert.equal(isTransientCompactionError(new Error("invalid api key")), false);
});

test("isAbortError detects aborts by name and message", () => {
  const abort = new Error("Aborted");
  abort.name = "AbortError";
  assert.equal(isAbortError(abort), true);
  assert.equal(isAbortError(new Error("request aborted by signal")), true);
  assert.equal(isAbortError(new Error("upstream failed")), false);
  assert.equal(errorMessage("plain string"), "plain string");
});

test("runWithRetry returns the first success without reporting retries", async () => {
  const retries = [];
  const outcome = await runWithRetry(async () => "ok", {
    attempts: 3,
    baseDelayMs: 1,
    onRetry: (attempt) => retries.push(attempt),
  });
  assert.deepEqual(outcome, { ok: true, value: "ok" });
  assert.deepEqual(retries, []);
});

test("runWithRetry retries transient failures with backoff then succeeds", async () => {
  const retries = [];
  let calls = 0;
  const outcome = await runWithRetry(
    async () => {
      calls++;
      if (calls < 3) throw new Error("socket hang up");
      return calls;
    },
    { attempts: 4, baseDelayMs: 1, onRetry: (attempt, delayMs) => retries.push([attempt, delayMs]) },
  );
  assert.deepEqual(outcome, { ok: true, value: 3 });
  assert.deepEqual(retries, [[1, 1], [2, 2]]);
});

test("runWithRetry fails fast on non-transient errors and respects the attempt budget", async () => {
  const quota = await runWithRetry(async () => { throw new Error("insufficient_quota"); }, {
    attempts: 3,
    baseDelayMs: 1,
  });
  assert.equal(quota.ok, false);
  assert.equal(quota.attempts, 1);

  let calls = 0;
  const exhausted = await runWithRetry(async () => { calls++; throw new Error("ECONNRESET"); }, {
    attempts: 2,
    baseDelayMs: 1,
  });
  assert.equal(exhausted.ok, false);
  assert.equal(exhausted.attempts, 2);
  assert.equal(calls, 2);
});

test("runWithRetry reports aborts as terminal", async () => {
  const controller = new AbortController();
  controller.abort();
  const outcome = await runWithRetry(async () => { throw new Error("upstream failed"); }, {
    attempts: 3,
    baseDelayMs: 1,
    signal: controller.signal,
  });
  assert.equal(outcome.ok, false);
  assert.equal(outcome.aborted, true);
  assert.equal(outcome.attempts, 1);
});
