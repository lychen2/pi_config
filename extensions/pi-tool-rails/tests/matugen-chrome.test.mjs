import assert from "node:assert/strict";
import test from "node:test";

import {
  LiveContextController,
  ProjectRefreshScheduler,
  detectGitOperation,
  parseGitPorcelain,
} from "../../matugen-footer-core.mjs";

test("parses branch divergence and conflicts from porcelain status", () => {
  const status = parseGitPorcelain("## main...origin/main [ahead 2, behind 1]\nUU src/app.ts\n M README.md\n");
  assert.deepEqual(status, {
    dirty: true,
    conflicts: true,
    ahead: 2,
    behind: 1,
  });
});

test("detects the reference Git operation labels", () => {
  assert.deepEqual(detectGitOperation({ mergeHead: "/tmp/MERGE_HEAD" }), {
    operation: "MERGING",
    operationLabel: "MERGING",
  });
  assert.deepEqual(detectGitOperation({ rebaseMerge: "/tmp/rebase-merge", rebaseMsgnum: "/missing", rebaseEnd: "/missing" }), {
    operation: "REBASING",
    operationLabel: "REBASING",
  });
});

test("coalesces live context repaint and clears it", async () => {
  let renders = 0;
  const controller = new LiveContextController(() => { renders += 1; });
  controller.update({ tokens: 100, input: 70, output: 30, cacheRead: 0, cacheWrite: 0 });
  controller.update({ tokens: 120, input: 80, output: 40, cacheRead: 0, cacheWrite: 0 });
  assert.equal(controller.get()?.tokens, 120);
  await new Promise((resolve) => setTimeout(resolve, 280));
  assert.equal(renders, 1);
  controller.clear();
  assert.equal(controller.get(), undefined);
  assert.equal(renders, 2);
  controller.stop();
});

test("drops stale project refresh results after stop", async () => {
  let applied = 0;
  const scheduler = new ProjectRefreshScheduler(0, async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
    return { ok: true };
  }, () => { applied += 1; });
  scheduler.request();
  scheduler.stop();
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(applied, 0);
});
