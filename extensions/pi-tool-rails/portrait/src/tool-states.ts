import { normalizeToolName } from "../../tool-presentations.mjs";
import type { BaseEmoteState, EmoteState } from "./types.ts";

/** Selected tool poses fall back to an existing activity in older sets. */
export const TOOL_STATE_FALLBACK = {
  browse_files: "read",
  edit_patch: "write",
  create_file: "write",
  undo_change: "write",
  run_command: "bash",
  monitor_task: "bash",
  terminal_input: "bash",
  stop_process: "bash",
  orchestrate: "tool",
  delegate_task: "tool",
  message_teammate: "tool",
  monitor_team: "tool",
  ask_user: "wait",
  search_web: "search",
  fetch_content: "search",
  verify_source: "search",
  discover_tool: "tool",
  recall_context: "read",
  store_memory: "write",
  render_preview: "tool",
} as const satisfies Record<string, BaseEmoteState>;

export type ToolEmoteState = keyof typeof TOOL_STATE_FALLBACK;
export const TOOL_STATES = Object.keys(TOOL_STATE_FALLBACK) as ToolEmoteState[];

const TOOL_POSES = new Map<string, EmoteState>([
  ...["ls", "find", "fffind", "list_mcp_resources", "list_mcp_resource_templates"].map(name => [name, "browse_files"] as const),
  ...["edit", "replace", "readSeek_edit"].map(name => [name, "edit_patch"] as const),
  ...["write", "readSeek_write"].map(name => [name, "create_file"] as const),
  ["undo_last_replace", "undo_change"],
  ...["bash", "powershell"].map(name => [name, "run_command"] as const),
  ...["bash_status", "bash_watch"].map(name => [name, "monitor_task"] as const),
  ["bash_write", "terminal_input"],
  ["bash_kill", "stop_process"],
  ...["codemode", "multi_tool_use_parallel"].map(name => [name, "orchestrate"] as const),
  ["teammate", "delegate_task"],
  ["teammate_send", "message_teammate"],
  ...["teammate_list", "observe"].map(name => [name, "monitor_team"] as const),
  ...["ask_user_question", "plan_mode_question"].map(name => [name, "ask_user"] as const),
  ...["web_search", "browser", "agent_browser"].map(name => [name, "search_web"] as const),
  ["fetch_content", "fetch_content"],
  ["source_check", "verify_source"],
  ...["tool_search", "search_tool_bm25"].map(name => [name, "discover_tool"] as const),
  ...["ctx_search", "ctx_expand", "obs_recall"].map(name => [name, "recall_context"] as const),
  ["preview_export", "render_preview"],
]);

/** Args arrive with execution_start; streamed tool names may precede them. */
export function toolNameToState(toolName: string, args?: { action?: string }): EmoteState {
  const name = normalizeToolName(toolName);
  if (name === "bash_bg") {
    switch (args?.action) {
      case "run":
      case "start": return "run_command";
      case "status":
      case "wait":
      case "list": return "monitor_task";
      case "kill": return "stop_process";
      default: return "bash";
    }
  }
  if (name === "ctx_memory") {
    switch (args?.action) {
      case "get": return "recall_context";
      case "write":
      case "update":
      case "merge": return "store_memory";
      default: return "tool";
    }
  }
  const pose = TOOL_POSES.get(name);
  if (pose) return pose;
  if (name === "read") return "read";
  if (/search|web|fetch|browse|scrape|crawl/i.test(name)) return "search";
  return "tool";
}
