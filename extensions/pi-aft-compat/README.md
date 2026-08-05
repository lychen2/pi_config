# pi-aft-compat

A maintained local Pi adapter for two AFT boundaries without modifying or replacing AFT tools:

- Rewrites only the model-facing `edit` JSON schema in `before_provider_request` into mutually exclusive append, batch, and symbol branches. Each batch item is also a find/replace or line-range branch, so providers cannot materialize both modes into one item. Native AFT still owns validation, execution, backups, and rendering.
- Disables `aft_search` outside a Git worktree. AFT `grep` remains available everywhere; use Pi's native file discovery tools when they are enabled. Set `PI_AFT_SEARCH_ALLOW_NO_GIT=1` to opt in for a no-Git workspace.

The adapter does not register an `edit` tool and does not need to replace AFT's native renderer.
