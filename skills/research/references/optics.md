# Optical systems and laser direct writing

A research guide for optical modelling, simulation, and measurement. Use the smallest part
that answers the question — a mechanism explanation, an illustrative simulation, and a
reproduction of a specific paper result are different jobs with different acceptance
criteria. A paper used as background does not turn a demo into a reproduction audit.

The default application is a laser direct-write instrument: objectives, expanders, pupil
relays, beam shaping, scanning/focusing, precision positioning, exposure control and
opto-mechatronic integration. Read `../CLAUDE.md` for the domain rules. Route idea discovery
and novelty to `optics/idea-discovery.md`, metric selection to
`optics/experimental-metrics.md`, and tool selection to `optics/open-source-tools.md`.

## Start from the question

1. Identify the requested result, the evidence available, and the observable that would
   support or refute the proposed explanation. Reuse the context the user supplied.
2. Ask only for missing information that changes the method or conclusion: wavelength,
   geometry, material, coherence, polarization, measured quantity, acceptance tolerance. If a
   symbolic or conditional answer suffices, proceed with explicit assumptions.
3. Define the model: geometry, coordinate system, propagation direction, wavelength range,
   medium, polarization, source coherence, and the measured observable. Distinguish vacuum
   from in-medium wavelength, phase from group index, field from intensity, and amplitude
   from power coefficients. Check the sign convention for a complex refractive index against
   attenuation in a passive medium.
4. Name the beam-width convention explicitly — Gaussian field radius, intensity 1/e² radius,
   standard deviation, and FWHM are different numbers. State whether numerical aperture
   refers to object or image space and which index it includes.
5. Identify the approximations (scalar, paraxial, thin element, far field, monochromatic,
   linear, homogeneous, lossless) and check that the geometry, bandwidth, angle, index
   contrast, or feature scale supports them. High-NA and subwavelength problems may require a
   vector model.

If reproduction is requested, identify the specific figure or claim, the required inputs,
the numerical conventions, and an acceptance criterion before implementing anything.

## Literature and paper reading

Read `optics/literature.md` for a survey, a paper reproduction, or a critical review of a
claim: framing around mechanism/observable/regime, searching primary sources and
counterevidence, comparing papers under identical physical conditions, the evidence table,
and the "read at the depth the task needs" ladder. Retrieval mechanics are in `literature.md`.

For reproduction: select one figure, equation, or result; extract inputs and conventions;
locate code and data with a version; define the acceptance metric; reproduce a minimal
benchmark before the full result. Flag guessed inputs and never tune undocumented parameters
until a plot matches.

## Derivation and simulation

Read `optics/verification.md` for the full check catalog. The essentials:

Begin with paraxial/ABCD and Gaussian transport for first-order layout, then ray tracing
for lens/scan aberrations and tolerances, or diffraction for field-to-focus observables.
High-NA vector focusing is not automatically a full-device FDTD problem. Use FDTD/FEM or
mode solvers when the actual material/feature scale and observable require them.

1. Write the governing equation with boundary/initial conditions; define symbols and units.
   Do not silently mix angular frequency with ordinary frequency, or radians with degrees.
2. Derive under stated assumptions. If using a computer algebra system, preserve domain
   assumptions and check branches, singularities, and the original equation after
   simplification.
3. Check dimensions, then a known limit relevant to the model: zero propagation distance,
   normal incidence, zero loss, weak perturbation.
4. Check conservation or a justified balance law. In passive systems account for reflected,
   transmitted, absorbed, and other modeled channels; power transmission may need impedance
   or flux factors and is not universally the squared field coefficient.
5. Choose a benchmark appropriate to the implemented physics — Gaussian-beam paraxial
   propagation, an aperture diffraction pattern, a Fresnel interface, a known waveguide mode —
   and define the error observable and tolerance before accepting the result.

Checks to select per method:

| Method | Checks |
|---|---|
| Paraxial / Gaussian transport | ABCD and refractive-index conventions, real-beam width/M² model, aperture clipping, reference planes, validity of the paraxial approximation |
| Ray tracing / differentiable lens design | prescription/material data, stops/vignetting, field and pupil sampling, aberrations/OPD/MTF, manufacturable bounds, tolerances, gradient checks against perturbations when gradients drive the result |
| FFT propagation / diffraction | spatial pitch and domain size, frequency-grid units, FFT shifts/scaling, wraparound, aperture truncation, input/output sampling, power normalization; vector model if polarization/high NA requires it |
| Motion / metrology | plant identification, sensor scale and coordinates, sampling/latency, stability margins, trigger synchronization, in-loop versus independent reference, drift/environment |
| Dose / process | sample-plane irradiance integrated along actual trajectory, pulse and line overlap, dose units, material-response calibration, independent feature/process validation |
| FDTD / FEM / eigenmodes, when required | spatial/temporal refinement, material dispersion/loss, boundary/domain convergence, normalization, residual decay and mode tracking |

Vary sampling/mesh and domain/boundary choices separately so apparent convergence cannot
hide a truncation error, and report the change in the target observable rather than solver
success. A converged discretization can still represent the wrong physics. Record material
data provenance, temperature, valid wavelength range, and interpolation choices; do not
invent dispersion coefficients to fill missing data. Separate solver error, model
approximation, measurement uncertainty, and parameter uncertainty.

Symbolic work: use the `sympy` skill for derivations. Units and uncertainty propagation:
`uncertainty-and-units.md`.

## Measurement and analysis

- **Repeats.** Separate independent experimental repeats from repeated frames, pixels, or
  technical measurements; the replicate level is what the statistics see.
- **Chain.** Include calibration, drift, background, detector linearity and saturation, and
  alignment sensitivity when they affect the result.
- **Raw data.** Keep raw measurements immutable; save processed data separately with units and
  an explicit transformation history. Retain rejected data with reasons; never silently drop
  outliers or select favorable runs.
- **Attribution.** Test competing physical explanations and the relevant controls before
  attributing a trend to the proposed mechanism. Report effect sizes, uncertainty, and
  unresolved confounders.
- **Instruments.** Match the forward model to what the instrument measures, including
  exposure/integration, response bandwidth, instrument function, or point-spread function.
- **Provenance.** Save the reproduction command, configuration, software versions, random
  seed, and actual check outputs using the project's existing conventions; mark outputs as
  measured, simulated, derived, or illustrative.


Use `optics/experimental-metrics.md` for efficiency, loss, spectral/control bandwidth,
spot/MTF/WFE, SNR, mode purity, positioning/overlay, stability, exposure and printed-feature
metrics. It includes a measurement ledger and an optical–motion–dose experiment block.
Design and n: `decisions-and-design.md` and `statistics.md`. Uncertainty budget:
`uncertainty-and-units.md`.

## Safety boundary

Laser, high-voltage, and motion-control actions are physical operations requiring explicit
authorization and the lab's procedures. Do not infer safe exposure from nominal power alone,
operate hardware implicitly, or bypass interlocks.

## Delivering the result

Lead with the requested result or artifact.

- Describe the implemented model directly: dimensions, propagation method, medium,
  approximations, observable. Put shared conditions in the methods or parameter area once; put
  a specific limitation beside the affected result.
- Distinguish paper-reported values from chosen example inputs at the point of use — label a
  slider "Example wavelength" and cite the source for a paper-reported parameter. A generic
  disclaimer cannot compensate for misleading provenance.
- Label conceptual drawings as schematics. Generated pictures are not evidence, and never a
  substitute for measured data.
- Omit routine process commentary. Necessary editorial notes belong in native comments or the
  conversation handoff, not in captions, footnotes, tooltips, or collapsible panels.
  Scientific limitations stay visible where they affect interpretation.
- For an unresolved research question, name the next measurement or calculation that would
  settle it.

Figures: the `scientific-visualization` skill. Manuscript: `writing.md` and `venues.md`.
