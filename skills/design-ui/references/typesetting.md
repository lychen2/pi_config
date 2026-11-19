# Typesetting

Read this when text wraps badly, a heading ends on one lonely word, numbers jitter
while they change, a label breaks onto two lines, or Chinese and English sit awkwardly
together. Change only how text wraps, spaces, aligns, and truncates. Do not change
copy, fonts, colour, or layout beyond what a rule says.

Put the rules in the global text styles (base CSS, typography tokens, the Tailwind
config, or shared text components) so every page inherits them. Add per-component
rules only where a component overrides the base.

Every rule is progressive enhancement: a browser that does not know a property ignores
it. Add no polyfills. Scope Chinese rules with `:lang(zh)` and make sure `lang` is set
on `<html>` or on the element, so English text keeps its own rules.

## 1. Headings break into even lines

```css
h1, h2, h3, .card-title, .hero-line { text-wrap: balance; }
```

Lines come out about the same length, so a heading never ends on one lonely word.
Short text only: Chrome balances up to six lines.

## 2. No lone word at the end of a paragraph

```css
p, .description, li { text-wrap: pretty; }
```

Keep pairs that must not split together with a non-breaking space: an em dash and the
name after it, a number and its unit.

## 3. Numbers that change keep their width

```css
.counter, .price, .timer, .stat, td { font-variant-numeric: tabular-nums; }
```

The font must carry the `tnum` feature. Check that the width actually stops changing.
Leave running prose proportional.

## 4. Button labels stay on one line

```css
button, .label { white-space: nowrap; }  /* or flex-shrink: 0 */
```

A crowded row must not squeeze a label onto two lines.

## 5. Long text truncates instead of spilling out

A flex item will not shrink below its content, so text inside it cannot truncate.

```css
.flex-item { min-width: 0; }
.flex-item > .text { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
```

When the text really is cut (`scrollWidth > clientWidth`), show the full value in a
tooltip on hover.

## 6. Chinese body text is justified on a whole number of characters

```css
:lang(zh) p { text-align: justify; max-width: 26em; }
```

A whole-character measure (about 26 `em` at the paragraph's own size) leaves a
justified line stretching only for Latin words and squeezed punctuation. Do not justify
narrow columns (under about 15 characters), short text, captions, buttons, or
mostly-English text: the gaps become uneven.

## 7. Space between Han characters and Latin text or digits

```css
:lang(zh) { text-autospace: normal; }
```

The browser adds a thin gap. Do not also hand-type spaces in copy or translation files.
Skip code, inputs, and monospaced text.

## 8. No half-width gap before an opening bracket at line start

```css
:lang(zh) .ui-text { text-spacing-trim: trim-start; }
```

An opening `「`, `“`, or `（` at the start of a line drops its blank half and lines up
with the text above. Long-form text with a two-character indent uses `space-first`
instead. Chrome only for now.

## 9. Chinese headings break between words

Chinese has no spaces, so a heading can split a word across two lines. Mark the break
points between words with BudouX (its Simplified or Traditional Chinese model) as
`<wbr>`, at build time for static copy or at render time for dynamic copy. Then:

```css
:lang(zh) h1, :lang(zh) h2 { word-break: keep-all; overflow-wrap: anywhere; text-wrap: balance; }
```

Never use `keep-all` on Chinese without break points: the heading becomes one
unbreakable word. Do not use `Intl.Segmenter` (it splits common words wrongly), and do
not apply this to body text.

## 10. Optical alignment

Geometry equalises boxes; the eye equalises weight. Two places need the eye:

- **Text with a shape** (an icon beside a label, a label with an arrow, a badge inside a
  button). Centre the text by its visual weight, not by its bounding box. Allow uneven
  left and right padding to compensate for a glyph's side bearing, and expect the
  correction to be 1–2px.
- **CJK text inside a box.** Chinese glyphs carry no ascender or descender, so a box
  centred by `line-height` alone usually leaves the text sitting high or low, and the top
  and bottom gaps disagree. Centre the text with flex, or set equal padding on both
  sides, then look at the result rather than trusting the numbers.

Check every button and input at 100% and at 200% zoom before calling it aligned.

## 11. Line-start and line-end rules (避头尾)

Browsers already keep punctuation off the start of a line and squeeze line-end
punctuation. Do not rebuild them.

- Find and remove `line-break: anywhere` used to stop overflow: it turns these rules
  off. Use `overflow-wrap: anywhere` instead.
- Text drawn on canvas or SVG, or wrapped by hand in JavaScript, gets none of this.
  Apply the rules there yourself.

## 12. Fit localized labels

Check buttons, segments and headers at their actual widths with the longest supported translation. A single English word can become a German compound that overflows a `nowrap` button. Let the row or control grow when space permits. When localization is in scope, choose a shorter translation that keeps the action and meaning clear. [Vibe Design Tips 007](https://vibedesign.tips/zh/007-type-switches/)

## 13. When done

- List every file and selector changed.
- List every `line-break: anywhere` and `word-break: break-all` removed or kept, and
  why.
- Show before and after on the user's own pages: a wrapped heading, a paragraph
  ending, a changing number, a truncated label, and a mixed Chinese-English paragraph.

Source: 枯白啃设计 (@Kubai087), 《999 个小技巧》 007. See [ATTRIBUTION.md](ATTRIBUTION.md).
