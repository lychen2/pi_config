# Result messages and loading states

For an audit, trace each message or wait to the action that creates it. Record the trigger, current behaviour, proposed feedback and the reason to change it. For one named interaction, follow its row below. Reuse the product's message host, data layer and accessible components.

## Toast, notification or inline feedback

Choose by who caused the event, whether the person is still there and what happens if they miss it. [Vibe Design Tips 016](https://vibedesign.tips/zh/016-toast-or-notification/)

| Situation | What to show |
| --- | --- |
| My action visibly changes the control or item | The changed state can confirm success on its own. For a result outside my view, such as a copied link, show one short status toast for about 3–5 seconds. |
| I just archived an item and can undo it | Apply the action immediately. Offer Undo in an action toast for at least 5 seconds and show the remaining time. After Undo, restore the item and change the same toast to the result. |
| Work I started will finish here | Use one progress toast or the item's existing progress surface. Change it in place to the result and offer Open when there is something to inspect. |
| A mention, deadline or job completion may arrive after I leave | Keep a notification in the product's shared inbox or activity history. Dismissing the on-screen card must leave any outstanding decision discoverable. Use system notifications only with permission. |
| I need to correct an error | Keep the message and recovery action beside the field, file or failed item until resolved. Preserve input for Retry. |
| I am about to take an irreversible action | Confirm at the trigger, or in a dialog for high-impact or bulk changes. Use the existing [floating UI rules](floating-ui.md). |

Present one toast at a time. Queue actionable messages so a new confirmation cannot erase a live Undo. Pause dismissal during hover or keyboard focus. If notifications stack, expose up to three previews and make the full list available by keyboard and tap. Announce results once through a polite status region, keep focus on the task and make any action reachable. Check Undo on the last available second, a failed upload, and a job that finishes after navigation when those paths apply.

## What to show while waiting

Measure the wait on a representative connection and identify what is already available, what can be counted and whether failure can be reversed. Use one indicator for the operation. The timings below are starting values for avoiding a flash. [Vibe Design Tips 017](https://vibedesign.tips/zh/017-loading-states/)

| Condition | Feedback and state handling |
| --- | --- |
| Fast response or background prefetch | Below about 300 ms, show the result directly. Background draft saves may use a quiet, fixed status. |
| Short, unmeasurable action | Put the spinner on its button and keep the label and width stable. An existing refresh or sync icon may turn from the press and finish a whole turn. Guard repeated submissions while pending. |
| First load with a known layout | Render the heading, filters and column labels immediately. After roughly 300 ms, place skeletons at the actual content sizes. Replace them in place. On refresh, keep the existing rows visible. |
| Long, countable work | Show real bytes or completed units and the total. Estimate time remaining only after a usable sample. A background job gets a persistent progress surface with its result and supported cancellation. A job with no meaningful total shows its actual stage. |
| Reversible change with a high success rate | Update the item and dependent totals immediately. On failure, roll back the failed change in each view, keep later edits and typed text, and offer Retry on the item. Wait for confirmation on payments, permanent deletes and sends to other people. |
| Streamed answer | Show the actual stage while waiting for the first content, then render chunks as they arrive in a reserved or downward-growing region. Keep the reader's scroll position. Expose Stop for long streams and Copy or Retry when available. |

A delayed loader can stay visible for about 500 ms once shown. Keep that visual timing independent of committing data or accepting the next action. Mark the loading region `aria-busy`, announce completion or failure once and keep keyboard focus stable. Under reduced motion, use a static placeholder or status. Exercise the fast return, a slower response, and the failure or cancellation path relevant to the change.
