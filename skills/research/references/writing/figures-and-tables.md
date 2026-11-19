# Optional Figures and Tables

Figures and tables are optional. Include a display only when it communicates verified
evidence more clearly than prose and the target venue permits it. This skill does not
generate images, schematics, graphical abstracts, or synthetic scientific visuals.

## Provenance gate

Each display needs a record containing:

- stable display ID and version;
- source data or evidence IDs;
- code, query, or manual transformation used;
- accountable creator and reviewer;
- date generated or revised;
- analysis population, exclusions, and sample size;
- units, scales, denominators, and uncertainty definitions;
- license, attribution, and permission status for reused material;
- documented adjustments, cropping, compositing, or preprocessing.

Do not recreate missing source data from a screenshot or published graphic. Do not
alter an image in a way that hides, removes, duplicates, or misrepresents information.
Retain original files and an audit trail.

## Choosing a form

Use:

- prose for a small number of directly relevant values;
- a table when exact values and multidimensional comparison matter;
- a figure when pattern, distribution, relationship, sequence, or spatial information
  matters.

Avoid duplicating the same information in prose, a table, and a figure. There is no
universal minimum, maximum, or display-per-word rule.

## Optical-system figure plan

For laser direct-write work, prefer physical evidence over training curves. Keep only
the panels needed by the claim, normally in this order:

| Figure role | Preferred display | Interpretation requirements |
|---|---|---|
| System and mechanism | Optical-path drawing plus motion/control/metrology connections | Propagation arrows, source, expander/shaper, pupil relay, scanner, objective, sample and reference planes; distinguish optical paths, signals and motion axes. Label a schematic rather than imply dimensional accuracy. |
| Optical design | Spot diagrams, PSF/MTF, wavefront/OPD or encircled energy across the field | Wavelength, NA, field/pupil/focus, physical scale, geometric versus diffraction model, spatial-frequency units and sagittal/tangential directions. |
| Beam / mode / spectrum | Intensity and phase maps, beam caustic, normalized mode decomposition, measured spectra | Colorbar quantity and unit, common normalization, plane/scale, wavelength, phase convention and resolution/bandwidth. Intensity images alone do not establish coherent mode purity. |
| Precision and stability | Position-at-exposure residuals, overlay/stitching vector maps, vibration spectra, drift traces | Reference frame/instrument, time/frequency units, sampling and bandwidth, fit/evaluation split, warm-up and uncertainty; retain absolute drift when detrended data are shown. |
| Process and system outcome | Dose–focus/CD maps, microscopy/profilometry, LER and throughput–quality comparisons | Recipe, sample-plane dose, scale bars, independent repeats, measurement method and quality/yield criterion; separate optical prediction from developed features. |

Use simulation and measurement together only with explicit labels and matched conditions.
Do not create a spectrum or mode panel for a claim it does not support. Optimization-loss
or training curves belong in support of convergence/optimizer claims, not in place of
optical or instrument performance. Captions explain the physics, not the plotting process.

Hand the plan to `scientific-visualization`. Its optical route uses data plotting for
measured arrays and editable drawings for optical paths; a generic node-and-arrow diagram
is suitable for control flow, not a substitute for a lens/beam layout.

## Tables

Check:

- title and notes define population, time point, analysis set, units, and abbreviations;
- rows and columns preserve denominators and distinguish missing from zero;
- percentages can be recomputed from the recorded numerator and denominator;
- precision is consistent with the measurement and analysis;
- uncertainty and statistical quantities are named, not implied by symbols alone;
- values match the abstract, prose, other figures, and supplement;
- cells remain accessible as text rather than an image when the venue allows.

## Figures

Check:

- axes, scales, transformations, units, and reference lines are explicit;
- truncated or nonlinear scales are visible and justified;
- individual observations or distributions are shown when scientifically appropriate;
- uncertainty is defined;
- group sizes and exclusions are available;
- legends identify all encodings;
- colors, shapes, line styles, labels, or patterns provide redundant cues;
- image panels include scale and orientation information where relevant;
- the final exported file matches current journal format and size instructions.

Do not add significance stars or trend lines unless they map to a verified analysis.

For a grouped CSV plot, run `python3 scripts/stats/group_summary.py eligible.csv --group method --value score`
on the rows selected by the stated inclusion rule. Pass `--expect` followed by the actual legend labels
to check both sets. The table gives rows, valid measurements, missing values, range and arithmetic mean.
Blank, `NA`, `N/A`, `NaN` and `null` measurements count as missing. These counts describe rows.
Count independent subjects or experiments separately when observations repeat.

Open the export and match each visible series to its source values at the same x or bin.
For a summarized series, recompute the plotted estimator and uncertainty from its contributing rows.
Check units and axis limits. A group with no valid observations needs an explanation in the figure or caption.

## Captions and alt text

A caption should state what is shown, define panels and encodings, identify the analysis
population, units, uncertainty, and relevant methods, and link to evidence IDs during
drafting.

Alt text should:

- identify the display type and purpose;
- summarize the principal visible pattern without adding a new conclusion;
- describe axes, groups, direction, and uncertainty needed to understand the display;
- avoid repeating the full caption or listing every data point;
- be reviewed manually with the final display.

Automated accessibility checks do not verify scientific correctness. Inspect contrast,
color independence, reading order, label size, keyboard or screen-reader behavior where
applicable, and legibility at final size.

## Flow diagrams

Use the current official flow-diagram resource for the selected guideline, such as
CONSORT 2025 or PRISMA 2020 [SW-S07, SW-S10]. Populate it only from verified counts.
Reconcile every branch and denominator with the methods, results, and abstract.

## Final manual review

An accountable human should compare each display against source data and analysis
output, inspect permissions and confidentiality, verify captions and alt text, and
confirm the rendered export. Passing a file-format or consistency check does not certify
the display.
