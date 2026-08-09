export const TOOL_PRESENTATIONS = Object.freeze({
  read: { label: "read", emoji: "📖" },
  write: { label: "write", emoji: "📝" },
  edit: { label: "edit", emoji: "✏️" },
  replace: { label: "replace", emoji: "🔁" },
  grep: { label: "grep", emoji: "🔎" },
  find: { label: "find", emoji: "🗂️" },
  ls: { label: "list", emoji: "📂" },
  bash: { label: "shell", emoji: "💻" },
  preview_export: { label: "preview", emoji: "🖼️" },
  undo_last_replace: { label: "undo", emoji: "↩️" },
  multi_tool_use_parallel: { label: "parallel", emoji: "⚡" },

  ask_user_question: { label: "ask", emoji: "❓" },

  todo: { label: "tasks", emoji: "📋" },
  todowrite: { label: "tasks", emoji: "✅" },

  web_search: { label: "web", emoji: "🌐" },
  source_check: { label: "verify", emoji: "✅" },
  fetch_content: { label: "fetch", emoji: "📥" },
  get_search_content: { label: "sources", emoji: "📚" },

  ctx_search: { label: "recall", emoji: "🔭" },
  ctx_memory: { label: "memory", emoji: "🧠" },
  ctx_note: { label: "note", emoji: "🗒️" },
  ctx_expand: { label: "expand", emoji: "🔬" },
  ctx_reduce: { label: "reduce", emoji: "🗜️" },

  "push-task": { label: "task", emoji: "🧵" },

  bash_status: { label: "status", emoji: "📊" },
  bash_watch: { label: "watch", emoji: "👁️" },
  bash_write: { label: "input", emoji: "⌨️" },
  bash_kill: { label: "stop", emoji: "🛑" },

  load_tools: { label: "tools", emoji: "🧰" },
  semantic_code: { label: "semantic", emoji: "🧬" },

  aft_search: { label: "search", emoji: "🔎" },
  aft_outline: { label: "outline", emoji: "🧭" },
  aft_zoom: { label: "zoom", emoji: "🔬" },
  aft_inspect: { label: "health", emoji: "🩺" },
  aft_conflicts: { label: "conflict", emoji: "⚔️" },
  aft_import: { label: "imports", emoji: "📦" },
  aft_safety: { label: "safety", emoji: "🛡️" },
  aft_callgraph: { label: "calls", emoji: "🕸️" },
  aft_delete: { label: "delete", emoji: "🗑️" },
  aft_move: { label: "move", emoji: "🚚" },
  aft_refactor: { label: "refactor", emoji: "♻️" },
  ast_grep_search: { label: "ast find", emoji: "🌳" },
  ast_grep_replace: { label: "ast edit", emoji: "🌳" },
});

export function normalizeToolName(name) {
  const normalized = name.replace(/\./g, "_");
  return normalized.startsWith("functions_") ? normalized.slice("functions_".length) : normalized;
}

export function shortToolName(name) {
  const normalized = normalizeToolName(name);
  return TOOL_PRESENTATIONS[normalized]?.label
    ?? (normalized.replace(/^(?:ctx|aft)_/, "") || "tool");
}

export function toolEmoji(name) {
  return TOOL_PRESENTATIONS[normalizeToolName(name)]?.emoji ?? "🧩";
}


// Material Symbols Rounded codepoints. The terminal cannot select a font per
// emoji character, so this is an explicit fallback mode for terminals with
// Material Symbols installed: PI_TOOL_RAILS_ICON_STYLE=material.
const MATERIAL_ICONS = Object.freeze({
  read: 0xe873,
  write: 0xe161,
  edit: 0xe150,
  replace: 0xe627,
  grep: 0xe8b6,
  find: 0xe8b6,
  ls: 0xe2c7,
  bash: 0xeb8e,
  preview_export: 0xe3f4,
  undo_last_replace: 0xe28e,
  multi_tool_use_parallel: 0xe97a,
  ask_user_question: 0xe887,
  todo: 0xe2e6,
  todowrite: 0xe2e6,
  web_search: 0xe894,
  source_check: 0xe2e6,
  fetch_content: 0xe171,
  get_search_content: 0xe02f,
  ctx_search: 0xe8b6,
  ctx_memory: 0xe322,
  ctx_note: 0xe06f,
  ctx_expand: 0xe8b6,
  ctx_reduce: 0xe94d,
  "push-task": 0xe97a,
  bash_status: 0xe8b6,
  bash_watch: 0xe8b6,
  bash_write: 0xe150,
  bash_kill: 0xe047,
  load_tools: 0xe2e6,
  semantic_code: 0xead3,
  aft_search: 0xe8b6,
  aft_outline: 0xe97a,
  aft_zoom: 0xe8b6,
  aft_inspect: 0xe868,
  aft_conflicts: 0xe000,
  aft_import: 0xe2c7,
  aft_safety: 0xe002,
  aft_callgraph: 0xe97a,
  aft_delete: 0xe872,
  aft_move: 0xe2c7,
  aft_refactor: 0xe028,
  ast_grep_search: 0xe97a,
  ast_grep_replace: 0xe150,
});

const MATERIAL_FALLBACK = 0xe65f;
const iconStyle = (process.env.PI_TOOL_RAILS_ICON_STYLE || "emoji").trim().toLowerCase();

export function toolIcon(name) {
  const normalized = normalizeToolName(name);
  if (iconStyle === "material") {
    return String.fromCodePoint(MATERIAL_ICONS[normalized] ?? MATERIAL_FALLBACK);
  }
  if (iconStyle === "text") return "•";
  return toolEmoji(name);
}

export function materialToolIcon(name) {
  const normalized = normalizeToolName(name);
  return String.fromCodePoint(MATERIAL_ICONS[normalized] ?? MATERIAL_FALLBACK);
}
