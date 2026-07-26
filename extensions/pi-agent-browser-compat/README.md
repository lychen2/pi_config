# pi-agent-browser-compat

A small Pi compatibility extension for providers or tool-schema bridges that materialize every top-level `agent_browser` field, including mutually exclusive input modes.

When `args` contains the intended CLI command, this extension removes conflicting mode fields before `pi-agent-browser-native` executes. It also removes `stdin` from commands that do not support it. Non-empty stdin for `batch`, `eval --stdin`, and `auth save --password-stdin` is preserved.

The extension uses Pi's mutable `tool_call` hook. It does not modify `pi-agent-browser-native`, `agent-browser`, or files under `node_modules`.

## Install

```bash
pi install "$(realpath extensions/pi-agent-browser-compat)"
```

Restart Pi after installation. Set `PI_AGENT_BROWSER_COMPAT_DISABLE=1` before starting Pi to disable the workaround.

## Validate

```bash
npm install
npm run check
npm pack --dry-run
```
