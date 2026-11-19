# Optical-system and laser direct-write figures

Use the normal data-integrity, accessibility, export and final-size inspection workflow.
Select panels by physical claim, with this default priority rather than training curves:

1. **Optical path and system layout:** source → expander/shaper → pupil relay/scanner →
   objective → sample, with power-sampling and metrology paths where present. Separate
   beam propagation, electrical/feedback links and motion. Show apertures, axes, reference
   planes and conjugates relevant to the argument, not every purchased part.
2. **Design and beam performance:** field-dependent spot diagrams, PSF/MTF, wavefront/OPD,
   encircled energy, intensity/phase or mode distributions, and caustics. Use spectra when
   spectral performance is part of the claim; include instrument resolution and normalization.
3. **Positioning and stability:** time traces at exposure, residual/vector maps for overlay
   and stitching, vibration spectra and drift with the measurement bandwidth and duration.
4. **Exposure and process:** dose–focus/CD/process-window maps and measured microscopy or
   profilometry with scale bars; compare throughput only at stated quality/yield conditions.

A differentiable design can use an optimization curve to support its numerical method;
that curve does not replace the spot, wavefront, tolerance or measured-system result.

## Choose the renderer by the artifact

- Use the existing Matplotlib/Seaborn/Plotly route for sampled data, spectra and maps.
- Use editable SVG/Draw.io or the `blender-optical-path` skill for lens/beam geometry;
  read that skill when a 3D editable optical path is requested. Label conceptual drawings
  as schematics. Geometrical accuracy claims require coordinates and a physical model.
- The generic FigureSpec renderer in `schematic_figures.md` is for a control or processing
  diagram. It is not a ray tracer and does not model refraction or propagate a wavefront.

## Quantities and comparisons

- Distinguish ray intersections, coherent field amplitude/phase, irradiance, PSF and
  fabricated features. Label simulation versus measurement and name the plane.
- Define wavelength, NA and object/image space, pupil fill, focus and field point where
  they affect interpretation. State width as radius/diameter and 1/e²/FWHM/second moment.
- Label MTF spatial frequency in cycles per physical length with image/object space;
  show sagittal/tangential conventions. Wavefront maps state nm or waves, reference and
  removed piston/tilt/defocus terms. Phase uses a cyclic scale with radians or degrees.
- Compare intensity maps on a shared absolute scale, or identify each normalization and
  report delivered power separately. Do not use per-panel normalization to hide loss.
- Use dimensioned x/y axes or scale bars and a labeled colorbar. Preserve pixel aspect
  ratio for physical space, distinguish measured sampling from visual interpolation, and
  give the section location for a line profile. A phase-dependent modal overlap cannot
  be inferred from intensity alone.
- Position plots need command and reference frames, sampling and filtering, scan conditions
  and uncertainty. Report raw drift as well as detrended vibration when both are relevant.
- Exposure maps need J/m² or mJ/cm², sample-plane power and the trajectory/process definition.
  Printed-feature images need the recipe, metrology method and independent replicate level.

For a figure plan, record one row per kept figure: claim, physical quantity, panels, source
arrays/drawing model, transforms/normalization, uncertainty, final width and caption. Keep
working provenance outside the caption; the caption states the scientific conditions.
