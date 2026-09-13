# pi-compaction-model

Pin Pi context compaction to a chosen provider/model and retry transient upstream failures.

Pi compacts with the session model by default. This extension handles `session_before_compact` itself and
calls `compact()` with a configured target, so compaction keeps working when the session model is
unavailable, rate-limited, or a poor summarizer.

## Behavior

- Resolves the target from the environment on every compaction, so model switches need no reload.
- Retries transient failures with exponential backoff (`baseDelayMs * 2^(attempt-1)`, capped at 30s).
- Fails fast on aborts and on non-transient errors (quota/billing/auth/context overflow).
- Falls back to the session model when the target model is unconfigured, unauthenticated, disabled, or
  keeps failing; each fallback is reported through `ctx.ui.notify` when a UI is attached.

## Environment

| Variable | Default | Meaning |
| --- | --- | --- |
| `PI_COMPACTION_MODEL_PROVIDER` | `manager` | Provider name passed to `ctx.modelRegistry.find`. |
| `PI_COMPACTION_MODEL` | `deepseek-v4-flash` | Model id used for compaction. |
| `PI_COMPACTION_MODEL_DISABLE` | unset | `1`, `true`, or `yes` disables the extension and restores Pi's default compaction. |
| `PI_COMPACTION_RETRIES` | `3` | Retries after the first attempt, clamped to 10. |
| `PI_COMPACTION_RETRY_DELAY_MS` | `2000` | Base backoff delay, clamped to 30000. |

## Install

Add the package directory (or its packed tarball) to `settings.packages` for the Pi profile that should
use it. It requires `@earendil-works/pi-coding-agent` `>=0.82.0 <0.85.0`.

## Test

```sh
npm ci
npm test
npm run typecheck
```
