# Optics Domain Rules

These rules define the optical-system and laser direct-write research profile. Load them
for optics tasks through `SKILL.md`; other research domains keep their own conventions.
The system under study is a laser direct-write / maskless lithography instrument, including
its optical, mechanical, electrical, control, metrology, and process subsystems.

## Research scope and model selection

- Start from the instrument requirement and a measurable bottleneck: spot quality over the
  writing field, dose uniformity, feature fidelity, positioning, throughput, or stability.
- Prioritize objectives, beam expanders, pupil relays, beam shaping, galvanometer scanning,
  focusing, interferometry, stage feedback, path planning, stitching, alignment, and exposure.
- Select the simplest model that resolves the observable: paraxial/ABCD for first-order
  layout and Gaussian transport; ray tracing for aberrations and tolerances; scalar
  diffraction for pupil-to-focus propagation where valid; vector diffraction for high-NA
  focusing when polarization matters. Use electromagnetic solvers for an actual
  subwavelength/material interaction, not as the default instrument-design route.
- Differentiable optics is an optimization method. Establish a valid forward model and
  manufacturing constraints first; automatic differentiation is neither optical novelty
  nor evidence that an AI agent can operate a package reliably.
- Use `references/optics/open-source-tools.md` for task-specific selection. Optiland is the
  first lens-analysis candidate to validate; DeepLens is for differentiable-design work.
  Prefer existing scripts and add other tools only for a demonstrated task. Record the
  version, physical inputs, command, numeric outputs and checked reference result before
  describing a workflow as locally validated.

## Physical conventions

- Use SI internally, with explicit input/output conversions and units on parameters, axes,
  tables, and tolerances. Distinguish vacuum wavelength from in-medium wavelength; phase
  index from group index; ordinary frequency from angular frequency; angles from lengths.
- Declare propagation axes, handedness, coordinate transforms, reference planes, and the
  pupil/field definitions shared by optical, stage, scanner, and camera coordinates.
- Declare phasor and Fourier conventions when fields are involved. Field amplitude,
  irradiance, optical power, pulse energy, and radiant exposure are distinct quantities.
- For `I(r)=I0 exp(-2 r²/w²)`, `w` is the intensity 1/e² radius. Diameter, FWHM, second-moment
  width, and Airy-disk radius require separate definitions. For an ideal paraxial Gaussian
  in a uniform medium, `z_R=π n w0²/λ0`; state the beam-quality and width model for real beams.
- Define `NA=n sin(θ)` in the specified object or image space. State wavelength, pupil
  illumination, coherence, polarization, focus criterion, and sampling for PSF/MTF results.
- Trace power at named planes and account for clipping, reflection, absorption, and any
  selected diffraction order. Check dimensions and a relevant analytic limit before using
  a numerical result as evidence. Separate discretization error from model error and
  measurement uncertainty.

## Optical design and beam delivery

- Report the prescription, materials/dispersion, apertures, stops, working distance, field,
  wavelength, chief-ray angles, and constraints relevant to the design. Preserve a realizable
  thickness, air gap, clear aperture, curvature, and alignment/tolerance budget.
- Evaluate on-axis and off-axis performance, field curvature, distortion, telecentricity,
  vignetting, RMS spot size, wavefront error, PSF/MTF, and encircled energy as the claim needs.
  A geometric spot diagram is not a diffraction PSF or a printed-feature resolution result.
- For scanning systems, include pupil conjugation, scan angle-to-position calibration,
  f-theta error where applicable, focus variation, spot ellipticity, and power/dwell changes
  across the field. Scanner optical deflection and mirror mechanical angle are not identical.
  Pupil conjugation controls pupil walk; image-space telecentricity additionally depends
  on the stop/pupil and scan-objective layout. Verify chief-ray angles across the field
  rather than inferring telecentricity from the presence of a 4f relay. Model separated
  X/Y galvanometer pivots instead of assuming a single shared pivot plane.
- For shaping/expansion, report beam width and quality, profile uniformity with its ROI and
  formula, delivered power, clipping, depth of focus, and sensitivity to alignment.
  Intensity images alone do not determine phase or coherent mode purity.

## Precision motion and metrology

- Distinguish command resolution, sensor resolution, accuracy, repeatability, tracking error,
  settling, stitching error, and overlay error. One cannot substitute for another.
- State the measured axis/coordinate frame, reference instrument, calibration, travel range,
  direction, scan speed, acceleration, load, sampling rate, and measurement bandwidth.
- For interferometry, specify wavelength/refractive-index correction, optical path multiplier,
  cosine and Abbe errors, reference geometry, dead path, and environmental conditions when
  consequential. An in-loop residual alone does not prove absolute positioning accuracy.
- Connect controller latency, synchronization and triggering to position-at-exposure, rather
  than judging only a stationary encoder trace. Report the warm-up, vibration, temperature,
  drift interval, and recalibration procedure needed to reproduce system performance.

## Exposure and process

- Evaluate exposure at the sample plane. For a linear one-photon exposure model,
  `H(x,y)=∫I(x,y,t)dt` has units J/m²; power is W and irradiance is W/m². A scanning dose model
  must include the trajectory, dwell/velocity, spot profile, modulation, and overlap.
  Once power is calibrated at the sample plane, do not apply the delivery transmission
  a second time. Constant peak line exposure is not constant printed CD when spot shape
  changes; the dose profile and material response determine the developed boundary.
- For pulsed sources record pulse energy, duration/shape, repetition rate, spatial profile,
  and overlap. Average power alone does not determine peak irradiance. Multiphoton or
  thermal-response processes need an appropriate response model rather than dose equivalence.
- Record resist/material, thickness, substrate, wavelength, focus, bake/development recipe,
  dose calibration, and batch conditions. Use measured response/contrast data or a cited
  applicable model; never invent material or process parameters.
- Separate optical resolution, latent-image prediction, and measured developed-feature size.
  Report CD bias/uniformity, line-edge roughness with estimator and sampling, depth/profile,
  overlay/stitching and process window only when measured or explicitly simulated.
- Compare resolution and throughput under compatible field, yield, process, and feature
  quality requirements; writing velocity alone is not area throughput.

## Ideas, experiments, and claims

- Judge ideas on physical novelty, structural/system innovation, performance breakthrough,
  and feasibility. New physics is not mandatory for a valuable optical-system contribution;
  make the actual contribution and its nearest prior work explicit.
- Use `references/optics/idea-discovery.md` for discovery and novelty checks. Search optical
  and instrumentation literature and relevant public engineering prior art, not only ML.
- Freeze the primary observable, definition/unit, matched baseline, acceptance threshold,
  operating conditions, independent repeat level, and uncertainty method before measuring.
  Use `references/optics/experimental-metrics.md` for the measurement template.
  Take numerical acceptance thresholds from requirements or explicitly proposed design
  goals. Derive independent repeat counts from precision/power and run-level variability;
  do not invent a universal percent improvement, fixed n, or multiple of expanded
  uncertainty as a pass rule.
- Treat field points, image pixels, repeated frames, specimens, rebuilds, and days as distinct
  replication levels. Include calibration uncertainty, drift, and correlated inputs as needed.
- Preserve raw measurements and recipes. Keep measured, simulated, derived, and illustrative
  evidence distinct. Software convergence, optimization loss, and rendered images are not
  substitutes for physical performance or fabrication results.

## Manuscripts, figures, and independent review

- Set `TARGET_VENUE` to the named journal and article type using `references/venues.md`.
  The default optical-system body is Theory → Design/Simulation → Experimental Setup →
  Results, preceded by Introduction and followed by Discussion and Conclusion. Letters may
  combine headings while preserving this evidence order; simulation-only work must not
  acquire an invented experiment section.
- Prioritize an optical-path/system drawing, spot/PSF/MTF or wavefront evidence, beam/mode
  distributions, spectra when relevant, metrology traces, and dose/process maps. Optimization
  or training curves serve an optimizer claim, not the main instrument-performance claim.
- Use `assets/journals/math_commands.tex` for consistently defined optical notation and units.
- Keep the existing independent-review backend, round limits, memory, score/verdict rule,
  and stopping conditions. Add physical correctness, unit consistency, measurement-chain
  traceability, and experimental reproducibility to the reviewer brief; see
  `references/review-and-revision.md`.

Physical laser, high-voltage, and motion-control operations follow the laboratory's
procedures and require explicit authorization; simulation and planning do not authorize
hardware operation or changes to interlocks.
