---
name: optics-diffraction-check
description: Verify the scientific execution workflow with an analytic scalar single-slit Fraunhofer diffraction fixture, grid refinement, and explicit tolerances.
---

# Single-slit diffraction check

Use `scripts/rectangular_slit.py` with an explicitly selected Python environment containing NumPy. Do not install packages automatically. This is a scalar, uniform-illumination fixture, not a complete lithography, resist, polarization, or 3-D mask model.

Before execution, declare required outputs `parameters.json`, `slit-4096.csv`, and `slit-8192.csv` (all written under `artifacts/`). Allow 2 MiB per CSV and 4096 bytes for parameters. Declare this required validation:

```json
{"id":"slit","parameters":{"paths":["artifacts/slit-4096.csv","artifacts/slit-8192.csv"],"aperture_m":0.000002,"wavelength_m":0.000000193,"max_error":0.001,"max_grid_difference":0.0005}}
```

For local jobs, copy the script through the explicit input list, then invoke the configured Python executable with `argv: ["inputs/rectangular_slit.py"]`. For a persistent kernel, read the trusted packaged script using its absolute path and execute it, preserving its code and input reference in the run contract. Never silently fetch a replacement script.

After execution, call `science_artifact` to verify. Report execution, integrity, and scientific validation separately. A failed result must preserve measured errors. Do not relax tolerances to obtain a pass.

See [validation.md](references/validation.md) for the numerical assumptions and failure case.
