# pi-markdown-preview-compat

Sole Pi registration entry for `pi-markdown-preview@0.14.0`.

The upstream implementation is preserved for terminal, browser, PDF, HTML, commands, rendering, and caching. The wrapper only hardens `preview_export(format="png")`:

1. Validate every reported output path against the PNG signature.
2. If the first render is invalid, delete the bad artifacts and retry once. The retry uses the valid raw screenshot cache written by upstream.
3. If the retry is still invalid, delete the artifacts and fail the tool call instead of returning false success.

This isolates the upstream Puppeteer `Uint8Array.toString("base64")` bug without modifying third-party source.
