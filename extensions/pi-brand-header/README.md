# pi-brand-header

Responsive themed startup header for Pi. It shows the active model, thinking level, working directory, theme, skill count, tool count, terminal size, and configured tool-expansion key.

## Install

```bash
pi install npm:pi-brand-header
```

For local development:

```bash
pi install /absolute/path/to/pi-brand-header
```

Use `/logo` to hide or restore the header. The extension activates only in TUI mode and falls back to a stacked layout on narrow terminals.

## Development

```bash
npm install
npm run typecheck
npm pack --dry-run
```
