# Lamb hood portrait

Source: user-supplied `image-97aee85a.png` (1371 × 1147 pixels).
SHA-256: `f13ae55d65cc7b193944924d534a50784858bf3bc341a2a96c9078218824d699`.

The 6 × 5 sheet supplies 30 frames for all 17 portrait states.
Frame order follows `FRAMES + NEW_FRAMES` in `../../scripts/draw-portrait`.

The [30 additional tool poses](../../prompts/README.md) define a separate extension sheet.
Twenty selected cells now supply static tool poses, alongside the original 17 states.
The [generation prompt](../../prompts/lamb-hood-tools-30.md) retains its original cell order.

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

## Selected tool poses

Source: [user-supplied tool sheet](../../sources/lamb-hood-tools.jpg), recovered from the session attachment at 1739 × 1442 pixels.
The original clipboard PNG was unavailable; the retained attachment is JPEG.
SHA-256: `86bbbb31a5d0b4d319a630e1d59ffbab41b9ef699a87cf1dcb001305dc566cb2`.

Selected cells: 2, 6, 7, 9, 11–15, 17–23, 25, 27, 28, and 30.
The other ten cells remain unused. Their tools retain the previous portrait behavior.

- Split columns at rounded multiples of 1739/6; remove three edge columns from each crop to exclude neighboring fragments.
- Use row ranges `[0,302)`, `[303,582)`, `[583,879)`, `[880,1149)`, and `[1150,1432)`.
- Remove edge-connected navy pixels and the outer gray frame. Discard isolated fragments smaller than 120 source pixels. Preserve enclosed dark hair and props.
- Match the neutral hood span to 102 pixels, centered at x=68, with the white hood top at y=9.
- Normalize vertical extent independently to bottom y=126, then composite on a 128 × 128 transparent canvas using Lanczos resampling.

The cloud in cell 22 obscures an ear; its hood span uses the adjacent head as the scale reference.
Each selected state has one static frame. No body-changing animation loop is added.
All 30 original PNG files remain byte-for-byte unchanged, including their eye and mouth masks.
Different activities retain their drawn head angles; geometric normalization cannot remove every transition difference.

Processing is local. The source sheets remain unchanged.
The package configuration selects `lamb-hood` for all models unless a user or project mapping overrides it.
