import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const { default: register } = await import("../index.ts");

const PRICE = { input: 3 / 1e6, cacheRead: 0.3 / 1e6, cacheWrite: 3.75 / 1e6 };

const CHOICE_CONTINUE = "继续任务（本次忽略，稍后仍会提醒）";
const CHOICE_STATUS = "查看状态（缓存与上游诊断）";
const CHOICE_KEEP_ASKING = "继续，并保留后续掉缓存提醒（我已换上游）";
const CHOICE_NEVER = "不再提醒（不在乎成本，尽快完成）";

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

async function createHarness({ answers = [], agentDir, seed = [] } = {}) {
  const dir = agentDir ?? (await mkdtemp(join(tmpdir(), "pi-cache-guard-")));
  process.env.PI_CODING_AGENT_DIR = dir;

  const handlers = new Map();
  const commands = new Map();
  const selectCalls = [];
  const notifications = [];
  const statuses = [];
  const appended = [];
  const execCalls = [];
  const entries = [];
  let answerIndex = 0;
  entries.push(...seed);

  const ctx = {
    hasUI: true,
    model: { provider: "litellm", id: "gpt-5.5" },
    modelRegistry: { find: () => undefined },
    ui: {
      select: async (title, options) => {
        const answer = answers[answerIndex];
        answerIndex += 1;
        selectCalls.push({ title, options, answer });
        return answer;
      },
      notify: (message, type) => notifications.push({ message, type }),
      setStatus: (key, text) => statuses.push({ key, text }),
    },
    sessionManager: { getEntries: () => entries },
  };

  const pi = {
    on: (name, handler) => handlers.set(name, handler),
    registerCommand: (name, options) => commands.set(name, options),
    registerEntryRenderer: (customType) => {
      handlers.set(`render:${customType}`, true);
    },
    appendEntry: (customType, data) => appended.push({ customType, data }),
    exec: async (command, args, options) => {
      execCalls.push({ command, args, options });
      return { stdout: "upstream ok\n", stderr: "", code: 0, killed: false };
    },
  };

  register(pi);

  const messageEnd = handlers.get("message_end");
  const start = async () => {
    await handlers.get("session_start")({ type: "session_start" }, ctx);
  };
  const feed = async (message) => {
    await messageEnd({ type: "message_end", message }, ctx);
    entries.push({
      type: "message",
      id: `e${entries.length}`,
      parentId: entries.length === 0 ? null : `e${entries.length - 1}`,
      timestamp: new Date(message.timestamp).toISOString(),
      message,
    });
  };
  const warmUp = async (base = 1000) => {
    await feed(turn({ input: 20_000, timestamp: base }));
    await feed(turn({ cacheRead: 20_000, timestamp: base + 1000 }));
  };
  const drop = async (index) => feed(turn({ input: 20_000 + index * 500, timestamp: 3000 + index * 1000 }));

  return {
    dir,
    ctx,
    entries,
    selectCalls,
    notifications,
    statuses,
    appended,
    execCalls,
    commands,
    start,
    feed,
    warmUp,
    drop,
    cleanup: () => rm(dir, { recursive: true, force: true }),
  };
}

test("two consecutive drops open one dialog with continue, status, and the two persistent modes", async () => {
  const harness = await createHarness({ answers: [undefined] });
  try {
    await harness.start();
    await harness.warmUp();

    await harness.drop(1);
    assert.equal(harness.selectCalls.length, 0, "第一次掉缓存不打扰用户");

    await harness.drop(2);
    assert.equal(harness.selectCalls.length, 1, "连续两次明显掉缓存才弹窗");
    const call = harness.selectCalls[0];
    assert.match(call.title, /连续 2 次明显掉缓存/);
    assert.match(call.title, /tokens/);
    assert.deepEqual(call.options, [CHOICE_CONTINUE, CHOICE_STATUS, CHOICE_KEEP_ASKING, CHOICE_NEVER]);
    assert.ok(harness.notifications.some((entry) => entry.type === "warning"));
  } finally {
    await harness.cleanup();
  }
});

test("choosing continue keeps the guard armed for the next streak", async () => {
  const harness = await createHarness({ answers: [CHOICE_CONTINUE, undefined] });
  try {
    await harness.start();
    await harness.warmUp();
    await harness.drop(1);
    await harness.drop(2);
    assert.equal(harness.selectCalls.length, 1);

    // 弹窗后计数归零，需要再连续两次才会再问
    await harness.drop(3);
    assert.equal(harness.selectCalls.length, 1);
    await harness.drop(4);
    assert.equal(harness.selectCalls.length, 2);
  } finally {
    await harness.cleanup();
  }
});

test("a restored cache reports recovery once and does not persist anything", async () => {
  const harness = await createHarness({ answers: [CHOICE_CONTINUE] });
  try {
    await harness.start();
    await harness.warmUp();
    await harness.drop(1);
    await harness.drop(2);

    await harness.feed(turn({ cacheRead: 21_000, timestamp: 9000 }));
    const recovery = harness.notifications.filter((entry) => /缓存已恢复正常/.test(entry.message));
    assert.equal(recovery.length, 1);

    await harness.feed(turn({ cacheRead: 21_500, timestamp: 10_000 }));
    assert.equal(
      harness.notifications.filter((entry) => /缓存已恢复正常/.test(entry.message)).length,
      1,
      "恢复提示只报一次",
    );

    await assert.rejects(readFile(join(harness.dir, "cache-drop-guard.json"), "utf8"), /ENOENT/);
  } finally {
    await harness.cleanup();
  }
});

test("status choice shows the report and then asks again without the status row", async () => {
  const harness = await createHarness({ answers: [CHOICE_STATUS, CHOICE_KEEP_ASKING] });
  try {
    await harness.start();
    await harness.warmUp();
    await harness.drop(1);
    await harness.drop(2);

    assert.equal(harness.selectCalls.length, 2);
    assert.deepEqual(harness.selectCalls[1].options, [CHOICE_CONTINUE, CHOICE_KEEP_ASKING, CHOICE_NEVER]);

    const report = harness.appended.find((entry) => entry.customType === "cache-drop-guard-report");
    assert.ok(report, "状态报告应写入会话条目");
    assert.match(report.data.lines.join("\n"), /当前连续明显掉缓存: 2 次（阈值 2）/);
    assert.match(report.data.lines.join("\n"), /本会话未命中合计: /);

    const saved = JSON.parse(await readFile(join(harness.dir, "cache-drop-guard.json"), "utf8"));
    assert.equal(saved.mode, "ask");
    assert.ok(saved.acknowledgedAt, "保留提醒会记录一次确认时间");
  } finally {
    await harness.cleanup();
  }
});

test("choosing never persists silence across sessions", async () => {
  const harness = await createHarness({ answers: [CHOICE_NEVER] });
  try {
    await harness.start();
    await harness.warmUp();
    await harness.drop(1);
    await harness.drop(2);
    assert.equal(harness.selectCalls.length, 1);

    const saved = JSON.parse(await readFile(join(harness.dir, "cache-drop-guard.json"), "utf8"));
    assert.equal(saved.mode, "never");

    const resumed = await createHarness({ answers: [undefined], agentDir: harness.dir });
    await resumed.start();
    const statusText = resumed.statuses.at(-1);
    assert.equal(statusText.key, "cache-drop-guard");
    assert.match(statusText.text, /已关闭/);

    await resumed.warmUp();
    await resumed.drop(1);
    await resumed.drop(2);
    await resumed.drop(3);
    assert.equal(resumed.selectCalls.length, 0, "关闭后不再弹窗");

    // 重新打开后恢复提醒（never 期间累计的次数仍然算数，下一次掉缓存就会问）
    await resumed.commands.get("cache-guard").handler("ask", resumed.ctx);
    assert.equal(JSON.parse(await readFile(join(harness.dir, "cache-drop-guard.json"), "utf8")).mode, "ask");
    await resumed.drop(4);
    assert.equal(resumed.selectCalls.length, 1);
  } finally {
    await harness.cleanup();
  }
});

test("the status command prints a report and can run an upstream probe", async () => {
  process.env.PI_CACHE_DROP_GUARD_STATUS_CMD = "true";
  const harness = await createHarness();
  try {
    await harness.start();
    await harness.warmUp();
    await harness.commands.get("cache-guard").handler("status", harness.ctx);

    const report = harness.appended.at(-1);
    assert.equal(report.customType, "cache-drop-guard-report");
    assert.match(report.data.lines.join("\n"), /上游体检:/);
    assert.match(report.data.lines.join("\n"), /upstream ok/);
    assert.equal(harness.execCalls.length, 1);
  } finally {
    delete process.env.PI_CACHE_DROP_GUARD_STATUS_CMD;
    await harness.cleanup();
  }
});

test("reset clears counters and turns reminders back on", async () => {
  const harness = await createHarness({ answers: [CHOICE_NEVER] });
  try {
    await harness.start();
    await harness.warmUp();
    await harness.drop(1);
    await harness.drop(2);
    await harness.commands.get("cache-guard").handler("reset", harness.ctx);
    assert.equal(JSON.parse(await readFile(join(harness.dir, "cache-drop-guard.json"), "utf8")).mode, "ask");

    harness.selectCalls.length = 0;
    await harness.warmUp(20_000);
    await harness.drop(10);
    await harness.drop(11);
    assert.equal(harness.selectCalls.length, 1, "reset 之后重新开始计数并弹窗");
  } finally {
    await harness.cleanup();
  }
});

test("a resumed session keeps its cache baseline and totals", async () => {
  const seed = [
    {
      type: "message",
      id: "s0",
      parentId: null,
      timestamp: new Date(1000).toISOString(),
      message: turn({ input: 20_000, timestamp: 1000 }),
    },
    {
      type: "message",
      id: "s1",
      parentId: "s0",
      timestamp: new Date(2000).toISOString(),
      message: turn({ cacheRead: 20_000, timestamp: 2000 }),
    },
  ];
  const harness = await createHarness({ answers: [CHOICE_CONTINUE], seed });
  try {
    await harness.start();
    await harness.drop(1);
    await harness.drop(2);
    assert.equal(harness.selectCalls.length, 1, "恢复会话后前两轮就能识别超过阈值的掉缓存");
    const report = harness.appended.length;
    await harness.commands.get("cache-guard").handler("status", harness.ctx);
    assert.equal(harness.appended.length, report + 1);
    assert.match(harness.appended.at(-1).data.lines.join("\n"), /本会话未命中合计: /);
  } finally {
    await harness.cleanup();
  }
});

test("the disable env var keeps the extension from registering anything", async () => {
  process.env.PI_CACHE_DROP_GUARD_DISABLE = "1";
  try {
    const registers = [];
    register({
      on: (name) => registers.push(name),
      registerCommand: (name) => registers.push(name),
      registerEntryRenderer: () => registers.push("renderer"),
    });
    assert.deepEqual(registers, []);
  } finally {
    delete process.env.PI_CACHE_DROP_GUARD_DISABLE;
  }
});
