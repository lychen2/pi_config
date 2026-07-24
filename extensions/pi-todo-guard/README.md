# pi-todo-guard

Keeps a Pi run moving after `agent_settled` when a compatible Todo tool still reports `pending` or `in_progress` tasks.

## Install

```bash
pi install npm:pi-todo-guard
```

The default tool name is `todo`. Set `PI_TODO_GUARD_TOOL` for another compatible tool, or `PI_TODO_GUARD_DISABLE=1` to disable the extension.

Compatibility requires tool results with `details.tasks`, where each task has numeric `id`, string `subject`, and status `pending`, `in_progress`, `completed`, or `deleted`. Unknown result shapes are ignored. Reminders are bounded to 20 tasks and 240 characters per subject.

The guard does not continue failed or aborted runs and does not enqueue while messages are already pending.

## Development

```bash
npm install
npm run typecheck
npm pack --dry-run
```
