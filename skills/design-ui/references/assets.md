# Reference material

Sources worth opening when the task needs a real implementation to learn from, an icon
set, or a named style anchor. Read the licence of each item before copying code or
assets into a project; the links carry their own terms.

## Working reference implementations

| Source | What it gives | Licence |
| --- | --- | --- |
| [kubai087/lumno-web](https://github.com/kubai087/lumno-web) | The Lumno product site: static Astro + React in ten languages, with animated product demos drawn from the extension's real UI. Best local reference for a demo built from the product itself instead of stock illustrations. | MIT |
| [kubai087/lumno-extension](https://github.com/kubai087/lumno-extension) | The extension behind it: command bar, instant tab, bookmark and history search, custom new tab page. Localisation files, store metadata, and release automation included. | MIT |
| [lumno.kubai.design](https://lumno.kubai.design/) | The deployed site. Use it to check the finished interaction, not to copy markup. | Site terms |

`lumno-web` also ships effect plates in `public/assets/feature-newtab/fx/` (`fx-ascii`,
`fx-blocks`, `fx-blur`, `fx-crt`) and parallax plates in `feature-newtab/`. Use them as
visual targets for [effects.md](effects.md), and check that any reused image is still
covered by the repository licence before shipping it.

## Hero and texture material

| Source | What it gives | Licence |
| --- | --- | --- |
| [kubai087/pro-threads](https://github.com/kubai087/pro-threads) | Thread and line effects for a dark hero section: all 26 letters, palette presets, gradients, and four preset scenes. Plain WebGL with no build step. Clone it and read the repository before adapting it. | Check the repository licence before reuse |
| [Textures](https://textures.dev/) | Animated, hover-reactive brand textures, each shipped as one React component an agent can drop in. Pair a texture with a fill colour and a blend mode. Free tier, updated weekly. | Product terms |

Texture on a page behaves like a material, not decoration: one texture, one blend
mode, and a fill colour from the palette. Two textures competing in one view read as
noise.

## Style anchors

Refer to a concrete product when a brief needs a tone, rather than an adjective:

- **Calm and precise, neutral greys, lit from above** — the Lumno extension and the
  Cloudflare dashboard. This is the anchor behind the button material in
  [spec.md](spec.md).
- **Neutral dark theme without a blue cast** — `#222` surfaces with
  `rgba(255,255,255,.12)` borders, used for the menu reference in [motion.md](motion.md).

## Icons

[Remix Icon](https://remixicon.com/) — neutral line and fill sets, available as
`@remixicon/react`. Its licence allows commercial use and modification in a larger work
without required attribution. It forbids selling the icons as a standalone product,
building a competing icon library from them, or using them as a logo or brand identity;
brand marks stay subject to their owners' trademarks. Keep the copyright notice when
redistributing the whole set or a substantial part.

Package registries disagree about this licence (Apache-2.0, ISC, and Remix Icon
License 1.0 all appear in metadata). Use the repository `License` file as the source of
truth, and do not assume Apache-2.0 because a CDN says so.

When the product needs its own function set rather than a borrowed one, use Skill
`kubai-icons` (source-available, local). It draws the set from one accent colour and one
construction, and exports static SVG. [icons.md](icons.md) covers the app-icon direction
that a functional set must not inherit.

## Component craft to study

[Evil Buttons](https://evilbuttons.com) ([source](https://github.com/radiumcoders/evil-buttons))
— animated buttons built with shadcn, each one live on the page: hold, slide, doubt,
glitch, detonate, reveal. Read it when a button has to carry personality, not as a default
for ordinary controls. Buttons shape the design language more than any other component,
so studying good ones pays off disproportionately.

No library is a substitute for the design: pick one behaviour and earn it inside the
product's own tokens.

## Generated-design fingerprints

A checklist of tells collected by Ayush Soni, useful in the same way as the defaults in
[direction.md](direction.md). The more of these appear together, the more the page reads
as generated:

- italic emphasis inside sentences, and italic words used as decoration;
- a high-contrast display serif with negative letter-spacing;
- interfaces polished past the point of usefulness: every edge rounded, every element
  shadowed;
- rules and dividers wherever a grouping could have carried the structure;
- many colour steps and transparencies rather than a small palette;
- bordered containers around every block of content;
- a chart standing in for a claim that needs one number;
- code-style breadcrumbs and section numbers on non-technical pages.

Reverse each item into an instruction: use one accent, let spacing group content, drop
the border when the background already separates, replace the chart with the number.

## When to add material here

Add an entry only when it is a durable reference: a repository, a licence, a named
product used as an anchor, or a plate the user can open. Do not store screenshots or
copies of other people's assets in this skill.
