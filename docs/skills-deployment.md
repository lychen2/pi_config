# Curated skill deployment

`install.mjs` uses `scripts/deploy-skills.mjs` as the single deployment implementation. Its `installedSkills` list contains 12 research skills and five utilities. Repository `skills/` is distribution source, not a project runtime skill root. Runtime copies are installed globally under the selected agent directory.

Known legacy directories are moved outside skill discovery to `skill-archives/<timestamp>/`. Managed copies in shared roots are also archived before installing the canonical global copy. Unlisted user skills remain untouched. Archived directories retain their original contents; restore them to their original roots to roll back. An incomplete release fails validation before migration. Deployment copies complete directories rather than merging stale files.

Default lazy loading uses `config/slim-skills-whitelist.json`: empty whitelist and inject arrays. With search available, only the bounded discovery router is injected; search returns metadata and explicit load retrieves instructions. Without search, descriptions and paths remain available as a fallback. This policy does not require injecting any skill body.

Routing boundaries:
- Compare linewidth distributions: statistical-analysis.
- Propagate exposure-dose uncertainty: uncertainty-and-units.
- Apply SPIE submission formatting: venue-templates.
- Plot already analyzed results: scientific-visualization.

Verification: `node --test scripts/deploy-skills.test.mjs` exercises migration, repeated installation, dry run, archival and preservation of a custom domain skill. `npm test --prefix extensions/pi-slim-skills` checks discovery-only and fallback behavior.

The September 13 host deployment found 20 skills across the two global discovery roots, no duplicate names, and 3,725 description characters (approximately 932 tokens at four characters per token). Seventeen are managed distribution skills; three existing user utilities remain. These counts exclude additional package-provided skills and are not a tokenizer measurement.
