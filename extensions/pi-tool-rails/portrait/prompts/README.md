# Additional lamb hood tool poses

## Generate the sheet

1. Attach the original `image-97aee85a.png` to an image-generation service that accepts reference images.
2. Paste the complete [30-pose prompt](lamb-hood-tools-30.md).
3. Save the returned image as `lamb-hood-tools-30.png`.
4. Inspect the cell order, character continuity, and each pose at 128 × 128 pixels.

The reference is the user-supplied sheet documented in [the asset notes](../emotes/lamb-hood/README.md).
It supplies the character identity and visual style.
The new prompt supplies 30 additional activities in a six-column, five-row layout.
These cells are separate activities, not consecutive animation frames.

## Runtime scope

The runtime supports 17 original states and 20 selected tool states.
The `lamb-hood` set retains its 30 original animation frames and adds one static frame per selected state.
Enabled cells: 2, 6, 7, 9, 11–15, 17–23, 25, 27, 28, and 30.
Cells 1, 3, 4, 5, 8, 10, 16, 24, 26, and 29 remain unused.
Their tool behavior remains unchanged.

`src/tool-states.ts` owns tool routing and each new state's fallback for older image and ASCII sets.
`process` and `ctx_memory` select poses from their actual action arguments.
`codemode` selects `orchestrate`; nested tool execution events select the actual child activity.
UI prompts select `ask_user` and resume the preceding activity when they close.

See the [asset notes](../emotes/lamb-hood/README.md#selected-tool-poses) for source provenance and size normalization.

Do not import this sheet with the existing `draw-portrait --sheet` command.
Its fixed `FRAMES + NEW_FRAMES` order belongs to the original 30-frame set.
Importing this extension sheet there would assign the wrong poses to existing states.
The selected assets were processed separately to preserve the original frames and their animation masks.

## Proposed tool routing

These tables retain the complete 30-cell design.
Only the enabled cell numbers listed above have runtime mappings.
Rows follow the prompt order.

### Local inspection

| Cell | Proposed state | Candidate trigger |
| --- | --- | --- |
| 1 | `inspect_file` | `read`, `read_mcp_resource`, or a confirmed MCP file-read operation |
| 2 | `browse_files` | `ls`, `find`, `fffind`, or `list_mcp_resources` |
| 3 | `search_text` | `grep`, `ffgrep`, or `readSeek_grep` |
| 4 | `inspect_structure` | `code_outline` |
| 5 | `trace_reference` | `readSeek_refs` or `readSeek_def` |

### Local changes

| Cell | Proposed state | Candidate trigger |
| --- | --- | --- |
| 6 | `edit_patch` | `edit`, `replace`, or `readSeek_edit` |
| 7 | `create_file` | `write` or `readSeek_write` |
| 8 | `rename_item` | `readSeek_rename` |
| 9 | `undo_change` | `undo_last_replace` |
| 10 | `resolve_conflict` | `conflict` with `action: "resolve"` |

### Execution control

| Cell | Proposed state | Candidate trigger |
| --- | --- | --- |
| 11 | `run_command` | `bash`, `powershell`, or `process` with `action: "start"` |
| 12 | `monitor_task` | `process` with `action: "list"`, `"output"`, or `"update"` |
| 13 | `terminal_input` | `process` with `action: "write"` |
| 14 | `stop_process` | `process` with `action: "stop"` |
| 15 | `orchestrate` | `codemode` or `multi_tool_use.parallel` |

### Planning and collaboration

| Cell | Proposed state | Candidate trigger |
| --- | --- | --- |
| 16 | `plan_work` | `update_plan`, `todo`, or `plan_mode_complete` |
| 17 | `delegate_task` | `teammate` |
| 18 | `message_teammate` | `teammate_send` |
| 19 | `monitor_team` | `teammate_list` or `observe` |
| 20 | `ask_user` | `ask_user_question`, `plan_mode_question`, or `ui_prompt_start` |

### Research and tool selection

| Cell | Proposed state | Candidate trigger |
| --- | --- | --- |
| 21 | `search_web` | `web_search`, `browser`, or `agent_browser` |
| 22 | `fetch_content` | `fetch_content` |
| 23 | `verify_source` | `source_check` |
| 24 | `read_source` | `get_search_content` |
| 25 | `discover_tool` | `tool_search` or `search_tool_bm25` |

### Knowledge and presentation

| Cell | Proposed state | Candidate trigger |
| --- | --- | --- |
| 26 | `select_skill` | `search_skill_bm25` with `action: "search"` or `"load"` |
| 27 | `recall_context` | `ctx_search`, `ctx_expand`, `obs_recall`, or `ctx_memory` with `action: "get"` |
| 28 | `store_memory` | `ctx_memory` with `action: "write"`, `"update"`, or `"merge"` |
| 29 | `record_note` | `ctx_note` with `action: "write"` or `"update"` |
| 30 | `render_preview` | `preview_export` |

## Outcome semantics

`verify_source` shows an examination in progress; it does not assert that a claim is true.
`stop_process` shows a requested stop; it does not assert that the process has exited.
Likewise, memory, file, and note poses show actions before their results arrive.
Keep the existing `success`, `failure`, `error`, and `interrupted` states for their corresponding lifecycle results.
An unknown MCP operation can retain the generic `tool` state until its action is known.
