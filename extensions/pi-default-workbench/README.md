# pi-default-workbench

Default-profile functional workbench with one registration entry:

- `deferred-tools/`: adaptive, fast, and full project tool modes with BM25 discovery
- `browser/`: trusted Puppeteer browser control through the `browser` tool
- `todo/`: persistent Todo state, commands, and terminal panel
- `maestro/`: FFF search, background shell, and Git conflict tools
- `preview/`: validated Markdown Preview PNG exports

`index.ts` registers these five surfaces in one package while preserving their existing tool names, commands, and configuration files. Large-profile beautification remains separate in `pi-large-beautify`, and Default profile context/network integration remains in `pi-context-bridge`.
