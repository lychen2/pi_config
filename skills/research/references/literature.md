# Literature: from question to defensible gap

Use this to survey a topic, position a contribution, check what a paper actually reports,
or find out whether the thing you want to claim is already known. Reading depth follows
the task: triage, method check, or reproduction are different jobs.

## 1. Frame the question before searching

Write down the mechanism, observable, operating regime, and the decision the review must
support. That determines inclusion criteria, which databases matter, and when the search
is finished.

For a broad survey, search both the foundational terminology and the current terminology;
follow references backward and citations forward. Use distinct queries for seminal
methods, recent results, and counterevidence or limits. Reviews map the field; they do not
replace the underlying experiment or derivation for a consequential claim.

For a systematic review, record queries, dates and eligibility criteria. Test the search
against known eligible papers. From the screening export, count records found, duplicates,
records screened and excluded, reports sought and unavailable, full texts assessed, exclusions
by reason and reports included. Use study IDs to count distinct studies. Report any shortfall
against the requested coverage.

## 2. Route to the right database

| Intent | Primary | Also consider |
|---|---|---|
| Biomedical topic | PubMed | Europe PMC, OpenAlex |
| Biomedical full text, or keyword search inside full text | Europe PMC | PMC, CORE |
| Biology / health preprint by topic | Europe PMC (`SRC:"PPR"`) | Semantic Scholar, OpenAlex |
| Preprint by date or DOI | bioRxiv / medRxiv | Europe PMC |
| Physics, math, CS, economics preprint | arXiv | Semantic Scholar, OpenAlex |
| Across all fields | OpenAlex | Semantic Scholar, Crossref |
| Metadata for a DOI | Crossref | Unpaywall, Semantic Scholar |
| Legal free PDF | Unpaywall | CORE, PMC |
| Citation graph, an author's papers, recommendations | Semantic Scholar | OpenAlex, Europe PMC |
| Full text, any field | CORE | PMC, Europe PMC (biomedical only) |
| Retraction status | PMC OA Web Service | Crossref (`update-type:retraction`) |

For a cross-field reading list, run `python3 scripts/citations/search_openalex.py "search terms" --limit 10`.
It returns up to the requested number of works. A successful zero-match query prints
`No results found` and exits 1. A failed page or incomplete count exits 2 before export.

Choose complementary indexes for the field and question. For example, PubMed covers indexed
biomedical articles, Europe PMC adds full text and preprints, and OpenAlex supplies links
across disciplines. In a systematic review, record the coverage each source contributes.

Database files hold endpoints, parameters, verified example calls, failure modes, and rate
limits. Read the one you are about to call:

`literature/pubmed.md` · `literature/pmc.md` · `literature/europepmc.md` ·
`literature/biorxiv.md` · `literature/medrxiv.md` · `literature/arxiv.md` ·
`literature/openalex.md` · `literature/crossref.md` ·
`literature/semantic-scholar.md` · `literature/core.md` · `literature/unpaywall.md`

Headers, POST bodies, keys, the error-recovery ladder, and bulk walks: `literature/calls.md`.
Adding a database: `literature/extending.md`.

If a search ends at a login or CAPTCHA, use an accessible index for the same question
and open the records it returns. If the brief requires the blocked database, record that
coverage gap. A blocked query contributes no evidence about how many eligible papers exist.

## 3. Verify the response, not the status code

These APIs fail with HTTP 200, and the failure arrives as a confident wrong answer:

- **PMC eFetch** returns `<front>` and **no `<body>`** when the publisher forbids XML
  redistribution — the majority case, since only a minority of PMC records are in the OA
  subset.
- **arXiv** answers a malformed parameter with `totalResults` 1 and an entry titled
  `Error`; an unknown field prefix is silently rewritten to `all:`; throttling is the bare
  text `Rate exceeded.`
- **Europe PMC** puts `errCode` inside a 200 body and represents booleans as `"Y"`/`"N"`,
  where `"N"` is truthy everywhere.
- **bioRxiv/medRxiv** accept an out-of-step `cursor` and return the wrong records; an empty
  `collection` for a valid query is inconclusive, not evidence of absence.

Check the error field or entry title, the identifier format, and any count the response
reports. A non-zero exit from a bundled script is information: report what it says instead
of re-parsing the payload by hand.

## 4. Verify identity before trusting content

Never write a DOI, arXiv ID, or bibliographic record from memory. Confirm the identifier
resolves and the title matches before the paper enters your evidence list: fetch the record
by DOI or arXiv ID and compare title, first author, and year; fall back to a title search
in another index. Unverified entries stay visibly unverified; they are not silently
dropped, because a paper you could not confirm is different from a paper that does not
exist.

Also check, before quoting a paper as current evidence:

- `retracted` / `is_retracted` / `update-type:retraction`;
- whether the version you have is a preprint superseded by a published version — keep one
  canonical record, prefer the published venue and DOI, keep the arXiv PDF link;
- the license, if text or figures will be redistributed.

## 5. Read at the depth the task needs

- **Triage:** question, principal result, method, relevance. Abstract plus figures plus
  conclusion. Do not describe this as a full-text review.
- **Method check:** equations, assumptions, controls, calibration, uncertainty, data
  processing, and supplementary methods relevant to the claim you want to borrow.
- **Close-reading note:** connect the question, mechanism, decisive evidence and strongest
  limitation. Before saving, reopen the original PDF or publisher full text at each key
  number, equation or quoted claim. Check the table row and column, units and conditions.
  Correct discrepancies and mark inaccessible evidence as unverified. For a claimed code
  correspondence, identify the repository version and symbol you actually inspected.
- **Reproduction:** extract the inputs and conventions for one published result, then use
  the reproduction procedure in [Experiments and claims](experiments-and-claims.md#reproduce-a-published-result).

An abstract cannot verify methods, equations, or supplementary results. OCR can alter minus
signs, subscripts, Greek symbols, and equation layout — check consequential formulas against
the source image before computing with them.

## 6. Extract into a table you can argue from

| Paper | Venue / version | Method | Reported result | Conditions and limits | Relevance | Status |
|---|---|---|---|---|---|---|

Populate only from inspected sources. `Status` records whether you read the full text or
only the abstract, whether the identifier was verified, and whether the result was
independently checked.

Compare papers under the same physical conditions and metric definitions. Differences in
wavelength, numerical aperture, throughput, field of view, bandwidth, sample type,
fabrication constraint, or normalization can invalidate a direct ranking.

## 7. Synthesize

Group by approach, assumption class, or research question — not one paragraph per paper.
State where the field agrees, where it disagrees and why, and which gap is real rather than
merely unindexed. A citation that exists does not establish that it supports your sentence;
check the sentence against what the paper reports, at the locator you would give a reader.

Distinguish what the paper reports from your interpretation of it. Note a paper that
directly competes with or undercuts the intended claim; that is the most valuable row in
the table.

## 8. Keep records

For ongoing work, keep a compact evidence table in the project's existing notes: claim,
source and locator (DOI plus page, equation, figure, or section), conditions, what was
actually reported, strongest limitation, and status (reported / independently checked /
hypothesis / unresolved). Record the search method when reproducibility or review scope
calls for it.

Update existing notes rather than creating a parallel literature hierarchy. Keep proposed
explanations visibly separate from verified results.
