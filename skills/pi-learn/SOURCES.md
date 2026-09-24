# Pi Learn: source review and adaptation

Pi Learn is a local synthesis for Pi, not an official release of these projects.
The commit links below pin the source reviewed. No upstream repository is added
as a runtime dependency and no extension is installed by loading this skill.

| Project / reviewed commit | What it provides | Decision for Pi Learn |
|---|---|---|
| [pacchio1/agentic-learning](https://github.com/pacchio1/agentic-learning/tree/790623e813ad62f5b6d15e65350faa09d7827849) | OpenCode-based learning environment with prerequisite probing, dependency planning, quiz/note tools, factual checking, and visuals | Borrow the general diagnose → plan → teach idea, not its implementation or text. No license was identified in the reviewed repository metadata. No OpenCode tools are required. |
| [EmilioFarias/teach](https://github.com/EmilioFarias/teach/tree/cebe99e8fe67e1d5ca8d6d61fb6d4364a83b6193) | Topic and textbook instruction, source-location verification, objective ledgers, retrieval checks, and review | Adapt material-grounded objectives and distinguish recognition from independent production. Remove fixed models, personal paths, mandatory subagents, repeated note-taking gates, and refusal to reveal requested solutions. MIT notice retained. |
| [cuongducle/hybrid-teach](https://github.com/cuongducle/hybrid-teach/tree/eed3535fc7465c60f2e89a291214a543261a938e) | File-based adaptive tutoring, bounded diagnosis, evidence-based learner state, privacy safeguards, and explicit review transitions | Primary base. Adapt evidence records, fair grading, resumable checkpoints, workspace approval, and review scheduling. Simplify the visible workflow for short sessions. MIT notice retained. |
| [lood31/pi-prompt-snippets](https://github.com/lood31/pi-prompt-snippets/tree/51716deaa44720029a14b8cbadc89598efcef6e5) | Pi TUI extension for selecting and prepending/appending reusable prompt snippets | Not a tutoring skill. No source code or snippets are bundled. Express the useful practice constraint independently: diagnose before editing a learner's exercise, verify the grading basis. Its popup manager is not needed for this workflow. |

## Local changes

- Independent name `pi-learn` avoids collision with existing `teach` installations.
- Pi file tools replace host-specific quiz, note, task, and live-viewer APIs.
- Short action-first exchanges, one question at a time, bounded diagnostic work,
  visible task state, and explicit pause/resume support low working-memory load.
- A requested direct answer is allowed and recorded as assistance. A new task is
  needed for independent evidence; no forced endless quiz or completion loop.
- Source checking is proportional to the claim. Optional tools and specialist
  skills help when needed; no model, delegation, visual renderer, or browser is
  mandatory. Materials cannot issue instructions to the assistant.

## Use

After installation or edits, run `/reload` in Pi. Examples:

```text
/skill:pi-learn Teach me eigenvectors. I have 15 minutes and know matrix multiplication.
/skill:pi-learn Study section 2 of /absolute/path/book.pdf with me.
/skill:pi-learn Resume the approved workspace ~/learning/linear-algebra/.
/skill:pi-learn Test my understanding of Python closures; do not edit my solution.
```

New learning records go only to an approved workspace, normally
`~/learning/<topic-slug>/`, or remain session-only if persistence is declined.
The skill does not run a scheduler or send notifications. Use Pi's explicit skill
command for deterministic selection; automatic matching remains model-dependent.

## Packaging

The repository source is `skills/pi-learn/`. The normal repository installer
includes it through `scripts/deploy-skills.mjs`. The installed copy lives at
`~/.pi/agent/skills/pi-learn/` for the default agent directory. Future installer
runs archive and replace the packaged copy just like other managed skills;
keep personal progress outside it and make durable skill edits in the repository.

The assessment reference includes manual behavior scenarios. File, link,
deployment, and Pi-loader tests verify packaging only, not learning outcomes or
compliance by every model.
