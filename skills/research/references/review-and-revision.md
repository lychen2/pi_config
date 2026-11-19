# Independent review and revision

For an ordinary manuscript review, inspect the draft once and return the material findings
with their locations and smallest adequate fixes. An independent review needs a reader who
did not draft the work and can open the manuscript, data, figures, code and supplement.
Give that reader the submission constraints and the original files. Report any missing access.

## What to check

Use the existing build or analysis output for mechanical questions. For citation keys, run
`python3 scripts/citations/validate_citations.py references.bib --manuscript paper.tex`.
Recompute a disputed number from the source data before judging the claim.

For each material concern, quote the claim at a specific location, identify the relevant
baseline or competing explanation, and cite the evidence that supports the finding.
Check the supplement before calling evidence missing. Drop objections the artifacts answer.
Distinguish a required correction from a proposed experiment outside the claim's scope.
Use the venue's verdict or score when the review form calls for it. Author sign-off stays
with the author.

### Optical-system reviewer prompt

For optics or laser direct-write artifacts, include the relevant checks in the review brief.

```text
Review the optical-system / laser direct-write work from the actual artifact paths.
Read the domain rules in CLAUDE.md and the applicable metric definitions in
references/optics/experimental-metrics.md supplied with the research skill.

Prioritize physical correctness: governing model and approximation regime, optical
prescription and reference planes, propagation/coordinate/phasor conventions, wavelength
and refractive index, NA, field versus irradiance, beam-width definitions, power balance,
sampling/convergence, and the causal link between design, observable and claim.

Check unit consistency across equations, code, tables and figures, especially µm/mm/m,
cycles/mm versus angular spatial frequency, power/irradiance/radiant exposure, J/m² versus
mJ/cm², amplitude/power dB ratios, and optical versus control bandwidth.

Assess experimental reproducibility: alignment/calibration sequence, independent
metrology and uncertainty, stage/scanner/power synchronization, position at exposure,
sample-plane dose, material/resist and bake/development recipe, environment/warm-up/drift,
independent repeats, raw-data/processing availability and matched baseline conditions.
Distinguish command resolution from accuracy, in-loop residual from out-of-loop accuracy,
optical spot from printed CD, and simulation/optimization loss from hardware evidence.

Judge novelty by physical insight, structural/system innovation, a measured performance
or tradeoff advance, and feasibility. Do not require new physics for a system contribution,
or FDTD when ray/beam/diffraction models resolve the observable. Prefer optical-path,
beam/PSF/MTF/spectrum, metrology and process evidence to irrelevant training curves.

Return material findings with exact locators, the smallest adequate fixes, and the
observations that support the conclusion. Identify missing evidence and its consequence.
```

Give the reviewer the resolved paths to both domain references and to the research artifacts.

## Iterative review

Use this when the user requests review and revision across rounds or invokes an ARIS review
stage. Keep the findings, decisions and unresolved questions together in the existing review
record. A single review can return its findings in the response.

- `research-refine` allows up to five rounds. Stop at score ≥9, READY and no unresolved
  drift or blocking issue. Check fidelity to the question, specificity and feasibility.
- `auto-review-loop` allows up to four rounds. Stop when the reviewer reports no material
  findings, score ≥6 and a `ready` or `almost` verdict. A `not ready` verdict keeps it open.
- `paper-writing` uses two review, fix and recompile rounds when that workflow is requested.

Give the reviewer the full artifact and the prior findings. After a fix, direct attention to
the affected evidence. Check a changed number or citation wherever it is repeated. Rebuild
after edits that affect the compiled document. Reopen scientific review when a finding
remains unresolved or a change alters a claim, result, baseline or interpretation.

The reviewer issues the verdict. If a requested review could not run, identify what remains
unreviewed. At the round limit, report the outstanding findings and their consequences.

## Revising

- Fix the cause, not the symptom. If the reviewer says the ablation is thin, run the ablation or
  narrow the claim; a sentence that pre-empts the objection is not a fix.
- A finding you disagree with gets a checked answer with a locator, not silence. Sometimes the
  reviewer is wrong and the evidence says so.
- Apply `writing.md`'s calibration rules to the reply: name the real problem in one sentence,
  state what changed and where.
- Keep the review record out of the manuscript while you do this. The delivered text states the
  science; the review is how it got there.

## Response letters and rebuttals

For a formal review, answer each point in order:

1. the comment, restated in one line so the mapping is unambiguous;
2. what you did, with the section, table, or page where it now lives;
3. if you did not do it, why the evidence or scope does not support it, and what you changed
   instead.

Grouping several comments under one answer is fine when they are one issue; skipping a comment
is not. Keep new claims out of the response: a rebuttal that introduces evidence not in the
paper invites a second round of the same problem.

If a requested change would fabricate data, hide an unfavorable result, or overstate the
claim, decline it and offer the honest alternative — narrowing the claim, reporting the
negative result, or moving the material to limitations.
