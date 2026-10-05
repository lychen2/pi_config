# pi_config maintained SoL-Pi

This directory is a standalone source package tracked by the pi_config Git repository. It has no nested Git repository and contains no Pi monorepo source. NVIDIA's MIT license, copyright headers and third-party notices are retained.

## Provenance

- Upstream: https://github.com/NVlabs/SoL-Pi
- Base: `e1a586af0ad8956f42ae5b26bba20e48fbf30e00`.
- [PR #90](https://github.com/NVlabs/SoL-Pi/pull/90) is already included in that base. It accounts for unpaid cache-write debt and avoids repeated compaction from restated completed plans.
- [PR #89](https://github.com/NVlabs/SoL-Pi/pull/89), head `f6d73af1487c306782593636f800168f39447c9f`, is applied locally: configurable Observation Pack full-send count, documentation, configuration preflight and regression tests.
- [PR #93](https://github.com/NVlabs/SoL-Pi/pull/93), head `ea8a33cc6ba67660c44488e4fba2457c561d59a1`, is applied locally: array-valued system-prompt estimation and regression tests.

PRs #89 and #93 were open at extraction. Applying their changes locally does not merge or publish anything upstream.

The copy preserves the previous checkout's local compaction test changes. Additional maintenance changes use Pi 1.0.0 development dependencies and peer ranges, update tool execution contexts, propagate Pi 1.0 Bash `isError` results as fused-command failures, and support both npm array and keyed-object pack reports.

## Loading and cache policy

`extensions/pi-context-bridge/package.json` owns a `file:../../vendor/sol-pi` dependency. `sol-pi-compat.ts` imports its entrypoint through Pi's normal module loader so host-provided peers share the host runtime. The bridge retains its legacy-plan normalization, Claude-model rewriting bypass, and reported optional-load failures. Do not add a second standalone SoL-Pi package registration.

`config/sol-pi.json` sets `observationPackFullSends: 0`. Results above 16 KiB are archived before the first model request. Every request receives a stable placeholder with bounded head and tail excerpts. Results at or below 16 KiB stay visible. The model uses `obs_recall` for omitted content. Stored session history and archived bytes remain available. Changing this policy mid-session or encountering an archive failure can change the projected history.

The fork raises the upstream 10 KiB threshold to the existing 16 KiB recall limit. Direct recall pages share that limit, including headers, so they cannot be archived again. Codemode scripts that combine multiple pages can still exceed it.

This policy removes Observation Pack's delayed full-result-to-placeholder transition. It does not guarantee provider cache hits. Native online compaction changes the history prefix, and model, tool declarations, system prompts, provider routing and cache lifetime also affect reuse. PR #90 evaluates compaction economics using the configured ratio; it cannot preserve an already changed prefix.

The original agent Git checkout is retained as a backup. Neither the installer nor `update-managed-git.mjs` updates or loads it. That updater now manages only pi-provider.

## Comparison and local optimization

The comparison inspected [pi-blackhole](https://github.com/k0valik/pi-blackhole/tree/be64de823f27d8be4195dbe0734409017b05240f) and the installed `@cortexkit/pi-magic-context` 0.45.0 bundle. It covered the mechanisms below; it was not a full security or performance audit.

| Mechanism | Existing coverage and decision |
| --- | --- |
| Blackhole tool-output projection and recall budgets | Observation Pack already archives large results and provides recall pages capped at 16 KiB and 400 lines, including headers. Adding another projection layer would introduce a second policy for the same messages. |
| Blackhole deterministic compaction and observational-memory workers | These would add compaction ownership alongside OCC and Magic Context's historian. No additional context manager is enabled by this fork. |
| Magic Context historian, history injection and project memory | Magic Context owns persistent cross-session facts and conversation recall. SoL-Pi's EPR reduces individual results, while OCC uses Pi's native compaction at plan boundaries. The installed Magic Context configuration is preserved. |
| Reuse with explicit invalidation | Blackhole caches session reads/indexes; Magic Context fingerprints message contents before reusing token counts. This fork independently implements a single-entry system-prompt estimate cache, validating the normalized text on every use and clearing it on session restoration/shutdown. |
| Reuse within a synchronous decision | OCC reads Pi's context usage once per completed-step decision and shares its token count and window across that decision. Pi rebuilds its session projection on each usage read. A real AgentSession regression observes one read per decision, including consecutive compactions; it observed two before the change. No usage snapshot is retained across events. |

Pi's message estimator primarily uses string lengths and serializes tool arguments; a content-fingerprinted LRU would add validation work to that cheap heuristic. The prompt cache avoids repeated UTF-8 byte scans of an unchanged system prompt. Decision-local usage reuse avoids one redundant native projection and branch scan at each evaluated boundary. Mutable prompt-segment arrays remain supported. Messages, native cut points, reported usage and compaction economics are unchanged. This is local computation reuse, with no claim of increased provider cache hits or measured wall-time improvement.

## Maintenance

1. Fetch upstream into a separate checkout; compare new commits with the recorded base and review open PRs. Do not overwrite this directory from the old agent checkout.
2. Merge selected changes into this directory, preserving local Pi compatibility fixes. When a selected PR lands upstream, reconcile it instead of applying its patch twice. Record the new base and PR revisions here.
3. Run the fork checks below and the bridge typecheck/tests. Repository verification also includes this source package.
4. Install the bridge dependencies if its file dependency changed, reconcile the effective `sol-pi.json` (project overrides replace the agent file), and restart Pi.

```sh
npm --prefix vendor/sol-pi ci --ignore-scripts
npm --prefix vendor/sol-pi run check
npm --prefix vendor/sol-pi audit --audit-level=high
node vendor/sol-pi/scripts/check-pi-compat.mjs
node vendor/sol-pi/scripts/check-sol-pi-config.mjs --config config/sol-pi.json --require-all-enabled
npm --prefix extensions/pi-context-bridge ci --ignore-scripts
npm --prefix extensions/pi-context-bridge run typecheck
npm --prefix extensions/pi-context-bridge test
```

The suite includes real Pi AgentSession compaction/continuation and package-loading tests with deterministic faux providers. Those establish local behavior without paid model calls; they do not measure live provider cache hit rates.
