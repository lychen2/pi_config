# pi-slim-skills

Replaces Pi's verbose skill block with a bounded discovery router or a compact description-and-path index. Skill metadata stays available to the workbench search tool; `/skill:<name>` commands remain available to the user.

The repository default (`config/slim-skills-whitelist.json`) uses an empty allowlist and no injected bodies. With `search_skill_bm25` active, the model receives only a short discovery route. Search returns metadata; loading a chosen skill returns its instructions and reference directory.

Without the search tool, visible skill descriptions and exact file paths remain in the prompt. Standalone installations without a config default to the complete compact index. Skills marked `disableModelInvocation` are excluded from automatic discovery.

## Controls

- `/slim-skills add <name>`: pin metadata in the visible index.
- `/slim-skills remove <name>`: leave metadata available on demand.
- `/slim-skills none`: use discovery only when the search tool is available.
- `/slim-skills all` or `reset`: show the complete compact index.
- `/slim-skills inject <name>` and `uninject <name>`: explicitly manage always-loaded bodies. The default injects none.

State lives in Pi's agent directory as `slim-skills-whitelist.json`. `SLIM_SKILLS_DISABLE=1` disables rewriting and injection for one process.

The extension uses `before_agent_start` to update Pi 1.x's structured `skills` section while retaining the full skill catalog for search. It matches the trimmed output of the public `formatSkillsForPrompt` helper, including bash-only sessions. Explicitly injected bodies use a separate `slim_skill_bodies` section; existing bodies are not duplicated. Earlier full-prompt overrides retain their surrounding text. If the generated block is absent, the index is left intact. No keyword-triggered preloading or tool blocking is performed.

## Development

```bash
npm test
npm run typecheck
npm pack --dry-run
```
