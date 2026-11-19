---
name: design-ui
description: 前端与 UI 设计的统一入口。用于新页面、重设计、界面打磨、中文排版、动效、设计系统和图表；自动组合内部设计资料与工具，优先从项目上下文推断常规细节并同轮完成实现与验收，仅在目标或范围存在实质分歧时向用户提问。
---

# Design UI

Single entry for frontend design work: new pages, redesigns, component polish,
signature interactions, and effect audits.

## Own one user-facing workflow

The user describes the desired result; choose the methods and tools internally.
Treat `ui-ux-pro-max`, `qiaomu-design`, `claude-design`,
`claude-design-system`, `kubai-icons`, and `dataviz` as supporting modules of this entry.
Read their files when needed; do not ask the user to choose a skill or repeat the brief.
Use one sequence: understand the task, settle direction, implement, inspect.
Supporting modules supply references and tools, not additional mandatory workflows.
Use the current provider and model unless the user explicitly requests a change.

Infer ordinary details from the project and request. Ask when an unresolved answer
changes the audience, primary task, deliverable, design direction, scope, or acceptance.
Ask in product terms, such as which action the page should prioritize.
Offer concrete alternatives and a recommendation when helpful.
Group related questions, then apply the answer to the same workflow.
Continue independent work while a necessary answer is pending.
Do not invent a selection gate for an already settled direction.
When the user requests alternatives, show meaningful visual options and ask for a
choice unless they authorize you to choose. A routine repair needs no direction round.
For a multi-surface audit of overlays, transitions, feedback or choice controls, show the findings and wait for the user to select the changes. Implement a specifically requested component directly. Ask before changing when a setting is saved or what an action does.

## Read the project before writing UI

1. Read applicable project instructions and the files affected by the request.
2. Inspect the package manifest, framework, component library, and existing dependencies.
3. Find and read the design documentation, token definitions, theme configuration, global styles, and relevant shared components.
4. Read the relevant page and adjacent components, including responsive and interaction states.
5. State the constraints you will reuse before choosing a direction or writing code.

Use the project's documented precedence. Check page-specific design rules when present.
Resolve conflicts between documents and active components before changing shared tokens.
For an existing interface, extend its typography, spacing, colors, surfaces, and interaction patterns.
For a new interface, choose a compact design direction based on audience, content, and the primary action.
Record only the decisions needed for the requested work. A small repair needs no new design document.

## Choose the depth of the task

| Task | Path | Read |
| --- | --- | --- |
| New page, redesign, or a brief without a visual direction | Two passes in the same run: internal token plan & self-review, then build | [references/direction.md](references/direction.md) |
| General polish ("更有质感"), tactile buttons, nested corners, book cards or a signature interaction without a dedicated recipe | Draft the compact spec and implement it in the same run | [references/spec.md](references/spec.md) |
| Auditing or consolidating floating UI across multiple uses | Inventory uses, recommend kinds, wait for approval before batch-changing code (implement single requested controls directly) | [references/floating-ui.md](references/floating-ui.md) |
| Wiki, docs, or help-center layout across desktop and mobile | Update the shared layout, scrolling navigation, article ending, and mobile sheets | [references/docs-layout.md](references/docs-layout.md) |
| Easing and duration tuning, gestures, overlays or motion audit | Assign curves by role and preserve paths and triggers for timing work | [references/motion.md](references/motion.md) |
| A card, row or compact player jumps when opened or closed | Match the element across states and check the return trip | [Shared-element transitions](references/motion.md#shared-element-transitions) |
| Toasts, notifications, Undo or long-running jobs, loading, skeletons, optimistic or streamed results | Choose feedback by cause, duration and recovery | [Result messages and loading states](references/feedback.md) |
| Switches, checkboxes, radios, segments, tabs, selects or action menus | Choose by commit point, cardinality and value versus command | [Choosing a control](references/choice-controls.md) |
| Chat bubble materials, an assistant halo, card deletion or a holographic pass | Match motion to the named component | [Bubbles](references/signature-effects.md#message-bubbles), [halo](references/signature-effects.md#shockwave-halo), [deletion](references/signature-effects.md#card-deletion), [holographic cards](references/signature-effects.md#holographic-cards) |
| Scroll-driven card stacks, decks, galleries, cover flow or an expanding image | Map native scroll progress to the chosen section | [Scroll-driven cards](references/scroll-cards.md) |
| Liquid glass, adaptive translucent cards or panels, rim refraction | Retrofit surfaces through shared tokens; preserve layout and validate the lens fallback | [references/liquid-glass.md](references/liquid-glass.md) |
| Bad wrapping, lone-word headings, jittering numbers, Chinese and Latin spacing | Global CSS switches, progressive enhancement only | [references/typesetting.md](references/typesetting.md) |
| ASCII, dither, halftone, or grain as a texture on one asset | Parameterised effect layer plus a control panel | [references/effects.md](references/effects.md) |
| A real implementation to learn from, an icon library, or a named style anchor | Check each licence before copying | [references/assets.md](references/assets.md) |
| Editable side-by-side artboards, canvas prototypes, or explicit claude-design | Explore in the local canvas, then implement in the project when requested | [references/baoyu.md](references/baoyu.md), then Skill `claude-design` |
| Editable token library, brand book, or design system imported from code | Preserve real tokens and components in the local system editor | [references/baoyu.md](references/baoyu.md), then Skill `claude-design-system` |
| Charts, KPI visualizations, or dashboard chart design | Choose the form, validate colors, inspect labels and interactions | [references/baoyu.md](references/baoyu.md), then Skill `dataviz` |
| Searchable pattern or design-system draft | Query local data; judge suggestions against the project | Skill `ui-ux-pro-max` |
| Distinctive visual identity, Chinese typography, or design-system references | Read only the relevant internal reference; keep this workflow in charge | [references/internal-modules.md](references/internal-modules.md) |
| An app icon, a favicon, or a brand mark at small size | Reduce volume before adding detail | [references/icons.md](references/icons.md) |
| A functional icon set for navigation and features, hover-morphing or static SVG | Reuse one engine, one accent, one construction | Skill `kubai-icons` |
| Motion graphics, launch films, explainer videos | Different artifact from interface motion | Skill `huashu-motion` |

Load the primary path and only the supporting skills that the deliverable needs.
Use `design-ui` as the overall workflow owner; supporting skills supply formats, tools, or specialist guidance.
Skip the references for a small repair.
Browse [references/assets.md](references/assets.md) when the brief needs a concrete model
to imitate rather than another description.

## Describe the change well

- Say what the surface should feel like. A described feel lets the implementation solve
  the responsive layout itself; a pile of exact pixel values can stop it from adapting at
  all. Reuse system values first; recipe numbers are starting points where tokens are missing.
- Name components with the library's own vocabulary (popover, sheet, segmented control,
  data table). Precise nouns produce far better structure than "the box thing".
- Name the one thing that must stay recognisable, and let everything else follow from
  the existing system.

## Write the spec before the code

For general polish, draft the current state, variant, interaction and acceptance criteria using [references/spec.md](references/spec.md). For a named task in the table, use that recipe's scope and checks. A timing pass preserves paths and triggers. A material retrofit preserves geometry, copy and controls. Match overlay selection to the current styling and docs layout to the existing content and identity.

## Build with the project

Reuse shared components and semantic tokens. Add a token only when the design needs a reusable value.
Preserve the current framework and component library unless migration is requested.
Use CSS for ordinary state transitions. Consider existing Motion dependencies for React layout, exit, or gesture behavior.
Consider existing GSAP dependencies for coordinated timelines, scroll scenes, or complex SVG animation.
Choose any new dependency from a demonstrated requirement and the task's installation authority.
Keep content, assets, forms, loading, empty, error, and success states appropriate to the requested flow.
Use clear labels, visible focus, semantic controls, readable contrast, and comfortable touch targets.
Respect reduced motion, reduced transparency, forced colours, and touch input. Keep essential actions usable during transitions.

## Inspect the result

Run the project's required checks for the affected behavior.
Use available browser tooling; discover computer-use if a visible browser workflow is needed.
Inspect actual screenshots at desktop and a narrow viewport, including approximately 390px when relevant.
Exercise the primary action, keyboard focus, and changed states. Check overflow, wrapping, and image cropping.
For motion, check interruption, repeated activation, and reduced-motion behavior.
For a picker or form control, keep hover and selected states visible while the second
value is chosen, and remove any flicker between the two selections.
For a motion-only or geometry-preserving spec, confirm the resting layout is unchanged.
For a material retrofit, verify the requested surface change in both themes without
changing geometry, content, or interaction. Inspect readability and the solid fallback.
For docs-layout work, capture the actual page top, middle, end, and phone-width
states specified in its reference, including the opened mobile navigation sheet.

Then try to break what you built, in the browser:

- Walk the wrong order, an empty input, a very long label, and rapid repeated clicks.
- List the flow's states and check success, error, and each user role.
- Capture the same view before and after the change, not two different pages.
- Ask the user the questions that would change the design instead of guessing an answer.

Fix visible or functional defects before delivery.
Report the changed behavior, checks performed, and any browser access gap that prevented acceptance.

Sources, licences, and what the merge changed: [references/ATTRIBUTION.md](references/ATTRIBUTION.md).
