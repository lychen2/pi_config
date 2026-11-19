---
allowed-tools: Read Write Edit Bash Glob Grep WebSearch WebFetch
compatibility: 文献检索需要网络。正文引用键核对使用 Pandoc。统计、单位与实验设计脚本使用 Python 3.11+，按需用 uv 安装依赖。光学 LaTeX 模板使用 amsmath、amssymb、siunitx。绘图由 scientific-visualization 负责。
description: 开展科研工作，涵盖选题与新意核查、文献检索与精读、系统综述、引文核验、论文复现、实验设计、数据与图表核对、单位与不确定度、论文写作与审稿。光学默认面向激光直写系统、镜头与光束设计、精密定位、曝光工艺和光机电集成。
license: MIT
name: research
---
# Research

Start with the requested deliverable in the table below. For a lookup, calculation or
file check, run the matching tool directly. Follow a reference when a choice of method
or interpretation affects the answer. A full project can move from question and prior
work through design, measurement, claims, writing and independent review as needed.

## Optical-system profile

For optics or laser direct-write work, first read [Optics Domain Rules](CLAUDE.md).
Choose the model from the observable in the lens and beam delivery, motion and metrology,
exposure process, or integrated instrument.

ARIS task names map to references here, not separate slash commands: `idea-discovery`
and `novelty-check` → `references/optics/idea-discovery.md`; `experiment-plan` and
`result-to-claim` → `references/experiments-and-claims.md`; `paper-write` →
`references/writing.md` and `references/venues.md`; `paper-figure` → the figure guidance
below and `scientific-visualization`.

## Task routes

Use project conventions and raw evidence. Tie a consequential number or claim to its source
location, run, or derivation and give the conditions that affect its meaning. Keep production
notes in the working record. Ask for missing inputs when they determine the result.

When asked to choose between research tools, use the same representative input, requested
artifact and constraints for each candidate. Open the artifact and check it against the
source. Report what ran locally, what only has a published example, and where a run stopped.

| Situation | Read |
|---|---|
| Find a paper or build a reading list | `references/literature.md` for database choice. For a multidisciplinary query, `scripts/citations/search_openalex.py` returns records or BibTeX. |
| Read one paper closely or synthesize a set of studies | `references/literature.md` for reading depth, source locators and systematic screening |
| Discover an optical-system idea or check its novelty against prior art | `references/optics/idea-discovery.md` |
| Check references or a bibliography import | `references/citations.md`. `scripts/citations/validate_citations.py` checks manuscript keys with `--manuscript` and registry titles with `--check-dois`. |
| Frame a proposal, choose the next experiment, interpret an unexpected result, or select fixed/random factors, blocking or DOE | `references/decisions-and-design.md` |
| Reproduce a published result, plan claim-driven runs, or compare results against the claim | `references/experiments-and-claims.md` |
| Define laser direct-write performance, metrology, dose, and process metrics | `references/optics/experimental-metrics.md` |
| Power, sample size, test choice, assumptions, effect sizes or Bayesian analysis | `references/statistics.md` |
| Get per-group counts, missing values, range or mean from a CSV | `scripts/stats/group_summary.py data.csv --group GROUP --value MEASUREMENT` |
| Units, dimensional checks, uncertainty budgets, coverage factors | `references/uncertainty-and-units.md` |
| Lens design, Gaussian beams, scanning, focusing, positioning, dose and calibration | `references/optics.md` |
| Select and validate a scriptable optical tool for a concrete task | `references/optics/open-source-tools.md` |
| Polish or translate existing prose | Preserve the author's meaning and degree of certainty in one pass. [Editing existing prose](references/writing.md#editing-existing-prose) |
| Draft from results or check whether a claim is justified | Match the claim and its scope to the evidence. [Writing and revision](references/writing.md) |
| Page limits, style files, anonymity, poster and grant formats | `references/venues.md` |
| Plan or verify figures against the source data, including optical paths, spots/MTF, spectra, beam modes and metrology | `references/writing/figures-and-tables.md` for evidence checks, `scientific-visualization` for rendering |
| Review a manuscript, address review findings, or answer reviewers | `references/review-and-revision.md`. Start with one evidence-based review. Use the bounded loop for an iterative review request. |

Deeper material sits beside each of these: `references/literature/`, `citations/`, `design/`,
`statistics/`, `units/`, `optics/`, `writing/`, `venues/`, and templates in `assets/`.

## Scripts

All paths are relative to this skill directory. Run with `python3`; install dependencies with
`uv`.

| Script | Use |
|---|---|
| `scripts/design/randomization.py` | seeded allocation schedules (simple, permuted-block, stratified, cluster) |
| `scripts/design/doe_designs.py` | factorial, fractional, Plackett-Burman, response-surface, Latin-hypercube designs in real units |
| `scripts/stats/power.py` | closed-form sample size, power, MDE, power curves |
| `scripts/stats/simulate_power.py` | Monte Carlo power for models without a formula |
| `scripts/stats/assumption_checks.py` | normality, variance homogeneity, regression diagnostics, outliers |
| `scripts/stats/group_summary.py` | per-label CSV summaries and exact comparison with the expected group labels |
| `scripts/units/*.py` | convert, propagate (GUM + Monte Carlo), budget, format, audit units, plausibility |
| `scripts/papers/*.py` | paginate an API walk, JATS XML → text, arXiv Atom → JSON, OpenAlex abstract |
| `scripts/citations/*.py` | DOI/metadata → BibTeX, format, validate, search OpenAlex/PubMed/Scholar |
| `scripts/venues/*.py` | list, copy, customize, and inspect venue templates |

## Conventions

- Reference links are relative to their containing Markdown file. CLI paths starting with
  `scripts/` or `assets/` are relative to this skill directory; project paths are relative to
  the project root.
- Parameters are in real units with named columns in every generated design and analysis
  output.
- Seeds, library versions, and solver settings travel with any result you report.
- Raw data stays immutable; processed data is written separately with units and a
  transformation history.

## Boundaries

- Plotting, palettes, journal figure rules: `scientific-visualization`.
- Symbolic derivation: `sympy`.
- PDF, figure, table, and OCR extraction: `mineru-file-processing`.
- Slides and talks: `scientific-slides`; posters and venue templates start here.

## Provenance

This entry consolidates material from three sources, all MIT-licensed. Full license texts,
per-skill upstream tree SHAs, and the ARIS commit are in `THIRD-PARTY-LICENSES.md`:

- the repository's former `research-decision`, `experimental-design`, `statistical-analysis`,
  `statistical-power`, `uncertainty-and-units`, `optics-research`, `paper-lookup`,
  `citation-management`, `scientific-writing`, and `venue-templates` skills, derived from
  [K-Dense scientific-agent-skills](https://github.com/K-Dense-AI/scientific-agent-skills)
  `v2.65.0` (MIT, © K-Dense Inc.);
- workflow structure, the claim-map and result-to-claim method, the independent-review loop,
  and the writing-voice rules, adapted from
  [Auto-claude-code-research-in-sleep (ARIS)](https://github.com/wanshuiyin/Auto-claude-code-research-in-sleep)
  at commit `c485faa5` (MIT, © 2026 wanshuiyin);
- writing craft adapted from Orchestra Research's paper-writing guidance as distributed in
  that pack, and the citation-verification practice from claude-scholar and
  academic-research-skills.

`MANIFEST.md` records what came from where, what was deliberately left behind, and how the
routes were checked.
