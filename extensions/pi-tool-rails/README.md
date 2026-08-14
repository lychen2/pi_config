# pi-tool-rails

Quiet TUI styling for Pi:

- a fixed-width tool column with compact emoji labels; emoji sits immediately left of centered text, with explicit Material Symbols Rounded glyphs available via `PI_TOOL_RAILS_ICON_STYLE=material`
- a verified registry of compact labels and purpose-specific emoji for 40 known compatibility and optional tool names
- a theme `text` separator with full-block pending, success, and error backgrounds from the active Pi theme
- reason-first built-in tool calls that show `goal → concrete target` on one line and a useful result on the next
- collapsed generic third-party output limited to two semantic lines, while task tools keep their own bounded task rows; `Ctrl+O` still reveals complete renderer detail
- short, icon-specific labels for known core, Readseek, FFF, Web, context, and task tool names instead of truncated raw identifiers; the registry is broader than the current active tool surface
- structured output colors for headings, success, active, pending, error, and task identifiers
- numbered `read` views that show source line numbers in the TUI while preserving hash anchors for the model
- numbered, side-by-side `replace` diffs with old lines on the left, new lines on the right, multiple change groups, and shared indentation removed from each visible hunk
- one blank line between tool blocks
- a persistent framed `prompt` editor and reference-style framed user messages with Markdown re-rendering and a `💬` rail marker
- a native-compatible `✦ Thought` fold with a tree preview on `Ctrl+T` expansion, plus a theme-colored animated working HUD
- cached settled tool rows so the working HUD does not repeatedly re-render completed tool output
Tool ownership is conservative. The extension presents registered tools but does not claim `find` or `ls`; those remain under Pi or another search owner. Guarded presentation bridges apply the common label column and result formatting at the exported `ToolExecutionComponent` layer. Diff markers and gutters remain aligned while shared code indentation is removed per visible hunk and relative indentation is retained.

## Tool labels

`tool-presentations.mjs` is the single runtime registry. It verifies 40 known names, including compatibility and optional entries; it does not claim that all 40 are active. Every text label stays within the rail's eight-column text budget; an unknown third-party tool uses `🧩` until it is added explicitly. `PI_TOOL_RAILS_ICON_STYLE=material` switches the emoji rail to Material Symbols Rounded codepoints; `text` is a plain-glyph diagnostic mode.

| Group | Display labels | Tool identifiers |
| --- | --- | --- |
| Files and shell | `📖 read`, `📝 write`, `✏️ edit`, `🔁 replace`, `🔎 grep`, `🗂️ find`, `📂 list`, `💻 shell` | `read`, `write`, `edit`, `replace`, `grep`, `find`, `ls`, `bash` |
| Preview and orchestration | `🖼️ preview`, `↩️ undo`, `⚡ parallel` | `preview_export`, `undo_last_replace`, `multi_tool_use.parallel` |
| Search and questions | `🔎 grep`, `❓ ask` | `grep`, `ask_user_question` |
| Tasks | `📋 tasks` | `todo` |
| Web | `🌐 web`, `✅ verify`, `📥 fetch`, `📚 sources` | `web_search`, `source_check`, `fetch_content`, `get_search_content` |
| Context | `🔭 recall`, `🧠 memory`, `🗒️ note`, `🔬 expand`, `🗜️ reduce` | `ctx_search`, `ctx_memory`, `ctx_note`, `ctx_expand`, `ctx_reduce` |
| Task branches | `🧵 task` | `push-task` |
| Background shell | `📊 status`, `👁️ watch`, `⌨️ input`, `🛑 stop` | `bash_status`, `bash_watch`, `bash_write`, `bash_kill` |
| Deferred | `🧰 tools`, `🧬 semantic` | `load_tools`, `semantic_code` |
| Readseek and local tools | `✏️ edit`, `📝 write`, `🔎 grep`, `🌳 search`, `🧭 def`, `🕸️ refs`, `♻️ rename`, `🩺 digest`, `🔬 view`, `🗂️ files`, `🔎 literal`, `💻 bg shell`, `⚔️ conflict` | `readSeek_*`, `fffind`, `ffgrep`, `bash_bg`, `conflict` |

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
