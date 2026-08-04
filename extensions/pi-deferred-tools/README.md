# pi-deferred-tools: project tool selector

> **Naming note:** the package name is retained for compatibility. **Tools are no longer deferred.** This extension is now a project-scoped switch panel that lets a trusted project disable extension tools; extension tools start enabled unless the project explicitly disables them.

## Install

```bash
pi install "$(realpath extensions/pi-deferred-tools)"
```

Open the project tool selector in Pi:

```text
/tools
```

The first level lists extensions. Press `Space` to toggle every tool from an extension, or `Enter` to configure that extension's tools individually. Changes affect the current project's model tool set immediately; they do not unload the package, commands, or event handlers. The legacy `/deferred-tools` command opens the same interface, and `/tools list` shows the current selection without opening the TUI.

Selections are stored in the trusted project's `.pi/tool-selector.json`:

```json
{
  "disabledExtensions": ["npm:pi-markdown-preview"],
  "disabledTools": ["web_search"]
}
```

Missing config means all extension tools use Pi's normal enabled state. Package versions are normalized away. Disabling an extension also disables tools it adds in future versions; individual tool choices remain explicit. There is no runtime `load_tools` or deferred activation step.

Set `PI_TOOL_SELECTOR_CONFIG` to override the project config path. Set `PI_TOOL_SELECTOR_DISABLE=1` to disable the selector extension. `PI_DEFERRED_TOOLS_DISABLE=1` remains as a compatibility alias.

## Development

```bash
npm install
npm test
npm run typecheck
npm pack --dry-run
```
