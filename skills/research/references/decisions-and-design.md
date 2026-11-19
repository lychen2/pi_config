# Decisions and experimental design

Two halves of one job: decide what to do next from the evidence you actually have, then lay
out the experiment so the resulting data can answer the question. Neither half can be
repaired later — a confounded design cannot be rescued by analysis, and a decision made from
an inherited explanation cannot be rescued by more data.

## Part A — Decide from evidence

Use this for choosing the next experiment, interpreting an unexpected result, reconsidering
a research direction, or judging a consequential claim.

For optical-system idea discovery or a novelty decision, use `optics/idea-discovery.md`.
For laser direct-write experiments, define the observable with
`optics/experimental-metrics.md` before selecting the statistical design below.

For an open-ended proposal, use FINER to narrow the question. Can the available data,
instrument time and precision resolve the proposed effect (**Feasible**)? Who needs the
answer (**Interesting**)? What does the closest prior result leave open (**Novel**)?
Which consent, access or use constraints apply (**Ethical**)? Which decision would the
answer change (**Relevant**)? Carry the binding constraint into the question and the design.

1. **State the question and the action that depends on it.** Name the unit, the outcome, the
   decision threshold, and the resource constraint that bounds the choice. A question with
   no action attached is a literature question, not a decision.
2. **Separate the evidence by origin.** Distinguish direct observation, what a paper
   reported, an interpretation inherited from project notes or a collaborator, and your own
   inference. When an inherited explanation drives the action, check the original evidence
   behind it. Keep source locations, numbers, units, and applicable conditions together.
3. **Name the alternatives.** For each plausible explanation, write the prediction that
   distinguishes it. Keep unresolved alternatives visible: "the trend could be thermal drift
   or alignment; both predict a monotonic shift, only drift predicts it in the dark" is a
   usable state; "probably thermal" is not.
4. **Choose the smallest discriminating test.** Before interpreting it, specify the predicted
   outcome under each explanation and which outcome would change the action. Prefer
   reversible, informative actions. If no test can separate the alternatives at the available
   precision, say so and act on the more conservative one.
5. **Inspect the measurement chain before costly or irreversible steps.** Controls,
   calibration, acquisition settings, transformations, units, dynamic range, and analysis
   choices. If a link cannot be checked or does not apply, record why and what it does to the
   decision.
6. **Update on new evidence, and know what would change your mind.** Ask whether
   counterevidence touches a measurement, a configuration, a mechanism, or the whole research
   question; the answer decides whether to recalibrate, re-run, or re-plan. Write the switch
   condition down: what observation makes you abandon this line.

Reusable checks on unchanged inputs can be reused; new evidence on a changed input needs a
new check.

## Part B — Design the experiment

Design decisions are the ones made before data collection.

### The three principles

- **Randomization** — assign conditions at random so confounders, known and unknown, are
  balanced in expectation. This is what licenses a causal reading of a comparison.
- **Replication** — independent repetition at the level the treatment is applied. This is
  what lets you estimate variability.
- **Blocking / local control** — group similar units (batch, day, site, litter, plate
  position) and randomize within blocks, removing that nuisance variation from the error
  term instead of letting it inflate noise.

### Pick the design from the question and the unit

```
Compare a few predefined conditions?
├─ independent units, maybe a known nuisance factor      → completely randomized, or randomized block
├─ each unit can receive every condition (washout OK)    → crossover / repeated measures (watch carry-over)
└─ only groups can be randomized (clinic, school, litter) → cluster-randomized (analyze at cluster level)

Screen many factors (5+)                                → fractional factorial, Plackett-Burman
Quantify main effects and interactions, few factors     → full 2^k factorial
Find settings that optimize a curved response           → response surface (central composite, Box-Behnken)
Explore a simulator over a continuous space             → space-filling (Latin hypercube)
Ordered evidence, early stopping is legitimate          → group-sequential / adaptive
```

Details: `design/design_types.md` (completely randomized, block, Latin square, crossover,
split-plot, cluster, nested), `design/randomization_and_blocking.md` (allocation schedules,
stratification, blinding, run-order), `design/factorial_and_doe.md` (aliasing, resolution,
screening, response surface), `design/sequential_and_adaptive.md` (alpha spending, interim
analyses).

For direct writing, typical factors are sample-plane power, speed, hatch pitch, focus,
scan direction, field position and controller settings. Block by day, resist batch or
independent alignment; distinguish repeated frames from independent runs/specimens. Use
a dose–focus design for process windows and evaluate calibration fits on separate marks
or patterns. Randomize within physically feasible blocks and retain warm-up/order effects.

### Structural mistakes that cannot be fixed afterwards

1. **Pseudoreplication.** Repeated measurements of one unit are not independent replicates:
   3 animals with 100 cells each is n = 3 for any treatment applied to the animal. Replicate
   and randomize at the level the treatment is assigned; respect the nesting in the model.
2. **Confounding with a nuisance variable.** All treatment samples on Monday and all controls
   on Tuesday confounds treatment with day. Randomize across, or block on, every nuisance
   factor you can name.
3. **Broken randomization.** Convenience assignment lets confounders in. Use a seeded
   schedule and follow it; record the seed.
4. **No concurrent control.** Without a control — and a vehicle/sham and blinding where
   relevant — time, handling, and placebo effects are not separable from treatment.
5. **Batch effects read as biology.** Process samples across batches in a randomized or
   blocked order; never let batch align with condition.
6. **Edge and position effects.** Evaporation and thermal gradients make plate edges differ;
   randomize positions instead of putting all controls in column 1.
7. **Ignored aliasing.** A low-resolution fraction confounds main effects with interactions.
   Know the alias structure before concluding that a factor has no effect.
8. **Optimizing without curvature.** A two-level factorial cannot see an interior optimum.

### Generate a reproducible layout

```bash
python3 scripts/design/randomization.py --help
python3 scripts/design/doe_designs.py --help
```

`scripts/design/randomization.py` produces seeded allocation schedules (simple, permuted-block, stratified,
cluster); `scripts/design/doe_designs.py` wraps pyDOE3 to return factorial, fractional, Plackett-Burman,
central-composite, Box-Behnken, and Latin-hypercube designs in real factor units with
randomized run order. Archive the seed and the schedule: a design you cannot regenerate is
not reproducible.

Factor counts, levels, and whether the response can curve are properties of the question,
not of the script — choose them first.

### Before running

- the independent unit is named and the replicate level matches it;
- nuisance factors are listed, and each is blocked, stratified, or randomized across;
- a concurrent control exists, and the comparison is defined before the run;
- blindness is decided (who analyzes what, in which order);
- the analysis model matches the design: blocks, strata, clusters, and nesting appear in it;
- n comes from `statistics.md` for this design, not from what fits the schedule;
- the run order and positions are recorded, along with the seed.

Reports for human-subject, animal, or clinical designs also follow the applicable reporting
guideline; the routing list is in `writing/reporting-guidelines.md`.
