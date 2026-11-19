# Bundled Script Reference

Purpose, arguments, and usage examples for each script under `scripts/citations/`:
`search_openalex.py`, `search_pubmed.py`, `search_google_scholar.py`,
`extract_metadata.py`, `validate_citations.py`, `format_bibtex.py`, and
`doi_to_bibtex.py`.

`_common.py` is not a command. It holds the brace-aware BibTeX parser, the
entry renderer, the page-range normaliser, and the citation-key scheme that
every script above shares — which is what lets entries found through different
databases deduplicate against each other.

## Tools and Scripts

### scripts/citations/search_openalex.py

Search scholarly works through the OpenAlex REST API.

**Features**:
- Cursor pagination reconciles distinct work IDs with the requested count or reported total, whichever is smaller
- Year range and work-type filtering
- Sort by relevance or citation count
- Abstracts reconstructed from OpenAlex's inverted index
- Open-access status on every record
- Export to JSON or BibTeX

**Usage**:
```bash
# Basic search
python scripts/citations/search_openalex.py "quantum computing"

# Most-cited work in a window
python scripts/citations/search_openalex.py "quantum computing" \
  --year-start 2020 \
  --year-end 2024 \
  --limit 100 \
  --sort-by citations \
  --output quantum_papers.json

# Reviews only, straight to BibTeX
python scripts/citations/search_openalex.py "CRISPR gene editing" \
  --type review \
  --limit 50 \
  --format bibtex \
  --output crispr_reviews.bib
```

Set `OPENALEX_API_KEY` to use your account's allowance. `OPENALEX_EMAIL` or `--email`
provides a contact address. A completed zero-match search exits 1. A failed or incomplete
request exits 2 before writing the output file.

### scripts/citations/search_google_scholar.py

Search Google Scholar and export results.

**Features**:
- Automated searching with rate limiting
- Pagination support
- Year range filtering
- Export to JSON or BibTeX
- Citation count information

**Usage**:
```bash
# Basic search
python scripts/citations/search_google_scholar.py "quantum computing"

# Advanced search with filters
python scripts/citations/search_google_scholar.py "quantum computing" \
  --year-start 2020 \
  --year-end 2024 \
  --limit 100 \
  --sort-by citations \
  --output quantum_papers.json

# Export directly to BibTeX
python scripts/citations/search_google_scholar.py "machine learning" \
  --limit 50 \
  --format bibtex \
  --output ml_papers.bib
```

### scripts/citations/search_pubmed.py

Search PubMed using E-utilities API.

**Features**:
- Complex query support (MeSH, field tags, Boolean)
- Date range filtering
- Publication type filtering
- Batch retrieval with metadata
- Export to JSON or BibTeX

**Usage**:
```bash
# Simple keyword search
python scripts/citations/search_pubmed.py "CRISPR gene editing"

# Complex query with filters
python scripts/citations/search_pubmed.py \
  --query '"CRISPR-Cas Systems"[MeSH] AND "therapeutic"[Title/Abstract]' \
  --date-start 2020-01-01 \
  --date-end 2024-12-31 \
  --publication-types "Clinical Trial,Review" \
  --limit 200 \
  --output crispr_therapeutic.json

# Export to BibTeX
python scripts/citations/search_pubmed.py "Alzheimer's disease" \
  --limit 100 \
  --format bibtex \
  --output alzheimers.bib
```

### scripts/citations/extract_metadata.py

Extract complete metadata from paper identifiers.

**Features**:
- Supports DOI, PMID, arXiv ID, URL
- Queries CrossRef, PubMed, arXiv APIs
- Handles multiple identifier types
- Batch processing
- Multiple output formats

**Usage**:
```bash
# Single DOI
python scripts/citations/extract_metadata.py --doi 10.1038/s41586-021-03819-2

# Single PMID
python scripts/citations/extract_metadata.py --pmid 34265844

# Single arXiv ID
python scripts/citations/extract_metadata.py --arxiv 2103.14030

# From URL
python scripts/citations/extract_metadata.py \
  --url "https://www.nature.com/articles/s41586-021-03819-2"

# Batch processing (file with one identifier per line)
python scripts/citations/extract_metadata.py \
  --input paper_ids.txt \
  --output references.bib

# Different output formats
python scripts/citations/extract_metadata.py \
  --doi 10.1038/nature12345 \
  --format json  # or bibtex, yaml
```

### scripts/citations/validate_citations.py

Check BibTeX syntax, relevant metadata, and manuscript references. Count presets are optional heuristics, not publication requirements.

**Features**:
- `--check-dois` compares submitted titles with Crossref or DataCite metadata. When both registries return 404, it checks the DOI's Handle record. `--report` includes `doi_checks` with the two titles and outcome for each supplied DOI.
- Required field checking
- Duplicate detection
- Format validation
- **Optional count checks** using bundled presets or a requested threshold; enable these only when the task actually specifies a count constraint.
- `--manuscript` uses Pandoc's Markdown or LaTeX reader to match in-text keys and explicit `nocite` inclusions to the BibTeX file. `--min-count` counts cited keys present in the bibliography. A shared bibliography can have unused entries.
- Detailed reporting

**Usage**:
```bash
# Basic validation
python scripts/citations/validate_citations.py references.bib

# Validate against a venue standard (e.g., Nature, NeurIPS, Literature Review)
python scripts/citations/validate_citations.py references.bib --venue nature
python scripts/citations/validate_citations.py references.bib --venue neurips
python scripts/citations/validate_citations.py references.bib --venue review

# Validate with custom minimum citation count
python scripts/citations/validate_citations.py references.bib --min-count 40

# Check references against a written manuscript file (detect missing or unused citations)
python scripts/citations/validate_citations.py references.bib --manuscript paper.md

# Combined full validation
python scripts/citations/validate_citations.py references.bib \
  --venue nature \
  --manuscript paper.md \
  --check-dois \
  --report validation_report.json \
  --verbose
```

### scripts/citations/format_bibtex.py

Format and clean BibTeX files.

**Features**:
- Standardize formatting
- Sort entries (by key, year, author)
- Remove duplicates
- Validate syntax
- Fix common errors
- Enforce citation key conventions

**Usage**:
```bash
# Basic formatting
python scripts/citations/format_bibtex.py references.bib

# Sort by year (newest first)
python scripts/citations/format_bibtex.py references.bib \
  --sort year \
  --descending \
  --output sorted_refs.bib

# Remove duplicates
python scripts/citations/format_bibtex.py references.bib \
  --deduplicate \
  --output clean_refs.bib

# Complete cleanup
python scripts/citations/format_bibtex.py references.bib \
  --rekey \
  --deduplicate \
  --sort year \
  --output final_refs.bib
```

### scripts/citations/doi_to_bibtex.py

Quick DOI to BibTeX conversion.

**Features**:
- Fast single DOI conversion
- Batch processing
- Multiple output formats
- Clipboard support

**Usage**:
```bash
# Single DOI
python scripts/citations/doi_to_bibtex.py 10.1038/s41586-021-03819-2

# Multiple DOIs
python scripts/citations/doi_to_bibtex.py \
  10.1038/nature12345 \
  10.1126/science.abc1234 \
  10.1016/j.cell.2023.01.001

# From file (one DOI per line)
python scripts/citations/doi_to_bibtex.py --input dois.txt --output references.bib

# Copy to clipboard (macOS; use xclip on Linux)
python scripts/citations/doi_to_bibtex.py 10.1038/nature12345 | pbcopy
```
