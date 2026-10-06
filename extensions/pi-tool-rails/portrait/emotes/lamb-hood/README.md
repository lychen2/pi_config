# Lamb hood portrait

Source: user-supplied `image-97aee85a.png` (1371 × 1147 pixels).
SHA-256: `f13ae55d65cc7b193944924d534a50784858bf3bc341a2a96c9078218824d699`.

The 6 × 5 sheet supplies 30 frames for all 17 portrait states.
Frame order follows `FRAMES + NEW_FRAMES` in `../../scripts/draw-portrait`.

## Image processing

- Split the six columns at rounded multiples of 1371/6.
- Use row ranges `[0,247)`, `[251,469)`, `[475,703)`, `[706,916)`, and `[921,1139)`.
- Remove edge-connected navy background. Preserve the dark books, computers, and phones with foreground masks.
- Remove isolated grid remnants. Keep expression marks and thought bubbles.
- Center each crop on a 256 × 256 transparent canvas with its bottom at pixel 252.
- Resize to 128 × 128 RGBA PNG using Lanczos resampling.

## Stable animation masks

The animation reuses the transparent images from `image-97aee85a.png`.

- Idle and talk share the neutral body. Soft masks replace only the eyes or mouth.
- Reading and writing retain their first frame. Only the eyes change.
- Phone use retains its first frame. Only the fingers change.
- Sleep and thinking retain their first pose. Only the mouth changes.
- Waiting uses the watch pose in both frames, with an eye mask for blinking.

Each loop preserves identical alpha values across its frames.
Pixels outside the local masks remain unchanged.
The neutral mouth is cleared with interpolated skin pixels before each open mouth is pasted.
Mouth crops exclude the donor jaw; their masks feather inward.
The original chin and face outline remain unchanged.
State transitions still select different poses; each repeating loop keeps its body fixed.
No additional background removal was applied during stabilization.

Processing is local. The source sheet remains unchanged.
The package configuration selects `lamb-hood` for all models unless a user or project mapping overrides it.
