# Source and Pi packaging

- Upstream: https://github.com/alchaincyf/huashu-motion
- Revision: `52467f99c602b76ba86d511d37acdfe93fa1e16e`
- Package version: `0.3.1`
- License: MIT; see `LICENSE` and `THIRD_PARTY.md`.

The skill instructions and references come from the upstream skill directory.
The description is localized for the Pi command menu.
The update section uses the maintained repository’s deployment process.
The CLI, studio, runtime, templates, fonts, and examples are bundled under `.runtime/`.
The launcher uses this local bundle without an automatic npm installation.
Two CLI reference paths point to this skill’s `references/` directory.
All other imported runtime files retain their upstream contents.

Run `bin/om doctor` to inspect available rendering tools.
Node 22 or newer is required. Rendering also needs a compatible browser and FFmpeg.
Deploy updates through the repository’s skill deployer, which archives the previous installed directory.
The bundled runtime has no npm dependencies. Optional voice, sample packs, and rendering tools follow the upstream workflow.
