# Manuscript Structure and Consistency

For optical-system and laser direct-write research, use Introduction → Theory →
Design/Simulation → Experimental Setup → Results → Discussion → Conclusion, with the
contents below. Letters may combine headings while retaining the evidence sequence.
Simulation-only studies describe numerical validation without fabricated experiments.
For other domains IMRAD remains useful; study design, article type and current journal
instructions control the final structure.

## Title and abstract

The title should identify the work accurately without adding novelty, causality, design,
or population claims that the manuscript does not support.

Draft the abstract after the main text. Mirror, do not reinterpret:

- objective or question;
- design, setting, population or material, and key methods;
- analysis population and prespecified primary result;
- estimate, uncertainty, denominator, and harms where relevant;
- conclusion limited to the reported evidence.

Structured versus unstructured format is a venue decision. Do not apply a universal
format. Any number in the abstract must match the same concept and analysis set in the
main text and across displays.

## Introduction

Build a short evidence chain:

1. verified context;
2. what is known and uncertain;
3. the specific gap;
4. the objective, question, or prespecified hypothesis.

Do not claim that no prior work exists unless a suitable search verifies that claim.
Avoid previewing unsupported results or inflating significance.

## Optical-system methods sequence

- **Theory:** governing equations, coordinate/plane conventions, wavelength/index,
  field/intensity and width definitions, approximations and a relevant known limit.
- **Design/Simulation:** optical prescription and beam/scan/control architecture, component
  and manufacturing bounds, conventional baseline, material data, field/pupil sampling,
  solver/gradient validation, tolerances and predicted observables.
- **Experimental Setup:** optical path and hardware, alignment and calibration sequence,
  independent metrology, motion/power synchronization, sample-plane dose, resist/material
  process, environment, repeats and uncertainty. Retain the actual recipe and data paths.

Use `../optics/experimental-metrics.md` for metric definitions; the general methods guidance
below applies to the relevant design rather than requiring a separate generic Methods title.

## Methods

Methods should permit evaluation and, where feasible, reproduction. Cover the elements
applicable to the design:

- design, setting, dates, and protocol or registration;
- participants, specimens, datasets, or source population;
- eligibility, selection, sampling, exclusions, and analysis populations;
- interventions, exposures, comparators, materials, instruments, and versions;
- outcomes, predictors, thresholds, time points, and measurement methods;
- bias controls, randomization, allocation, and masking where applicable;
- sample-size rationale;
- missing data, transformations, covariates, multiplicity, sensitivity analyses, and
  statistical or computational methods;
- confirmatory, exploratory, and descriptive status;
- ethics, consent, privacy, data governance, and approvals only when verified;
- data, code, materials, and protocol access conditions.

Record deviations and timing. Never reconstruct a method from a result merely to make
the paper appear consistent.

## Results

Follow the declared objectives and outcomes. Report:

- participant, sample, or record flow;
- exclusions, missingness, attrition, and analysis populations;
- descriptive information needed for interpretation;
- prespecified primary and secondary results;
- estimates with units, denominators, sample sizes, and uncertainty;
- exploratory, sensitivity, subgroup, negative, null, adverse, unexpected, and
  inconclusive findings with correct labels;
- protocol or analysis deviations that affect interpretation.

Describe results before interpretation unless the venue combines Results and
Discussion. Do not equate a threshold crossing with scientific or practical importance.

## Discussion

Start from the verified findings, then:

- answer the objective at the supported level of certainty;
- compare with verified prior evidence;
- consider alternative explanations;
- distinguish statistical, scientific, clinical, and practical interpretation;
- explain limitations and likely consequences;
- bound generalizability to the studied population, material, setting, and period;
- identify implications without prescribing action beyond the evidence.

Do not introduce new results, methods, approvals, or citations that bypass verification.

## Declarations and end matter

Treat each statement as data, not boilerplate:

- author contributions and accountability;
- acknowledgments and permissions;
- funding and the funder's role;
- competing interests;
- ethics, consent, and registration;
- data, code, materials, and protocol availability;
- AI-use disclosure;
- references, figure legends, tables, and supplements.

Use verified or explicit not-applicable states. Never generate an approval identifier,
grant number, registration, author role, conflict declaration, or availability promise.

## Cross-section audit

Before submission, compare:

- objective ↔ outcome ↔ result ↔ conclusion;
- methods ↔ results;
- abstract ↔ main text ↔ tables ↔ figures ↔ supplement;
- units, denominators, sample sizes, labels, and time points;
- registration and protocol ↔ manuscript;
- in-text citations ↔ sources you opened ↔ reference list.

Read the list against the manuscript; a numeric mismatch is either an error or an unstated analysis-set difference, and either way it has to be named.
