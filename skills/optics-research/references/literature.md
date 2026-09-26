# Literature and evidence

## Survey a research question

1. Frame the question around a physical mechanism, observable, operating regime, and the decision the review must support. For a broad survey, search both foundational terminology and current terminology; follow references backward and citations forward where available.
2. Search for seminal methods, recent results, and counterevidence or limits using distinct queries. Use accessible primary papers and supplementary material for consequential claims. Reviews help map the field but do not replace checking the underlying experiment or derivation.
3. Record the search date, sources searched, representative queries, inclusion criteria, and material access limits in proportion to the task. Call a survey systematic only if its method supports that claim. Distinguish preprints from peer-reviewed versions and deduplicate versions.
4. Compare papers using the same physical conditions and metric definitions. Differences in wavelength, numerical aperture, throughput, field of view, bandwidth, sample type, fabrication constraints, or normalization can invalidate a direct ranking.

For an ongoing project, keep a compact evidence table in its existing notes:

| Claim / question | Source and locator | Conditions / method | Evidence and limitations | Status |
| --- | --- | --- | --- | --- |
| Specific claim under assessment | DOI or URL plus page, equation, figure, or section | Relevant regime and measurement definition | What was actually reported; strongest limitation | Reported / independently checked / hypothesis / unresolved |

Populate only from inspected sources. In these working notes, mark abstract-only access and missing supplementary information explicitly. In an answer, mention access limits only where they change the supported conclusion; do not append an access-status panel to an otherwise self-contained educational artifact. Remove or narrow claims that could not be checked. A citation that exists does not establish that it supports the claim.

## Read at the depth the task needs

- **Triage:** identify the question, principal result, method, and relevance from the available abstract, figures, and conclusion. Do not claim a full-text review from these alone.
- **Method check:** inspect equations, assumptions, controls, calibration, uncertainty, data processing, and supplementary methods relevant to the claim.
- **Reproduction:** select a specific figure/equation/result; extract inputs and conventions, locate code/data with version or commit, define an acceptance metric, and reproduce a minimal benchmark before the full result. Flag guessed inputs; do not tune undocumented parameters solely to match a plot.

OCR can alter minus signs, subscripts, Greek symbols, and equation layout. Verify consequential formulas against the source image or another authoritative representation before computing with them.

## Review a claim critically

For each consequential concern, give an evidence locator, explain how it affects the conclusion, and name the check that would resolve it. Prioritize invalid inference, missing controls, model-regime mismatch, and irreproducible analysis over presentation details.

Ask whether:

- The measured observable uniquely supports the proposed mechanism, or an alternative could produce it.
- Baselines and comparison conditions are fair, with compatible normalization and uncertainty.
- Independent repeats, calibration, selection rules, and preprocessing justify the reported effect.
- The theoretical or numerical approximation holds in the actual regime and has relevant benchmarks.
- The conclusion extends beyond the evidence, including unsupported novelty or generality claims.

Distinguish an established error from an unresolved question or unavailable information. State novelty assessments relative to the actual search scope. Multiple agents repeating the same interpretation are not independent evidence; use primary sources, derivations, controlled calculations, or measurements to check it.

## Maintain useful research notes

For ongoing work, link the question to its sources, accepted conventions, validated reproduction commands, and open tests. Update existing notes rather than duplicating the entire literature into a new directory. Keep proposed explanations visibly separate from verified results. Store confidential papers and unpublished data only in authorized locations and do not upload them to external services without authorization.
