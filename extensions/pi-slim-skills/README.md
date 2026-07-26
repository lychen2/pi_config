# pi-slim-skills

Compresses Pi's model-visible skill block into a deterministic name-and-path index. Every installed skill remains callable through `/skill:<name>`.

The default is lossless: all skills remain auto-discoverable. Use `/slim-skills remove <name>` to make one skill command-only, `/slim-skills none` to hide all skills from automatic discovery, and `/slim-skills reset` to restore the default.

Use `/slim-skills inject <name>` to append a skill's full body to every system prompt, and `/slim-skills uninject <name>` to stop. Before appending, the extension checks both the current prompt and the current injection batch so the same body is not added twice.

## Install

```bash
pi install "$(realpath extensions/pi-slim-skills)"
```

State is stored in Pi's official agent directory as `slim-skills-whitelist.json`; it contains the discovery allowlist and the always-injected skill list. Set `SLIM_SKILLS_DISABLE=1` to disable rewriting and injection for one process.

The extension uses Pi's documented `before_agent_start` event and structured skill metadata. Skill-index replacement is fail-closed: if Pi's verbose block does not match, the index is left untouched while configured body injection can still run.

## Development

```bash
npm install
npm run typecheck
npm pack --dry-run
```
