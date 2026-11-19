# Craft spec

Write this specification before writing code when the request asks to make a surface
feel more crafted, or to add one signature interaction: "更有质感", "polish this",
"make it feel premium", "让这个不那么像 AI 做的".

The spec is the deliverable that keeps the work reviewable. The user can change one
option instead of re-describing the whole effect, and an implementer can follow it
without guessing. Fixed order. Omit a section only when it does not apply, and say
which.

For an easing-only request, use the inventory and retrofit workflow in
[motion.md](motion.md). For liquid glass, use [liquid-glass.md](liquid-glass.md).
Those targeted recipes preserve the existing geometry and replace the material or
timing sections here; they do not add book layers, button variants, or new radii.
Use [floating-ui.md](floating-ui.md) for choosing an overlay type and
[docs-layout.md](docs-layout.md) for shared documentation layouts. Their decision or
layout workflows replace this craft specification; they do not authorise restyling.

## 0. Start from what exists

- Find the component the user names, or the one used by the grid or list they point
  to, and retrofit it in place.
- Reuse its markup, design tokens, radius, shadow, and motion or spring utilities.
- Keep footprint, padding, content, and layout unchanged. Nothing around it may move.
- When the user asks for a new element instead, give its size, its style variant, and
  the surface it sits on.
- Terms the user leaves unset take the default marked `*`.

## 1. Choose one style variant

Pick from a small named set rather than a mood adjective. Each variant fixes surface,
edge, shadow, type, top layer, background, and interior. Never mix two variants.

- **Default\***: the product's own surface, a hairline edge, a light neutral shadow,
  the product sans, and the existing content as the top layer.
- **Skeuomorphic**: a material with grain, a lit bevel, a full-strength warm-neutral
  shadow, one serif title, a full-bleed top layer, and a lit wall behind it.
- **Minimal**: one flat tone per unit, a faint bevel, a cool neutral shadow, a mono
  label over a hairline rule, a single-line diagram as the top layer, and a dot-grid
  background.
- **Match my product**: take surface, edge, shadow, type, and background from tokens,
  and keep the current appearance exactly.

A variant is a set of token decisions, not a licence to restyle the surrounding page.

## 2. Material and states

For tactile buttons, restyle the existing Button through its own variant and token system
and keep its API, props and accessibility. If the library has none, create one Button
with `variant` and `size`. Give each action group at most one primary button. [Vibe Design Tips 001](https://vibedesign.tips/zh/001-skeuomorphic-buttons/)

Style: calm and precise, neutral greys only, no brand hues, lit from straight above. No
gloss, no glow, no large blur.

Variant ladder, strongest to weakest:

1. **primary** — near-black slate face `#404859 → #273042`, white label.
2. **secondary** — raised white key `#FFFFFF → #F4F5F7`, dark grey label.
3. **tertiary** — soft grey key `#F3F4F6 → #E7E9EC`, dark grey label.
4. **ghost** — no face at rest, faint fill on hover, a recessed well when pressed.
5. **text** — grey label, thin underline, an arrow that nudges right on hover.

Every filled variant is the same five layers; only the values change, so define them
once as tokens and let each variant set its own:

1. **Face**: `180deg` gradient, top 6–8% lighter than the bottom.
2. **Edge**: 1px border one step darker than the bottom of the face.
3. **Top highlight**: `inset 0 1px 0 white` — 18% on slate, 85–100% on light faces.
4. **Bottom shade**: `inset 0 -1px 0 black` — 22% on slate, 6% on light faces.
5. **Drop shadow**: a tight contact `0 1px 2px` plus a soft lift `0 4px 10px -3px` —
   18% and 28% on slate, about a third of that on light faces.

Put every inset layer in the element's own `box-shadow`, before the drop layers, never
on a pseudo-element overlay: inset shadows follow the inner radius (outer radius minus
border), so the corners line up in every state.

States:

- **Hover**: face one step lighter; the lift grows to `0 8px 16px -5px`.
- **Pressed**: `translateY(1px)`; flip the gradient so the top is darker; the outer
  shadow collapses to `0 1px 1px`; the top highlight becomes an inner shadow
  `inset 0 1px 2px black` — 40% on slate, 12–16% on light faces. Light faces keep
  `0 1px 0 rgba(255,255,255,.9)` below, like a key pressed into paper.
- Give rest and pressed the same number of inset layers, padding with
  `inset 0 0 0 transparent`, so the shadow animates instead of jumping.
- Focus-visible and disabled follow the library's existing conventions.
- Timing: `120ms` for transform, `140ms` for shadows, `160ms` for colour.

Sizes: at a 14px label, height `40px`, padding `0 18px`, radius `10px`, weight `600`,
optional 16px leading icon, and on slate a label `text-shadow: 0 -1px 0 rgba(0,0,0,.28)`.
Scale the material with the type: express every length, from height and padding to the
1px press offset and each shadow offset, blur, and spread, as a multiple of
`u = label size / 14`. Two sizes suffice: `md` (14px, `u = 1`) and `lg` (16px,
`u = 16/14`, so height `45.7px`, radius `11.4px`, lift `0 4.6px 11.4px -3.4px`).

## 3. Options with defaults

One line per option: name, values, default, and what it changes. Keep the list under
about twelve; more means the spec is hiding a decision.

```text
Intensity      subtle | book* | dramatic        angle 24 / 42 / 60
Count          2 | 3 | 4* | 6                   layers behind the top
Hinge          left* | right | top              axis and origin
Trigger        hover* | press | scroll into view | focus
Content        blank | text lines* | real data  interior of the open state
Shadow dir     from above* | from top-left      light direction
Strength       none | light | normal* | deep    shadow opacity scale
Corners        tokens* | continuous             radius source
Motion feel    snappy | default* | soft         spring k and damping
Reduced motion fade* | immediate                 no movement or scale
Touch          press* | scroll into view | off   non-hover input
```

Keyboard focus always opens the interaction, whichever trigger is chosen.

## 4. Structure

Use the opening-book treatment for a card with content to preview, such as a document, template or portfolio item. A settings shortcut keeps the product's ordinary navigation treatment. [Vibe Design Tips 006](https://vibedesign.tips/zh/006-book-cards/)

- Put the moving layers inside the existing interactive element, on a body with
  `transform-style: preserve-3d`.
- Order front to back, and name the index `n` from the top layer: top `n = 0`,
  interior `n = 1..N`, back board `n = N + 1` (never moves).
- The top layer keeps all existing content. Interior layers and the back board are
  decorative: `aria-hidden`, no links, no tab stops.
- Perspective on the static outer element, about `1100px`, with its origin toward the
  hinge: `30% 50%` for left, `70% 50%` for right, `50% 30%` for top.
- `transform-origin` on the hinge edge of every layer: `0 50%`, `100% 50%`, `50% 0`.
  Set `backface-visibility: hidden`.
- Separate layers in depth with `translateZ((N + 1 - n) * 0.6px)` so they never fight.
- Inset the interior by about `8px` (`4px` at the hinge), like a book block. Nested
  radius = outer radius − inset.
- Inset the back board about `6px` on flat variants so it cannot peek past the top
  layer's foreshortened corners. On a material variant, make it flush and darken the
  top-layer colour by about 28%.

## 5. Motion

- Layer `n` turns by `angle(n) = A * 0.7^n` and starts `delay(n) = 28ms * n` later.
  The top layer leads; interior layers fan out behind it.
- Direction: `rotateY(-angle)` left, `rotateY(+angle)` right, `rotateX(+angle)` top.
- Close in reverse: innermost first, `delay = 28ms * (N - n)`, back to `0deg`.
- Spring feel: snappy `k 320, damping 0.9`, default `k 240, damping 0.86`,
  soft `k 160, damping 0.8`. All barely overshoot; settle in about `0.3s`.
- If the pointer leaves mid-way, retarget from the current angle and velocity. Never
  jump to the new state.
- Without a spring helper, use the shared `--duration-lg` and `--ease-in-out` from
  [motion.md](motion.md), since the layers stay on screen. Set `28ms * n` delay when
  open and `28ms * (N - n)` at rest; the target state's delay reverses the closing
  sequence. Keep the book interaction's native spring when that material motion is
  explicitly requested; the small-confirmation overshoot token is not its fallback.

## 6. Light and shadow

- Light comes from above, so the shadow falls down the surface.
- The shadow is two solid shapes behind the element, each blurred once. Never a
  `box-shadow`: it is a hollow ring and reads as an outline once the top layer swings
  off it.
- At rest: contact is small and darker at the foot (lower half, inset about `4px`,
  blur `4px`, down `2px`, about `22%`); ambient is faint (blur `14px`, down `6px`,
  about `12%`).
- Open: crossfade to a second pre-blurred pair that is longer and softer (contact blur
  `12px`, down `12px`; ambient blur `38px`, down `26px`) and move it about `14px`
  further down and `4%` wider with a transform.
- Drive the crossfade with one progress value `o` in `0..1` on its own spring
  (`k 200, damping 0.9`): rest pair `1 - o`, open pair `o`.
- Tint: near-neutral grey nudged toward the background, warm on a warm surface, cool
  on a cool one. Never pure black, never saturated.
- Strength scales both opacities: light `0.5`, normal `1`, deep `1.4`.
- Interior leaf shading: overlay a spine gradient (`32%` dark, `8%` at `55%`, `0` at
  `85%`) whose opacity is `clamp(gap / 6, 0, 1) * max(0, 1 - gap / 30)`, where `gap`
  is the angle of the layer in front minus this layer's angle. A page is shaded while
  the page in front is lifting off it, and lit once they part.

## 7. Corners and edges

- Clip every layer to one shape path, and draw its edge along that exact path, for
  example an SVG path stroked over the layer. A CSS border or inset shadow plus a clip
  disagree at the corners and show a second rim once layers part.
- Token corners: use the token radius; nested radius = outer − inset.
- Radius progression: inner radius = outer radius − padding, applied from the outside
  in, dialog or card → panels, inputs, buttons → chips and tags. A box `p` inside a
  container with radius `R` gets `R - p`, so both corners share one centre. Boxes on
  the same level share one radius. Never go below `4px`; pills and circles stay fully
  round; keep padding, gap, and radius on a `4px` grid.
- Continuous corners, as progressive enhancement:

  ```css
  @supports (corner-shape: superellipse(1.25)) {
    :where(*) { corner-shape: superellipse(1.25); }
    .pill, .circle { corner-shape: round; }
  }
  ```

  The superellipse is `|x|^n + |y|^n = 1` with `n = 2^1.25`. It removes the crease
  where a plain radius meets the straight edge. Chrome and Edge 139+ render it; Safari
  and Firefox skip the block and keep the plain radius.
- When radii are path-generated, produce a `clip-path: path(...)` per layer size,
  reuse it for the edge, and regenerate on resize.
- Close by listing every radius changed as `element: old -> new`.

## 8. Interaction and accessibility

- Hit-test on the resting footprint: listen on the static outer element and give every
  moving layer `pointer-events: none`, so a swinging layer never moves the target and
  the element never flickers at its edges.
- One interactive element with its current accessible name; the whole surface is the
  target, and the cursor is a pointer over all of it.
- `:focus-visible` opens exactly like hover. Keep the focus ring on the outer element,
  along the resting shape.
- Reduced motion: no fan, rotation, lift, or scale. Crossfade the shadow pair over
  about `150ms`, or switch immediately if that option was selected.
- Touch has no hover. Use the touch option, and a tap must still activate on the first
  try.

## 9. Performance

- Animate `transform` and `opacity` only. Never animate blur, `box-shadow`,
  `clip-path`, width, height, or `top`/`left`.
- Never animate a blur radius: blur each shadow once and crossfade the pre-blurred
  versions.
- One `requestAnimationFrame` loop for all instances. Skip those at rest, and stop the
  loop when nothing moves.
- Write a style only when its value changes; cache the last string per element.
- No layout reads per frame. Measure once on mount and again on resize with a
  `ResizeObserver`.
- Animated canvas: draw at `30fps` at most, stamp glyphs from a pre-rendered atlas
  instead of laying out text every frame, and pause off-screen (`IntersectionObserver`)
  or when the tab is hidden.

## 10. Signature detail (optional)

Add one extra layer of craft only when the brief earns it, and keep it slow and
seamlessly looping: halftone or ASCII rendering, film grain, a soft gloss at the top
edge, a spotlight on the background. Recipes and parameter ranges are in
[effects.md](effects.md).

## 11. Delivery

- List every file changed or added.
- List the variant and every option used, marking which were defaults.
- Note anything that no longer looks identical at rest.
- State what you did not verify, and how the user can check it.

## Acceptance

1. At rest, the element is indistinguishable from before, or from the chosen variant's
   description.
2. Every moving layer is decorative to the accessibility tree and to the tab order.
3. Reverse, repeated activation, and pointer-leave all resume from the current value.
4. Reduced motion keeps the state change visible without the fan or rotation.
5. A pointer over a mid-swing layer still targets the element, and the layout never
   shifts.
