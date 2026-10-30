# Agent coordination

## Choose the execution mechanism

Honor the user's explicit choice of Orca or teammate. A requested multi-Pi Orca test must use actual Orca-managed Pi workers.

1. Handle small, tightly coupled work in the parent session when delegation adds no useful parallelism or independent review.
2. Prefer Orca-managed dsh/DeepSeek workers for independent repository analysis, implementation, test execution, and focused review with clear ownership.
3. Use teammate for short checks that depend heavily on the current conversation and gain little from a separate session.
4. Keep task decomposition, architectural decisions, integration, and final acceptance in the parent session. Choose delegation when independent work earns its coordination cost.
5. If the requested mechanism is unavailable, report the exact missing capability. Ask before substituting another mechanism.

## Use teammate

Give each task a self-contained goal, relevant paths, access permissions, file ownership, acceptance checks, and a stopping condition.
Use read-only access for discovery and review. Give editing workers narrowly scoped, non-overlapping paths.
Keep integration and verification in the parent session. Collect results through teammate tools and verify evidence before claiming completion.
Do not imply that teammate creates an Orca Run, Task, Dispatch, or agent terminal.

## Use Orca

Load the Orca `orca-cli` skill for agent launch, terminal control, worktrees, and full ownership handoffs.
Load the Orca `orchestration` skill when the user requests supervised workers, completion tracking, task dependencies, or structured questions and replies.
Follow the installed version's skill and CLI contracts. Keep the same resolved Orca executable throughout a Run.
Default workers to dsh with its configured DeepSeek model unless the user or task requires another agent or model.
Verify the installed Orca launch route and actual dsh profile; this host uses `dsh-tui` (`dsh --profile dsh-tui`).
Give each worker a self-contained task, relevant paths, read/write authority, acceptance checks, and a stopping condition.
Use read-only workers for analysis and review, and disjoint editing paths for parallel implementation.
Orca can launch Pi with `--agent pi` when supported by the installed runtime. Verify support through its skills and actual launch receipts.
Use a full handoff when ownership transfers; use supervised orchestration when the parent remains responsible for collecting results.
Input acceptance proves delivery only. Match completion reports to their expected Task and Dispatch, then verify the reported evidence.
Acknowledge processed deliveries and resolve each settled worker's lifecycle through Orca's supported release, reuse, or retention operations.

## Clear active plans when stopping

Before stopping, save unfinished goals, step IDs, evidence, blockers, background job handles, and resumption steps in a durable handoff.
Then clear the session's active plan before sending the final response.
This applies when work finishes, pauses, is blocked, or transfers to another owner.
Pending plan steps also trigger automatic `Plan reminder` continuations.
Use the plan tool's supported clear or empty-plan operation; with Todo, call `todo` with `action: "clear"`.
Keep incomplete work recorded as unfinished; clearing tracking does not establish completion.
Resume from the handoff and restore the relevant steps when work continues.
If clearing is unavailable, preserve the handoff and report the missing capability.
Claim the plan is cleared only after verification.

## Document metadata

For new documents, use user-provided author information or leave authorship fields empty.
Do not insert agent names or template placeholders into author or last-editor fields. Preserve existing authorship when editing supplied documents.
Include this requirement in document-generation worker briefs. Inspect the final exported file's author and last-editor metadata before delivery.
Keep required AI-use disclosures and accurate software producer metadata.

## Keep ownership explicit

Choose one mechanism for each delegated task. Do not launch the same work through both or nest orchestration layers without a concrete need.
For any necessary nesting, keep one lifecycle owner per task and assign disjoint editing paths.
Preserve explicit tool requests, task authority, and existing user work. Neither mechanism grants additional permissions or filesystem isolation.
