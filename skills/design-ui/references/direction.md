# Visual direction

Read this when the task creates a new interface, a substantial redesign, or a page
that needs a hero. A routine repair stays inside the established design; use
[motion.md](motion.md) instead.

Local adaptation of Anthropic's frontend-design skill. See [ATTRIBUTION.md](ATTRIBUTION.md).

## Ground the design in the subject

Identify what the product is, for whom, and what its primary job is before choosing a
visual direction. The industry, subject matter, materials, and vernacular of the
subject are where distinctive choices come from: a toy for 8–11 year olds and a
dashboard for financial analysts must not share a palette.

Read the project design system, active tokens, shared components, and dependencies
first. Preserve product conventions unless the task asks for a redesign. Build with
the brief's real content, not lorem ipsum.

## Match the aesthetic to the work

A reference site is only useful when its job resembles the brief's job. Ask what the
product is for before copying a look:

- A tool someone works in (ledger, editor, inbox, dashboard) is judged by legibility:
  body text that reads cleanly, comfortable line height, an interface that stays quiet.
  Spectacle there gets in the way.
- A page someone visits (landing page, launch, portfolio) is judged by whether it can
  hold attention for thirty seconds.

The most common mistake is finding a beautiful site and transplanting it without asking
what it was for.

## Typography carries the personality

- One family or two; if two, make them clearly distinct.
- Set a clear type scale with intentional weights, widths, and spacing.
- When type is a headline or a visual element, the treatment is part of the design,
  not a neutral vehicle.
- Default to line lengths under 80 characters. Serif body text can run slightly
  longer and takes more line-height than a sans.

Avoid these generated-page tells:

- Accenting one word in a headline with italic, bold, or another colour.
- All caps for labels.
- Small typographic labels placed above content for decoration.

## Layout, scale, and alignment

Use one alignment per information level: left-aligned body, left-aligned headings, or one
centred group, but not two competing alignments inside the same level. Misalignment is
the fastest way for a page to look unfinished, and it costs nothing to fix.

Borrow a real type scale instead of inventing one. Pick one benchmark product in the
same category, read its default sizes (commonly 12, 14, and 16px for interface text),
and reuse that rhythm. A borrowed scale is defensible; an arbitrary one is a
preference nobody can evaluate.

## Structure is information

Outlines, borders, numbering, eyebrows, dividers, and labels must encode something
true about the content. Numbered markers (`01 / 02 / 03`) belong only where the content
really is a sequence, such as a stepped process or a timeline.

The hero is the first thing the reader sees. Open with the most characteristic thing in
the subject's world: a headline, an image, an animation, a live demo, an interactive
moment. A big number with a small label, supporting stats, and a gradient accent is the
default treatment, so use it only when it is genuinely the best option.

Use non-user-triggered motion sparingly, as one orchestrated moment. Fade-and-slide-up
entrances on every section and hover transitions on every card read as generated.
Motion that answers a person's action is welcome because it shows what changed.

## Do not spend free axes on the current defaults

These cluster in generated design. Each is legitimate for some brief, but they appear
whatever the subject, which makes them defaults rather than choices.

1. Warm cream background (near `#F4F1EA`) with a high-contrast serif display and a
   terracotta accent near `#D97757`.
2. Near-black background with a single acid-green or vermilion accent.
3. Broadsheet layout: hairline rules, zero radius, dense newspaper columns.
4. The SaaS card kit: identical rounded cards, one radius regardless of hierarchy, the
   same soft grey `rgba(0,0,0,.1)` shadow, gradient washes as decoration.
5. Template chrome: a tracked-out all-caps eyebrow above every heading, meta strings
   joined with middle dots (`A · B · C`), `WORD — fragment` labels with a spaced em
   dash, tinted near-black `#0B0B0B` standing in for black, a mono face for small data
   labels, and a `→` appended to link and button text.

When the brief pins a direction, follow it exactly, including when it asks for one of
these looks. When it leaves an axis free, do not spend that freedom on a default.

## Two passes: plan, review, build

**Pass 1, token plan:**

- Colour: 4–6 named hex values for the core palette.
- Type: the families and their roles.
- Layout: one-sentence descriptions plus ASCII wireframes to compare, including the
  alignment decision (left, centre, justified).
- Principles: what makes this page specific to this brief.

**Pass 2, review before coding:** compare the plan with what the same prompt would
produce for any similar page. Where a part reads as the generic result, revise it and
say what changed and why. Start code only after the plan holds up.

Watch CSS selector specificity while building. Type-based rules (`.section`) and
element-based rules (`.cta`) cancel each other easily, especially on section spacing.

## Showing several features at once

When a page must explain more than three features, a grid of small live demos carries it
better than a list of paragraphs: one bento cell per feature, each with a miniature of
the real interaction rather than an abstract illustration.

- Read the project stack first and use what is already installed. Do not add an
  animation library for this.
- Three to five features, no more. Each cell makes one claim.
- One card radius (28px is a good default), 1px hairline separators instead of shadows,
  and a single accent.
- Three craft details carry the whole grid: a soft top inner glow, a 1px outline, and a
  layered drop shadow. A card without them reads as a container; a card with them reads
  as a surface. Keep the glow subtle enough that the card still looks flat.
- Offer three skins: the product's own style, a neutral study style, and a mixed version.
- Keep each miniature cheap: a transform and an opacity change, paused when off-screen.
- Reuse the product's own component library and tokens for its marketing page. A site
  built from the product's real components looks related to the product by construction,
  and it is the fastest route to a finished page.
- Before designing, deconstruct three to five competitor pages: what each one shows
  first, what it proves, and what it leaves out. Let the model do the reading; keep the
  judgement.

## Metaphor: give the form back to the object

When a control represents a physical thing, let the thing carry the interaction: a
receipt for a summary, a ticket for an order, a card that turns over for details, a sheet
that peels off the stack. The metaphor has to be true to the object's shape and weight,
not sprinkled on top as an illustration. Borrowing the object is what makes a common form
feel specific; borrowing only its icon makes it feel decorated.

## Empty states and onboarding

- Draw empty states as line art or light isometric illustration that relates to the
  feature, not as a generic box with a sad face. One small motion, such as the lines
  drawing themselves in, is enough to make the state feel intentional.
- In onboarding, prefer a 2.5D scene built from the product's own shapes over stock
  illustration. The detail is the message: it shows the product's material before the
  user has used it.

## Restraint

- Spend boldness in one place. One element is the memorable thing; everything around
  it stays quiet.
- Cut decoration that does not serve the brief.
- Remove what a model adds by default: extra sections, a logo wall, invented statistics,
  placeholder testimonials, and anything the user did not ask to explain. Delete them
  before delivery, and say what you removed.
- A model produces the shape it has seen most often, and it produces ten variants at
  once. Innovation and selection stay with the person: state which variant you chose and
  why, rather than shipping all of them.
- Pick one motif and repeat it: a dot rhythm, a hairline, a clipped corner, a repeated
  glyph. One element appearing in the UI, the empty states, the charts, and the collateral
  builds recognition that a pile of new decoration cannot.
- Meet a quality floor without announcing it: responsive to mobile, visible keyboard
  focus, reduced motion respected, accessible contrast and targets.
- Look at the rendered result while building, and remove one accessory before delivery.

## Interface copy

Words in an interface exist to help someone understand and act. Write from the end
user's perspective and name things by what users recognise: people manage
notifications, not webhook configuration.

- Active voice. A call to action states what happens: "Save changes", not "Submit".
- One name per action through the whole flow: a button labelled "Publish" produces
  "Published".
- Errors explain what happened and how to fix it, in the interface's voice, without
  apologising or hedging. An empty screen invites the next action.
- Plain verbs, sentence case, no filler. Each written element does one job.

Copy can make a design feel as templated as the layout, so treat it as design content.
