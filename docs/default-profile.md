# Default Profile

The default runtime targets **Pi 1.0.x** and is verified against Pi 1.0.0. `config/settings-public.json` owns public defaults; private credentials remain in the user's agent directory. Local package sources load TypeScript directly, so restart Pi after updating them.

## Restore this configuration on another host

Run `node install.mjs --yes --with-external --with-model-defaults` after cloning the repository (or use `install.sh` / `install.ps1` to bootstrap Pi). Public templates restore provider endpoints and model metadata, MCP definitions, Web Search preferences, and tool selection. Existing machine values and credentials win during incremental merges; public model selection is applied only with `--with-model-defaults`. Local npm lockfiles remain committed for verification; package sources do not pin exact versions or Git commits. Supported peer ranges and the TypeScript 5 compiler-API major remain compatibility constraints: TypeScript 7 does not export that API.

Set `MANAGER_API_KEY` and, if using the secondary provider, `PROVIDER_111_API_KEY` locally. Model templates contain environment-variable names, not keys. Web Search keys are deliberately omitted: configure them locally. Sessions, authentication state, knowledge databases, and private backups are not copied into this repository.

All MCP entries start disabled on a fresh host. Start the required service, open `/mcp`, and enable its server. Zotero, Jupyter and CAD remain disabled on this host until explicitly enabled, so Pi does not connect to them or report startup timeouts. Incremental installation preserves your subsequent `/mcp` choices. GitHub requires `GITHUB_TOKEN`; Jupyter requires `JUPYTER_TOKEN`, a loopback Jupyter URL, and an appropriately restricted notebook root. Install `uvx` for the Python MCP entries and adjust the Obsidian folder before enabling the filesystem server. Fresh Python MCP commands use unversioned `uvx --from` sources; an existing host keeps its own commands and paths. CAD pins `cadgen==0.7.21` and Python 3.13; first use downloads the CAD runtime. `DO_NOT_TRACK=1` disables cadgen telemetry.

Web Search restores `ssrf.allowRanges=["198.18.0.0/15"]` for this profile's TUN synthetic-DNS setup. Other private ranges remain blocked. Remove this allowance on a host without synthetic DNS if it is not needed.

## Native capabilities and local responsibilities

| Capability | Owner | Loading behavior |
| --- | --- | --- |
| Tool BM25 ranking and deferred schema discovery | Pi `tool_search` / `codemode` | Matching tools are declared when requested |
| MCP connections | Pi's built-in MCP support | Connection and exposure follow each configured server; no server is assumed installed |
| Skill instructions | Pi resource loader and workbench `search_skill_bm25` | Search metadata first when useful; load the selected body on demand |
| Project tool modes and disabled-tool policy | `pi-default-workbench` | `fast`, `adaptive`, and `full`; full mode hides the redundant local tool-search entry |
| Heavy implementation modules | Workbench lazy wrappers | Implementation imports occur on first use, separately from schema visibility |
| Compressed skill directory | `pi-slim-skills` | Empty default injection allowlist; no automatic full-body injection |
| Tool and thinking presentation | `pi-tool-rails` | Preserves raw evidence, actual errors, timing and mutation ratio bars |

Native tool search and local skill search have different catalogs. Native schema deferral also does not defer arbitrary extension imports. Keep the components that provide those separate responsibilities; avoid duplicate discovery instructions in the global prompt, tool description and skill-directory header.

## Startup and local embeddings

The five default local runtime packages are `pi-context-bridge`, `pi-default-workbench`, `pi-slim-skills`, `pi-tool-rails`, and `pi-cache-drop-guard`. `pi-zh-localizer` is an installer patcher. Source-only compatibility packages are not extra runtime registrations.

`pi-slopchop` is opt-in for interactive Git-diff review; it is absent from the default external list. Install it explicitly when needed. `pi-compaction-model` also remains opt-in; its declared Pi range excludes the host's observed 1.3.0 installation.

Workbench search can use a cached local embedding model; lexical BM25 remains available when embeddings are absent or disabled. Starting Pi does not download model weights by default. Explicitly enabled downloads still honor offline mode. See `extensions/pi-default-workbench/README.md` for the explicit download option and local-model behavior.

Use the installed Pi's startup benchmark in an interactive terminal:

```sh
PI_TIMING=1 PI_STARTUP_BENCHMARK=1 pi --no-session
```

The benchmark requires a TTY. Its reported timing is more useful than shell process duration, which can include shutdown work. Compare repeated measurements under the same profile and cache state.

## SoL and persistent knowledge

The default bridge registers the maintained source package at `vendor/sol-pi` through a local npm file dependency. The original `~/.pi/agent/git/github.com/NVlabs/SoL-Pi` checkout remains untouched and is no longer loaded or automatically updated. Do not register either source as a second standalone Pi package in this profile. Provenance, selected PRs, cache limits and the maintenance procedure are in [FORK.md](../vendor/sol-pi/FORK.md). A failed optional SoL initialization must leave independent bridge features available and report the failure.

`config/sol-pi.json` controls artifact reduction, turn folding, online compaction and tool selection. This profile sets `observationPackFullSends: 0`: large results use the same placeholder from the first request, and `obs_recall` retrieves archived content. Native compaction still rewrites history; actual provider cache hits also depend on tools, system prompts, model and provider cache lifetime. It is copied to the agent directory; project `.pi/sol-pi.json` overrides require explicit reconciliation. RTK uses the bridge compatibility entry and only rewrites supported Git overview commands, preserving tool-result evidence for SoL.

Magic Context retains its knowledge and history role. Turning its compaction off affects every host sharing that user configuration, so the migration requires explicit approval:

```sh
node scripts/configure-default-sol.mjs --approve-shared-memory
```

The migration accepts either the bridge-owned registration or one standalone SoL source, rejects duplicates, and saves backups. It does not erase memory databases or change reducer/provider credentials. Add `--tun` only for the documented synthetic DNS range used by a TUN proxy; other private ranges remain blocked.

## Rules and skills

`npm:pi-model-system-prompt` supplies model-specific presets in `~/.pi/agent/model-system-prompt/`. Each run appends the longest case-insensitive model-ID prefix match to Pi’s native prompt. Models without a matching file receive no preset. Switching models changes the next run’s preset. The package uses the OS home directory, independently of `PI_CODING_AGENT_DIR`.

`config/model-system-prompt/gpt-overrides.md` owns the local GPT refinements. `node scripts/configure-model-system-prompt.mjs` seeds missing npm presets and appends one managed override block to nonempty `gpt-*.md` files. It preserves other model files and explicitly disabled empty GPT files. It reads npm presets from the active agent directory. It archives that directory’s retired `APPEND_SYSTEM.md` and changed GPT files under its `backups/` directory. Installation with `--with-external` runs this configuration step, including when npm blocks postinstall. The repository no longer deploys a shared addendum file; the bridge supplies the shared taste guidance described below. Reload Pi after package installation; subsequent preset edits take effect on the next run. A fresh session avoids carrying earlier custom instructions in conversation history.

The bridge adds [GPT with Taste](../extensions/pi-context-bridge/taste/PROVENANCE.md) Main guidance for every model and provider. It composes with model presets through Pi hooks. UserSteer follows unanswered user input; AgentSteer follows `teammate-complete` deliveries. These reminders stay request-local. Use `/taste status`, `/taste off`, or `/taste steer off` to inspect or change the current session branch. Restart or reload Pi to load the integration.

Pi also supports user-level `~/.pi/agent/APPEND_SYSTEM.md` for shared static instructions. This profile uses the bridge hooks for taste guidance and its event reminders.

`config/model-system-prompt/gemini.md` supplies a local Gemini fallback because npm 0.2.1 has no Gemini preset. The configurator seeds it only when missing and preserves subsequent user edits. More specific model-prefix files take precedence. Gemini guidance calls tools for requested file operations and keeps saved artifacts out of lengthy replies.

The npm preset remains intact. Local GPT refinements cover proportional verification, YAGNI, and evidence-based explanations. Unmatched GPT model IDs do not receive these overrides. This repository has no root `AGENTS.md`. Repository-specific test guidance remains in [test conventions](../.workflow/specs/test-conventions.md); task-specific procedures belong in the relevant skill.

`scripts/deploy-skills.mjs` owns the managed skill list. It preserves user-added skills and archives only explicitly retired managed names. The MIT-licensed `cad` skill is maintained from text-to-cad's `latest` branch at `skills/cad/`; update its instructions and references together, then record the source commit. The skill's viewer instructions target hosts with a CAD viewer; Pi can use its model generation, export and inspection commands, but has no native viewer panel. Scientific calculations retain their relevant unit, approximation, numerical and evidence checks. Skill metadata should describe the task that benefits from the guidance; references are opened when needed for that task.

The active Manim entries in `.pi/agent/skills` may point to `.agents/skills`. Resolve symlinks before treating matching names as duplicate installations. Package-provided skills remain owned by their package.

Keep native skill discovery enabled in launch wrappers. Pi scans user, project, Agent Skills, and enabled package locations. `search_skill_bm25` searches discovered metadata and loads selected instructions on demand. `--no-skills` restricts discovery; it does not enable BM25 loading. The host wrapper no longer selects the retired curated directory. The empty body-injection allowlist remains unchanged.

## Updates and verification

Installation is incremental by default. `--clean-plugins` is an explicit cleanup option; review its backup and removal behavior in the installation guide before using it. External packages follow rolling release/branch sources from `config/external-packages.txt`, so installs on different dates are not guaranteed identical. Preserve a working snapshot before upgrades.

### Safely update patched Git plugins

pi-provider is the managed runtime source in `config/runtime-git-sources.txt`. SoL-Pi is maintained in this repository under `vendor/sol-pi`. `config/managed-patches/pi-provider.patch` restores the local provider metadata fixes on a fresh clone; an already applied patch is preserved, and a conflict stops installation without replacing local edits. This patch does not pin the upstream revision. The installer preserves dirty checkouts. pi-provider is registered as a local absolute path, so native `pi update --extensions` cannot reset its Git checkout. SoL-Pi remains bridge-loaded.

From this repository, explicitly update pi-provider:

```sh
node scripts/update-managed-git.mjs
```

The optional `pi-provider` argument selects the same plugin. The command rejects `sol-pi`; review and merge upstream changes into the local fork using its maintenance guide. `PI_CODING_AGENT_DIR` selects another agent directory. The command requires Git, npm/npx, installed bridge development dependencies, and network access. It does not run automatically during installation.

Each run archives the local binary patch, stages an independent checkout of the configured upstream branch, applies tracked changes using a three-way merge, and preserves untracked/ignored ordinary files except `node_modules`. Extra-file symlinks or collisions with upstream files stop the update. pi-provider compares strict TypeScript diagnostics with an independent pristine checkout of the exact upstream revision, blocking any new diagnostic while reporting unchanged upstream errors. It also runs the upstream API-error tests and exercises the public status command with sparse-model fixtures, an isolated HOME, and simulated network responses. pi-provider receives a Pi 1.0 load/registration smoke test; no real credentials or provider endpoints are used.

All selected candidates must pass before any checkout is switched. Conflicts, failed validation, or observed source changes stop activation. Failed switches attempt to restore already-switched directories. Registration protection happens before staging and can remain in place after a failed update; its settings backup is printed. Do not edit or reload these plugins while an update runs. Directory switching preserves the previous checkout for recovery.

Successful runs retain each complete old checkout in:

```text
<agentDir>/managed-updates/<run>/<plugin>/previous-checkout
```

The same directory contains `local.patch`, `rebased.patch`, `before.json`, `manifest.json`, and `checks.log`. Failures retain candidates and command output in `failure.log` for review rather than resolving conflicts automatically. Review conflict semantics, rerun validation, and verify the live snapshot before any manual switch. Never use native Git-package updates to bypass a failed patch validation. Restart Pi after a successful update.

For recovery, close Pi and restore the affected `previous-checkout` directory to its original plugin path, preserving the failed version under a separate name. No automatic backup deletion is performed. A stale `<agentDir>/managed-updates/.lock` after a killed process must be removed only after confirming no updater is running.

### Repository verification

Run the default profile's tests and type checks against the installed dependencies:

```sh
node scripts/verify-repository.mjs --default-profile --skip-install --skip-pack
```

For clean CI/package verification against the supported baseline:

```sh
node scripts/verify-repository.mjs --default-profile --pi-version=1.0.0
```

The second command installs verification dependencies in staged package copies. Windows archive-update execution also needs a Windows or PowerShell test environment; Linux-only source checks do not replace it.
