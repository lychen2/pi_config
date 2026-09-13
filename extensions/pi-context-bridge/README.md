# pi-context-bridge

Default-profile bridge for the locked upstream implementations:

- `pi-web-access@0.22.0`
- `pi-manager-models` 的 provider 模型目录刷新
- bounded `checkpoint` entries and a hidden, capped `context` continuity snapshot
- `wire-guard.ts`: last-mile 清理出站 provider payload 里的空内容块

The package also loads `pi-rtk-optimizer@0.9.0` through the first-party `rtk.ts` compatibility entry. Checkpoints are stored in the Pi session branch and only the latest bounded snapshot is added before a model call; they do not replace Pi or Magic Context compaction and do not append to the global system prompt.

Use `checkpoint` for a meaningful verified decision, failed approach, or phase handoff. Do not use it for every tool call.

## Empty-content wire guard

Magic Context 注入的合成记忆基线 `m[0]` 在基线为空时仍会作为 user 消息进入消息列表，Pi 会把它序列化成 `[{ type: "text", text: "" }]`。Anthropic 格式的中转对此返回 `400 messages.0: user messages must have non-empty content`，OpenAI 格式的网关同样不接受空块。

`wire-guard.ts` 在 `before_provider_request`（即所有消息变换之后、请求发出之前）只删除不携带信息的内容：长度为 0 的 `text`/`input_text`/`output_text` 块、`thinking` 文本为空的块、清理后已无内容的 user/developer/system/assistant 消息，以及空的顶层 `system` 字段。工具调用、工具结果、图片和所有非空文本一律保留；payload 不会被原地修改，无需改动时返回 `undefined`，因此序列化字节与 prompt cache 都不受影响。Magic Context 自己的账本（`syntheticLeadingCount`、m[0]/m[1] 缓存）建立在这个钩子之前的消息数组上，所以不会被改写。

用 `/wire-guard` 可以查看已检查的请求数、丢弃的块/消息数。无法在不破坏缓存的前提下完全避免注入时，这一层是最后一道防线，而不是替代 Magic Context 的修复。

## RTK evidence compatibility

`rtk-compat.ts` scopes only RTK's registered hooks; upstream source files remain unchanged. Automatic rewriting is limited to `git status` (optionally `--short` or `-sb`), `git diff --stat`, and `git log --oneline` (optionally a count from 1 to 99). Other commands, exact reads, fused mutation results, SoL receipts and observation recall bypass RTK compaction. Streaming sanitizers are not registered because they mutate shared result objects. Explicit `rtk ...` commands still execute as requested and can produce lossy output.

This conservative policy trades some RTK savings for evidence fidelity, including custom diagnostic commands. It does not remove Pi's native output limits or change SoL's archive/recall behavior.

For existing installations, install this package's dependencies first, then run `node scripts/configure-rtk-compat.mjs` from the repository and restart Pi. The script backs up settings and removes standalone npm RTK entries only when the bridge is present. The installer runs this migration automatically. Custom bridge extension filters must include `./rtk.ts` and require manual reconciliation. Do not load standalone RTK alongside this entry; its unwrapped hooks would bypass the protection.
