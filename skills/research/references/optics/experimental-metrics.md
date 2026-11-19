# Optical-system and direct-write measurement template

Use with `../experiments-and-claims.md` and `../decisions-and-design.md`. Select the metrics
that decide the claim; this catalog is not a request to measure every quantity. Record the
formula, unit, reference plane, estimator and conditions before acquisition. Use SI in
calculations and explicit conversions in reported units.

## Metric definitions

| Quantity | Definition / unit | Required conditions and interpretation |
|---|---|---|
| Optical efficiency | `η=P_useful/P_reference`, dimensionless or % | Name both planes, aperture/ROI, wavelength, polarization and selected order/mode. Useful throughput differs from total transmission; do not normalize away clipping. |
| Optical loss | `L=-10 log10(P_out/P_in)` in dB; propagation attenuation in dB/m if relevant | Name power planes and background subtraction. Use power ratios; `20 log10` applies to compatible amplitude ratios, not powers. |
| Spectral bandwidth | `Δλ` in nm or `Δν` in Hz at a stated FWHM, transmission or efficiency threshold | Give threshold, passband, instrument resolution and source spectrum; wavelength and frequency bandwidths are not numerically interchangeable. |
| Control/measurement bandwidth | Frequency in Hz at the defined closed-loop response or noise-integration criterion | State transfer function, input/output, sampling and filtering; this is not optical spectral bandwidth. |
| Spot / optical resolution | Intensity 1/e² radii `wx, wy`, FWHM, encircled-energy diameter, or a named two-point criterion, in µm | Name the plane, field point, wavelength, NA, focus, pupil fill and detector PSF/sampling. Geometric RMS spot radius, diffraction PSF width and printed CD are separate observables. |
| Image quality | MTF at specified cycles/mm; RMS WFE in nm or waves; distortion in % or µm | Coherent/incoherent model, object/image space, sagittal/tangential direction, focus, pupil weighting, wavelength and removed Zernike terms. Define wavefront reference and distortion mapping. |
| Depth of focus | Axial range in µm meeting a specified spot/MTF/CD criterion | State the criterion and reference focus; neither `2 z_R` nor a generic diffraction formula is a universal process depth of focus. |
| Beam quality | `M_x², M_y²`, second-moment caustic fit; divergence in rad | State diameter/radius and full/half-angle conventions, fit planes, background treatment and astigmatism. Do not infer M² from one intensity image. |
| Beam uniformity | e.g. `CV=std(I)/mean(I)` over a declared ROI, in % | State ROI, weighting, pixel area, smoothing and power. Peak-to-valley and RMS nonuniformity are different metrics. |
| SNR | Power ratio `P_signal/P_noise`, or an explicitly named amplitude estimator such as background-corrected `mean/sd` | Specify detector, integration time, noise bandwidth, background and averaging. Power SNR in dB uses `10 log10`; amplitude ratio uses `20 log10` only with a consistent amplitude/noise definition. |
| Coherent mode purity | For scalar, same-plane, same-polarization fields: `η_m=|∫u_m* E dA|² / (∫|u_m|²dA ∫|E|²dA)` | State target basis, ROI and normalization. Orthogonal modes support a power-fraction interpretation; arbitrary target overlap is fidelity, not a full decomposition. Incoherent mixtures need a coherence/modal-power method. Intensity alone cannot recover phase-dependent overlap. |
| Positioning / tracking | `e(t)=x_measured(t)-x_commanded(t)`; bias, RMS, peak and repeatability in nm/µm | Coordinate frame, reference instrument, uncertainty, travel, speed, acceleration, scan direction, load, sampling and bandwidth. Command step size or an in-loop encoder residual is not absolute accuracy. |
| Stitching / overlay | Displacement vectors between adjacent fields or layer fiducials, in nm/µm | State registration model, fit and independent evaluation points, residual bias/distribution, pitch/field and instrument uncertainty. Do not fit and validate on the same marks. |
| Stability / thermal drift | Position/focus/power change over a specified interval; slope or RMS where appropriate | Warm-up, load, environment, duration, sampling and detrending. Show absolute drift if detrended vibration is also reported. |
| Radiant exposure (dose) | `H(x,y)=∫I(x,y,t)dt`, J/m² or mJ/cm² | Sample-plane calibration, trajectory, velocity/dwell, power modulation, beam profile, pulse overlap and line pitch. `1 mJ/cm² = 10 J/m²`. |
| Printed resolution / CD | Smallest feature meeting a declared fidelity/yield criterion; CD bias and dispersion in nm/µm | Resist/material and thickness, substrate, focus, dose, bake/development, pattern geometry, measurement instrument and independent sample count. Specify linewidth versus half-pitch. |
| Line-edge roughness | Edge-position standard deviation or `3σ` in nm after declared trend removal | Edge length, sampling pitch, extraction method, filtering/bandwidth and instrument noise; LER differs from linewidth roughness. |
| Throughput / process window | Accepted written area per total cycle time, e.g. mm²/min; dose–focus region meeting quality/yield thresholds | Include alignment, stage settling, field stitching and overhead as claimed; report fill factor, feature quality and yield. Speed alone is not throughput. |

## Coupled optical–motion–dose model

For a circular Gaussian intensity profile translated along a straight line in a uniform
sample plane,

`I(x,y,t) = 2P/(πw²) exp[-2((x-vt)²+y²)/w²]`,

where `P` is power delivered to that plane, `w` is the intensity 1/e² radius and `v>0` is
constant scan speed. For a complete isolated pass far from its start/stop,

`H(y) = sqrt(2/π) P/(v w) exp(-2y²/w²)`.

This has units J/m². Finite paths, acceleration, non-Gaussian profiles, clipping, modulation,
and overlapping lines require integrating the actual irradiance along the actual trajectory.
For dense uniform raster coverage, the interior area-average exposure is `P/(v h)` under
constant power/speed and line pitch `h`; local ripple still depends on beam shape and overlap.
The approximation does not describe start/stop regions or a material's nonlinear response.

`P` above already includes delivery loss. If the commanded upstream power is `P_cmd`
and the measured transmission to the sample is `T`, substitute `P=T P_cmd` once. With
fixed circular-Gaussian shape, constant centerline exposure implies `P ∝ v w`;
when `w` changes, the transverse dose profile changes too, so this does not by itself
hold printed CD or edge slope fixed. Validate the full profile and material response.

For a pulse train, `P_avg=E_p f_rep` and the constant-speed pulse spacing is `v/f_rep`.
Peak irradiance also requires temporal shape/duration and spatial profile. One-photon
radiant exposure is not a sufficient response model for multiphoton or thermal processing.
Fit or cite a suitable resist/material response and validate it on independent patterns.

## Experiment block template

Fill in the project's experiment plan, keeping only applicable fields:

```markdown
### Block: [claim and physical hypothesis]
- Primary metric: [definition, estimator, unit, direction, acceptance threshold]
- Secondary tradeoff: [field / throughput / power / stability / process window]
- Baseline and isolated change: [matched conventional system, optical/control/process change]
- Optical conditions: [λ0, NA/space, pupil fill, polarization, field points, focus, sample-plane power]
- Motion/timing: [axes, trajectory, velocity, acceleration, trigger/modulation timing, latency]
- Process: [material/resist, batch, thickness, substrate, dose, bake/development]
- Metrology: [reference plane/frame, instruments, calibration files, resolution, sampling, bandwidth]
- Independent unit and repeats: [specimen / independent alignment / run / day; technical repeats separate]
- Blocking/order: [batch, day, field position, scan direction, warm-up; concurrent baseline]
- Uncertainty: [calibration, fit, repeatability, drift, shared inputs, standard/expanded convention]
- Evidence paths: [raw, calibration, prescription/config, processing, figure/table]
- Success and failure interpretation: [frozen before acquisition]
```

Measurement ledger (one row per metric and run; no invented target values):

| Run / claim | Metric and formula | Unit / plane | Conditions / reference | Estimate | Uncertainty and coverage | Independent n / level | Raw data / analysis |
|---|---|---|---|---|---|---|---|

## Decision threshold and repeat count

Use a requirement-derived engineering tolerance or label a proposed design goal as such.
If neither is supplied, keep the threshold symbolic until the requirement or pilot data
resolves it. Choose independent n through the precision/power workflow in `../statistics.md`,
including run/batch variability, rather than a universal three or five repeats.

For a difference `Δ=A-B`, standard uncertainty is
`u_Δ²=u_A²+u_B²-2 cov(A,B)`. State the coverage method if reporting expanded uncertainty
`U_Δ=k u_Δ`. Evaluate the difference and the practical threshold with their applicable
uncertainty/confidence model; `2U` is not a universal significance rule. A spatial `3σ`
uniformity statistic is neither an uncertainty interval nor a count of independent runs.

## Reproducibility and interpretation

- Distinguish instrument calibration, physical repeats and repeated samples of one trace.
  Pixels across one line or frames from one alignment are not independent instrument builds.
- Use matched conditions or explain the physical tradeoff. A smaller spot at lower field,
  higher NA or reduced throughput cannot support an unconditional superiority claim.
- Retain unsmoothed raw traces/images and excluded observations with reasons. Report shared
  calibration and correlated uncertainty; do not count correlated inputs twice.
- For a hardware claim, record the prescription, alignment/calibration sequence, controller
  settings and actual processing recipe. Simulated and measured rows remain distinguishable.
