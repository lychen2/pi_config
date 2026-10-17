# Agent coordination

## Choose the execution mechanism

Honor the user's explicit choice of Orca or teammate. A requested multi-Pi Orca test must use actual Orca-managed Pi workers.

1. Handle small, tightly coupled work in the parent session when delegation adds no useful parallelism or independent review.
2. Prefer teammate for bounded subtasks within the current conversation: discovery, focused analysis, review, or independent implementation with clear file ownership.
3. Prefer Orca for independent interactive agent sessions, Orca-managed worktrees, cross-agent CLI coordination, ownership handoffs, or durable supervised Task/Dispatch tracking.
4. Choose by session ownership and lifecycle needs, not task length or worker count alone. Both mechanisms support parallel work.
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
Orca can launch Pi with `--agent pi` when supported by the installed runtime. Verify support through its skills and actual launch receipts.
Use a full handoff when ownership transfers; use supervised orchestration when the parent remains responsible for collecting results.
Input acceptance proves delivery only. Match completion reports to their expected Task and Dispatch, then verify the reported evidence.
Acknowledge processed deliveries and resolve each settled worker's lifecycle through Orca's supported release, reuse, or retention operations.

## Keep ownership explicit

Choose one mechanism for each delegated task. Do not launch the same work through both or nest orchestration layers without a concrete need.
For any necessary nesting, keep one lifecycle owner per task and assign disjoint editing paths.
Preserve explicit tool requests, task authority, and existing user work. Neither mechanism grants additional permissions or filesystem isolation.
