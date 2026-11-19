# Experiments and claims: plan the evidence, then read the result

The failure this prevents: a pile of runs that cannot support the sentence the paper needs,
and a result table that gets read as whatever the author hoped. Plan evidence backwards from
the claim, then judge the finished runs against the same claim you planned.

Use this after the research question is settled and before writing. For the statistical
machinery (design, n, tests), see `decisions-and-design.md` and `statistics.md`.

For laser direct-write and optical-system work, load `optics/experimental-metrics.md`.
Use its definitions and block template for optical performance, positioning, exposure
and process outcomes. Idea/novelty decisions use `optics/idea-discovery.md` before this stage.

## 1. Freeze the claims first

Write these down before designing runs:

- **Primary claim** — the mechanism-level contribution, one sentence.
- **Supporting claim** — optional, only if it directly strengthens the same story.
- **Anti-claim to rule out** — the explanation that would make the result boring or wrong:
  "the smaller spot comes only from higher NA", "the gain is extra delivered power",
  "the overlay improvement is a calibration-fit artifact", "the apparent stability comes
  from filtering", "the simulation reproduces the analytic curve for the wrong reason".
- **Minimum convincing evidence** — what a skeptical reader needs to see to accept each
  claim, in terms of a comparison and a number, not a vibe.

Two claims is usually enough. Three or more means the story is not converged.

## 2. Turn claims into blocks

Default block roles; delete what the paper does not need:

1. **Anchor result** — does the method/measurement address the actual bottleneck, against
   the strongest current baseline?
2. **Necessity isolation** — does the dominant contribution itself matter? Remove or replace
   the key component and show the effect collapses; if it does not, the claim is wrong.
3. **Simplicity / elegance check** — compare against an overbuilt variant, or against the
   tempting extra component you deliberately rejected. Cheaper and equal is a result.
4. **Regime check** — the condition the paper promises to serve (scale, noise level, NA,
   bandwidth, sample type). A result outside that regime does not support the claim.
5. **Failure analysis or qualitative diagnosis** — what still breaks, and why. This is where
   an honest paper buys trust and where the next project comes from.

Each block goes in the **main paper** (it defends a claim), the **appendix** (useful, not
load-bearing), or the **cut** list (interesting, not worth the budget). Cut early: an
experiment that would not change a reader's belief does not belong in the paper.

## 3. Specify every block

For each kept block, write:

- claim tested, and why the block exists;
- sample / field position / trajectory / process / configuration, including the level at
  which replication happens;
- compared systems: strongest available baselines, ablations, variants — a short credible
  set beats a padded one;
- metrics: the decisive metric first, secondary metrics second; define the direction that
  counts as better;
- setup details: optical prescription, instrument calibration, motion/timing, dose/process,
  fixed and varied parameters, independent repeat count and simulation seed when relevant;
- success criterion: what outcome counts as convincing;
- failure interpretation: what a negative result would mean, decided in advance;
- target: which table, figure, or section this feeds.

A success criterion written after seeing the number is not a criterion.

## 4. Order the runs

| Milestone | Purpose | Gate |
|---|---|---|
| M0 sanity | analytic/reference case, metric correctness, calibration, units, coordinates and power/dose balance | observable agrees with its reference within the predefined tolerance |
| M1 baseline | reproduce the strongest baseline you will be compared against | within the noise of the reported value, or you understand the gap |
| M2 main | final method on the primary setting | beats or matches the baseline under the frozen criterion |
| M3 decision | ablations for necessity, simplicity, regime | the claim survives, or it gets narrowed now |
| M4 polish | robustness, qualitative figures, appendix extras | nothing here can change the main claim |

Estimate cost and turnaround per milestone; mark each run MUST or NICE-TO-HAVE. Appendix
ideas do not get to delay the core evidence. Track runs in one compact table (ID, milestone,
purpose, variant, conditions, metric, priority, status, one-line outcome).

Separate the **must-run** sequence from the **nice-to-have** list before starting, because
a budget cut always arrives at the worst moment.

### Reproduce a published result

1. Choose a specific table cell, figure series or equation. Record its source locator,
   reference value, dataset or physical conditions, metric definition and acceptance tolerance.
   Use the authors' code and data at an identifiable version when available.
   Mark undocumented inputs as assumptions before the run and keep them fixed for the comparison.
2. Run the smallest case that exercises the method **and its evaluation**. When the claim
   concerns prediction or generalization, evaluate on held-out inputs and record their count.
   For an instrument or numerical method, use an independent measurement or reference case.
3. Record deviations beside the result. Give the published setting, the one actually used,
   why it changed, and which comparison it affects. Keep compatibility patches small enough
   to distinguish dependency changes from changes to the method.
4. Compare the same metric on the same population at the same evaluation step or physical
   operating point. Use saved measurements for both sides and report the two values and
   their difference. If the baseline lacks that point, identify the missing measurement.
   A proxy gets its own result: sequence exact-match on a toy task leaves translation BLEU
   on the published test set unverified.

## 5. Read the result against the claim

When the runs finish, answer these in order, in writing:

- **What the data shows** — the comparison, the size of the effect, the uncertainty, and
  the conditions it holds under.
- **What it does not show** — the range, regime, baseline, or metric the claim also needs
  but the runs do not cover.
- **Which claim survives** — supported / partially supported / not supported, with the
  revision you are adopting (strengthened, narrowed, reframed, dropped).
- **Missing evidence** — the specific comparison that would settle it, not "more
  experiments".
- **Next action** — one of: confirm and write; run the one decisive supplementary block;
  narrow the claim and write; pivot.

Rules that keep this honest:

- A single positive result on one dataset, sample, or configuration does not support a
  general claim. Say what population and regime the evidence covers.
- Round partial down, not up. "Partially supported" that becomes "supported" in the
  abstract is the most common integrity failure in a paper.
- A result you cannot explain is a result, not a bug to be re-run away. Record the
  postmortem: what was tested, what failed, hypotheses, and the constraints for the next
  attempt.
- Reuse a verdict while its inputs are unchanged; re-judge when the runs change, not on a
  schedule.
- Unfavorable numbers stay in the tables. Narrow the claim or state the tradeoff; do not
  delete the row.

## 6. Hand the claim forward

The output of this stage is a claim map with evidence attached: claim, block, metric,
number, conditions, and confidence. That map is exactly what `writing.md` and
`writing/imrad-structure.md` need — with Theory → Design/Simulation → Experimental Setup →
Results for optical systems. Every contribution, abstract number and result traces to a row.

If a row is empty, the sentence does not get written.

## Templates

The plan itself, adapted from ARIS `experiment-plan` — keep it in the project's working
directory (for example `refine-logs/EXPERIMENT_PLAN.md`):

```markdown
# Experiment Plan

**Problem**: [the anchored problem]
**Method Thesis**: [one sentence]
**Date**: [today]

## Claim Map
| Claim | Why It Matters | Minimum Convincing Evidence | Linked Blocks |
|-------|-----------------|-----------------------------|---------------|
| C1    | ...             | ...                         | B1, B2        |

## Paper Storyline
- Main paper must prove:
- Appendix can support:
- Experiments intentionally cut:

## Experiment Blocks

### Block 1: [Name]
- Claim tested:
- Why this block exists:
- Sample / field / trajectory / process conditions:
- Compared systems and isolated change:
- Metrics (formula, unit, plane/frame, threshold):
- Optical, motion/timing, process and calibration settings:
- Independent repeats, technical repeats and blocking:
- Uncertainty and coverage; raw-data and analysis paths:
- Success criterion:
- Failure interpretation:
- Table / figure target:
- Priority: MUST-RUN / NICE-TO-HAVE

## Run Order and Milestones
| Milestone | Goal | Runs | Decision Gate | Cost | Risk |
|-----------|------|------|---------------|------|------|
| M0        | ...  | ...  | ...           | ...  | ...  |

## Instrument, Compute and Sample Budget
- Estimated instrument and compute hours:
- Sample preparation and calibration needs:
- Alignment, acquisition and process steps requiring an operator:
- Biggest bottleneck:

## Risks and Mitigations
- [Risk]:
- [Mitigation]:

## Final Checklist
- [ ] Main paper tables are covered
- [ ] Novelty is isolated
- [ ] Simplicity is defended
- [ ] The central new component is justified or explicitly not claimed
- [ ] Nice-to-have runs are separated from must-run runs
```

Execution tracker, one row per run:

```markdown
# Experiment Tracker

| Run ID | Milestone | Purpose | System / Variant | Conditions / Batch | Metrics | Priority | Status | Notes |
|--------|-----------|---------|------------------|--------------------|---------|----------|--------|-------|
| R001   | M0        | reference | ...            | ...                | ...     | MUST     | planned | ...   |
```

The verdict, adapted from ARIS `result-to-claim`, is a written judgement with these fields —
fill them all, in this order:

```markdown
- claim_supported: yes | partial | no
- what_results_support: ...
- what_results_dont_support: ...
- missing_evidence: ...
- suggested_claim_revision: ...
- next_experiments_needed: ...
- confidence: high | medium | low
```

Then route on it:

| Verdict | Next action |
|---|---|
| `no` | Record the postmortem — what was tested, what failed, hypotheses, and the constraints for the next attempt — then decide: alternative route within the same claim, or pivot. |
| `partial` | Update the claim to what *is* supported, record the gap, design and run the supplementary block that closes it, then re-judge. Repeated `partial` on the same claim means the claim's scope is wrong, not that more runs are needed. |
| `yes` | Record the confirmed claim with its conditions. If ablations are still incomplete, run them; when the evidence is in, write. |

A low-confidence verdict is inconclusive: add the experiment rather than committing to the
claim. Record the verdict and its reasoning in the project notes either way, because the next
session will otherwise re-litigate it.

Present the plan back in a short form when handing it over:

```text
Experiment plan ready.

Must-run blocks:  [B1, B2]
Highest-risk assumption: [risk]
First three runs: 1. ... 2. ... 3. ...
Plan: <path>   Tracker: <path>
```
