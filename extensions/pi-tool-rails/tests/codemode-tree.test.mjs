import assert from "node:assert/strict";
import test from "node:test";
import { visibleWidth } from "@earendil-works/pi-tui";
import { codemodeCallTarget, renderCodemodeTree, summarizeCodemodeOutput } from "../codemode-tree.ts";

const theme = { fg: (_color, value) => value };
const call = (name, args, status = "ok", extra = {}) => ({ name, args: typeof args === "string" ? args : JSON.stringify(args), status, ...extra });

test("shows safe targets instead of full JSON arguments, including truncated metadata", () => {
  const path = "/home/zonazcy/.pi/agent/skills/design-ui/SKILL.md";
  assert.equal(codemodeCallTarget(call("read", { path, reasoning: "inspect instructions", content: "do not show" })), "…/design-ui/SKILL.md");
  assert.equal(codemodeCallTarget(call("read", `{"path":"${path}","reason`)), "…/design-ui/SKILL.md");
  assert.equal(codemodeCallTarget(call("write", { content: "const secret = 1" })), "");
  const scriptTarget = codemodeCallTarget(call("bash", { command: "npm test && python - <<\"PY\"\nimport re\nprint(1)\nPY" }));
  assert.match(scriptTarget, /批量脚本.*npm.*python/);
  assert.doesNotMatch(scriptTarget, /import re|print\(|<<|\bPY\b/);
  assert.equal(codemodeCallTarget(call("read", { path: "safe\n\x1b[31mfile.ts" })), "safe file.ts");
  assert.equal(codemodeCallTarget(call("update_plan", { steps: [
    { goal: "Inspect tools", status: "completed" },
    { goal: "Build the tree", status: "in_progress" },
  ] })), "1/2 步完成 · Build the tree");
});

test("renders every small-call sibling, preserving repeated calls and actual order", () => {
  const calls = [call("read", { path: "a.ts" }), call("read", { path: "b.ts" }), call("grep", { pattern: "needle" })];
  const lines = renderCodemodeTree(calls, false, 72, theme);
  assert.equal(lines.length, 3);
  assert.match(lines[0], /^├─ ✓ 读取.*a.ts/);
  assert.match(lines[1], /^├─ ✓ 读取.*b.ts/);
  assert.match(lines[2], /^└─ ✓ 搜索.*needle/);
  assert.doesNotMatch(lines.join("\n"), /"path"|"pattern"|\{|\}/);
  assert.equal((lines.join("\n").match(/读取/g) ?? []).length, 2);
});

test("shows live, failed and cancelled nodes without inferring a call graph", () => {
  const calls = [
    call("read", { path: "a.ts" }, "running"),
    call("bash", { command: "npm test" }, "error", { error: "permission denied", durationMs: 44 }),
    call("grep", { pattern: "中文" }, "cancelled"),
  ];
  const text = renderCodemodeTree(calls, false, 80, theme).join("\n");
  assert.match(text, /├─ ◐ 读取/);
  assert.match(text, /├─ × 命令行.*permission denied/);
  assert.match(text, /└─ ⊘ 搜索/);
  assert.match(text, /44ms/);
  assert.doesNotMatch(text, /parallel|串行|并行/);
});

test("folds long trees while keeping active failures and expanding repeats", () => {
  const calls = Array.from({ length: 12 }, (_, i) => call("read", { path: `${i}.ts` }, i === 10 ? "error" : i === 11 ? "running" : "ok", i === 10 ? { error: "failed to read" } : {}));
  const folded = renderCodemodeTree(calls, false, 100, theme);
  assert.equal(folded.length, 6);
  assert.match(folded.join("\n"), /failed to read.*10.ts/);
  assert.match(folded.join("\n"), /◐ 读取.*11.ts/);
  assert.match(folded.at(-1), /另外 7 次.*读取×7/);
  const expanded = renderCodemodeTree(calls, true, 100, theme);
  assert.equal(expanded.filter(line => /^[├└]─/.test(line)).length, 12);
  assert.match(expanded.join("\n"), /读取 · read/);
});

test("bounds narrow and CJK rows while retaining measured duration", () => {
  const calls = [call("read", { path: "中文目录/非常长的文件名称.ts" }, "ok", { durationMs: 1200, cost: 0.0042 })];
  for (const width of [1, 8, 20, 40, 80]) {
    const lines = renderCodemodeTree(calls, false, width, theme);
    assert.ok(lines.every(line => visibleWidth(line) <= width), lines.join("\n"));
  }
  assert.match(renderCodemodeTree(calls, false, 80, theme).join("\n"), /1.2s.*\$0.0042/);
});

test("summarizes SoL plan markers, JSONL and code without transport syntax", () => {
  const plan = '<sol-pi-plan task_status="active">{"steps":[{"goal":"Inspect calls","status":"in_progress"},{"goal":"Test layout","status":"pending"}]}</sol-pi-plan>';
  assert.deepEqual(summarizeCodemodeOutput([plan]), ["计划 · 0/2 步完成 · Inspect calls"]);
  assert.deepEqual(summarizeCodemodeOutput(["<sol-pi-plan task_status=\"active\">{"]), ["计划已更新 · 展开查看"]);
  assert.deepEqual(summarizeCodemodeOutput([
    '{"i":0,"status":"fulfilled","value":"import a from b"}',
    '{"i":1,"status":"rejected","reason":"read failed"}',
  ]), ["2 份结果已返回 · 1 项失败 · 展开查看"]);
  for (const source of ["import { x } from 'y';", "const thing = {", "<xml>internal</xml>", '{"i":0,"value":']) {
    const summary = summarizeCodemodeOutput([source]).join("\n");
    assert.doesNotMatch(summary, /[{}<>]|import |const /);
    assert.match(summary, /展开查看/);
  }
  assert.deepEqual(summarizeCodemodeOutput(["108 tests passed"]), ["108 tests passed"]);
  assert.deepEqual(summarizeCodemodeOutput(["Script error:", "SyntaxError: invalid token"]), ["SyntaxError: invalid token"]);
});
