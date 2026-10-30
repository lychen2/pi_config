---
name: research-decision
description: 依据证据选择科研方向、设计判别实验并重新评估意外结果。
---
# Research decisions

Use this skill to choose experiments, interpret unexpected results, reconsider a research direction, or evaluate a consequential scientific claim.
Use `experimental-design`, `statistical-power`, `statistical-analysis`, `uncertainty-and-units`, or literature skills when their specialized methods are needed.

## Decide from evidence

1. State the scientific question and the action that depends on it. Identify the unit, outcome, decision threshold, and resource constraints that affect the choice.
2. Separate direct observations, reported results, inherited interpretations, and your own inference. Check the original evidence behind inherited explanations when it could change the decision. Preserve source locations, numbers, units, and applicable conditions.
3. Identify plausible alternative explanations. State what each consequential explanation predicts. Keep unresolved alternatives explicit when the evidence cannot distinguish them.
4. Choose the smallest feasible test that can distinguish the leading explanations. Specify predicted outcomes and action-changing results before interpreting the test. Prefer reversible, informative actions when they answer the question.
5. Before costly or hard-to-reverse actions, check the relevant measurement chain. Inspect applicable controls, calibration, acquisition, transformations, units, range, and analysis. If a link cannot be checked or does not apply, record the reason and its effect on the action.
6. Update the assumptions affected by new evidence. Identify whether counterevidence affects a measurement, configuration, mechanism, or broader research question. Use that distinction to choose the next action. Reconsider a decision when new evidence, a counterexample, or a changed premise warrants it. Reuse valid checks for unchanged inputs.

## Preserve consequential decisions

Record a checkpoint when a decision, failed explanation, or phase handoff needs to survive compaction.
Skip checkpoints for routine factual questions and unchanged intermediate steps.

If `research_decision` is unavailable, discover it with `tool_search` using the query `research_decision`.
The tool is supplied by `pi-context-bridge`.

Supply these fields:

- `question`, `action`: the scientific question and the chosen or proposed action.
- `evidence`, `evidenceOrigin`: observations, missing evidence, and source locations; identify reported results and inherited interpretations.
- `interpretation`, `alternatives`: the current explanation and plausible competitors.
- `measurementChain`, `chainStatus`, `chainReason`: relevant checks, their status, and supporting evidence or reasons for missing checks.
- `discriminatingTest`, `predictedOutcomes`: the next test and expected results under each explanation. Explain when no further test is needed.
- `switchCondition`, `reversibility`: what would change the action and how readily it can be reversed.

Keep each text field within 420 characters. Preserve decisive conditions and reference longer evidence by file, URL, or observation identifier.
Use `chainStatus` values `checked`, `partial`, `not_applicable`, or `not_checked`.
Use `reversibility` values `reversible`, `partly_reversible`, `hard_to_reverse`, or `not_applicable`.
The tool stores agent-supplied records; it does not verify measurements or select a scientific conclusion.

Deliver the requested experiment, analysis, recommendation, or conclusion. Tie claims to evidence and state assumptions where they affect interpretation.
Keep the checkpoint protocol out of the deliverable unless the user requests it.

## When evaluating this workflow

Compare three conditions: the original agent, the agent with this skill, and the agent with this skill plus checkpoints.
Keep the model, cases, context, and permissions for shared tools identical. Vary only skill loading and checkpoint availability.
Score decisions against case evidence. Report accuracy and consequential errors, including errors caused by inherited project explanations.
Record time and token costs. Checkpoint completeness is an implementation measure; decision quality requires evaluation on research cases.
