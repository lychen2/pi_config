# Resumable learning state

Adapted from hybrid-teach; preserve its upstream notice in ../LICENSE.

## Workspace and privacy

Save records when the learner requests persistence, using the supplied workspace or
`~/learning/<topic-slug>/` when no location is specified. Reuse that authorization
for subsequent checkpoints. Session-only learning needs no files. Keep records
outside installed skills and source repositories by default.

For a requested repository location, check existing tracking and sharing settings
once before adding personal records. Preserve the project's configuration; ask
only when a concrete publication or access change is needed. Saving progress does
not authorize publishing it or copying private source documents into a shared area.
Routine privacy checks stay internal; raise a specific issue only when it affects
the chosen storage or sharing action.

Read before editing and preserve the learner's notes. Use targeted edits for
existing files. Re-read before checkpointing; reconcile concurrent changes or
ask instead of overwriting. If expected files use a different format, preserve
it and map the fields needed; do not silently migrate or delete old state.

## Checkpoint order

1. Inspect existing record names and choose an unused sequential ID.
2. Write the evidence record first. If its name collides, select another ID;
   never overwrite the colliding record.
3. Update the learner map, plan, and review queue, referencing that ID.
4. At pause, save the next task or pending question in MISSION.md.

This is a manual recovery protocol, not transactional storage. Report failed
writes with the affected path; do not claim the checkpoint succeeded. On resume,
reconcile relevant records with indexes before creating reviews. One review item
per objective and scope; use stable IDs. Supersede erroneous evidence with a new
record and retain history. No background reminders are installed.

## Minimal files

### MISSION.md

```markdown
# Learning mission
- Outcome: observable task
- Success criteria: what counts as demonstrated performance
- Time budget: 15 minutes
- Materials: source paths / versions, or none
- Preferences: language, pace, accessibility
- Workspace: approved path

## Plan
- [ ] One bounded objective

## Resume
- Last evidence: record ID or none
- Next task: exact question or action
- Pending answer: awaiting learner / none
```

Confirm substantive mission changes. Mark plan completion from evidence, not
from whether an explanation was delivered.

### LEARNER.md

```markdown
# Learner map
| Objective / task scope | Assistance | Checked / actual delay | Transfer | Verification | Evidence ID | Next check |
|---|---|---|---|---|---|---|
| Explain a definition | not assessed | unknown | untested | introduced | — | fresh explanation |
```

Assistance is independent / hints / worked solution / self-report / not assessed.
Verification is introduced / checked / disputed / unverified. Transfer is
untested / attempted / demonstrated, with the changed conditions identified.
Old labels without supporting tasks do not imply application competence.

### records/0001-topic.md

```markdown
# Evidence
- Date: YYYY-MM-DD
- Status: active / superseded by ID
- Objective and task: reproducible prompt or precise scope
- Learner response: concise faithful summary; quote when necessary
- Assistance: none / hints / worked solution / self-report; specify
- Delay: immediate / actual elapsed interval / unknown
- Transfer: untested / attempted / demonstrated; changed conditions
- Verification: checked / disputed / unverified; method and result
- Interpretation: supported conclusion and limits
- Next check: fresh task or delayed recall
```

Record independent attempts, verified errors, assistance, disputes, and meaningful
mission changes. Avoid whole transcripts and unnecessary personal information.
An attempted repair is not a successful correction until new evidence supports it.

### REVIEW.md

```markdown
# Review queue
| ID | Objective / scope | Evidence ID | Prompt, no answer | Due | Last practice | Last result / record | Stage | Status | Interval override |
|---|---|---|---|---|---|---|---|---|---|---|
```

Status is active / held / retired. Apply assessment.md transitions only to items
actually attempted. Keep checked solutions or rubrics in `answer-keys/` if saved,
separate from prompts, and do not display them before an independent attempt.

### RESOURCES.md (only when sources are used)

```markdown
# Sources
| Source / URL / version / location | Supports | Verification and limits |
|---|---|---|
```

Optional `notes/` contains definitions, examples, diagrams, and citations;
`MATERIALS.md` maps textbook objectives as described in materials.md. These are
reference material, not proof of learning. Reuse existing learner-written notes
without replacing them with generated summaries.
