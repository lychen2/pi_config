# Curated skill deployment

`install.mjs` uses `scripts/deploy-skills.mjs` as the single deployment implementation. Its `installedSkills` list defines the managed release skills, including `manimgx`. Repository `skills/` is distribution source, not a project runtime skill root. Runtime copies are installed globally under the selected agent directory.

Known legacy directories are moved outside skill discovery to `skill-archives/<timestamp>/`. Managed copies in shared roots are also archived before installing the canonical global copy. Unlisted user skills remain untouched. Archived directories retain their original contents; symbolic links are copied with their contents before removal to keep backups readable. Restore the archived directories to their original roots to roll back. An incomplete release fails validation before migration. Deployment copies complete directories rather than merging stale files.

Default lazy loading uses `config/slim-skills-whitelist.json`: empty whitelist and inject arrays. With search available, only the bounded discovery router is injected; search returns metadata and explicit load retrieves instructions. Without search, descriptions and paths remain available as a fallback. This policy does not require injecting any skill body.

`manimgx` replaces `manim-composer`, `manimce-best-practices`, and `manimgl-best-practices` in both global roots. It retains scene planning and adds the ManimGX inspect/render workflow. Existing CE or GL projects retain their engine unless migration is requested. The skill uses Python 3.13 or 3.14; its runtime is installed on demand, outside the Pi installer. After deployment, run `/reload` and use `/skill:manimgx` to load it. The previous skill directories remain in the archive.

Routing boundaries:
- Compare linewidth distributions: statistical-analysis.
- Propagate exposure-dose uncertainty: uncertainty-and-units.
- Apply SPIE submission formatting: venue-templates.
- Plot already analyzed results: scientific-visualization.

Verification: `node --test scripts/deploy-skills.test.mjs` exercises migration, repeated installation, dry run, archival and preservation of a custom domain skill. `npm test --prefix extensions/pi-slim-skills` checks discovery-only and fallback behavior.

The September 13 host deployment found 20 skills across the two global discovery roots, no duplicate names, and 3,725 description characters (approximately 932 tokens at four characters per token). Seventeen are managed distribution skills; three existing user utilities remain. These counts exclude additional package-provided skills and are not a tokenizer measurement.
