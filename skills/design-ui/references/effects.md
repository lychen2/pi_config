# Textures and effects

Read this when one image, canvas, or card needs a rendering treatment that makes it a
texture rather than a picture: ASCII, ordered dither, halftone, grain. These are
signature details. Apply them to one named asset in place, keeping its size, position,
corners, and anything layered on top.

Give the effect a live control panel beside it, and keep one settings object shared by
the layer and the panel:

```text
{ filter: 'ascii' | 'dither', mask, palette, inkTone, strength, size, spacing }
```

Store separate values per filter so switching filters restores that filter's own
settings. Reuse the project's existing effect pipeline and panel components before
building an `EffectLayer` and `EffectPanel`.

## What each control means

| Control | ASCII | Dither | Range | Recommended |
| --- | --- | --- | --- | --- |
| Mask | Vertical veil so the effect reads as texture | Same | 0–100 | 90 / 88 |
| Palette | Gradient-map luminance into one colour family first | Same | Original + 5 | Original |
| Sample tones | Shadows or Highlights become dense glyphs | Hidden | — | Shadows |
| Strength | Tone-curve contrast and glyph ink | Fewer levels per channel (8 → 2) and how fully they replace | 0–100 | 100 |
| Size | Font size 7–24px | Pixel block 2–9px | 0–100 | 37 / 15 |
| Spacing | Grid step across/down, never tighter than the glyphs | Bayer pattern scale, 1–4 blocks per cell | 0–100 | 0 |

`range(v, a, b) = a + (b - a) * v / 100`, `L = (0.299R + 0.587G + 0.114B) / 255`,
`s = strength / 100`.

## Sampling

Cover-fit the asset into a small sampling canvas (about 480px on the long side) and read
it with `getImageData`. Composite each sample over white. With a palette, recolor that
canvas first through a 256-entry lookup built from the palette's four stops. Per frame,
take about 12,000 evenly spaced samples and use the 8th and 92nd percentile of `L` as
`low` and `high`.

## ASCII

- Characters, empty to full: `" .,:;-=+xX08S#&@"` (two leading spaces).
- Font: `round(range(size, 7, 24))px` monospace, 22px instead of 24 below 720px wide,
  centred in its cell.
- Grid: `x step = max(range(spacing, 8, 24), widest glyph * 1.08)`;
  line height `max(range(spacing, 9, 26), height of "@" * 1.12, font * 1.04)`.
  The first cell sits half a step in from the edge.
- Cell tone: normalize against the percentiles, mix raw and normalized by
  `0.72 + 0.14s`, then apply `black = 0.22s`, `white = 1 - 0.08s` and blend the
  linear ramp with `smoothstep` by `s`. Skip cells at `tone <= 0.02` and spaces.
- Ink: lift value in HSV by `0.24 + 0.18s + 0.24·tone`, raise saturation by
  `1.16 + 0.2s`, set alpha to `clamp((0.12 + 0.7·tone)(0.72 + 0.28s), 0.06, 0.94)`.

## Ordered dither

- `pixel = max(2, round(range(size, 2, 9)))`, 7 below 720px wide.
- `levels = max(2, round(range(strength, 8, 2)))` per channel; `blend = range(strength, 0.32, 1)`.
- Bayer matrix `[[0,8,2,10],[12,4,14,6],[3,11,1,9],[15,7,13,5]]`, threshold
  `(m + 0.5) / 16`, indexed by `floor(x / pattern)`, `floor(y / pattern)`.
- Sample each block's centre, push saturation away from luma by `1 + 0.06 + 0.18s`,
  then per channel quantize with the threshold and mix the result back by `blend`.
- Write blocks into a canvas of `box / pixel`, then draw it scaled up with image
  smoothing off.

## Mask and layering

A vertical gradient with stops at the top, 42%, and the bottom. Base opacities: on a
light page white `54 / 20 / 38%`, on a dark page black `44 / 20 / 50%`. For a mask value
`v`, the first stop is `base * (v / 50)^1.08` below 50 and extends toward 100 above it.

Composite the effect layer above the asset and below the asset's own overlays. Stop
redrawing when the element is off-screen or the tab is hidden, and cap the render loop
at 30fps.

Source: 枯白啃设计 (@Kubai087), 《999 个小技巧》 003. See [ATTRIBUTION.md](ATTRIBUTION.md).
