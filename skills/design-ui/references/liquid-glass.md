# Liquid glass surfaces

Read this when the request names liquid glass, adaptive translucent surfaces, or rim
refraction. Retrofit the existing cards, players, search bars, toolbars, menus,
popovers, and toasts through the product's design system. Preserve markup, layout,
spacing, radii, fonts, icons, copy, focus behaviour, and component APIs. Filter
resources may live outside the semantic component tree; decorative layers must not
change its layout or hit testing. If the effect requires a new surface component or
wrapper, ask before that structural change.

## Start from what exists

- Inventory surfaces over images, wallpaper, video, or other detailed backgrounds.
  Record component, file, location, backdrop source, theme, and existing material.
- Find the theme switch, colour tokens, settings store, and any existing backdrop or
  image-sampling helper. Share tokens and helpers rather than tuning each component.
- Leave surfaces over plain colours unchanged. Translucency there adds little useful
  background detail. Keep semantic status colours, disabled states, and focus rings.
- Before editing, list which surfaces receive CSS-only glass, which receive a rim
  lens and colour separation, and which stay solid, with the reason for each choice.

## Six material layers

Use one shared material with state-dependent values: outer shadow, backdrop blur and
colour adjustment, rim refraction, adaptive tint, rim and inner highlights, and text
and icon colour. Background sampling selects the material state; it is not a seventh
visual layer. The rim lens is progressive enhancement; the CSS material must work
without it.

### Material tokens

Keep numeric values, colours, filters, shadows, and ink roles beside the existing
surface tokens. The following values are starting points at normal UI scale. Map the
names into the project's conventions and tune a shared state, not each component.

| State | Tint and alpha range | Backdrop filter | Ink |
| --- | --- | --- | --- |
| Light glass, default | White, `6–22%` | `blur(2px) saturate(180%) brightness(1.06)` | Dark |
| Light mode over a dark area | `rgb(16 18 22)`, `10–30%` | `blur(2px) saturate(170%) brightness(0.85)` | Light |
| Dark mode | `rgb(20 20 24)`, `16–38%` | `blur(2px) saturate(160%) brightness(0.8)` | Light |

For light glass, use this edge and shadow as one token:

```css
--glass-edge:
  inset 1.5px 1.5px 1px -1px rgb(255 255 255 / 95%),
  inset -1.5px -1.5px 1px -1px rgb(255 255 255 / 55%),
  inset 0 0 0 0.5px rgb(255 255 255 / 30%),
  0 0 0 0.5px rgb(0 0 0 / 6%),
  0 6px 24px rgb(0 0 0 / 8%);
```

Add an inner top-left radial highlight, white at `30%` fading to transparent by
`55%`, plus soft inset light just inside the rim, stronger at the top and left with
slight shade below. Use an existing decorative layer or a non-interactive
pseudo-element clipped to the same radius. For light mode over dark content, use a
faint white inset top edge and a `0.5px` dark outline. In dark mode, reduce the light
edge and inner highlights to about one third of their light-mode strength, with a
darker outline and shadow.

Use fixed ink steps for titles, labels, icons, times, and progress:

| Surface | Primary ink | Secondary ink | Blend |
| --- | --- | --- | --- |
| Light glass | Black at `86%` | `rgb(60 60 67 / 70%)` | `multiply` |
| Dark glass | White at `94%` | `rgb(235 235 245 / 64%)` | `plus-lighter` |

Apply blending to the intended foreground content, not the surface or entire
component subtree. Keep semantic error and status colours outside the neutral ink
rule. Draw an icon's overlapping strokes and fills in an opaque colour, then apply
the desired opacity once to the whole icon. This avoids darker overlaps. Inspect
blended text against its final backdrop; plain ink is the fallback when blending
reduces readability or is unsupported.

On light glass, highlighted rows use white at `42%` on hover and `76%` when selected,
with a white stroke, rather than a grey overlay. Hover on a glass surface increases
its tint alpha by about `0.14`, clamped to `1`, rather than increasing shadow size.

Register interpolated number and colour tokens with `@property`, including their
syntax, initial value, and inheritance. Registration permits interpolation; an
explicit transition on the changed token is still required. Inherit theme-level
values when they must reach descendant surfaces. Keep transitions local to the
surfaces and reuse [motion.md](motion.md) timing roles. Switch ink polarity together
with its tint state so a long interpolation does not create unreadable intermediate
text. Unsupported registration must still leave a usable static state.

### Apply through the existing surface

The four primary declarations are:

```css
.glass-surface {
  background: var(--glass-tint);
  backdrop-filter: var(--glass-filter);
  box-shadow: var(--glass-edge);
  color: var(--glass-ink);
}
```

Bind ink blending and the inner highlight through existing content and decorative
selectors. Keep the normal filter as the baseline. For a verified lens-capable
surface, append its `url(#filter-id)` after blur, saturation, and brightness so the
lens processes the colour-adjusted backdrop. Filter order defines the visual result;
it does not guarantee that a browser combines the operations into one rendering pass.

## Rim lens

Build one reusable helper, using the same geometry as the surface. Keep the centre
flat and displace only the rim. Use CSS pixels for geometry and displacement strength;
choose the map's raster resolution separately for the device pixel ratio.

1. Let `s` be the shorter side. Skip the lens below `32px`. Otherwise set
   `rim = max(4px, min(44px, s / 3.5))`.
2. For inward distance `d` from the actual boundary, use
   `offset(d) = 1.1 * rim * max(0, 1 - d / rim)^2.6` inside the rim and zero outside it.
   Sample inward along the boundary normal. Use the actual rounded or superellipse
   boundary; a circular corner map will not match `corner-shape: superellipse(...)`.
3. Encode horizontal and vertical sampling offsets in the map's red and green
   channels. For maximum absolute offset per axis `M`, set `scale = 2 * M`,
   `R = 0.5 + dx / scale`, and `G = 0.5 + dy / scale`. Use
   `primitiveUnits="userSpaceOnUse"` with the filter's coordinate system matched to
   CSS pixels. A neutral channel is `0.5` (approximately `128` in an 8-bit map). Set
   map alpha to `1` and explicitly use `color-interpolation-filters="sRGB"` with an
   sRGB-encoded map.
4. Load the map with `feImage` and use `feDisplacementMap` with
   `xChannelSelector="R"` and `yChannelSelector="G"`. It reads the source at
   `(x + scale * (R - 0.5), y + scale * (G - 0.5))`; choose signs for inward sampling,
   not for moving a source pixel. Keep filter bounds large enough to avoid clipping.
5. For colour separation, displace the source in three passes at `1.15`, `1`, and
   `0.85` times the base strength. Retain only red, green, and blue respectively with
   `feColorMatrix`, keeping each branch's alpha, then combine the disjoint channels
   with screen blends for opaque backdrop samples. Screen composition increases
   partial alpha; use the unsplit lens for translucent inputs unless the helper has
   explicit alpha reconstruction. Inspect corners and reduce separation where the
   rim becomes hazy. The `±15%` split is a visual starting point, not a physical model.
6. Decode the map image before attaching the SVG filter to a surface. Keep the CSS
   material active until it is ready. Give each live filter a unique ID and a
   separately owned SVG resource container, with no layout footprint or focus target.
7. Cache maps by geometry: dimensions, corner shape and radii, rim width, and raster
   scale. Reuse identical maps across surfaces. Position-only movement reuses the map;
   a size or radius change requires an updated map unless the helper explicitly
   reconstructs unchanged corners and edges. Do not stretch a map and distort its rim.
   Rebuild after resize, not per animation frame, and release unused resources.

### Browser and compositing limits

`CSS.supports('backdrop-filter', 'url(#a)')` checks syntax, not whether that browser
renders the lens correctly. Verify SVG backdrop filtering on the supported browser
versions and actual surface. Use CSS-only glass wherever it is unsupported or fails
visually; do not treat a browser family name as a permanent capability guarantee.

Use the CSS-only material for animated menus and panels, surfaces with `will-change`,
and other compositing configurations that have not passed a rendering check. Some
configurations can display the map or omit the intended backdrop. Do not remove
necessary animation or layer behaviour to force the lens to work. Unsupported
`backdrop-filter` uses a solid theme surface. Keep all of these decisions in the
shared material helper, not scattered component-specific browser checks.

## Adapt to the background

Sample the actual image area behind the surface, accounting for cropping, scaling,
position, and the source's background colour. Browsers do not expose arbitrary
composited DOM pixels through canvas. Use a readable source image or existing product
rendering pipeline; otherwise choose ink from the theme and use the dense tint. Treat
live video as unsampled by default unless the product already supplies frame data.
Do not create a separate continuous capture loop for this material.

For a readable background:

1. Sample a `5 × 3` grid. Calculate each sample's luma
   `Y = (0.299 * R + 0.587 * G + 0.114 * B) / 255` for 8-bit sRGB channels. Sort by
   `Y`, discard the two darkest and two brightest samples, then average the retained
   samples. This is a brightness heuristic; use WCAG relative luminance for contrast.
2. Define `texture` as the maximum minus minimum `Y` among the retained samples.
   Define each sample's `chroma` as `(max(R, G, B) - min(R, G, B)) / 255`, then average
   the retained samples' chroma. Both are in `0..1`; these explicit conventions keep
   the density calculation consistent across implementations.
3. In light mode, initially choose light ink below mean `Y = 0.5`, dark ink otherwise.
   Thereafter switch dark to light only below `0.45`, and light to dark only above
   `0.55`. In the intervening band, keep the current ink. Dark mode always uses light
   ink. Neighbouring surfaces in a visual row share one ink decision using their
   combined samples; each surface still needs its own contrast check.
4. Let `inkBrightness` be `0` for dark ink and `1` for light ink. Define
   `closeness = 1 - abs(meanY - inkBrightness)`. Set
   `density = clamp(0.55 * closeness + 0.7 * texture + 0.3 * chroma, 0, 1)`.
   Interpolate the selected material's thin and dense tint alpha with that density.
5. Set `retainedSaturation = max(0.45, 1 - 0.75 * chroma)` and multiply the state's
   base saturation factor by it. Keep saturation and density as separate tokens.
6. Resample when the background, theme, or surface position changes. Batch related
   surfaces through the existing update loop and avoid repeated layout reads. Persist
   the last ink choice through the existing settings mechanism to reduce initial
   flicker; resample on load rather than treating the cached value as current truth.

Unreadable or cross-origin sources without canvas permission use the dense theme
material without sampling. An average does not establish text contrast; busy local
patches beneath text still need the checks below.

## User tint controls

For the full adaptive-material recipe, add one light-mode tint setting and one
dark-mode tint setting through the existing settings UI and persistence mechanism.
Each scales tint in `0..1.5`, with default `1`; store the two values independently.
A request limited to a single surface uses its named scope rather than adding a new
product settings area without agreement.

Let `t` be the active theme's setting and `a` the density-derived tint alpha:
`alpha = clamp(a * t, 0, 1)`. For `t < 1`, fade colour adjustments toward neutral:
`brightness = 1 + (baseBrightness - 1) * min(t, 1)` and
`saturation = 1 + (adaptedSaturation - 1) * min(t, 1)`. At `t = 0`, the backdrop keeps
blur and rim refraction, plus the edge lights and shadow, without tint or colour
adjustments. Theme changes transition to that theme's stored material settings;
reduced motion removes the decorative transition. Keep a visible reset to default.

## Accessibility and rendering

- At the default tint, check the busiest, brightest, and darkest backgrounds the
  product allows, in both themes and at the actual text locations. Require WCAG AA:
  `4.5:1` for normal text and `3:1` for large text, plus applicable non-text contrast.
  Use the final composited foreground and background, including tint and blending.
- Raise surface density rather than changing the fixed ink-opacity hierarchy. If the
  recipe's dense range still fails, extend the shared tint toward opacity or use the
  solid theme surface. Preserve semantic colours and never rely on hue alone for an
  error state. User tint controls need an accessible default and reset.
- Under `prefers-reduced-transparency: reduce`, remove backdrop filters, blending,
  and translucent decorative layers; use the corresponding solid theme surface with
  readable ink. Under `forced-colors: active`, explicitly remove glass imagery,
  filters, and blending, and set an opaque system-colour pair such as `Canvas` and
  `CanvasText`. Keep visible borders and focus with `forced-color-adjust: auto`.
  Forced colours do not automatically remove the background's original alpha.
- Keep interactive content, focus rings, disabled states, and status colours outside
  decorative blend overrides. Pseudo-elements and SVG resources never take input.
- Inspect the actual rendered stacking and blending. Avoid indiscriminate
  `isolation`, ancestor filters, or `will-change`: they can change the backdrop root.
  Do not promise a GPU-only or single-pass implementation without profiling it.
- Sample on relevant changes, cache maps, and keep idle surfaces idle. Inspect resize,
  scroll, theme changes, and interrupted material transitions in the real interface.

## Delivery and acceptance

Show the surface inventory and lens decisions before edits. Add shared tokens, the
lens helper where supported, background adaptation, and the two tint controls when
implementing the full recipe. Switch the authorised surfaces in place and list every
file changed. No layout, typography, radius, icon, copy, or trigger changes.

Verify light and dark themes, dark-background light-mode ink, threshold hysteresis,
readable and unreadable backgrounds, dense and solid fallbacks, tint `0 / 1 / 1.5`,
resize, reduced motion, reduced transparency, forced colours, keyboard focus, and
text contrast for the surfaces changed. Confirm the lens itself visually on target
browsers, including wide-rim corners over detailed backgrounds. State which browser
and rendering paths were exercised and any remaining visual verification limit.

## References

- Design tip 010 supplied by the user: material layers, parameter ranges, sampling,
  and tint controls. See [ATTRIBUTION.md](ATTRIBUTION.md).
- [MDN feDisplacementMap](https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Element/feDisplacementMap)
- [Filter Effects](https://drafts.fxtf.org/filter-effects/)
- [CSS Properties and Values API](https://drafts.css-houdini.org/css-properties-values-api/)
- [WCAG contrast minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)
- [Media Queries: reduced transparency](https://drafts.csswg.org/mediaqueries-5/#prefers-reduced-transparency)
- [CSS forced-colour adjustments](https://drafts.csswg.org/css-color-adjust-1/#forced-colors-mode)
