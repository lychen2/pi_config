# Pi Extension Inventory

Audited against Pi 0.84.1 extension, package, TUI, keybinding, provider, and lifecycle documentation.

## Hand-Crafted Distributable Packages

| Package | Purpose | Source |
| --- | --- | --- |
| `pi-maestro-tools` | FFF workspace search, background shell lifecycle, and Git conflict inspection/resolution (structured `{ok:false, code}` failures) | `pi-maestro-tools/src/index.ts`, `pi-maestro-tools/src/tools/`, `pi-maestro-tools/src/tool-error.ts` |
| `pi-readseek-compat` | Sole default registration entry for Readseek, Web Access, teammate, and native read schema fixes | `pi-readseek-compat/index.ts` |
| `pi-markdown-preview-compat` | Sole Markdown Preview registration entry with PNG signature validation and cache retry | `pi-markdown-preview-compat/index.ts` |
| `pi-large-mode` | Current-session switching between the default package boundary and a pinned upstream Flow/teammate/Cockpit profile | `pi-large-mode/index.ts`, `pi-large-mode/core.ts` |
| `pi-brand-header` | Responsive themed startup header | `pi-brand-header/index.ts` |
| `pi-deferred-tools` | Project-scoped two-level tool selector with a minimal `fast` preset; legacy package name, tools are no longer deferred | `pi-deferred-tools/extensions/deferred-tools.ts` |
| `pi-manager-models` | Configurable provider model-catalog refresh | `pi-manager-models/index.ts` |
| `pi-slim-skills` | Compressed skill index and deduplicated full-body injection | `pi-slim-skills/index.ts` |
| `pi-todo-guard` | Continue settled runs while Todo tasks remain | `pi-todo-guard/index.ts` |
| `pi-maestro-todo` | Persistent Maestro-style Todo state, panel, filters, and detail view | `pi-maestro-todo/index.ts`, `pi-maestro-todo/src/` |
| `pi-gsd` | Optional sequential session-tree subagents; retained in source but skipped by the default installer | `pi-gsd/index.ts`, `pi-gsd/src/index.ts` |
| `pi-tool-rails` | Soft tool rails, verified 41-tool emoji/label registry, semantic tool headers, user-message frame, persistent prompt frame | `pi-tool-rails/compact-shell.ts`, `pi-tool-rails/tool-presentations.mjs`, `pi-tool-rails/index.ts`, `pi-tool-rails/prompt-frame.ts` |
| `pi-large-beautify` | Large-only beautification bundle (tool rails, message/input framing, brand header, Matugen footer, Matugen theme) that also re-exports the Flow companion surface; not installed by the default installer, copied into the isolated Large profile | `pi-large-beautify/index.ts`, `pi-large-beautify/vendor/`, `pi-large-beautify/themes/` |
Thirteen package directories are maintained in this repository; the installer enables eleven and skips the optional `pi-gsd` package and the Large-only `pi-large-beautify` package.

## Standalone Extensions

| Extension | Purpose | Source |
| --- | --- | --- |
| `adhd-mode` | Session-persistent ADHD response-mode injection | `adhd-mode.ts` |
| `matugen-chrome` | Matugen footer with live context, Git operation state, and sanitized extension statuses | `matugen-chrome.ts` + `matugen-footer-core.mjs` |

## Locally Wrapped Runtime Dependencies

These packages are pinned production dependencies of local compatibility entries and are not installed as independent Pi registration sources.

| Package | Pinned version | Registration entry |
| --- | ---: | --- |
| `pi-markdown-preview` | 0.14.0 | `pi-markdown-preview-compat` |
| `pi-readseek` | 0.9.13 | `pi-readseek-compat` |
| `pi-maestro-teammate` | 1.11.0 | `pi-readseek-compat` |
| `pi-web-access` | 0.22.0 | `pi-readseek-compat` |

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
- The installer verifies compact labels and dedicated emoji for 41 known registry entries; optional and compatibility entries are included, so this is not the active-tool count.
- Session-scoped compatibility patches restore original methods on shutdown.
- The schema-fix packages `pi-readseek-compat`, `pi-markdown-preview-compat`, and the affected `pi-maestro-tools`/`pi-large-mode` boundaries pass their focused TypeScript and regression checks; unrelated packages were not rerun for this audit.
- The default profile loads teammate through `pi-readseek-compat`; `/large on` removes overlapping default entries and loads pinned upstream Flow, teammate, and Cockpit sources. `/large off` restores the captured entries, order, and `autoload` values.
