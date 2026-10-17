# CAD skill source

The contents of this directory are based on the MIT-licensed
[`earthtojake/text-to-cad`](https://github.com/earthtojake/text-to-cad) skill at
`latest`, upstream commit `a499253845c717e5144471ca75f9eb0f90e7964f`.

The source skill assumes a host-provided CAD Viewer panel. Pi does not provide
that panel; this copy retains model generation, exports, and inspection, while
its global Pi MCP server stays disabled until the user enables it. Local
integration notes and runtime configuration are in `docs/default-profile.md`
and `docs/extensions.zh-CN.md`.
