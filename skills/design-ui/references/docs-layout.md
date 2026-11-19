# Responsive docs and help-center layout

Read this for wiki, documentation, or help-center layout work: the shared header,
page list, article outline, article ending, and footer. Preserve article content,
copy, colours, fonts, routes, and existing components. Change placement, scrolling,
and responsive behaviour through the shared layout so every page inherits it.
Use CSS and a small amount of JavaScript within the existing framework; add no
scrolling or animation library.

## Start from what exists

Find the shared docs shell, site header, opening banner or hero, page-list data,
outline generation, article wrapper, support links, previous/next navigation, and
footer. Read the breakpoints, theme and motion tokens, routing, heading IDs, and
scroll-restoration rules. Reuse those sources; do not create separate desktop and
mobile navigation data or patch each article.

Keep the logo's home destination, key-page dropdowns, and core CTA when present.
Keep browser chrome colour coordinated with the existing theme-colour configuration;
Safari and other browser chrome treatments vary by platform. Do not change the brand
palette to match a particular browser screenshot.

Article content, existing support copy, colours, and type remain unchanged. Reuse
real support destinations and page titles. When a support block is missing, propose
the minimal label and verified links; do not invent contacts, social accounts, or
marketing copy as part of a layout-only pass.

## Three scrolling layers

- The article, article ending, and footer scroll in normal document flow.
- The page list and outline use `position: sticky`, with a stable top inset and their
  natural layout position preserved. Their containing layout ends before the footer,
  so its bottom pushes them out of view rather than letting them cover the footer.
- The header starts in normal flow and scrolls away with the opening. Only when that
  opening has passed the viewport top does it return as a fixed floating bar.

Give each sticky column a viewport-bounded height and its own inner scroll area.
Use `align-self: start` where grid or flex stretching would prevent sticking. Check
ancestor overflow: an unintended scroll container can change what sticky attaches
to. Do not switch the page list or outline to fixed positioning during scroll.

## Header: normal flow, then floating

Use the existing header and reserve its flow footprint while it is fixed. Measure
that footprint on layout changes, not on every scroll event. The banner or boundary
sentinel must remain in normal flow and independent of the header animation.

- At the opening, keep the header clear, with no added background.
- Float when `opening.getBoundingClientRect().bottom <= 0`. If there is no hero,
  use the bottom of the existing header's flow slot as the boundary; do not invent
  a banner or a pixel-based scroll threshold.
- The floating state uses the existing translucent surface token, `blur(18px)`, and
  a soft shadow. In a light theme the surface is translucent white; use the matching
  existing dark-theme surface instead of introducing white into dark mode.
- Enter over `320ms` ease-out from `translateY(-24px)` and opacity `0`. The supplied
  recipe also uses blur from `8px` to `0`; limit it to this small surface and check
  rendering cost. Reuse a pre-rendered or existing alternative if that blur is costly.
- Exit over `120ms` when the opening re-enters the viewport. Keep fixed positioning
  until the exit completes, then return to the reserved flow slot.
- If the reader crosses the boundary again during exit, cancel or reverse the exit
  from its current rendered state. A stale completion callback must not hide a bar
  that should now be visible. Use one animation owner and the existing motion tools.
- Give article headings `scroll-margin-top` for the header height and existing gap.
  Anchor navigation must not put headings underneath the floating bar.

A scroll listener or observer schedules one state update; it does not start a new
animation on every event. Use the actual boundary position when deciding visibility.
Preserve focused controls when the header changes position. A separate visual copy,
if the system already uses one, must not duplicate interactive tab stops or IDs.

## Page list: independent scrolling with overflow cues

Hide the scrollbar only while retaining native wheel, touch, and keyboard scrolling.
Fade an edge only when more items exist beyond it. Compute and toggle
`data-more-above` and `data-more-below` after scrolling, resizing, or a list-content
change. The attributes belong on the scroll area and are removed when false.

```js
function listOverflow(scrollTop, scrollHeight, clientHeight) {
  const maximum = Math.max(0, scrollHeight - clientHeight);
  const position = Math.min(maximum, Math.max(0, scrollTop));
  return {
    above: position > 1,
    below: maximum - position > 1,
  };
}
```

The one-pixel tolerance avoids fractional-pixel edge flicker. Clamp the observed
position so overscroll does not produce contradictory edge cues. A list that fits
needs neither masks nor arrows.

A shared CSS mask can express the four edge states:

```css
.docs-page-list {
  --fade-top-clear: 0px;
  --fade-top-end: 0px;
  --fade-bottom-clear: 0px;
  --fade-bottom-end: 0px;
  overflow-y: auto;
  scrollbar-width: none;
  scroll-padding-block: var(--fade-top-end) var(--fade-bottom-end);
  mask-image: linear-gradient(
    to bottom,
    transparent 0,
    transparent var(--fade-top-clear),
    #000 var(--fade-top-end),
    #000 calc(100% - var(--fade-bottom-end)),
    transparent calc(100% - var(--fade-bottom-clear)),
    transparent 100%
  );
}

.docs-page-list::-webkit-scrollbar {
  display: none;
}

.docs-page-list[data-more-above] {
  --fade-top-clear: 4px;
  --fade-top-end: 40px;
}

.docs-page-list[data-more-below] {
  --fade-bottom-clear: 4px;
  --fade-bottom-end: 56px;
}
```

Keep arrow controls outside the masked scrolling element. Place one small round
arrow at the centre of each edge with hidden content. Clicking it scrolls that list
by `0.6 * clientHeight` toward the edge, smoothly unless reduced motion is active.
These are redundant pointer shortcuts: keep them out of the tab order with
`tabindex="-1"` and out of the accessibility tree with `aria-hidden="true"`. Prevent
pointer activation from focusing them; an aria-hidden element must never retain
focus. Keyboard users navigate the real links, which scroll fully into view, and
touch users scroll the list directly. Do not make an arrow the only route to an item.

Keep focused links and their focus indicators inside the unmasked area. When
necessary, scroll the list itself rather than calling an unrestricted
`scrollIntoView()` that also moves the article. If the available height is smaller
than the fade bands, reduce the bands so they do not hide the whole list.

### Current page, restoration, and search

- Mark the current page using the router's existing active-link state and
  `aria-current="page"`.
- Store list scroll position in `sessionStorage` under a shared docs-navigation key,
  not a separate key per article. Restore after the list is laid out, clamp to its
  current range, then reveal the current page only if it remains outside the visible
  area. Do not recenter an already visible item and discard the restored position.
- Persist on navigation and normal scroll updates using the existing lifecycle.
  Storage unavailability must not prevent navigation or initial active-item reveal.
- If a search field exists, `/` focuses it. Do not intercept typing in inputs,
  textareas, editable content, composition, or modified shortcuts. Do not focus
  background search while a modal sheet is open; use its visible search if present.

## Outline: one current-section decision

The current section is the last article heading above a line `20%` down the viewport.
Compute against the article's real headings in document order. Before the first
heading reaches the line, use the first section; with no headings, render no outline
control. Keep one shared result for the desktop outline and mobile label.

For cached document-space heading offsets, the selection is:

```js
function currentSectionIndex(headingOffsets, scrollY, viewportHeight) {
  if (headingOffsets.length === 0) return -1;
  const readingLine = scrollY + viewportHeight * 0.2;
  let current = 0;
  for (let index = 0; index < headingOffsets.length; index += 1) {
    if (headingOffsets[index] > readingLine) break;
    current = index;
  }
  return current;
}
```

Recompute geometry after route, content, font, image, or viewport changes that move
headings. Update selection on scroll at most once per animation frame; do not leave
an idle frame loop running. Update the DOM only when the active section changes.
Use `aria-current="location"` on its link, with text and `border-left-color` from
the existing accent token. Passive scrolling must not steal keyboard focus.
Preserve heading IDs and real hash links so anchors remain shareable and reloadable.

## End of the article: support, navigation, footer

Use this order:

1. A “Still need help?” card with one or two real support channels: issue tracker,
   community, or contact. Reuse the article's card vocabulary and existing support
   copy; keep the help relevant to the reader's current task.
2. Previous and next links with page titles from the existing navigation data. On the
   first page, the previous destination is the docs home. On the last page, omit a
   nonexistent next destination.
3. The existing footer, in document flow.

A large footer can use an existing background image and enough useful information
to justify more than half a viewport. Treat this as an optional composition choice,
not a minimum height for every wiki. In a layout-only pass, do not add a decorative
image, social promotion, or empty vertical space simply to make the footer taller.

## Tablets and phones

Use the product's breakpoints. Hide the outline column on tablets and the page-list
column on phones. Provide one fixed bottom navigation bar: page list on the left,
outline on the right. Keep both available on phones; on tablets the page-list action
may use the same list even while the sidebar remains visible. Both views share data
and active state. The right half shows the current section title, with an ellipsis
for long titles and its complete accessible name. Hide that action when there are
no sections.

Reserve bottom space in the article and footer for the bar, including
`env(safe-area-inset-bottom)`, so it cannot cover links or the last line of content.
Use a viewport-bounded sheet with its own scroll area; long phone chapter lists may
use the full available screen height. Present one chapter per row, with tap targets
one size above the desktop list using the existing size tokens.

### Opening and closing a list sheet

- Use the system's native-dialog wrapper or a `<dialog>` opened with `showModal()`.
  Label it “Pages” or “On this page” using the existing localisation. One sheet is
  open at a time; do not duplicate DOM IDs when sharing navigation data.
- Attach it to the bottom and enter from `translateY(24px)` while fading in, with
  the existing sheet duration and entrance curve. Use a transparent `::backdrop`,
  without dimming. The page remains visible but inert: a transparent modal still
  traps focus and blocks background interaction.
- Mark the active entry. After opening and layout, centre it with
  `scrollIntoView({ block: "center", inline: "nearest" })` when that targets only
  the sheet's scroll area; otherwise scroll that area directly. Keep the underlying
  article at its position. Move initial focus to a meaningful entry or control.
- Close on entry selection, the close button, outside activation, or Escape.
  `showModal()` alone does not enable outside dismissal. Use supported
  `closedby="any"` or the existing outside-dismiss implementation. Do not interpret
  clicks or drags that started inside the sheet as outside dismissal.
- On an ordinary dismissal, restore focus to the opening bottom-bar button without
  scrolling the page. On section selection, close first, then navigate to its hash,
  scroll to its heading with the header offset, and focus the destination without a
  second scroll. Reuse the router's page-focus handling for page navigation.
- Opening, closing, route changes, and a resize back to a desktop layout must release
  the correct focus and scroll locks. Do not leave an invisible modal open.

## Motion and accessibility

- Under `prefers-reduced-motion: reduce`, turn off smooth scrolling and the header's
  entrance and exit animations. Remove sheet translation; use the system's immediate
  state change or short opacity-only feedback. JS scroll calls must honour the same
  preference rather than always requesting `behavior: "smooth"`.
- Respect reduced transparency and forced colours with the existing solid header and
  sheet surfaces. Preserve readable text, visible focus, and meaningful landmarks.
- Keep native links, keyboard navigation, a skip-to-content path, and browser history.
  Layout polish must not replace semantic navigation with pointer-only handlers.
- Use [motion.md](motion.md) for shared curves and interruption rules. The targeted
  header and sheet recipe defines its own requested motion; do not restyle unrelated
  animations or force a new motion dependency.

## Delivery and acceptance

List every changed file and selector. Exercise the shared layout on the user's real
pages, including a long page list and an article with several sections. Check anchor
offsets, active-section updates, list restoration across page navigation, overflow
cues, header reversal, focus return, touch scrolling, and reduced motion.

Show a screenshot of each required state: page top, middle, end, and a phone-width
window. Include the opened phone list sheet in the mobile evidence, with another
capture if needed to show the bottom bar. Use the same page for the three desktop
states so layout comparisons are meaningful. Screenshots must be displayed or linked
as requested, not replaced by a textual description. Report actual exercised states
and any browser-access limit; do not claim visual verification from CSS checks alone.

## References

- User-supplied design tip 008. See [ATTRIBUTION.md](ATTRIBUTION.md).
- [MDN position](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/position)
- [MDN scrollIntoView](https://developer.mozilla.org/en-US/docs/Web/API/Element/scrollIntoView)
- [HTML dialog](https://html.spec.whatwg.org/multipage/interactive-elements.html#the-dialog-element)
- [WAI-ARIA current location](https://www.w3.org/TR/wai-aria-1.2/#aria-current)
