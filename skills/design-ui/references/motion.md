# Motion and feedback

Read this when a state change, input response, overlay, gesture, or repeated
interaction needs to feel right. Use [spec.md](spec.md) when the ask is a signature
interaction with a written specification, and [direction.md](direction.md) for a new
visual direction.
For choosing the overlay kind rather than its timing, read
[floating-ui.md](floating-ui.md); preserve motion during that selection review.

## Decide what motion contributes

Answer three questions before writing animation code.

1. **Should it move?** How often will the interface repeat this? Frequent keyboard
   actions stay immediate. Repeated decorative entrances stop being information.
2. **What does it explain?** State change, spatial continuity, or acknowledgement of
   input. If none applies, omit new motion. In a timing-only retrofit, report existing
   decorative motion without removing it.
3. **How fast and with what curve?** Match the interface's existing duration and easing
   tokens before introducing new values, then judge the result on the real distance,
   content, and input device.

Feedback stays independent of network latency: show pending and completion states for
asynchronous actions.

## Easing and duration retrofits

Use this path when the request is to improve existing animation timing. Preserve what
animates, its start and end values, distance, path, trigger, and interaction semantics.
Change the timing curve and unsuitable durations only. Do not add blur, scale, stagger,
or a new entrance as part of a timing repair. Ask before changing an animation whose
role remains unclear after reading its component and callers.

### Start from what exists

Inventory all animations in the requested scope: CSS transitions and keyframes,
Framer Motion / Motion, GSAP, Web Animations API, and hand-written
`requestAnimationFrame` loops. A product-wide request needs a product-wide inventory;
a component request stays within that component and its shared motion definitions.
Record each component and file, trigger, animated properties, duration, delay, current
curve or spring settings, and proposed role, curve, and duration. Show this inventory
before editing; use one row per distinct animation, not one row per property.

Flag implicit CSS `ease`, `linear` used for a discrete entrance or relocation, and
`ease-in` used for an entrance. Resolve inherited tokens and library defaults before
calling a curve unset. Constant-rate loops are valid uses of `linear`.

On a progress-versus-time graph, the slope is the rate of progress; a change in slope
is acceleration. A steeper segment means faster movement over the same distance and
duration, not necessarily a sharper change of speed. Duration sets the overall time;
easing distributes movement within it.

### Shared curve tokens

Define the roles beside the existing motion tokens, reusing the project's naming and
single source of truth. Use the same roles in CSS and animation libraries; do not
maintain independently tuned values per component. For a role-based timing pass, use
this palette, with a native velocity-aware spring for gesture release when available:

```css
:root {
  --ease-out: cubic-bezier(0, 0, .58, 1);
  --ease-out-strong: cubic-bezier(.22, 1, .36, 1);
  --ease-in: cubic-bezier(.42, 0, 1, 1);
  --ease-in-out: cubic-bezier(.42, 0, .58, 1);
  --ease-overshoot: cubic-bezier(.34, 1.56, .64, 1);
  --ease-spring: var(--ease-out-strong);
  --duration-sm: 200ms;
  --duration-md: 300ms;
  --duration-lg: 400ms;
  --duration-sm-out: 160ms;
  --duration-md-out: 250ms;
  --duration-lg-out: 320ms;
  --duration-feedback: 120ms;
}

@supports (animation-timing-function: linear(0, 1)) {
  :root {
    --ease-spring: linear(0, .32, .78, 1.04, 1.09, 1.06, 1.02, 1, .99, .99, 1);
  }
}
```

| Role | Curve | Application |
| --- | --- | --- |
| Entrance | `--ease-out` | Toast, menu, popover, dialog, drawer: immediate movement, gradual stop. |
| Small click response | `--ease-out-strong` | Icon, label, selected pill: fast initial response and a longer deceleration. A control's travelling selection indicator uses the relocation role. |
| Exit | `--ease-in` | Dismissed toast, closing dialog or drawer, collapsing menu, removed list item. Use only for leaving; its slow start delays an entrance and its fast finish stops abruptly. |
| On-screen relocation or resize | `--ease-in-out` | Tab or segmented-control indicator, carousel, neighbours making room in a reorder, sidebar resize, custom anchor scrolling. Its slow start is unsuitable for an entrance. |
| Small, occasional confirmation | `--ease-overshoot` | Check, like, badge, switch knob. Roughly 10% overshoot. No dialogs, drawers, elements larger than about 64px, or actions repeated throughout the day. |
| Release after direct manipulation | Native spring, otherwise `--ease-spring` | Sheet snapping to a detent, cancelled card swipe, pull-to-refresh return, dragged item settling. Supply release velocity to the library spring. The CSS token approximates a fixed settle and cannot carry that velocity. |
| Continuous activity | `linear` | Spinners, progress indicators, marquees. Do not replace measured progress with a decorative timeline. |

The `linear` keyword is constant-rate; `linear(...)` can approximate a spring using
piecewise-linear stops. The `@supports` guard keeps the strong ease-out fallback where
that syntax is unavailable. Implicit CSS `ease` is not a role: replace it with an
explicit role token during the timing pass. Native smooth scrolling has
browser-controlled timing; use the relocation curve only if the product already owns
the scroll animation, without replacing native scrolling just to change its easing.

### Durations

- Small UI such as tooltips, menus, toasts, and checks: `150–250ms` in, `120–200ms` out.
- Medium content such as dialogs, content popovers, and drawers: `250–350ms` in.
- Large sheets and full-screen or page transitions: `350–500ms` in. Longer ordinary
  transitions usually delay the interaction unnecessarily.
- Exits are shorter than the corresponding entrances. Keep exit and feedback durations
  beside the size tokens; the values above are initial defaults, not per-component overrides.
- Overshoot and fixed-duration spring approximations need about `1.5×` the plain
  duration for settling. Tune a native spring through its physical parameters and
  settling behaviour rather than forcing that multiplier onto its duration.
- Hover and press feedback: `100–150ms` on ease-out. Never animate layout on hover.

### Applying roles without changing scope

In a timing-only pass, keep the existing path, distance, properties, and sequence.
When new motion or a broader motion redesign is requested, use these starting points:

- Entrances originate at the related edge or trigger. A small overlay can move
  `8–24px` and scale from about `0.96`; drawers retain their required travel. Let its
  opacity finish slightly before its movement. A toast may use a subtle blur near
  `8px` only when the effect is requested and its rendering cost is acceptable.
- Exits reverse the entrance path on ease-in with a shorter duration.
- Parts inside an appearing element may follow `100–200ms` later on strong ease-out
  when a short sequence helps comprehension. Never delay access to a control.
- During a drag, follow the pointer or finger 1:1 without easing. Apply the spring on
  release. Neighbouring items making room use ease-in-out; the released item springs
  to its destination.
- For size changes, prefer the project's existing layout-animation or FLIP mechanism
  to per-frame width and height transitions; keep text and icons undistorted.

### Delivery

Show the current-to-proposed inventory first. Then update shared tokens and all
affected consumers in the authorised scope, list the files changed, and exercise
entrances, exits, relocation, interruption, gesture release, and reduced motion that
the changed components actually use. Leave unrelated motion alone.

## Component patterns

- **Buttons.** Immediate hover, focus, active, and disabled feedback. A subtle press
  transform helps tactile controls; check text clarity and that the target does not
  move away from the pointer.
- **Popovers, modals, tooltips.** Anchor a popover's transform origin to its trigger
  when scale communicates attachment; a centred modal can keep a centred origin.
  Choose the initial scale from the design rather than a universal constant. Preserve
  focus placement, dismissal, and focus return. Let the second tooltip in a related
  group appear promptly, and reuse the component library's delay and placement.
- **Cascading menus.** Keep nested submenus steady with a safe zone and three delays: a submenu opens on purpose, survives diagonal moves toward it, and does not vanish on a brief slip out.
  - **Open delay** `220ms` on hover, cancelled if the pointer leaves first; touch acts at once.
  - **Safe zone**: a triangle from the pointer's previous position to the two corners of the submenu's near edge, limited to the parent's last `min(90px, max(56px, 43% of parent width))` toward the submenu. Use the older of the last two pointer positions as the apex so the triangle never collapses. Rows crossed inside the zone must not highlight or open.
  - **Safe window**: a row hovered inside the zone does not switch at once. Recheck every `80ms`, and switch once the pointer leaves the zone or after `1200ms` from the hover start, so a pointer that simply stops there still gets its submenu.
  - **Close delay** `360ms` after leaving the anchor, the open levels, and the zone; returning in time cancels it. Outside click closes at once. Dragging an item over a folder row opens it after `420ms`. A pointer inside an open submenu ends all protection.
  - Drive row highlight from component state (hovered, active, skipped), not from CSS `:hover`, or rows crossed inside the safe zone will still light up.
  - Geometry: submenus overlap the parent by `8px` and align their first row, flip side when there is no room, are 210–260px wide with `max-height: min(420px, 100vh - 24px)` and their own scroll, `6px` padding, `12px` radius, a 1px border, and `backdrop-filter: blur(18px) saturate(135%)`. Rows are `32px` tall, `8px` radius, `4px` apart; the level title is 11px at weight 600.
  - Motion: a submenu enters from `translateX(-8px) scale(0.88, 0.98)` and opacity 0, with opacity finishing before the transform; use the shared small and medium entrance durations on `--ease-out`. The root level enters from `translateY(-6px) scale(0.96, 0.86)` with a top-left origin. Exit on `--ease-in` with the corresponding shorter duration. Menus do not use confirmation overshoot.
  - Keyboard: arrows move through rows, Right or Enter opens a folder, Left backs out a level, Escape closes everything and returns focus to the anchor. Use `menu`/`menuitem` roles and `aria-expanded` on folder rows.
  - Keep every timing in one named-constants block, keep the safe-zone math in a pure helper (point-in-triangle by the sign of three edge cross products), and add an optional debug overlay that draws the zone and the running timer, off by default.
- **Drag to reorder.** Cursor: a pointing hand over draggable items, a grabbing hand while dragging. Lift the picked item so it never hides its landing place: above a horizontal row, or pulled aside and shrunk to about 90% in a vertical list, with its old slot closing up. Show the drop hint as a faint thin line at about 15% of the text colour, growing from its middle and moving to each new gap, never over the item's own slot. Items on both sides of the line move away: item `n`, counting from the line, moves `A * 0.7^n` (about `10px` for icons, `8px` for cards) and starts `24ms * n` later on ease-in-out over about `0.25s`. The dragged item follows the pointer 1:1; on release it springs into place using the release velocity, while neighbouring items use the relocation curve. Escape or dropping outside cancels and returns the item to its slot. Move things with transforms, not layout, support keyboard reordering, and with reduced motion keep only the line.
- **Teaching a shortcut.** Show the key combination on the control itself, and let the
  pointer rest there for a moment: the pause is where the user recalls or rehearses the
  gesture. Good for the stage after onboarding, where the feature is known but the key is
  not. Do not block the action while the hint is showing.
- **Line-drawn cards.** A row of three quiet cards, each with a hairline icon and one
  sentence, suits a feature or philosophy section. On load the strokes draw themselves in
  one after another, using `stroke-dasharray` and `stroke-dashoffset`; on hover the icon
  replays a short part of its own stroke to show its structure. Keep the rest state a
  plain line drawing, so the motion reads as a demonstration rather than decoration.
- **Mark an occasion.** A finished update, a completed setup, or a first success deserves
  one small ceremony: a changelog panel that unfolds, a brief confetti burst, a state that
  settles rather than snaps. Generate the content from the release data instead of typing
  it in by hand. One moment, once, and it stays memorable; repeating it turns it into
  noise.
- **Entry and exit.** Use transitions for values that reverse or retarget often;
  keyframes only for a defined sequence where restart behaviour is acceptable. Prefer
  `@starting-style` where target browsers support it. Never scale from `0`. Keep
  stagger short enough to stay responsive, and allow interaction during decorative
  sequences.
- **Springs and gestures.** Use pointer capture during a drag and track the active
  pointer to prevent multi-touch jumps. Consider distance and velocity when deciding
  dismissal, and tune thresholds on the real device. Use boundary resistance to show
  what movement is available. Provide a keyboard path for every essential gesture.
  For hold-to-confirm, distinguish progress from release feedback.
- **Transforms and masks.** Percentage translation follows the element's own size,
  which suits responsive drawers and toasts. Scaling affects descendants, including
  text and icons, so inspect the whole result. `clip-path` suits reveals and
  comparisons; check support and cost for the size involved. Blur can soften an
  overlapping crossfade but costs rendering, so drop it when a clearer transition
  solves the problem.

## Interruption and continuity

- Reversal, repeated activation, and cancellation resume from the current rendered
  value. Preserve velocity with a native spring when supported; fixed easing curves
  do not guarantee velocity continuity. New input interrupts the old animation
  immediately, without jumping to a stored start state or blocking input.
- Bound and retarget queued toasts and interrupted exits by checking them with real
  input.
- Keep one owner for a shared animation clock. Competing effects on the same element
  are a defect, not a preference.

## Shared-element transitions

When a row opens a detail page, a card expands into a dialog, or a compact player opens into a panel, carry one identifiable element through the change. Match the title, cover or frame by stable ID and measure its actual source and destination boxes. The same approach connects a control to its popover, a sparkline to its chart, a tab indicator across tabs, and surviving items across a filter or layout change. [Vibe Design Tips 015](https://vibedesign.tips/zh/015-ui-continuity/)

- Use the platform's shared-element mechanism. On the web, give the matched pair a unique `view-transition-name`, or apply FLIP using the existing layout animator. Keep a plain navigation path when the destination is missing or its source has been recycled.
- Use one visible copy of the shared element. Interpolate its frame and corners with transforms. Lay its title out once and scale it without rewrapping. Fade source-only content in the first third of the handoff and bring destination-only content in around the midpoint, behind an opaque moving surface.
- Reverse towards the actual current source. Back gestures and drag-to-dismiss drive the same progress as the button, following the finger 1:1 and using release velocity to finish. An interruption takes over at the visible pose. Use shorter travel for desktop side panels and keyboard actions. Treat responsive resizing as layout.
- For navigation and dialogs, give the destination heading or control focus and return focus to the opener on close. Reduced motion uses the same state and focus changes with a short fade, about 150 ms. Check the first and last frames, Back during entry, and a real scrolled list with long titles.

For a continuity audit, rank up to ten jumps by frequency, loss of orientation and implementation cost. Identify the source and destination element in each recommendation. A timing-only request uses the easing section above.

## Rendering budget

- Prefer `transform` and `opacity`. Avoid per-frame `top`, `left`, `width`, and `height`
  changes, which trigger layout. Filters, shadows, and clipping can require expensive
  paint or compositing; use them sparingly and measure on the target surface.
- Pre-blur and crossfade instead of animating a blur radius.
- One `requestAnimationFrame` loop; skip idle elements and stop the loop when nothing
  moves. Write a style only when its value changes.
- Measure once on mount and on resize, never per frame.
- Avoid per-frame framework re-renders and broad inherited-variable invalidation.
- Verify acceleration and cost claims in the actual browser; library version,
  property, and browser support decide them.
- Evaluate spring settling, interruption, and bounce in the real interaction, and use
  slower playback to inspect origins and timing drift.

## Accessibility

- Honour `prefers-reduced-motion`: remove non-essential movement and scale while
  retaining opacity feedback. Replace springs and overshoots with a plain fade of
  about `150ms`, without stagger or an input-blocking delay. Direct manipulation
  still follows the pointer so the interaction remains usable.
- Gate hover-specific movement behind hover and pointer media queries.
- Keep keyboard focus visible and functional while an animation runs.
- Keep essential actions usable during a transition, and check contrast, targets, and
  text clarity in every state.

## Audit checklist

Use this when the user explicitly asks for an animation or interaction audit, and keep
the review read-only unless repair is also authorised. Do not start an audit because a
design skill was loaded.

- Purpose: does the motion explain state, acknowledge input, or preserve continuity?
- Frequency: do repeated actions stay fast and usable?
- Timing: do duration and easing fit the distance, scale, and motion language?
- Continuity: are origin, enter and exit direction, and overlapping states coherent?
- Interruption: do reversal, re-activation, and cancellation preserve the right state?
- Gestures: are capture, momentum, boundaries, and alternate inputs handled?
- Accessibility: do keyboard, focus, touch, and reduced-motion behaviour stay usable?
- Rendering: is there observed jank, excess layout or paint, or avoidable main-thread
  work?

Report each finding with location, observed behaviour, user impact, and the smallest
useful correction. Use a Before / After / Why table when several changes compare well.
Separate observed defects from questions that still need a browser check.

Sources: the easing recipe is adapted from user-supplied design tip 011; see
[ATTRIBUTION.md](ATTRIBUTION.md). Function semantics follow
[CSS Easing Functions](https://drafts.csswg.org/css-easing-2/) and
[MDN easing functions](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/easing-function).
