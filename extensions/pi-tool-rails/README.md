# pi-tool-rails

Quiet TUI styling for Pi:

- a fixed-width tool column with compact emoji labels; emoji sits immediately left of centered text
- a verified registry of compact labels and purpose-specific emoji for 52 known compatibility and optional tool names
- a theme `text` separator with full-block pending, success, and error backgrounds from the active Pi theme
- reason-first built-in tool calls that show `goal → concrete target` on one line and a useful result on the next
- collapsed third-party output limited to two useful lines, with placeholder-only `...` lines omitted; `Ctrl+O` still reveals the complete renderer output
- short, icon-specific labels for known core, Web, context, subagent, workflow, AFT, and AST tool names instead of truncated raw identifiers; the registry is broader than the current active tool surface
- structured output colors for headings, success, active, pending, error, and task identifiers
- numbered `read` views that show source line numbers in the TUI while preserving hash anchors for the model
- numbered, side-by-side `replace` and AFT `edit` diffs with old lines on the left, new lines on the right, multiple change groups, and shared indentation removed from each visible hunk
- renders AFT `edit` as `+N/-N · N edits` when collapsed and with the same split diff as `replace` when expanded
- one blank line between tool blocks
- a persistent framed `prompt` editor and framed user messages
Tool ownership is conservative. The extension overrides a built-in only while Pi still owns it, and it never registers `find` or `ls`; those remain under Pi or another search owner. AFT `edit` keeps its native call renderer. Its collapsed result is a stable structured count parsed from metadata or the textual `Edited (+N/-N, N edits)` fallback, while its expanded result reuses the split `replace` renderer. Guarded presentation bridges apply the common label column and result formatting at the exported `ToolExecutionComponent` layer. Hashline `read` results are converted from `HASH│content` to `line │ content` only in the TUI renderer; the tool result sent to the model retains its anchors. Diff markers and gutters remain aligned while shared code indentation is removed per visible hunk and relative indentation is retained.

## Tool labels

`tool-presentations.mjs` is the single runtime registry. It verifies 52 known names, including compatibility and optional entries; it does not claim that all 52 are active. Every text label stays within the rail's eight-column text budget; an unknown third-party tool uses `🧩` until it is added explicitly.

| Group | Display labels | Tool identifiers |
| --- | --- | --- |
| Files and shell | `📖 read`, `📝 write`, `✏️ edit`, `🔁 replace`, `🔎 grep`, `🗂️ find`, `📂 list`, `💻 shell` | `read`, `write`, `edit`, `replace`, `grep`, `find`, `ls`, `bash` |
| Preview and orchestration | `🖼️ preview`, `↩️ undo`, `⚡ parallel` | `preview_export`, `undo_last_replace`, `multi_tool_use.parallel` |
| Fast search and questions | `🔍 ff grep`, `🧭 ff find`, `❓ ask` | `ffgrep`, `fffind`, `ask_user_question` |
| Tasks | `📋 tasks`, `✅ tasks`, `🔀 workflow` | `todo`, `todowrite`, `workflow_dag` |
| Web | `🌐 web`, `✅ verify`, `📥 fetch`, `📚 sources` | `web_search`, `source_check`, `fetch_content`, `get_search_content` |
| Context | `🔭 recall`, `🧠 memory`, `🗒️ note`, `🔬 expand`, `🗜️ reduce` | `ctx_search`, `ctx_memory`, `ctx_note`, `ctx_expand`, `ctx_reduce` |
| Subagents | `🧑‍💻 agent`, `🚀 spawn`, `📨 send`, `🎛️ manage`, `📬 mailbox`, `👥 agents`, `💬 consult` | `subagent` and `subagent_*` |
| Background shell | `📊 status`, `👁️ watch`, `⌨️ input`, `🛑 stop` | `bash_status`, `bash_watch`, `bash_write`, `bash_kill` |
| Deferred | `🧰 tools`, `🧬 semantic` | `load_tools`, `semantic_code` |
| AFT and AST | `🔎 search`, `🧭 outline`, `🔬 zoom`, `🩺 health`, `⚔️ conflict`, `📦 imports`, `🛡️ safety`, `🕸️ calls`, `🗑️ delete`, `🚚 move`, `♻️ refactor`, `🌳 ast find/edit` | `aft_*`, `ast_grep_*` |

## Install

```bash
pi install ./extensions/pi-tool-rails
node scripts/verify-tool-presentations.mjs
```

Pi exposes editor replacement but not middleware around every later replacement. To keep the prompt frame when Pi or another extension rebuilds the editor, the prompt entry point installs a guarded `setEditorComponent` wrapper. It composes any supplied `EditorComponent`, removes stale wrappers on reload, and restores the setter on shutdown.

Pi also lacks public renderer hooks for the common shell and user-message presentation used here. Those compatibility patches are guarded, reference-counted, and restore the original methods on shutdown. Set `PI_TOOL_RAILS_DISABLE_USER_FRAME=1` to disable only the user-message patch.

## Development

```bash
npm install
npm test
npm run typecheck
npm pack --dry-run
cd ../..
node scripts/verify-tool-presentations.mjs
```
