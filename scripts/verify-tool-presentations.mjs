import assert from "node:assert/strict";
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
  "ask_user_question",
  "todo",
  "todowrite",
  "web_search",
  "source_check",
  "fetch_content",
  "get_search_content",
  "ctx_search",
  "ctx_memory",
  "ctx_note",
  "ctx_expand",
  "ctx_reduce",
  "push-task",
  "bash_status",
  "bash_watch",
  "bash_write",
  "bash_kill",
  "load_tools",
  "semantic_code",
  "aft_search",
  "aft_outline",
  "aft_zoom",
  "aft_inspect",
  "aft_conflicts",
  "aft_import",
  "aft_safety",
  "aft_callgraph",
  "aft_delete",
  "aft_move",
  "aft_refactor",
  "ast_grep_search",
  "ast_grep_replace",
];

assert.equal(new Set(EXPECTED_TOOL_NAMES).size, EXPECTED_TOOL_NAMES.length, "expected tool list contains duplicates");
assert.equal(Object.keys(TOOL_PRESENTATIONS).length, EXPECTED_TOOL_NAMES.length, "registry and expected tool list differ in size");

for (const name of EXPECTED_TOOL_NAMES) {
  const normalized = normalizeToolName(name);
  const presentation = TOOL_PRESENTATIONS[normalized];
  assert.ok(presentation, `missing presentation for ${name}`);
  assert.match(presentation.label, /^[\x20-\x7e]+$/, `${name} label must stay terminal-safe ASCII`);
  assert.ok(presentation.label.length <= 8, `${name} label exceeds the 8-column text budget`);
  assert.ok(presentation.emoji.trim(), `${name} has an empty emoji`);
  assert.notEqual(presentation.emoji, "🧩", `${name} is using the unknown-tool fallback`);
  assert.equal(shortToolName(name), presentation.label, `${name} alias does not resolve to its registry label`);
  assert.equal(toolEmoji(name), presentation.emoji, `${name} emoji does not resolve from the registry`);
}

assert.equal(normalizeToolName("functions.read"), "read");
assert.equal(shortToolName("unknown_extension_tool"), "unknown_extension_tool");
assert.equal(toolEmoji("unknown_extension_tool"), "🧩");

console.log(`Tool presentation verification passed (${EXPECTED_TOOL_NAMES.length} tools).`);
