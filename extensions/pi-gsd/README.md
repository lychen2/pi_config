# pi-gsd

A lightweight task-branch extension based on the upstream session-tree task core, maintained locally as `pi-gsd`.

It keeps only session-tree task execution:

- `push-task` stores a focused task prompt and can record a role/model
- `/start-task` opens a fresh-context branch
- `/finish-task` returns the result to the parent branch
- `/abort-task` abandons the task branch
- `/discard-task` removes a queued task
- `/auto` runs queued tasks sequentially

This local version excludes the upstream skill bundle, skill updater, skill-reference rewriting, and large prompt guidance. The original task prompt stays intact; a short selected role profile is added only inside the fresh task branch. Execution remains visible in the normal Pi session tree.

`role` is an open label, not an enum or permission system. Known profiles cover exploration, mapping, analysis, research, synthesis, planning, implementation, debugging, migration, integration, review, security, performance, testing, verification, design, documentation, and release work. Common aliases such as `scout`, `builder`, `reviewer`, `tester`, and `verifier` are accepted. Put scope, restrictions, output format, and acceptance checks in the prompt. Use `model` when a task fits a cheaper or specialized model.

## Example

Ask Pi:

```text
Queue a fresh-context review with push-task. Check the changed files, tests, and edge cases. Do not edit files.
```

Then run `/start-task` (or `/start-task provider/model` to override the task model). When the review is complete, run `/finish-task` to return the result to the parent conversation.
