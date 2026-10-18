# Component and motion patterns

Adapted from Emil Kowalski's design engineering skill. See ../SOURCES.md.
Use project tokens and verify these patterns with the actual component.

## Buttons and feedback

Provide immediate hover, focus, active, and disabled feedback appropriate to the control.
Keep feedback independent of network latency. Show pending and completion states for asynchronous actions.
A subtle press transform can help tactile controls; check text clarity and surrounding layout.
Avoid transforms that hide focus or move a target away from the pointer.

## Popovers, modals, and tooltips

Anchor a popover's transform origin to its trigger when scale communicates the attachment.
Centered modals can retain a centered origin.
Combine a small scale change with opacity when it supports continuity.
Choose initial scale from the design rather than a universal constant.
Preserve focus placement, dismissal, and focus return through entry and exit.
Let subsequent tooltips appear promptly when moving through a related control group.
Reuse the component library's delay and placement behavior.

## Entry, exit, and interruption

Use transitions for values that reverse or retarget frequently.
Check rapid toggles, queued toasts, and interrupted exits with real input.
Use @starting-style when supported by target browsers and appropriate to the component.
Check whether the existing framework or primitive already handles entry and exit.
Allow interaction during decorative sequences. Keep stagger brief enough to preserve responsiveness.
For deliberate actions such as hold-to-confirm, distinguish progress from release feedback.

## Springs and gestures

Springs can preserve continuity in interrupted gestures and momentum-based interactions.
Tune bounce and settling for the product's tone and the input device.
Use pointer capture during drag. Track the active pointer to prevent multi-touch jumps.
Consider distance and velocity when deciding dismissal. Tune thresholds on actual target devices.
Use resistance near boundaries when it clarifies the available movement.
Ensure a keyboard-accessible alternative for every essential gesture.

## Transforms and masks

Percentage translation follows the element's dimensions and can support responsive drawers and toasts.
Scaling affects descendants, including text and icons; inspect the complete result.
Use clip-path for reveals or comparisons when it expresses the intended change.
Check support and rendering cost for the chosen mask, filter, browser, and element size.
Blur can soften an overlapping crossfade, but adds rendering work and may obscure content.
Remove it when a clearer state transition solves the problem.

## Accessibility and rendering

Honor prefers-reduced-motion by removing nonessential movement and preserving clear state feedback.
Gate hover-specific movement with hover and pointer media queries where appropriate.
Check focus, readable contrast, and usability while animations run.
Prefer transform and opacity for movement and fading; inspect actual compositing when performance matters.
Layout animation can be justified when changing geometry communicates state.
Avoid unnecessary per-frame React updates or broad inherited-variable invalidation.
Compare the real interaction before changing APIs or adding will-change.
