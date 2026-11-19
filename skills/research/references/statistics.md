# Statistics: size the study, then analyze it

Two decisions and one obligation. Before data exists: how large must the study be, and what
could it detect anyway. After data exists: what does it show, with what uncertainty. The
obligation: report what you planned, including the analyses that came out null.

## Part A — Power and sample size

Four quantities are locked together for any test: **n**, **effect size**, **α**, and
**power (1 − β)**. Fix three, the fourth follows. Every calculation below is a rearrangement
of that identity for a specific design — do not mix a formula for one test into a plan for
another (planning a logistic regression with a means-based calculation is a standard error).

### The effect size is the whole analysis

Power is only as trustworthy as the effect size you feed it. In order of defensibility:

1. A **minimally important effect** (SESOI): the smallest effect that would change a
   decision or matter scientifically. Power to detect what matters, not what you hope to see.
2. A **pilot or prior estimate, shrunk**. Published and pilot effects are inflated by
   publication bias and the winner's curse; powering on the raw estimate routinely
   underpowers the real study.
3. A **convention** (Cohen's small/medium/large) only as a last resort — and say so.

Never invent the number. Then run a **sensitivity analysis** across a plausible range and
report the range, not one point: a single required-n hides the biggest source of uncertainty
in the plan.

Do not report observed/post-hoc power. Computing power from the effect you just estimated is
a deterministic function of the p-value and adds nothing. If the study is already done,
report the minimum detectable effect at the achieved n, or better, the confidence interval
around the observed effect.

### Closed-form or simulation

- **Closed form** for standard tests: two independent means, paired/one-sample, one-way
  ANOVA, two proportions, one proportion, correlation, chi-square, R² increment.
- **Simulation** for anything without a textbook formula: logistic/Poisson regression,
  mixed-effects and repeated-measures models, cluster-randomized trials, survival, mediation,
  interactions, non-standard estimators. Simulate under the assumed truth with realistic
  noise and structure, analyze with the *exact* model you plan to fit, repeat ≥ 1,000 times
  (5,000–10,000 near 80%), and take the fraction significant as the power. Report the Monte
  Carlo interval on the estimate so 0.81 vs 0.79 is distinguishable from simulation noise.

```bash
python3 scripts/stats/power.py --help
python3 scripts/stats/simulate_power.py --help
```

```python
from power import sample_size, power, mde, power_curve
sample_size(test="t_ind", effect_size=0.5, power=0.80, alpha=0.05)      # n per group
sample_size(test="t_ind", effect_size=0.5, power=0.80, ratio=3.0)       # 3:1 allocation
mde(test="t_ind", nobs1=30, power=0.80, alpha=0.05)                     # what n=30 can see
sample_size(test="anova", effect_size=0.25, k_groups=4, power=0.80)     # Cohen's f
sample_size(test="two_proportions", prop1=0.40, prop2=0.55, power=0.80) # Cohen's h
power_curve(test="t_ind", effect_size=0.5, n_range=range(10, 120, 5),
            save="power_curve.png")                                     # grant figure
```

`test=` accepts `t_ind`, `t_paired`, `t_one`, `anova`, `two_proportions`, `one_proportion`,
`correlation`, `chi2`, `linear_regression`. Argument tables and the exact statsmodels calls:
`statistics/closed_form_recipes.md`. Simulation patterns for GLMs, mixed models, cluster
designs, survival, and dropout: `statistics/simulation_based_power.md`. Effect-size
benchmarks and conversions (d, f, r, η²/f², OR, h, w): `statistics/effect_sizes.md`.

### Adjustments that change the number

- **Multiplicity.** If m tests will be corrected Bonferroni-style, power each at the
  corrected α, which raises n; better, power the actual family-wise or FDR procedure by
  simulation.
- **Attrition.** Power gives the n *analyzed*. Enroll `ceil(n_analyzed / (1 − dropout))`;
  20% dropout means 25% more enrolled.
- **Clustering.** Nested observations have a smaller effective n: inflate by
  `DEFF = 1 + (m − 1)·ICC`. Treating clustered data as independent is pseudoreplication and
  badly overstates power; for cluster-randomized designs, simulate.
- **Sidedness.** Two-sided is the default; a one-sided test buys power by refusing to detect
  an effect in the unexpected direction, so justify it.
- **Allocation.** Equal groups are most efficient for fixed total n; if allocation is fixed
  by design, pass it (`ratio=`).

A defensible planning statement names the test, the effect and its basis, α, target power,
the resulting n, the attrition inflation, and the sensitivity range — plus library version
for simulated estimates.

## Part B — Analyze

### Workflow

1. **Frame the question.** Outcome, predictors, dependence structure, and whether this is
   confirmatory or exploratory. Preserve a prespecified plan if one exists.
2. **Inspect the data at ingestion.** Units, missingness, sample structure, distributions.
   Normalize once and reuse the normalized dataset.
3. **Select the method** from the design and the estimand, not from the p-value you want:

   | Comparison | Parametric | Robust / non-parametric |
   |---|---|---|
   | Two independent groups, continuous | independent t-test | Mann-Whitney U |
   | Two paired groups, continuous | paired t-test | Wilcoxon signed-rank |
   | 3+ independent groups | one-way ANOVA | Kruskal-Wallis |
   | 3+ paired groups | repeated-measures ANOVA | Friedman |
   | Two categorical variables | chi-square (Fisher's exact when sparse) | — |
   | Two continuous variables | Pearson | Spearman |
   | Continuous outcome + predictors | linear regression | robust SE, quantile, GAM |
   | Binary outcome + predictors | logistic regression | — |
   | Time to event | survival model | — |

   Counts, survival, reliability, and factorial designs: `statistics/test_selection_guide.md`.
4. **Check assumptions and interpret failures.** Overlap, normality of residuals, homogeneity
   of variance, linearity, influential points, collinearity. A failed diagnostic is
   interpreted, not silently swapped for a threshold rule:
   - mild non-normality with n > 30 per group → the parametric test is robust;
   - moderate/severe → non-parametric alternative, or transform with the reason stated;
   - unequal variances → Welch's t-test or Welch ANOVA, robust standard errors for
     regression.
   Formal normality tests get oversensitive as n grows: for n ≥ 100 the Q-Q plot carries more
   information than the Shapiro-Wilk p-value. Diagnostics: `statistics/assumptions_and_diagnostics.md`;
   the bundled module is `scripts/stats/assumption_checks.py`
   (`comprehensive_assumption_check`, `check_normality`, `check_homogeneity_of_variance`,
   `check_regression_diagnostics`, `detect_outliers`).
5. **Estimate effects and uncertainty.** A p-value says nothing about magnitude. Report the
   effect size with its interval (`pg.compute_esci` for a t-based CI; note
   `pg.compute_effsize_from_t` returns a point estimate only).

   | Test | Effect size | small / medium / large |
   |---|---|---|
   | t-test | Cohen's d | 0.20 / 0.50 / 0.80 |
   | ANOVA | partial η² | 0.01 / 0.06 / 0.14 |
   | correlation | r | 0.10 / 0.30 / 0.50 |
   | regression | R² | 0.02 / 0.13 / 0.26 |
   | contingency | Cramér's V | 0.07 / 0.21 / 0.35 |

   Benchmarks are conventions, not laws: a small effect can matter enormously and a large one
   can be trivial. Full guide: `statistics/effect_sizes_and_power.md`.
6. **Report so the reader can recompute.** Descriptives (M, SD, n for each group), the test
   name with statistic and df, the exact p-value (`p = .034`; `p < .001` only below that),
   effect size with CI, which assumption checks were run and what was done about them, and
   every planned analysis including null findings. APA wording: `statistics/reporting_standards.md`
   and `writing/reporting-guidelines.md` for the study-design checklist.
   Non-parametric tests report medians and a rank-based effect size (rank-biserial).

### Bayesian alternatives

Bayesian analysis earns its place when you have real prior information, want a direct
probability statement, need to quantify evidence *for* the null, have small or sequentially
collected data, or fit a hierarchical model. Report the prior, the posterior estimate with a
credible interval, the probability of the directional hypothesis, and convergence
diagnostics (R-hat < 1.01, adequate ESS, posterior predictive check). ArviZ 1.x defaults to
89% intervals — pass `ci_prob=0.95` when you intend a conventional interval, and say which
you report. Details: `statistics/bayesian_statistics.md`.

## Statistical integrity

1. **Label confirmatory vs exploratory** honestly. A post hoc analysis is not prespecified.
2. **Do not shop for significance.** Alternative tests, subgroups, and outlier-removal
   schemes tried until p < .05 invalidate the p-value.
3. **Correct for multiplicity** across families and say which correction: Tukey HSD for
   ANOVA post hoc, Holm or Benjamini-Hochberg elsewhere.
4. **Non-significance is not evidence of no effect.** With small n it may be
   underpowered — report the sensitivity analysis, or use an equivalence test or Bayesian
   analysis to support the null.
5. **Significance is not importance.** With large n, trivial effects reach p < .001. Lead
   with the effect size.
6. **Understand missing data before dropping rows.** Listwise deletion is safe only under
   MCAR; otherwise impute and say so.
7. **Make it reproducible.** Seed everything, record library versions for simulated results,
   keep the analysis runnable.

Install with `uv`:

```bash
uv pip install "statsmodels>=0.14.6" "scipy>=1.11" "pingouin>=0.6" numpy pandas matplotlib
uv pip install "pymc>=5.0" "arviz>=1.0"     # Bayesian
```
