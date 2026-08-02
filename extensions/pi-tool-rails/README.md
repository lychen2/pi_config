# pi-tool-rails

Quiet TUI styling for Pi:

- a fixed-width tool column with compact emoji labels; emoji sits immediately left of centered text
- `todowrite` labels split into `✏️todo` and `write`, without repeating the emoji
- a theme `text` separator with full-block pending, success, and error backgrounds from the active Pi theme
- reason-first built-in tool calls that show `goal → concrete target` on one line and a useful result on the next
- collapsed third-party output limited to two useful lines; `Ctrl+O` still reveals the complete renderer output
- structured output colors for headings, success, active, pending, error, and task identifiers
- numbered `read` views that show source line numbers in the TUI while preserving hash anchors for the model
- numbered, side-by-side `replace` diffs with old lines on the left, new lines on the right, and multiple change groups
- one blank line between tool blocks
- a persistent framed `prompt` editor and framed user messages
Tool ownership is conservative. The extension overrides a built-in only while Pi still owns it, so hashline `read/replace`, sandbox, SSH, and other extension-owned tools keep their execution behavior. Guarded presentation bridges apply the common label column and result formatting at the exported `ToolExecutionComponent` layer. Hashline `read` results are converted from `HASH│content` to `line │ content` only in the TUI renderer; the tool result sent to the model retains its anchors. Diff-leading spaces are preserved because they align hashline context and add/remove gutters; only the duplicate space left after removing a repeated tool name is normalized.

## Install

```bash
pi install npm:pi-tool-rails
```

Pi exposes editor replacement but not middleware around every later replacement. To keep the prompt frame when Pi or another extension rebuilds the editor, the prompt entry point installs a guarded `setEditorComponent` wrapper. It composes any supplied `EditorComponent`, removes stale wrappers on reload, and restores the setter on shutdown.

Pi also lacks public renderer hooks for the common shell and user-message presentation used here. Those compatibility patches are guarded, reference-counted, and restore the original methods on shutdown. Set `PI_TOOL_RAILS_DISABLE_USER_FRAME=1` to disable only the user-message patch.

## Development

```bash
npm install
npm test
npm run typecheck
npm pack --dry-run
```
