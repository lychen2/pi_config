import assert from "node:assert/strict";
import test from "node:test";
import { visibleWidth } from "@earendil-works/pi-tui";
import { backgroundToolStatus, collapsedToolCard } from "../tool-card-summary.ts";

const theme = { fg: (_color, text) => text };
const plain = (lines) => lines.join("\n").replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "");
const output = (text, details) => ({ isError: false, content: [{ type: "text", text }], details });

test("bash short commands are readable; chains and heredocs summarize without source", () => {
  const simple = collapsedToolCard({ toolName: "bash", args: { command: "git status --short" } }, [], theme, 80);
  assert.match(plain(simple), /git status --short/);
  const long = collapsedToolCard({ toolName: "bash", args: {
    reasoning: "Inspect the project safely",
    command: "python - <<'PY'\nimport os\nprint(os.environ)\nPY\ngit status --short",
  } }, [], theme, 80);
  assert.ok(long.length >= 2 && long.length <= 4, plain(long));
  assert.match(plain(long), /Inspect the project safely/);
  assert.match(plain(long), /python|git|shell/i);
  assert.doesNotMatch(plain(long), /import os|print\(|os\.environ|<<|^PY$/m);
});

test("teammate dispatch shows bounded task goals without protocol details", () => {
  const lines = collapsedToolCard({ toolName: "teammate", args: {
    reasoning: "Delegate independent checks",
    tasks: [
      { name: "tests", goal: "Run the focused test suite" },
      { name: "types", goal: "Check TypeScript errors" },
      { name: "review", goal: "Review API safety" },
      { name: "extra", goal: "not shown" },
    ],
    correlationId: "secret-correlation",
  } }, [], theme, 80);
  const text = plain(lines);
  assert.ok(lines.length <= 4, text);
  assert.match(text, /Delegate independent checks/);
  assert.match(text, /Run the focused test suite|tests/);
  assert.doesNotMatch(text, /correlationId|secret-correlation|not shown/);
});

test("read/edit/write/search summaries omit source while retaining counts and mutation styling", () => {
  const read = collapsedToolCard({ toolName: "read", args: { path: "src/private.ts", offset: 10, limit: 5 }, result: output("1│secret source\n2│more secret", { lines: 2 }) }, [], theme, 80);
  assert.match(plain(read), /src\/private\.ts.*从第 10 行/);
  assert.match(plain(read), /2 行/);
  assert.doesNotMatch(plain(read), /secret source/);

  const coloredDiff = "\x1b[32m+3 -2\x1b[0m";
  const edit = collapsedToolCard({ toolName: "edit", args: { path: "src/file.ts", oldText: "secret", newText: "private" } }, [coloredDiff], theme, 80);
  assert.equal(edit[1], coloredDiff);
  assert.doesNotMatch(plain(edit), /secret|private/);

  const write = collapsedToolCard({ toolName: "write", args: { path: "out.txt", content: "secret source" }, result: output("done", { diff: { additions: 4, deletions: 1 } }) }, [], theme, 80);
  assert.match(plain(write), /out\.txt/);
  assert.match(plain(write), /\+4 -1/);
  assert.doesNotMatch(plain(write), /secret source/);

  const search = collapsedToolCard({ toolName: "grep", args: { pattern: "privateToken", path: "src" }, result: output("src/a.ts: const privateToken = 1\nsrc/b.ts: privateToken", { totalMatches: 2 }) }, [], theme, 80);
  assert.match(plain(search), /2 项结果/);
  assert.doesNotMatch(plain(search), /const privateToken =|src\/a\.ts:/);
});

test("ctx, web and discovery tools use safe generic summaries", () => {
  for (const toolName of ["ctx_search", "web_search", "source_check", "tool_search", "mcp__unknown__dangerous"]) {
    const lines = collapsedToolCard({ toolName, args: { query: "secret query", token: "secret-token", code: "raw source", pattern: "secret pattern" } }, [], theme, 80);
    const text = plain(lines);
    assert.match(text, /secret query/);
    assert.doesNotMatch(text, /secret-token|raw source|\{|token:/);
    assert.ok(lines.length <= 4);
  }
});

test("JSON parameters are never fallback text and errors stay useful and concise", () => {
  const fallback = collapsedToolCard({ toolName: "mcp__dynamic", args: { payload: { secret: "no" } } }, [], theme, 80);
  assert.doesNotMatch(plain(fallback), /secret|payload|\{/);
  const failure = collapsedToolCard({ toolName: "bash", args: { command: "npm test" }, result: { isError: true, content: [{ type: "text", text: '{"error":"private"}\nError: test failed' }] } }, [], theme, 80);
  assert.match(plain(failure), /执行失败.*Error: test failed/);
  assert.doesNotMatch(plain(failure), /\{"error"|private/);
});

test("then_run failure remains an error even when outer result reports success", () => {
  const lines = collapsedToolCard({ toolName: "write", args: { path: "file", content: "private" }, result: output("[then_run:failed]\nError: formatter rejected file") }, [], theme, 80);
  assert.match(plain(lines), /附加命令失败.*Error: formatter rejected file/);
  assert.doesNotMatch(plain(lines), /private/);
});

test("numeric savings are retained but static slogans are omitted", () => {
  const measured = collapsedToolCard({ toolName: "ctx_reduce", args: { reasoning: "Compact context" }, result: output("12,345 context tokens removed") }, [], theme, 80);
  assert.match(plain(measured), /12,345 context tokens removed/);
  const generic = collapsedToolCard({ toolName: "ctx_reduce", args: {}, result: output("Money saved · compacts only when projected savings are positive") }, [], theme, 80);
  assert.doesNotMatch(plain(generic), /Money saved/);
});

test("mutation ratio bar and all summaries respect narrow widths and CJK display width", () => {
  for (const width of [8, 20, 40, 80]) {
    const lines = collapsedToolCard({ toolName: "edit", args: { path: "非常长的路径/src/file.ts" } }, ["+9 -1 [━━━━━━━━]"], theme, width);
    assert.ok(lines.length <= 4);
    assert.ok(lines.every((line) => visibleWidth(line) <= width), `${width}: ${plain(lines)}`);
  }
});

test("background state needs confirmed result evidence and never infers from arguments", () => {
  assert.equal(backgroundToolStatus({ toolName: "teammate", args: { command: "sleep 9", task_id: "x" } }), undefined);
  assert.equal(backgroundToolStatus({ toolName: "teammate", args: {}, result: output("Task abc: started") }), "已派发");
  assert.equal(backgroundToolStatus({ toolName: "teammate", result: output("still running") }), "已派发");
  assert.equal(backgroundToolStatus({ toolName: "teammate", result: { isError: true, content: [{ type: "text", text: "Task abc: started" }] } }), undefined);
  assert.equal(backgroundToolStatus({ toolName: "bash", result: output("Task abc: started") }), undefined);
  // process reports its own lifecycle through structured details, not this heuristic.
  assert.equal(backgroundToolStatus({ toolName: "process", result: output("running") }), undefined);
});

test("process cards summarize each action from structured details", () => {
  const running = collapsedToolCard({
    toolName: "process",
    args: { action: "start", name: "dev-server", command: "pnpm dev" },
    result: output("Started", {
      action: "start",
      process: { id: "proc_ab12", name: "dev-server", pid: 4242, status: "running", exitCode: null },
      notify: { logMatches: [{ pattern: "ready" }] },
    }),
  }, [], theme, 100);
  assert.match(plain(running), /dev-server/);
  assert.match(plain(running), /pnpm dev/);
  assert.match(plain(running), /后台运行 · 1 个监视/);

  const exited = collapsedToolCard({
    toolName: "process",
    args: { action: "start", name: "build", command: "pnpm build" },
    result: output("Exited", {
      action: "start",
      process: { id: "proc_cd34", name: "build", status: "exited", exitCode: 0 },
      notify: {},
    }),
  }, [], theme, 100);
  assert.match(plain(exited), /退出码 0/);

  const list = collapsedToolCard({
    toolName: "process",
    args: { action: "list" },
    result: output("2 processes", {
      action: "list",
      counts: { running: 1, exited: 1, failed: 0, killed: 0, total: 2 },
    }),
  }, [], theme, 100);
  assert.match(plain(list), /进程列表/);
  assert.match(plain(list), /2 个进程 · 1 运行/);

  const stopped = collapsedToolCard({
    toolName: "process",
    args: { action: "stop", id: "proc_ab12" },
    result: output("Stopped", { action: "stop", result: { ok: true, info: { id: "proc_ab12" } } }),
  }, [], theme, 100);
  assert.match(plain(stopped), /已停止/);

  const written = collapsedToolCard({
    toolName: "process",
    args: { action: "write", id: "proc_ab12", input: "y\n", end: true },
    result: output("Wrote", { action: "write", bytes: 2, end: true, ok: true }),
  }, [], theme, 100);
  assert.match(plain(written), /写入 2 字节 · 关闭 stdin/);

  const cleared = collapsedToolCard({
    toolName: "process",
    args: { action: "clear" },
    result: output("Cleared", { action: "clear", cleared: 3 }),
  }, [], theme, 100);
  assert.match(plain(cleared), /清除 3 项/);
});
