export const TOOL_PRESENTATIONS = Object.freeze({
  read: { label: "读取", emoji: "📖" },
  write: { label: "写入", emoji: "📝" },
  edit: { label: "编辑", emoji: "✏️" },
  replace: { label: "替换", emoji: "🔁" },
  grep: { label: "搜索", emoji: "🔎" },
  find: { label: "查找", emoji: "🗂️" },
  ls: { label: "列表", emoji: "📂" },
  bash: { label: "命令行", emoji: "💻" },
  preview_export: { label: "预览", emoji: "🖼️" },
  undo_last_replace: { label: "撤销", emoji: "↩️" },
  multi_tool_use_parallel: { label: "并行", emoji: "⚡" },

  ask_user_question: { label: "提问", emoji: "❓" },

  todo: { label: "任务", emoji: "📋" },

  web_search: { label: "联网", emoji: "🌐" },
  agent_browser: { label: "浏览器", emoji: "🌐" },
  browser: { label: "浏览器", emoji: "🌐" },
  source_check: { label: "验证", emoji: "✅" },
  fetch_content: { label: "获取", emoji: "📥" },
  get_search_content: { label: "来源", emoji: "📚" },

  ctx_search: { label: "回溯", emoji: "🔭" },
  ctx_memory: { label: "记忆", emoji: "🧠" },
  ctx_note: { label: "记录", emoji: "🗒️" },
  ctx_expand: { label: "展开", emoji: "🔬" },
  ctx_reduce: { label: "压缩", emoji: "🗜️" },

  bash_status: { label: "状态", emoji: "📊" },
  bash_watch: { label: "监视", emoji: "👁️" },
  bash_write: { label: "输入", emoji: "⌨️" },
  bash_kill: { label: "停止", emoji: "🛑" },

  readSeek_edit: { label: "编辑", emoji: "✏️" },
  readSeek_grep: { label: "搜索", emoji: "🔎" },
  readSeek_search: { label: "检索", emoji: "🌳" },
  readSeek_refs: { label: "引用", emoji: "🕸️" },
  readSeek_rename: { label: "重命名", emoji: "♻️" },
  readSeek_write: { label: "写入", emoji: "📝" },
  readSeek_def: { label: "定义", emoji: "🧭" },
  readSeek_digest: { label: "摘要", emoji: "🩺" },
  readSeek_view: { label: "查看", emoji: "🔬" },
  fffind: { label: "文件", emoji: "🗂️" },
  ffgrep: { label: "文本", emoji: "🔎" },
  bash_bg: { label: "后台命令", emoji: "💻" },
  conflict: { label: "冲突", emoji: "⚔️" },
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
  agent_browser: 0xe894,
  browser: 0xe894,
  source_check: 0xe2e6,
  fetch_content: 0xe171,
  get_search_content: 0xe02f,
  ctx_search: 0xe8b6,
  ctx_memory: 0xe322,
  ctx_note: 0xe06f,
  ctx_expand: 0xe8b6,
  ctx_reduce: 0xe94d,
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
