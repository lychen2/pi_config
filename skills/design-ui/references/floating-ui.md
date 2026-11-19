# Choosing floating UI

Read this when reviewing whether a tooltip, cursor-following tip, popover,
popconfirm, drawer, dialog, or full page fits a task. This is a component-selection
review, not a visual redesign. Preserve the design system's colours, radii, shadows,
fonts, spacing, motion, and copy style.

## Decisions before implementation

When auditing multiple floating-UI surfaces or consolidating duplicate overlay
components, inventory and recommend first: before batch-changing code, show the
decision table and wait for the user's go-ahead, then implement the approved rows.
When the user asks to add or fix a single specific control (such as one tooltip,
popover, or confirmation dialog), choose the appropriate existing system component
using the table below and implement it directly in the same run without an extra
approval round.

If the selected kind needs a component the system lacks, such as an undo toast or
an interactive popover, ask before adding it. Continue the inventory and independent
approved work. Do not silently create a replacement design system.

## Start from what exists

- Find every use in the requested scope: tooltips, hover cards, cursor tips,
  popovers, confirm bubbles, menus containing confirmation, side panels, drawers,
  sheets, modals, and dialogs. Inspect their shared implementations and callers.
- Record each use's component and file, location, trigger, content, and the effect
  of confirmation. Check what is saved or deleted, who is affected, and whether the
  operation can actually be reversed.
- Find the system's component for each kind, including its keyboard, touch, focus,
  dismissal, loading, and error behaviour. Reuse that component.
- When two components serve the same purpose, name the duplication and recommend
  which shared implementation to keep. Consolidation still requires approval.

## Choose by task

| Kind | Purpose | Selection boundary |
| --- | --- | --- |
| Tooltip | Additional text about one element: truncated text, an icon-only control, or the reason a control is unavailable. | Text only. Interactive content belongs in a click-open popover. |
| Cursor-following tip | Information that changes as the pointer moves within a region, such as a chart or a self-contained visual. | The region supplies continuous information; the tip does not contain actions. |
| Popover | Anchored information with links, buttons, or other interactive controls. | Open by click or keyboard activation, not hover alone. Preserve the controls' own semantics. |
| Popconfirm | A second check for an irreversible action on one of the user's own items. | Needs a stable trigger to anchor to and a short, self-contained decision. |
| Dialog | A decision that must be completed or cancelled before continuing, or a short form that needs no page reference. | Large impact, effects on other people, bulk operations, or another decision such as choosing a successor. |
| Drawer | A long form, work that needs the surrounding page for reference, or a task that benefits from a wider workspace. | Preserve useful page context. Never use a drawer merely to ask for confirmation. |
| Full page | The primary task, or work needing a shareable URL and reload continuity. | The task should survive navigation as a first-class destination. |

Apply these questions in order:

1. **Can the action be undone?** Execute it and offer Undo through the existing toast,
   trash, or recovery flow. Undo must restore the relevant state; a label alone does
   not make an irreversible operation reversible.
2. **If irreversible, what is affected?** One personal item and a suitable anchor:
   popconfirm. Broad impact, other people, multiple items, or an additional decision:
   dialog. Do not make a high-impact action look local merely because it has one button.
3. **Is it a form?** Short and self-contained: dialog. Long, reference-dependent, or
   better with horizontal room: drawer. The main task or a durable URL: full page.
4. **What does the information describe?** One element: tooltip. A pointer location
   within a region: cursor-following tip. Anything interactive: click-open popover.
5. **Can touch and keyboard users reach it?** Hover information needs a tap route
   and a keyboard route. Choosing the kind does not remove either requirement.

## Fill in missing behaviour

Reuse the component's existing implementation and tokens. Add only behaviour missing
from the approved use; do not retune animations or restyle the component family.

### Tooltip

- Show on hover and keyboard focus. Use the system delay, about `500ms` for the first
  tooltip if unset; related neighbouring tips appear promptly. Show one at a time.
- Keep the text within the viewport. Link it with `aria-describedby` and use tooltip
  semantics. Give icon-only controls their own accessible name; the tooltip is
  supplementary. Do not move focus into a tooltip or place controls inside it.
- Escape dismisses it without moving focus. Keep it visible while the trigger is
  focused or the pointer is over the trigger or tip, until dismissed or invalidated.
- Preserve access to the displayed text when the pointer moves onto it. Use
  `pointer-events: none` only when surrounding hit testing keeps that hover region
  active. Text-only content still needs hoverability; it does not need to be clickable.
- A native disabled control does not receive keyboard focus. Expose its explanation
  through existing adjacent help or a suitable focusable trigger; keep the control
  disabled and preserve its semantics.
- On touch, provide tap-reachable help through the system's existing pattern. Do not
  consume the first tap on an enabled action merely to reveal its tooltip. If the
  required help trigger is missing, include that dependency in the approval request.

### Cursor-following tip

- Show when the pointer enters the region and update beside it without covering it.
  Flip or clamp at viewport edges. Keep the displayed text reachable and readable:
  retain its position while the pointer moves onto or rests over the tip. Hide when
  the pointer leaves both the region and tip. Escape dismisses it.
- On charts, the guide follows the pointer while the displayed value snaps to the
  nearest actual data point. Use the chart's existing hit testing and scales.
- A tap reveals the value on touch. Keyboard focus and the chart's existing keyboard
  navigation must expose the same information without requiring pointer movement.
  Keep any existing accessible data table or equivalent text representation.
- If links or actions are needed, use an anchored popover with deliberate activation;
  do not make a moving tip an interactive target.

### Popover and popconfirm

- Open interactive popovers by click, tap, or keyboard activation. Anchor to the
  trigger, fit the viewport, and preserve the system's focus and dismissal model.
  A visual popover is not automatically a menu; choose semantics from its contents.
- Anchor a popconfirm to the action button. Use the existing anchored origin and
  motion. Escape and an outside click cancel, with focus returning to the trigger.
- Name the consequence on the confirmation button, such as “Remove member”, rather
  than “OK”. State what is affected and what cannot be undone when that is unclear.
- Move keyboard focus into interactive confirmation content according to the
  component pattern. Cancel never performs the action. If the approved action removes
  the trigger, return focus to the next logical control instead of a detached node.

### Dialog

- Use the system's modal or native `<dialog>` opened with `showModal()`. Provide a
  visible accessible title, move focus inside, keep modal focus inside, and make
  background content inert. Do not implement modality with visual dimming alone.
- Escape cancels through the component's cancellation path. Give destructive actions
  a safe initial focus target, following the existing component convention.
- Describe the affected people or objects and irreversible consequences. Use specific
  action labels and preserve the product's copy style.
- Restore focus on cancellation or completion to the trigger or a logical successor.
  Existing pending, success, and failure behaviour must survive a kind change.

### Drawer

- Enter from the attached edge using the existing motion. Leave enough of the page
  visible to provide the reference that justified a drawer.
- Show editable changes in the surrounding page as a preview when the existing flow
  supports it. Keep preview, Save, Cancel, and autosave semantics distinct; a preview
  must not silently commit data. Do not add autosave as part of choosing a container.
- Close with Escape and a visible close button. Move focus into the drawer and return
  it appropriately when dismissed. Follow the system's modal or non-modal model:
  seeing the background does not make a modal background interactive.
- If the task needs interaction with the page behind it, choose a non-modal panel
  supported by the system, or reconsider the container. Do not claim background
  interactivity while trapping focus in a modal drawer.

### Forms and unsaved changes

- A dirty drawer, dialog, or page asks before discarding unsaved changes. Route close,
  Escape, outside-dismiss when enabled, and internal navigation through the same
  existing dirty-state decision. A pristine or successfully saved form closes directly.
- With native dialog, guard the cancellable `cancel` event and explicit close actions
  before calling `close()`. The `close` event occurs after closure and cannot prevent it.
- For page reload or leaving the site, register existing `beforeunload` handling only
  while dirty. Browsers control the warning text and may not fire the event,
  especially on mobile. Do not promise reliable saving or discard prevention from it.
- If edits are already committed by an existing autosave flow, treat that as saved
  state. Do not show an unsaved-changes warning for every live preview or saved edit.

## Keep the design unchanged

Change the kind only where it is wrong and add only the missing behaviour above.
Preserve colours, radii, shadows, fonts, spacing, and animation tokens. Keep copy
except for approved action labels and explanations of irreversible consequences.
Reuse the destination component's established presentation rather than inventing a
new visual pattern. Do not consolidate duplicate components until approved.

## Decision table and delivery

Before implementation, provide one row per use with these columns:

`Use | Component / file / location | Trigger and contents | Confirmation effect |
Current kind | Recommended kind | Status | Reason / deciding condition`

Mark correct uses **Already right**. Mark a recommended replacement **Change**.
Mark cases with two valid containers **Conditional** and state what decides between
them, such as form length, page-reference needs, real reversibility, or impact.
Include missing-component dependencies and any proposed consolidation. Wait for
approval; the table is a complete deliverable for a review-only request.

After approval, implement only the selected rows and list every changed file.
Exercise the changed flow with pointer, keyboard, and touch where supported: open,
cancel, confirm, focus return, Undo, unsaved edits, and any existing asynchronous
failure state. Verify that a cancelled action has no effect and approved operations
still have their original semantics. Report the exercised paths and any access gap.

## References

- User-supplied design tip 009. See [ATTRIBUTION.md](ATTRIBUTION.md).
- [WAI-ARIA tooltip pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tooltip/)
- [WAI-ARIA modal dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)
- [WCAG content on hover or focus](https://www.w3.org/WAI/WCAG22/Understanding/content-on-hover-or-focus.html)
- [HTML dialog](https://html.spec.whatwg.org/multipage/interactive-elements.html#the-dialog-element)
- [MDN beforeunload](https://developer.mozilla.org/en-US/docs/Web/Events/beforeunload)
