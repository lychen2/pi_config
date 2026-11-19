# Venues: format, submission rules, and writing style

Venue rules are time-sensitive. Never infer a current page limit, style-file name, deadline,
or anonymity rule by changing the year in an old filename, and never present a generic
scaffold as an official template.

## 1. Resolve the exact target

Ask for or derive: venue or funding agency; year or cycle and track; document type (research
article, short paper, main track, R01, R21); submission stage (initial, revision/rebuttal,
camera-ready); authoring format.

Do not combine rules from similarly named venues or tracks. Then:

1. open the official author instructions, call, solicitation, or policy guide;
2. note the source URL and the date checked;
3. distinguish initial submission from revision and camera-ready rules;
4. treat every bundled file below as a scaffold unless it is explicitly a copy of an
   official package.

### Optical-system TARGET_VENUE

Set `TARGET_VENUE` in the paper plan to a canonical journal name below, together with the
article type and submission stage. It is a workflow field, not an environment variable.
Pass the same value to `customize_template.py --venue` to select the bundled content
template. Existing non-optics targets remain supported.

| TARGET_VENUE | CLI ID | Writing emphasis / format source |
|---|---|---|
| Optics Express | `optics-express` | Complete theory, design, setup and quantitative optical/system evidence; Optica universal template |
| Optics Letters | `optics-letters` | One concise result and decisive evidence; official Length Check Template |
| Optica | `optica` | Physical/system advance with significance beyond a single configuration; article type determines universal versus Length Check Template |
| JOSA A | `josa-a` | Imaging, optical design and physical-optics analysis; Optica universal template |
| JOSA B | `josa-b` | Optical physics, laser/material or nonlinear mechanisms where those are the actual contribution; Optica universal template |
| IEEE Photonics Journal | `ieee-photonics-journal` | Photonics system/technology evidence; IEEE two-column template, Graphic Abstract and Impact Statement |
| Laser & Photonics Reviews | `laser-photonics-reviews` | Substantial laser/photonics advance or a Review when that is the selected article type; current Wiley instructions |

Do not silently choose between JOSA A and B from `JOSA`. The catalog can list both;
generation requires the branch. The default optics research-article body is
**Theory → Design/Simulation → Experimental Setup → Results**, with Introduction before
and Discussion/Conclusion after. Letters may combine headings while keeping this logical
order. Review articles follow a synthesis structure, and simulation-only work describes
numerical validation rather than an invented experimental setup.

Official sources:
- [Optica Publishing Group templates](https://opg.optica.org/content/author/portal/item/templates-default)
  (checked 2026-11-02): universal manuscript template for OE, Optica, JOSA A/B; Length Check
  Template for OL and Optica Letters/Memoranda. The page requests one `.tex` file and
  standard LaTeX with minimal custom macros. Assemble drafting files and inline/expand
  macros as required before submission; do not submit a multi-file section tree unchanged.
- [IEEE Photonics Journal author information](https://ieeephotonics.org/publications/photonics-journal/)
  (checked 2026-11-02): two-column format and journal-specific submission components.
- [Laser & Photonics Reviews author guidelines](https://onlinelibrary.wiley.com/page/journal/18638899/homepage/author-guidelines):
  use the live Wiley instructions for the selected article type. Current length and style
  requirements are not bundled; resolve them before preparing the submission package.

The local optics file is a compilable **content template**, not a publisher style or a
claim of format compliance. Keep official class/bibliography files unmodified when applying
them. Do not infer journal fit or an acceptance claim from the availability of a template.

## 2. Consult the right reference

| Need | Reference |
|---|---|
| Journal submission and publisher resources | `venues/journals_formatting.md` |
| Optical journals, TARGET_VENUE and direct-write manuscript structure | Optical-system table above; `writing.md` |
| Conference rules and verified snapshots | `venues/conferences_formatting.md` |
| Poster sizes, layout, accessibility | `venues/posters_guidelines.md` |
| NSF, NIH, DOE, DARPA, foundation proposals | `venues/grants_requirements.md` |
| Cross-venue writing comparison | `venues/venue_writing_styles.md` |
| Nature / Science writing | `venues/nature_science_style.md` |
| Cell Press writing | `venues/cell_press_style.md` |
| Medical journal writing | `venues/medical_journal_styles.md` |
| ML and computer-vision conferences | `venues/ml_conference_style.md` |
| ACL, EMNLP, CHI, and other CS venues | `venues/cs_conference_style.md` |
| Review criteria and rebuttals | `venues/reviewer_expectations.md` |

Reference files summarize rules and do not override the current official source.

## 3. Know which page rule applies

Page counting is the most common misread rule:

- **ML conferences** (ICLR, NeurIPS, ICML, AAAI): main body up to the end of the conclusion;
  references and appendix are not counted. Limits cluster around 7–9 pages depending on venue
  and year — confirm for the exact year.
- **IEEE Photonics Journal and optical journals**: use the exact journal and article-type
  counting rule, including references, figures and any length-check requirement; do not
  inherit a generic IEEE Transactions or ML conference limit.
- **Medical and Nature-family journals**: main text, abstract, and display-item counts are
  separate limits; check the article type.

Citation commands follow the same split: natbib (`\citep`, `\citet`) for ML conferences,
the `cite` package with numeric `\cite{}` for IEEE. Never mix the two in one document.

## 4. Start from the official template

For annual conferences and publisher-managed workflows: download the template from the
official source, keep its class/style files unmodified, and add content without overriding
margins, font sizes, spacing, or headers. Use a bundled scaffold for drafting or when the
official source permits it.

Bundled scaffolds, in `assets/`:

| File | Status |
|---|---|
| `assets/journals/optics_article.tex` | Optical-system content template for the seven journal targets above; generic article class, not official styling |
| `assets/journals/math_commands.tex` | Drafting notation and SI/compound-unit macros; inlined by the optics customizer for a standalone `.tex` |
| `assets/journals/nature_article.tex` | Nature-oriented writing scaffold, not an official template |
| `assets/journals/plos_one.tex` | PLOS ONE-oriented scaffold; compare with the current official package |
| `assets/journals/neurips_article.tex` | NeurIPS wrapper; requires the official `neurips_*.sty` |
| `assets/journals/elsarticle-template-{num,num-names,harv}.tex` | Elsevier `elsarticle` examples, with matching `.bst` files |
| `assets/grants/nsf_proposal_template.tex` | Planning scaffold for NSF narrative components |
| `assets/grants/nih_specific_aims.tex` | One-page Specific Aims writing scaffold |
| `assets/posters/beamerposter_academic.tex` | Venue-agnostic poster scaffold; set dimensions from the event's instructions |
| `assets/examples/` | Abstract, introduction, and structured-abstract exemplars to calibrate style |

Grants: many components are entered or uploaded separately; a combined `.tex` file is not an
agency-issued form. Use SciENcv and the agency common forms for biosketches and current
support.

## 5. Helpers

```bash
python3 scripts/venues/query_template.py --list-all
python3 scripts/venues/query_template.py --venue NeurIPS --requirements
python3 scripts/venues/query_template.py --type grants
python3 scripts/venues/query_template.py --venue "Optics Express" --requirements
python3 scripts/venues/query_template.py --venue JOSA

python3 scripts/venues/customize_template.py \
  --venue "Optics Express" --title "Laser direct-write system" \
  --authors "First Author, Second Author" \
  --affiliations "Optical Engineering Laboratory" --output paper.tex

python3 scripts/venues/customize_template.py \
  --template nature_article.tex --title "Title" \
  --authors "First Author, Second Author" \
  --affiliations "Institution" --output my_paper.tex

python3 scripts/venues/validate_format.py --file paper.pdf --venue icml-2026 \
  --content-pages 8 --check page-count,fonts
```

`scripts/venues/validate_format.py` reports page totals and embedded fonts. It cannot prove that margins,
font sizes, excluded sections, or hidden metadata comply — check those against the official
rules yourself. `--content-pages` must be counted under the venue's rule; the script does not
infer where references or appendices begin.

The optics customizer embeds `math_commands.tex`, so moving the generated `paper.tex`
does not lose its macro dependency. Author/title fields accept LaTeX; escape special
characters such as `&` as `\&`. Example notation: `\OptLambda`, `\OptNA`, `\OptWaist`,
`\OptRayleighRange`, `\OptMtwo`, `\OptMTF`, `\OptWFE`, `\OptDose`, `\OptPositionError`;
units use `\SI{405}{\nano\metre}` or `\SI{20}{\OptProcessDoseUnit}`. MTF frequencies
reported with `\OptSpatialFrequencyUnit` mean cycles/mm, not radians/mm. Define symbols,
reference planes, beam width and unit conventions in the manuscript even when using macros.

## 6. Before submitting

- [ ] exact venue, year/cycle, track, article type, and stage identified;
- [ ] official source URL recorded with the date checked;
- [ ] official template or form used where required;
- [ ] page-limit scope understood, including excluded sections;
- [ ] required statements, checklists, and disclosures present and factual;
- [ ] blind-review files and PDF metadata contain no identity leak;
- [ ] figures and tables legible at final size, with accessible encodings;
- [ ] references, appendices, and supplements under current rules;
- [ ] PDF and source package compile cleanly;
- [ ] portal preview reviewed before final submission.

## Where the writing itself comes from

Framing, abstract, introduction, and revision: `writing.md`. Section contents:
`writing/imrad-structure.md`. Display provenance: `writing/figures-and-tables.md`. Reporting
guideline for the study design: `writing/reporting-guidelines.md`. Journal policy and AI
disclosure questions: `writing/journal-policies.md` and
`writing/authorship-and-ai-disclosure.md`.
