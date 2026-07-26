# pi-deferred-tools

Extension-aware on-demand tool loader for Pi. It discovers tool ownership from Pi's `sourceInfo`, groups tools by extension automatically, removes configured extensions from the initial active set, and exposes one small loader that activates exactly one tool per call.

## Install

```bash
pi install "$(realpath extensions/pi-deferred-tools)"
```

When loaded from this `pi_config` checkout, the extension reads and writes [`config/deferred-tools.json`](../../config/deferred-tools.json) directly. Packaged installations fall back to `~/.pi/agent/deferred-tools.json`. Set `PI_DEFERRED_TOOLS_CONFIG` to override the path or `PI_DEFERRED_TOOLS_DISABLE=1` to disable the extension.

The config stores extension IDs only. Package versions are normalized away, and tools are discovered automatically, so package updates that add tools do not require manual regrouping. `load_tools` accepts one exact tool name and activates only that tool; `all` intentionally matches nothing.

Manage the deferred extension set without editing JSON:

```text
/deferred-tools list
/deferred-tools add npm:@narumitw/pi-subagents
/deferred-tools remove npm:@narumitw/pi-subagents
```

```json
{
  "loader": { "name": "load_tools", "label": "Load Tools" },
  "extensions": [
    "npm:@narumitw/pi-subagents",
    "npm:pi-agent-browser-native"
  ]
}
```

## Development

```bash
npm install
npm run typecheck
npm pack --dry-run
```
