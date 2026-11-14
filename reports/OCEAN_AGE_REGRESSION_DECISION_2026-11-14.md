# Orogen V2 — regression decision: age provenance fix

Date: 2026-11-14. Baseline `audit/tectonic-baseline-20261114`; candidate `audit/ocean-age-return-20261114`. Main branch untouched.

## Completed regression comparison

[GitHub Actions run #43652396071](https://github.com/oWilsonBarbosa/planet_heightmap_generation/actions/runs/43652396071) completed, including baseline and candidate suites in independent checkouts. **Important: the workflow itself reports success even when a suite fails, by design, because it captures logs and exit codes separately.**

| Suite | Baseline | Candidate | Decision |
|---|---|---|---|
| `check-invariants.mjs` | 21/21 PASS, exit 0 | 21/21 PASS, exit 0 | No invariant loss in tested histories |
| `check-scale.mjs` | 7/7 PASS, exit 0 | 6/7 PASS, exit 1 | **New scale failure** |
| `check-phase13.mjs` | 13/20 PASS, exit 1 | 12/20 PASS, exit 1 | **One additional failing acceptance check** |

### Newly failing scale check

Laramide flat-slab orogenic area at end of prescribed scene:
- Baseline: 14.77 Mkm² at 40K and 16.14 Mkm² at 80K; disagreement ~8.5%, within 10% tolerance.
- Candidate: 14.80 Mkm² at 40K and 16.54 Mkm² at 80K; disagreement ~10.5%, above 10% tolerance.
- Corresponding slab steepening: baseline 34.0 vs 35.3 Myr; candidate 37.8 vs 40.0 Myr, still within 3 Myr tolerance.

Difference is small but **a real automated regression against the project threshold**, and may involve altered oceanic-age-driven dynamics. Need locate the first divergent state rather than widen threshold.

### New phase 13 failure

Lowland fraction below 400 m averaged at 600/1200 Myr:
- Baseline: seeds 12345/777/4242 = 31.1%, 35.4%, 37.0%; all within acceptance window 30–45%.
- Candidate: seeds 12345/777/4242 = 29.7%, 37.4%, 35.6%; seed 12345 is 0.3 points below minimum.

Other phase 13 failures remain, but severity changes. Examples:
- Baseline maximum plate area after 100 Myr: 72/48/73% for 12345/777/4242. Candidate: 42/82/44%. It improves in two seeds but deteriorates in seed 777.
- Open-ocean arc grouping: both versions violate maximum area/size requirements, but which seed is extreme changes.
- Global continental area remains above the desired drift in both versions.
- Seed 12345: baseline largest enclosed sea 1.7 Mkm², candidate 9.2 Mkm²; paired test already fails overall due to other seeds, but this is a **new individual scenario quality regression**.

Thus `check-phase13` total alone understates spatial quality tradeoffs. Correction of geological age provenance is justified, but **not yet ready to merge**.

## Mechanistic context

The correction changes `formedAt` of fragments returned by `giveToBackground` from `min(original,-1)` to `original`. In `step/polarity.js`, ocean–ocean subduction polarity is decided partly by `formedAt`, after segment voting, trench polarity and passive-background priority. Thus timestamp preservation can have physical consequences in later encounters. Other age-driven processes may also matter.

This demonstrates why 'only metadata' is an invalid model-level assumption. Do not undo the corrected timestamp purely to match historical seeds: that would retain knowingly incorrect ocean-age provenance.

## Next targeted diagnostic started

[Trajectory divergence workflow #43655380010](https://github.com/oWilsonBarbosa/planet_heightmap_generation/actions/runs/43655380010). It compares exact baseline and corrected snapshots and writes first timestamps of divergence by:
- ocean formation timestamp, plate owner, crust type, mountain-building class;
- total inherited ocean area, continental area, Laramide belt area, active plate count;
- accumulated ocean birth and consumption.

Three paired tests: Laramide at 40K and 80K (50 Myr, every 2 Myr); continental cycle seed 777 at 20K (1200 Myr, every 20 Myr). Comparisons are deterministic within each mesh; checksums do **not** compare the raw 40K mesh to the 80K mesh, only baseline and candidate on each.

## Decision and criteria

1. **Do not merge** candidate while new checks fail.
2. Keep unit test `v2/tools/check-ocean-age-return.mjs` as a guardrail for correct formation timestamps.
3. Locate the earliest divergence in Laramide / the continental cycle. Separate intended physics changes due to real age from accidental changes due to filling/background handling.
4. Consider a narrow physical-model revision only if it fixes a reproducible mechanism; do not raise thresholds opportunistically.
5. Rerun the existing suites on baseline and candidate after any experiment. Compare age distribution, continental balance, topology, and geomorphology.

The workflow data are independent, reproducible and preserved as GitHub Actions artifacts.
