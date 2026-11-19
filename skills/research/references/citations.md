# Citations and bibliography

Use this when turning papers you have read into references, cleaning a `.bib` file, or
answering "is this citation right?". The rule underneath everything: a citation is a claim
about a specific record, and the record has to be fetched, not remembered.

## 1. Resolve the record

One work, one canonical record. Get metadata from the authority for the field rather than
composing it:

| Field | Authority |
|---|---|
| DOI registration, journal, volume, pages, publisher | Crossref |
| Authors, affiliations, year, citation graph | OpenAlex / Semantic Scholar |
| PMID / PMCID / MeSH | PubMed / PMC |
| arXiv ID, version, primary category | arXiv |
| OA status, legal PDF link | Unpaywall / CORE |

Compare title, first author, year and venue with the record for the cited version. For an
abbreviated title, search the distinctive words with the first author and check the publisher's
issue or conference proceedings. Record the canonical title if these identify the same work.
If the DOI belongs to another paper, identify both records before correcting the entry. A
failed lookup leaves the work unverified. Keep the lookup source and the field in dispute.

Version policy: if a preprint and a published version exist, cite the published version
(authors, year, venue, pages, DOI) and keep the arXiv ID only when the reader needs the
free PDF. Never cite both as if they were two results.

## 2. Build the entry

- **Entry type matters**: `@article` for journal papers, `@inproceedings` for conference
  papers (not `@article` with a booktitle), `@book`, `@phdthesis`, `@techreport`,
  `@misc` for datasets, software, and standards with a DOI or URL.
- **Required fields**: author list in `Last, First and Last, First` form, title in braces
  to protect capitalization (`{DNA}`), journal or booktitle as published, year, volume,
  number, pages as `first--last`, DOI without the URL prefix, `url` plus `urldate` for web
  and software items.
- **Keys**: stable and readable — `lastname2024keyword`. One key per work; a duplicate work
  under two keys splits citation counts and hides a duplicate reference.
- **Escaping**: `&`, `%`, `_`, `#`, and accented characters need LaTeX-safe handling; a
  brace-protected title is also what keeps a chemical formula from being lowercased.
- **Completeness**: `et al.` in the `author` field loses authors permanently. Record the
  full author list and let the style abbreviate.

Recipes per style, escaping details, and field tables: `citations/bibtex_formatting.md`.
A ready template: `citations/bibtex_template.bib`.

## 3. Validate before submission

```bash
python3 scripts/citations/validate_citations.py references.bib --manuscript paper.tex
python3 scripts/citations/validate_citations.py references.bib --check-dois
python3 scripts/citations/format_bibtex.py references.bib --sort year
python3 scripts/citations/doi_to_bibtex.py 10.1038/nature12345
python3 scripts/citations/extract_metadata.py --doi 10.1038/nature12345
python3 scripts/citations/extract_metadata.py --pmid 12345678
python3 scripts/citations/extract_metadata.py --arxiv 2103.12345
```

`--check-dois` checks supplied identifiers and compares titles where the registry supplies
one. Review warnings for shortened titles or inaccessible records. For each substantive
in-text claim, open the cited paper at the supporting passage, table cell, figure or equation.
Record the locator and any scope or numerical mismatch separately from the metadata check.

`--manuscript` uses Pandoc to read standard LaTeX or Markdown citations, including LaTeX
input files. It lists missing keys and unused BibTeX entries. Explicit `nocite` inclusions
are tracked separately from in-text citations. For publisher-specific citation macros,
check the native build's bibliography diagnostics. A shared library can have unused entries.

Check against the paper and venue:

- each cited source supports the passage where it is used;
- ordering, repeated-citation behavior, and citation command (`\citep`/`\citet` for
  natbib venues, `\cite` for IEEE numeric) match the target style;
- reused figures, tables, datasets, software, protocols, and standards are attributed;
- direct quotations carry locators and, where needed, permissions;
- no retracted or corrected status is concealed.

## 4. Hygiene when the bibliography grows

- Keep `references.bib` to works that are actually cited; a bloated bib hides which entry
  backs which sentence.
- Deduplicate by DOI, then arXiv ID, then normalized title. Merge rather than keeping both.
- Prefer a primary source over a review that summarizes it, and cite the paper you read.
- When a claim needs a locator, put it where the reader can follow it (section, figure,
  equation, page) instead of citing a whole paper.
- Cite the dataset, code release, or standard directly when the claim depends on it.

After a requested Zotero or BibTeX import/export, read the resulting library records or
export back. Compare the title, year, venue, pages, DOI and ordered author list against the
input. A successful import count alone cannot reveal a truncated or reordered author list.

Deeper material: `citations/core_workflow.md` (discovery → extraction → formatting →
validation), `citations/metadata_extraction.md`, `citations/citation_validation.md`,
`citations/search_strategies.md`, `citations/best_practices.md`,
`citations/example_workflows.md`, `citations/script_reference.md`,
`citations/google_scholar_search.md`, `citations/pubmed_search.md`. A pre-submission list:
`citations/citation-checklist.md`.

Searching for the paper itself: `literature.md`.
