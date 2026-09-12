# pi-default-workbench

Default-profile functional workbench with one registration entry:

- `deferred-tools/`: adaptive, fast, and full project tool modes; adaptive uses hybrid BM25/local embedding discovery with up to three matches by default. Full omits tool search. SoL's `update_plan` replaces duplicate active Todo tools, and `obs_recall` remains available in every mode.
- `skill-search.ts`: metadata-first search over installed, model-invocable skills, followed by explicit loading with source and reference paths
- `browser/`: trusted Puppeteer browser control through the `browser` tool
- `todo/`: persistent Todo state, commands, and terminal panel
- `maestro/`: FFF search, background shell, and Git conflict tools
- `preview/`: validated Markdown Preview PNG exports

`index.ts` registers these surfaces plus the optional `/large` profile switcher in one package while preserving their existing tool names, commands, and configuration files. Large-profile beautification remains separate in `pi-large-beautify`, and Default profile context/network integration remains in `pi-context-bridge`.
