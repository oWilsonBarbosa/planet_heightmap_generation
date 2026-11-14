# Ocean floor age regression — mechanism isolated

Date: 2026-11-14. Control: `audit/tectonic-baseline-20261114`. Experimental branch: `audit/ocean-age-return-20261114`. No changes to `main`.

## Confirmed observations

[Exposure trace #43650418278](https://github.com/oWilsonBarbosa/planet_heightmap_generation/actions/runs/43650418278), three complete 1200 Myr histories, snapshots every 50 Myr. All jobs passed.

- `seed=12345`, `20K`, `control`: visible inherited ocean grows from 2.24 Mkm² at 750 Myr to 51.46 Mkm² at 800 Myr (+49.22 Mkm²). The total stock of oceanic cells marked `formedAt<0` across live plate rasters grows from ~2.24 to 51.49 Mkm² (+49.24 Mkm²). A purely visibility-based explanation is excluded for this frame pair. At 800 Myr the principal holders of that material are newly named oceanic plates Thalassa 23, 22, 24 and 21; background itself holds only 2.07 Mkm².
- `seed=12345`, `40K`, `control`: visible inherited ocean grows by +24.79 Mkm² from 1150 to 1200 Myr and the raster stock grows +24.79 Mkm². At 1200 Myr, Thalassa 42 contains 15.14 Mkm² and the passive background 14.56 Mkm² of the visible inherited inventory.
- `seed=31337`, `40K`, `bothHalf`: another spike occurs 700–750 Myr (visible +51.2 Mkm², raster +51.3 Mkm²); background alone has ~37.1 Mkm² old ocean at 750 Myr, and the stock diminishes sharply again by 800 Myr.

All metrics are approximate using fixed area per cell, on the tectonic lattice. The aggregate raster inventory need not be a unique physical world area where rasters overlap, but **the near-identical increases in both stores reject a pure owner-projection explanation**.

## Fault candidate located

`v2/js/tectonics/ops/tidy-plates.js` → `giveToBackground` (when a disconnected oceanic fragment returns to the passive, immobile ocean):

```js
const w = index.nearest(P[0], P[1], P[2]), age = Math.min(plate.crust.formedAt[c], -1);
if (!background.crust.mask[w]) background.crust.create(w, CrustType.OCEAN, age);
```

The statement **converts any nonnegative oceanic formation date into -1 Myr**. Later, `birthOceanPlate` and `retireBackground` transfer that material from passive background into moving plates while retaining `formedAt`. Thus the category `formedAt < 0` can increase without actual formation of pre-history material. This is a provenance/age bookkeeping defect rather than a physical generation of old crust.

Additional pathways to check separately: `fillPinholes` initializes oceanic crust at `-initialOceanAgeMyr` in some gaps; `bridgePieces` can copy an existing nearby crust age. Neither has yet been quantified as causal in these spikes; do not modify without evidence.

## Minimal experimental fix

On experimental branch only, replace age-clamping with preservation of the original formation timestamp:

```js
const w = index.nearest(P[0], P[1], P[2]), age = plate.crust.formedAt[c];
```

The physical type remains OCEAN and fragments return to background as before; only formation metadata changes. All routine, default-model parameters are preserved.

## Paired A/B tests

[Ocean age return A/B experiment #43651084159](https://github.com/oWilsonBarbosa/planet_heightmap_generation/actions/runs/43651084159) is configured for:
- 20K/control/12345 (800 Myr spike);
- 40K/control/12345 (1200 Myr spike);
- 40K/bothHalf/31337 (750 Myr spike).

Each test writes the raster-versus-visible trace at 50 Myr and tectonic geography/age metrics at 100 Myr, using exactly the baseline seed, mesh and scenario. Compare against trace #43650418278 and provenance #43649231279. Do **not** assume the output is corrected merely because `formedAt<0` disappears: a remaining age tail of newly formed crust (>200 Myr) is an independent geodynamic concern.

### Acceptance

1. Eliminate unnatural *reclassification* of newly generated ocean to pre-history ocean.
2. Preserve physical crust, event timing, tectonic areas, plate motion, and deterministic histories as far as possible. Compare the metric trajectories, not just final means.
3. Verify that physically plausible genuinely prehistory ocean still has negative timestamps and that no `NaN` or artificially young oceans are introduced.
4. Investigate other sites creating negative age (especially `fillPinholes`) in a separate, minimal patch only if demonstrated.
5. After a successful A/B and relevant suites (`check-invariants`, `check-phase13`, `check-scale`), consider proposing the patch for review. **Do not silently merge into main.**

**Status at creation:** A/B workflow initiated, results not yet observed.
