# Oceanic crust provenance: verified diagnostics and exposure-trace protocol

Audit date: 2026-11-14. Baseline engine commit: `7026cc6526fa637611d05804a4cec8eed04de017`, with audit scripts only on branch `audit/tectonic-baseline-20261114`.

## Completed experiment

[GitHub Actions run 43649231279](https://github.com/oWilsonBarbosa/planet_heightmap_generation/actions/runs/43649231279): all four jobs passed. Artifacts `orogen-ocean-20k-control`, `orogen-ocean-20k-bothHalf`, `orogen-ocean-40k-control`, `orogen-ocean-40k-bothHalf` contain 39 frames each (seeds 12345, 4242, 31337; 0–1200 Myr, every 100 Myr). Observed simulation mesh counts: 20,001 and 40,001 cells.

Definitions: inherited floor = **visible oceanic** cell `formedAt<0`; new floor = oceanic cell `formedAt>=0`. `CONTINENT` and `CRATON` are not oceanic; `ARC` tracked separately. Areas use world-cell area * count. This classifies the current visible world, NOT the total stock stored in every plate raster.

### Final mean ages, averaged over three seeds (Myr)

| Mesh | Mode | Entire visible ocean | Newly formed ocean alone | Inherited ocean (Mkm²) | Fraction inherited (%) | Generated ocean older than 200 Myr (Mkm²) |
|---|---|---:|---:|---:|---:|---:|
| 20K | Control | 129.7 | 101.6 | 7.5 | 2.6 | 41.2 |
| 20K | bothHalf | 94.5 | 87.7 | 1.8 | 0.6 | 30.5 |
| 40K | Control | 139.9 | 87.9 | 14.2 | 4.7 | 30.5 |
| 40K | bothHalf | 169.3 | 110.4 | 17.3 | 5.4 | 48.1 |

Important: excluding inherited floor reduces reported mean age *substantially*, particularly in 40K. It **does not remove the entire age anomaly**: newly formed crust in `40K/bothHalf` has mean 110.4 Myr, with an additional 48.1 Mkm² generated more than 200 Myr before the frame. Do not simply reset ages in `formedAt` as a cosmetic correction.

### Selected final seed examples

- `12345/40K/control`: mean 219.8 Myr total, 106.4 Myr newly formed; inherited 31.4 Mkm² (10.4% of ocean). An inherited tail at ~1201 Myr affects p90 of the distribution.
- `4242/40K/control`: mean 99.1 total, 73.5 new; inherited 6.8 Mkm².
- `31337/40K/bothHalf`: mean 168.5 total, 109.9 new; inherited 18.0 Mkm², generated >200 Myr occupies 55.3 Mkm².
- At 1200 Myr, the inherited-ocean cells' mean age is ~1201 Myr in several seeds; this is expected if their initial formation time was -1 Myr and they were preserved. Some runs have greater ages due to other negative formation timestamps.

### Temporal anomaly: apparent reappearance of pre-existing ocean

In `seed 12345/20K/control`, **visible inherited ocean** increases from 2.5 Mkm² at 700 Myr to 51.5 Mkm² at 800 Myr, despite starting with 362 Mkm² of inherited ocean and losing most of it over time. Similar but smaller increases occur in other runs. This is *not yet evidence of creation of old crust*: previously hidden inherited crust can be exposed by rigid plate motions or changes of overlap/ownership. The engine stores each plate's crust in its own moving lattice and resolves which plate claims each world cell. A global world-frame snapshot is a projection of those plate rasters.

### Code paths inspected

- `v2/js/tectonics/step/resolve.js`: `gatherAndSubduct` selects visible owner and removes subducting crust; `growCrustIntoGaps` creates *new* ocean with `formedAt=world.time`. `assignGapOwners` can mark provisional areas, which must not be confused with new actual raster crust.
- `v2/js/tectonics/step/ocean-plates.js`: at `backgroundEndMyr=150`, `retireBackground` transfers blocks of inherited background ocean into newly mobile ocean plates using `transferCells`. Transfer retains the crust's creation timestamp.
- `v2/js/tectonics/snapshot.js`: fills the world frame using a plate's raster cell; the visible owner and stored crust stock are distinct concepts. The snapshot copies per-plate crust arrays and labels, exposing which plate is visible.
- `v2/js/tectonics/config.js`: ocean plate threshold `oceanPlateMinAreaKm2=8e6`, background retirement begins at 150 Myr; ocean splitting is stochastic on mature large ocean plates. The generated histories depend on resolution and tectonic bifurcations; exact matching across different meshes is not expected, but physical metrics should not drift pathologically.

## Next causal measurement (new script + CI, engine unchanged)

[GitHub Actions exposure trace run 43650418278](https://github.com/oWilsonBarbosa/planet_heightmap_generation/actions/runs/43650418278), three jobs:
- `20K/control/seed 12345` to trace the 700–800 Myr spike;
- `40K/control/seed 12345` to trace inherited material at 1200 Myr;
- `40K/bothHalf/seed 31337` to trace the older new seafloor and altered plate topology.

The script `v2/tools/audit-ocean-exposure.mjs` records every 50 Myr:
- visible inherited-ocean area, divided into background vs mobile plates;
- stored inherited-ocean raster cells, divided background vs mobile, and changes since last frame;
- largest contributing plates and per-frame event kinds;
- cumulative actual `created` / `consumed` counters from the simulation.

**How to interpret:** if visible old ocean rises but raster old ocean does not, re-exposure/reprojection is supported. If the raster old count rises, trace `transferCells` semantics and any code writing negative `formedAt`. Raster totals from several plate frames may overlap in world space and are **not** unique physical surface area. This test discriminates causes; it does not prove one before its results exist.

## Decision

Retain both `main` and original default parameters unchanged. The bothHalf calibration **is not accepted**. Identify the source of the inherited-ocean reappearance and the generated-old-ocean tail separately, then propose a focused change only after consistent causal evidence.
