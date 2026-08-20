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
  "push-task",
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
assert.equal(shortToolName("unknown_extension_tool"), "unknown_extension_tool");
assert.equal(toolEmoji("unknown_extension_tool"), "🧩");

console.log(`Tool presentation verification passed (${EXPECTED_TOOL_NAMES.length} tools).`);
