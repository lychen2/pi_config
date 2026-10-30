# Calling these APIs

Mechanics that apply to all eleven databases in this skill. Endpoints and parameters are in each database's own reference file.

## Why curl

Use `curl` via Bash — that is what this skill's `allowed-tools` grants, and a summarizing fetch tool cannot serve most of these:

- **Custom headers.** Semantic Scholar authenticates with `x-api-key`; CORE uses `Authorization: Bearer $CORE_API_KEY`.
- **POST bodies.** Semantic Scholar's `/paper/batch`, `/recommendations/papers/`, and CORE's complex search are POST with a JSON body.
- **Raw structured payloads.** arXiv returns Atom **XML**; PMC eFetch and Europe PMC `fullTextXML` return JATS **XML**; the PMC OA Web Service has no JSON option. `curl` returns the exact bytes the bundled parsers need.
- **Seeing the real failure.** These APIs signal failure inside a 200 body; `curl` shows you body and status, where a summarizing tool hides both.

With a header and a JSON accept:

```bash
curl -s -H "Accept: application/json" -H "x-api-key: $S2_API_KEY" \
  "https://api.semanticscholar.org/graph/v1/paper/DOI:10.1038/nature12373?fields=title,year,citationCount,tldr"
```

## Request guidelines

- **URL-encode query parameters — including brackets.** DOIs contain `/` (encode as `%2F`); titles and queries contain spaces, quotes and parentheses. With `curl`, `--get` plus `--data-urlencode` is the safe way to pass a search term. Never interpolate an unescaped user string into a URL or shell command.
- **Square brackets need `%5B`/`%5D`** for a second reason: curl reads a literal `[` as a globbing range and **exits 3 before sending**, which is how the arXiv date-range syntax silently fetches nothing. Prefer the encoded form over `curl -g`; it also survives being pasted into a fetch tool, a Python client, or a non-curl shell.
- **Serialize requests to rate-limited APIs.** NCBI (PubMed, PMC): 3 req/s without key, 10 with. arXiv: **1 request per 3 seconds**. Crossref: 5 req/s public, 10 with `mailto`.
- **Parallelize across *different* open APIs only.** OpenAlex, Crossref, Semantic Scholar, Europe PMC and Unpaywall can run concurrently; keep a handful in flight, and never parallelize against the same rate-limited host.
- **Bound total work.** Start with a count or first page. Don't continue past ~1,000 records or ~50 calls without confirming a short plan with the user — `scripts/paginate.py`'s defaults enforce exactly these bounds. For truly bulk needs, point to the database's snapshot or dump (Unpaywall, OpenAlex and CORE all offer one).
- **On HTTP 429/503**, wait briefly and retry once. Semantic Scholar without a key hits this often — one retry, then tell the user a key would help.

## Error recovery

1. **Check whether it actually failed.** A 200 is not success here: no `<body>` in JATS, an entry titled `Error` from arXiv, `errCode` in a Europe PMC body, `status: "no articles found"` from bioRxiv all arrive as 200.
2. **Check the identifier format** against the table in `SKILL.md`. A PMID won't work in arXiv; an arXiv ID won't work in PubMed directly.
3. **Convert or try an alternative identifier** — if a DOI fails in one database, try the title, or convert to PMID/PMCID via the PMC ID Converter.
4. **Try a different database** — a CS paper with nothing in PubMed belongs in Semantic Scholar or OpenAlex; for full text, Europe PMC's honest 404 beats eFetch's bodyless 200.
5. **Report the failure** — which database failed, the error, what you tried instead. A reported gap is useful; a silent one is misleading.

## Completeness and reproducibility

For exhaustive retrievals, or any result that feeds downstream analysis:

1. **Count first** when the API exposes a total (`count`, `total-results`, `meta.count`, `totalHits`, `hitCount`). Some endpoints expose none — bioRxiv DOI and N-most-recent lookups among them — and that is a documented state to report, not a total to invent.
2. **Paginate deterministically** — offset, cursor or token per the reference file — in a stable sort order where possible, stepping by the page size the response reported, never an assumed one.
3. **Reconcile counts** — expected total vs retrieved total, pages fetched, and any local filtering applied.
4. **Fail visible, not plausible** — if pagination stopped early or counts disagree, say so before drawing a conclusion.

`scripts/paginate.py` does all four for the APIs it covers, and distinguishes "you set a bound" from "records went missing". For a targeted lookup, still record endpoint, parameters and access date so the single result can be repeated.

## Provenance and keys

Check the environment first (`$NCBI_API_KEY`, `$S2_API_KEY`, `$CORE_API_KEY`, `$OPENALEX_API_KEY`). If a key is absent and a `.env` exists in the working directory, read **only** those four variables — do not load the file wholesale into the environment or into context, since it routinely holds unrelated secrets. If a key is missing, proceed at the lower rate limit and tell the user which key would help and where to get it; don't stall.

Never echo a key, and never let one reach your output. NCBI and CORE accept the key in the query string (`api_key=`), OpenAlex and Crossref take `mailto=`, and Unpaywall takes `email=` — so the URL you fetched *is* a credential — `scripts/paginate.py` redacts `api_key`, `email`, `mailto` and `tool` values from the provenance it emits, and any URL you record by hand needs the same treatment.
