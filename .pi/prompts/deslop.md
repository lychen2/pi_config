---
description: Audit or remove unnecessary defenses and redundant tests from the current task
argument-hint: "[audit|apply] [paths or scope]"
---

Apply the global working rules and applicable project guidance. Request: ${@:-audit current task changes}.

Default/audit is read-only. Only apply permits scoped edits. The global rules require an automatic apply pass within the already-authorized task; it never expands that authorization.

1. Inspect staged and unstaged diffs plus new files. Identify task-owned changes and required behavior; preserve prior user edits and unrelated code. If ownership is unclear, ask for scope before editing.
2. Review tests first. Map changed cases to observable results and independent expectations. Identify duplicate or implementation-coupled cases and their unused fixtures. Preserve distinct success, rejection, security, persistence, and supported compatibility coverage. Redundant tests are not evidence that production behavior is obsolete.
3. Review task-added defenses and verification machinery. Require a real consumer, boundary, or contract; a new validator and the artifact it alone validates do not justify each other. In apply mode, remove only evidenced redundancy, speculative defenses, and unused test support. Preserve required protections and unclear existing behavior; do not infer obsolescence from a limited search.
4. Verify the reduced diff using applicable project guidance and existing checks. Restore necessary code if cleanup breaks required behavior. Reuse still-valid evidence and stop when acceptance is met. Do not add proof files, a verification framework, or tests merely to validate the cleanup; leave files unchanged when no removal is justified.
5. Report concrete removals or audit findings, observed checks, and blockers. Do not stage, commit, install hooks, add dependencies, or expand to repository-wide cleanup.
