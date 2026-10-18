# UI design workflow

Use the shared entry for a UI task:


```text
/skill:design-ui Improve the settings page using this project's design system.
```

The entry reads project instructions, dependencies, design documentation, tokens, styles, and shared components before writing UI.
Existing projects retain their framework and design conventions.
New interfaces get a compact direction based on their audience, content, and primary action.

## Load guidance for the decision at hand

| Skill | When to use it |
| --- | --- |
| design-ui | Start a UI implementation or improvement task. |
| frontend-design | Choose a visual direction for a new interface or substantial redesign. |
| ui-ux-pro-max | Search local design guidance or draft a new design system. |
| emil-design-eng | Polish component feedback, transitions, tooltips, popovers, or gestures. |
| review-animations | Explicitly audit an existing interaction or animation. |

The entry loads guidance as needed. Skill bodies stay outside the default prompt.
The animation audit preserves disable-model-invocation and requires an explicit command:


```text
/skill:review-animations Review the drawer in src/components/Drawer.vue.
```

A review remains read-only unless the request also authorizes repairs.

## Use local design search

UI/UX Pro Max includes its CSV data and four unchanged Python runtime scripts.
It needs Python 3 and uses only the standard library.
Resolve scripts/search.py from the loaded skill directory, then invoke it through its absolute path.


```sh
python3 "<skill-dir>/scripts/search.py" "keyboard focus form errors" --domain ux --max-results 3
```

Read the returned recommendations against the project's active rules.
Use --stack only for the actual framework; design-system mode ignores that option.
Use --persist only when a saved draft belongs in the task.
Pass --output-dir with the intended project root and -p with the project name.
The result lives at design-system/<project-slug>/MASTER.md, with optional pages/<page-slug>.md overrides.
Existing files remain intact unless --force is passed.
Review and edit a generated draft before adopting its recommendations.

## Inspect the rendered interface

Reuse available browser tools or discover computer-use for a visible browser session.
Inspect desktop and narrow layouts, then exercise the primary action and changed states.
Check keyboard focus, touch behavior, reduced motion, and animation interruption when affected.
A build establishes compilation; screenshots and exercised interactions establish the inspected UI behavior.
Report any missing browser access with its effect on acceptance.

## Install and recover

The five skill directories are maintained in skills/ and listed in scripts/deploy-skills.mjs.
The installer copies them to the selected agent directory's skills/ folder.
For a focused deployment, call deploySkills with these five names in only.
The deployer archives old managed entries before replacement and preserves unrelated skills.
It archives the contents of valid symlinks so backups remain readable.

Run /reload after deployment, then use /skill:design-ui with the task.
For recovery, move the replacement aside and restore the archived entry to its recorded original path.
Archive logs show each original and backup path.

Each imported skill includes SOURCES.md and its upstream license.
Frontend Design retains upstream instructions with a marked project-context addition.
Emil entries use concise local adaptations with project-specific values and rendering checks.
The Downloads-linked design-ui is replaced by the maintained local entry.
The deployment adds no browser server, component registry, animation library, or paid service.
