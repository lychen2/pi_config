# Schematic and Architecture Figures (optional route)

Load this file only when a figure is conceptual: system architecture, workflow/pipeline, audit cascade, or topology. Measured data (bar/line/scatter/heatmap) stays on the main Matplotlib/Seaborn/Plotly route in `SKILL.md`; do not draw data through this renderer.

The renderer turns a structured FigureSpec JSON into editable SVG. It is local and deterministic: same spec plus the same installed fonts produces the same SVG. The renderer itself uses no network, API key, model, or MCP server. Review and revision are a separate step: inspect the output yourself and, for a high-stakes figure, use an independent host-agent reviewer as described below.

## When to use it

Use for:

- layered or hub-and-spoke system architecture;
- left-to-right pipelines and workflow chains;
- audit cascades and flow-control diagrams;
- topologies where node positions, connections, and groupings carry meaning;
- diagrams that will be edited later (SVG is plain text).

Do not use for:

- data plots or any encoding of measured values;
- qualitative or photographic illustrations;
- quick flowcharts where simpler text notation is enough.

## Command

Resolve paths relative to this skill directory. The renderer needs Python 3.11+ and only the standard library; `--preview` calls `rsvg-convert` (or `cairosvg`) when available.

```bash
python3 scripts/figure_spec_renderer.py schema
python3 scripts/figure_spec_renderer.py validate spec.json
python3 scripts/figure_spec_renderer.py render spec.json \
  --output figures/fig_arch.svg
rsvg-convert -f pdf figures/fig_arch.svg -o figures/fig_arch.pdf
# optional raster proof at the rendered size, for quick visual inspection
python3 scripts/figure_spec_renderer.py render spec.json \
  --output figures/fig_arch.svg --preview
```

`render` writes or overwrites the target SVG. Validation prints `CRITICAL` (render is refused) and `WARN` (rendered, needs inspection) issues. `rsvg-convert -f pdf` produces the vector PDF for LaTeX; the renderer itself has no PDF code.

## Workflow

1. **State the claim.** One sentence for what the figure must let a reader conclude. List entities, relations, and groups; decide whether the layout is layered, left-to-right, or hub-and-spoke.
2. **Draft the spec.** Center coordinates are node centers on a canvas of the intended final proportions. Start from a canvas around 500x350 for a single column, 900x500 for full width, 700x700 for a tall topology.
3. **Validate and render.** Fix critical errors and inspect warnings, especially overlap warnings.
4. **Inspect the real output.** Open the SVG/PDF/PNG and check node collisions, group framing, clipped labels, arrow entry/exit points, edge-label legibility, and grayscale separation. Edit the JSON, never the generated SVG, then re-render.
5. **Review and revise when the figure matters.** For a paper figure, run the criteria-based loop below; for a quick internal sketch, a self-check is enough.
6. **Archive the spec and trace.** Keep the FigureSpec JSON beside the output (for example `figures/specs/fig_arch.json`) so the figure is reproducible and editable; keep review scores in a working record, not in the artifact.

## FigureSpec fields

Run `schema` for the authoritative list. Summary:

```json
{
  "title": "metadata only, not rendered",
  "canvas": {"width": 900, "height": 520},
  "style": {
    "font_family": "Arial, Helvetica, sans-serif",
    "font_size": 14,
    "bg_color": "#FFFFFF",
    "palette": ["#2563EB", "#10B981", "#7C3AED", "#EA580C"]
  },
  "nodes": [
    {
      "id": "sensor",
      "label": "Sensor\n(3 replicates)",
      "x": 180, "y": 140,
      "width": 140, "height": 56,
      "shape": "rounded",
      "fill": "#DBEAFE", "stroke": "#2563EB",
      "text_color": "#333333", "font_size": 13,
      "sublabel": "acquired at 10 Hz"
    },
    {"id": "qc", "label": "QC filter", "x": 380, "y": 140,
     "shape": "diamond", "width": 120, "height": 70}
  ],
  "edges": [
    {"from": "sensor", "to": "qc", "label": "raw", "style": "dashed",
     "color": "#555555", "thickness": 2, "curve": false}
  ],
  "groups": [
    {"label": "Acquisition", "node_ids": ["sensor", "qc"],
     "fill": "#F0F9FF", "stroke": "#BAE6FD", "padding": 20}
  ],
  "labels": [
    {"text": "Stage 1", "x": 40, "y": 30, "font_size": 13,
     "color": "#555555", "anchor": "start"}
  ]
}
```

- `shape`: `rect`, `rounded` (default), `circle`, `ellipse`, `diamond`. Edge clipping is shape-aware.
- `fill`/`stroke` default to a lightened/stroke pair from `style.palette`, assigned by node index. Set them explicitly when color carries meaning.
- `label` supports `\n` or a JSON newline for multiple lines.
- `edges`: `from`/`to` are required; equal ids draw a self-loop. `style` is `solid`, `dashed`, or `dotted`; `curve: true` bows the edge by a fixed offset.
- `groups` draw background rectangles framing their member nodes. They are frames, not containment: do not nest them.
- With no explicit `fill`/`stroke`, palette assignment depends on node order, so inserting a node shifts colors downstream. Set explicit colors once the figure is final.

## Layout patterns

**Layered architecture.** Stack rows of peer nodes, one group per row, and label inter-layer arrows with direction and meaning (`uses`, `produces`, `checks`).

**Hub-and-spoke.** Put the central component in the middle, satellites around it; solid arrows for primary relations, dashed for feedback.

**Pipeline with feedback.** Main chain left to right; feedback edges below with `curve: true`.

**Audit cascade.** Three horizontal stages, each in its own group; inputs from the top, outputs to the right.

## Layout rules

- Do not cross long diagonals through several rows; reflow the layers instead.
- Keep one font size per node role; reserve bold node labels and smaller edge labels.
- Keep edge labels short and place the arrow so it enters and leaves cleanly.
- Opposite-direction edges between the same pair share one axis; offset a node or move the feedback edge to a different tier so arrows and labels stay legible.
- Check the rendered result in grayscale as well as color; color must not be the only cue.
- Use the same palette and typography as the data figures so a paper reads as one set.

## Review and revision loop

Treat the first render as a draft. Because the renderer is deterministic, every fix belongs in the spec, never in the generated SVG.

**Review input:** the FigureSpec JSON, the rendered SVG (plus PNG/PDF at final size), and one sentence stating the claim the figure must support.

**Criteria (score 1-10 each):**

- **Clarity (C):** can a reader who knows the paper's topic understand the system from the figure and caption alone?
- **Readability (R):** font sizes, label placement, alignment, visual hierarchy, and legibility at final print size.
- **Semantic accuracy (S):** every edge, group, and label matches the described system; no missing or invented relation.

**Revision target:** all three axes at least 7/10, with the concrete issues fixed. The ARIS source figures needed roughly five rounds to reach C7/R7/S8; plan for more than one pass on a high-stakes figure. Stop when the remaining issues are stylistic preferences rather than comprehension or accuracy problems, or when the axes stop improving.

**Who reviews:** use the host's independent delegation when it is available and the figure may be shared. In Pi, dispatch a read-only `analyst` teammate in a fresh context and give it only the spec, renders, and claim sentence; inherit the current session's provider/model and do not switch it implicitly. Keep manuscript text and unpublished data out of the review payload. If the figure cannot leave the session, run the same three criteria yourself and record that the pass was self-review. Data plots keep their existing review path.

**Trace:** save the reviewer route (self or independent), scores, and concrete fixes in a working record such as `figures/specs/<figure>.review.md` or the session. Never put scores, review status, or compliance commentary in the figure, caption, or panels. Re-render after each spec revision and re-check the changed areas at final size.

## Paper planning and LaTeX inclusion

Plan the figure set as part of the argument: one line per figure with the claim it supports, its panels, data sources, and intended final width. Order figures in argument order; use a schematic only where a data panel cannot show the mechanism. A complete set often pairs one architecture/pipeline schematic with data figures that share its style.

Include vector output at final physical width instead of scaling a small export:

```latex
\usepackage{graphicx}
% ...
\begin{figure}[t]
  \centering
  \includegraphics[width=\linewidth]{figures/fig_arch.pdf}
  \caption{Processing pipeline. Boxes denote stages; dashed edges mark
    fallback paths. Values are defined in the text.}
  \label{fig:arch}
\end{figure}
```

Use `\linewidth` for a single-column figure and `\textwidth` when a figure spans both columns; keep the same width used for the final-size inspection. Prefer PDF or SVG-derived vector output for line art, and do not upscale rasters. `rsvg-convert` keeps text editable as embedded fonts chosen from the requested family; confirm the substituted font and small-label legibility at the included width. Put method conditions or normalization statements in the caption when they are needed to read the figure, not compliance commentary.

## Provenance and license

Vendored from ARIS (Auto-claude-code-research-in-sleep), `skills/figure-spec/`:

- Repository: <https://github.com/wanshuiyin/Auto-claude-code-research-in-sleep>
- Source commit: `c485faa59a68e51c6575dea67ca57abc7a6a2b9c`
- Source files: `skills/figure-spec/SKILL.md` (schema/workflow reference) and `skills/figure-spec/scripts/figure_renderer.py` (blob `11e226560961262587c76d6e1a8ce1d1ac48c754`)
- License: MIT, Copyright (c) 2026 wanshuiyin

Local file: `scripts/figure_spec_renderer.py`. The only local change is the provenance/usage docstring; CLI, geometry, validation, and deterministic rendering are unchanged. The upstream `figure-spec` SKILL.md resolves the renderer through ARIS runtime paths and prescribes selectable reviewer backends plus a scored review loop; this integration keeps the review criteria and revision loop but drops the ARIS path/backend plumbing, using the skill-local path, the host's own delegation tool for independent review, and the existing `rsvg-convert` dependency.

Upstream MIT notice:

```text
MIT License

Copyright (c) 2026 wanshuiyin

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
