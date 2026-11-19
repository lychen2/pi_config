# Attribution

This skill merges three previously separate skills plus material from a design-tip
series. Licences for third-party code and text are retained beside this file.

| Part | Source | Licence | Local change |
| --- | --- | --- | --- |
| [direction.md](direction.md) | Anthropic `frontend-design`, commit `dbd4588f9e1033efb41dad4bef2f7947c8993d44` ([skills repo](https://github.com/anthropics/skills)) | Apache-2.0, [full text](LICENSE-frontend-design-Apache-2.0.txt) | Compacted; project-discovery paragraph kept; no code or scripts. |
| [motion.md](motion.md) | Emil Kowalski's design engineering skill ([emilkowalski](https://github.com/emilkowalski)), previously local `emil-design-eng` | MIT, [full text](LICENSE-emil-design-eng-MIT.txt) | Rewritten and merged with the rendering budget and the audit checklist. |
| [motion.md](motion.md), audit section | Local `review-animations` | MIT, [full text](LICENSE-review-animations-MIT.txt) | Folded into the checklist; the separate skill retired. |
| [spec.md](spec.md) | 枯白啃设计 (@Kubai087), [001 button material](https://vibedesign.tips/zh/001-skeuomorphic-buttons/), [004 nested corners](https://vibedesign.tips/zh/004-continuous-corners/), [006 book cards](https://vibedesign.tips/zh/006-book-cards/) | Prompt text published by the author for reuse | Adapted as a craft spec with component-specific scope and numeric defaults. |
| [motion.md](motion.md), menus and drag | [002 cascading menus](https://vibedesign.tips/zh/002-cascade-menu/), [005 drag to reorder](https://vibedesign.tips/zh/005-drag-ripple/) | Same | Condensed to the timing values, geometry and state rules. |
| [typesetting.md](typesetting.md) | [007 typesetting](https://vibedesign.tips/zh/007-type-switches/) | Same | CSS switches, language-specific caveats and localized label fit. |
| [effects.md](effects.md) | [003 ASCII and dither](https://vibedesign.tips/zh/003-ascii-dither/) | Same | Parameter table, sampling method and starting values. |
| [assets.md](assets.md), fingerprints | Ayush Soni's generated-design checklist, relayed by Kubai087 | Checklist of observed traits | Reordered around what to do instead, and linked to the licence rules for the assets. |
| [icons.md](icons.md) | Kubai087, icon posts: gradient/texture/material, Icon versus Logo, the five repair rules for generated icons, and Liquid Glass export | Author's published method | Rewritten as a workflow with a delivery list. |
| Separate skill `kubai-icons` | [kubai087/kubai-icons](https://github.com/kubai087/kubai-icons) at `f4dc5bb` | Kubai Icons License, source-available (terms in that skill's `LICENSE`) | Installed unmodified; this entry only routes functional icon sets to it. |
| [direction.md](direction.md), layout and subtraction | Kubai087, posts on alignment and benchmark type scales, the ten old design rules in the AI era, and the bento feature grid | Author's experience notes | Converted from observations into checks and defaults. |
| [motion.md](motion.md), easing and durations | User-supplied [011 easing curves](https://vibedesign.tips/zh/011-easing-curves/) | Not specified in the supplied excerpt | Role tokens, timing-only retrofit, gestures and reduced motion. |
| [liquid-glass.md](liquid-glass.md) | User-supplied [010 liquid glass](https://vibedesign.tips/zh/010-liquid-glass/) | Not specified in the supplied excerpt | Six layers, theme tokens, rim lens, backdrop sampling and accessible fallbacks. |
| [floating-ui.md](floating-ui.md) | User-supplied [009 overlays](https://vibedesign.tips/zh/009-overlays/) | Not specified in the supplied excerpt | Component selection, keyboard and touch behaviour and unsaved state. |
| [docs-layout.md](docs-layout.md) | User-supplied [008 wiki layout](https://vibedesign.tips/zh/008-wiki-layout/) | Not specified in the supplied excerpt | Independent scrolling, navigation, mobile sheets and article endings. |
| [signature-effects.md](signature-effects.md) | [012 message bubbles](https://vibedesign.tips/zh/012-message-bubbles/), [013 shockwave halo](https://vibedesign.tips/zh/013-shockwave-glow/), [014 card deletion](https://vibedesign.tips/zh/014-card-delete/), [018 holographic card](https://vibedesign.tips/zh/018-holo-card/) | See source pages | Material choice, event timing, render boundaries, focus and fallbacks. |
| [motion.md](motion.md#shared-element-transitions), continuity | [015 UI continuity](https://vibedesign.tips/zh/015-ui-continuity/) | See source page | Source and destination matching, return gestures and focus handoff. |
| [feedback.md](feedback.md) | [016 toasts and notifications](https://vibedesign.tips/zh/016-toast-or-notification/), [017 loading states](https://vibedesign.tips/zh/017-loading-states/) | See source pages | Message persistence, recoverable failures, loading thresholds and optimistic rollback. |
| [scroll-cards.md](scroll-cards.md) | [019 scroll-driven cards](https://vibedesign.tips/zh/019-scroll-cards/) | See source page | Pattern choice, reversible scroll progress and small-screen layouts. |
| [choice-controls.md](choice-controls.md) | [020 choice controls](https://vibedesign.tips/zh/020-choice-controls/) | See source page | Value, action, commit point, cardinality and accessible input. |

Episode numbers and links follow the author's [Chinese Vibe Design Tips index](https://vibedesign.tips/zh/). The other icon and layout posts are credited to [@Kubai087](https://x.com/Kubai087).

## Baoyu integration

The optional `claude-design`, `claude-design-system`, and `dataviz` skills come from
[baoyu-design](https://github.com/jimliu/baoyu-design), commit
`8398e52f3c58ab12e080e8579de66dcb02ea384a`. They remain separate local skills.
Their original NOTICE, LICENSE, references, and editor notices are retained.
The upstream material has mixed licensing; MIT does not cover all of it.
Local adapters add workflow routing, visual acceptance, frontend handoff, process
ownership, and author metadata rules. See [baoyu.md](baoyu.md) for maintenance.

## What changed in the merge

The three skills routed to each other and repeated the same instructions. The
consolidated entry states the workflow once and keeps depth in references that are read
only when the task needs them. Deliberately not merged: `qiaomu-design` (a 1.3 MB
library with 58 site design-system donors and Chinese typography) and `ui-ux-pro-max` (a
searchable pattern database). Both are data-heavy and load on demand.

Gaps filled from the tip series, which none of the merged skills covered:

- Material as five tokenised layers, with inset highlights in the element's own
  `box-shadow` so corners line up, and equal inset counts across states so shadows
  animate instead of jumping.
- Radius progression (inner = outer − padding) and continuous corners as progressive
  enhancement, including the `@supports` guard and browser limits.
- Shadow as two pre-blurred solid shapes crossfaded by one progress value, which removes
  the ring artifact of an animated `box-shadow`.
- Cascading-menu safe-zone geometry and its three delays.
- Drag-reorder ripple values (`A × 0.7^n`, `24ms × n`) and the lift and drop-hint rules.
- A CSS-level typesetting pass for Chinese and Latin text, with the caveat attached to
  every switch.
- An icon repair path: reduce volume first, express it with gradient, drop inner glow and
  inner shadow, tint shadows with the surface hue, and export layers for Liquid Glass.
- Layout discipline that survives review: one alignment per information level, and a type
  scale borrowed from a named benchmark product instead of invented.
- The subtraction list (fake data, logo walls, invented sections) and the bento feature
  grid for explaining three to five features at once.
- Craft details that carry a bento grid: top inner glow, 1px outline, layered shadow.
- The Icon/Logo split, construction lines as a maintenance device, and the diagnosis that
  a model lights an icon as if it were physical.
- Metaphor as a design method: let the object carry the interaction instead of decorating
  a form.
- Shortcut teaching as a timed interaction: the hover pause is the learning moment.
- Matching the aesthetic to the work: a tool someone works in is judged by legibility, a
  page someone visits is judged by whether it holds attention.
- Optical alignment for text-plus-shape controls, and the CJK box that centres high or low
  when only `line-height` is used.
- Presentation patterns: line-drawn feature cards that draw themselves, a single
  occasion ceremony tied to release data, line-art or 2.5D empty states and onboarding.
- Reusing the product's component library for its marketing page, and deconstructing
  three to five competitor pages before designing.
- One repeated motif across UI and collateral as the cheapest form of identity.
- Brief-writing guidance: describe the feel rather than the pixels, and name components
  with the library's own vocabulary.
- Animated button craft to study (Evil Buttons), as reference rather than default.
- Hit-testing on the resting footprint with `pointer-events: none` on moving layers.
- A rendering budget stated as prohibitions: what must never be animated, one loop,
  cached style writes, no per-frame layout reads.
