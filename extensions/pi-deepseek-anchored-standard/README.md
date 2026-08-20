# pi-deepseek-anchored-standard

A maintained Pi extension for DeepSeek V4 Pro and V4 Flash anchoring. The implementation combines the useful Pi-side ideas from `kxh4892636/pi-deepseek-anchor` and `OceanEyeFF/pi-deepseek-v4pro-anchored` with a provider-payload safety layer.

## Behavior

The extension targets the exact model ids `deepseek-v4-pro` and `deepseek-v4-flash`.

1. A new empty session captures the current active tool catalog and persists a versioned bootstrap state.
2. The bootstrap phase exposes only `bash` and `str_replace_editor` through Pi's active-tool set.
3. The first provider request receives the Minimal persona, the two-tool catalog, the Minimal tool schemas, and known generated leading context is removed from that request.
4. The first assistant response or tool execution promotes the branch to `promoted` and restores the captured active tool catalog.
5. Progressive mode turns the first real interactive message into a short Chinese anchor request. Images are withheld from that synthetic request and replayed with the original text in a follow-up. Before that follow-up is sent, only the synthetic anchor user/assistant exchange is removed from the provider payload; the real task and its attachments remain intact.
6. Persisted branch state is restored on `session_start` and `session_tree`. Leaving the target model or shutting down removes the extension-owned editor tool from the active set.

The extension does not modify non-target model payloads or active tools. It does not replace Pi's native `bash`; the Minimal bash schema is applied only to the target model's first provider payload.

## Configuration

| Environment variable | Default | Meaning |
| --- | --- | --- |
| `PI_DEEPSEEK_ANCHORED_STANDARD_DISABLE` | unset | Set to `1` to disable the extension. |
| `PI_DEEPSEEK_ANCHORED_STANDARD_MODE` | `progressive` | `progressive` inserts the one-time anchor exchange; `direct` keeps the real first message unchanged while still using bootstrap routing. |
| `PI_DEEPSEEK_ANCHORED_STANDARD_PROMOTE_ON` | `either` | `either`, `tool-call`, or `assistant-message`. |
| `PI_DEEPSEEK_ANCHORED_STANDARD_ANCHOR_TEXT` | Chinese default | Override the synthetic anchor text. |

Use `/dsh-anchor` to display the current phase. Use `/dsh-anchor promote` to promote immediately, or `/dsh-anchor rearm` to create a new bootstrap state for the current target-model session.

## Safety boundaries

- Only the exact `deepseek-v4-pro` and `deepseek-v4-flash` ids are targeted. Provider-prefixed ids are accepted; thinking-suffixed ids are not.
- The original first user message is retained in memory until it is queued as a follow-up. Its image content is not sent to the synthetic anchor turn.
- Synthetic anchor cleanup is one-shot and requires both the anchor user message and a later real user message. An incomplete payload is left unchanged.
- Custom session state is stored with `pi.appendEntry()` and does not enter the model context.
- The extension uses Pi's native `bash` implementation and only registers the Minimal `str_replace_editor` implementation needed by the bootstrap pair.

## Development

Run commands from this package directory:

```bash
npm install
npm test
npm run typecheck
npm pack --dry-run
```

The test suite covers model gating, Minimal payload rewriting, Chat Completions and Responses payload shapes, image-preserving Progressive replay, promotion, branch restoration, and non-target isolation.
