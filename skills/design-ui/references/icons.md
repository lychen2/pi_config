# App icons

Read this when the task makes or repairs an application icon, a brand mark used at small
size, a favicon, or a set of app tiles that must feel like one family.

Functional icons — the navigation, toolbar, and feature symbols inside a product — are a
different job with a different construction. Use Skill `kubai-icons` for those: layered
back/content/front shapes, an outside stroke, every colour derived from one accent, and
hover motion the object itself would make. Do not carry app-icon volume or a logo's
personality into them; do not use the rules below to build a feature set.

## The failure mode: too much volume

Generated icons fail on unnecessary volume: highlights painted by hand, inner glow, inner
shadow, several light sources on one shape. The first move is subtractive. Reduce the
volume a shape claims, then rebuild the little that remains with gradient instead of
brushwork.

The cause is a misread brief. A model treats a simple symbol as an object inside a
rigorous space with physical structure, so it lights the thing as if it were real. Say
explicitly that the icon is a flat mark with one light and no interior structure, and the
volume disappears.

## An icon is not a logo

They answer different questions and take different shapes:

- An **icon** must attract and read instantly, so it carries a personality. An
  anthropomorphic subject works well. Keep the subject's detail low and let the subject
  and the canvas divide the work: the subject carries the character, while the
  background, or a prop the subject wears, shows what the product does. That combination
  says the function and stays attractive.
- A **logo** must hold its identity and be maintainable. Designers draw the base shape
  first, then use tangent constructions (golden spiral, concentric circles) to even out
  the geometry. The construction is not decoration and not a forced Boolean operation:
  it evens proportions, and it makes the mark easier to police and to date when a copy
  appears. Build a product the same way: settle the primitive shape, then use the
  construction to make it consistent.

A simple symbol is not automatically a good app icon. Subtraction ages better than
detail, but check the symbol at 32px before deciding it is simple enough.

## Three techniques that make a plain icon look considered

1. **Gradient** expresses volume without a painted highlight: linear across a face,
   radial inside a dome.
2. **Texture** adds material identity at a small scale: grain, paper, brushed metal,
   dither. Keep it uniform, and let it sit under the gradient rather than on top.
3. **Material** decides how the shape meets light: matte, satin, glass, clay. One
   material per icon, followed consistently across the set.

## Repair rules for a generated icon

- Paint the subject with a linear or radial gradient instead of highlight and shadow
  strokes.
- Give the background one hue at different lightness levels, as a plain linear
  gradient. Do not combine unrelated hues.
- Remove inner glow and inner shadow everywhere. Both read as a seam at small sizes.
- Colour a shadow with a darker version of the surface hue, not with black mixed in.
- Then export layered PNGs plus the background values, and let Icon Composer adapt them
  for Liquid Glass. Ask for that export explicitly; it is what makes the icon usable in
  the current OS shells.

## Family consistency

One material, one light direction, one corner radius logic, and one stroke width across
the set. Check the set at 32px, 64px, and 1024px: the shape must survive the small size
and the detail must still be visible at the large one.

## Delivery

- Layered PNG export (subject, background, any texture) and the background colour
  values.
- The set at 32px, 64px, and 1024px, so the user can see that it holds together.
- A note on which rules were applied and what the icon looked like before.

Sources: 枯白啃设计 (@Kubai087), icon posts on 渐变/纹理/材质 and the five repair rules
for generated icons. See [ATTRIBUTION.md](ATTRIBUTION.md).
