# Adapter provenance

The Markdown resources and JavaScript transport come from [NB-Corp/gpt-with-taste](https://github.com/NB-Corp/gpt-with-taste), commit `27e7da1d334725a9084629edca35563d0140e056` (0.1.0). They were generated with `node scripts/build.mjs --target pi`. Runtime reads texts.json and its six generated Markdown files.

Pi transport adapts projection.ts, payload.ts and extension.ts from [SpadeLushen/pi-gpt-with-taste](https://github.com/SpadeLushen/pi-gpt-with-taste/tree/07013409c19fe307d0a951ef5f2b3f72f4c837b3), MIT. THIRD_PARTY_LICENSE preserves its full license.

Changes: dependency-free JavaScript, compiler-owned resources, independent role, factory scope options, compact branch controls and duplicate-registration guard. Request-local section, unanswered-input projection, completion-only custom message routing and OpenAI final-payload recovery retain the reference mechanisms. No behavior Markdown or TOML helper was copied from that transport reference.

## Local writing guidance

`main.md` and its companion role/steer Markdown files include locally maintained execution and writing guidance for every model: completing authorized work without self-limiting disclaimers, affirmative narration without hypothetical strawman objections, concrete subjects/actions/conditions and evidence-calibrated uncertainty, content-led sentence structure, selective comparison, and positive prompt instructions. The route section also tells the agent to read a named page, profile, or document with browser use instead of through search results and mirrors, which serve discovery, and to reach sign-in-gated pages through Zen Browser's dedicated profile using the niri agent seat. The niri-agent skill defines host-specific application isolation and authentication boundaries; the former Zen MCP is disabled. These edits belong to the shared adapter; model-specific upstream presets remain intact. Preserve this customization when rebuilding the adapter.

The shared Main writing section and active UserSteer/AgentSteer reminders also draw on [goldengrape's Chinese expression and anti-defensive writing guidance v1.1](https://gist.github.com/goldengrape/1e271b01520bc9c60da3f35c91021d6f). The local adaptation uses affirmative instructions: evidence-calibrated judgments, specific uncertainty, qualifications selected by their effect on understanding or action, complete explanations, and respect for reader autonomy. It integrates these ideas into existing paragraphs and preserves material risk and verification disclosures. The source's word blacklist and repeated prohibitions are not adopted. Sub and Independent resources retain their existing role-specific text.

Main also prioritizes understanding on the first read: clear subject–verb relationships, unpacked unfamiliar noun stacks, causal links, and useful repetition. Local prose repairs preserve the author's voice. Duplicate writing reminders were consolidated. GPT-specific overrides permit useful headings, contrast, and uncertainty words; fixed sentence limits apply only to documents requiring ASD-STE100. These are local editorial choices, not a claim of experimentally validated readability improvements.

## Local integration

`../taste.ts` registers Main for every provider and model ID. It routes `teammate-complete` messages to AgentSteer. UserSteer follows unanswered user input; tool continuations and other custom messages receive no completion reminder. Sub and Independent resources remain available for explicit role-specific integrations.

Local runtime changes:

- Accept `providers: null` to remove the upstream provider allowlist.
- Append Main during `before_agent_start` so Pi forced-prompt projection preserves it alongside model presets.
- Run final-payload recovery only for OpenAI Responses, Codex Responses, and Completions APIs. Other APIs receive the shared prompt through Pi.

The shared block and steering projections stay request-local. `/taste` controls persist in the current session branch. No separate npm package or global prompt file is installed.

For updates, rebuild the pinned upstream adapter, compare these resources, retain both MIT licenses, and reapply the three runtime changes. Run the bridge tests and typecheck.

## HERO core

`main.md` includes the complete English core block from [HERO-Anti-OverDefense](https://github.com/wanshuiyin/HERO-Anti-OverDefense), `RULES.md` at commit `92686ca5c7dc9f4852cd323e2852219b7e86a8ea`, verbatim: nine rules, calibration examples, counterexamples, and the verification question. MIT copyright 2026 Ruofeng Yang is preserved in `HERO-LICENSE`. The case catalogue and optional Codex Goal Pulse are not part of the upstream core install.

The existing all-model Main transport loads HERO automatically together with taste; `/taste off` disables this combined block. No separate skill, timer or provider is installed. The prior GPT-only HERO summary is replaced by this shared source. Requested ARIS review rounds remain covered by rule 6; taste writing guidance remains active.
