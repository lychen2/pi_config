# Migration from CE or GL

## Identify the project

- `from manim import ...` identifies Manim Community Edition.
- `from manimlib import ...` identifies ManimGL.
- `import manimgx as m` identifies ManimGX.

Read the dependency manifest and render command as well as imports.
Preserve an explicitly requested engine. For migration, port one representative scene and inspect it before converting the rest.

## Manim Community Edition

Most public names and parameters follow CE. Test behavior after replacing the import.

| CE pattern | ManimGX usage |
| --- | --- |
| `from manim import *` | `import manimgx as m`; qualify names with `m.` |
| Internal imports such as `manim.utils...` | Import the supported name from the package root |
| `manim -ql scene.py MyScene` | `manimgx render scene.py MyScene -r 1280x720 --fps 30` |
| `MovingCameraScene` | `m.Scene`; every scene has a moving camera |
| `ApplyMethod(mob.scale, 2)` | `mob.animate.scale(2)` |
| LaTeX packages, templates, or `\def` | Rewrite using the supported math subset or native Typst |
| manim-slides `next_slide()` | `next_section()` and `manimgx present` |
| manim-voiceover context manager | Read GX voice configuration and `self.say(...)` documentation |

Split formulas into explicit arguments for stable part selection:
`m.MathTex("a^2", "+", "b^2", "=", "c^2")`.
Use `m.TransformMatchingTex` for matching formula parts.

The short frame side defaults to eight units. A vertical GX frame is wider in scene units than CE's default vertical frame.
Check layouts at the requested aspect ratio.
Updaters continue while their objects animate. Simultaneous animations can combine movements.
Check simulations and overlapping animations at representative times.

## ManimGL

GX documents CE compatibility. ManimGL migrations require API review beyond changing an import.
Check camera controls, shader-dependent objects, updaters, and custom mobjects against the GX reference.
Use `m.Create` for the GL `ShowCreation` operation where applicable.
Port one scene and verify its storyboard and video before claiming compatibility.

## Reference

Fetch https://manimgx.academa.ai/user-guide/coming-from-manim-ce/index.md for the current migration guide.
Use the installed release's diagnostics and public API when the website describes a newer version.
