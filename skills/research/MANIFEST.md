# `research` — consolidation manifest

One deployed entry, `skills/research`, replaces ten separately deployed skills. Plots stay in
`scientific-visualization`; nothing in this directory generates figures.

| Replaced entry | What it contributed | Now lives in |
|---|---|---|
| `research-decision` | evidence-graded decisions: question/action/unit, evidence origin, alternative explanations, discriminating test, measurement chain, switch condition | `references/decisions-and-design.md` (Part A) |
| `experimental-design` | Fisher's principles, design choice tree, pseudoreplication, DOE layout generation | `references/decisions-and-design.md` (Part B), `references/design/*`, `scripts/design/` |
| `statistical-analysis` | test selection, assumptions and diagnostics, effect sizes, Bayesian analysis, APA reporting | `references/statistics.md` (Part B), `references/statistics/*`, `scripts/stats/assumption_checks.py` |
| `statistical-power` | four-quantity identity, effect-size choice, simulation-based power, planning adjustments, reporting template | `references/statistics.md` (Part A), `references/statistics/{closed_form_recipes,effect_sizes,simulation_based_power}.md`, `scripts/stats/{power,simulate_power}.py` |
| `uncertainty-and-units` | GUM framework, Monte Carlo propagation and clause 8 test, coverage factors, unit defects, plausibility bands | `references/uncertainty-and-units.md`, `references/units/*`, `scripts/units/` |
| `optics-research` | question-first optical modelling, conventions and approximations, per-method verification, measurement provenance, delivery rules | `references/optics.md`, `references/optics/*` |
| `paper-lookup` | database routing, quiet-failure hazards, identifier handling, pagination and parsing scripts | `references/literature.md`, `references/literature/*`, `scripts/papers/` |
| `citation-management` | record resolution, BibTeX construction, validation, dedup, search workflows | `references/citations.md`, `references/citations/*`, `scripts/citations/` |
| `scientific-writing` | drafting rules, IMRAD structure, figures and tables, reporting guidelines, authorship/AI policy, journal policy | `references/writing.md`, `references/writing/*` |
| `venue-templates` | venue rule resolution, page-count rules, LaTeX scaffolds, template helpers, venue writing styles, reviewer expectations | `references/venues.md`, `references/venues/*`, `assets/`, `scripts/venues/` |

New material written for this entry: the task routing table in `SKILL.md`; the
claim map, block roles, run order, and result-to-claim gate in
`references/experiments-and-claims.md`; the narrative, sentence-craft, revision-pass, and
claim-calibration sections of `references/writing.md`; the reviewer brief, bounded review loop,
and response-letter form in `references/review-and-revision.md`; the path and variable-name
repairs in the carried-over reference files.

## Optical-system profile

The local optical profile targets laser direct-write instruments: lens/beam design,
scanning, precision motion and metrology, exposure/process control and system integration.
`CLAUDE.md` owns the domain rules and `SKILL.md` loads them explicitly for optics work.
`references/optics/{idea-discovery,experimental-metrics,open-source-tools}.md` own novelty,
measurement definitions and example-based, task-specific tool selection. Writing, figure planning and
review briefs consume these conventions; the host review mechanism remains as described
below. The corresponding figure route lives in `scientific-visualization`.

`assets/journals/optics_article.tex` is a local content template for seven optical journal
targets, registered in `scripts/venues/query_template.py`. `customize_template.py --venue`
selects it and embeds `math_commands.tex` for a standalone document. Publisher class/style
files are not bundled or imitated by this template; official sources and article-type
requirements are in `references/venues.md`.

## ARIS material

Read from `Auto-claude-code-research-in-sleep` (ARIS) at the pinned checkout, skills
`experiment-plan`, `result-to-claim`, `research-lit`, `paper-plan`, `paper-write`,
`paper-writing`, `auto-review-loop`, `research-review`, and
`shared-references/{writing-principles,taste-calibration,reviewer-independence,review-scope-limits,acceptance-gate}.md`
at commit `c485faa59a68e51c6575dea67ca57abc7a6a2b9c`.

Imported and consolidated into one entry:

- claim → block → run-order planning, with anti-claims and per-block success/failure
  criteria (`experiments-and-claims.md` §1–§4);
- the result-to-claim judgement: what the data shows, what it does not, missing evidence,
  claim revision, next action (§5);
- independent review (`review-and-revision.md`) uses a fresh reader, original files and
  traceable findings with minimum fixes. A one-off review returns its findings directly.
  Explicit iterative ARIS stages retain their round budgets and verdict rules. The existing
  working record carries unresolved findings across rounds. Budget exhaustion leaves those
  findings open;
- "one technical story", reviewer reading order and time allocation, the five-part abstract,
  contribution-bullet test, Gopen–Swan sentence principles, the reverse-outline test
  (`writing.md`);
- the advice to state the supported advantage, retain unfavorable comparisons and give each
  experiment an argumentative role, adapted in `writing.md` from
  `shared-references/writing-principles.md` and the `CONFIDENT PROSE, HONEST LIMITS` block.

Adapted to this host rather than copied: the reviewer is a fresh-context delegate on the
model that is actually available, so the loop runs without a forced provider switch and
without cross-family attestation. A different model family remains a bonus, not a gate.

Left behind from ARIS: reviewer backend detection and routing, family-derivation and
attestation (`identity_assurance`, `family_relation`), `REVIEW_UNAVAILABLE` status plumbing as
an acceptance state, `ACQUITTAL_LOG.jsonl` receipts and external-finalizer obligations, the
`save_trace.sh` / `review_gate.py` trace protocol and its per-call artifacts, research-wiki
ingest and query packs, bounded fan-out leaf shards and coverage receipts, style-reference
profile extraction and gap reports, event logs and self-optimization.

The review practice and its repeated, bounded loop are kept; the cross-family machinery that
certified it is not.

Also deliberately dropped from the merged material:

- `scientific-writing`'s audited-workspace workflow: `scaffold_manuscript.py`,
  `validate_manifest.py`, `audit_claims.py`, `check_consistency.py`, `check_references.py`,
  `lint_manuscript.py`, `select_reporting_guidelines.py`, `validate_authorship.py`, and the
  JSON/CSV manifests they consume, plus `references/{source_ledger,evidence_workflow,cli_reference}.md`.
- the `DRAFT — NOT FOR SUBMISSION` manuscript scaffold and its evidence-marker banners;
- research-decision's checkpoint tool protocol, which stayed process narration in the
  deliverable;
- every fingerprinted source citation of the form `[SW-S01]`.

What was kept from those files is scientific and policy substance: how to select a reporting
guideline by design, what each guideline covers, authorship and AI-disclosure rules, journal
policy, figure and table provenance, IMRAD contents.

## Field examples informing the local checks

Liao et al. inform the wording-only and claim-check routes. In their first revision round,
GPT-6-astra retracted 0.2% of the original claims under polishing and 25.3% after self-review.
Two annotators checking full papers judged 36 of 60 sampled qualifications redundant and found
both justified and unnecessary changes to claims. Four readers rated the polish-only rewrites
easier to read. [Table 2](https://arxiv.org/html/2610.11355v2#S3.T2) · [Full-paper checks](https://arxiv.org/html/2610.11355v2#S3.SS3) · [Table 4](https://arxiv.org/html/2610.11355v2#S3.T4)

Tintycke's November 2026 comparison, *科研 Skill 从夯到拉（纯主观）*, supplied the cases
behind the note recheck, screening counts, figure-to-data comparison, reduced reproduction,
and citation checks. In particular, the author describes a mislabeled empty plot, a toy
task with no comparable published BLEU, and an abbreviated BERT entry flagged in error.
The local procedures use these as failure cases. [Original article](https://x.com/i/article/2123261173286215681)

The linked versions supplied the following design choices. Source inspection and local CLI tests are distinct from the article’s comparative runs.

| Article category | Local use | Upstream implementation |
|---|---|---|
| Search | Use a structured OpenAlex response and check the requested count before returning a list. | [sci-search](https://github.com/ShZhao27208/Aut_Sci_Write/blob/357766f90bd42f4f982d054be55c687c27202f22/skills/sci-search/sci_search.py) |
| Close reading | Check consequential values at their source locations and link implementation claims to the version and symbol inspected. | [DeepPaperNote](https://github.com/917Dhj/DeepPaperNote/blob/641550a8d823de638b4917aa2dac057583cb2265/skills/deeppapernote/references/final-quality-review.md) · [paper-craft](https://github.com/zsyggg/paper-craft-skills/blob/3be47a2a53cc35a411c587bca5231a08de57287a/skills/paper-analyzer/SKILL.md) |
| Writing and slides | For a wording edit, inspect the changed passages for factual drift. Route slide builds to the slides skill. | [academic-research-skills](https://github.com/Imbad0202/academic-research-skills/blob/23807f987024f2e038d12fd9e4e5d2a7cc228674/academic-paper/SKILL.md) · [academic-humanizer](https://github.com/AIScientists-Dev/academic-humanizer/blob/94b88b23703bed7df507acae7d6d5876209a0cdf/SKILL.md) · [beamer-skill](https://github.com/Noi1r/beamer-skill/blob/f3d62c07f775530eddb13d435b91a9a86e7c9049/beamer/references/create-workflow.md) · [beamer-academic](https://github.com/Faust-Donf/beamer-academic/blob/788e125b0eb2e84b01a97819b443f0bd3ceaa836/scripts/compile.sh) · [scientific-writer](https://github.com/K-Dense-AI/claude-scientific-writer/blob/9820740d252800ecf0b8fc066ffb5bf9659f4a51/.claude/skills/scientific-writing/SKILL.md) |
| Data and figures | Compute group labels, valid counts and descriptive statistics from the selected source rows. Inspect the rendered series separately. | [K-Dense EDA](https://github.com/K-Dense-AI/scientific-agent-skills/blob/ec59a29a03d5c40f73ab40878df04860bc00e876/skills/exploratory-data-analysis/scripts/tabular_profile.py) · [SciPilot](https://github.com/Haojae/scipilot-figure-skill/blob/43098ddb9e6a6d142218540c114f9ed38922fc42/scripts/profile_data.py) |
| Reproduction | Compare at the same evaluation step and on the published metric. Record a proxy in its own column. | [labrat](https://github.com/fcakyon/labrat/blob/cebd38b77fdf1e6bfbebf04f9b62791636a8b3ed/plugin/skills/compare/SKILL.md) |
| Reviews and proposals | Check retrieval against known eligible papers, tally screening decisions and report coverage shortfalls. Cross-check manuscript keys against the bibliography. | [latex-arxiv](https://github.com/appautomaton/latex-arxiv-SKILL/blob/b5b058350796bd6c9df7725a5d2e1607a9d45b2a/.codex/skills/arxiv-paper-writer/references/citation-workflow.md) · [agent-research-skills](https://github.com/lingzhi227/agent-research-skills/blob/9e6c085d65e313e475e921fdfe795ac11eb7589e/skills/literature-review/SKILL.md) |
| Manuscript review | Locate each material issue in the manuscript and evidence. Use changed numbers or references to find affected passages for re-review. | [PaperJury](https://github.com/Spark-To-Paper-Skills/paperjury/blob/53c75e86285dc5b38e8d60c6eb0b0adaf4838250/scripts/cross-ref.js) · [Meet-Reviewer-2](https://github.com/xf686/Meet-Reviewer-2/blob/551d613ac5ce070d08831d0ac76cb4aac47285d4/skills/paper-redteam/SKILL.md) |
| Reference management | Separate record identity from claim support. Verify imported fields and ordered authors against the exported records. | [bib-audit](https://github.com/yilunzhao/bib-audit/blob/aa75a9367db5f565719820d9b6ac021f517c5bd3/prompts/verify_entry.md) · [Zotero](https://github.com/dougwyu/claude-zotero-skills/blob/2e71c5790483578b105a15afffdf231f19bbc5b0/zotero-skill.md) |

## Provenance and licenses

Full MIT texts, the per-skill upstream tree SHAs, and the ARIS commit are in
[`THIRD-PARTY-LICENSES.md`](THIRD-PARTY-LICENSES.md).

| Source | License | Used for |
|---|---|---|
| [K-Dense-AI/scientific-agent-skills](https://github.com/K-Dense-AI/scientific-agent-skills) `v2.65.0`, via this repository's `skills/{research-decision,experimental-design,statistical-analysis,statistical-power,uncertainty-and-units,optics-research,paper-lookup,citation-management,scientific-writing,venue-templates}` | MIT, © K-Dense Inc. | reference files and scripts carried over with path repairs; the substantive method text |
| [wanshuiyin/Auto-claude-code-research-in-sleep](https://github.com/wanshuiyin/Auto-claude-code-research-in-sleep) (ARIS), commit `c485faa5` | MIT, © 2026 wanshuiyin | workflow structure, claim/result method, independent-review loop, writing-voice rules, writing craft |
| Orchestra Research paper-writing guidance, as redistributed in ARIS | MIT (per ARIS LICENSE) | narrative framing, abstract/introduction patterns, reviewer reading order |
| claude-scholar, Imbad0202/academic-research-skills, Research-Paper-Writing-Skills (as credited in ARIS) | MIT | citation verification and claim–evidence mapping practice |

Per-file provenance notes that were in the originals are preserved inside the copied files.

## Path repairs

- old `references/<file>.md` links → bare sibling names inside each topic directory;
- old `scripts/<file>.py` references → `scripts/{papers,citations,design,stats,units,venues}/<file>.py`;
- venue assets moved to `<skill>/assets/`, and `scripts/venues/{query_template,customize_template}.py`
  now resolve the skill root three levels up (`__file__/../../..`);
- renamed on copy to avoid collisions and stale skill names: `writing_principles.md` →
  `writing/evidence-bound-principles.md`, `imrad_structure.md` → `writing/imrad-structure.md`,
  `figures_tables.md` → `writing/figures-and-tables.md`, `citation_styles.md` →
  `writing/citation-styles.md`, `reporting_guidelines.md` → `writing/reporting-guidelines.md`,
  `authorship_ai_confidentiality.md` → `writing/authorship-and-ai-disclosure.md`,
  `research_integrity_open_science.md` → `writing/integrity-and-open-science.md`,
  `professional_report_formatting.md` → `writing/report-formatting.md`,
  `citation_checklist.md` → `citations/citation-checklist.md`,
  `REPORT_FORMATTING_GUIDE.md` → `writing/formatting-guide.md`;
- no `SKILL.md` exists below this directory; the old entry points exist only as reference
  markdown.

## Checks run

| Check | Result |
|---|---|
| `find . -name SKILL.md` | exactly one, `./SKILL.md` |
| link/path scan over `SKILL.md` and every `references/**/*.md` token that looks like a file path | all internal references, scripts, assets, and templates resolve; remaining unresolved tokens are example filenames inside copied workflows (`references.bib`, `results.json`, `clean_references.bib`, …) and script arguments that the venue helper resolves from `assets/` |
| `python3 -m py_compile scripts/**/*.py` | all 28 scripts compile |
| `python3 scripts/venues/query_template.py --list-all` / `--type grants` | 9 templates / 2 grants found under the new `assets/` path |
| `python3 scripts/units/convert_units.py --help`, `scripts/papers/arxiv_atom.py --help` | run; the dependency-free CLIs execute |
| literature / statistics / units / optics / writing / venues / review routes without the old skill commands | each old entry's content is reachable from `SKILL.md` → one hub → its topic directory; no hub requires another skill's slash command or a retired skill name |
| license notices | `THIRD-PARTY-LICENSES.md` carries both full MIT texts, the `v2.65.0` tree SHAs per former skill, and the ARIS commit `c485faa5` |
| review flow retained | `references/review-and-revision.md` keeps the scored rounds (up to 4), verdict-over-score stopping rule, reviewer memory, rebuttal with ruling, private `review/` record, and `review unavailable` handling; routed from `SKILL.md` and named in `THIRD-PARTY-LICENSES.md` |

## Gaps and follow-ups

- Deployment is outside this directory: `scripts/deploy-skills.mjs` already lists `research`
  as installed and the ten old names as retired. Removing the old source directories under
  `skills/` is a repository step not performed here.
- `docs/{default-profile,skills.zh-CN,skills-deployment}.md` still describe the old entries and
  routing lines (`statistical-analysis`, `uncertainty-and-units`, `venue-templates`) and need
  rewording after deployment.
- `docs/skills-deployment.md` verification text (`node --test scripts/deploy-skills.test.mjs`)
  was not run: it is a deployment test, not a content check of this directory.
- Script dependencies (`statsmodels`, `pingouin`, `pint`, `uncertainties`, `pyDOE3`) were not
  installed here; scripts were compiled and the dependency-free ones were executed.
