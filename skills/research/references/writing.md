# Writing and revision

## Editing existing prose

**Wording or translation.** Edit once for clarity and flow. Preserve what the author asserts,
attributes to others, or offers as an explanation, including negation, comparison, scope and
degree of certainty. Base clarifications on the source passage. Keep conditions, null results
and uncertainty that affect the meaning.
Inspect the diff for changes to numbers, units, equations and citations. Reread the changed
verbs and qualifiers against the original. Return clean prose. Flag a material factual conflict
separately if you encounter one. A submission venue sets style requirements for this edit.

**Checking a claim.** When asked to verify scientific accuracy or address a review concern,
locate the relevant method, result, table, figure or supplement. Keep a supported claim direct.
If the evidence contradicts a comparison or supports only part of an explanation, correct that
part and preserve the observed result. Identify the decisive source location in the edit note.
If the excerpt omits decisive evidence, consult the relevant section or supplement. If the claim
remains unresolved, keep its wording and give one brief note outside the manuscript naming the
measurement or comparison needed to decide that claim.

## Drafting a paper

Related: `experiments-and-claims.md` (the claim map you write from),
`writing/imrad-structure.md` (section contents), `writing/figures-and-tables.md` (displays),
`venues.md` (format and venue norms), `citations.md` (bibliography),
`writing/evidence-bound-principles.md` (accuracy before fluency), and
`review-and-revision.md` for what happens once an independent reader sees the draft.

For optical systems, read `../CLAUDE.md` and set `TARGET_VENUE` using `venues.md`.
Default body: **Theory → Design/Simulation → Experimental Setup → Results**; surround it
with Introduction, Discussion and Conclusion. Preserve this evidence order in a Letter
even when headings are combined. A simulation-only paper describes numerical validation
rather than inventing experimental measurements. Other study types retain their appropriate
structure in `writing/imrad-structure.md`.

## The narrative principle

By the end of the Introduction the reader should know:

- **What** — the one to three specific claims the paper makes;
- **Why** — the evidence that supports them;
- **So what** — why anyone should care.

A strong paper sells **one thing** that was previously absent or non-obvious, and every
section serves that thing. Experiments, related work, and discussion support the main claim;
they are not independent mini-papers. If a section starts a second story, it belongs in
another paper.

**One-sentence contribution test.** If you cannot write one of these, the framing has not
converged:

- "We prove that X converges under assumption Y."
- "We show that method A improves B by 15% on benchmark C."
- "We identify failure mode D and propose mechanism E that removes it."
- "We measure Z at 1.3× the previous precision, which resolves the discrepancy between A and B."

Failing this test usually means the contribution is vague, the evidence is not coupled to the
claim, or the paper does not yet know what story it is telling.

## Where the effort goes

Spend roughly equal time on (1) the abstract, (2) the introduction, (3) the figures, and
(4) everything else combined. Reviewers typically read title → abstract → introduction →
Figure 1 → the rest, and form a provisional judgment before the methods. Put disproportionate
care into the front matter and the hero figure; do not bury the contribution after Section 3.

## Abstract

Five parts, in order:

1. what you achieved;
2. why the problem matters and is hard;
3. how you approached it;
4. what evidence supports the claim;
5. the number, result, or guarantee the reader should remember.

150–250 words unless the venue says otherwise. At least one explicit quantitative result. No
citations, no undefined acronyms, understandable without the paper. Delete any opening that
would fit almost any paper in the field ("Recent years have seen remarkable progress in…") —
it carries too little information to help a reviewer judge this one.

## Introduction

1. **Hook** — the problem, and why it matters now.
2. **Gap** — what prior work tried and why it is insufficient.
3. **Insight and approach** — what this paper does differently, in one or two sentences.
4. **Contributions** — 2–4 items, specific and falsifiable, one or two lines each.
5. **Results preview** — the strongest result, early.
6. **Roadmap** — one or two sentences, optional.

Make the approach clear early; allocate length from the actual article type rather than a fixed page count.

Contributions that work name a falsifiable mechanism, system change or measured tradeoff:
"We reduce field-dependent spot variation at fixed NA and field" or "We reduce overlay
error under matched travel, speed and metrology conditions", with actual numbers only when
supported. "We perform extensive experiments" is not a contribution.

Organize related work by physical mechanism, optical/control architecture or measurement
question, not paper by paper. In optics articles it can be integrated into the Introduction;
a separate section is useful only when the argument and venue need it. Do not impose a
one-page literature section on a Letter.

## Sections

Contents, order, and what each must contain: `writing/imrad-structure.md`. Order results by
argument, not by lab notebook: the sequence that builds the case, with controls and ablations
next to the claim they test.

## Sentence-level clarity

Readers have structural expectations; violating them makes them decode instead of understand.

1. **Keep subject and verb close.** “The objective, which we optimized at several field points
   under manufacturing constraints, reduces aberration” → “The objective reduces aberration.
   We optimized it at several field points under manufacturing constraints.”
2. **Put the important information near the end.** “Overlay error was lower with synchronized
   triggering” → “With synchronized triggering, overlay error was lower.”
3. **Put context at the start.** "We introduce a pupil relay to stabilize the scan spot" →
   "To stabilize the scan spot, we introduce a pupil relay."
4. **Move from old to new.** Start with what the reader already has, end with the new point.
5. **One unit, one function.** A paragraph does one job; a sentence carrying two layers of
   logic becomes two sentences.
6. **Put actions in verbs.** "We performed an analysis of the results" → "We analyzed the
   results."
7. **Set the stage before new material.** Before an equation, theorem, or result, say why it
   matters.

Then: replace an ambiguous `this`/`it`/`these` with the noun; delete low-information fillers
(*actually, very, really, quite, basically, essentially, importantly, notably, it is worth
noting that*); do not bury the key sentence mid-paragraph.

**Word choice.** Prefer the specific: not "performance" but RMS WFE, MTF at a stated spatial
frequency, overlay error, or accepted area per unit time; give units and conditions with
the number. Keep spot width, printed linewidth, accuracy and repeatability distinct.
Prefer *develop, propose, introduce, characterize* where true; terminology should describe
the actual physical contribution rather than imply novelty by renaming a component.

## Mathematical writing

The goal is for the reader to follow the argument, not to sound sophisticated. State
assumptions formally before the theorem; pair statements with intuition; define symbols at
first use; keep one meaning per symbol across sections.

```latex
$x$, $\alpha$                    % scalars: lowercase italic
$\mathbf{x}$                     % vectors: lowercase bold
$\mathbf{W}$                     % matrices: uppercase bold
$\mathcal{X}$                    % sets: uppercase calligraphic
$\mathrm{MTF}$                   % named optical quantities: roman
```

Common failures: equations with no statement of why they matter; assumptions introduced after
they are used; the same symbol reused with a different meaning; all intuition moved to the
appendix, leaving bare statements in the main text.

## Figures

Figure 1 is often the first artifact a reviewer studies. It should explain the method idea,
show the comparison that justifies the paper, or summarize the main claim visually.

- Captions are self-contained: what is compared, what to notice.
- No decorative title inside the figure; the caption carries it.
- Vector output (PDF/EPS) for plots.
- Colorblind-safe palettes, no red-green pairing, readable in grayscale, and line style or
  marker in addition to color.
- Error bars and uncertainty defined in the caption, not left implicit.
- Provenance: every display traces to source data, code, or a licensed source; units,
  denominators, sample size, and analysis population appear where they matter.

Plotting itself is the `scientific-visualization` skill. Requirement detail:
`writing/figures-and-tables.md`.

For optical-system papers, plan the path/system schematic first, then spot/PSF/MTF or
wavefront evidence, beam/mode maps and spectra where relevant, followed by metrology,
stability and dose/process results. Training/optimization curves are secondary unless the
optimizer itself is the claim. See the optical figure plan in `writing/figures-and-tables.md`.

## Claim calibration and voice

Organize the draft around its strongest supported finding. Choose comparisons that answer the
research question. State the result, comparator and conditions that give it meaning. Present a
proposed mechanism as the authors' interpretation unless the design establishes the cause.
Retain ties, reversals and unfavorable results. Explain a tradeoff when the evidence connects
the benefit to its cost. Each experiment should answer a question the paper raises.

For a claim of statistical significance, locate the baseline and inferential analysis. With
descriptive data, report the measured difference, units and conditions. Apply a supported
correction in both language versions of a bilingual draft.

Qualify a finding only when the evidence identifies a condition or uncertainty that changes
its interpretation. State it alongside the finding. Discuss a limitation shared
by several findings once, or in the section the venue requires. Keep editorial queries and
revision history outside the manuscript.

## Revision passes

For a full draft, use the passes that address a problem in the text. A reader should be able
to restate the main finding and the condition that matters to it after one reading.

**1. Clutter.** Strip to the cleanest components.

| Cluttered | Replace with |
|---|---|
| Due to the fact that | Because |
| In order to | To |
| A number of | Several |
| It is worth noting that / It is important to note that | (delete) |
| At the present time | Now |
| On the basis of | Based on |
| In light of the fact that | Because |
| Have an effect on | Affect |
| Give rise to | Cause |

Remove redundancies ("completely eliminate" → "eliminate") and AI-isms (delve, pivotal,
landscape, tapestry, underscore, intriguingly).

**2. Verbs and voice.** Find the actor and make them the subject: "We made an investigation"
→ "We investigated"; "Failure of the system occurs" → "The system fails"; "Provides a
description of" → "Describes". Passive is right for established facts and for methods where
the agent is irrelevant.

**3. Sentence architecture.** Split sentences over ~40 words; keep subject and verb close;
familiar first, new last; one job per paragraph; do not start consecutive sentences with the
same "This" or "We"; every paragraph's first sentence should connect to the previous one. If
every paragraph runs problem → method → benefit → summary, break the mold.

**4. Terminology consistency.** Do not call a banana an "elongated yellow fruit". If Methods
says "obese group", Results does not switch to "heavier group": synonym variation makes the
reader wonder whether a different category appeared. Extract the key terms (group names,
variables, technique names, abbreviations) and force them to match across Results, Discussion,
tables, and captions. Define each acronym at first use; delete acronyms created only for
convenience.

**5. Numbers and citations.** Sample size in the abstract matches Table 1; percentages match
raw counts; significant figures are consistent and appropriate; figure graphics match table
values; every statistic traces to a primary source, not a review that quotes it.

## Reverse-outline test

Extract the first sentence of every paragraph and read them in sequence. They should form a
coherent argument on their own. Then check: every claim in the claim map appears; every
experiment or figure supports a stated claim; a skim reader recovers the main claim from
title, abstract, introduction, and Figure 1 plus captions. Rewrite any paragraph whose topic
sentence does not advance the story.

## Before it goes out

- [ ] one-sentence contribution exists and appears in title, abstract, and introduction;
- [ ] abstract is self-contained, has a number, and starts from this paper's contribution;
- [ ] introduction makes What / Why / So What explicit; 2–4 falsifiable contributions;
- [ ] related work is substantive and organized by family, not by paper;
- [ ] every claim traces to evidence in the claim map; partial claims are not rounded up;
- [ ] unfavorable results are present in the tables and explained or stated neutrally;
- [ ] terminology, notation, units, and abbreviations consistent throughout;
- [ ] every figure and table has a self-contained caption and its provenance;
- [ ] citations verified, bibliography contains only cited works, style matches the venue;
- [ ] page budget met under this venue's rule (see `venues.md`);
- [ ] no placeholders, no revision history, no instructions left in the prose;
- [ ] claim-defining conditions accompany the finding, and the venue's required disclosures are present.

## The paper plan

Freeze the outline before drafting, adapted from ARIS `paper-plan`. One page, in the project's
working directory:

```markdown
# Paper Plan

**Title**: [working title]
**One-sentence contribution**: [...]
**TARGET_VENUE**: [journal from venues.md]  **Article type**: [Article / Letter / Review]
**Length budget**: [current venue rule and its counting scope]
**Section count**: [N]

## Claims-Evidence Matrix
| Claim | Evidence | Status | Section |
|-------|----------|--------|---------|
| ...   | exp A, metric B | supported / partial / needs experiment | §3.2 |

## Section plan
### §0 Abstract
- What we achieve: ...   Why it matters / is hard: ...   How: ...
- Evidence: ...   Most remarkable result: ...   Length: [venue/article-type limit]

### §1 Introduction
- Hook: ...   Gap: ...   One-sentence contribution: ...
- Approach overview: ...   Contributions (2-4, falsifiable): ...
- Results preview: ...   Hero figure: [what it shows, which comparison]
- Closest optical/system prior art and the remaining difference: ...

### §2 Theory
- Governing model, coordinates, conventions, assumptions and analytic limits: ...

### §3 Design/Simulation
- Prescription/architecture, constraints, baseline, solver and convergence: ...
- Field/wavelength/tolerance coverage and predicted observables: ...

### §4 Experimental Setup
- Optical path and hardware, metrology/calibration, motion/timing, process recipe: ...
- Independent repeats, measurement definitions, uncertainty and raw-data paths: ...

### §5 Results
- Primary matched-condition result and uncertainty: ...
- Mechanism isolation, field/process robustness and simulation–measurement agreement: ...

### §6 Discussion
- Physical explanation, tradeoffs, scope and actual limitations: ...

### §7 Conclusion
- Supported contribution and its measured consequence: ...

## Figure Plan
| ID | Type | What it shows | Data source | Priority |

## Citation Plan
- §1: [motivation and nearest prior art]   §2: [physical model]   §3–4: [methods and calibration]

## Next Steps
- [ ] run the missing blocks   - [ ] figures   - [ ] draft   - [ ] compile
```

Combine headings to fit the article type and its length budget; the optics evidence order
remains. Every claims-evidence row is a section's obligation; a row marked *needs experiment*
is a reason to obtain evidence or narrow the claim, not to write around it.

## Drafting order

Draft the evidence-bearing body and figures first: theory, design/simulation, setup, results,
discussion. Then write the introduction and conclusion; write the abstract from the finished
body and refine the title. Apply the revision passes to the whole draft. Separate section
files are useful during writing; for Optica Publishing Group submission, assemble one
`.tex` file as required by the current author instructions in `venues.md`.
