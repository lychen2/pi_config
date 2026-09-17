# Validation contract

Use aperture width 2e-6 m, wavelength 193e-9 m, window 32e-6 m, and grids 4096/8192. Cell centers are `(j-N/2+0.5)*L/N`; the pupil is `abs(x)<a/2`.

Compare normalized intensity with `(sin(pi*a*f)/(pi*a*f))**2`, with the value at zero defined as one. Evaluate `abs(f)<=3/a` and `abs(wavelength*f)<=1`. Require finite values, strictly increasing frequencies, center intensity within 1e-10 of one, maximum absolute analytic error <=1e-3, and common-grid difference <=5e-4.

Absolute errors avoid unstable division near zeros. The deterministic N=64 coarse-grid fixture exceeds the analytic threshold and must fail. Units and sampling assumptions are part of the contract; CSV values alone do not establish their provenance.
