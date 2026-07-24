# pi-slim-skills

Compresses Pi's model-visible skill block into a deterministic name-and-path index. Every installed skill remains callable through `/skill:<name>`.

The default is lossless: all skills remain auto-discoverable. Use `/slim-skills remove <name>` to make one skill command-only, `/slim-skills none` to hide all skills from automatic discovery, and `/slim-skills reset` to restore the default.

## Install

```bash
pi install npm:pi-slim-skills
```

State is stored in Pi's official agent directory as `slim-skills-whitelist.json`. Set `SLIM_SKILLS_DISABLE=1` to disable rewriting for one process.

The extension uses Pi's documented `before_agent_start` event and structured skill metadata. Its replacement is fail-closed: if Pi's verbose skill block does not match, the system prompt is left untouched.

## Development

```bash
npm install
npm run typecheck
npm pack --dry-run
```
