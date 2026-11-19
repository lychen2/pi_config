# Open-source tools for laser direct-write systems

Select one tool for the current physical task. A useful AI workflow has executable inputs,
machine-readable results and an independent physical check; a Python API, differentiable
optimizer or MCP interface alone does not establish a working agent workflow. Prefer an
existing project script when it already answers the question.

## Primary candidate: Optiland for lens analysis

[Optiland](https://github.com/optiland/optiland) is the first candidate to validate for
prescription → ray tracing → spot/MTF/wavefront → tolerance analysis. Its official
[lithographic projection example](https://optiland.readthedocs.io/en/latest/examples/Tutorial_4e_Lithographic_Projection_System.html)
provides a concrete optical design/analysis precedent; the
[learning guide](https://optiland.readthedocs.io/en/latest/learning_guide.html) covers
prescription files, optimization and tolerancing. License:
[MIT](https://github.com/optiland/optiland/blob/master/LICENSE).

These are programmable optical-workflow examples, not proof of reliable OMP-driven lens
design. Treat Optiland as a candidate until the task-relevant example has run locally with
a recorded version and a checked physical result. A 248 nm projection-lens example is not
a validated 405 nm laser direct-write objective.

## Specialized candidate: DeepLens

Use [DeepLens](https://github.com/vccimaging/DeepLens) only when differentiable lens design
or optical/computational co-design is the research task. Its
[automated lens-design example](https://deeplens.readthedocs.io/en/latest/examples/automated_lens_design/)
links executable optimization to the paper *Curriculum learning for ab initio deep learned
refractive optics* (Nature Communications, 2024). This is an optimization precedent, not
an LLM-agent validation. License:
[Apache-2.0](https://github.com/vccimaging/DeepLens/blob/main/LICENSE).

## Task-specific additions

Consider these only when the named task occurs and the existing project cannot handle it:

- [LightPipes](https://opticspy.github.io/lightpipes/manual.html) for scalar beam/diffraction
  propagation; select a matching executable example and validate its sampling and observable.
- [python-control](https://python-control.readthedocs.io/en/latest/) for a measured/identified
  plant's servo response, stability or synchronization analysis.
- [KLayout](https://www.klayout.de/intro.html) when GDS/OASIS geometry processing is required.

These are on-demand choices, not a dependency bundle or locally validated agent workflows.

## Turn a candidate into a usable workflow

Start with the closest maintained, executable example, pin its version, and run a minimal
case relevant to the actual task. Preserve parameter units, prescription/configuration,
the invocation and numeric outputs, not only a rendered picture. Compare a consequential
observable to an analytic limit, reference prescription or measurement. For optimization,
also compare the result to the same physical baseline and constraints.

Only after that run should the project record the tool as validated for that task, with
its command, expected output and physical acceptance criterion. An existing LLM-use case
is useful evidence but not mandatory when the scripted workflow is reproducible and the
local run passes. Name the missing prerequisite when an example cannot run; do not turn
an advertised feature into a completed capability.

Couple tools only where the claim requires it: prescription/field → PSF or irradiance →
trajectory/timing → dose → material response → measured feature. Transfer units, planes,
phase and power normalization explicitly. Use `experimental-metrics.md` for the dose and
metrology definitions. No tool installation or MCP registration is implied by this file.

## Applicability

Optiland's capabilities depend on the selected release; use its implemented physics, not
a roadmap. DeepLens distinguishes public features from nonpublic extensions. Scalar
propagation needs sampling and approximation checks before it supports a focusing claim.

None of these tools supplies the complete resist, bake/development, metrology acquisition,
or direct-write hardware stack. Aerial image/PSF must be coupled to a calibrated applicable
material-response model; python-control is analysis software rather than a real-time motion
controller. Use the laboratory's existing controller, acquisition and calibration interfaces.
When redistributing code, follow the selected project's license; a process boundary alone
is not a license determination.
