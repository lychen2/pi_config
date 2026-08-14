# pi-readseek-compat

Default-mode registration adapter for audited tool schemas.

It is the sole default-mode entry for locked upstream implementations:

- `pi-readseek@0.9.13`
- `pi-web-access@0.22.0`
- `pi-maestro-teammate@1.11.0`

The adapter preserves upstream execution, rendering, commands, and event hooks while tightening only the model-facing schemas for:

- `readSeek_digest`: `end`/`limit` exclusivity, vision coupling, and parser language IDs
- `readSeek_view`: outline/vision exclusivity and short-lived node handle guidance
- `readSeek_search`: parser language IDs
- `get_search_content`: `findText` versus `offset`/`limit` modes
- `observe`: only registered `teammate` and `workspace` target kinds
- native `read`: one-based positive `offset` and `limit`

It also keeps the existing Readseek digest input normalization and structured-error mapping. Readseek editing stays under the distinct `readSeek_edit` name so `/reload`, Magic Context compaction, and Large profile switches cannot change the schema of Pi's `edit` tool. If a reload only loses Readseek's in-memory anchored-path marker, `readSeek_edit` performs one minimal digest and retries once; stale or mismatched hashes still fail normally. `bash_bg` remains self-contained in `pi-maestro-tools`; its job IDs are not observation targets.
