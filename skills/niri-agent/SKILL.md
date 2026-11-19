---
name: niri-agent
description: Operate desktop applications and Zen Browser on this niri host using an independent agent seat. Use for computer use, GUI interaction, window screenshots, browser navigation, and visual verification without taking the user's mouse or keyboard focus. Includes host-specific Zen Browser and Zed launch instructions.
---

# Background desktop operation on this host

Use `niri msg agent` for all desktop input and window capture. Prefer file tools, CLI, and APIs for nonvisual work.
Load this skill before desktop or interactive browser work. Use the existing bash and read tools; no additional MCP is required.

## Host applications and isolation

The browser is **Zen Browser**, executable `zen-browser`. The editor is **Zed Preview**, executable `zeditor`.
The compositor is the installed Shorin niri fork with agent seat support.
Agent windows open on the named `agent` workspace through `~/.config/niri/rule.kdl`.
Do not switch the user's workspace to observe them. Capture the target window directly.

List windows:

```fish
niri msg -j windows
```

`is_agent: true` identifies automation windows. `is_focused: true` identifies the user's focused window.
Choose an agent window by id. Operate user-owned windows only when the user explicitly targets one.
Two seats separate input, but editing the same document or application state still causes conflicts.

Launch using the bundled helper (absolute path works from any repository):

```fish
uv run --no-project --python /usr/bin/python "$HOME/.pi/agent/skills/niri-agent/scripts/desktop.py" launch zen https://example.com
uv run --no-project --python /usr/bin/python "$HOME/.pi/agent/skills/niri-agent/scripts/desktop.py" launch zed /absolute/project/path
```

The helper prints the first window id returned by niri. Reuse that window for the task.
Before relaunching, inspect the window list. A second launch with an already-running profile can hand off to that process and time out.

### Zen Browser

Zen uses `~/.config/zen-mcp`, the existing dedicated automation profile, with `--new-instance --profile` and native Wayland.
It does not use the personal profiles in `~/.config/zen/profiles.ini`.
Logins in these profiles are independent. Do not assume a personal login exists in the automation profile.
Do not copy cookies, passwords, or personal profiles automatically. When a task requires login, let the user sign into this dedicated profile.
Finish initial onboarding in the dedicated profile when necessary; avoid imports and default-browser changes.
Use the address bar through `ctrl+l`, type the URL, then `Return`. Zen's custom interface differs from Firefox and Chromium.
Read the captured screen before choosing UI coordinates or shortcuts.

### Zed Preview

Zed uses `--new --user-data-dir ~/.local/share/niri-agent/zed` to avoid joining the user's process.
`--user-data-dir` also changes Zed's configuration root. The helper links `settings.json`, `keymap.json`, and custom `themes` from `~/.config/zed` into the isolated data directory's `config` folder. This preserves **Vim mode**, **VSCode base keymap**, and **autosave on focus change**. Do not modify these shared configuration links during automation. Extension installations remain isolated; extension-provided themes require installing that extension in the agent instance.
The installed CLI otherwise defaults to opening an existing window, so a plain `zeditor path` is unsuitable for background operation.
Existing user Zed windows may not expose the agent seat; launch an independent instance instead.
Use file tools for source edits. Use Zed's GUI only when the task needs editor interaction or visual checks.
For GUI editing, inspect the current Vim mode; use `Escape` and `i` only in the editor buffer, then type.
Inspect project-trust dialogs and preserve restricted mode unless trust has been authorized. Dismiss the dialog by clicking `Stay in Restricted Mode`; keyboard input can reach the buffer behind this dialog, so do not assume Escape dismissed it.
Zed can lack a useful accessibility tree; screenshots remain available.

### Other native Wayland apps

```fish
niri msg agent launch -- application arguments
```

The launch environment comes from niri. Set required variables through `launch -- env NAME=value application`.
Single-instance applications need their own supported instance or data-directory option.
Agent launch unsets `DISPLAY`; X11-only apps are not supported by this route.
Report that concrete limitation instead of injecting input through the user's XWayland or physical seat.

## Observe, act, verify

Capture, then use the read tool to inspect the actual PNG:

```fish
niri msg agent capture --id 7 --path /tmp/pi-agent-7.png --max-size 1280
```

The CLI also writes `/tmp/pi-agent-7.png.json` with the coordinate mapping.
Use the same image with pointer actions when choosing screenshot-pixel coordinates:

```fish
niri msg agent click --id 7 --image /tmp/pi-agent-7.png 288 120
niri msg agent move --id 7 --image /tmp/pi-agent-7.png 288 120
niri msg agent scroll --id 7 --image /tmp/pi-agent-7.png 300 500 --dy 400
niri msg agent key --id 7 ctrl+l
niri msg agent type --id 7 'https://example.com'
niri msg agent key --id 7 Return
```

For arbitrary multiline text, write it to a temporary file with the write tool, then feed it to `type --id 7 -` using stdin redirection.
Unicode input does not require Fcitx or clipboard replacement.
For dragging use `button --pressed true`, `move`, then `button --pressed false`; inspect `--help` for button options.
Use `--require-change` only when a visible change is expected. Exit code 3 indicates no observed change.

Action receipts report changed regions, new windows, popups, titles, and whether the frame settled.
`settled: false` means the observation timed out while the frame continued changing; inspect the result before deciding the next action.
Switch to the returned window id for a new dialog. Recapture after size changes before using image coordinates.
Capture verifies appearance; a changed-region receipt alone does not verify the intended outcome.

## Ownership and cleanup

Do not use `ydotool`, `wtype`, `xdotool`, physical input injection, focus-window, or desktop-wide screenshot tools for this workflow.
Do not use the retired Zen MCP or launch a replacement Chromium browser for ordinary interactive web work.
Application APIs for CAD, notebooks, and other structured data remain appropriate for their own tasks.

Close only agent windows created for the current task, unless the user wants them left open:

```fish
uv run --no-project --python /usr/bin/python "$HOME/.pi/agent/skills/niri-agent/scripts/desktop.py" close 7
```

The helper rejects user-owned windows. Resolve unsaved test buffers deliberately; do not discard user data.
If the seat is off or a program cannot receive agent input, report the actual error. Keep the user's input channel untouched.
Sending messages, purchases, and other consequential operations still require task authorization.

## Sources

Adapted to this host from the Shorin niri agent API at revision `b3078ceb`.
This skill is locally written; it does not install the upstream Firefox launcher or assume its application defaults.
API reference: `niri msg agent --help` and each subcommand's `--help`.
