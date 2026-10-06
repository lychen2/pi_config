# Portrait fork

Source: https://github.com/testy-cool/pi-agent-portrait

Revision: `2b749dcf8fab401e8d810c2a8d7981e5a66e39e3` (upstream version `0.4.0`).
License: MIT; see `LICENSE`.

## Ownership

`pi-tool-rails` includes this fork in its package. Its `portrait-dashboard.ts` entry loads the portrait once.
The Default profile keeps its five runtime packages. Installers and Pi updates do not fetch a separate portrait checkout.

The fork retains the upstream animator, image protocols, ASCII fallback, portrait sets, configuration layers, and `/portrait` command.
The character-generation script remains optional. Installation does not run it or call an image service.

## Local changes

- Add a dashboard integration interface to the portrait widget.
- Place status and panels in a bounded right column on wide terminals. Stack the sections on narrow terminals.
- Show the existing model/provider/thinking label, working indicator, Plan panel, and Agents panel inside the dashboard.
- Keep text visible below the avatar width threshold. Preserve all information rows when an image occupies fewer rows.
- Cache context and branch statistics between lifecycle updates. Animation frames do not recount the conversation.
- Use current-branch usage totals. Reset caches on model, thinking level, branch, compaction, message, and turn changes.
- Limit terminal setup to TUI sessions. Dispose the greeting timer, animation timers, and image renderer on shutdown or session replacement.
- Use explicit `.ts` imports and ES modules. Add the recursive animator method's return type for strict TypeScript checks.

The existing Plan and Agents components retain their state, shortcuts, and detail screens.
The original views remain available when the portrait is disabled.
Pi's retry and compaction indicators remain under Pi's control.

## Configuration

The bundled default is `lamb-hood`, processed from the user-supplied character sheet.
Its [asset notes](emotes/lamb-hood/README.md) record the source and image processing.
The previous portrait sets remain available through `/portrait`.

Configuration precedence remains:

1. `portrait/config.json` in this package.
2. `~/.pi/agent/extensions/pi-emote/config.json`.
3. `.pi/extensions/pi-emote/config.json` in the current project.

Set `enabled` to `false` and reload Pi to restore the separate views.
Use `/portrait` to select a character. The command saves a project-level choice.
Unsupported image terminals use the ASCII renderer.

## Verification

Run from `extensions/pi-tool-rails`:

```sh
npm run typecheck
node --test tests/portrait-dashboard.test.mjs
npm test
npm pack --dry-run
```

The integration test uses Pi's actual extension loader with separate entry points.
It checks state sharing, status relocation, model switching, panel updates, narrow widths, disabled mode, and RPC isolation.
Terminal image protocols require a supported terminal for visual verification.
