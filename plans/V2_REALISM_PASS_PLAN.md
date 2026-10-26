# V2 realism pass: what the recordings showed, phase by phase

Twelve Evolution histories of 1200 Myr were recorded and measured on 2026-10-18: seeds 12345, 4242 and 31337, at 20K,
40K, 80K and 160K plate cells, with Terrain Detail 640K. The developer asked for the findings in three groups, in this
order: bugs and unrealistic behaviour, making the low resolutions look like the high ones, and broad realism. Then:
"Do all of it, but give me phases you want to implement it by."

Each phase works like this. It is built and verified alone. The developer tests it in the browser against its
checklist. Only the checks it can reach are run. It is committed when accepted, before the next phase starts.

## What was measured

### Plates and ocean

There are 5–7 moving plates on average, and almost none is purely oceanic. In 5 of 6 histories, one plate held 79–100 %
of the planet at some point. With seed 4242 at 80K, the planet was a single plate for 200 Myr.

The mean ocean-floor age is 104–150 Myr; Earth's is about 64. Between 15 and 27 % of the floor is older than 200 Myr.

### Speeds

In the first ~50 Myr after a breakup, 50–88 % of the land moves faster than 5 cm/yr. Over the whole history the median
is 3.3 cm/yr.

### Land share

Every run starts at about 28.8 % land. At 1200 Myr, 20K and 40K reach about 32 %, 80K about 29 % and 160K about 27 %.
The ranges across seeds do not overlap.

### Look at different resolutions

These measure alike at every resolution: hypsometry, high ground, texture, and the spread of land over latitude.

160K has half again as many islets (107 against 72 at 20K). Its coasts are more intricate (20.3 against 18.4).

At 20K, rifts are straight cuts, pockets in shelves are angular, and island arcs are blobs.

### Tools

The scratchpad tools that measure these are session-local. They will be rebuilt as `v2/tools/` scripts where a phase
needs them as checks:

- record a history on the page;
- compose the 2 × 2 videos;
- measure land speeds, ocean age and plate sizes in Node;
- measure the look on the pictures.

## Phase 1 — Plate colours, and land share at every resolution

- **Plates layer:** a welded plate keeps the colour of the larger partner. Today it keeps the colour of the plate whose
  frame survives the weld, so nearly the whole planet can change colour in one step. When a plate rifts, the larger half
  keeps the colour. This is display only.
- **Land share:** find the rule in the crust budget that counts cells or steps instead of km and Myr, and scale it. The
  candidates are arc maturation, erosive margins, continental underthrusting, the land a weld absorbs into its belt,
  scraps tidied away, and margin isles. Target: at 1200 Myr the land share at 20K and at 160K agree within about
  1.5 points over 3 seeds.

**Verify in the browser.** Use the Plates layer through a weld: seed 12345, 80K, around 470 Myr. There should be no
planet-wide colour change. The same seed at 20K and at 160K should end with about the same amount of land.

**Checks.** The land table over 3 seeds at 20K and 160K, then `check-scale` and the suites the cause touches.

**Planets change** at the resolutions where the rule misbehaved.

## Phase 2 — Living plates I: old margins founder inside a plate

Today a new trench can only begin where two plates meet. With this phase, an old passive margin inside one plate can
founder too. The rule is the same as the founder rule today: old ocean beside a long margin, and a chance per Myr from a
seeded stream of its own. The plate splits along the coast, and the ocean side becomes a plate of its own, with the
trench on the continent's side.

An assembled supercontinent is then ringed by trenches, Andean ranges and arcs, as Pangaea was, instead of holding its
whole superocean as one rigid plate.

**Targets:**

- no single-plate stretches;
- the largest plate holds at most about half the planet;
- the supercontinent is still one cohesive landmass;
- the cycle keeps its timing: the next supercontinent not before about 600 Myr, and the rift pacing per piece holds.

**Verify in the browser.** Seed 4242, 80K (the run that froze): after 880 Myr, trenches and ocean plates should appear
around the supercontinent. The Plates layer should show the superocean split off.

**Checks.** The plate table (count, largest plate, ocean age) for 3 seeds at 20K and 80K, then `check-phase6b`,
`check-phase6` and `check-phase13`.

**Every planet changes.**

## Phase 3 — Living plates II: oceans break into plates

A very large oceanic plate breaks along a new ridge (a ridge jump) or along a transform. The size threshold is in km²
and the break draws on its own seeded stream. If needed, when two continents weld, the ocean far from the suture
detaches as a plate of its own.

**Targets:**

- 10–15 plates on average;
- a mean ocean-floor age of 60–90 Myr;
- at most 5 % of the floor older than 200 Myr;
- ridges in every ocean.

**Verify in the browser.** The Plates layer should show many oceanic plates. The Terrain layer should show ridges
across the oceans and no blank basins.

**Checks.** The plate table, then `check-phase6b`, `check-phase7` and `check-phase13`.

**Every planet changes.**

## Phase 4 — Calmer breakups, smooth ocean plateaus

- **Breakups:** continents get a soft speed limit: a smooth saturation instead of the hard 10 cm/yr clip. The rift
  push, the mantle outflow and the dispersal repulsion also stop stacking in full. The outflow stays strong enough to
  break up a pile of unwelded plates, a lesson from Phase 13. Targets: in the first 50 Myr after a breakup, the median
  land speed is at most 5 cm/yr. Over the whole history it stays at about 3–4 cm/yr. The timing of the cycle is kept.
- **Ocean plateaus:** under the sea, a flood basalt is a smooth dome with a few seamounts. Mesas and stairs appear only
  above sea level. No rash of specks appears in a single step.

**Verify in the browser.**

- Seed 31337, 20K, 0–100 Myr: the pieces drift apart rather than fly to the poles.
- Seed 4242, 80K, 1120 Myr: the plateaus are smooth.

**Checks.** The speed table, then `check-phase13` and `check-phase7`.

## Phase 5 — Low resolution looks like high

- **Rifts bend at any resolution.** After the search, the dividing line is bent by a noise scaled in km. Every planet
  changes, the coarse ones most.
- **Shelf pockets.** Pockets of ocean below a size in km² are filled at shelf depth. The distance to the crust's edge is
  softened by a radius tied to the cell size. This is terrain only.
- **The missing 50–150 km band.** The coast's cell-scale warp is tuned, and islets are thresholded out of shallow
  shelves where the cell is coarse, so that 20K and 40K reach 160K's coast intricacy and islet count. This is terrain
  only.

**Verify in the browser.** Put the same seed at 20K beside 160K: the coasts and islands should read alike. Rifts at 20K
should curve.

**Checks.** The look table at 20K, 40K and 160K.

## Phase 6 — The ocean floor: segmented ridges, fracture zones, abyssal hills

This is done when the terrain is drawn. Ocean depth is read from crust age. The point where the age is read is shifted
along the spreading direction, by an amount that is constant along a ridge segment and steps from one segment to the
next. The ridge is then cut into segments offset by transform faults. The steps continue across the ocean as fracture
zones, which is how they form on Earth.

Abyssal hills are fine relief elongated parallel to the ridge. All lengths are in km.

**Verify in the browser.** Young oceans at 40K and 160K should read like Earth's ocean floor in shaded relief. There
should be no seam at the antimeridian. The look should be the same at every resolution.

## Phase 7 — Island arcs as volcanic chains

Islands are drawn along an arc's axis, at a set distance from its trench. The arc's platform becomes narrow and steep.
Volcanic peaks rise above the sea along the axis, like the Aleutians or the Lesser Antilles. Mature arcs stay long
islands, like Japan or Java.

This is independent of resolution, so it also removes the 20K blobs. Arcs were tuned with the developer before, so this
phase is shown as before and after.

## Phase 8 — Old ranges in the start supercontinent

The start supercontinent gets worn orogens along the sutures between its cratons. Only the height records change, so
the history stays the same and its hash is unchanged. The opening frames then read as an old supercontinent, and its
first rifts open along those ranges.

**Verify in the browser.** Crops of 0–50 Myr.

**Checks.** The history hash is unchanged.

## Impact log (measured as each change went in; everything is tuned together at the end — developer: "a lot of these changes will change the percentages … we can tune everything at the end")

Numbers from `check-phase13` (seeds 12345, 777, 4242; 40K; 1200 Myr) unless said otherwise. Committed engine first.

| change | land 0 → 1200 Myr | continental crust | lowland (< 400 m) | largest plate (≥ 100 Myr) | plates ≥ 1 % | open-ocean arcs (far / largest, Mkm²) | cycle |
|---|---|---|---|---|---|---|---|
| committed engine | +3 points (27.8 → 30.8 on 12345) | ×1.06 | 32–38 % | up to 100 % | ~6 | 3.8 / ≤ 3 (one seed fails) | all timing checks pass |
| + plate colours, erosion along the trench, founders inside every plate (phase 1–2, ungated) | +4.4 to +8.7 | ×1.07–1.25 | 25–29 % | 72–73 % | 7.3–8.6 | up to 16.9 / 11.5 | pass |
| + background retires, ocean splits (phase 3), founders ungated | +8.5 to +11.3 | ×1.14–1.31 | 24–26 % | 55–75 % | 8.3–10 | 9–12 / 7–10 | pass |
| founders only in plates ≥ 25 % of the planet (phase 2 gated) + phase 3 | +7.6 to +8.4 | ×1.16–1.22 | 25–30 % | 39–64 % | 8.0–9.0 (never < 3) | 6–8 / 3.4–10.9 | one seed gathers at 490 Myr, holds 70 |
| everything (phases 1–4, 6–8; speeds saturated, microplates captured, the step from surface speeds) | +5.7 to +9.4 | ×1.15–1.26 | 30–45 % (pass) | 41–76 % | ≥ 6 (pass) | 3.6–8.8 / 3.1–9.2 | gathers at 620–870 Myr (one seed late); one seed clumps 77 % while dispersing; histories 62–70 s each |

Other measurements:
- **Arc widths filled at once** (tried for the land/resolution gap): open-ocean arcs 5.7–11 Mkm² far out, largest 7–8 — against the developer's "far-ocean arcs grow unnaturally huge": reverted.
- **Phase 4, continental speed saturation** (S = 7 cm/yr), seed 31337 at 20K: post-breakup median land speed 7.9 → 5.4 cm/yr, land over 8 cm/yr 49 → 0 %; whole-history median 3.3 → 2.6 cm/yr.
- **Phase 3 at 20K, seed 4242:** plates holding ground ~6 → 12, mean ocean-floor age 104 → 91 Myr, older than 200 Myr 15 → 11 %; 2–6 ocean splits and 30–40 founders per 1200 Myr.
- **The land/resolution gap** (20K vs 160K continent + arc at 1200 Myr, 3 seeds): 34.6 vs 28.7 % before; erosive margins (per coast cell, 2.3× more at 160K) and arcs (one row per slow step) were its main causes. Erosion is now along the trench; the arc change was reverted (above). Developer: not a major issue — tuned at the end with the rest.

Levers for the end: the default continent size (developer: "we can just start default lower"), arc production and maturation, the founder's gate and rate, the split threshold, the speed saturation.

## Status (2026-10-18, end of the first pass — not committed)

| phase | state |
|---|---|
| 1 colours, land share | plate colours follow the larger partner; erosion along the trench. The arc-width change was reverted (it fattened open-ocean arcs). Developer: the resolution gap is not a major issue |
| 2 founders inside plates | built, gated to giant plates (≥ 25 % of the planet) |
| 3 oceans into plates | built: the background retires at 150 Myr, splits over 40 Mkm² of ocean, microplates captured |
| 4 breakups, plateaus | built: soft speed limits (continents 7, oceans 12 cm/yr), the step from real surface speeds; smooth ocean plateaus |
| 5 low resolution | skipped beyond the two small fixes (developer: "dont overindex on this small vs high resolution thing") |
| 6 ocean floor | built: fracture-zone coordinate about averaged spreading poles; segment age offsets and troughs. Wavier than Earth's — for the developer's eye |
| 7 arcs | one setting: open-ocean arcs mature to −1.5 km (was −0.7), so they read as a ridge with volcanic islands, not a pale platform |
| 8 old ranges | built: worn belts along about half the start supercontinent's sutures; plate history unchanged (hash) |

Speed: 600 Myr at 40K, seed 12345 — committed 561 steps / 24 s, now 506 steps / 28 s (more plates make each step dearer;
no new rule is hot in a profile).

## After the commit (9e909ee)

- **check-phase9** (steady detail) fails one check on the committed realism pass: at 290→300 Myr the continent that moved most
  (plate 11, turned 5.9°) has its land heights correlate 0.12 with 10 Myr before (0.45–0.49 before Phase 9). Its coasts and
  rivers hold. Probably the history's own change (more plates, faster turnover) — for the tuning pass.
- **Coasts and mountains at the sim's own scale** (developer: "obvious 'gridded' effects I can see on the coastline", then "apply
  a version of this everywhere to make the mountains look more nuanced"): the coast moved in and out by up to half a sim cell
  (`coastCellNoise`) and the high ground scaled by 1 ± 0.35 (`mountainCellNoise`), in waves of 2.5 sim cells and finer — the
  cell-sized lobes of coasts and blobs of highland broken at every resolution, live and in Add detail. Steady detail: a
  half-cell turn keeps 96.6 % of coasts (97.6 % without), land heights 0.86 (0.91).
- **Mountain noise removed (1009f69)** (developer: it "ruined the ridgelines … the overall structure of the mountain ranges");
  the coast noise stays, weaker on fresh coasts (d1ba336).
- **Mountains shaped along their belts** (v2/README.md, "Mountains shaped along their belts"): width, crest height and age
  blended over the belt's kernels; the envelope's and thickened crust's shapes from their profiles at the point; crests
  varying along the strike. Three things learned on the way:
  - The first form replaced each cell's part of the envelope and root, a part known only where a cell fit the profile —
    at belt edges and junctions the smooth version was added with nothing taken away: a 14.5 km summit (check-phase8a),
    the top 0.01 % at 7.9 km. Moving the shape instead (height × (profile here − profile as sampled)), only where the
    kernels' and the cells' distances agree within about a sim cell: 8.85 km, top 0.01 % 6.8 km (6.3 without the
    mountain work) — the summits a little less bold than in the first form, for the end tuning.
  - Blends read at the world cells' centres made a moving plate's ranges change with the grid: read at the crust each cell
    shows.
  - A coast following its Andean belt's smooth front (`coastFollowFront`) was tried and removed: the kernels' front is not
    steady enough as a plate turns (a half-cell turn kept 95.7 % of coasts against 97.4 %), and it barely showed.
  Checks 8a, 9, 10: the same failures as the committed tree (8a: main range behind the coast, young flood basalt; 9: ridges
  after a turn; 10: the two craton-front checks) — the 290→300 Myr check of 9 passes again.
