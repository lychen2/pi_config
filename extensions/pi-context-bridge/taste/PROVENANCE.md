# Adapter provenance

The Markdown resources and JavaScript transport come from [NB-Corp/gpt-with-taste](https://github.com/NB-Corp/gpt-with-taste), commit `27e7da1d334725a9084629edca35563d0140e056` (0.1.0). They were generated with `node scripts/build.mjs --target pi`. Runtime reads texts.json and its six generated Markdown files.

Pi transport adapts projection.ts, payload.ts and extension.ts from [SpadeLushen/pi-gpt-with-taste](https://github.com/SpadeLushen/pi-gpt-with-taste/tree/07013409c19fe307d0a951ef5f2b3f72f4c837b3), MIT. THIRD_PARTY_LICENSE preserves its full license.

Changes: dependency-free JavaScript, compiler-owned resources, independent role, factory scope options, compact branch controls and duplicate-registration guard. Request-local section, unanswered-input projection, completion-only custom message routing and OpenAI final-payload recovery retain the reference mechanisms. No behavior Markdown or TOML helper was copied from that transport reference.

## Local integration

`../taste.ts` registers Main for every provider and model ID. It routes `teammate-complete` messages to AgentSteer. UserSteer follows unanswered user input; tool continuations and other custom messages receive no completion reminder. Sub and Independent resources remain available for explicit role-specific integrations.

Local runtime changes:

- Accept `providers: null` to remove the upstream provider allowlist.
- Append Main during `before_agent_start` so Pi forced-prompt projection preserves it alongside model presets.
- Run final-payload recovery only for OpenAI Responses, Codex Responses, and Completions APIs. Other APIs receive the shared prompt through Pi.

The shared block and steering projections stay request-local. `/taste` controls persist in the current session branch. No separate npm package or global prompt file is installed.

For updates, rebuild the pinned upstream adapter, compare these resources, retain both MIT licenses, and reapply the three runtime changes. Run the bridge tests and typecheck.
