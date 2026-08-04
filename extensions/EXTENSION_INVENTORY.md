# Pi Extension Inventory

Audited against Pi 0.82 extension, package, TUI, keybinding, provider, and lifecycle documentation.

## Hand-Crafted Distributable Packages

| Package | Purpose | Source |
| --- | --- | --- |
| `pi-aft-compat` | Makes the model-facing AFT edit schema mutually exclusive and disables semantic search outside Git worktrees | `pi-aft-compat/index.ts`, `pi-aft-compat/normalize.mjs` |
| `pi-brand-header` | Responsive themed startup header | `pi-brand-header/index.ts` |
| `pi-deferred-tools` | Project-scoped two-level tool selector; legacy package name, tools are no longer deferred | `pi-deferred-tools/extensions/deferred-tools.ts` |
| `pi-manager-models` | Configurable provider model-catalog refresh | `pi-manager-models/index.ts` |
| `pi-rtk-aft-capture` | Captures original AFT Bash results before RTK | `pi-rtk-aft-capture/index.ts` |
| `pi-rtk-aft-restore` | Restores captured AFT Bash diagnostics after RTK | `pi-rtk-aft-restore/index.ts` |
| `pi-slim-skills` | Compressed skill index and deduplicated full-body injection | `pi-slim-skills/index.ts` |
| `pi-todo-guard` | Continue settled runs while Todo tasks remain | `pi-todo-guard/index.ts` |
| `pi-tool-rails` | Soft tool rails, verified 52-tool emoji/label registry, semantic tool headers, user-message frame, persistent prompt frame | `pi-tool-rails/compact-shell.ts`, `pi-tool-rails/tool-presentations.mjs`, `pi-tool-rails/index.ts`, `pi-tool-rails/prompt-frame.ts` |
| `pi-workflow-dag` | Dependency-aware inspect, implement, and review workers | `pi-workflow-dag/index.ts` |
Ten package directories install from this repository.

## Standalone Extensions

| Extension | Purpose | Source |
| --- | --- | --- |
| `adhd-mode` | Session-persistent ADHD response-mode injection | `adhd-mode.ts` |
| `matugen-chrome` | Theme-aware Cometix footer and working indicator | `matugen-chrome.ts` |

## Configured Third-Party Extensions

| Package | Installed version | Purpose |
| --- | ---: | --- |
| `pi-markdown-preview` | 0.10.0 | Markdown, LaTeX, browser, and PDF preview |
| `@ff-labs/pi-fff` | 0.9.6 | Fuzzy file and content search |
| `@narumitw/pi-plan-mode` | 0.31.0 | Read-only planning mode |
| `@juicesharp/rpiv-ask-user-question` | 2.1.0 | Structured user questions |
| `@cortexkit/aft-pi` | 0.49.0 | Native file editing, recovery checkpoints, code inspection, and indexed search |
| `pi-slopchop` | 0.10.1 | Terminal code review and annotations |
| `pi-workspace-history` | 0.2.2 | Workspace undo/redo history |
| `@narumitw/pi-subagents` | 0.31.0 | Isolated subagent delegation |
| `@juicesharp/rpiv-todo` | 2.1.0 | Persistent Todo tool and overlay |
| `pi-rtk-optimizer` | 0.9.0 | RTK command rewriting and generic output compaction |
| `pi-cache-optimizer` | 2.6.22 | Prompt and provider-cache optimization |
| `pi-web-access` | 0.18.0 | Web search, URL fetching, GitHub cloning, and media extraction |
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
- The installer verifies compact labels and dedicated emoji for 52 known registry entries; optional and compatibility entries are included, so this is not the active-tool count.
- Session-scoped compatibility patches restore original methods on shutdown.
- All seven repository packages pass TypeScript.
- All seven repository packages pass isolated Pi loading and `npm pack --dry-run` inspection.
