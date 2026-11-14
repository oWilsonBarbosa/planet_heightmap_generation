# Orogen V2 — regressões verificadas e divergência histórica

Data: 2026-11-14. Experimental branch `audit/ocean-age-return-20261114`, compared with `audit/tectonic-baseline-20261114`; `main` not changed.

## Existing suites (completed)

[Workflow 43652396071](https://github.com/oWilsonBarbosa/planet_heightmap_generation/actions/runs/43652396071) completed with success at workflow level, **but captured failing process exit codes by design**.

| Suite | Untouched baseline | Corrected age | New regression |
|---|---:|---:|---|
| check-invariants.mjs | 21/21 passed, exit 0 | 21/21 passed, exit 0 | None |
| check-scale.mjs | 7/7 passed, exit 0 | 6/7 passed, exit 1 | Laramide orogeny area |
| check-phase13.mjs | 13/20 passed, exit 1 | 12/20 passed, exit 1 | Lowland share |

### Scale check

The Laramide orogeny belt (50 Myr margin scenario, fixed seed 12345):
- baseline 40K **14.766 Mkm²**, 80K **16.143 Mkm²**; 8.5% difference;
- corrected 40K **14.804 Mkm²**, 80K **16.539 Mkm²**; 10.5% difference, crossing the accepted 10% threshold;
- slab steepening shifts from 34.0/35.3 Myr to 37.8/40.0 Myr (40K/80K). Its own tolerance (3 Myr) still passes.

The new failure should not be dismissed as a cosmetic floating-point difference, though the absolute difference is modest.

### Supercontinent cycle check

Candidate violates one additional criterion: lowlands below 400m, averaged at 600 and 1200 Myr, are 29.7% on seed 12345 vs a 30% minimum; baseline was 31.1%. Other suites continue to flag supercontinent compactness, inland seas, excessive arc area, continental area growth and maximum plate concentration. At seed 777, candidate largest plate reaches **82%** of planet (baseline **48%**), a material deterioration even though the aggregate largest-plate check failed in both builds. **Do not approve the fix based on suite count alone**.

## Paired snapshots reveal where changes begin

[Trajectory comparison #43655380010](https://github.com/oWilsonBarbosa/planet_heightmap_generation/actions/runs/43655380010). Completed Laramide runs for both 40K (40,001 cells) and 80K (80,001 cells), t=0..50 Myr every 2 Myr, seed 12345. Full comparative JSON files in run artifacts.

| Field / event | Laramide 40K | Laramide 80K |
|---|---|---|
| Formation timestamp hash diverges | 2 Myr | 2 Myr |
| Visible inherited-ocean area diverges | 2 Myr | 2 Myr |
| Orogeny raster class/hash diverges | 34 Myr | 36 Myr |
| Owner array diverges? | **Never** (all sampled frames identical) | **Never** |
| Crust type array diverges? | **Never** | **Never** |
| Count of active plates diverges? | Never | Never |
| Final cumulative ocean births (baseline == candidate) | 2555 cells | 5067 cells |
| Final cumulative consumed (baseline == candidate) | 2619 cells | 5226 cells |
| Final Laramide area, baseline→candidate | 14.766→14.804 Mkm² | 16.143→16.539 Mkm² |

**Inference:** the candidate modifies an age-sensitive tectonic/orogenic process while geometrical plate ownership and raster type of the controlled scene remain identical. It is not evidence for a plate-geometry bug in the Laramide scenario. A plausible pathway is slab buoyancy/age-related flattening and timing of mountain belt recording; verify by inspecting the relevant code before modifying. The candidate's age correction begins at 2 Myr, but mountain-area divergence only appears after ~34–36 Myr. A trajectory delay is expected if age-sensitive geodynamics accumulates over time.

The continental cycle comparison (20K, seed 777) was still running when the Laramide artifact was examined. Do not assert its onset time until the paired JSON artifact is observed.

## Decision

- **Keep age correction unmerged.** Provenance data fix is valid; the geometric and geomorphological effects are not yet acceptance-ready.
- Preserve the narrow repair: use the actual formation timestamp when returning ocean fragments to background. Do not reintroduce false negative ages merely to restore legacy visual output.
- Investigate age-sensitive flat slab / orogenic timing as a separate change or explicit test, not by relaxing the 10% scale tolerance.
- Preserve matched baseline vs candidate test artifacts and the new ocean-age unit test.
- Evaluate phase13 large-plate and lowland changes on a larger seed suite rather than optimizing one seed's coastline.

This report distinguishes confirmed observations from the unresolved causal mechanism.
