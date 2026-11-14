# Orogen V2 — Age-return patch: A/B verified, tectonic regression pending

Date: 2026-11-14. Source workflows: [A/B #43651084159](https://github.com/oWilsonBarbosa/planet_heightmap_generation/actions/runs/43651084159), [control exposure #43650418278](https://github.com/oWilsonBarbosa/planet_heightmap_generation/actions/runs/43650418278), [control geography #43649231279](https://github.com/oWilsonBarbosa/planet_heightmap_generation/actions/runs/43649231279). Experimental branch `audit/ocean-age-return-20261114`, baseline branch `audit/tectonic-baseline-20261114`; `main` untouched.

## Verified effect: fake prehistory ocean largely disappears

The only implementation change (in `v2/js/tectonics/ops/tidy-plates.js` → `giveToBackground`) replaces
```js
age = Math.min(plate.crust.formedAt[c], -1);
```
with
```js
age = plate.crust.formedAt[c];
```
when returning detached ocean crust to background. Original code marked newly created ocean as pre-existing; this patch preserves provenance.

| Case, frame | Visible ocean with `formedAt<0`, before (Mkm²) | After (Mkm²) | Inherited stock in live plate rasters before→after (Mkm²) |
|---|---:|---:|---|
| 20K/control/seed 12345, t=800 Myr | 51.463 | 0.026 | ~51.5 → ~0.1 |
| 40K/control/seed 12345, t=1200 Myr | 31.381 | 0 | ~31.3 → 0 |
| 40K/bothHalf/seed 31337, t=750 Myr | 55.035 | 0.434 | ~55.2 → ~0.4 |

Paired runs use the same seeds, scenario, mesh resolution and capture schedules. The correction removes artificial date-clamping, not the existence of preserved crust formed prior to the simulation.

## Final frame at t=1200 Myr — age and topology changed together

| Scenario | Whole-ocean mean age before→after (Myr) | Mean age of generated ocean before→after (Myr) | `CONTINENT+CRATON` area before→after (% globe) | Largest connected continental block before→after (% continental crust) | Active plates before→after |
|---|---|---|---|---|---|
| 20K/control/12345 | 147.4 → 107.3 | 110.7 → 107.3 | 39.79 → 39.05 | 36.89 → 88.62 | 10 → 6 |
| 40K/control/12345 | 219.8 → 87.5 | 106.4 → 87.5 | 38.50 → 38.66 | 84.52 → 56.75 | 12 → 12 |
| 40K/bothHalf/31337 | 168.5 → 97.8 | 109.9 → 96.3 | 30.92 → 31.64 | 47.24 → 99.94 | 10 → 8 |

**Critical qualification:** The earlier claim that `formedAt` is 'metadata only' is false in the context of the full simulator. Crust age influences geological mechanisms (e.g., age-based plate/subduction processes), and stochastic trajectories subsequently diverge. In the 20K/12345 case the largest continental block's share jumps from 36.89% to 88.62%, and the plate count decreases from 10 to 6. In 40K/bothHalf/31337 the largest block rises from 47.24% to 99.94%. The patch **cannot be accepted solely because the age statistic improves**.

These changes do not by themselves establish a regression: nonlinear plate history can change drastically following a physically meaningful correction. They do require testing consistency with phase/cycle behavior, initial conditions, and acceptance checks.

## Other unresolved sites

`fillPinholes` (same `tidy-plates.js`) may initialize background ocean at `-initialOceanAgeMyr` for a gap involving multiple plates; `bridgePieces` can copy nearby ocean age. These paths have not been proven to cause the spikes; no edits were made to them. Preserve separate scrutiny and avoid an indiscriminate reset of old timestamps.

## Automated unit and model regression

A targeted unit test `v2/tools/check-ocean-age-return.mjs` now checks transfer of five timestamps (`-80`, `-1`, `0`, `250`, `900` Myr) without modifying birth date or ocean crust type. It passed in the GitHub Actions regression workflow.

[Regression comparison #43652396071](https://github.com/oWilsonBarbosa/planet_heightmap_generation/actions/runs/43652396071) compares **baseline and candidate independently** on `check-invariants.mjs`, `check-scale.mjs`, and `check-phase13.mjs`. Each job archives its log and exit code; long-standing baseline failures will be distinguished from new failures. A successful workflow infrastructure status does not imply all acceptance assertions passed, since comparison jobs intentionally preserve nonzero suite exits.

## Decision at time of writing

**Keep candidate branch isolated. No merge.** The provenance defect is confirmed and substantially reduced; global geodynamic behavior changes, hence regression analysis is necessary. After the baseline-vs-candidate suites finish, inspect new failures (if any), evaluate model-quality tradeoffs and decide whether to adjust the patch or approve for review.
