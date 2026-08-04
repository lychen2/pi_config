# pi-gsd

A lightweight session-tree subagent extension based on the upstream task core, maintained locally as `pi-gsd`. The `push-task` registration explicitly identifies it as the subagent entry point, so requests to delegate focused work route here without requiring users to remember the tool name.

It keeps only session-tree task execution:

- `push-task` queues a focused subagent prompt and can record a role/model; its collapsed card stays on one status line
- `/start-task` opens a fresh-context branch
- `/finish-task` returns the result to the parent branch
- `/abort-task` abandons the task branch
- `/discard-task` removes a queued task
- `/auto` runs queued tasks sequentially

This local version excludes the upstream skill bundle, skill updater, skill-reference rewriting, and large prompt guidance. The original task prompt stays intact; a short selected role profile is added only inside the fresh task branch. Execution remains visible in the normal Pi session tree. The footer distinguishes queued and running subagents, while a completed result collapses to its title, status, and elapsed time; `Ctrl+O` reveals the full response.

`role` is an open label, not an enum or permission system. Known profiles cover exploration, mapping, analysis, research, synthesis, planning, implementation, debugging, migration, integration, review, security, performance, testing, verification, design, documentation, and release work. Common aliases such as `scout`, `builder`, `reviewer`, `tester`, and `verifier` are accepted. Put scope, restrictions, output format, and acceptance checks in the prompt. Use `model` when a task fits a cheaper or specialized model.

## Example

Ask Pi:

```text
Start a fresh-context review subagent. Check the changed files, tests, and edge cases. Do not edit files.
```

Then run `/start-task` (or `/start-task provider/model` to override the task model). When the review is complete, run `/finish-task` to return the result to the parent conversation.

## Development

```bash
npm test
npm run typecheck
npm pack --dry-run
```
