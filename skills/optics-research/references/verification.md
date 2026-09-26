# Optical verification

Select checks relevant to the observable. Record conventions once and use them consistently in equations, code, and plots. This is a working verification guide, not a mandatory section outline for the final artifact. Include conditions and actual results needed to interpret the science; retain commands and detailed check logs in project records unless requested.

## Define the physical problem

- Specify geometry, coordinate system, propagation direction, wavelength range, medium, polarization, source coherence, and the measured observable as needed. Distinguish vacuum wavelength from wavelength in the medium and phase index from group index.
- State phasor time dependence, Fourier-transform sign and normalization, field versus intensity definitions, and amplitude versus power coefficients when used. Check the sign convention for a complex refractive index against attenuation in a passive medium.
- Define beam widths explicitly: a Gaussian field radius, intensity 1/e² radius, standard deviation, and FWHM are different quantities. State whether numerical aperture refers to the object or image space and which refractive index it includes.
- Identify approximations such as scalar, paraxial, thin-element, far-field, monochromatic, linear, homogeneous, or lossless. Check whether the geometry, bandwidth, angle, index contrast, or feature scale supports them; high-NA and subwavelength problems may require a vector model.

## Derivations

1. Write the governing equation and boundary/initial conditions. Define symbols and units; do not silently mix angular frequency with ordinary frequency or radians with degrees.
2. Derive under stated assumptions. If using a computer algebra system, preserve domain assumptions and check branches, singularities, and the original equation after simplification.
3. Check dimensions and a known limit relevant to the model: zero propagation distance, normal incidence, zero loss, weak perturbation, or another analytically controlled case.
4. Check conservation or a justified balance law. For passive systems account for reflected, transmitted, absorbed, and any other channels included in the model. Power transmission may require impedance or flux factors; it is not universally the squared field transmission coefficient.

## Numerical optics

Choose a benchmark appropriate to the implemented physics: Gaussian-beam propagation under paraxial assumptions, an aperture diffraction pattern, a Fresnel interface, a known waveguide mode, or another established analytic/reference solution. Define the error observable and tolerance before accepting a result.

| Method | Checks to select |
| --- | --- |
| FFT-based propagation / diffraction | Spatial pitch and domain size, frequency-grid units, FFT shifts and scaling, wraparound/aliasing, aperture truncation, evanescent treatment, and consistency of input/output sampling. Zero-padding does not recover unresolved input detail. |
| FDTD / FEM | Spatial and temporal or polynomial refinement as applicable, stability limits, interface representation, material dispersion/loss, absorbing boundaries and domain size, source bandwidth, and residual/transient decay. |
| Ray tracing | Angle and coordinate conventions, surface normals, aperture stops/vignetting, optical path versus geometric path, and whether diffraction or polarization invalidates the ray approximation for the observable. |
| Eigenmode / resonance calculations | Mode normalization, boundary conditions, mode tracking across sweeps, spurious modes, degeneracy, and the convention for complex frequency or propagation constant. |
| Inverse design / fitting | Forward-model benchmark, parameter units and bounds, identifiability, initial-condition sensitivity, independent validation data, and fabrication/model mismatch. |

Vary sampling/mesh and domain/boundary choices separately where practical so apparent convergence cannot hide a truncation error. Report the change in the target observable, not only solver success. A converged discretization can still represent the wrong physical model.

Record material-data provenance, temperature or other applicable conditions, valid wavelength range, and interpolation/extrapolation choices. Do not invent dispersion coefficients to fill missing data. Separate solver error, model approximation, measurement uncertainty, and parameter uncertainty.

## Measurements and reproducibility

- Keep raw data immutable. Record acquisition settings, calibration/background files, units, independent-run identifiers, and preprocessing order; retain rejected data with reasons.
- Match the forward model to what the instrument measures, including exposure/integration, response bandwidth, instrument function, or point-spread function where relevant.
- Include shared calibration and correlated inputs in uncertainty propagation. Distinguish standard uncertainty from expanded uncertainty or confidence intervals and state coverage assumptions.
- Save the reproduction command, configuration, software versions, random seed when relevant, and actual check outputs using the project's existing conventions. Mark outputs as measured, simulated, derived, or illustrative.
- Require human inspection of source-to-plot correspondence and scientific interpretation before treating an AI-produced figure as publication-ready evidence. Track pending review as an editorial issue in comments or the handoff, not as an automatic warning stamped on the figure. Never hide a known scientific defect: correct it, narrow the claim, or withhold the affected result.
