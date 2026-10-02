# pi-tool-rails

## Tool cards

Collapsed cards show purpose, target, status and a short result, normally in two to four body rows. Complex shell commands use an executable summary; source code, JSON parameters and dispatch protocol text appear in the expanded view. The same boundary applies to built-in tools, extension tools, unknown MCP tools, replayed calls and manual Shell execution.

`🧵 工具编排` (`codemode`) shows a tree of actual nested calls with status, target and measured duration. Repeated calls remain separate. Up to five nodes are shown while folded, prioritizing failures and active calls; an omission row names the remaining tool types. Expanded cards show additional calls, arguments, results and source within the display budget. Source references before execution are labeled separately from actual calls.

Background teammate dispatch is labeled `已派发`; its compact card shows task names and goals. SoL `obs_recall` shows the observation ID, offsets and available line count; recovered evidence appears on expansion. `update_plan` keeps the active-step view and pinned Plan widget. Action-fusion edits retain their proportional diff bars, and a failed `then_run` marks both the header and summary as failed. Measured savings and live sleep progress remain visible.


Quiet TUI styling for Pi:

- short top-edge tool labels with adjacent icons and a separate truthful status badge; below 48 columns, compact rails put status first. Material Symbols Rounded glyphs remain available via `PI_TOOL_RAILS_ICON_STYLE=material`
- a verified registry of compact Chinese labels and purpose-specific emoji for 55 known tool names
- shared rounded frames with theme-colored status, a consistent left rail and a right gutter
- reason-first built-in tool calls that show `goal → concrete target` on one line and a useful result on the next
- concise folded summaries across third-party tools, with bounded task rows and expandable raw details
- SoL-Pi's mechanism banners are silent: the `⚡ SoL-Pi · <mechanism>` chat notice, its `Money saved · <slogan>` row (in tool boxes and in the notice), and the transient `sol-pi-savings` footer status are all dropped; measured savings stay visible inside tool boxes
- short, icon-specific labels for known core, Readseek, FFF, Web, context, and task tool names instead of truncated raw identifiers; the registry is broader than the current active tool surface
- structured output colors for headings, success, active, pending, error, and task identifiers
- expanded `read` views with source line numbers; folded cards show the target and available result metadata
- `edit` and `write` collapse to a path plus `+added -removed` and a proportional add/remove bar; expanded calls show one diff, with fused `then_run` output retained
- a pinned `Plan` panel above the editor follows successful `update_plan` calls and restores from the current session branch; it starts collapsed to a heading that counts steps, and `Alt+T` expands up to eight steps around the current step or collapses it again, without registering another task tool and without letting Pi's working-status line cover the plan
- numbered, side-by-side `replace` diffs with old lines on the left, new lines on the right, multiple change groups, and shared indentation removed from each visible hunk
- one blank line between tool blocks
- a compact rounded prompt with model/provider/thinking metadata on its top edge, completions outside the frame, and no extra blank row before the footer; user messages use soft rounded surfaces and retain Markdown rendering
- a native-compatible `✦ 思考` fold that stays on one row while the model thinks and after it settles, reporting `N 步 · 18s` (step count plus measured thinking time); expanding it reveals the step tree with semantic titles, role-colored markers, and bounded detail, with unchanged `Ctrl+T` show/hide behavior, plus a theme-colored animated working HUD
- cached settled tool rows so the working HUD does not repeatedly re-render completed tool output
Tool ownership is conservative. The extension presents registered tools but does not claim `find` or `ls`; those remain under Pi or another search owner. Guarded presentation bridges apply the common label column and result formatting at the exported `ToolExecutionComponent` layer. Diff markers and gutters remain aligned while shared code indentation is removed per visible hunk and relative indentation is retained.

## Teammate dashboard

`teammate-panel.ts` shows a live, theme-colored `Agents` widget above the Plan panel and editor when `pi-maestro-teammate` emits task events. It lists up to five tasks, prioritizes active work, and shows status, elapsed time, tool calls, token counts and the latest progress/result. Narrow terminals omit the second line and truncate safely. Completed history is bounded to 50 entries; active tasks are retained.

- `Ctrl+Alt+A` or `/agents-panel` toggles the one-line summary.
- `/agents-panel open` selects an agent and opens its task, model, status and latest result/error; use arrow keys to scroll and Escape to close.
- Full session/agent navigation remains available through teammate's native `Alt+R` interface.

The widget claims only teammate's agent-widget ownership so the native widget is not duplicated. It does not replace the footer, editor, thinking view or session list. State starts fresh on session activation and updates from subsequent lifecycle events; this panel does not persist or reconstruct historical transcripts. Nested child processes do not mount it.

## Sleep progress

On Linux, the locally owned built-in `bash` tool shows an in-place progress row while an actual descendant `sleep` process is running, including compound commands such as `cd /tmp && sleep 240 && tail -3 results.log`. No countdown appears during preceding commands or skipped branches. Later commands execute normally.

The observer passes a per-call environment marker (`PI_TOOL_RAILS_SLEEP_ID`) through Pi's native spawn hook and reads descendant process metadata from `/proc` every 250 ms while calls are active. It does not rewrite commands or add output to tool results. Elapsed time starts at the first observation, so remaining time is approximate and may lag by a polling interval or scheduling delay. A live process never displays completed progress; its row disappears after process exit, cancellation, timeout, or session cleanup.

Supported operands include positive decimal seconds, `s`/`m`/`h`/`d` suffixes, and additive durations. Multiple observed waits share one row showing their count and the longest remaining wait. Unsupported durations, inaccessible process metadata, remote/container waits, cleared environments, and non-Linux hosts retain normal Bash behavior without a countdown. Very short sleeps may finish between polls. This does not instrument third-party Bash owners, `bash_bg`, user `!` commands, or fused `then_run` execution.

## Tool labels

`tool-presentations.mjs` is the single runtime registry. It verifies 55 known names, including compatibility and optional entries. Every text label stays within the rail's eight-column text budget; an unknown third-party tool uses `🧩` until it is added explicitly. `PI_TOOL_RAILS_ICON_STYLE=material` switches the emoji rail to Material Symbols Rounded codepoints; `text` is a plain-glyph diagnostic mode.

| Group | Display labels | Tool identifiers |
| --- | --- | --- |
| Files and shell | `📖 read`, `📝 write`, `✏️ edit`, `🔁 replace`, `🔎 grep`, `🗂️ find`, `📂 list`, `💻 shell` | `read`, `write`, `edit`, `replace`, `grep`, `find`, `ls`, `bash` |
| Preview and orchestration | `🖼️ 预览`, `↩️ 撤销`, `⚡ 并行`, `🧵 工具编排` | `preview_export`, `undo_last_replace`, `multi_tool_use.parallel`, `codemode` |
| Search and questions | `🔎 grep`, `❓ ask` | `grep`, `ask_user_question` |
| Tasks | `📋 任务`, `📋 计划`, `👥 委派`, `📡 进度` | `todo`, `update_plan`, `teammate`, `teammate-send`, `teammate-list`, `observe` |
| Web | `🌐 web`, `✅ verify`, `📥 fetch`, `📚 sources` | `web_search`, `source_check`, `fetch_content`, `get_search_content` |
| Context | `🔭 recall`, `🧠 memory`, `🗒️ note`, `🔬 expand`, `🗜️ reduce` | `ctx_search`, `ctx_memory`, `ctx_note`, `ctx_expand`, `ctx_reduce` |
| Background shell | `📊 status`, `👁️ watch`, `⌨️ input`, `🛑 stop` | `bash_status`, `bash_watch`, `bash_write`, `bash_kill` |
| Discovery | `🧰 找工具`, `📚 找技能`, `🗂️ 代码结构` | `search_tool_bm25`, `tool_search`, `search_skill_bm25`, `code_outline` |
| Readseek and local tools | `✏️ edit`, `📝 write`, `🔎 grep`, `🌳 search`, `🧭 def`, `🕸️ refs`, `♻️ rename`, `🩺 digest`, `🔬 view`, `🗂️ files`, `🔎 literal`, `💻 bg shell`, `⚔️ conflict` | `readSeek_*`, `fffind`, `ffgrep`, `bash_bg`, `conflict` |

## Install

```bash
pi install ./extensions/pi-tool-rails
node scripts/verify-tool-presentations.mjs
```

Pi exposes editor replacement but not middleware around every later replacement. To keep the prompt frame when Pi or another extension rebuilds the editor, the prompt entry point installs a guarded `setEditorComponent` wrapper. It composes any supplied `EditorComponent`, removes stale wrappers on reload, and restores the setter on shutdown.

Pi also lacks public renderer hooks for the common shell and user-message presentation used here. Those compatibility patches are guarded, reference-counted, and restore the original methods on shutdown. Set `PI_TOOL_RAILS_DISABLE_USER_FRAME=1` to disable only the user-message patch.

## Soft Matugen palette

`config/matugen/pi-theme.json` supplies wallpaper-driven accents and stable Pi-only semantic colors. Errors use a berry badge, warnings almond yellow, success mint, and deleted lines a separate rose color. The current wallpaper palette is preserved during migration.

Run `node scripts/configure-matugen-tui.mjs --check` from the repository root to inspect changes, then `--apply` to deploy with a guarded backup. Use `--rollback <backup-dir>` to restore those files. Reload Pi after deployment. Other Matugen applications and terminal transparency settings are unchanged.

`PI_TOOL_RAILS_REDUCED_MOTION=1` disables decorative motion; factual elapsed time and wait progress continue updating. The prompt bottom edge separates the footer; the footer retains a terminal-default bottom gutter without an extra rule.

## Development

```bash
npm install
npm test
npm run typecheck
npm pack --dry-run
cd ../..
node scripts/verify-tool-presentations.mjs
```
