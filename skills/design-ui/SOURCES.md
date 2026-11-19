# Maintenance

This locally maintained entry is the single frontend-design skill. It replaces the
host's Downloads-linked `design-ui` and absorbs three skills that previously routed to
each other:

| Former skill | Now | State |
| --- | --- | --- |
| `frontend-design` | [references/direction.md](references/direction.md) | Source retired from deployment. |
| `emil-design-eng` | [references/motion.md](references/motion.md) | Source retired from deployment. |
| `review-animations` | [references/motion.md](references/motion.md), audit section | Already retired from deployment. |

The design recipes draw on episodes 001–020 of 枯白啃设计's [Vibe Design Tips](https://vibedesign.tips/zh/). The icon repair method, type-scale advice, subtraction list and bento grid come from other posts by the same author. Individual episodes and their local references are mapped in [references/ATTRIBUTION.md](references/ATTRIBUTION.md). Reference implementations and icon sets are listed in [references/assets.md](references/assets.md).

Two data-heavy skills stay separate and are loaded on demand from the routing table:
`qiaomu-design` (visual identity, site design-system donors, Chinese typography) and
`ui-ux-pro-max` (searchable pattern database). Merging either would add megabytes to
this entry for guidance most tasks never read.

`kubai-icons` stays separate for a different reason: it ships a runnable engine, an icon
set, a headless self-check, and a static exporter rather than prose. Its licence also
forbids carrying `PROMPT.md` or `SKILL.md` into a derived project, so the routing table
points at the skill instead of absorbing it.

The deployment source is pi_config/skills/design-ui, listed in `installedSkills` in
`scripts/deploy-skills.mjs`. The former host entry is archived by `deploySkills` before
replacement.
