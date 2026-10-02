# Default Profile

The default runtime targets **Pi 1.0.x** and is verified against Pi 1.0.0. `config/settings-public.json` owns public defaults; private credentials remain in the user's agent directory. Local package sources load TypeScript directly, so restart Pi after updating them.

## Restore this configuration on another host

Run `node install.mjs --yes --with-external --with-model-defaults` after cloning the repository (or use `install.sh` / `install.ps1` to bootstrap Pi). Public templates restore provider endpoints and model metadata, MCP definitions, Web Search preferences, and tool selection. Existing machine values and credentials win during incremental merges; public model selection is applied only with `--with-model-defaults`. Local npm lockfiles remain committed for verification; package sources do not pin exact versions or Git commits. Supported peer ranges and the TypeScript 5 compiler-API major remain compatibility constraints: TypeScript 7 does not export that API.

Set `MANAGER_API_KEY` and, if using the secondary provider, `PROVIDER_111_API_KEY` locally. Model templates contain environment-variable names, not keys. Web Search keys are deliberately omitted: configure them locally. Sessions, authentication state, knowledge databases, and private backups are not copied into this repository.

All MCP entries start disabled on a fresh host. Start the required service, open `/mcp`, and enable its server. Zotero and Jupyter remain disabled on this host until explicitly enabled, so Pi does not connect to them or report startup timeouts. Incremental installation preserves your subsequent `/mcp` choices. GitHub requires `GITHUB_TOKEN`; Jupyter requires `JUPYTER_TOKEN`, a loopback Jupyter URL, and an appropriately restricted notebook root. Install `uvx` for the Python MCP entries and adjust the Obsidian folder before enabling its filesystem server. Fresh Python MCP commands use unversioned `uvx --from` sources; an existing host keeps its own commands and paths.

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

Workbench search can use a cached local embedding model; lexical BM25 remains available when embeddings are absent or disabled. Starting Pi does not download model weights by default. Explicitly enabled downloads still honor offline mode. See `extensions/pi-default-workbench/README.md` for the explicit download option and local-model behavior.

Use the installed Pi's startup benchmark in an interactive terminal:

```sh
PI_TIMING=1 PI_STARTUP_BENCHMARK=1 pi --no-session
```

The benchmark requires a TTY. Its reported timing is more useful than shell process duration, which can include shutdown work. Compare repeated measurements under the same profile and cache state.

## SoL and persistent knowledge

The default bridge registers SoL-Pi from its runtime source checkout at `~/.pi/agent/git/github.com/NVlabs/SoL-Pi`. Do not also register that checkout as a standalone Pi package in the same profile. A failed optional SoL initialization must leave independent bridge features available and report the failure.

`config/sol-pi.json` controls artifact reduction, turn folding, online compaction and tool selection. It is copied to the agent directory; project `.pi/sol-pi.json` overrides require explicit reconciliation. RTK uses the bridge compatibility entry and only rewrites supported Git overview commands, preserving tool-result evidence for SoL.

Magic Context retains its knowledge and history role. Turning its compaction off affects every host sharing that user configuration, so the migration requires explicit approval:

```sh
node scripts/configure-default-sol.mjs --approve-shared-memory
```

The migration accepts either the bridge-owned registration or one standalone SoL source, rejects duplicates, and saves backups. It does not erase memory databases or change reducer/provider credentials. Add `--tun` only for the documented synthetic DNS range used by a TUN proxy; other private ranges remain blocked.

## Rules and skills

`config/APPEND_SYSTEM.md` is the source for the global working rules copied into the agent directory. There is no required global `AGENTS.md` in this repository. Keep only broadly applicable instructions global; task-specific procedures belong in the relevant skill.

`scripts/deploy-skills.mjs` owns the managed skill list. It preserves user-added skills and archives only explicitly retired managed names. Scientific calculations retain their relevant unit, approximation, numerical and evidence checks. Skill metadata should describe the task that benefits from the guidance; references are opened when needed for that task.

The active Manim entries in `.pi/agent/skills` may point to `.agents/skills`. Resolve symlinks before treating matching names as duplicate installations. Package-provided skills remain owned by their package.

## Updates and verification

Installation is incremental by default. `--clean-plugins` is an explicit cleanup option; review its backup and removal behavior in the installation guide before using it. External packages follow rolling release/branch sources from `config/external-packages.txt`, so installs on different dates are not guaranteed identical. Preserve a working snapshot before upgrades.

### Safely update patched Git plugins

SoL-Pi and pi-provider are managed runtime sources in `config/runtime-git-sources.txt`. `config/managed-patches/pi-provider.patch` restores the local provider metadata fixes on a fresh clone; an already applied patch is preserved, and a conflict stops installation without replacing local edits. This patch does not pin the upstream revision. The installer preserves dirty checkouts. pi-provider is registered as a local absolute path, so native `pi update --extensions` cannot reset its Git checkout. SoL-Pi remains bridge-loaded, not a second package registration.

From this repository, explicitly update both plugins:

```sh
node scripts/update-managed-git.mjs
```

Pass `sol-pi` or `pi-provider` to update only that plugin. `PI_CODING_AGENT_DIR` selects another agent directory. The command requires Git, npm/npx, installed bridge development dependencies, and network access. It does not run automatically during installation.

Each run archives the local binary patch, stages an independent checkout of the configured upstream branch, applies tracked changes using a three-way merge, and preserves untracked/ignored ordinary files except `node_modules`. Extra-file symlinks or collisions with upstream files stop the update. SoL-Pi runs its complete tests and typecheck under npm 11.6.2; pi-provider compares strict TypeScript diagnostics with an independent pristine checkout of the exact upstream revision, blocking any new diagnostic while reporting unchanged upstream errors. It also runs the upstream API-error tests and exercises the public status command with sparse-model fixtures, an isolated HOME, and simulated network responses. Both plugins receive a Pi 1.0 load/registration smoke test; no real credentials or provider endpoints are used.

All selected candidates must pass before any checkout is switched. Conflicts, failed validation, or observed source changes stop activation. Failed switches attempt to restore already-switched directories. Registration protection happens before staging and can remain in place after a failed update; its settings backup is printed. Do not edit or reload these plugins while an update runs. Directory switching is sequential, not an atomic filesystem operation across both plugins.

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
