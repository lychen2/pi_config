# pi-default-workbench

Default-profile functional workbench with one registration entry:

- `deferred-tools/`: adaptive, fast, and full project tool modes; adaptive uses hybrid BM25/local embedding discovery with up to three matches by default. Semantic ranking uses cached local weights when available; downloading them is opt-in with `PI_WORKBENCH_DOWNLOAD_EMBEDDINGS=1` and is disabled under Pi offline mode. Without weights, search falls back to lexical BM25. Full omits tool search. SoL's `update_plan` replaces duplicate active Todo tools, and `obs_recall` remains available in every mode.
- `skill-search.ts`: metadata-first search over installed, model-invocable skills, followed by explicit loading with source and reference paths
- `todo/`: persistent Todo state, commands, and terminal panel
- `maestro/`: FFF search, background shell, and Git conflict tools
- `preview/`: validated Markdown Preview PNG exports
- `session-tools/`: memory-only draft stash and local Markdown export
- `code-outline/`: on-demand TypeScript/JavaScript declaration outlines

`index.ts` registers these surfaces in one package while preserving their existing tool names, commands, and configuration files. For network research, use host-provided `web_search` and `fetch_content` when available; MCP tools are available only when configured and exposed by the host. Default profile context/network integration remains in `pi-context-bridge`.

## Drafts and session export

These features do not call a model, send messages, navigate the session tree, or add prompt instructions.

- **Ctrl+Alt+S** stashes the current input and clears the editor. Press again to restore it; when both the editor and slot contain text, they swap. `/stash` also restores a stored draft. Slots are isolated by session ID and kept in memory only; restarting or reloading extensions loses them. Existing editor components are not replaced.
- **`/md`** copies the current branch as Markdown, excluding thinking, tool calls/results, and internal extension metadata. `custom_message`, compaction summaries and branch summaries are retained. Images become placeholders.
- **`/md 3`** exports the last three user turns and their following records.
- **`/md tc +bash`** includes bash calls/results; `-tool` excludes a tool. Filters match exact names, case-insensitively, and require `tc`.
- **`/md t`** includes thinking explicitly. **`/md all`** exports all branches in file order with entry and parent IDs, not a merged conversation. `all` and a turn count are mutually exclusive.
- Append **`save`** to write a uniquely named `.md` file under `getAgentDir()/pi-sessions-extracted/` (normally `~/.pi/agent/pi-sessions-extracted/`). New directories use mode 0700 and files 0600. Default output uses Pi's clipboard helper, including its terminal clipboard support.

Exports and copies can contain sensitive session data. They preserve recorded content without automatic redaction or model summarization. Use these commands in interactive mode; no background export runs. Shortcut availability depends on the terminal forwarding the key combinations.

## Code outline tool

`code_outline({ path, offset?, limit? })` reads the current disk contents of one `.ts`, `.tsx`, `.mts`, `.cts`, `.js`, `.jsx`, `.mjs`, or `.cjs` file. It returns declaration names, bounded signatures and 1-based line ranges for functions, classes, types, interfaces, variables and class/interface members. Function bodies and variable initializers are not traversed. Use `read` at the returned ranges for the implementation.

The existing tool selector exposes it through discovery in adaptive mode and immediately in full mode. Fast mode keeps it inactive. No new always-on prompt is added. The TypeScript 5.9 parser API (`typescript-api` alias dependency) loads on first execution; the separate TypeScript 7 compiler remains a development dependency. There is no indexing, file watcher, model call, project type-checking, or cross-file call graph.

Limits: 2 MiB per regular file, 80 declarations per page by default (maximum 200), approximately 24,000 output characters, and 300 characters per signature. Continue with the returned `nextOffset` when truncated. Syntax errors are reported as a warning and the outline may be incomplete. Signatures are syntactic excerpts, not inferred types; only the requested source file is read. Small files may be cheaper to read directly.

Reload Pi extensions or restart Pi after updating this package. No additional package needs to be enabled.
