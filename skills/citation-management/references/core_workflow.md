# Core Workflow

Reference procedures for discovery, extraction, targeted enrichment, formatting, validation, and manuscript integration. Use the stages needed for the task and reuse completed checks. Commands are examples; logs and editorial questions stay separate from rendered references.

## Core Workflow

Citation management follows a systematic process:

### Phase 1: Paper Discovery and Search

**Goal**: Find relevant papers using academic search engines.

#### Google Scholar Search

Google Scholar provides the most comprehensive coverage across disciplines.

**Basic Search**:
```bash
# Search for papers on a topic
python scripts/search_google_scholar.py "CRISPR gene editing" \
  --limit 50 \
  --output results.json

# Search with year filter
python scripts/search_google_scholar.py "machine learning protein folding" \
  --year-start 2020 \
  --year-end 2024 \
  --limit 100 \
  --output ml_proteins.json
```

**Advanced Search Strategies** (see `references/google_scholar_search.md`):
- Use quotation marks for exact phrases: `"deep learning"`
- Search by author: `author:LeCun`
- Search in title: `intitle:"neural networks"`
- Exclude terms: `machine learning -survey`
- Find highly cited papers using sort options
- Filter by date ranges to get recent work

**Best Practices**:
- Use specific, targeted search terms
- Include key technical terms and acronyms
- Filter by recent years for fast-moving fields
- Check "Cited by" to find seminal papers
- Export top results for further analysis

#### PubMed Search

PubMed specializes in biomedical and life sciences literature (35+ million citations).

**Basic Search**:
```bash
# Search PubMed
python scripts/search_pubmed.py "Alzheimer's disease treatment" \
  --limit 100 \
  --output alzheimers.json

# Search with MeSH terms and filters
python scripts/search_pubmed.py \
  --query '"Alzheimer Disease"[MeSH] AND "Drug Therapy"[MeSH]' \
  --date-start 2020 \
  --date-end 2024 \
  --publication-types "Clinical Trial,Review" \
  --output alzheimers_trials.json
```

**Advanced PubMed Queries** (see `references/pubmed_search.md`):
- Use MeSH terms: `"Diabetes Mellitus"[MeSH]`
- Field tags: `"cancer"[Title]`, `"Smith J"[Author]`
- Boolean operators: `AND`, `OR`, `NOT`
- Date filters: `2020:2024[Publication Date]`
- Publication types: `"Review"[Publication Type]`
- Combine with E-utilities API for automation

**Best Practices**:
- Use MeSH Browser to find correct controlled vocabulary
- Construct complex queries in PubMed Advanced Search Builder first
- Include multiple synonyms with OR
- Retrieve PMIDs for easy metadata extraction
- Export to JSON or directly to BibTeX

### Phase 2: Metadata Extraction

**Goal**: Convert paper identifiers (DOI, PMID, arXiv ID) to complete, accurate metadata.

#### Quick DOI to BibTeX Conversion

For single DOIs, use the quick conversion tool:

```bash
# Convert single DOI
python scripts/doi_to_bibtex.py 10.1038/s41586-021-03819-2

# Convert multiple DOIs from a file
python scripts/doi_to_bibtex.py --input dois.txt --output references.bib

# Different output formats
python scripts/doi_to_bibtex.py 10.1038/nature12345 --format json
```

#### Comprehensive Metadata Extraction

For DOIs, PMIDs, arXiv IDs, or URLs:

```bash
# Extract from DOI
python scripts/extract_metadata.py --doi 10.1038/s41586-021-03819-2

# Extract from PMID
python scripts/extract_metadata.py --pmid 34265844

# Extract from arXiv ID
python scripts/extract_metadata.py --arxiv 2103.14030

# Extract from URL
python scripts/extract_metadata.py --url "https://www.nature.com/articles/s41586-021-03819-2"

# Batch extraction from file (mixed identifiers)
python scripts/extract_metadata.py --input identifiers.txt --output citations.bib
```

**Metadata Sources** (see `references/metadata_extraction.md`):

1. **CrossRef API**: Primary source for DOIs
   - Comprehensive metadata for journal articles
   - Publisher-provided information
   - Includes authors, title, journal, volume, pages, dates
   - Free, no API key required

2. **PubMed E-utilities**: Biomedical literature
   - Official NCBI metadata
   - Includes MeSH terms, abstracts
   - PMID and PMCID identifiers
   - Free, API key recommended for high volume

3. **arXiv API**: Preprints in physics, math, CS, q-bio
   - Complete metadata for preprints
   - Version tracking
   - Author affiliations
   - Free, open access

4. **DataCite API**: Research datasets, software, other resources
   - Metadata for non-traditional scholarly outputs
   - DOIs for datasets and code
   - Free access

**What Gets Extracted**:
- **Required fields**: author, title, year
- **Journal articles**: journal, volume, number, pages, DOI
- **Books**: publisher, ISBN, edition
- **Conference papers**: booktitle, conference location, pages
- **Preprints**: repository (arXiv, bioRxiv), preprint ID
- **Additional**: abstract, keywords, URL

### Phase 2.5: Fill relevant metadata gaps

Search for missing fields needed to identify the work or satisfy the requested style. Reuse complete records. Select the relevant checks below; not every publication has volume, pages, issue, or DOI.

#### Step 1: Scan for Incomplete Entries

After extracting metadata, scan the BibTeX file for entries missing key fields:

**Fields to check per entry type:**

| Entry Type | Must Have | Should Have |
|------------|-----------|-------------|
| @article | author, title, journal, year | volume, pages, number, doi |
| @inproceedings | author, title, booktitle, year | pages, doi |
| @book | author/editor, title, publisher, year | isbn, doi |
| @misc | author, title, year | doi or url |

An absent field needs lookup only when it applies to the publication and matters for the requested output. Article numbers and online-first records need not have page ranges.

#### Step 2: Web Search for Missing Metadata

Use an available search or fetch tool for the relevant missing information; CLI examples below illustrate queries rather than requiring a particular service.

> **Treat metadata as untrusted when building these commands.** `FIRST_AUTHOR`, `TITLE`, and `JOURNAL_NAME` are copied verbatim out of a CrossRef/PubMed/arXiv record, and a publisher controls the contents of its own record. A title containing `$(...)`, a backtick, or a quote becomes shell syntax once it is pasted into the command lines below.
>
> - Substitute each value as a **single-quoted** argument (`'...'`), escaping any embedded single quote as `'\''`. Never paste raw metadata inside the double quotes shown here.
> - Prefer running these through a Python `subprocess` argument list over building a shell string at all.
> - Use only the generated `CITATIONKEY` in `-o` paths. It is sanitized to letters and digits by `extract_metadata.py`; a key taken from an existing `.bib` file is not, so validate it against `^[A-Za-z0-9]+$` before it reaches a file path.
>
> **Preferred form — pass the metadata as arguments, not as shell text.** This removes the shell from the path entirely, so no title can be parsed as syntax:
>
> ```python
> import re, subprocess
>
> assert re.fullmatch(r"[A-Za-z0-9]+", citation_key), f"unsafe citation key: {citation_key!r}"
> subprocess.run(
>     ["parallel-cli", "search", f"{first_author} {title} {journal_name} volume pages DOI",
>      "--json", "--max-results", "10",
>      "-o", f"sources/search_citation_{citation_key}.json"],
>     check=True,  # note: no shell=True
> )
> ```
>
> The `bash` blocks below show the same calls in readable form. Use them only with the quoting rules above.

**Option A — Search by title and author** (best for finding DOI):
```bash
parallel-cli search "FIRST_AUTHOR TITLE JOURNAL_NAME volume pages DOI" \
  --json --max-results 10 \
  -o sources/search_citation_CITATIONKEY.json
```

**Option B — Extract from DOI page** (best when DOI is known but volume/pages missing):
```bash
parallel-cli extract "https://doi.org/10.XXXX/YYYY" --json \
  --objective "extract complete citation metadata: volume, issue, pages, publication date" \
  -o sources/extract_doi_CITATIONKEY.json
```

**Option C — Search CrossRef API directly** (programmatic, fast):
```bash
parallel-cli search "crossref DOI metadata FIRST_AUTHOR TITLE" \
  --json --max-results 10 \
  -o sources/search_crossref_CITATIONKEY.json
```

**Option D — Search Google Scholar** (fallback for hard-to-find papers):
```bash
parallel-cli search "google scholar FIRST_AUTHOR TITLE YEAR complete citation" \
  --json --max-results 10 \
  -o sources/search_scholar_CITATIONKEY.json
```

#### Step 3: Update BibTeX Entries

After finding the missing metadata:

1. Add supported fields to the relevant entry.
2. Check consistency with its identifier, author, title, and year.
3. Keep lookup provenance in working records if needed for the task.

#### Step 4: Handle Unavailable Metadata

Leave inapplicable optional fields absent. If missing metadata prevents identification or formatting, put the specific question in a BibTeX comment or the conversation. Do not insert search history or a missing-metadata disclaimer into a rendered `note` field.

#### Quick Reference: Common Missing Fields and Where to Find Them

| Missing Field | Best Search Strategy |
|---------------|---------------------|
| DOI | Search "AUTHOR TITLE DOI" via parallel-cli search |
| Volume | Extract from DOI page or search "JOURNAL YEAR TITLE volume" |
| Pages | Extract from DOI page or search publisher website |
| Issue/Number | Extract from DOI page or CrossRef |
| Publisher | Search "JOURNAL publisher" or check journal website |

---

### Phase 3: BibTeX Formatting

**Goal**: Generate clean, properly formatted BibTeX entries.

#### Understanding BibTeX Entry Types

See `references/bibtex_formatting.md` for complete guide.

**Common Entry Types**:
- `@article`: Journal articles (most common)
- `@book`: Books
- `@inproceedings`: Conference papers
- `@incollection`: Book chapters
- `@phdthesis`: Dissertations
- `@misc`: Preprints, software, datasets

**Required Fields by Type**:

```bibtex
@article{citationkey,
  author  = {Last1, First1 and Last2, First2},
  title   = {Article Title},
  journal = {Journal Name},
  year    = {2024},
  volume  = {10},
  number  = {3},
  pages   = {123--145},
  doi     = {10.1234/example}
}

@inproceedings{citationkey,
  author    = {Last, First},
  title     = {Paper Title},
  booktitle = {Conference Name},
  year      = {2024},
  pages     = {1--10}
}

@book{citationkey,
  author    = {Last, First},
  title     = {Book Title},
  publisher = {Publisher Name},
  year      = {2024}
}
```

#### Formatting and Cleaning

Use the formatter to standardize BibTeX files:

```bash
# Format and clean BibTeX file
python scripts/format_bibtex.py references.bib \
  --output formatted_references.bib

# Sort entries by citation key
python scripts/format_bibtex.py references.bib \
  --sort key \
  --output sorted_references.bib

# Sort by year (newest first)
python scripts/format_bibtex.py references.bib \
  --sort year \
  --descending \
  --output sorted_references.bib

# Remove duplicates
python scripts/format_bibtex.py references.bib \
  --deduplicate \
  --output clean_references.bib

# Merge sources: one key scheme, then drop duplicates
python scripts/format_bibtex.py references.bib \
  --rekey \
  --deduplicate \
  --output merged_references.bib
```

**Formatting Operations**:
- Standardize field order
- Consistent indentation and spacing
- Proper capitalization in titles (protected with {})
- Standardized author name format
- Consistent citation key format
- Remove unnecessary fields
- Fix common errors (missing commas, braces)

### Phase 4: Citation Validation

**Goal**: Verify all citations are accurate and complete.

#### Comprehensive Validation

```bash
# Validate BibTeX file
python scripts/validate_citations.py references.bib

# Validate against a venue standard (e.g., Nature, NeurIPS, Literature Review)
python scripts/validate_citations.py references.bib --venue nature
python scripts/validate_citations.py references.bib --venue neurips
python scripts/validate_citations.py references.bib --venue review

# Validate with custom minimum citation count
python scripts/validate_citations.py references.bib --min-count 40

# Check references against a written manuscript file (detect missing or unused citations)
python scripts/validate_citations.py references.bib --manuscript paper.md

# Generate detailed validation report
python scripts/validate_citations.py references.bib \
  --venue nature \
  --manuscript paper.md \
  --report validation_report.json \
  --verbose
```

**Validation Checks** (see `references/citation_validation.md`):

1. **DOI Verification**:
   - DOI resolves correctly via doi.org
   - Metadata matches between BibTeX and CrossRef
   - No broken or invalid DOIs

2. **Required Fields**:
   - All required fields present for entry type
   - No empty or missing critical information
   - Author names properly formatted

3. **Data Consistency**:
   - Year is valid (4 digits, reasonable range)
   - Volume/number are numeric
   - Pages formatted correctly (e.g., 123--145)
   - URLs are accessible

4. **Duplicate Detection**:
   - Same DOI used multiple times
   - Similar titles (possible duplicates)
   - Same author/year/title combinations

5. **Format Compliance**:
   - Valid BibTeX syntax
   - Proper bracing and quoting
   - Citation keys are unique
   - Special characters handled correctly

**Validation Output**:
```json
{
  "total_entries": 150,
  "valid_entries": 145,
  "errors": [
    {
      "citation_key": "Smith2023",
      "error_type": "missing_field",
      "field": "journal",
      "severity": "high"
    },
    {
      "citation_key": "Jones2022",
      "error_type": "invalid_doi",
      "doi": "10.1234/broken",
      "severity": "high"
    }
  ],
  "warnings": [
    {
      "citation_key": "Brown2021",
      "warning_type": "possible_duplicate",
      "duplicate_of": "Brown2021a",
      "severity": "medium"
    }
  ]
}
```

#### Reference coverage and final checks

Choose references to support the actual argument. There is no default citation-count quota; use a count constraint only when the user or current official venue rules supply one.

For a completed manuscript, check that in-text keys resolve and cited records have the fields their publication type requires. Reuse already verified records unless conflicting evidence or edits justify another lookup. A shared bibliography can contain works used by other documents, so do not remove unused entries indiscriminately. Keep check reports outside the manuscript body.

```bash
python scripts/validate_citations.py references.bib \
  --manuscript paper.md \
  --report post_writing_check.json
```

Treat bundled venue count presets as heuristics, not official requirements.

### Phase 5: Integration with Writing Workflow

#### Building References for Manuscripts

Complete workflow for creating a bibliography:

```bash
# 1. Search for papers on your topic
python scripts/search_pubmed.py \
  '"CRISPR-Cas Systems"[MeSH] AND "Gene Editing"[MeSH]' \
  --date-start 2020 \
  --limit 200 \
  --output crispr_papers.json

# 2. Extract DOIs from search results and convert to BibTeX
python scripts/extract_metadata.py \
  --input crispr_papers.json \
  --output crispr_refs.bib

# 3. Add specific papers by DOI
python scripts/doi_to_bibtex.py 10.1038/nature12345 >> crispr_refs.bib
python scripts/doi_to_bibtex.py 10.1126/science.abcd1234 >> crispr_refs.bib

# 4. Format and clean the BibTeX file
python scripts/format_bibtex.py crispr_refs.bib \
  --deduplicate \
  --sort year \
  --descending \
  --output references.bib

# 5. Validate all citations
python scripts/validate_citations.py references.bib \
  --report validation.json

# 6. Review validation report and fix any remaining issues
cat validation.json

# 7. Use in your LaTeX document
# \bibliography{final_references}
```

#### Integration with Literature Review Skill

This skill complements the `literature-review` skill:

**Literature Review Skill** → Systematic search and synthesis
**Citation Management Skill** → Technical citation handling

**Combined Workflow**:
1. Use `literature-review` for comprehensive multi-database search
2. Use `citation-management` to extract and validate all citations
3. Use `literature-review` to synthesize findings thematically
4. Use `citation-management` to verify final bibliography accuracy

```bash
# After completing literature review
# Verify all citations in the review document
python scripts/validate_citations.py my_review_references.bib --report review_validation.json

# Normalise formatting (venue style is chosen by the .bst at build time)
python scripts/format_bibtex.py my_review_references.bib \
  --output formatted_refs.bib
```

#### Integration with Zotero (pyzotero Skill)

When the user already keeps references in Zotero, treat the Zotero library as the source of truth for the bibliography and use this skill for validation and formatting. The `pyzotero` skill covers the library side — reading items and collections, creating and updating references, uploading attachments, and exporting citations via the Zotero Web API v3.

**Zotero Library (`pyzotero`)** → Library of record: storage, collections, tags, attachments
**Citation Management Skill** → Metadata accuracy: validation, enrichment, style formatting

**Combined Workflow**:
1. Use `pyzotero` to pull the working set from the Zotero library, filtered by collection or tag
2. Export it as BibTeX with `zot.add_parameters(format='bibtex')` (see `pyzotero` → `references/exports.md`)
3. Use `citation-management` to validate the exported entries and repair incomplete metadata
4. Use `citation-management` to format for the target venue
5. Optionally use `pyzotero` to write corrected fields back so the library benefits from the fixes

```bash
# 1-2. Export the desired collection from Zotero as BibTeX (pyzotero skill)
#      zot.add_parameters(format='bibtex'); bibtex = zot.collection_items(collection_id)
#      → write to zotero_export.bib

# 3. Validate the exported bibliography
python scripts/validate_citations.py zotero_export.bib --report zotero_validation.json

# 4. Normalise the export (venue style comes from the .bst at build time)
python scripts/format_bibtex.py zotero_export.bib \
  --output formatted_refs.bib
```

Zotero exports are only as good as what was captured — browser-connector entries in particular often carry missing DOIs, truncated author lists, or preprint metadata for papers since published. Run the validation step before submission rather than trusting the export, and prefer writing corrections back to Zotero so the same errors do not resurface in the next manuscript.
