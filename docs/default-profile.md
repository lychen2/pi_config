# Default profile

Default combines metadata-first skill/tool discovery with NVIDIA's standalone [SoL-Pi](https://github.com/NVlabs/SoL-Pi), tracking the upstream default branch without a pinned revision. Large and its third-party workflow are unchanged.

## Ownership

| Surface | Owner |
| --- | --- |
| File mutation plus optional `then_run` validation | SoL Action Fusion; failed validation retains the successful edit |
| Large repeated observations and paged exact recall | SoL ObservationPack and `obs_recall` |
| Long diagnostic-log reduction with verified quotations | SoL Evidence-Preserving Reducer; original output survives failed reduction |
| Execution plan and boundary-driven native compaction | SoL `update_plan` and Online Context Compact |
| Durable memory and history search | Magic Context in `compaction.enabled=false` mode; `ctx_search`/`ctx_memory`/`ctx_note`/`ctx_expand` and memory injection stay active, `ctx_reduce` is not registered |
| Skill discovery | Workbench search/load plus slim-skills router; descriptions and exact paths remain visible when search is unavailable |
| Tool discovery | Adaptive mode only; full exposes enabled tools directly without `search_tool_bm25` |

When SoL's `update_plan` is active, the selector hides `todo`/`todowrite` from every mode and from discovery. Existing Todo records and user commands remain intact. If SoL planning is explicitly disabled, Todo can be used again. `obs_recall` and `update_plan` remain available in fast/adaptive modes so recall and compaction do not depend on discovering their control tools.

SoL must precede presentation overrides in the package list: Pi's duplicate tool registrations otherwise let the existing edit/write definitions hide Action Fusion. The selector refreshes after resource discovery as well as before turns so dynamically registered tools receive the correct mode selection.

## Delegation and browser access

Adaptive mode keeps Magic Context's four knowledge tools active when registered. Teammate, its lifecycle controls, the single `mcp` proxy and isolated Chromium are discovered only when needed; they do not add startup schemas. Explicit tool/package disables still win. Fast intentionally excludes these integrations, while full exposes all enabled tools. Discovered tools remain active for the session until the selection is reset or changed.

Use teammate for independent bounded work with distinct write ownership. Small sequential tasks stay in the parent agent. The single-model teammate policy pins every task to the model in `extensions/pi-context-bridge/teammate-config.json` with no fallbacks.

The external manifest installs `pi-mcp-adapter`. `scripts/configure-mcp-proxy.mjs` (also called by the installer) switches an existing `zen-browser` server to `directTools: false` and `lifecycle: "lazy-keep-alive"`. It backs up the local file, preserves server commands/credentials and other servers, and does nothing when no Zen server exists. Browser provisioning and credentials are intentionally not copied into this repository.

Use the MCP proxy's search/describe/call flow for the user's existing browser. Use the workbench Chromium tool for isolated local application tests; avoid switching browser sessions mid-task. Public-page research normally uses web search/fetch directly.

```bash
node scripts/configure-mcp-proxy.mjs --dry-run
node scripts/configure-mcp-proxy.mjs
```

Restart Pi after changing MCP exposure or extension source. `/tools adaptive` restores this profile in a project previously set to fast; it preserves explicit disables. Memory storage and injection are unchanged by this migration.

## Context control handoff

Disabling Magic Context compaction deliberately trades its manual `ctx_reduce` control for SoL's automatic path. Verified in the upstream implementation:

- ObservationPack archives any tool result above 10 KB, sends it in full for the first two provider requests, then projects a ~1 KB placeholder with a stable id. Originals are read back page by page with `obs_recall` (16 KB/400 lines per call), and recall keeps working after compaction or session resume.
- Online Context Compact aborts a turn and hands the window to Pi native compaction only at a completed plan boundary when archive savings exceed cache read/write cost, then continues the task automatically. It declines when native compaction is not feasible for the current branch.
- Pi native compaction remains enabled because `compaction.enabled` in `sol-pi.json` is only SoL's own gate.

Magic Context keeps its knowledge surface in this mode: `ctx_search`, `ctx_memory`, `ctx_note`, `ctx_expand`, raw-message indexing and memory injection stay registered, while `ctx_reduce` is intentionally absent because tagging and drops stop. There is no manual drop entry point in the SoL path. `magic-context.jsonc`-level historian, dreamer and sidekick features were already disabled on this machine.

Restart Pi for the handoff to take effect; a session started before the migration still shows Magic Context markers.

## Install and migrate

The installer records the unpinned standalone package in `config/external-packages.txt`. Installing the package alone leaves its mechanisms disabled until configured. After installing external packages, explicitly authorize migration:

```bash
node scripts/configure-default-sol.mjs --approve-shared-memory
# On a TUN/Fake-IP proxy host:
node scripts/configure-default-sol.mjs --approve-shared-memory --tun
```

The migration:

- Backs up existing files with `.pre-sol-<timestamp>` suffixes; preserves unrelated configuration and JSONC comments.
- Writes all four enabled flags to the agent's `sol-pi.json` using `config/sol-pi.json` as a template. The installed reducer uses the machine's current default provider/model through Pi-managed authentication, not credentials in this file.
- Moves the standalone SoL package first and enables Pi native compaction. A custom retained-tail setting requires a matching SoL programmatic integration and is rejected before writing.
- Sets shared Magic Context `compaction.enabled=false` and disables its duplicate `todowrite`; preserves its knowledge configuration and database.
- Optionally adds only `198.18.0.0/15` to Web Access's `ssrf.allowRanges`. Existing provider, proxy and domain-policy settings remain intact; other private ranges remain blocked.

**Shared impact:** Magic Context's compaction-off switch is user-wide under the CortexKit config directory, not a project setting. It also affects OpenCode/OMP using that file; enable native compaction there if needed. Restart affected hosts. Historical data is not deleted; the first resumed long session may require native compaction. The migration refuses a project-local SoL override rather than silently writing an ineffective global configuration.

Web Access's actual config location is `$PI_CODING_AGENT_DIR/web-search.json`, otherwise `$XDG_CONFIG_HOME/pi/web-search.json`, otherwise `~/.pi/web-search.json` (not necessarily Pi's agent directory). Fake-IP allowance is an explicit host-network exception, not a blanket SSRF disable.

The normal installer copies `config/APPEND_SYSTEM.md` and the slim-skills configuration. Running only the migration script does not install these prompt files.

## ADHD-friendly responses

The external package list includes [i-have-adhd](https://github.com/ayghri/i-have-adhd). The installer copies `config/i-have-adhd.json` to the agent directory with `alwaysOn: true` and `hideStatus: false`. Install external packages to load its extension and skill; `--skip-external` copies the configuration without installing the package.

New sessions enable the mode automatically and show `ADHD ON`. Use `/i-have-adhd off` or `/i-have-adhd on` to change it for the current session. A saved session choice takes precedence over the default. Restart Pi after installation to load the package and configuration.

The extension injects its bundled skill rules for action-first, numbered multi-step answers. `APPEND_SYSTEM.md` continues to request everyday language, concrete explanations and useful qualifications. No separate copy of the upstream skill is maintained in this repository.

## Skill output conventions

The default deployed skills keep operating instructions, internal checks, and editorial notes separate from reader-facing content. Omit routine process commentary. Put a necessary review note in a native comment; when the format has no comments, put it in the conversation outside the artifact. Captions, footnotes, speaker notes, and rendered bibliography fields remain content. Scientific conditions needed to interpret a result remain with that result.

Validate external data and permissions at system boundaries, then reuse normalized records and established internal contracts. This does not remove checks of scientific assumptions or numerical correctness. Detailed audit procedures apply when an audit is requested, rather than becoming the default output for drafting, lookup, plotting, or calculation.

## Optics research

`optics-research` is installed as a local skill by `scripts/deploy-skills.mjs`. Its metadata provides the entry point; literature and physical-verification references load only when needed. `APPEND_SYSTEM.md` keeps brief defaults for physical checks, traceable evidence, raw-data preservation, and authorization for confidential uploads or hardware operations; detailed research procedures stay in the skills. No extra extension, model, solver, or Python dependency is installed by this change.

After deployment, use `/reload` to refresh the prompt and skill resources. Invoke `/skill:optics-research` with a research question, paper, calculation, or simulation task. Existing project instructions and explicit resource disables still apply.

The workflow reuses the installed literature, symbolic mathematics, experimental design, uncertainty, statistics, writing, and visualization skills. It adds optics-specific checks for conventions, approximation regimes, sampling, convergence, material data, and fair comparison of reported results. Passing these checks does not establish a scientific claim without adequate evidence.

The [research collaboration post](https://linux.do/t/topic/2059718) informed the use of foundational plus recent literature, layered reading, critical review, and maintained research notes. Multi-model consensus and generated scientific images are not treated as validation. Reusable workflows are captured only after successful use or an explicit user request.

## Verification and references

- SoL source checks: 139 tests, typecheck and package inspection passed against the pinned Pi 0.85.1 matrix. npm 11 is required for the upstream package tests' array-shaped `npm pack --json` expectation; npm 12 changes that output shape.
- Upstream audit: no high-severity findings; two moderate development-test dependency advisories remain (`vitest` / `@vitest/mocker`).
- Default regression tests cover exact tool activation, mode switching, SoL control availability, single task ownership, skill lifecycle, TUN exception boundaries and configuration preservation.
- Real offline startup verified SoL-owned edit/write schemas contain `then_run`, `obs_recall`/`update_plan` are active, the configured reducer model exists, and full omits tool search and duplicate Todo. No end-to-end remote reducer cost/latency benchmark is claimed.

[OpenAI's skills and prompts guidance](https://developers.openai.com/blog/rethinking-skills-and-prompts-for-gpt-6-astra) informs the short stable contract and progressive disclosure. [SoL configuration](https://github.com/NVlabs/SoL-Pi/blob/main/docs/configuration.md) owns the four efficiency mechanisms. [Magic Context compaction-off mode](https://github.com/cortexkit/magic-context/blob/master/CONFIGURATION.md#compaction-off-mode) owns the knowledge-only coexistence contract.
