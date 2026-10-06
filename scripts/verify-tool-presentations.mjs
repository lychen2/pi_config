import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import {
  TOOL_PRESENTATIONS,
  normalizeToolName,
  shortToolName,
  toolEmoji,
} from "../extensions/pi-tool-rails/tool-presentations.mjs";

const EXPECTED_TOOL_NAMES = [
  "read",
  "write",
  "edit",
  "replace",
  "grep",
  "find",
  "ls",
  "bash",
  "preview_export",
  "undo_last_replace",
  "multi_tool_use.parallel",
  "codemode",
  "obs_recall",
  "update_plan",
  "teammate",
  "teammate-send",
  "teammate-list",
  "observe",
  "plan_mode_question",
  "plan_mode_complete",
  "search_tool_bm25",
  "tool_search",
  "search_skill_bm25",
  "code_outline",
  "powershell",
  "ask_user_question",
  "todo",
  "web_search",
  "agent_browser",
  "browser",
  "source_check",
  "fetch_content",
  "get_search_content",
  "ctx_search",
  "ctx_memory",
  "ctx_note",
  "ctx_expand",
  "ctx_reduce",
  "bash_status",
  "bash_watch",
  "bash_write",
  "bash_kill",
  "readSeek_edit",
  "readSeek_grep",
  "readSeek_search",
  "readSeek_refs",
  "readSeek_rename",
  "readSeek_write",
  "readSeek_def",
  "readSeek_digest",
  "readSeek_view",
  "fffind",
  "ffgrep",
  "bash_bg",
  "conflict",
  "list_mcp_resources",
  "list_mcp_resource_templates",
  "read_mcp_resource",
];

assert.equal(new Set(EXPECTED_TOOL_NAMES).size, EXPECTED_TOOL_NAMES.length, "expected tool list contains duplicates");
assert.equal(Object.keys(TOOL_PRESENTATIONS).length, EXPECTED_TOOL_NAMES.length, "registry and expected tool list differ in size");

for (const name of EXPECTED_TOOL_NAMES) {
  const normalized = normalizeToolName(name);
  const presentation = TOOL_PRESENTATIONS[normalized];
  assert.ok(presentation, `missing presentation for ${name}`);
  assert.match(presentation.label, /^\S+$/, `${name} label must not be empty or contain whitespace`);
  assert.ok(presentation.label.length <= 8, `${name} label exceeds the 8-character text budget`);
  assert.ok(presentation.emoji.trim(), `${name} has an empty emoji`);
  assert.notEqual(presentation.emoji, "🧩", `${name} is using the unknown-tool fallback`);
  assert.equal(shortToolName(name), presentation.label, `${name} alias does not resolve to its registry label`);
  assert.equal(toolEmoji(name), presentation.emoji, `${name} emoji does not resolve from the registry`);
}

assert.equal(normalizeToolName("functions.read"), "read");
assert.equal(shortToolName("functions.codemode"), "工具编排");
assert.equal(toolEmoji("codemode"), "🧵");
assert.equal(shortToolName("functions.teammate-send"), "协作消息");
assert.equal(shortToolName("unknown_extension_tool"), "unknown_extension_tool");
assert.equal(toolEmoji("unknown_extension_tool"), "🧩");
assert.equal(shortToolName("mcp__github__get_file_contents"), "GitHub · 读取文件");
assert.equal(toolEmoji("mcp__github__get_file_contents"), toolEmoji("read"));
assert.equal(shortToolName("mcp__new_server__custom_action"), "new server · custom action");
assert.equal(toolEmoji("mcp__new_server__custom_action"), "🔌");

const packageRoot = new URL("../extensions/pi-tool-rails/", import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("package.json", packageRoot), "utf8"));
for (const file of ["visual-style.ts", "user-message.ts", "compact-shell.ts", "tool-card-summary.ts", "mcp-tool-summary.ts", "codemode-tree.ts", "portrait-dashboard.ts", "dashboard-state.ts", "portrait"]) {
  assert.ok(manifest.files.includes(file), `rendering module missing from package files: ${file}`);
  assert.ok(existsSync(new URL(file, packageRoot)), `packaged rendering module does not exist: ${file}`);
}

console.log(`Tool presentation verification passed (${EXPECTED_TOOL_NAMES.length} tools).`);
