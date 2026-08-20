# Pi Extension Inventory

Audited against Pi 0.84.1 extension, package, TUI, keybinding, provider, and lifecycle documentation.

## Hand-Crafted Distributable Packages

| Package | Purpose | Source |
| --- | --- | --- |
| `pi-default-workbench` | Unified Default functional workbench: adaptive tool selection, Puppeteer browser control, persistent Todo, FFF/background shell/conflict tools, and Markdown Preview | `pi-default-workbench/index.ts`, `pi-default-workbench/{deferred-tools,browser,todo,maestro,preview}/` |
| `pi-context-bridge` | Sole Default registration entry for Web Access and teammate | `pi-context-bridge/index.ts` |
| `pi-large-mode` | Current-session switching between the default package boundary and a pinned upstream Flow/teammate/Cockpit profile | `pi-large-mode/index.ts`, `pi-large-mode/core.ts` |
| `pi-brand-header` | Responsive themed startup header | `pi-brand-header/index.ts` |
| `pi-deepseek-anchored-standard` | DeepSeek V4 Pro/Flash bootstrap, anchoring, and progressive promotion | `pi-deepseek-anchored-standard/{index,core,minimal-editor}.ts` |
| `pi-manager-models` | Configurable provider model-catalog refresh | `pi-manager-models/index.ts` |
| `pi-slim-skills` | Compressed skill index and deduplicated full-body injection | `pi-slim-skills/index.ts` |
| `pi-todo-guard` | Continue settled runs while Todo tasks remain | `pi-todo-guard/index.ts` |
| `pi-gsd` | Optional sequential session-tree subagents; retained in source but skipped by the default installer | `pi-gsd/index.ts`, `pi-gsd/src/index.ts` |
| `pi-tool-rails` | Soft tool rails, verified 40-tool emoji/label registry, semantic tool headers, user-message frame, persistent prompt frame | `pi-tool-rails/compact-shell.ts`, `pi-tool-rails/tool-presentations.mjs`, `pi-tool-rails/index.ts`, `pi-tool-rails/prompt-frame.ts` |
| `pi-large-beautify` | Large-only beautification bundle (tool rails, message/input framing, brand header, Matugen footer, Matugen theme) that also re-exports the Flow companion surface; not installed by the default installer, copied into the isolated Large profile | `pi-large-beautify/index.ts`, `pi-large-beautify/vendor/`, `pi-large-beautify/themes/` |
Eleven package directories are maintained in this repository; the installer enables nine and skips the optional `pi-gsd` package and the Large-only `pi-large-beautify` package.

## Standalone Extensions

| Extension | Purpose | Source |
| --- | --- | --- |
| `adhd-mode` | Session-persistent ADHD response mode, sticky notes, side-chat, and reminders | `adhd-mode.ts` + `pi-adhd/src/` |
| `matugen-chrome` | Matugen footer with live context, Git operation state, and sanitized extension statuses | `matugen-chrome.ts` + `matugen-footer-core.mjs` |

## Locally Wrapped Runtime Dependencies

These packages are pinned production dependencies of local compatibility entries and are not installed as independent Pi registration sources.

| Package | Pinned version | Registration entry |
| --- | ---: | --- |
| `pi-markdown-preview` | 0.14.0 | `pi-default-workbench` |
| `pi-maestro-teammate` | 1.11.0 | `pi-context-bridge` |
| `pi-web-access` | 0.22.0 | `pi-context-bridge` |

## Configured Third-Party Extensions

| Package | Installed version | Purpose |
| --- | ---: | --- |
| `@narumitw/pi-plan-mode` | 0.31.0 | Read-only planning mode |
| `@juicesharp/rpiv-ask-user-question` | 2.1.0 | Structured user questions |
| `pi-slopchop` | 0.10.1 | Terminal code review and annotations |
| `pi-workspace-history` | 0.2.2 | Workspace undo/redo history |
| `pi-rtk-optimizer` | 0.9.0 | RTK command rewriting and generic output compaction |
| `pi-provider` | 1.3.1 | Interactive custom-provider configuration and capability checks |

## Resource-Only Package

`@victor-software-house/pi-curated-themes` 0.2.1 provides themes and does not register an extension entry point.

## Distribution Checks

- Every hand-crafted package has a `pi.extensions` manifest and `pi-package` keyword.
- Pi core imports are declared as `peerDependencies` with `"*"` ranges.
- Runtime package contents are constrained with `files`; development dependencies are excluded.
- Global config paths use Pi's exported `getAgentDir()`.
- TUI-only behavior is mode-guarded; dialogs are UI-guarded.
- Project tool selection is stored as disabled extension/tool rules; missing config keeps Pi's default active tools.
- Tool overrides skip built-ins already owned by another extension.
- Long generic tool output is bounded and uses the configured expansion key hint.
- The installer verifies compact labels and dedicated emoji for 40 known registry entries; optional and compatibility entries are included, so this is not the active-tool count.
- Session-scoped compatibility patches restore original methods on shutdown.
- The unified `pi-default-workbench` package owns the Default functional tools; its root `index.ts` is the sole registration entry for those five modules.- The default profile loads Web Access and teammate through `pi-context-bridge`; `/large on` removes overlapping default entries and loads pinned upstream Flow, teammate, and Cockpit sources. `/large off` restores the captured entries, order, and `autoload` values.
