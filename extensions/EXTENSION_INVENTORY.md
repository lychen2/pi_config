# Pi Extension Inventory

Audited against Pi 0.84.1 extension, package, TUI, keybinding, provider, and lifecycle documentation.

## Hand-Crafted Distributable Packages

| Package | Purpose | Source |
| --- | --- | --- |
| `pi-default-workbench` | Unified Default functional workbench: adaptive tool selection, bash-to-tool guard, Puppeteer browser control, persistent Todo, Todo guard, FFF/background shell/conflict tools, Markdown Preview, and `/large` profile switching | `pi-default-workbench/index.ts`, `pi-default-workbench/{bash-guard,deferred-tools,browser,todo,maestro,preview,large-mode}.ts` |
| `pi-context-bridge` | Sole Default registration entry for Web Access, configurable provider model refresh, and bounded checkpoint context continuity | `pi-context-bridge/index.ts`, `pi-context-bridge/{manager-models,continuity}.ts` |
| `pi-large-mode` | Large profile switching implementation, aggregated by `pi-default-workbench` | `pi-default-workbench/large-mode.ts`, `pi-default-workbench/large-mode-core.ts` |
| `pi-brand-header` | Responsive themed startup header, aggregated by `pi-tool-rails` | `pi-tool-rails/brand-header.ts` |
| `pi-deepseek-anchored-standard` | DeepSeek V4 Pro/Flash bootstrap, anchoring, and progressive promotion; source-only specialist package | `pi-deepseek-anchored-standard/{index,core,minimal-editor}.ts` |
| `pi-manager-models` | Configurable provider model-catalog refresh, aggregated by `pi-context-bridge` | `pi-context-bridge/manager-models.ts` |
| `pi-slim-skills` | Compressed skill index and deduplicated full-body injection | `pi-slim-skills/index.ts` |
| `pi-todo-guard` | Continue settled runs while Todo tasks remain; aggregated by `pi-default-workbench` | `pi-default-workbench/todo/guard.ts` |
| `pi-tool-rails` | Soft tool rails, verified 41-tool emoji/label registry, semantic tool headers, user-message frame, persistent prompt frame, and brand header | `pi-tool-rails/compact-shell.ts`, `pi-tool-rails/tool-presentations.mjs`, `pi-tool-rails/index.ts`, `pi-tool-rails/brand-header.ts` |
| `pi-large-beautify` | Large-only beautification bundle (tool rails, message/input framing, brand header, Matugen footer, Matugen theme) that also re-exports the Flow companion surface; not installed by the default installer, copied into the isolated Large profile | `pi-large-beautify/index.ts`, `pi-large-beautify/vendor/`, `pi-large-beautify/themes/` |
Ten package directories are maintained in this repository; the installer enables four aggregate packages and keeps the other package sources available for Large profiles or explicit manual installation. `pi-zh-localizer` is run as an installer patcher rather than installed as a runtime extension.

## Standalone Extensions

| Extension | Purpose | Source |
| --- | --- | --- |
| `adhd-mode` | Session-persistent ADHD response mode, sticky notes, side-chat, and reminders | `adhd-mode.ts` + `pi-adhd/src/` |
| `matugen-chrome` | Matugen footer with live context, Git operation state, and sanitized extension statuses | `matugen-chrome.ts` + `matugen-footer-core.mjs` |

## Locally Wrapped Runtime Dependencies

These packages are pinned production dependencies of local compatibility entries and are not installed as independent Pi registration sources.

| Package | Pinned version | Registration entry |
| --- | ---: | --- |
| `pi-markdown-preview` | latest | `pi-default-workbench` |
| `pi-web-access` | latest | `pi-context-bridge` |

## Configured Third-Party Extensions

| Package | Installed version | Purpose |
| --- | ---: | --- |
| `@cortexkit/pi-magic-context` | 0.41.1 | Persistent memory, conversation-history search, and `ctx_*` tools |
| `@narumitw/pi-plan-mode` | 0.31.0 | Read-only planning mode |
| `@juicesharp/rpiv-ask-user-question` | 2.1.0 | Structured user questions |
| `pi-slopchop` | 0.10.1 | Terminal code review and annotations |
| `pi-workspace-history` | 0.2.2 | Workspace undo/redo history |
| `pi-rtk-optimizer` | 0.9.0 | RTK command rewriting and generic output compaction |
| `pi-provider` | 1.3.1 | Interactive custom-provider configuration and capability checks |
| `@dietrichgebert/ponytail` | 4.9.0 | Lazy senior developer mode, mode persistence, and focused review/audit skills |

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
- The installer verifies compact labels and dedicated emoji for 41 known registry entries; optional and compatibility entries are included, so this is not the active-tool count.
- Session-scoped compatibility patches restore original methods on shutdown.
- The installer enables exactly four aggregate local packages: `pi-context-bridge`, `pi-default-workbench`, `pi-slim-skills`, and `pi-tool-rails`. Duplicate or profile-specific packages remain source-only unless explicitly installed.
