# pi-context-bridge

Default-profile bridge for the locked upstream implementations:

- `pi-web-access@0.22.0`
- `pi-manager-models` 的 provider 模型目录刷新
- bounded `checkpoint` entries and a hidden, capped `context` continuity snapshot

The package also loads `pi-rtk-optimizer@0.9.0` through the first-party `rtk.ts` compatibility entry. Checkpoints are stored in the Pi session branch and only the latest bounded snapshot is added before a model call; they do not replace Pi or Magic Context compaction and do not append to the global system prompt.

Use `checkpoint` for a meaningful verified decision, failed approach, or phase handoff. Do not use it for every tool call.

## RTK evidence compatibility

`rtk-compat.ts` scopes only RTK's registered hooks; upstream source files remain unchanged. Automatic rewriting is limited to `git status` (optionally `--short` or `-sb`), `git diff --stat`, and `git log --oneline` (optionally a count from 1 to 99). Other commands, exact reads, fused mutation results, SoL receipts and observation recall bypass RTK compaction. Streaming sanitizers are not registered because they mutate shared result objects. Explicit `rtk ...` commands still execute as requested and can produce lossy output.

This conservative policy trades some RTK savings for evidence fidelity, including custom diagnostic commands. It does not remove Pi's native output limits or change SoL's archive/recall behavior.

For existing installations, install this package's dependencies first, then run `node scripts/configure-rtk-compat.mjs` from the repository and restart Pi. The script backs up settings and removes standalone npm RTK entries only when the bridge is present. The installer runs this migration automatically. Custom bridge extension filters must include `./rtk.ts` and require manual reconciliation. Do not load standalone RTK alongside this entry; its unwrapped hooks would bypass the protection.
