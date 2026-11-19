# Scroll-driven cards

Choose a pattern for a specific sequence in a product page or portfolio. Keep ordinary reading sections between effects. Each pattern earns its space from the content it reveals. [Vibe Design Tips 019](https://vibedesign.tips/zh/019-scroll-cards/)

| Content | Pattern | What advances with scrolling |
| --- | --- | --- |
| 3–5 parallel features, steps or chapters | Stacked cards | Each card sticks about 16 px below the previous one. Covered cards shrink about 5% and darken 12% per layer, leaving a readable edge. |
| 3–6 highlights shown one at a time | Card deck | The front card arcs out as the next comes forward. Alternate the direction, with about 16° of tilt over 420 px of travel per card in the demo. |
| 5–12 works with different widths | Pinned gallery | Measure the row's horizontal overflow. That distance becomes the vertical travel, so 1 px down advances the row 1 px sideways and the last item ends inside the viewport. |
| 5–9 equal-format covers | Cover flow | Each interval brings one cover to centre. Neighbours scale down, turn up to 30° and dim with distance. Give the centre cover enough travel to be read. |
| One image or video introduces the next chapter | Image expand | Interpolate the frame's insets until the image fills the available viewport. The image eases from 1.2× to 1× inside the frame. Use separated foreground artwork only when the real asset supports parallax. |

Use one normalized progress value per section, `p = clamp((scrollY - start) / travel, 0, 1)`. Measure the start and travel when layout changes. Derive every transform, opacity and crop directly from `p`. Stopping mid-scroll holds that frame and reversing retraces it. A sticky container provides the pinned portion. Keep native wheel, touch, keyboard scrolling and anchor navigation. A section with zero travel renders in ordinary flow.

On the web, prefer CSS scroll timelines when supported or the animation engine the project already ships. A script fallback needs one passive listener with at most one update per frame. Size sticky content with `svh`, account for the fixed header and safe areas, and remeasure on width or orientation changes. Fit the real text and media before pinning. A short viewport, around 560 px tall or less, or content that no longer fits at text zoom uses an ordinary list, horizontal row or full-width image.

On phones, a gallery or cover flow can use a native horizontal row with snap points. Reduced motion defaults to those rows, ordinary lists and the static full-width image. Preserve reading order and make every linked item reachable by keyboard, including one initially outside the visible row. Exercise a slow reversal halfway, the last item, a phone in landscape and 200% text zoom.
