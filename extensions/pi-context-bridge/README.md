# pi-context-bridge

Default-profile bridge for the locked upstream implementations:

- `pi-web-access@0.22.0`
- `pi-manager-models` 的 provider 模型目录刷新
- bounded `checkpoint` entries and a hidden, capped `context` continuity snapshot

It loads all four local capabilities through one package. Checkpoints are stored in the Pi session branch and only the latest bounded snapshot is added before a model call; they do not replace Pi or Magic Context compaction and do not append to the global system prompt.

Use `checkpoint` for a meaningful verified decision, failed approach, or phase handoff. Do not use it for every tool call.
