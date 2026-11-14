# Orogen V2 — earliest continental-cycle divergence and Laramide slab hypothesis

Data: 2026-11-14. Source: [trajectory run #43655380010](https://github.com/oWilsonBarbosa/planet_heightmap_generation/actions/runs/43655380010) (completed successfully) and its three artifact ZIPs: `trajectory-cycle-20000`, `trajectory-laramide-40000`, `trajectory-laramide-80000`. This is a **matched A/B** of `audit/tectonic-baseline-20261114` and `audit/ocean-age-return-20261114`; `main` untouched.

## Continental cycle seed 777 (20,001 cells)

The paired, 20-Myr-spaced snapshots first disagree by **40 Myr** in formation timestamp, ownership, crust type, orogeny class, continent area and reported largest-landmass share. Because this is a 20-Myr sampling cadence, the actual first difference is in **(20,40] Myr**, not necessarily exactly at 40 Myr. Number of active plates first differs at **120 Myr**.

At t=1200 Myr:
- **Baseline**: 11 active nonbackground plates, largest-landmass share 74.58% (cycle estimator), 208.50 Mkm² continental crust, 283.30 Mkm² visible ocean, 1.45 Mkm² inherited ocean, 122,873 created-cell operations / 122,750 consumed-cell operations.
- **Age-corrected**: 7 active nonbackground plates, largest-landmass share 97.90%, 191.04 Mkm² continental crust, 309.44 Mkm² visible ocean, no inherited ocean visible, 126,383 created-cell operations / 124,295 consumed-cell operations.

**Interpretation:** the correction changes physical history much earlier than the previous 600–1200 Myr comparisons suggested. The final large connected landmass could be a tectonic bifurcation amplified across hundreds of Myr; independent assessment of topology and rift/subduction dynamics remains necessary. Do not claim a particular process caused divergence without a targeted ablation.

## Laramide controlled scene seed 12345 (40K and 80K)

At t=2 Myr, `formedAt` and inherited-ocean area diverge, but **owner hash**, **crust type hash**, plate count, and continent area remain identical throughout the 50-Myr scene. At t=34 (40K) or t=36 (80K) Myr, the orogeny record first diverges.

- 40K Laramide area at t=50 baseline 14.766 → candidate 14.804 Mkm².
- 80K Laramide area at t=50 baseline 16.143 → candidate 16.539 Mkm².
- Slab steepening event moves from t=34.0 to 37.8 Myr (40K) and from t=35.3 to 40.0 Myr (80K). These figures come from `check-scale.mjs` output, which uses event times at sub-2-Myr engine steps.

**Mechanistic candidate:** `v2/js/tectonics/step/boundaries.js` computes `slabAge = world.time - B.crust.formedAt[cell]` at active overriding margins. A young slab is eligible for flat-slab geometry when `slabAge < flatSlabMaxAgeMyr` (default 35 Myr) and `advance > flatSlabAdvanceCmYr` (default 2 cm/yr); hysteresis thresholds are `flatSlabOnShare=0.5` and `flatSlabOffShare=0.3`. It uses age again through `beltShape(headOn,slabAge,config)`, extending the belt of young, buoyant slabs.

Preservation of real ocean-formation times will change these quantities even if ownership/type remains unchanged. That is **intended physical feedback** up to a point; a crossing of the resolution tolerance from 8.5% to 10.5% still merits scrutiny. Merely increasing the tolerance would obscure its source.

## Next instrument

Added `v2/tools/audit-slab-kinematics.mjs` (no engine modifications): Laramide 40K and 80K, t=0..50 Myr, snapshots every 2 Myr, comparing subducting-ocean ages at margin contacts, the fraction of age-eligible contacts (a **proxy**, not the exact `fed` denominator), flat-slab status and cumulative flattened distance, event timestamps, and orogeny area.

New workflow: [#43655924306](https://github.com/oWilsonBarbosa/planet_heightmap_generation/actions/runs/43655924306). **Results not yet observed when this report was written.**

## Decision

Keep the formation-time fix on its branch; do not merge into `main` until regression tests are understood. Consider a model-level correction only if these traces identify an error in flat-slab mechanics; otherwise the original scale threshold may require broader empirical validation, but should not be relaxed automatically. Preserve the distinction between age provenance (data correctness) and whole-planet geological calibration (model quality).
