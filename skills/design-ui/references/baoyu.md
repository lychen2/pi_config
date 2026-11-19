# Baoyu design integration

Use `design-ui` as the frontend design entry point. Load a Baoyu skill only when its
artifact format or chart guidance serves the requested result.

## Choose the deliverable

- Ordinary frontend implementation: use the real project framework and components.
  Use this workflow's direction, typography, motion, and inspection guidance.
- Editable visual exploration: load `claude-design` for side-by-side artboards,
  responsive studies, and canvas prototypes. When direction is open, compare 2–4
  meaningfully different compositions before polishing a complete page.
- Editable design system: load `claude-design-system` for the token library,
  brand book, real component previews, and reusable assets.
- Charts: load `dataviz` before choosing chart form, colors, or marks.
  For scientific plots, retain `scientific-visualization` as the domain workflow;
  use `dataviz` only for applicable visual guidance.

Use pattern search and visual-craft references through `internal-modules.md`.
`design-ui` owns one workflow and asks product-level questions when needed.
The user does not choose between supporting skills. A canvas does not require
loading unrelated libraries or starting a second direction process.

## Move a selected design into the frontend

A canvas uses `project/canvas.json` and `.dc.html` with a dedicated runtime.
Its exported HTML is a design reference, not an installed React or Vue component.
When implementation is part of the request:

1. Read the selected artboard and its design-system README and tokens.
2. Map typography, palette, spacing, layout, and interaction states to project tokens.
3. Reuse real project components and preserve existing routes and data behavior.
4. Implement responsive layout and the flow's loading, empty, error, and success states.
5. Inspect the running frontend and exercise the changed interactions.

Do not finish an implementation request with only a canvas or token page.
For an exploration-only request, deliver the requested designs without editing the app.

## Keep visual acceptance

Run each artifact's `check`, then inspect the actual rendered artifact when tools permit.
The check validates files; it does not establish layout quality or functioning scripts.
Inspect desktop and a narrow viewport and exercise the prototype's primary action.
State the exact evidence gap when rendering or interaction inspection is unavailable.
The installed local adapters replace the upstream prohibition on visual verification.

## Run locally

Resolve each script from its installed skill directory. Node 20+ is sufficient for
these two editors; no npm install or build is required.
Use the process tool and the `pi-processes` skill for a foreground `serve <root>`
process. Give each server a specific name; inspect existing process handles first.
Keep editors on localhost unless the user requests LAN sharing. An editor's comment
listener is optional; start it only while collecting feedback on that artifact.

## Source and maintenance

Installed from https://github.com/jimliu/baoyu-design at commit
`8398e52f3c58ab12e080e8579de66dcb02ea384a` (package version 2.5.0).
The clean upstream checkout is `$HOME/.local/share/baoyu-design`.
Active local copies live under `$HOME/.pi/agent/skills/`.
The installed modules are `claude-design`, `claude-design-system`, and `dataviz`.
They have `disable-model-invocation: true`; `design-ui` loads them internally.

Each installed skill includes `LOCAL-INTEGRATION.md`, the original `NOTICE.md`, and
`LICENSE`. Local changes cover routing, visual acceptance, process ownership, and
metadata. Preserve those changes when updating; review upstream changes before
copying a new version. The material has mixed licensing; the repository's MIT
license does not cover all skill text or reconstructed editors.
