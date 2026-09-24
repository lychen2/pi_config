# Learning from a book, paper, or course

Adapted from teach's source-grounded chapter workflow, without its host-specific
tools, fixed models, personal paths, or mandatory subagents.

## Use the supplied source

Use the path or URL the learner supplied. If it is missing and matters, ask for
it; do not inspect Downloads or inbox folders to guess the intended book. Confirm
the edition/version and target chapter, section, or practical objective. Reuse a
verified existing map, checking whether the underlying material has changed.

For PDF, image, Word, PowerPoint, Excel, OCR, tables, or formulas, load the
applicable document-processing guidance (normally `mineru-file-processing`) and
follow it before extraction. Do not upload private or copyrighted material to
an external service without the required consent. Link to the source in records;
do not copy an entire book into the skill or a public repository.

If extraction fails or a figure/equation is unreadable, identify the missing
section and request a usable excerpt or page. Do not silently substitute general
knowledge while claiming to teach the book. Topic-mode teaching can continue
only if the learner agrees to the changed source scope.

## Verify location before teaching

Printed page numbers and PDF page indices can differ. Record both when available.
Verify the actual heading and content on each selected page; do not assume one
offset holds across an entire book. Distinguish table-of-contents matches from
chapter-body matches. For web courses, record the section URL and version/date
when relevant. For papers, distinguish the author's claims, evidence, and your
interpretation.

Read bounded sections sufficient for the next objective; do not ingest an entire
book to teach one chapter. Extract the section's definitions, results, procedures,
and worked exercises into `MATERIALS.md` within the approved workspace:

```markdown
# Material map
- Source: original path or URL
- Edition / version: known value or unknown
- Selected scope: chapter / sections

| ID | Objective | Source location | Location verified | Evidence status / record | Next task |
|---|---|---|---|---|---|
```

Use the material's objectives to form the plan. Include prerequisite repair when
needed, clearly labeled supplemental. Break a long chapter into groups of at
most five visible objectives while preserving the full map on disk. For a
selected chapter, assess all agreed objectives; for a narrow question, do not
expand into a whole course. Mark unassessed objectives as open.

## Fidelity and assessment

Prefer relevant exercises from the source when their solutions can be checked.
For a fresh independent task, adapt conditions without silently changing the
concept or difficulty. Prepare a valid rubric first. Cite source locations for
consequential definitions, equations, and claims. Explanations beyond the source
are labeled supplemental and verified separately when necessary.

If a source conflicts with reliable evidence, describe the conflict and cite
both. When preparing for an exam, distinguish the course's expected convention
from a factual correction; never present a known false statement as true.
If verification is unavailable, label the specific claim unresolved and avoid
using it to grade the learner.

Inspect an extracted or generated figure before embedding it. Verify the caption,
complete axes/labels, and relevant page; a successful crop command alone does not
show the correct figure was captured. Fall back to text when it is sufficient.

Update objective status from actual evidence using assessment.md. At a pause,
record the open objectives and the next exact task. Report a compact count such
as "3 of 5 demonstrated independently; 2 open" without equating it to retention.
