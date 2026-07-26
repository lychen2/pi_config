# Pi Extension Inventory

Audited against Pi 0.82 extension, package, TUI, keybinding, provider, and lifecycle documentation.

## Hand-Crafted Distributable Packages

| Package | Purpose | Source |
| --- | --- | --- |
| `pi-brand-header` | Responsive themed startup header | `pi-brand-header/index.ts` |
| `pi-agent-browser-compat` | Normalize provider-filled `agent_browser` fields | `pi-agent-browser-compat/index.ts` |
| `pi-deferred-tools` | Auto-group extension tools and activate one deferred tool per call | `pi-deferred-tools/extensions/deferred-tools.ts` |
| `pi-manager-models` | Configurable provider model-catalog refresh | `pi-manager-models/index.ts` |
| `pi-slim-skills` | Compressed skill index and deduplicated full-body injection | `pi-slim-skills/index.ts` |
| `pi-todo-guard` | Continue settled runs while Todo tasks remain | `pi-todo-guard/index.ts` |
| `pi-tool-rails` | Soft tool rails, semantic tool headers, user-message frame, persistent prompt frame | `pi-tool-rails/index.ts`, `pi-tool-rails/prompt-frame.ts` |
| `pi-translate-submit` | Translate editor input without submitting it | `pi-translate-submit/index.ts` |

Eight package directories install from this repository.

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
| `pi-hashline-edit-pro` | 0.17.9 | Hash-anchored read and replace tools |
| `pi-slopchop` | 0.10.1 | Terminal code review and annotations |
| `@narumitw/pi-goal` | 0.31.0 | Autonomous goal workflow |
| `@narumitw/pi-subagents` | 0.31.0 | Isolated subagent delegation |
| `@juicesharp/rpiv-todo` | 2.1.0 | Persistent Todo tool and overlay |
| `@narumitw/pi-btw` | 0.32.0 | Side-question command |
| `pi-rtk-optimizer` | 0.9.0 | RTK command and output compaction |
| `pi-cache-optimizer` | 2.6.22 | Prompt and provider-cache optimization |
| `pi-agent-browser-native` | 0.2.72 | Native bridge to the upstream `agent-browser` CLI |
| `pi-sensitive-guard` | 0.5.0 | Sensitive-file protection and optional output redaction |
| `pi-add-dir` | 1.3.1 | External-directory context loading |
| `@tmustier/pi-raw-paste` | 0.1.3 | One-shot raw paste support |
| `pi-autoresearch` | 1.6.2 | Autonomous experiment loop |
| `@monotykamary/pi-tps` | 1.3.3 | Token-generation speed display |
| `pi-provider` | 1.3.1 | Interactive custom-provider configuration and capability checks |

## Resource-Only Package

`@victor-software-house/pi-curated-themes` 0.2.1 provides themes and does not register an extension entry point.

## Distribution Checks

- Every hand-crafted package has a `pi.extensions` manifest and `pi-package` keyword.
- Pi core imports are declared as `peerDependencies` with `"*"` ranges.
- Runtime package contents are constrained with `files`; development dependencies are excluded.
- Global config paths use Pi's exported `getAgentDir()`.
- TUI-only behavior is mode-guarded; dialogs are UI-guarded.
- Dynamic tools use strict provider-compatible names and additive activation.
- Tool overrides skip built-ins already owned by another extension.
- Long generic tool output is bounded and uses the configured expansion key hint.
- Session-scoped compatibility patches restore original methods on shutdown.
- All eight repository packages pass TypeScript; translation passes its 12 behavior tests.
- All eight repository packages pass isolated Pi loading and `npm pack --dry-run` inspection.
