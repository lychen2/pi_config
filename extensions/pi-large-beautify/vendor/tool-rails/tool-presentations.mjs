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

  readSeek_edit: { label: "edit", emoji: "✏️" },
  readSeek_grep: { label: "grep", emoji: "🔎" },
  readSeek_search: { label: "search", emoji: "🌳" },
  readSeek_refs: { label: "refs", emoji: "🕸️" },
  readSeek_rename: { label: "rename", emoji: "♻️" },
  readSeek_write: { label: "write", emoji: "📝" },
  readSeek_def: { label: "def", emoji: "🧭" },
  readSeek_digest: { label: "digest", emoji: "🩺" },
  readSeek_view: { label: "view", emoji: "🔬" },
  fffind: { label: "files", emoji: "🗂️" },
  ffgrep: { label: "literal", emoji: "🔎" },
  bash_bg: { label: "bg shell", emoji: "💻" },
  conflict: { label: "conflict", emoji: "⚔️" },
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
  readSeek_edit: 0xe150,
  readSeek_grep: 0xe8b6,
  readSeek_search: 0xe97a,
  readSeek_refs: 0xe97a,
  readSeek_rename: 0xe028,
  readSeek_write: 0xe161,
  readSeek_def: 0xe2c7,
  readSeek_digest: 0xe868,
  readSeek_view: 0xe8b6,
  fffind: 0xe8b6,
  ffgrep: 0xe8b6,
  bash_bg: 0xeb8e,
  conflict: 0xe000,
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
