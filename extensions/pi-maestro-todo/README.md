# pi-maestro-todo

A lightweight Todo extension for Pi with Maestro-derived terminal views.

It keeps the established `todo` tool contract and session replay envelope used by
`@juicesharp/rpiv-todo`, while replacing that package's overlay with:

- a compact one-line task summary above the editor;
- an `Alt+T` expanded task list ordered by actionable state;
- `/todos` and `/maestro-todo` interactive centers with filtering and details;
- theme-only colors, so the UI follows the active Matugen Pi theme.

The package intentionally excludes Maestro Goal, skill activation, teammate,
workflow, MCP, LSP, and Cockpit runtime dependencies.

## Development

```bash
npm install
npm test
npm run typecheck
```
