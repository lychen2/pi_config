import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { initTheme, ToolExecutionComponent, BashExecutionComponent } from "@earendil-works/pi-coding-agent";
import { Text, visibleWidth } from "@earendil-works/pi-tui";
import labeledToolShell from "../compact-shell.ts";
import { TOOL_PRESENTATIONS } from "../tool-presentations.mjs";
import { measuredSavingsLine } from "../codemode-tree.ts";

const theme = { fg: (_color, text) => text, bg: (_color, text) => text, bold: text => text };
const plain = text => text.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "");
const toolResult = (text, extra = {}) => ({ content: [{ type: "text", text }], isError: false, ...extra });

function harness() {
  initTheme("dark");
  const hooks = new Map();
  labeledToolShell({ on: (event, handler) => hooks.set(event, handler) });
  hooks.get("session_start")({}, { mode: "tui", ui: { theme } });
  return {
    close: () => hooks.get("session_shutdown")(),
    make(name, args, result, renderResult) {
      const tool = {
        renderShell: "self",
        renderCall: () => new Text(`${name} ${JSON.stringify(args)}`, 0, 0),
        renderResult: renderResult ?? (() => new Text(result?.content?.map(block => block.text ?? "").join("\n") ?? "", 0, 0)),
      };
      const component = new ToolExecutionComponent(name, name, args, {}, tool, { requestRender() {} }, process.cwd());
      component.result = result;
      component.isPartial = !result;
      component.updateDisplay();
      return component;
    },
  };
}

test("multiline commands collapse to purpose and script summary; expanding preserves code", () => {
  const h = harness();
  try {
    const command = "npm --prefix extensions/pi-tool-rails test > /tmp/tests.log 2>&1 && npm run typecheck;\npython - <<'PY'\nimport re\np = open('/tmp/log').read()\nprint(p)\nPY";
    const component = h.make("bash", { command, reasoning: "运行测试与类型检查" }, toolResult("ℹ tests 108\nℹ pass 108\nℹ fail 0"));
    for (const width of [20, 40, 80, 120]) {
      const lines = component.render(width);
      const text = plain(lines.join("\n"));
      assert.ok(lines.length <= 6, text);
      assert.ok(lines.every(line => visibleWidth(line) <= width));
      assert.doesNotMatch(text, /import re|print\(p\)|<<|"command"|\/tmp\/tests/);
    }
    assert.match(plain(component.render(90).join("\n")), /运行测试与类型检查/);
    assert.match(plain(component.render(90).join("\n")), /108 通过/);
    component.setExpanded(true);
    assert.match(plain(component.render(120).join("\n")), /import re/);
  } finally { h.close(); }
});

test("background teammate cards are dispatched, not completed, and hide protocol text", () => {
  const h = harness();
  try {
    const args = { background: true, tasks: [{ name: "provider-099", goal: "修复新版模型配置类型", access: "edit", allowedPaths: ["src/"] }] };
    const protocol = "■ @provider-099 running in background.\ncorrelationId=fixture-id. The teammate-complete notification is delivered automatically when the work finishes.\nDo NOT poll. Completion durability enabled.";
    const component = h.make("teammate", args, toolResult(protocol));
    const text = plain(component.render(88).join("\n"));
    assert.match(text.split("\n")[0], /委派.*↗ 已派发/);
    assert.match(text, /provider-099.*修复新版模型配置类型/);
    assert.doesNotMatch(text, /"tasks"|background=true|allowedPaths|correlationId|notification|durability|Do NOT poll|✓ 完成/);
    assert.ok(component.render(88).length <= 6);
    component.setExpanded(true);
    assert.match(plain(component.render(120).join("\n")), /correlationId/);
  } finally { h.close(); }
});

test("read, discovery and unknown tools share a safe folded fallback", () => {
  const h = harness();
  try {
    for (const name of ["read", "search_skill_bm25", "ctx_search", "web_search", "mcp__future__custom"]) {
      const component = h.make(name, { path: "src/main.ts", query: "symbols", payload: { rawInternal: "hidden" } }, toolResult('{"data":"import source from implementation;","rawInternal":"hidden"}'));
      const text = plain(component.render(80).join("\n"));
      assert.ok(component.render(80).length <= 6, text);
      assert.doesNotMatch(text, /rawInternal|import source|"data"|"payload"|\{[^}]/);
      component.setExpanded(true);
      assert.match(plain(component.render(100).join("\n")), /rawInternal/);
    }
  } finally { h.close(); }
});

test("mutation bars survive and failed post-commands mark both header and summary", () => {
  const h = harness();
  try {
    const component = h.make("write", { path: "config.ts", content: "const x = 1;", then_run: { command: "npm test" } },
      toolResult("[then_run:failed]\nError: tests rejected config"), () => new Text("+9 -1 [━━━━━━━━]\nconst x = 1;", 0, 0));
    const text = plain(component.render(80).join("\n"));
    assert.match(text.split("\n")[0], /写入.*× 失败/);
    assert.match(text, /\+9 -1 \[━━━━━━━━\]/);
    assert.match(text, /附加命令失败.*tests rejected config/);
    assert.doesNotMatch(text, /const x =|"content"|then_run:/);
  } finally { h.close(); }
});

test("measured savings require a complete standalone report, not embedded source", () => {
  for (const report of ["12,345 context tokens removed", "3 tokens saved", "2.5 MiB saved", "Money saved · 4 KiB removed from future prompts"]) {
    assert.equal(measuredSavingsLine(report), report);
    assert.equal(measuredSavingsLine(`\x1b[32m${report}\x1b[0m`), report);
    assert.equal(measuredSavingsLine(`│ ${report} │`), report);
  }
  for (const source of [
    '{"value":"12,345 context tokens removed"}',
    'const measured = output("12,345 context tokens removed");',
    '"12,345 context tokens removed"',
    '12,345 context tokens removed; const hidden = 1;',
    'Money saved · compacts only when projected savings are positive',
  ]) assert.equal(measuredSavingsLine(source), undefined);
});

test("codemode keeps source containing savings strings folded, while preserving real reports", () => {
  const h = harness();
  try {
    const source = readFileSync(new URL("./tool-card-summary.test.mjs", import.meta.url), "utf8");
    const rows = Array.from({ length: 4 }, (_, i) => JSON.stringify({ i, status: "fulfilled", value: i === 2 ? source : "fixture result" }));
    const calls = rows.map((_, i) => ({ name: "read", args: JSON.stringify({ path: `fixture-${i}.ts` }), status: "ok", durationMs: 29 }));
    for (const report of ["", "\nMoney saved · 4 KiB removed from future prompts"]) {
      const component = h.make("codemode", { code: "await Promise.allSettled(tasks);" }, toolResult(
        `Script completed\nWall time 0.1 seconds\nOutput:\n${rows.join("\n")}${report}`, { details: { calls } }));
      for (const width of [42, 72, 100]) {
        const lines = component.render(width);
        const folded = plain(lines.join("\n"));
        assert.ok(!folded.includes('{"i":'), "folded codemode leaked a JSON result containing a savings test string");
        assert.ok(!folded.includes("const measured"), "folded codemode leaked test source");
        assert.ok(!folded.includes("12,345 context tokens removed"), "a test fixture was misreported as measured savings");
        assert.ok(lines.length <= 10, `folded codemode produced ${lines.length} lines`);
        assert.ok(lines.every(line => visibleWidth(line) <= width));
      }
      const folded = plain(component.render(100).join("\n"));
      assert.match(folded, /工具调用 4\/4 · 100ms/);
      assert.match(folded, /结果 · 4 份结果已返回 · 展开查看/);
      if (report) assert.match(folded, /4 KiB removed from future prompts/);
      component.setExpanded(true);
      assert.match(plain(component.render(120).join("\n")), /const measured/);
    }
  } finally { h.close(); }
});

test("read cards do not extract savings from source code or JSON string values", () => {
  const h = harness();
  try {
    for (const source of ['const measured = output("12,345 context tokens removed");', JSON.stringify({ value: "12,345 context tokens removed" })]) {
      const component = h.make("read", { path: "fixture.ts" }, toolResult(source));
      const folded = plain(component.render(100).join("\n"));
      assert.ok(!folded.includes("12,345"), "read card treated file contents as a savings report");
      component.setExpanded(true);
      assert.match(plain(component.render(120).join("\n")), /12,345 context tokens removed/);
    }
  } finally { h.close(); }
});

test("codemode uses the localized tool tree without JSON or SoL tags", () => {
  const h = harness();
  try {
    const plan = { steps: [{ goal: "检查调用记录", status: "in_progress" }, { goal: "美化卡片", status: "pending" }] };
    const component = h.make("codemode", { code: "await tools.read({path:'a.ts'}); await tools.update_plan(plan);" }, toolResult(
      'Script completed\nWall time 0.5 seconds\nOutput:\n<sol-pi-plan task_status="active">' + JSON.stringify(plan) + '</sol-pi-plan>', {
        details: { calls: [
          { id: "a", name: "read", args: JSON.stringify({ path: "/home/zonazcy/.pi/agent/skills/design-ui/SKILL.md", reasoning: "Read guide" }), status: "ok", durationMs: 12 },
          { id: "b", name: "update_plan", args: JSON.stringify(plan), status: "ok", durationMs: 4 },
        ] },
      }));
    const text = plain(component.render(96).join("\n"));
    assert.match(text, /🧵 工具编排/);
    assert.match(text, /├─ ✓ 读取.*design-ui\/SKILL.md/);
    assert.match(text, /└─ ✓ 计划.*检查调用记录/);
    assert.doesNotMatch(text, /CODEMODE|🧩|"path"|"steps"|<sol-pi-plan|tools\.read/);
  } finally { h.close(); }
});

test("every registered presentation uses the folded safety boundary", () => {
  const h = harness();
  try {
    for (const name of [...Object.keys(TOOL_PRESENTATIONS), "mcp__unregistered__future"]) {
      const component = h.make(name, { payload: { internalJson: "do not display" } }, toolResult('{"internalJson":"do not display","source":"const x = 1;"}'));
      const folded = plain(component.render(84).join("\n"));
      assert.doesNotMatch(folded, /internalJson|const x =|"payload"/, name);
      assert.ok(component.render(84).length <= 9, `${name}: ${folded}`);
    }
  } finally { h.close(); }
});

test("replayed tools without a registered renderer retain expanded evidence", () => {
  const h = harness();
  try {
    const component = new ToolExecutionComponent("old_missing_tool", "replay", { path: "fixture.ts" }, {}, undefined, { requestRender() {} }, process.cwd());
    component.result = toolResult("function preservedHistory() { return 42; }");
    component.isPartial = false;
    component.updateDisplay();
    assert.doesNotMatch(plain(component.render(80).join("\n")), /preservedHistory/);
    component.setExpanded(true);
    assert.match(plain(component.render(100).join("\n")), /preservedHistory/);
  } finally { h.close(); }
});

test("MCP tools share the native folded frame, metadata summary and expanded evidence", () => {
  const h = harness();
  try {
    const raw = JSON.stringify({ total_count: 12, items: [{ name: "private-source" }, {}, {}] });
    const result = toolResult(raw, { structuredContent: { content: [{ type: "text", text: raw }], structuredContent: { total_count: 12, items: [{}, {}, {}] } } });
    const component = h.make("mcp__github__search_code", { query: "render", payload: { hiddenArgument: true } }, result);
    const folded = plain(component.render(100).join("\n"));
    assert.match(folded.split("\n")[0], /GitHub · 搜索代码.*✓ 完成/);
    assert.match(folded, /render/);
    assert.match(folded, /返回 3 项 · 共 12 项/);
    assert.doesNotMatch(folded, /mcp__|private-source|total_count|hiddenArgument/);
    for (const width of [12, 20, 40, 80, 120]) {
      const lines = component.render(width);
      assert.ok(lines.every(line => visibleWidth(line) <= width), String(width));
      assert.ok(lines.length <= 6);
    }
    component.setExpanded(true);
    assert.match(plain(component.render(120).join("\n")), /private-source/);
  } finally { h.close(); }
});

test("MCP error envelopes mark the frame failed and keep JSON expanded only", () => {
  const h = harness();
  try {
    const raw = JSON.stringify({ error: { message: "Permission denied" }, diagnostic: "retained-evidence" });
    const component = h.make("mcp__github__get_file_contents", { owner: "octo", repo: "demo", path: "a.ts" },
      toolResult(raw, { structuredContent: { content: [{ type: "text", text: raw }], isError: true } }));
    const folded = plain(component.render(100).join("\n"));
    assert.match(folded.split("\n")[0], /GitHub · 读取文件.*× 失败/);
    assert.match(folded, /octo\/demo.*a\.ts/);
    assert.match(folded, /Permission denied/);
    assert.doesNotMatch(folded, /✓ 完成|retained-evidence|"error"/);
    component.setExpanded(true);
    assert.match(plain(component.render(120).join("\n")), /retained-evidence/);
  } finally { h.close(); }
});

test("MCP resources and calls inside codemode use the same localized presentation", () => {
  const h = harness();
  try {
    const resource = h.make("list_mcp_resources", { server: "catalog" }, toolResult("hidden JSON", { structuredContent: { resources: [{ uri: "resource://one" }] } }));
    const resourceText = plain(resource.render(90).join("\n"));
    assert.match(resourceText, /MCP资源/);
    assert.match(resourceText, /catalog/);
    assert.match(resourceText, /返回 1 项/);
    const component = h.make("codemode", { code: "await tools.mcp__blender__get_object_info({object_name:'Cube'});" }, toolResult("Script completed", {
      details: { calls: [{ name: "mcp__blender__get_object_info", args: JSON.stringify({ object_name: "Cube" }), status: "ok", durationMs: 15 }] },
    }));
    const folded = plain(component.render(100).join("\n"));
    assert.match(folded, /🧵 工具编排/);
    assert.match(folded, /Blender · 对象信息.*Cube.*15ms/);
    assert.doesNotMatch(folded, /mcp__|object_name|tools\./);
  } finally { h.close(); }
});

test("native MCP definitions and result conversion render through the shared shell", async () => {
  const { createMcpToolDefinition, convertMcpResult } = await import(new URL("./extensions/mcp/tools.js", import.meta.resolve("@earendil-works/pi-coding-agent")));
  const h = harness();
  try {
    const name = "mcp__github__search_code";
    const tool = createMcpToolDefinition({
      name, server: "github",
      tool: { name: "search_code", inputSchema: { type: "object", properties: { query: { type: "string" } } } },
      getClient: async () => { throw new Error("Rendering must not contact an MCP server"); },
    });
    for (const isError of [false, true]) {
      const payload = isError ? { error: { message: "Permission denied" } } : { total_count: 9, items: [{}, {}] };
      const result = await convertMcpResult("github", "search_code", {
        content: [{ type: "text", text: JSON.stringify(payload) }], structuredContent: payload, isError,
      });
      const component = new ToolExecutionComponent(name, "native-mcp", { query: "render" }, {}, tool, { requestRender() {} }, process.cwd());
      component.result = result;
      component.isPartial = false;
      component.updateDisplay();
      const folded = plain(component.render(90).join("\n"));
      assert.match(folded.split("\n")[0], /GitHub · 搜索代码/);
      assert.match(folded, isError ? /× 失败/ : /✓ 完成/);
      assert.match(folded, isError ? /Permission denied/ : /返回 2 项 · 共 9 项/);
      assert.doesNotMatch(folded, /mcp__|github\/search_code|total_count|"query"/);
      component.setExpanded(true);
      assert.match(plain(component.render(120).join("\n")), isError ? /"error"/ : /"total_count"/);
    }
  } finally { h.close(); }
});

test("manual Shell output has the same collapse boundary and preserves expanded details", () => {
  const h = harness();
  try {
    const component = new BashExecutionComponent("python - <<'PY'\nimport re\nprint('ok')\nPY", { requestRender() {} });
    component.appendOutput("ok\n");
    component.setComplete(0, false);
    const folded = plain(component.render(70).join("\n"));
    assert.match(folded, /批量脚本.*python/);
    assert.doesNotMatch(folded, /import re|print\(|<<|\bPY\b/);
    assert.ok(component.render(70).every(line => visibleWidth(line) <= 70));
    component.setExpanded(true);
    assert.match(plain(component.render(90).join("\n")), /import re/);
  } finally { h.close(); }
});
