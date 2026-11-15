# Orogen Evolution V2 — sensitivity of distributed GPE ridge traction

**Experiment date:** 2026-11-15 (Brazil). **Status:** finished first sensitivity (0.5/1.0/2.0); intermediate bracketing initiated (1.25/1.5). **No changes to `main`.**

## Reproducibility and provenance

- [Source workflow #43679068995](https://github.com/oWilsonBarbosa/planet_heightmap_generation/actions/runs/43679068995), four successful jobs, artifacts `gpe-strength-0.5-20000`, `gpe-strength-0.5-40000`, `gpe-strength-2.0-20000`, `gpe-strength-2.0-40000`. Parameters are applied per simulated world, not to the global default.
- [Unit-strength-1.0 control workflow #43661647583](https://github.com/oWilsonBarbosa/planet_heightmap_generation/actions/runs/43661647583), artifacts `ridge-gpe-1200myr-20k`, `ridge-gpe-1200myr-40k`.
- All runs: `cycle`, same 3 seeds 12345/777/4242, snapshots every 100 Myr, duration 1200 Myr, lithospheric age scale `ridgeGpeAgeScaleMyr=80`, no arc-maturation/island adjustments. Actual mesh sizes are 20,001 and 40,001 cells.
- Historic **binary-ridge** model with corrected age is listed separately and is *not* equivalent to a distributed GPE strength of 0.

## Primary comparison: growth of CONTINENT+CRATON (percentage points of planet)

| Model / strength | 20K mean (3 seeds) | 40K mean (3 seeds) | Difference in means, 20K − 40K |
|---|---:|---:|---:|
| Historic binary ridge force (age corrected) | +9.78 | +8.60 | **+1.18** |
| Distributed GPE, 0.5 | +12.01 | +6.67 | **+5.35** |
| Distributed GPE, 1.0 | +9.14 | +5.45 | **+3.68** |
| Distributed GPE, 2.0 | +7.22 | +5.07 | **+2.15** |

This is **a difference between sample means of nonlinear tectonic histories**, not a direct discretization error of the GPE formula. The synthetic convergence test for torque on a fixed age field previously passed at ~5.8% discrepancy for 20K versus 40K. The difference in long-term geometry remains much larger.

### Per-seed continental growth, in percentage points

| Seed | 0.5/20K | 0.5/40K | 1.0/20K | 1.0/40K | 2.0/20K | 2.0/40K |
|---|---:|---:|---:|---:|---:|---:|
| 12345 | +11.15 | +8.38 | +9.88 | +4.88 | +6.02 | +1.56 |
| 777 | +8.69 | +5.54 | +10.02 | +6.74 | +4.72 | +4.00 |
| 4242 | **+16.20** | +6.08 | +7.50 | +4.74 | **+10.93** | **+9.65** |

The 0.5 setting has a very large 20K outlier on seed 4242; the 2.0 setting still produces high continental growth in seed 4242 at both resolutions. The ordering is not monotone by seed, consistent with history-dependent bifurcations.

## Secondary metrics at 1200 Myr (three seeds per resolution)

| Model / strength | Mean ocean age 20K / 40K (Myr) | Ocean >200 Myr 20K / 40K (% of visible ocean) | Mean ARC area 20K / 40K (% planet) |
|---|---|---|---|
| Historic binary ridge, correct age | 93.8 / 103.8 | 10.8 / 12.5 | 2.08 / 2.33 |
| GPE 0.5 | **103.3 / 114.9** | **15.5 / 16.0** | 2.62 / 2.53 |
| GPE 1.0 | **90.1 / 94.5** | **11.0 / 12.2** | 2.25 / 3.11 |
| GPE 2.0 | 88.0 / 104.4 | 11.4 / 14.8 | **4.83 / 2.36** |

These are seed means, not a global, ocean-area-weighted ensemble age. A `mean age` does not summarize the full age distribution.

**Important outlier:** GPE 2.0 in seed 4242 / 20K leaves **8.44% of the planet in crosta ARC** at t=1200, versus **1.77%** under GPE 1.0 for the same seed and resolution. The combined continental-plus-arc growth reaches +19.37 p.p. This rules out calling strength 2.0 an unqualified improvement simply because average continental-growth mismatch shrinks.

The 0.5 candidate is worse than 1.0 in mean old-ocean-tail, mean continental growth and mean 20K–40K mismatch. It does reduce the maximum size of plates in some histories, which is not enough to outweigh the tradeoff. The strength-2.0 setting retains a bigger arc surplus, heterogeneous older ocean at 40K, and higher seed dispersion.

## Interpretation and decision

- Do **not** select a universal GPE coefficient from three seeds alone.
- For now, **retain strength 1.0 as the comparison reference**, not an approved default, because the seed-averaged ocean age and extreme-age tail are comparatively lower and the Phase-13 check had 15/20 PASS in the prior run.
- **Do not promote 0.5 or 2.0 to `main`.** Neither offers a robust improvement across area, arc formation, and ocean age.
- Existing regression suites: `check-invariants` 21/21 both control and GPE 1.0; `check-scale` 6/7 both (Laramide failure remains); `check-phase13` 12/20 binary / 15/20 distributed. The coefficient trials in this report **did not run Phase 13**; do not assign them a suite pass/fail status.
- Main residual problems remain: compactness of supercontinents, enclosed seas, large remote oceanic arcs, continental land growth, and long-history resolution sensitivity.

## Follow-up experiment now started

[Intermediate strength workflow #43680224665](https://github.com/oWilsonBarbosa/planet_heightmap_generation/actions/runs/43680224665): four runs at strength **1.25** and **1.5**, 20K and 40K, the same three seeds, 1200 Myr, same tau=80, without changing the engine. CSV + JSON artifacts are retained for comparison with strengths 0.5, 1.0, 2.0 and the age-corrected old force.

**Decision gate:** prefer candidates whose **worst seed-level outcomes** improve, not just their mean, without creating huge ARC reservoirs. If the intermediate coefficients do not materially improve robustness, stop tuning one force coefficient and shift attention to the physical distribution/creation and recycling of island arcs, sedimentary/continental crust budgets, and topology of supercontinents.

All ocean-age provenance corrections and GPE changes remain isolated from the released main line.
