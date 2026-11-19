# Research and figures

Use two entries:

- `/skill:research <task>` for literature, experimental planning, result interpretation, statistics, optics, manuscript drafting and revision.
- `/skill:scientific-visualization <task>` for data plots and editable method/workflow diagrams.

Start at the stage the task needs. A request to revise a paragraph does not start a complete research project. Specialized methods load as references inside `research`; they do not create additional commands. SymPy, slides, CAD and document extraction remain separate tools for their distinct outputs.

## Workflow

The research entry adapts ARIS's question → experiment → result → claim → manuscript workflow to the OMP/Pi host. Keep review and revision rounds when the selected workflow calls for them. Review comments, scores and iteration records belong in project working files; manuscript prose and figure captions present the finished scientific result. Host delegation tools replace upstream-specific MCP calls without changing providers or models implicitly.

HERO supplies the default scope: work with the cooperating local operator, fix problems relevant to supported usage, and avoid speculative infrastructure. It does not remove scientific review. Existing taste guidance preserves the author's voice and natural expression.

Data figures retain the existing Matplotlib/Seaborn/Plotly methods, palettes, styles and export scripts. ARIS figure planning and editable schematics complement these resources. Publisher-specific checks apply when preparing the relevant submission.

## Laser direct-write and optical-system profile

`skills/research/CLAUDE.md` contains the domain rules and is explicitly loaded from the
research entry for optics tasks. The profile covers objectives/beam delivery, scanning,
precision positioning and metrology, exposure/material process, and integrated system
stability. Model selection starts from paraxial/Gaussian, ray and diffraction optics as
required by the observable. `skills/research/references/optics/open-source-tools.md`
prioritizes Optiland as the lens-analysis candidate to validate and reserves DeepLens for
differentiable-design work. LightPipes, python-control and KLayout are task-specific choices,
not a default dependency bundle. A tool is locally validated only after an executable
example produces numeric outputs checked against a physical reference.

| ARIS task | Current entry/reference | Optical behavior |
|---|---|---|
| idea-discovery / novelty-check | `research/references/optics/idea-discovery.md` | Physical novelty, structural innovation, performance breakthrough and feasibility; nearest-prior-art comparison |
| experiment-plan / result-to-claim | `research/references/experiments-and-claims.md`, `optics/experimental-metrics.md` | Defined units/planes, matched baseline, optical–motion–dose conditions, metrology, independent repeats and uncertainty |
| paper-write | `research/references/writing.md`, `venues.md` | Theory → Design/Simulation → Experimental Setup → Results, with Introduction/Discussion/Conclusion; article-type adaptations |
| paper-figure | `scientific-visualization/references/optical_system_figures.md` | Optical paths, spot/PSF/MTF/wavefront, beam/mode/spectrum, positioning and process evidence |
| independent review | `research/references/review-and-revision.md` | Physical correctness, units and reproducibility added to the brief; existing backend, round counts and stop rules retained |

`TARGET_VENUE` supports Optics Express, Optics Letters, Optica, JOSA A, JOSA B, IEEE Photonics
Journal and Laser & Photonics Reviews. The bundled `optics_article.tex` is a content
template, not a publisher style. `math_commands.tex` supplies 36 symbols and 11 unit macros;
the customizer embeds it in a standalone manuscript. Compilation requires amsmath, amssymb
and siunitx from the TeX distribution. Apply the journal's current official template and
article-type length rules before submission.

Examples:

```text
/skill:research 为 405 nm 激光直写系统规划跨场光斑、剂量均匀性与拼接误差实验，目标期刊 Optics Express。
/skill:research 核查瞳面中继与速度同步曝光方案的物理新意、结构创新、性能突破和可实现性。
/skill:scientific-visualization 按光路、PSF/MTF、定位误差、剂量—线宽结果规划论文图件。
```

Run from the research skill directory:

```bash
python3 scripts/venues/query_template.py --venue "Optics Express" --requirements
python3 scripts/venues/customize_template.py --venue "Optics Express" \
  --title "Laser direct-write system" --output paper.tex
```


## Deployment and recovery

`scripts/deploy-skills.mjs` deploys `research` and `scientific-visualization`. It retires ten separate entries: `research-decision`, `experimental-design`, `statistical-analysis`, `statistical-power`, `uncertainty-and-units`, `optics-research`, `paper-lookup`, `citation-management`, `scientific-writing`, and `venue-templates`.

Previous installed folders move to `<agentDir>/skill-archives/<timestamp>/<root-index>/`
(OMP: `~/.omp/agent/skill-archives/`; Pi: `~/.pi/agent/skill-archives/`). Restore the
corresponding folders to their original roots to recover an earlier installation.
Repository legacy sources remain available but are not deployed. Skills are discovered
and loaded on demand; deployment can select only `research` and `scientific-visualization`.

Run `/reload` after deployment. A fresh session also avoids carrying earlier loaded skill instructions into new work. The local GPT override is updated through `scripts/configure-model-system-prompt.mjs`; taste remains in its existing integration.

Resource loading, archival and renderer checks establish operational integration. They do not establish a measured improvement in research outcomes or model-generated figure aesthetics.
