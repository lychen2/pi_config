# pi-tool-rails

Quiet TUI styling for Pi:

- a fixed-width uppercase tool label column
- a theme `text` separator (`REPLACE │`, `READ    │`) with exactly one layout space on its right
- full-block pending, success, and error backgrounds from the active Pi theme
- compact summaries and expandable previews for shell and search tools
- native execution, hashline output, and rich diff renderers remain intact
- one blank line between tool blocks
- a persistent framed `prompt` editor and framed user messages

Tool ownership is conservative. The extension overrides a built-in only while Pi still owns it, so hashline `read/replace`, sandbox, SSH, and other extension-owned tools keep their execution behavior. Guarded presentation bridges apply the common label column and result formatting at the exported `ToolExecutionComponent` layer. Diff-leading spaces are preserved because they align hashline context and add/remove gutters; only the duplicate space left after removing a repeated tool name is normalized.

## Install

```bash
pi install npm:pi-tool-rails
```

Pi exposes editor replacement but not middleware around every later replacement. To keep the prompt frame when Pi or another extension rebuilds the editor, the prompt entry point installs a guarded `setEditorComponent` wrapper. It composes any supplied `EditorComponent`, removes stale wrappers on reload, and restores the setter on shutdown.

Pi also lacks public renderer hooks for the common shell and user-message presentation used here. Those compatibility patches are guarded, reference-counted, and restore the original methods on shutdown. Set `PI_TOOL_RAILS_DISABLE_USER_FRAME=1` to disable only the user-message patch.

## Development

```bash
npm install
npm run typecheck
npm pack --dry-run
```
