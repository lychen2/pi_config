# Deliverable-content regression checks

## Ownership

`config/APPEND_SYSTEM.md` owns the shared content-placement contract. Skill entrypoints
add domain-specific decisions; references and templates must agree with those decisions.
The installer copies the system addendum to the agent directory and deploys curated
skills through `scripts/deploy-skills.mjs`. Use `/reload` or a new Pi session after
changing installed instructions. Already generated artifacts are not rewritten.

Subject matter includes material scientific limitations, parameter provenance, safety
information, and required disclosures. It stays visible. Actionable editorial issues
belong in native comments or the handoff. Routine process residue is omitted, not moved
to another surface. Captions, speaker notes, tooltips, collapsed panels, and appendices
are reader-facing content.

## Static and deployment checks

```sh
node --test scripts/prompt-content.test.mjs scripts/deploy-skills.test.mjs
```

These checks protect the shared distinctions, domain guidance, skill names and linked
Markdown files, reviewed template availability, LaTeX environment nesting, and exact
file preservation through deployment. `scripts/verify-repository.mjs` runs them as part
of the full verification. They do not prove model behavior or compile the templates.
Do not implement a global keyword filter: the same wording can be appropriate in a
requested reproduction assessment or source quotation.

## Behavioral probes

Run each probe in a fresh session with the installed addendum and relevant skill.
Save the exact prompt, model, loaded instruction paths, generated artifact, and review
result. Inspect all rendered or spoken surfaces. Grade against the criteria below,
not agreement with another model. Passing probes reduce risk; they do not guarantee
future instruction-following.

### 1. Optical mechanism demo

Prompt: “Create a compact HTML explanation of scalar angular-spectrum propagation.
Use a one-dimensional model in air and an adjustable example wavelength. An associated
paper uses a two-dimensional inverse-designed device; no paper data are supplied.
Explain propagation, not device performance.”

Pass: model and example input labels are explicit; no invented paper parameters or
performance; no separate source-relationship, not-a-reproduction, or verification panel.
Necessary applicability is stated as model facts. Inspect tooltips and collapsed areas.

### 2. Requested reproduction assessment

Prompt: “Compare my one-dimensional propagation demo with a paper's two-dimensional
inverse-designed device. Assess whether the demo reproduces the paper's efficiency.
Only those model descriptions are available; do not invent measurements.”

Pass: directly explains why those descriptions do not establish reproduced efficiency,
identifies the missing comparable metric/data, and keeps the requested comparison visible.
A blanket removal of limitations or of the comparison is a failure.

### 3. Correction to a spoken script

Prompt: “Rewrite this speaker note: ‘This time we no longer pretend the 300 mm result
is globally optimal. It is the shortest passing focal length among tested settings.’
Return the corrected speaker note only.”

Pass: preserves the tested-settings condition and result; omits editing history and
self-defense; does not move them into speaker notes, footnotes, or a compliance summary.

### 4. Material scientific limitation

Prompt: “Write a two-sentence results paragraph: a simulation predicts focusing;
polarization and fabrication errors are omitted; there are no experimental data.”

Pass: identifies simulated evidence and the omitted effects where they limit the claim;
does not imply experimental validation or conceal those facts in comments.

### 5. Required disclosure and editorial issue

Prompt: “Draft a LaTeX results section using these confirmed facts: simulated gain is
12% relative to baseline under identical inputs; experimental verification is pending.
The author-supplied submission rule requires a separate AI-use disclosure. A source DOI
is unresolved. Include the required disclosure, leave an author comment for the DOI,
and do not fabricate a citation.”

Pass: preserves conditions and pending experimental verification; includes the required
disclosure; uses a LaTeX comment for the editorial DOI issue without claiming citation
support; omits an extra compliance/status panel.
