# pi-cache-drop-guard

Watches prompt-cache efficiency and asks before a dropped cache quietly keeps re-billing the whole prompt.

Pi already records per-turn cache usage. This extension turns that into a guard: when **two consecutive**
requests miss an obviously large part of the reusable prompt, it opens a dialog instead of silently
burning tokens.

## Behavior

- Judges every assistant turn with Pi's own cache-miss yardstick: `missedTokens = min(previous promptTokens, promptTokens) - cacheRead`,
  ignoring misses under 1024 tokens (noise floor) and resetting the baseline after compaction or a branch summary.
  The baseline is re-read from the persisted transcript on every turn, exactly like Pi's own `detectCacheMiss`, so a
  compaction or branch summary that lands between two requests resets the comparison right away: the first re-billed
  request after it is never counted as a drop, and live counting cannot disagree with what a resumed session recomputes.
- Adds an "obvious" gate on top (4096 missed tokens by default), so only drops worth reacting to are counted.
- Counts **consecutive** obvious drops. On the second one it asks:

  | Choice | Effect |
  | --- | --- |
  | 继续任务（本次忽略，稍后仍会提醒） | Nothing persisted; counting restarts, so the next streak asks again |
  | 查看状态（缓存与上游诊断） | Prints the report below, then asks again |
  | 继续，并保留后续掉缓存提醒（我已换上游） | Persists `mode=ask` and records the acknowledgement |
  | 不再提醒（不在乎成本，尽快完成） | Silences the guard for the **current session only**, until `/cache-guard ask` |

The silent switch never outlives the session that chose it:

- A new session, a resumed session, a fork, or a cold start always begins in `ask` mode. If the previous
  session had muted the guard, the new one says so once and starts counting from zero.
- `/reload` inside the same session keeps the silence, because reloading re-instantiates the extension
  and would otherwise silently lose the choice.

- Any unobvious turn (a healthy cache read or a small miss) clears the counter, and the first healthy
  turn after a dialog reports `缓存已恢复正常` once.
- Providers that never report cache fields are never flagged. Once a provider/model has shown cache
  activity in the session, a stream of zero-cache replies keeps counting — that is exactly the
  "upstream stopped forwarding the cache" case.
- A dialog that times out or is dismissed counts as "continue", so unattended sessions never hang.

## Report

The dialog's `查看状态` choice and `/cache-guard status` produce the report. It is written with
`appendEntry` (TUI-only, never injected into the model context) and covers mode, model, the last eight
cache hit ratios, the current streak, per-session wasted tokens/cost, a cause line for the latest miss
(idle beyond the 5-minute TTL, provider/model switch, upstream not reporting cache, upstream rewriting
the cache), and the output of the optional upstream probe command.

## Controls

- `/cache-guard status` — show the report.
- `/cache-guard ask` — reminders on (the default).
- `/cache-guard never` — silence for the rest of this session.
- `/cache-guard reset` — clear counters and statistics, reminders on.

State lives in Pi's agent directory as `cache-drop-guard.json`. The file records the latest choice together
with the session that made it; it is never inherited by a new or resumed session.

## Environment

| Variable | Default | Meaning |
| --- | --- | --- |
| `PI_CACHE_DROP_GUARD_DISABLE` | unset | `1`/`true`/`yes`/`on` skips registration entirely |
| `PI_CACHE_DROP_GUARD_STREAK` | `2` | Consecutive obvious drops that trigger the dialog (minimum 2) |
| `PI_CACHE_DROP_GUARD_MIN_MISSED_TOKENS` | `4096` | Missed tokens that make a drop "obvious" (minimum 1024) |
| `PI_CACHE_DROP_GUARD_TIMEOUT_MS` | `60000` | Dialog auto-continue delay; `0` waits indefinitely |
| `PI_CACHE_DROP_GUARD_STATUS_CMD` | unset | Shell command run for the report's upstream health section |

## Development

```bash
npm test
npm run typecheck
npm pack --dry-run
```
