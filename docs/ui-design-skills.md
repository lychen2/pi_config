# UI design workflow

Use the shared entry for a UI task:


```text
/skill:design-ui Improve the settings page using this project's design system.
```

The entry reads project instructions, dependencies, design documentation, tokens, styles, and shared components before writing UI.
Existing projects retain their framework and design conventions.
New interfaces get a compact direction based on their audience, content, and primary action.

## Load guidance for the decision at hand

| Entry | When to use it |
| --- | --- |
| design-ui | Every UI task: implementation, improvement, craft polish, or an animation audit. |
| design-ui `references/direction.md` | A new interface, substantial redesign, or a brief without a visual direction. |
| design-ui `references/spec.md` | "Make it feel crafted": write the ten-section spec before the code. |
| design-ui `references/motion.md` | Component feedback, transitions, overlays, gestures, menus, drag and drop, or an effect audit. |
| design-ui `references/typesetting.md` | Bad wrapping, lone-word headings, jittering numbers, or Chinese and Latin spacing. |
| design-ui `references/effects.md` | ASCII, dither, halftone, or grain applied to one asset. |
| design-ui `references/assets.md` | A reference implementation, icon set, or named style anchor, with licences. |
| design-ui `references/icons.md` | An app icon, favicon, or an icon set that must feel like one family. |
| ui-ux-pro-max | Search local design guidance or draft a new design system. |
| qiaomu-design | Distinctive visual identity, site design-system donors, Chinese typography, covers. |
| huashu-motion | Create editable motion graphics, launch films, or explainer videos. |

The entry loads one path per task. Skill bodies stay outside the default prompt.
Use the motion entry to create a film:

```text
/skill:huashu-motion Create a 30-second launch film using this product’s screenshots and brand assets.
```

The motion skill bundles its CLI and assets locally. Run `<skill-dir>/bin/om doctor` to inspect rendering prerequisites.
The former `frontend-design`, `emil-design-eng`, and `review-animations` skills now live as references inside `design-ui`; their licences are retained in `skills/design-ui/references/`.

Huashu Motion remains the general motion-film entry, with MIT licensing and a bundled local studio.
[OneTake](https://github.com/feitangyuan/onetake/tree/013a61ac8d98883c73733f59c06e49e9ba444f14) overlaps in short product films, HTML compositions, sound, and frame-by-frame export.
Its distinct focus is continuous-shot choreography, measured moves, multilingual timing, and continuity diagnostics.
Its PolyForm Noncommercial license limits permitted use to noncommercial purposes; it is excluded from the managed default skills.
Keep `explainer-videos` for narrated teaching and `manimgx` for mathematical animation.

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

Reuse available browser tools for a visible browser session.
Inspect desktop and narrow layouts, then exercise the primary action and changed states.
Check keyboard focus, touch behavior, reduced motion, and animation interruption when affected.
A build establishes compilation; screenshots and exercised interactions establish the inspected UI behavior.
Report any missing browser access with its effect on acceptance.

## Install and recover

The three skill directories are maintained in skills/ and listed in scripts/deploy-skills.mjs.
The installer copies them to the selected agent directory's skills/ folder.
For a focused deployment, call deploySkills with these three names in only.
The deployer archives old managed entries before replacement and preserves unrelated skills.
It archives the contents of valid symlinks so backups remain readable.

Run /reload after deployment, then use /skill:design-ui with the task.
For recovery, move the replacement aside and restore the archived entry to its recorded original path.
Archive logs show each original and backup path.

Each imported skill includes SOURCES.md and its upstream license.
Frontend Design's upstream instructions survive as `design-ui/references/direction.md` with the project-context paragraph kept; the Apache-2.0 text is retained there.
The Emil entry and the animation audit became `design-ui/references/motion.md`, with their MIT texts retained.
Huashu Motion retains upstream instructions and references, with local CLI packaging documented in its SOURCES.md.
The Downloads-linked design-ui is replaced by the maintained local entry.
Huashu Motion includes a local studio and animation runtime.
Launching the studio, installing optional tools, and exporting films follow the active task’s requirements and authority.
