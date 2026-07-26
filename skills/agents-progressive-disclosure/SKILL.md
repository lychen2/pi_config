---
name: agents-progressive-disclosure
description: Refactor bloated AGENTS.md, CLAUDE.md, or similar agent instruction files into a compact routing entrypoint plus focused docs/ reference files. Use when the user asks to apply progressive disclosure to agent instructions, split global or project rules into docs, reduce instruction bloat, or turn one large agent rule file into an entry file with on-demand documentation.
---

# Agents Progressive Disclosure

Use this skill to convert a long agent instruction file into a high-signal entrypoint that routes to focused documentation files. The goal is to preserve rules while reducing always-loaded context.

## Core Model

Treat the root instruction file as a router, not a rule warehouse.

- The entry file keeps only high-frequency, long-lived, must-always-apply rules.
- Detailed task-specific rules move into `docs/` files.
- The entry file includes a clear “read this doc when...” index.
- The agent should load only the docs relevant to the current task.

## Workflow

1. Identify the target instruction file.
   - Prefer the current directory's `AGENTS.md` unless the user names another file.
   - Also support `CLAUDE.md`, `GEMINI.md`, or project-specific equivalents.

2. Inspect existing structure.
   - Read the target file fully.
   - List existing `docs/` files, if any.
   - Check for backups before editing.

3. Classify rules into buckets.
   - Keep in entrypoint: language defaults, safety boundaries, tool priority, conflict priority, and critical must-always-follow rules.
   - Move to docs: command catalogs, search strategies, framework-specific instructions, package-manager rules, environment setup, Git workflow, deployment, testing, document style, domain terminology, long examples.

4. Design the docs map.
   - Use existing `docs/` names when they already fit.
   - Otherwise create focused names such as:
     - `docs/response-style.md`
     - `docs/search-and-evidence.md`
     - `docs/local-environment.md`
     - `docs/project-workflow.md`
     - `docs/domain-context.md`
   - Create `docs/README.md` only when it helps navigate multiple docs.

5. Edit conservatively.
   - Back up the original file before replacing it.
   - Rewrite the entrypoint as a compact router with:
     - scope statement;
     - core principles;
     - on-demand docs index;
     - always-on safety/tool rules;
     - precedence rules.
   - Move detailed rules into docs without changing their intent.
   - Avoid duplicating the same long rule in multiple places.

6. Validate preservation.
   - Compare line counts before and after.
   - Search for critical keywords from the original file across the new entrypoint and docs.
   - Verify the entrypoint tells future agents when to read each doc.
   - Check that no doc contradicts the entrypoint.

## Suggested Entrypoint Shape

```md
# Agent Instructions

> Scope: This file is the entrypoint. It keeps only always-on rules; task details live in docs/.

## Core Principles

- [language/default behavior]
- [safety boundary]
- [primary tool or evidence policy]
- [this file is a router, not a warehouse]

## Read-On-Demand Index

| Task type | Read first | Trigger |
| --- | --- | --- |
| Search and evidence | `docs/search-and-evidence.md` | Current info, URLs, official docs, high-risk claims |
| Local commands | `docs/local-environment.md` | Shell, paths, environment, tools |

## Always-On Rules

- [short critical rules]

## Priority

1. User's current explicit instruction.
2. Nearest project instruction file.
3. This file.
4. Routed docs details.
```

## Validation Commands

Use macOS/zsh-compatible commands:

```zsh
wc -l AGENTS.md docs/*.md
find docs -maxdepth 1 -type f -print | sort
rg -n 'critical keyword|another keyword' AGENTS.md docs
sed -n '1,180p' AGENTS.md
```

Choose critical keywords from the source file, not from the template.

## Guardrails

- Do not delete rules merely because they are verbose; move them to the right doc.
- Do not bury safety-critical rules only in a routed doc.
- Do not create many tiny docs with overlapping responsibilities.
- Do not add project-specific opinions that were not in the source file unless the user asks.
- Do not claim installation into Codex unless you actually copy or install the skill into the active skills directory and verify it.
