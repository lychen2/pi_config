# Uncertainty and units

Use this whenever a calculation carries physical units, or a reported number needs an
uncertainty: converting units, propagating uncertainty, building a GUM budget from a
calibration certificate, choosing a coverage factor, rounding a result so the `±` means
something, extracting parameter uncertainties from a fit, reviewing analysis code for silent
unit defects, or checking that a dimensionally consistent answer is also physically possible.

Where the numbers come from, and what they mean for the argument, stays in scope here. The
inferential statistics — tests, models, power — live in `statistics.md`.

## Workflow

1. **Normalize external inputs once.** Establish units when importing measurements or
   crossing a library interface with a different convention. Inside the calculation, use the
   agreed units or quantity objects rather than re-validating at every call.
2. **Define the measurement model.** Input estimates, uncertainties, distributions, and
   correlations; include the corrections that matter.
3. **Propagate appropriately** — see the table below. Convert Type B inputs with their
   specified divisor; use sensitivity coefficients and the covariance matrix for a linear
   approximation, Monte Carlo when nonlinearity, bounds, or distribution shape matter.
4. **Check the physical result.** Dimensions, order of magnitude, and the approximation
   regime, where any of them could change the conclusion.
5. **Present it once.** Round value and uncertainty consistently, and define what `±` means
   in the result, caption, or methods — one place, not three.

## The failures this file exists to prevent

Each of these runs without error and produces a plausible number.

- **A unit stripped at an unknown scale.** `.magnitude` returns whatever the quantity
  carried. `(12.7 * ureg.mm).m_as("m")` states the unit; `(12.7 * ureg.mm).magnitude` does
  not.
- **Offset temperature arithmetic.** Celsius and Fahrenheit are interval scales. An
  uncertainty on a temperature is a difference and belongs in a `delta_` unit:
  `20 ± 0.5 degC` becomes `68 degF ± 0.9 delta_degF`, two different conversions on one line.
  `Q(20, "degC") + Q(5, "degC")` is refused for good reason.
- **Logarithmic units that add by multiplying.** `Q(10, "dBm") + Q(10, "dBm")` gives
  `1e-4 kg²·m⁴/s⁶`, not 20 mW and not 13 dBm — that is 10 mW × 10 mW. Nothing raises.
  Convert to a linear unit before arithmetic.
- **A correlation destroyed by a round trip.** Rebuilding a variable from its nominal value
  and standard deviation creates an independent variable; `x - ufloat(x.nominal, x.std)`
  gives `0.00 ± 0.14` where `x - x` gives `0.0`. Any serialization through a pair of floats
  does the same. Rebuild correlated sets with `correlated_values(values, cov)`.
- **A covariance matrix silently rescaled.** `curve_fit` rescales `pcov` by the reduced
  chi-square unless you pass `absolute_sigma=True`. On a synthetic straight-line fit the
  parameter uncertainties differ by 31% between the two; pass `absolute_sigma=True` whenever
  `sigma` holds real standard uncertainties.
- **A linearization that was never checked.** For `y = x²` with `x = 1.0 ± 0.5`, the GUM
  framework gives a 95% interval of `[-0.96, 2.96]` for a squared quantity. Monte Carlo gives
  a mean of 1.25 and a shortest 95% interval of `[0, 3.32]`. No linear-propagation library
  will tell you this happened.

## Choosing the propagation method

| Situation | Method |
|---|---|
| Linear or near-linear model, normal-ish inputs, large dof | GUM framework alone |
| Any nonlinearity across ±2u of an input | run both, apply the JCGM 101 clause 8 test |
| Relative uncertainty above ~20% on any input | Monte Carlo |
| Dominant rectangular or otherwise non-normal component | Monte Carlo |
| Output bounded below (variance, concentration, squared quantity) | Monte Carlo |
| Asymmetric output distribution | Monte Carlo, shortest coverage interval |
| Correlated inputs | either, but supply the covariance matrix, not standard uncertainties alone |

A model dominated by rectangular contributions fails the clause 8 test even when it is
perfectly linear: the framework's `k = 1.96` over-covers a nearly trapezoidal output. The
estimate and `u_c` are still right; only the interval is too wide.

Type A (statistical) and Type B (other information) are methods of evaluation, not quality
grades; both produce a standard uncertainty on the same footing. Coverage factor choice,
Welch-Satterthwaite, and the clause 8 test: `units/gum-methodology.md`.

## Constants

Never type a constant from memory. The 2019 SI redefinition fixed `c`, `h`, `e`, `k`, and
`N_A` exactly, so their relative standard uncertainty is zero; everything else is measured
and moves between CODATA releases.

```python
import scipy.constants as constants
constants.value("electron mass")        # 9.1093837139e-31
constants.unit("electron mass")         # kg
constants.precision("electron mass")    # 3.07e-10, relative standard uncertainty
constants.precision("Planck constant")  # 0.0, exact by definition
```

`precision` is relative; multiply by the value for the absolute uncertainty. SciPy 1.18
serves CODATA 2022; SciPy ≤ 1.11 serves CODATA 2018, and several recommended values differ.

## Bundled CLIs

```bash
python3 scripts/units/convert_units.py --help       # unit conversion with physical contexts
python3 scripts/units/propagate_uncertainty.py --help # GUM + Monte Carlo, with the clause 8 check
python3 scripts/units/uncertainty_budget.py --help  # budget from certificate/spec/repeatability terms
python3 scripts/units/format_result.py --help       # rounding and reporting a value ± uncertainty
python3 scripts/units/audit_units.py --help         # find unit and uncertainty defects in analysis code
python3 scripts/units/check_plausibility.py --help  # order-of-magnitude and dimensionless-group sanity
```

All run offline, reject URLs and symlinks, bound their inputs, and refuse to overwrite
without `--force`.

## Deeper references

- `units/gum-methodology.md` — Type A/B evaluation, distribution divisors, law of
  propagation, Welch-Satterthwaite, when the framework fails, the Monte Carlo procedure and
  the clause 8 validation test.
- `units/pint-recipes.md` — registries, offset and logarithmic units, contexts, boundary
  enforcement with `wraps`/`check`, NumPy interop, custom units, formatting.
- `units/uncertainties-recipes.md` — variable identity and correlation, `correlated_values`,
  `umath`/`unumpy`, format specs, fit covariance matrices, package limits.
- `units/domain-conversions.md` — the energy ladder, spectroscopy, concentration, pressure,
  radiation and magnetism, mass spectrometry, logarithmic quantities, and the pairs that
  share dimensions without sharing meaning.
- `units/reporting-rules.md` — rounding, notation, SD vs SEM vs CI in figures, non-detects,
  conformity decision rules.
- `units/plausibility-scales.md` — characteristic length per geometry, the dimensionless
  groups and the modelling assumption each gates, observed magnitude bands and their caveats.

## Environment

```bash
uv venv --python 3.13 && source .venv/bin/activate
uv pip install "pint==0.25.3" "uncertainties==3.2.3" "numpy==2.5.1" "scipy==1.18.0"
```

Checked 2026-07-26: pint 0.25.3, uncertainties 3.2.3. Sources: JCGM 100:2008 and
JCGM 101:2008 (BIPM), NIST Technical Note 1297, CODATA recommended values.
