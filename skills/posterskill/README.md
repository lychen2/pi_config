# posterskill

A [Claude Code](https://docs.anthropic.com/en/docs/claude-code) skill that generates print-ready conference posters from your paper. Point it at your Overleaf source and project website — it extracts the content, downloads figures, fetches logos, and builds an interactive poster you can edit in your browser. Single HTML file, no build step.

The key idea: the poster is a **live editor**. Drag dividers to resize columns and rows, click cards to swap or move them, adjust font sizes — then feed your layout back to Claude for further refinement. Iterate between the browser and Claude until it's perfect.

## Quick start

```bash
git clone git@github.com:ethanweber/posterskill.git poster && cd poster
git clone https://git.overleaf.com/YOUR_PROJECT_ID overleaf   # your paper
```

Optionally add reference posters for style matching:

```bash
cp ~/some_poster.pdf references/
```

Then start Claude Code and run the skill:

```bash
claude
```

```
/make-poster
```

It reads your paper, fetches your project website, matches your reference style, and generates a `poster/` directory. Open `poster/index.html` in a browser to preview and edit.

## What you get

The poster is a **self-contained HTML file** with a built-in visual editor:

- **Drag column dividers** to resize columns
- **Drag row dividers** to resize cards within columns
- **Click-to-swap** cards (click one diamond handle, then another)
- **Move/insert** cards to any position (click a handle, then click a drop zone)
- **A-/A+** buttons to adjust font size globally
- **Preview** mode to see exactly how it will print
- **Save / Copy Config** to export your layout as JSON

No npm, no build step, no server. Just open `index.html` in Chrome.

## Inputs

| Input | Source | Required |
|-------|--------|----------|
| Paper | `overleaf/` directory | Yes |
| Project website | URL (asked at runtime) | Yes |
| Reference posters | `references/` directory | No |
| Author website | URL for brand/style matching | No |
| Formatting specs | Text or conference instructions URL | Asked if missing |
| Logos | Downloaded from your website to `poster/logos/` | Auto |
| Git repo | URL to push the poster to | Optional |

## Editing workflow

1. Claude generates the first draft and opens it in your browser
2. Drag dividers, swap cards, adjust font size in the browser
3. Click **Copy Config** in the toolbar
4. Paste the JSON back to Claude — it updates the defaults
5. Repeat until you're happy
6. Click **Preview** to verify, then print to PDF (margins: none, background graphics: on)

## How it works under the hood

The poster uses a React app (loaded via CDN) with:

- **`CARD_REGISTRY`** — defines each card's content (title, color, JSX body)
- **`DEFAULT_LAYOUT`** — defines column structure and card ordering
- **`DEFAULT_LOGOS`** — institutional logos for the header
- **`window.posterAPI`** — programmatic API for automation

Claude uses [Playwright](https://playwright.dev/) to:
- Measure image aspect ratios and assign them to matching columns
- Auto-optimize column widths to minimize whitespace
- Take screenshots and visually verify the layout
- Generate PDFs at full print resolution

## Programmatic API

Available in the browser console or via Playwright:

```js
posterAPI.swapCards('method', 'results')      // swap two cards
posterAPI.moveCard('quant', 'col1', 2)        // move card to position
posterAPI.setColumnWidth('col1', 280)          // resize column (mm)
posterAPI.setCardHeight('method', 150)         // set card height (mm)
posterAPI.setFontScale(1.5)                    // adjust text size
posterAPI.getWaste()                           // measure whitespace
posterAPI.getLayout()                          // get current layout
posterAPI.getConfig()                          // get full config JSON
posterAPI.resetLayout()                        // restore defaults
```

## Example

See the [Fillerbuster poster](http://ethanweber.me/fillerbuster-poster) ([repo](https://github.com/ethanweber/fillerbuster-poster)) for an example built with this skill.
