# Material and motion for a single interaction

Use the recipe for the named component. Start from its real content, existing interaction and rendering stack. The numbers below are starting values from the linked demos. Match the product's scale and motion preferences.

## Message bubbles

Choose a finish for the thread and match the send, reply and delete motions to it. Preserve message identity, loading and scroll behaviour. A bubble retrofit covers the bubbles. The composer, icons, message menu and typing indicator each have their own scope. [Vibe Design Tips 012](https://vibedesign.tips/zh/012-message-bubbles/)

| Finish | Material | Send and exit |
| --- | --- | --- |
| Solid | Flat fill for long reading sessions | A short scale and fade on entry, shrink on exit. |
| Cirrus | Borderless frosted glass against a varied backdrop | Frost settles as the bubble arrives and clears as it leaves. Use an opaque readable fill when transparency is reduced. |
| Pixel | A low-resolution grid with stepped edges | Snap entry to the grid and dissolve into cells on exit. |
| Aqua | A glossy, rounded gel highlight | Compress and settle on entry, swell and pop on exit. Keep the bounce inside the inter-message gap. |
| Gradient | One gradient anchored to the conversation, sampled at each bubble's position | Resolve the blur on entry and dissolve on exit. |
| Skeuomorphic | Raised face, lit edge and contact shadow from the product's control material | A short key-like press on entry, then press and drop on exit. |

Group consecutive messages by sender and update the single, first, middle and last shapes after insertions or removals. Lay text out at its final available width before revealing it. A sent bubble can rise about 40 px while neighbours settle to their measured positions. In normal flow, measure the old and new positions and animate the difference with transforms. Follow the bottom only while the reader is already there.

For a long reply, open the bubble from the waiting indicator's position and reveal actual arriving content in the same box. A material-specific dot matrix is optional. When deleting from the middle of a bottom-anchored thread, keep the lower messages still while the messages above settle into the gap, nearest first. Check a wrapped reply and a deletion that joins two sender groups. Reduced motion places messages immediately and keeps the waiting cue legible on one still frame.

## Shockwave halo

Use a halo for a rare activation such as opening an assistant. Set the trigger, origin, content bounds and repeat behaviour. An input expansion is a separate change. [Vibe Design Tips 013](https://vibedesign.tips/zh/013-shockwave-glow/)

- From the actual trigger or selected edge, expand four blended colour bands to the farthest edge over about 1 second, fast at first. Clip them inside the content's corners and below the toolbar. Tint the surface in a light theme and add light with screen blending in a dark theme.
- With a reliable capture of the current content, bend the whole band as one lens. Stretch the outside and compress the inside. Keep any red and blue split subtle, around 1.08 and 0.92 times the base displacement. Fade the bend at the frame. An optional line mask limits glints to dividers and outlines so text stays crisp.
- Without a usable capture, draw the colour bands alone on a transparent, input-transparent overlay. Use a static half-strength fade for reduced motion. Stop drawing as the halo disappears. Check the selected origin, the toolbar boundary and small text in both themes.

## Card deletion

Keep deletion on the product's usual commit and undo path. Animate a picture of the departing item and let the rest of the list remain interactive. [Vibe Design Tips 014](https://vibedesign.tips/zh/014-card-delete/)

| Intent | Exit and neighbour reaction | Demo duration / gap starts |
| --- | --- | --- |
| Burn, a final removal | Scorch travels from the delete control. Fire lights the facing edge of nearby cards. | 2.0 s / 900 ms |
| Plume, a completion or archive | A soft plume carries the item upward from its bottom edge, warming nearby surfaces. | 1.4 s / 720 ms |
| Blocks, a playful removal | Pieces carry their own slice of the card, scatter, bounce once and fade. Neighbours recoil. | 1.5 s / 240 ms |
| Peel, a sticker or note | Fold from the corner nearest the control, expose the printed back and release with the fold's velocity. Neighbours follow the pull briefly. | 1.2 s / 640 ms |

Capture the real rectangle, corner curve and content before removal or cell recycling. If capture would delay deletion, use a ready snapshot or the simple exit. Mount one non-interactive overlay outside the recycled list but clipped to its scroll container, below navigation. The first frame must coincide with the real item even in a scrolled list. Reuse the list's layout animation to close the gap with transforms, starting while the exit is visible (about 520 ms of settling).

Key effects by stable item ID so Undo cancels exactly that exit. Cap elaborate exits at three simultaneous items. Reduced motion, rapid bulk deletion or an unavailable renderer get a short fade. Release drawing resources on completion and cancellation. Verify focus moves to a surviving item or the list's empty-state control and the deletion is announced once.

## Holographic cards

Use one foil card per screen for something owned or earned, such as a pass or membership. Choose Pearl for a quiet everyday finish, Prism for depth, Chrome for a moving reflection, Etched for a pattern revealed by light, or Rainbow and Sparkle for a celebratory state. [Vibe Design Tips 018](https://vibedesign.tips/zh/018-holo-card/)

- Map pointer position across the card to tilt, around ±6° for quiet or ±12° for standard. Let the angle follow a spring and let a single, separately damped light drive foil, glare and rim together. Its resting position is about 34% across and 22% down.
- Paint the base, foil and print in that order, then apply the glare and narrow lit rim. Keep text on the print plane and readable across the full tilt. Artwork at depth `d` shifts by `d × sin(angle)`. Oversize layers behind a window to cover their travel. Pause optional idle sway when hidden or off screen.
- Turn the card only if the reverse carries useful content. Preserve its primary action and expose the flip through a named keyboard and touch control. Mirror the light on the back, show thickness edge-on and put only the visible face in the tab order. Reduced motion uses a static face and an instant swap or short crossfade. Check a long name, readability at maximum glare, and access to the back without pointer movement.
