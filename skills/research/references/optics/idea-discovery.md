# Optical-system idea discovery and novelty check

This is the `idea-discovery` / `novelty-check` route inside the consolidated research skill.
Use the laser direct-write domain rules in `../../CLAUDE.md` and the source-verification
practice in `literature.md`. Evaluate the optical/mechatronic contribution, not ML benchmark
accuracy, parameter count, training speed, or optimizer branding.

## Discover from an instrument bottleneck

Start with the existing system, its requirements and evidence: wavelength, NA/working
 distance, scan field, dose range, feature/process target, positioning/overlay requirement,
throughput, stability interval and available metrology. Ask for a missing value only when it
changes which idea is viable. A symbolic feasibility estimate can precede a fixed number.

Generate a small set of distinct hypotheses tied to the bottleneck. Useful directions include:

- pupil relay or objective/scan architecture that reduces field-dependent aberration,
  telecentricity error, clipping, or spot variation;
- beam shaping that improves usable dose uniformity at comparable delivered power;
- synchronized stage/galvo/power control that reduces position-at-exposure or seam error;
- interferometric calibration or environmental compensation that improves out-of-loop
  placement stability over a specified range and duration;
- a calibrated dose/path strategy that widens the process window at fixed feature fidelity;
- a system architecture that improves the resolution–field–throughput–stability tradeoff.

Each candidate needs a causal prediction and a discriminating experiment. A package change,
a new optimizer name, or a smaller training loss is a method choice, not the contribution.

## Evaluate four dimensions

Use these dimensions as an evidence-based judgement, not a weighted score or pass count.
A system paper can make its contribution in one dimension; it need not invent new physics.

| Dimension | Question | Evidence that would support it |
|---|---|---|
| Physical novelty / 物理新意 | What mechanism, coupling, regime or physical insight was not established in the nearest work? | Governing model and a measurable prediction that separates the proposed explanation from alternatives |
| Structural innovation / 结构创新 | What changes in the optical path, pupil/scan arrangement, metrology reference, feedback/dose coupling or system architecture, and why is the change necessary? | Matched conventional layout/control baseline, component substitution or controlled isolation, tolerance and calibration implications |
| Performance breakthrough / 性能突破 | Which physical capability or tradeoff improves under matched conditions, and is the gain larger than uncertainty and engineering tolerances? | Spot/MTF, field, throughput at stated quality/yield, overlay, stability or process-window comparison with units, uncertainty and cost/tradeoff |
| Feasibility / 可实现性 | Can the design be built, aligned, calibrated and operated with available components, stage/controller timing, metrology and process constraints? | Prescription/BOM or realistic component ranges, tolerance budget, power/dose budget, bandwidth/latency estimate and a minimal validation plan |

For each dimension state the actual contribution or lack of evidence. Feasibility cannot
be averaged away by novelty; a fabricated or physically inconsistent result supports none
of the dimensions. Performance is assessed with `experimental-metrics.md` definitions.

## Check novelty against the nearest prior art

1. Search by the physical mechanism and conventional synonyms, not only the proposed label:
   laser direct writing, maskless lithography, scan/f-theta/telecentric optics, pupil relay,
   beam homogenization, interferometric positioning, stitching, dose modulation and the
   specific process. Use the subsets relevant to the candidate.
2. Find the closest optical-system paper, a conventional engineering baseline, and relevant
   public patents, instrument/application notes or open-source implementations when they
   bear on priority or feasibility. Patents inform technical prior art, not a legal opinion.
3. Read the consequential method, equation, diagram and result. Record source locators and
   distinguish reported experiments from simulation, preprints, and vendor specifications.
4. Compare at matched wavelength, NA, field, sample/process, dose, measurement bandwidth,
   acquisition duration and feature quality as applicable. Do not rank incompatible numbers;
   expose the difference that prevents the comparison.
5. State the remaining difference in one technical sentence. Search specifically for that
   difference once the closest work is known. If it is already demonstrated, narrow or
   replace the claim rather than relabeling the same mechanism.

Keep a compact working record:

| Candidate claim | Closest source and locator | Shared mechanism/structure | Remaining difference | Comparable conditions and evidence | Decisive next measurement |
|---|---|---|---|---|---|

Verdict: **supported distinction**, **incremental engineering extension**, **already covered**,
or **unresolved evidence**. Bound the conclusion to the searched scope. A missing paper in
one database does not establish priority; a practical engineering extension can still be a
valuable result with the right claim and venue.

## Hand off one actionable idea

Deliver the system bottleneck, the proposed physical/structural change, the four-dimensional
judgement, the nearest prior art, the expected observable (not an invented result), the
smallest decisive comparison, and the feasibility-critical inputs. Select a candidate by
reasoned tradeoff rather than a sum of scores. Pass the chosen claim and anti-claim into
`../experiments-and-claims.md`; independent review uses `../review-and-revision.md` unchanged.
