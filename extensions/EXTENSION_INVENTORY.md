# Pi Extension Inventory

The default profile targets **Pi 1.0.x** and is verified against Pi 1.0.0. `install.mjs` owns package selection; `config/external-packages.txt` owns rolling external sources. Source-only compatibility packages are not extra runtime registrations.

## Default local runtime packages

| Package | Responsibility | Entry points |
| --- | --- | --- |
| `pi-context-bridge` | SoL registration, Web Access, provider-model refresh, context continuity, wire compatibility, RTK and bounded teammate contracts | `pi-context-bridge/index.ts`, `rtk.ts`, `teammate.ts` |
| `pi-default-workbench` | Project tool policy, skill search, lazy implementation modules, session helpers, guards, background shell and preview | `pi-default-workbench/index.ts` |
| `pi-slim-skills` | Compressed skill metadata and explicitly configured body injection | `pi-slim-skills/index.ts` |
| `pi-tool-rails` | Tool cards, actual call trees, thinking presentation, prompt frame, brand header and plan/agent panels | Manifest entries in `pi-tool-rails/package.json` |
| `pi-cache-drop-guard` | Session-scoped checks for consecutive prompt-cache drops | `pi-cache-drop-guard/index.ts` |

`pi-zh-localizer` runs as an installer patcher. Brand-header, model-discovery and Todo-guard sources are aggregated into the packages above. `pi-compaction-model` is opt-in; it is not part of the default profile. The standalone `matugen-chrome` extension supplies the footer and chrome presentation.

## Native and local discovery

| Capability | Owner | Reason to retain local code |
| --- | --- | --- |
| Tool BM25 and deferred schema discovery | Native Pi `tool_search` / `codemode` | Project modes and disabled-tool policy remain local |
| MCP transport and tool exposure | Native Pi | Legacy adapter configuration is conditional, not a default duplicate registration |
| Skill-body loading | Native resources plus explicit workbench load | Workbench searches the skill catalog and deduplicates selected body loads |
| Extension implementation import | Workbench lazy wrappers | Schema deferral alone does not defer JavaScript imports |
| Skill-directory prompt size | Slim-skills | Metadata compression is separate from instruction loading |

The default injection allowlist is empty. Skill search, tool discovery and the global prompt should not repeat the same multi-step routing instructions.

## Wrapped runtime dependencies

| Dependency | Registration owner |
| --- | --- |
| `pi-web-access` | `pi-context-bridge` |
| `pi-rtk-optimizer` | Bridge compatibility wrapper |
| SoL-Pi runtime checkout | Bridge factory; avoid simultaneous standalone registration |
| `pi-maestro-teammate` | Bridge teammate contract and policy wrapper |
| `pi-markdown-preview` | Workbench lazy preview entry |

Exact dependency versions belong in the owning package manifest and lockfile. External-source versions are intentionally rolling; this inventory does not freeze a historical installed version as the current one.

## External packages and resources

The configured sources include notification, persistent knowledge, plan mode, structured questions, terminal review, side conversations, provider configuration, ADHD presentation preferences and curated themes. Consult `config/external-packages.txt` for the authoritative list.

Workspace History, Large-profile packages and Ponytail are absent from the default source list. Installing an optional package separately does not make it part of the default profile. Curated themes are resource-only; they do not register an extension entry point.

## Distribution and lifecycle checks

- Default Pi core peer ranges are `>=1.0.0 <2.0.0`; CI compiles and tests against 1.0.0.
- Package `files` lists constrain shipped runtime content. Development dependencies are excluded from package payloads.
- User config paths use the Pi agent directory; private values do not belong in this repository.
- Tool overrides preserve ownership, deferred exposure and raw errors; presentation keeps mutation ratio bars and measured timing.
- Session resources have cleanup paths; optional feature failures should not suppress unrelated bridge functionality.
- Label/emoji registry size is a presentation inventory, not the number of active tools.
- `scripts/verify-repository.mjs --default-profile` covers the default runtime packages and the installer-only localizer.

See `docs/default-profile.md` for startup measurements, source ownership and verification commands.
