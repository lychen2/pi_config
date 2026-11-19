# Sources and licenses

| Material | Source | Terms |
| --- | --- | --- |
| Original Chinese skill | [op7418/Humanizer-zh](https://github.com/op7418/Humanizer-zh) | [MIT, © 2026 歸藏](LICENSE) |
| English editing patterns | [blader/humanizer](https://github.com/blader/humanizer), version 2.8.2 | [MIT, © 2025 Siqi Chen](licenses/humanizer-MIT.txt) |
| Chinese diagnostic methods and helpers | [shiujan, Lieflat Less AI Tone](https://github.com/larashero3-dotcom/lieflat-less-ai-tone), commit `53160078a04926d98de57a233549612d1b89bdc9` | [CC BY-NC 4.0, © 2026 shiujan](licenses/lieflat-less-ai-tone-CC-BY-NC-4.0.txt) |
| Editorial background | [Wikipedia: Signs of AI writing](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing), [stop-slop](https://github.com/hardikpandya/stop-slop), [clean-my-output](https://github.com/Byte-Naut/clean-my-output) | Source links; no software bundled from these projects |

The installed bundle consolidates language editing into one entrypoint. It adapts the
Lieflat methods for minimal edits, information preservation, style samples, independent
semantic review and before/after reporting. Local scripts distinguish protected Markdown
content from prose, support short drafts, and present descriptive measurements without
an authorship score or a target punctuation density.

`references/editing-principles.md`, `references/chinese-diagnostics.md`,
`references/semantic-criteria.md`, `scripts/detect.py` and `scripts/report.py` contain
adapted Lieflat material and are distributed under CC BY-NC 4.0. The original MIT notices
remain applicable to their respective material. This bundle is not wholly MIT;
commercial use of its CC BY-NC material requires the relevant permission.

The Anatomy-specific Charts adaptation remains in Anatomy under its own PolyForm
Noncommercial notice. It is not included in this general writing skill.
