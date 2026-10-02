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
  codemode: { label: "工具编排", emoji: "🧵" },
  obs_recall: { label: "回读", emoji: "📑" },
  update_plan: { label: "计划", emoji: "📋" },
  teammate: { label: "委派", emoji: "👥" },
  teammate_send: { label: "协作消息", emoji: "💬" },
  teammate_list: { label: "协作列表", emoji: "👥" },
  observe: { label: "进度", emoji: "📡" },
  plan_mode_question: { label: "计划提问", emoji: "❓" },
  plan_mode_complete: { label: "计划完成", emoji: "📋" },
  search_tool_bm25: { label: "找工具", emoji: "🧰" },
  tool_search: { label: "找工具", emoji: "🧰" },
  search_skill_bm25: { label: "找技能", emoji: "📚" },
  code_outline: { label: "代码结构", emoji: "🗂️" },
  powershell: { label: "命令行", emoji: "💻" },

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
  list_mcp_resources: { label: "MCP资源", emoji: "📁" },
  list_mcp_resource_templates: { label: "MCP资源模板", emoji: "📁" },
  read_mcp_resource: { label: "读取MCP资源", emoji: "📖" },
});

export function normalizeToolName(name) {
  const normalized = name.replace(/[.\-]/g, "_");
  return normalized.startsWith("functions_") ? normalized.slice("functions_".length) : normalized;
}

export function parseMcpToolName(name) {
  const match = /^mcp__([a-zA-Z0-9_]+?)__([a-zA-Z0-9_]+)$/.exec(normalizeToolName(name));
  return match ? { server: match[1], tool: match[2] } : undefined;
}

const MCP_SERVERS = Object.freeze({
  __proto__: null,
  github: "GitHub", obsidian_files: "Obsidian", obsidian: "Obsidian", zotero: "Zotero", blender: "Blender",
});
const MCP_OPERATIONS = Object.freeze({
  __proto__: null,
  get_file_contents: ["读取文件", "read"],
  read_file: ["读取文件", "read"],
  read_text_file: ["读取文件", "read"],
  read_multiple_files: ["批量读取", "read"],
  read_media_file: ["读取媒体", "read"],
  get_file_info: ["文件信息", "read"],
  list_directory: ["列出目录", "ls"],
  list_directory_with_sizes: ["列出目录", "ls"],
  directory_tree: ["目录树", "ls"],
  list_allowed_directories: ["可访问目录", "ls"],
  search_files: ["查找文件", "find"],
  search_code: ["搜索代码", "grep"],
  search_issues: ["搜索 Issue", "grep"],
  search_pull_requests: ["搜索 PR", "grep"],
  search_repositories: ["搜索仓库", "grep"],
  issue_read: ["读取 Issue", "read"],
  pull_request_read: ["读取 PR", "read"],
  get_item: ["读取条目", "read"],
  get_children: ["附件与笔记", "read"],
  get_fulltext: ["读取全文", "read"],
  search_semantic_scholar: ["论文检索", "grep"],
  get_scene_info: ["场景信息", "read"],
  get_object_info: ["对象信息", "read"],
  get_viewport_screenshot: ["视口截图", "preview_export"],
  execute_blender_code: ["运行代码", "bash"],
  describe_node_type: ["节点信息", "read"],
  bpy_api_lookup: ["查询 API", "read"],
  export_scene: ["导出场景", "preview_export"],
});
const MCP_ACTIONS = Object.freeze({
  __proto__: null,
  get: ["读取", "read"], read: ["读取", "read"], fetch: ["获取", "fetch_content"],
  describe: ["查看", "read"], inspect: ["查看", "read"], lookup: ["查询", "read"],
  search: ["搜索", "grep"], find: ["查找", "find"], list: ["列出", "ls"],
  create: ["创建", "write"], write: ["写入", "write"], add: ["添加", "write"],
  update: ["更新", "edit"], edit: ["编辑", "edit"], set: ["设置", "edit"],
  delete: ["删除", "edit"], remove: ["移除", "edit"], execute: ["执行", "bash"],
  run: ["运行", "bash"], generate: ["生成", "write"], download: ["下载", "fetch_content"],
  import: ["导入", "write"], export: ["导出", "preview_export"], check: ["检查", "source_check"],
  poll: ["查询进度", "bash_status"],
});

function mcpPresentation(name) {
  const parsed = parseMcpToolName(name);
  if (!parsed) return undefined;
  const server = MCP_SERVERS[parsed.server] ?? parsed.server.replace(/_/g, " ");
  let operation = MCP_OPERATIONS[parsed.tool];
  if (!operation) {
    const [verb, ...rest] = parsed.tool.split("_");
    const action = MCP_ACTIONS[verb];
    operation = action ? [`${action[0]}${rest.length ? ` ${rest.join(" ")}` : ""}`, action[1]]
      : [parsed.tool.replace(/_/g, " "), undefined];
  }
  return { label: `${server} · ${operation[0]}`, iconKey: operation[1] };
}

export function shortToolName(name) {
  const normalized = normalizeToolName(name);
  return TOOL_PRESENTATIONS[normalized]?.label ?? mcpPresentation(normalized)?.label
    ?? (normalized.replace(/^(?:ctx|aft)_/, "") || "tool");
}

export function toolEmoji(name) {
  const normalized = normalizeToolName(name);
  const mcp = mcpPresentation(normalized);
  return TOOL_PRESENTATIONS[normalized]?.emoji
    ?? (mcp ? TOOL_PRESENTATIONS[mcp.iconKey]?.emoji ?? "🔌" : "🧩");
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
  codemode: 0xe97a,
  obs_recall: 0xe02f,
  update_plan: 0xe2e6,
  teammate: 0xe7ef,
  teammate_send: 0xe0b7,
  teammate_list: 0xe7ef,
  observe: 0xe8b6,
  search_tool_bm25: 0xe8b6,
  tool_search: 0xe8b6,
  search_skill_bm25: 0xe02f,
  code_outline: 0xe873,
  powershell: 0xeb8e,
  plan_mode_question: 0xe887,
  plan_mode_complete: 0xe2e6,
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
  list_mcp_resources: 0xe2c7,
  list_mcp_resource_templates: 0xe2c7,
  read_mcp_resource: 0xe873,
});

const MATERIAL_FALLBACK = 0xe65f;
const iconStyle = (process.env.PI_TOOL_RAILS_ICON_STYLE || "emoji").trim().toLowerCase();

export function toolIcon(name) {
  if (iconStyle === "material") return materialToolIcon(name);
  if (iconStyle === "text") return "•";
  return toolEmoji(name);
}

export function materialToolIcon(name) {
  const normalized = normalizeToolName(name);
  const mcp = mcpPresentation(normalized);
  return String.fromCodePoint(MATERIAL_ICONS[normalized] ?? MATERIAL_ICONS[mcp?.iconKey] ?? MATERIAL_FALLBACK);
}
