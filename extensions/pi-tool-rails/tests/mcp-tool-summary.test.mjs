import assert from "node:assert/strict";
import test from "node:test";
import { visibleWidth } from "@earendil-works/pi-tui";
import { shortToolName, toolEmoji, materialToolIcon, parseMcpToolName } from "../tool-presentations.mjs";
import { mcpToolTarget, mcpResultSummary, mcpToolFailure } from "../mcp-tool-summary.ts";
import { collapsedToolCard, hasToolCardFailure } from "../tool-card-summary.ts";
import { codemodeCallTarget, renderCodemodeTree } from "../codemode-tree.ts";

const theme = { fg: (_color, value) => value };
const textResult = value => ({ content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value) }] });
const nativeResult = (payload, options = {}) => ({
  content: [{ type: "text", text: "provider-facing output was truncated" }],
  details: { server: "github", tool: "search_code" },
  structuredContent: { content: [], structuredContent: payload, ...options },
});

test("MCP names resolve through the shared presentation registry", () => {
  assert.deepEqual(parseMcpToolName("functions.mcp__obsidian_files__read_text_file"), { server: "obsidian_files", tool: "read_text_file" });
  assert.equal(parseMcpToolName("read"), undefined);
  assert.equal(parseMcpToolName("mcp__server__"), undefined);
  assert.equal(shortToolName("mcp__github__get_file_contents"), "GitHub · 读取文件");
  assert.equal(shortToolName("mcp__zotero__search"), "Zotero · 搜索");
  assert.equal(shortToolName("mcp__blender__execute_blender_code"), "Blender · 运行代码");
  assert.equal(toolEmoji("mcp__github__get_file_contents"), toolEmoji("read"));
  assert.equal(materialToolIcon("mcp__github__get_file_contents"), materialToolIcon("read"));
  assert.equal(shortToolName("mcp__new_server__custom_action"), "new server · custom action");
  assert.equal(toolEmoji("mcp__new_server__custom_action"), "🔌");
  assert.equal(shortToolName("mcp__constructor__constructor"), "constructor · constructor");
  assert.equal(toolEmoji("mcp__constructor__constructor"), "🔌");
  assert.equal(shortToolName("unknown_extension_tool"), "unknown_extension_tool");
  assert.equal(toolEmoji("unknown_extension_tool"), "🧩");
});

test("MCP targets expose repository, issue, path and operation without raw arguments", () => {
  assert.equal(mcpToolTarget("mcp__github__get_file_contents", { owner: "octo", repo: "demo", path: "src/main.ts", ref: "main" }), "octo/demo · src/main.ts · @main");
  assert.equal(mcpToolTarget("mcp__github__pull_request_read", { owner: "octo", repo: "demo", pullNumber: 17, method: "get_diff" }), "octo/demo · #17 · get_diff");
  assert.equal(mcpToolTarget("mcp__github__search_code", { owner: "octo", repo: "demo", query: "render" }), "octo/demo · render");
  assert.equal(mcpToolTarget("mcp__blender__get_object_info", { object_name: "Cube" }), "Cube");
  assert.equal(mcpToolTarget("mcp__zotero__get_item", { key: "ABCD1234" }), "ABCD1234");
  assert.equal(mcpToolTarget("mcp__obsidian_files__read_multiple_files", { paths: ["a.md", "b.md", "c.md"] }), "a.md · b.md · 共 3 项");
  assert.equal(mcpToolTarget("read", { path: "a.md" }), undefined);
});

test("MCP target metadata redacts credentials and URL query strings", () => {
  const target = mcpToolTarget("read_mcp_resource", { server: "catalog", uri: "https://alice:secret@example.test/file?token=private#key" });
  assert.equal(target, "catalog · https://example.test/file");
  const query = mcpToolTarget("mcp__future__search", { query: 'api_key="do-not-show" Bearer hidden-token' });
  assert.doesNotMatch(query, /do-not-show|hidden-token/);
  assert.match(query, /已隐藏/);
  assert.equal(mcpToolTarget("mcp__future__custom", { payload: { token: "secret" }, command: "echo hidden", code: "import bpy\nprint('hidden')" }), "2 行代码");
  assert.equal(mcpToolTarget("mcp__future__custom", { payload: { source: "do not show" } }), "");
});

test("collection summaries show observed counts, preserve zero, and distinguish totals", () => {
  assert.equal(mcpResultSummary("mcp__github__search_code", textResult({ total_count: 12, items: [{}, {}, {}] })), "返回 3 项 · 共 12 项");
  assert.equal(mcpResultSummary("mcp__github__search_code", nativeResult({ total_count: 0, items: [] })), "返回 0 项");
  assert.equal(mcpResultSummary("mcp__future__list", nativeResult([{}, {}])), "返回 2 项");
  assert.equal(mcpResultSummary("mcp__future__list", nativeResult({ total: 9, data: [{}, {}] })), "返回 2 项 · 共 9 项");
  assert.equal(mcpResultSummary("mcp__future__list", textResult({ count: -1, items: [{}] })), "返回 1 项");
});

test("native structured content wins over truncated provider-facing text", () => {
  assert.equal(mcpResultSummary("mcp__github__search_code", nativeResult({ total_count: 7, items: [{}, {}] })), "返回 2 项 · 共 7 项");
  assert.equal(mcpResultSummary("list_mcp_resources", { structuredContent: { server: "catalog", resources: [{ uri: "x" }] } }), "返回 1 项");
  assert.equal(mcpResultSummary("list_mcp_resource_templates", { structuredContent: { resourceTemplates: [] } }), "返回 0 项");
});

test("Zotero and Blender stringified result wrappers are unwrapped", () => {
  assert.equal(mcpResultSummary("mcp__zotero__search", nativeResult({ result: JSON.stringify({ count: 2, items: [{}, {}] }) })), "返回 2 项");
  assert.equal(mcpResultSummary("mcp__blender__get_scene_info", textResult({ result: JSON.stringify({ objects: [{ name: "Cube" }] }) })), "返回 1 项");
  assert.equal(mcpResultSummary("mcp__future__custom", nativeResult({ result: "plain text\nsecond line" })), "返回文本 · 2 行");
});

test("read results hide source code and encoded file bodies", () => {
  assert.equal(mcpResultSummary("mcp__obsidian_files__read_text_file", nativeResult({ content: "const secret = 1;\n\nexport default secret;" })), "返回文本 · 3 行");
  assert.equal(mcpResultSummary("mcp__github__get_file_contents", nativeResult({ type: "file", size: 120, encoding: "base64", content: "aGVsbG8=" })), "返回 120 B");
  assert.equal(mcpResultSummary("mcp__github__get_file_contents", nativeResult({ encoding: "base64", content: "aGVsbG8=" })), "返回文件内容 · Base64");
});

test("media, resources, empty results and malformed JSON have bounded fallbacks", () => {
  assert.equal(mcpResultSummary("mcp__blender__get_viewport_screenshot", { content: [{ type: "image", data: "hidden-base64" }] }), "1 张图片");
  assert.equal(mcpResultSummary("mcp__future__custom", { content: [] }), "调用完成 · 无返回内容");
  assert.equal(mcpResultSummary("mcp__future__custom", textResult('{"broken":')), "结构化结果 · 展开查看");
  assert.equal(mcpResultSummary("mcp__future__custom", textResult(`{"oversized":"${"x".repeat(140000)}"}`)), "结构化结果 · 展开查看");
  assert.equal(mcpResultSummary("mcp__future__custom", nativeResult({ payload: { source: "const hidden = 1;" } })), "结构化结果 · 展开查看");
  assert.equal(mcpResultSummary("read", textResult("hello")), undefined);
});

test("MCP error envelopes remain failures even when the outer wrapper loses isError", () => {
  const result = nativeResult({ error: { message: "Permission denied: token=do-not-show" } }, { isError: true });
  assert.equal(mcpToolFailure("mcp__github__get_file_contents", result), "Permission denied: token=[已隐藏]");
  assert.ok(hasToolCardFailure({ toolName: "mcp__github__get_file_contents", result }));
  assert.equal(mcpToolFailure("mcp__github__search_code", nativeResult({ count: 0, items: [] })), undefined);
  // A read may successfully report a failed remote job; that is not a failed tool call.
  assert.equal(mcpToolFailure("mcp__github__get_status", nativeResult({ status: "failure", success: false })), undefined);
  assert.equal(mcpResultSummary("mcp__github__get_status", nativeResult({ status: "failure", success: false })), "failure");
  assert.equal(mcpToolFailure("mcp__future__custom", { isError: true, ...textResult("Error: disconnected") }), "Error: disconnected");
  assert.equal(mcpToolFailure("mcp__future__custom", { isError: true, ...textResult("{malformed") }), "MCP 调用失败 · 展开查看");
});

test("folded MCP cards stay narrow and partial responses do not claim completion", () => {
  const execution = { toolName: "mcp__github__search_code", args: { query: "界面渲染".repeat(20) }, isPartial: false, result: nativeResult({ total_count: 7, items: [{}] }) };
  for (const width of [0, 1, 12, 20, 40, 80]) {
    const lines = collapsedToolCard(execution, ['{"raw":"hidden"}'], theme, width);
    assert.ok(lines.every(line => visibleWidth(line) <= width));
    assert.ok(lines.length <= 5);
    assert.doesNotMatch(lines.join("\n"), /raw|hidden|provider-facing/);
  }
  assert.match(collapsedToolCard({ ...execution, isPartial: true }, [], theme, 80).join("\n"), /执行中/);
});

test("codemode uses the same MCP labels and targets, including truncated arguments", () => {
  const calls = [
    { name: "mcp__github__get_file_contents", args: JSON.stringify({ owner: "octo", repo: "demo", path: "src/a.ts" }), status: "ok", durationMs: 12 },
    { name: "mcp__github__get_file_contents", args: '{"owner":"octo","repo":"demo","issue_number":17,"path":"src/b.ts","code":"truncated', status: "error", durationMs: 7 },
    { name: "mcp__blender__execute_blender_code", args: JSON.stringify({ code: "import bpy\nprint('hidden')" }), status: "ok", durationMs: 20 },
  ];
  assert.equal(codemodeCallTarget(calls[0]), "octo/demo · src/a.ts");
  assert.equal(codemodeCallTarget(calls[1]), "octo/demo · #17");
  assert.equal(codemodeCallTarget(calls[2]), "2 行代码");
  const output = renderCodemodeTree(calls, false, 100, theme).join("\n");
  assert.match(output, /GitHub · 读取文件.*octo\/demo.*12ms/);
  assert.match(output, /×.*GitHub · 读取文件.*#17/);
  assert.match(output, /Blender · 运行代码.*2 行代码/);
  assert.equal(output.match(/GitHub · 读取文件/g).length, 2);
  assert.doesNotMatch(output, /mcp__|import bpy|print\(|"owner"/);
});
