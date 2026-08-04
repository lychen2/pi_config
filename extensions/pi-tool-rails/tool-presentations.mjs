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

  ffgrep: { label: "ff grep", emoji: "🔍" },
  fffind: { label: "ff find", emoji: "🧭" },
  ask_user_question: { label: "ask", emoji: "❓" },

  todo: { label: "tasks", emoji: "📋" },
  todowrite: { label: "tasks", emoji: "✅" },
  workflow_dag: { label: "workflow", emoji: "🔀" },

  web_search: { label: "web", emoji: "🌐" },
  source_check: { label: "verify", emoji: "✅" },
  fetch_content: { label: "fetch", emoji: "📥" },
  get_search_content: { label: "sources", emoji: "📚" },

  ctx_search: { label: "recall", emoji: "🔭" },
  ctx_memory: { label: "memory", emoji: "🧠" },
  ctx_note: { label: "note", emoji: "🗒️" },
  ctx_expand: { label: "expand", emoji: "🔬" },
  ctx_reduce: { label: "reduce", emoji: "🗜️" },

  subagent: { label: "agent", emoji: "🧑‍💻" },
  subagent_spawn: { label: "spawn", emoji: "🚀" },
  subagent_send: { label: "send", emoji: "📨" },
  subagent_manage: { label: "manage", emoji: "🎛️" },
  subagent_mailbox: { label: "mailbox", emoji: "📬" },
  subagent_inspect: { label: "agents", emoji: "👥" },
  subagent_consult: { label: "consult", emoji: "💬" },

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
    ?? (normalized.replace(/^(?:ctx|subagent|aft)_/, "") || "tool");
}

export function toolEmoji(name) {
  return TOOL_PRESENTATIONS[normalizeToolName(name)]?.emoji ?? "🧩";
}
