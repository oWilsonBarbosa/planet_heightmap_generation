# New climate for Evolution — plan

Draft, 2026-09-27, for the developer to agree before anything is built (plan first; one browser-verifiable phase at a
time). Branch `climate-rebuild`, in the worktree `.claude/worktrees/climate-rebuild`, from `v2-tectonics` at b0662f1.
Background: the research report `reports/Climate generation rewrite options.md` and its notes (main checkout).

## What the developer asked for (2026-09-27)

- **A new climate, built from scratch, for the Evolution tab only.** V1 keeps its climate untouched. V1 may get this
  climate *eventually*, most likely as part of a V1 rewrite, so the new code must not depend on V1 but must stay easy
  for a future V1 to call.
- **Why a rebuild.** Today's climate is hard to work on, too slow and unrealistic. The developer's own read: "I'm not sure
  any individual portion really works … a ton of errors that are averaging out in a direction that is sort of ok. The
  inability to understand it makes it very hard." The audit backs this for precipitation and Köppen.
- **Per-stage tuning is critical**, with a final Köppen-level tuning on top.
- **Four points in the year**, if it can be done reliably.
- **Fast on phones**: not much slower than today's climate, ideally faster.
- **Mediterranean climates must be there**; they can be worked on in a later phase.
- **Best results win, not physics for its own sake**: "we dont NEED physics, we should do the thing that produces the
  best results."
- Work happens in a separate worktree.

This replaces step D of `plans/V2_FULL_PLANET_PLAN.md` ("climate from V1"). That plan should be updated once the
Evolution work is merged into this branch.

## The shape of the new climate

**One pure module**, `v2/js/climate/`. It is DOM-free and runs in a worker, with no imports from V1's climate files. It
has one entry point:

`computeClimate(input, options)`

- **Input.** Everything is generator-neutral:
  - cell positions on the unit sphere and the pole axis (Evolution is z-north);
  - elevation in km (Evolution's heights already are);
  - an optional land mask (default: elevation > 0; Evolution's crust type can refine it).
- **Options:** axial tilt (fixed at Earth's 23.4° unless the developer asks for a control), temperature offset, rain
  scale, seed.
- **Outputs.** In physical units:
  - 12 monthly temperatures (°C) and rain totals (mm), synthesised from 4 anchors;
  - pressure, wind, currents and sea temperature at the 4 anchors;
  - a Köppen id per terrain cell, using V1's 31-class table and colours so the maps look familiar.
- **Memory.** Monthly values are not stored for every terrain cell (2.5M × 24 values would be too much). Each cell is
  classified directly from the grid fields plus its local height corrections.

**Fixed climate grid.** The climate runs on a fixed grid (1° lat-lon by default; the final size is set by the speed
budget). The grid is the same at every terrain resolution (160K, 640K, 2.5M) and on every device. Only local work with
a fixed footprint in km touches the terrain cells: lapse rate and upslope rain. Köppen is classified per terrain cell
from continuous fields, never interpolated. Scale invariance holds by construction. A lat-lon grid also paints
straight onto Evolution's texture globe.

**Stages are slots with a contract.** The order is temperature → pressure and wind → ocean → rain → months → Köppen.
Every stage:
- answers one question;
- outputs physical units;
- has its own layer in the lab;
- has its own Earth reference and score;
- owns a handful of knobs (about 4–8) with physical meaning;
- never reads a later stage;
- never patches another stage's output.

**Best method wins, per stage.** Candidates for each slot are:
- physics (the report's picks: energy balance, derived pressure, wind-driven gyres, a column-water budget);
- an empirical fit to Earth data;
- a borrowed rule (ideas from Undiscovered Worlds, mapgen4, WorldForge 2, or a good idea from V1's climate);
- a small learned model.

A bake-off picks the winner, judged in this order:
1. The stage's score against its Earth reference.
2. The non-Earth checks: synthetic continents, paleo snapshots and Evolution supercontinents. A method that wins on
   Earth by memorising Earth fails here and loses.
3. How it looks to the developer in the lab.
4. Speed.

## Scoring: every stage against Earth, Köppen on top

**Earth references.** These are downloaded once, regridded offline to the climate grid, and kept in
`tuning/climate/data/` (gitignored, with a fetch-and-regrid script):

| Stage | Reference | Licence |
|---|---|---|
| Pressure, wind, sea temperature, sea ice | ERA5 monthly means (needs a free Copernicus account), or NOAA's NCEP reanalysis (no account) | CC BY 4.0 / public domain |
| Monthly temperature and rain | CHELSA V2.1 | CC0 |
| Köppen | Beck V3 (1991–2020) | CC BY 4.0 |

Earth is fed to the new module the same way an Evolution frame would be: positions plus elevation in km from
`assets/earth.png`.

**Open loop, then closed loop.** A stage is first scored with *observed* inputs, so its error is its own. Then it is
scored fed by the new upstream stages. **Truth swaps** attribute Köppen errors to a stage: observed temperature with
simulated rain, and the reverse.

**Tuning:**
1. Each stage is tuned against its own reference, then frozen.
2. A final Köppen-level tune on top then adjusts only a few coupling and classification knobs. Every stage score is a
   guardrail that may not regress beyond a set tolerance, so the final tune cannot buy Köppen points by breaking a stage.

**Gates.** These are pass/fail, not weights in the objective:
- **Regimes present**:
  - Mediterranean on west coasts at 30–45°;
  - the South Asian monsoon;
  - Cfb in Western Europe;
  - BWk in the Gobi;
  - BSk in Patagonia.
- **No drift across terrain resolution**: 160K, 640K and 2.5M agree.
- **Synthetic continents behave**: a flat tropical rectangle, a mid-latitude rectangle (desert → Mediterranean → oceanic
  up its west coast, humid east coast), and an equatorial supercontinent (dry, continental interior).
- **The speed budget** below.

**Baseline.** V1's current climate, run read-only on Earth, is scored the same way in Phase 0. The new stages must beat
it.

## Speed budget

- **The reference is V1's climate today**, measured on the desktop: **0.51 s at 40K, 2.07 s at 160K, 10.9 s at 640K**.
  Phones have not been measured yet.
- **Budget.** "Calculate climate" for any Evolution moment must be no slower than V1's climate at its 40K default,
  on the desktop and on a phone, at Evolution's default terrain resolution. At 2.5M it must still take only a few
  seconds. The climate grid's cost does not grow with terrain resolution; only the per-cell finishing does.
- **Levers if the budget is tight**, in order:
  1. a coarser grid (1.5° or 2°: 2.25–4× fewer cells);
  2. fewer coupling iterations;
  3. WASM SIMD for the hot kernels, only if it reproduces the Köppen classes exactly.

  The grid is the same on every device. A phone-only coarser grid would give phones a different planet.
- The lab page gets a timing button the developer can open on a phone.

## Seasons: four anchors, proven before they are used

The model runs at 4 points of the orbit, a season apart. The temperature stage carries the seasonal lag. The 12 months
are synthesised from the anchors:
- **Temperature**: a mean plus harmonics.
- **Rain**: a shape that stays positive and can dip to near zero in a dry season.

**Phase 0 tests this on real data first.**
- The test: take CHELSA's 12 observed months, keep 4 a season apart, rebuild the 12, classify, and compare with the
  classification from all 12.
- Proposed gate: at least 95 % of land keeps its class, and Cs, Cw, Am and Dw each keep at least 90 % of their area.
- If the gate fails, the model uses 6 anchors (×1.5 the seasonal cost), or 12 if it must.

## The phases (each confirmed in the browser before the next)

Nothing in V1 (`js/`, `index.html`, `import.html`) is modified at any point. Phases 0–6 need nothing from the Evolution
page, so they can proceed while that page is still being built. Where a stage is not built yet, Earth uses observed
fields and test planets use a simple zonal first guess. Each gate is a single evaluation run, not an optimiser sweep.

| Phase | Builds | Check in the browser | Gate before approval |
|---|---|---|---|
| **0. Groundwork and measurements** | Earth references fetched and regridded; a **climate lab page** (Earth and test planets on a globe and map, any field as a layer, simulated vs observed side by side, season slider, timing button); per-stage scores and truth swaps for V1's current climate (read-only); the 4-anchor test; speed of V1's climate and of basic grid work on the desktop and the developer's phone | The lab shows V1's current fields next to real Earth; a table shows which of today's stages work, how much of the Köppen error each causes, and the timings | Baselines recorded; 4-anchor gate passed (or the anchor count decided); phone numbers known |
| **1. Skeleton** | `v2/js/climate/`: the input contract, fixed grid, aggregation from terrain, per-cell finishing, 12-month synthesis, Köppen with Beck's rules | Earth Köppen from *observed* data looks the same at 160K, 640K and 2.5M | Drift ≈ 0; oracle ceiling recorded; skeleton cost within budget |
| **2. Temperature** | Bake-off (energy balance first); temperature offset; tilt as an internal option | Monthly temperature vs CHELSA; big seasonal swings inland, mild ocean-side climates, seasonal lag | Beats V1's temperature score open loop; truth swap beats V1's |
| **3. Pressure and wind** | Bake-off (derived pressure first) | Pressure and wind by anchor vs ERA5: summer lows over continents, highs over eastern oceans, monsoon reversal | Beats V1's wind score; temperature does not regress in closed loop |
| **4. Ocean** | Bake-off (wind-driven gyres first); sea temperature, coastal upwelling, sea ice | Gyres with strong western boundary currents and a circumpolar current; cold upwelling coasts; ice by month | Sea-temperature pattern beats V1's ocean warmth; cold coasts present |
| **5. Rain** | Bake-off (column-water budget first); upslope rain on the terrain | Monthly rain in mm vs CHELSA; rain shadows; monsoon wet and dry seasons | Beats V1's rain score; truth swap beats V1's |
| **6. Close the loop and tune on top** | Coupled chain; final Köppen-level tune within the stage guardrails | Full climate on Earth, synthetic continents and saved Evolution frames, at all terrain resolutions, desktop and phone | Every stage near its open-loop score; Köppen beats V1 on Earth; no-drift, synthetic-continent and speed gates pass |
| **7. Into Evolution** | "Calculate climate" button for the moment shown; climate layers in Evolution's globe and map (Köppen, temperature, rain, wind, currents, sea ice), kept per moment while the history is open; climate maps in its exports; phone layout; README, tutorial, SEO and `llms.txt` updates; What's New question | Any frame gets its climate in seconds; a supercontinent's interior reads dry and continental; works on a phone | Developer sign-off |
| **8. Mediterranean** | Whatever makes the Mediterranean gate pass: first from the circulation, else a named, smooth mechanism inside the circulation or rain stage (eddy moisture scaled by storm-track strength, descent west of monsoon heating, or an Undiscovered-Worlds-style shift of rain into winter). Never a downstream patch | West coasts at 30–45° show Cs on Earth and on Evolution planets | Regime gates pass; nothing else regresses |

Phases 7 and 8 can swap if the developer wants Mediterranean climates in place before the climate reaches Evolution.

## Phase 0 — built 2026-09-27, awaiting the developer's check

**What was built**
- **Earth references.** `tuning/climate/fetch-references.mjs` and `regrid-references.mjs` put the reference data on
  the 1° grid (`v2/js/climate/grid.js`):
  - pressure, wind, SST, sea ice and GPCP rain from NOAA (public domain, no account);
  - monthly temperature and rain plus the Köppen map from Beck et al. 2023 (CC BY 4.0).

  Beck's monthly data is the data behind Beck's own map, so it replaced CHELSA: the answer keys are consistent, and the
  files are small.
- **The Köppen classifier with Beck's rules**, `v2/js/climate/koppen.js`, plus 12-month synthesis from K points,
  `v2/js/climate/seasons.js`. These are the first two pieces of the new core.
- **The climate lab**, `v2/climate-lab.html`:
  - real Earth next to V1's climate on the imported Earth, on a globe, a map, or side by side;
  - fields: Köppen, temperature, rain, pressure and wind, ocean warmth, sea ice;
  - the rain belt (ITCZ), observed vs V1;
  - the per-stage scores, the truth swaps and the season test;
  - timing buttons.

  It works in a phone-sized layout: bottom sheet, 44 px controls.
- **Per-stage audit and season test.** `tuning/climate/stage-audit.mjs` (V1 per stage, truth swaps) and
  `season-test.mjs` (K points in the year).
- **Earth mesh refactor.** The mesh builder is now environment-free (`tuning/climate/lib/earth-mesh.mjs`, shared by
  Node and the browser). The Earth context plus V1 climate hash is unchanged (`hash-earth.mjs`: b62546c8…).

**What the numbers say** (V1 at 160K on the imported Earth, against observations; June–August / December–February)

| Stage | V1 against real Earth | Reading |
|---|---|---|
| Pressure | pattern corr. 0.57 / 0.45; land–sea highs and lows corr. 0.28 / 0.31 | poor: prescribed belts, weak continental pattern |
| Wind | direction within 45°: 56 % / 55 % (sea 62 %, land 31 %) | poor |
| Rain belt (ITCZ) | typical error 10.5° / 13.2°; mean latitude 18.8° vs real 8.5° (Jun–Aug) | poor: far too far poleward |
| Ocean warmth | vs the real warm/cold current pattern: corr. 0.22 / 0.22 | poor |
| Temperature | corr. 0.97 / 0.93; typical error 4.9 / 7.8 °C | the best stage, but winters are off |
| Rain | log corr. 0.49 / 0.59; wet season the right way round 76 % | poor |

Köppen against the Beck map, with every row using the new classifier:

| Temperature + rain | Same class | Same group |
|---|---|---|
| Real 12 months | 93.1 % | 97.1 % |
| Real, 2 seasons only (the best any 2-season model can do) | 82.2 % | — |
| V1 + V1 | 38.3 % | 71.3 % |
| Real temperature + V1 rain | 55.8 % | — |
| V1 temperature + real rain | 65.7 % | — |

**The developer's hypothesis is confirmed.** Every stage except temperature is individually poor, and **rain costs the
most**. V1 as shipped scores 33–38 % against Beck (37.6 % per region at 0.1°).

**Speed on this desktop (Chrome).**
- V1's climate on Earth: 0.9–1.0 s at 40K, 3.4 s at 160K. That is the budget.
- The new core's building blocks on the 1° grid:

  | Building block | Time |
  |---|---|
  | Diffusion pass | 0.22 ms |
  | Semi-Lagrangian advection step | 1.3 ms |
  | Sampling 4 fields onto 2.5M cells | 0.44 s (including their lat/lon) |
  | 12 months + Köppen for 160K cells | 58 ms |
- **Phone: not measured yet.** Open the lab on the phone (same Wi-Fi, dev server running):
  `http://192.168.1.230:8147/v2/climate-lab.html` → Speed.

**Four points in the year: the gate is not met.** These are Köppen results rebuilt from K points of real data, with
the points on the months where Earth's seasons peak:

| Points | Land keeping its class | Cs | Cw | Am | Dw | Gate |
|---|---|---|---|---|---|---|
| 2 | 83.7 % | 71 % | 69 % | 45 % | 76 % | no |
| 4 | 93.6 % | 89 % | 85 % | 89 % | 84 % | no (needs 95 / 90) |
| 6 | 96.5 % | 92 % | 94 % | 92 % | 94 % | **pass** |

With 4 points, temperature alone is fine (97.8 % of land kept); the losses come from rain (95.7 % alone).
**Decision for the developer:**
1. 6 points everywhere (×1.5 the seasonal cost). This is the default in Phase 1.
2. 4 points for temperature and circulation, 6 for rain.
3. 4 points everywhere, accepting ~94 %.

The core takes K as a setting, so this can change later.

## Phase 1 — built 2026-09-27 overnight (the developer asked for it to go ahead), awaiting the developer's check

**What was built:** `v2/js/climate/core.js`, the one generator-neutral entry point, `computeClimate(input, options)`.
- **Input:** cell positions, elevation in km, `axes: 'y-up'` (V1) or `'z-up'` (Evolution), optional land mask. No
  plate data.
- **Pipeline:**
  1. cell latitude and longitude;
  2. the surface aggregated onto the 1° grid (land fraction, mean land height);
  3. the climate at K points in the year;
  4. 12 months on the grid;
  5. per terrain cell: bilinear sampling of the grid fields, temperature corrected for the cell's own height
     (6.5 °C/km, via sea-level reduction), and Köppen per cell.

  Nothing is stored per cell per month.
- **The physics stages are not built yet.** The K-point fields come from `options.anchorSource`. On Earth,
  `observedAnchors()` feeds real monthly data (the "oracle" run), and later phases replace it stage by stage.
- **Defaults:** 6 points, rain interpolated as a square root, grid 1°.
- **Lab:** the climate lab has a "New climate · Phase 1 skeleton" panel. It runs the core in a worker at 160K, 640K or
  2.5M, with 4, 6 or 12 points and the height correction on or off. It scores the result against Beck's 0.1° map and
  draws the per-cell Köppen (Köppen → "New (Phase 1)"; use Side by side to compare with Beck).
- **Check:** `tuning/climate/skeleton-check.mjs` runs the same at 160K, 640K and 2.5M.

**Numbers:** Earth with real data, per terrain cell, against Beck's 0.1° map.

| Terrain cells | Same class (6 points) | 12 months | No height correction | Group | New climate time (Node) |
|---|---|---|---|---|---|
| 160K | 87.6 % | 88.6 % | 86.2 % | 95.0 % | 48 ms |
| 640K | 87.9 % | 89.0 % | 86.2 % | 95.1 % | 62 ms |
| 2.5M | 87.9 % | 89.0 % | 86.2 % | 95.1 % | 162 ms |

- **Gate: passed.**
  - Across resolutions the share of land in each class differs by at most 0.40 %, and group shares by 0.17 points.
  - Without the height correction, agreement spreads by only 0.08 points.
  - With it, agreement rises by 0.3 points at finer terrain, as mountains resolve. That is wanted, not drift.
  - For comparison, V1's temperate share falls from 17.9 % to 10.6 % between 40K and 640K.
- **The oracle ceiling is ~88 % same class and ~95 % same group per terrain cell.** No physics can beat it with this
  pipeline, so the stages to come are judged against it, not against 100 %.
  - The ceilings for the seasonal regimes are lower: Cs 72–74 %, Cw 76–77 %, Am 83 %, Dw 73–75 %. Much of that comes
    from coarse 1° rain at coasts and mountains, which the upslope rain in Phase 5 can improve.
- **Speed (desktop Chrome):** the new climate takes 65 ms at 160K and 0.34 s at 2.5M. V1 takes 0.9 s at 40K and about a
  minute at 2.5M. The skeleton is far inside the budget; the physics stages get the rest.
- **Evolution's axes:** the same Earth turned to z-north classifies identically, cell for cell.

**Not in Phase 1 (as planned):** any physics; a first-guess source for planets other than Earth (it comes with the
temperature stage in Phase 2); README and `v2/README.md` updates. Both READMEs have uncommitted edits in the main
checkout, so they are updated when this branch is merged, to avoid conflicts. The tuning README is updated.

## Still to decide

1. **Where the code lives.** Recommended: `v2/js/climate/`, so V1 is untouched and a future V1 rewrite imports it from
   there.
2. **Truth map: Kottek → Beck.** Recommended. V1's baseline is scored on Beck too, so the comparison is like for like.
3. **Reproducibility.** Recommended: the same Köppen classes on every device, with plain JS as the canonical path.
4. **Axial tilt.** Fixed at Earth's value for now: Evolution keeps its three sliders unless the developer asks.
5. **Machine learning** only as a bake-off candidate that wins on the scores and passes the non-Earth gates.
6. **The CLAUDE.md smoothing rule.** The new climate avoids the problem (long-range work happens on the fixed grid, in
   km). Fixing the rule for V1 and terrain code can wait for the V1 rewrite.

## Practical notes

- **The Evolution page is not in this branch yet.** It exists only as uncommitted work in the main checkout
  (`evolution.html`, `v2/js/evolution/`, `v2/evolution.css`). Phases 0–6 do not need it. Phase 7 needs it committed on
  `v2-tectonics` and merged into this branch.
- **V1's climate is read, never changed.** Its modules are imported read-only by the lab and the benchmark, for the
  baseline.
- **The ground truth is not in the worktree.** `tuning/climate/data/` is gitignored, so the Kottek ground truth must be
  copied in from the main checkout.

## Phase 2 — the temperature stage, built 2026-09-28, awaiting the developer's check

**The developer's direction during the phase.**
- "Make sure the parameters are those that would most naturally transfer seamlessly to another world … not treat the
  earth comparison like gospel."
- Tune on the whole Earth, but make the evaluations continent-aware.

**How that was applied.**
- Every setting is a physical quantity with a literature value and a range (`v2/js/climate/config.js` `PARAM_PRIORS`).
- Tuning (`tuning/climate/temperature-check.mjs --tune`) uses the whole Earth:
  - each continent is scored on its own and weighted equally;
  - no continent may end up more than 0.15 °C worse than with the literature values;
  - every setting pays for moving away from its literature value.
- A first try, tuning on the Americas and checking on the rest of the world, overfit: the rest got worse. The fix was
  physics, not more tuning.

**What was built.** `v2/js/climate/temperature.js`, a seasonal energy-balance model solved directly for the yearly
cycle: the mean and two harmonics, a few outer iterations for snow and ice, and no spin-up. It has the following
physics, each piece a physical mechanism that works on any planet:
- **Sunlight** for any axial tilt (`insolation.js`).
- **Heat radiated to space.**
- **Heat spreading**, stronger north–south than east–west. Weather carries heat mainly poleward; land and sea exchange
  air through the winds.
- **Heat carried by the winds.** The Earth run uses the observed winds for now.
- **Heat storage:** land small, a mixed-layer ocean, and frozen sea storing little.
- **Albedo** rising toward the poles, with seasonal snow on land reflecting little. Snow that survives the summer, an
  ice sheet, reflects like sea ice.
- **Height.** Sunlit plateaus cool 4.8 °C/km, ice sheets 8 °C/km, and the terrain below the grid 6.5 °C/km.
- **Winter inversions.** Air by snowy ground under a weak sun is up to 10 °C colder, mixed away by wind.

Around the stage:
- `solver.js`: a multigrid solver on the lat-lon grid, checked by `tuning/climate/test-solver.mjs`.
- `inputs.js`: observations for stages not built yet on Earth, and placeholders (textbook wind belts, a zonal rain
  curve) on other planets.
- `test-planets.js`: three synthetic continents.
- The core now takes `stages: { winds, temperature, rain }`.
- The lab runs the new climate on Earth or a test planet. It adds "New" and "New − observed" sources for Temperature
  (every month), a Seasonal swing field, and a Phase 2 results section.

**Tuned (light).** From the literature values:

| Setting | Literature | Tuned |
|---|---|---|
| Snow albedo | 0.40 | 0.325 |
| Land heat store | 8.4e6 | 8.93e6 |
| Wind heat-carrying | 0.05 | 0.106 |
| Inversion wind | 5 | 4.7 m/s |
| Plateau lapse | 5.0 | 4.84 °C/km |

Everything else stayed at its literature value.

**Numbers.** Earth, with observed winds; typical monthly error on land.

| Region | New | June–August / December–February: new | V1 |
|---|---|---|---|
| North America | 4.8 °C | 3.7 / 5.3 | 4.1 / 8.3 |
| South America | 3.1 | 2.3 / 3.5 | 4.2 / 3.8 |
| Europe | 6.0 | 3.6 / 7.4 | 4.2 / 5.6 |
| Africa | 4.3 | 4.6 / 3.0 | 4.1 / 3.4 |
| Asia | 5.2 | 3.6 / 6.0 | 4.8 / 10.5 |
| Australia | 3.5 | 2.6 / 4.4 | 2.0 / 5.2 |
| All land | 5.3 | 4.2 / 5.4 | 4.9 / 7.8 |

- **Seasonal swing on land:** 19.6 °C modelled vs 19.6 real; Siberia 43 vs 47, Canada 32 vs 37.
- **At sea (ice-free):** 3.0 °C typical error.
- **Köppen with the real rain:** new temperature 68 % same class / 86 % group, against V1's temperature at 64 % / 85 %.
  The ceiling with real temperature is 88 %.
- **Test planets:** all physical checks pass.
  - Seasons are biggest inland, then on the coast, then at sea.
  - The west coast is milder than the east in winter.
  - Land is hotter than the sea in summer and colder in winter.
  - Seasons are small at the equator.
  - Supercontinent interior swing 38 °C vs 6 °C at sea.
- **Speed:** the temperature stage takes ≈ 0.19 s warm in Node (2° grid; 1° scores the same at three times the cost).
  The whole new climate at 160K takes 0.25 s in desktop Chrome.

**Gate: passed.**
- June–August / December–February error with continents weighted equally: 4.2 °C vs V1's 5.0 °C.
- Truth swap beats V1's.
- Test planets pass.

**Known remaining errors, and where they get fixed.**
- **Europe is ~3.5 °C too cold.** Its winter error is 7.4 °C. It is missing the ocean's heat transport (the Gulf
  Stream): Phase 4.
- **Hot desert summers are too mild and the cloudy tropics too warm** (Sahara July 27 vs 33 °C, Amazon 30 vs 26 °C).
  These need rain and clouds feeding back on temperature: Phase 6 coupling.
- **Tibet's winter is too cold** (−23 vs −16 °C). Real Tibet is dry, so it has little snow. This also needs rain: Phase 6.
- **Antarctica is ~8 °C too warm, but stays ice cap.** It is not tuned on; ice-sheet physics is minimal.

## Phase 3 — pressure and wind, built 2026-09-28 (the developer asked for all phases to continue)

**What was built.** `v2/js/climate/circulation.js`: sea-level pressure and near-surface winds derived from the
temperature, with nothing placed at Earth's latitudes.
- **Zonal belts.**
  - The tropical trough sits at each longitude's own warmest latitude: over the sea the warmest water, over a summer
    continent its heat low, i.e. the monsoon trough.
  - The subtropical highs sit at the Hadley-cell edges (Held & Hou, from this planet's equator-to-pole contrast).
  - The subpolar lows sit one Ferrel cell further out.
  - The midlatitude pressure drop grows with the temperature contrast across the storm belt, and more where the belt
    is open sea.
- **Thermal lows and highs.** Air warmer than its latitude's average leaves low pressure, colder air high pressure,
  smoothed at the Rossby radius. Warmth is measured at the free air's lapse rate, so sunlit plateaus count as the
  elevated heat sources they are (the Tibetan and South Asian summer low).
- **Winds from pressure with friction:** one linear balance gives winds along the isobars at midlatitudes, turned
  toward the lows (more over land), and straight down-gradient at the equator.
- **Coupling.** In the core, temperature and winds need each other; two rounds settle them, the second temperature
  starting warm.
- **Scoring.** `tuning/climate/circulation-check.mjs` scores per continent and ocean basin, each weighted equally. It
  also checks named features and the test planets.
- **Lab:** Pressure & wind → "New" and "New − observed" for any month, with the new rain-belt line in cyan. On Earth,
  the new climate can run with derived or real winds.

**Open-loop input.** It should have been NCEP's near-surface air temperature, but NOAA's server was down (503) all
morning. The run used "real where observed" instead: Beck on land, OISST at sea, and the Phase 2 model for the 14 % of
cells under sea ice or in gaps. The script switches to NCEP air automatically once it is downloaded.

**Tuned (region-aware, priors).** Hadley scale 1.43, Ferrel width 35°, tropical drop 9.6 hPa, midlatitude
0.49 hPa/K, open-sea boost 0.69, polar high 4.75 hPa, thermal 0.78 hPa/K, Rossby radius 812 km, friction turning
10° at sea and 32.5° on land. Three of these sit at or near the edge of their range (Ferrel width, sea turning, Hadley
scale), a hint of the simple structure's limits.

**Numbers, against V1 on the same cells** (June–August and December–February means; regions weighted equally):

| Measure | New | V1 |
|---|---|---|
| Wind direction within 45° | **73 %** | 52 % |
| Pressure pattern error | **2.9 hPa** | 4.0 hPa |
| East–west pressure correlation | **0.57** | 0.30 |
| Rain belt, distance from the real rain maximum | **7.0°** | 11.6° |

**Named features on Earth, all passing:**
- the South Asian monsoon: south-westerly in July, north-easterly in January;
- the West African monsoon;
- the East Asian winter monsoon;
- summer highs over the eastern Pacific and Atlantic, at about half their real strength;
- the Siberian High and the Aleutian Low, at about half their real strength.

**Coupled, on Earth:** temperature error is 4.39 °C with its own winds vs 4.48 °C with the real winds (no worse), and
Köppen with real rain is 68.1 %.

**Test planets, all passing:**
- trade winds and westerlies appear on their own;
- a thermal low over the summer continent and a high over the winter one;
- westerlies onto the west coast;
- on the tropical continent the rain belt swings ±11° over land against ±1° at sea;
- southerly summer monsoon winds on the tropical continent and onshore ones on the supercontinent.

**Gate: passed.**

**Known limits.**
- **Weak circulation features.** The Siberian High, Aleutian Low and eastern-ocean summer highs are about half their
  real strength. That matters for Mediterranean climates; Phase 8 revisits it.
- **Southern Ocean winds** are right in direction (≈ 87 % within 45°) but too weak (≈ 0.4 of the real speed).
- **Rain-belt measure.** Over the Sahara the rain belt follows the heat low (≈ 20°N, the real surface front) rather than
  the rain maximum (≈ 10°N). The rain stage (Phase 5) decides where rain actually falls.
- **Speed.** Circulation is ~80 ms. The coupled temperature ↔ winds step is ~0.5 s in Node and ~0.9 s cold in Chrome;
  a speed pass is due before Phase 7.

## Phase 4 — ocean, built 2026-09-28

**What was built.** `v2/js/climate/ocean.js`:
- **Wind-driven gyres.** A Stommel solve for the ocean's transport on the 2° grid, forced by the curl of the wind
  stress. Coasts are held fixed by a large pinning term. East–west friction sets the western boundary current's width
  (about two cells); north–south friction is kept small so the open ocean keeps its Sverdrup balance.
  - This was found with a Stommel box test. Isotropic friction wide enough for the grid smeared the gyres to ~30 % of
    Sverdrup.
- **Circumpolar channels.** Latitude rows that are open sea all round carry a friction-balanced eastward current. The
  landmasses on either side are held at different transport values, which lets the current through.
- **Wind stress** includes a gustiness speed. Monthly-mean winds lack the storms, and stress grows with the square of
  the speed.
- **Heat for the temperature stage** (a yearly source or sink for the sea's surface layer, with the net removed):
  - currents carrying the sea temperature, warm water poleward on western edges;
  - Ekman upwelling of cold water where winds push surface water away (the California, Peru, Benguela and Canary
    coasts; the equatorial Pacific).
- **Coupling:** temperature ↔ winds ↔ ocean, three rounds. Monthly sea ice is now also an output of the temperature
  stage.
- **Check and lab:** `tuning/climate/ocean-check.mjs`; in the lab, Ocean warmth → New (with current arrows), Sea ice →
  New.

**Tuned (basin- and continent-aware).** Heat share 0.073, gustiness 4.3 m/s, channel drag 7.3e-7; friction and upwelling
stayed at their literature values.

**Numbers (open loop, real winds).**
- The sea's east–west pattern (warm western, cold eastern boundaries): correlation 0.43 with the ocean vs 0.30 without.
  For June–August / December–February: 0.36 vs V1's ocean warmth at 0.24.
- Monthly error, with the ocean vs without:
  - North Atlantic sea temperature 3.4 vs 4.1 °C;
  - Europe's land temperature 5.4 vs 6.0 °C.
- Named features that pass:
  - the Gulf Stream and Kuroshio flow poleward;
  - the California and Humboldt currents flow equatorward;
  - the circumpolar current flows east (≈ 70 Sv);
  - the four upwelling coasts are colder than their latitude, by 1–2 °C where reality has 3–6 °C;
  - the equatorial Pacific has a cold east.
- **Coupled:** Europe's temperature error is 5.1 vs 5.4 °C without the ocean. Mean land error is unchanged or slightly
  better, and Köppen with real rain is unchanged (68 %).
- **Test planets:** warm poleward currents along the east coasts, cold equatorward ones along the west coasts, and the
  sea colder off west coasts.

**Gate: passed.**

**Known limits.**
- **The North Atlantic is not warmer than its latitude** (−0.6 °C vs a real +3). The gyre's heat settles off North
  America. The extra real warmth comes from the deep overturning circulation, which this model does not have.
- **The coupled sea pattern is weaker than with real winds** (east–west correlation ≈ 0.05 vs 0.43). The derived winds
  are weaker and smoother than the real ones.
- **Sea anomalies are about a third of the real ones**, and currents slow (a 2° grid and climatological winds).


## Phase 5 — rain, built 2026-09-28

**What was built.** `v2/js/climate/rain.js`, a column-water budget on the 2° grid at each point in the year:
evaporation − rain − ∇·(uW) + ∇·(K∇W) = 0 for the air column's water W (mm).
- **Evaporation.** From the sea by the bulk formula (warmer water and stronger wind evaporate more; gusts and storms
  add to the monthly-mean wind; none under sea ice). From land at a Priestley–Taylor potential rate (the sunshine
  reaching the ground less its net longwave loss), limited by the water the ground holds (Turc–Pike).
- **Snow and soil.** A small bucket through the year: snow piles up below freezing and melts above it; the soil holds up
  to 150 mm. A second pass over the year lets snowmelt and soil water feed summer evaporation (continental interiors).
- **Transport.** Flux form, so water is conserved (rain = evaporation to ≈ 1 % every month).
  - The rotational part of the wind above the friction layer moves the whole column.
  - The divergent part (Helmholtz decomposition) moves only the converging layer's water: shallow under dry air,
    deep where the column is moist and convecting.
  - Eddy mixing K = K_min + σ_Eady·L²: strongest in the storm belts.
- **Rain-out** grows exponentially with the column's relative humidity (Bretherton et al. 2004). The saturated column
  follows a blend of the surface and its latitude's temperature: the troposphere over a hot desert or a frozen
  continent stays nearer the zonal mean.
- **Storms** spread the month's humidity (by the Eady growth rate of the zonal-mean temperature gradient, the thermal
  wind capped at a realistic jet shear). Rain grows exponentially, so this boosts the winter storm belts' rain: winter-wet
  west coasts come out by themselves.
- **Stable air** (a surface colder than its latitude, carried with the air for about a day) rains less: the Atacama,
  cold coasts, dry winter continents.
- **Mountains.** The solve is for the sea-level-equivalent column. Only the part of the column above the higher of two
  cells crosses between them (carried or mixed), so water piles up and rains windward, and a share gets over. Upslope
  lift rains out too, reduced by flow blocking (Froude number).
- **Solver.** `solver.js` gained a flux form with per-face open shares and per-row diffusion. The existing stages' results
  are bit-identical. Newton steps with an upward step limit (the exponential overshoots otherwise).
- **Check and lab.**
  - `tuning/climate/rain-check.mjs`: real winds and the circulation stage's own winds, per continent (Beck) and ocean
    basin (GPCP); V1 on the same land; named features; a like-for-like truth swap; every stage new; test planets.
  - `diag-rain.mjs`, `diag-planet-rain.mjs`.
  - A new test planet with a coastal range.
  - In the lab: Rain → New, a Rain switch in "New climate", and a Phase 5 table.

**Tuned** on both wind sources (continents and basins weighted equally, priors, none worse than with literature values):
rain-out 1.9 h / steepness 12.4, rotational wind 0.76, stability 0.03, column follows the surface 0.41. Two settings
were then set by hand, trading nothing in the error for drier deserts and sharper monsoons: tropical mixing 6×10⁵ m²/s
and storm mixing length 1,100 km.

**Numbers (open loop: real temperature).**

| Measure | New, real winds | New, own winds | V1 |
|---|---|---|---|
| Typical monthly error, regions equal (log ratio; 0.69 = ×2) | 0.63 (land 0.80, sea 0.53) | 0.76 | — |
| Rain pattern Jun–Aug / Dec–Feb (log corr., land) | 0.66 / 0.65 | 0.61 / 0.57 | 0.46 / 0.62 |
| Wet season right way round | 78 % | 79 % | 81 % |
| Continents, typical error (2 seasons) | 0.75 | 0.79 | 0.82 |
| Rain belt | 4.6° off | 6.3° off | — |
| Köppen, real temperature + this rain (same pipeline) | 56.4 % | — | 55.2 % |

- **Every stage new on Earth:** Köppen **46.3 %** of land vs Beck (V1 38 %); wet season right way round 88 %.
- **Named features that pass (real winds):**
  - the Atacama and Australian interior are dry;
  - the South Asian, West African and East Asian monsoons (northern Australia's runs the right way, but its dry season
    is too wet);
  - California is winter-wet;
  - the Pacific Northwest has a rain shadow;
  - the eastern Pacific rain belt sits north of the equator.
- **Test planets:** all pass.
  - Wet west coast vs dry interior; a dry subtropical west coast.
  - The tropical rain belt follows the sun.
  - The supercontinent has wet equatorial coasts and an arid interior (as paleoclimate runs of Pangaea have).
  - The coastal range: 77 vs 28 mm/month, windward vs lee.

**Gate: partly met.**
- Passed: the truth swap beats V1; the season patterns and continents beat V1; the test planets.
- Not met: the wet-season measure (78 % vs 81 % open loop; 88 % with every stage new), and 9 of the 16 named
  features fail (7 pass; the two Mediterranean ones are Phase 8's).

**Known limits.**
- **Deserts beside monsoons are too wet** (Sahara 18, Arabia/Thar 41 mm/month vs 2 and 12).
- **Rainforests are too dry** (Congo 81 vs 143, the Maritime Continent 134 vs 243).
- **Patagonia's rain shadow and Kazakhstan's dryness are too weak.**
- **With the circulation stage's winds, Africa's rain belt runs into the Sahara.** The circulation places the tropical
  trough at the hottest latitude (the heat low). Phase 6 should place it by moist static energy from the rain stage.
- **Speed:** 0.54 s for rain at 6 points in Node, 0.75 s in Chrome; the whole climate is 2.2 s at 160K in Chrome. The
  speed pass is Phase 6.
- **No upslope rain at the terrain-cell scale yet** (the rain is 2°, interpolated).


## Phase 6 — the coupled climate, built 2026-09-28

**What was built.**
- **Clouds from the rain → temperature.** The temperature stage takes the rain stage's monthly rain. Land's cloudiness
  (1 − e^{−P/100 mm}) makes rainy land brighter and dry land darker than the land's average, so the planet's albedo is
  unchanged. Deserts get the full summer sun; monsoon, rainforest and boreal summers are shaded. The order is
  temperature ↔ winds ↔ ocean (2 rounds), rain, then temperature once more with the clouds.
- **Tried and dropped:**
  - *The circulation placing the tropical trough by moist static energy* (T + L·q/c_p, with q from the rain stage).
    It made Köppen worse (44.8–45.8 % vs 46.3 %): the moisture term swamps the temperature contrasts and the trough
    follows the previous round's water.
  - *A third coupling round and a second rain after the clouds*: no better (a little worse) and slower.
- **Speed pass.**
  - All grid-scale stages on a 3° grid. The whole climate scored the same or better at half the cost: Köppen 48.9 vs
    48.3 %; ocean, temperature and circulation gates all still pass.
  - Two coupling rounds instead of three.
  - One more multigrid level on the 3° grid (same scores).
  - The circulation's smoothing weights precomputed (a bit-identical speed-up).
  - The rain's divergent-wind solve starts from the previous point in the year.
- **Checks:**
  - `tuning/climate/coupled-check.mjs`: the whole climate on Earth scored on Köppen per continent, with every stage's
    score as a guardrail; regimes; the costliest confusions; drift at 640K and 2.5M; test planets; `--tune` for the
    final Köppen-level tune.
  - `profile-climate.mjs`: every stage call timed.
  - `hash-climate.mjs`: a fingerprint of every stage's output, for exact speed-ups.
- **Lab:** a Phase 6 section. The earlier phases' tables were re-run at the final settings, so they show the current
  climate.

**Tuned on Köppen** (continents weighted equally, no continent more than 2 points worse, stage guardrails): only the
cloud albedo moved, 0.15 → 0.26 (literature range 0–0.3). The rain settings the tune could touch stayed where Phase 5
left them.

**Numbers (Earth, every stage new, 160K terrain cells).**
- **Köppen 49.5 % of land vs Beck** (major group 74.9 %); V1 38 %. Without the clouds: 47.2 %.
- Per continent:

  | North America | South America | Europe | Africa | Asia | Australia |
  |---|---|---|---|---|---|
  | 50 % | 41 % | 50 % | 61 % | 30 % | 62 % |

- **Guardrails:**
  - Land temperature error 3.9 °C (4.4 without the clouds; Phase 2's open loop 4.2).
  - Rain 0.72 (log ratio).
  - Sea temperature 2.8 °C.
- **Every stage's own gate still holds at the final settings:**
  - temperature 4.2 vs V1 5.0 °C;
  - wind within 45° 72 % vs 52 %;
  - ocean currents and coasts;
  - rain as in Phase 5 (truth swap 56.6 vs 55.2 %).
- **No drift:** 640K and 2.5M give Köppen 49.4 %, with class shares within 0.6 % of 160K.
- **Speed (Chrome, desktop):** 0.8 s for the whole climate at 40K and at 160K (Phase 5: 2.2 s). V1: 0.51 s at 40K,
  2.07 s at 160K, 10.9 s at 640K. Node: 0.52–0.6 s.

**Gate: mostly passed.**
- Passed: Köppen beats V1 on Earth; every stage near its open-loop score; no drift; the test planets behave (Phase 5's
  checks).
- Not met: the speed budget at V1's 40K default, 1.6× slower on the desktop. From 160K up it is faster than V1.

**Known limits.**
- **Asia is the weakest continent (30 %).** The costliest confusions:
  - Dfc → Dfb and Dfb → Dfa: boreal summers still a little warm;
  - Tibet as cold desert instead of tundra;
  - hot deserts as cold ones.
- **Dry-winter regimes are nearly missing** (Dw 0 %, Cw 19 %).
- **Mediterranean recall is 7 %** (Phase 8).
- **Test planets come out arid** (a flat mid-latitude continent ~64 % desert or steppe; Earth's arid share is ~37 % vs
  a real ~28 %). The derived westerlies are weak, so moisture reaches continental interiors poorly.
- **Speed at 40K:** the next levers are passing coarse fields between stages instead of refining to 1° and coarsening
  back, and computing the circulation only at the points in the year.


## Phase 7 — Evolution, built 2026-09-28 (engine level; the page wiring waits for the Evolution page)

**What was built.**
- **`v2/js/climate/climate.js` — `planetClimate(input, options)`: the one call a generator makes.** Input: cell positions
  and heights in km (sea at 0), with `axes: 'z-up'` for Evolution (V1: `'y-up'`). Output:
  - per terrain cell: Köppen id (V1's class table and colours), annual temperature and rain;
  - on the 1° grid: 12 monthly temperature and rain layers, pressure and winds, currents, sea ice.
- **`v2/js/climate-lab/evolution-world.js`.** An Evolution world built headless: the V2 lab's whole-planet history
  (600 Myr, or run on to an ending such as a supercontinent), its last frame's terrain on a terrain mesh of any size.
  This is exactly what the Evolution page would hand the climate.
- **Lab:** two planets, "Evolution world" and "Evolution supercontinent" (the history takes about a minute the first
  time, then is kept), with every field on source "New".
- **`tuning/climate/evolution-check.mjs`:** both worlds at 160K, what physics expects, drift at 640K.

**Numbers (Phase 6 settings).**

| World | Land | A / B / C / D / E | Subtropics arid | Interior vs coast (arid; seasons) | 640K drift | Climate |
|---|---|---|---|---|---|---|
| 600 Myr | 31 % | 16 / 35 / 14 / 18 / 17 % | 87 % (equator 11 %) | 5 vs 41 %; 37.6 vs 12.9 °C (only 1 % of land is interior) | 1.05 % | 0.75 s |
| Supercontinent (680 Myr) | 31 % | 12 / 42 / 15 / 24 / 8 % | 91 % (equator 12 %) | 54 vs 50 %; 34.4 vs 20.0 °C | 0.77 % | 0.61 s |

All checks pass: subtropics drier than the equator, a drier interior with bigger seasons, the same climate at 160K
and 640K.

**Not done: the Evolution page itself.** The "Calculate climate" button, its layers, exports, phone layout, README,
tutorial and SEO all wait until the page is committed and merged into this branch. The steps when it is:
1. On "Calculate climate" for the moment shown, post the frame's terrain `xyz` and `heightKm` to a worker that calls
   `planetClimate({ xyz, elevKm: heightKm, axes: 'z-up' })`.
2. Paint `cell.koppen` with `KOPPEN_CLASSES[k].color`. The grid layers (`months.T`, `months.P`,
   `stages.circulation.{u, v, slp}`, `stages.ocean.{u, v}`, `stages.temperature.seaIce`) paint straight onto the
   texture globe (a 360 × 180 lat-lon grid).
3. Keep the result per moment while the history is open.

**Known.** Evolution's subtropics are very arid (87–91 % of land at 15–35°; Earth ≈ 60 %). This is the same dryness as
the test planets: weak model westerlies and interiors starved of moisture.


## Phase 8 — Mediterranean climates, built 2026-09-28

**Where they failed (`tuning/climate/diag-med.mjs`).** Real Mediterranean land mostly came out as steppe or desert.
- **Winter rain was a half to a sixth of the real amount**: Mediterranean 38 vs 76, SW Australia 34 vs 79, the Cape 30
  vs 56, central Chile 22 vs 141 mm/month.
- **Summer rain was too high**: California 35 vs 6 mm/month.
- **Why the circulation mattered (`diag-belts.mjs`).** The model's subtropical highs barely moved through the year, and
  out of phase: the northern one sat at 24° in spring and 34° in November, while the real one moves from 27.5° in
  January to 37.5° in August. Held & Hou applied to each month widens the winter Hadley cell and narrows the summer one,
  which cancels the rain belt's migration.

**What was built.**
- **The Hadley cells' width follows the year-round equator-to-pole contrast** as well as each month's
  (`CIRC_HADLEY_SEASONAL`, the share of each month's own contrast). The seasonal cells are not in balance with each
  month's heating (Lindzen & Hou 1988), so the highs now move with the rain belt: the northern one from 22–24° in
  winter and spring to 36–38° in late summer.
  - The literature prior is 0.5; the tune chose 0.63.
  - It's in the circulation, as the plan asked first. It changes nothing where the setting is 1: the hash is
    bit-identical.
- **A regime-aware final tune.**
  - The Köppen-level tune now also counts the recall of the rarer regimes (Cs, Cw, Am, Dw), as V1's tuner counted
    macro-F1, so the big classes cannot drown them.
  - The circulation's own scores (pressure pattern, wind direction) became guardrails beside temperature, rain and
    sea temperature. A first tune without them pushed the thermal term to the top of its range and let the pressure
    error grow from 2.9 to 3.9 hPa, buying Köppen by breaking a stage. That run was discarded.
  - Tuned: Hadley seasonal share 0.63, thermal lows and highs 1.23 hPa/K (Phase 3: 0.78), storm spread 0.17, cloud
    albedo 0.26. All are within their literature ranges.
- **Tried and dropped** (each measured with `coupled-check.mjs`, none kept):
  - frontal rain, a term raining out a share of the column per storm growth: Köppen −2 points; winter rain no better;
  - storms escaping the low-level stability: −1.9 points;
  - rain damped under above-average pressure: no change, because over land in summer the pressure is a heat low;
  - storm strength from the local rather than the zonal-mean temperature gradient: no change.

**Numbers (Earth, every stage new, 160K).**

| Regime (recall; area new ÷ real) | Phase 6 | Phase 8 |
|---|---|---|
| Cs Mediterranean | 6.6 %; ×0.67 | 8.4 %; ×0.79 |
| Cw dry-winter temperate | 19.4 %; ×0.63 | 31.9 %; ×0.93 |
| Am tropical monsoon | 20.8 %; ×0.93 | 22.6 %; ×0.96 |
| Dw dry-winter continental | 0 %; ×0.10 | 14.7 %; ×0.56 |
| Ds dry-summer continental | 0.6 %; ×0.07 | 2.3 %; ×0.22 |
| **Köppen, all land** | 49.5 % | **50.5 %** (continents equal 49.9 %) |

- Guardrails:
  - land temperature 3.85 °C;
  - rain 0.72;
  - sea temperature 2.82 °C;
  - pressure 3.14 hPa (closed loop; was 2.90);
  - wind within 45° 77 %.
- Circulation, open loop: pressure error 3.3 hPa (Phase 3: 2.9; V1: 4.0), wind within 45° 71 % (72 %); its gate still
  passes.
- No drift at 640K and 2.5M (class shares within 0.6 %).
- Mediterranean summers: the Mediterranean 26 vs 20 mm/month (right), California 25 vs 6 (still too wet).
- **Evolution worlds at the final settings** (A / B / C / D / E):
  - 600 Myr: 16 / 34 / 15 / 18 / 18 %, subtropics 86 % arid; all checks pass.
  - Supercontinent: 11 / 37 / 19 / 25 / 7 %, less arid than with Phase 6's settings (B 42 → 37 %).
- **Tradeoff:** with stronger thermal lows the supercontinent's summer monsoon reaches further inland. Its interior is
  now about as arid as its coasts (41 vs 44 %) rather than drier; its seasons are still far bigger (34 vs 20 °C). The
  "interior drier than the coasts" check fails. Paleoclimate runs of Pangaea show both a megamonsoon and an arid
  interior, so this is a judgement call for the developer.

**Gate: not met.**
- **Mediterranean climates now exist at nearly the right total area (×0.79), but mostly in the wrong places.** Only 8 %
  of real Cs land is classed Cs; much of the rest is steppe.
- **Winter rain on the 30–40° west coasts is still half of real** (central Chile a sixth). Their winter moisture
  arrives on westerlies that the derived circulation keeps weak there. This is Phase 3's known limit: highs and lows at
  about half strength, weak Southern Hemisphere westerlies.

**Next steps if Mediterranean climates stay a priority.**
1. Stronger winter westerlies at 30–45° in the circulation stage: the midlatitude pressure drop and where it sits
   relative to the highs.
2. Less summer recycling over dry-summer land (the soil bucket feeds June evaporation too generously).


## Phase 9 — detail, Tibet, Mediterranean (the developer's feedback, 2026-09-28 evening)

**Asked:** "things look a little too smooth … we are losing some of the interest and charm", no tundra on Tibet, "also fix
med placement", and "areas around hot currents with onshore winds give more precipitation, and cold the opposite".

**Measured first (`diag-detail.mjs`, `diag-v1-detail.mjs`).** The share of neighbouring land cells (160K) in different
Köppen classes:

| | Beck (real) | V1 | New, Phase 8 |
|---|---|---|---|
| Classes | 17.8 % | 15.1 % | 9.7 % |
| Major groups | 8.4 % | 5.6 % | 3.7 % |

- **Finer grids barely helped.** Rain on a 1° grid gave 10.4 % at four times the cost. The detail in the real map is
  terrain below any climate grid.
- **Tibet** came out cold desert (BWk 86 %): 60 mm/yr of rain against a real 487, and a warmest month of 11.2 vs 8.1 °C.

**What was built.**
- **Rain that follows the terrain below the grid.**
  - Per terrain cell, rain × e^{1.0·(h − h_surroundings)/km}, bounded 0.4–2.5 (`core.js` `rainPerKm`): ridges wetter,
    valleys drier.
  - On the 1° grid, a windward / lee factor from the upslope wind (`RAIN_SLOPE_FACTOR` 0.4), with each rain-grid cell
    keeping its total.
- **Coasts sharper than the grid** (`temperature.js`). A 1° cell's seasonal swing scales with the land around it
  (within ~1.5°) against the land share the 3° energy balance saw; the sea's swing is `TEMP_SEA_SWING` 0.3 of land's.
- **Texture** (`core.js` `texture`: ±1.2 °C, rain × e^{±0.35}, 200 km, 3 octaves, seeded). Smooth noise at a size
  fixed in km, standing in for the local variety the grid can't resolve (lakes, soils, mesoscale weather). It's
  switchable, and the same planet results at every terrain resolution.
- **Tibet: the column over high ground.** Water over high ground now falls off with its own scale height,
  `RAIN_TERRAIN_HEIGHT_KM` 3.5, rather than free air's 2.5. The moist boundary layer rides up with the ground, and
  observed water over the Tibetan Plateau is ≈ 20–25 % of the Indian lowlands', an e-folding of ≈ 3–3.5 km. Saturation
  keeps 2.5 km.
- **Mediterranean: sinking air under the subtropical highs, carried onshore.** Pressure above the latitude's mean counts
  as extra stability (`RAIN_HIGH_K_PER_HPA` 0.6 K/hPa) and travels onshore with the air, like the cold-water stability
  does. It fades out 5–15° poleward of each hemisphere's subtropical high (from the circulation's own belts), so the
  cool summer seas at 50° do not dry western Europe.
- **The developer's warm / cold currents.** The carried stability is now signed.
  - Cold water (cold currents, upwelling) already damped rain onshore.
  - Air off warm water (warm currents, a warm sea under colder air) or over a heated plateau can now rain more
    (`RAIN_INSTABILITY`).
  - It helps Tibet but cost Köppen worldwide (−0.9 points at 0.015) and did not move the Mediterranean, so it is off
    by default and left to the tune.
- **Lab:** a "Detail below the climate grid" switch in New climate (terrain + texture / terrain only / smooth).
- **Tried and dropped** (measured, none kept):
  - finer rain grids (2°, 1°);
  - partial blocking of flow over mountains;
  - an unblocked "heat pump" inflow up heated slopes (a second, unblocked wind in the solver);
  - land's own coldness not counting as stable air;
  - a drying soil bucket for Mediterranean summers.

**Numbers (Earth, every stage new, 160K).**

| | Phase 8 | Phase 9 | Real |
|---|---|---|---|
| Detail: neighbouring land cells in different classes | 9.7 % | **15.9 %** | 17.8 % (V1 15.1 %) |
| … in different major groups | 3.7 % | 7.0 % | 8.4 % |
| Tibet | BWk 86 %; 60 mm/yr; warmest month 11.2 °C | **ET 75 %**; 516 mm/yr; 9.5 °C | ET 77 %; 487 mm/yr; 8.1 °C |
| Mediterranean (Cs) found; area | 8.4 %; ×0.79 | 13.1 %; ×0.88 | — |
| Dry-winter temperate (Cw) / continental (Dw) found | 32 % / 15 % | 36 % / 22 % | — |
| Köppen, all land (continents equal) | 50.5 % (49.9 %) | 49.5 % (48.5 %) | V1 38 % |

- No drift: 640K 49.7 %, 2.5M 49.8 %, class shares within 0.6 % of 160K.
- Every stage's own gate still passes (temperature, circulation, ocean); rain's is as before.
  - Rain's own error rose from 0.63 to 0.66, because mountains are wetter.
  - Its truth swap is now 54.4 vs V1's 54.8 %. The terrain and texture finishing applies to any rain, including V1's
    and real rain (real rain: 87.6 → 85.4 %).
- The whole climate takes ≈ 0.65 s in Node at 160K and ≈ 1.0 s in Chrome, as before.
- Evolution worlds (A / B / C / D / E): 16 / 30 / 17 / 19 / 18 % at 600 Myr, 11 / 28 / 23 / 30 / 7 % for the
  supercontinent. Checks: all pass.

**Known.**
- **The Mediterranean basin is still mostly steppe** (40 % BSk where the real map is 54 % Csa). Its winters are too dry
  (≈ 50 vs 76 mm/month): the winter storm track doesn't come into the Mediterranean. That's circulation work, as in
  Phase 8. California summers are still too wet (35–40 vs 6 mm/month).
- **Western Europe is too cold in winter** (Dfb 56 %, where the real map is Cfb 77 %). The ocean has no deep overturning
  (Phase 4).
- **The texture is a choice.** It buys the look at about a point of Köppen. The lab's Detail switch shows it on and off.

## Phase 10 — feedback 2: the tropics' temperature, too wet, mountains

The developer's feedback on Phase 9: "a bit too wet"; "a discontinuity at the equator in temperature … a clear seasonal
bias … it should be smooth, and a more stable temperature around the equator"; "mountains are not causing enough
rainfall, or enough rain shadows".

**Diagnosis.**
- **Equator.** Zonal means were smooth; the jump was over land. North of the equator, tropical land ran about twice
  the real seasonal swing (at 20°E, July 28–30 vs 24–26 °C at 0–12°N, January 3–5 °C too cold). The energy balance
  spreads any local heating over thousands of km (diffusion D·l(l+1) ≫ B at 2000 km), so the rain's cloud albedo
  couldn't cool a monsoon region locally; and nothing damped the tropical seasons by evaporation.
- **Too wet.** Land 897 vs 839 mm/yr; North America 955 vs 745 with 2 % arid (real 15 %). Phase 9's terrain scale
  height (3.5 km, for Tibet) let a high basin's column keep 59 % of the sea-level water in every season: the Great Basin
  winter column was as humid, relative to saturation, as the windward coast (r 0.69 vs 0.66). Not the per-cell detail
  (height factor, texture: ≈ 15 mm/yr).
- **Mountains.** Windward ÷ lee rain for twelve ranges: ×1.4 vs Beck's ×3.4. Orographic lift used the monthly-mean
  wind (a few m/s, often along the coast); the 1° windward factor was normalised per 3° cell, so a whole region behind a
  range could never be dry. Ridge-crest blocking at the faces was tried and did nothing (the next barrier downstream
  cancels it in the flux form); stability from the upwind drop at 3° did little (1° mean heights hide crests).

**Built.**
- `temperature.js`:
  - Evaporative damping of the seasonal harmonics in the tropics: σ_season = B + TEMP_EVAP_DAMPING (15 W/m²/K) × the
    Clausius–Clapeyron slope ratio × wetness (sea 1, land from the yearly rain), weighted by `tropicsWeight` (1 from the
    ITCZ to halfway to each subtropical high, fading out at the high — the year's belts). Everywhere it would dampen
    tuned mid-latitude seasons (tried: North America −10 points of Köppen, Cs and Dw collapse).
  - Wet tropical ground stays mild, below the grid: T −= TEMP_WET_COOL_C (2 °C) × land × tropicsWeight(month's belts) ×
    sun/400 W/m² × Δ/(Δ+γ) ratio × (1 − e^{−P/100 mm}). Cooling only; warming dry ground made a January warm band north of
    the equator. Without the tropics weight, boreal summers cooled (Dfc → ET).
- `rain.js`:
  - The column's share over high ground depends on how much the ground heats the air: H = H_v + (H_t − H_v) ×
    smoothstep((T_sl − T_zonal) / RAIN_TERRAIN_HEAT_K), H_t = 4 km, H_v = 2.5 km, 6 K. Sunlight (monsoon lands wet
    again) and heating relative to the free air at that height (Congo dries) were tried and lost.
  - Lift at the storms' speed: the mean wind's direction, √(U² + (s·σ_Eady·L)²) (RAIN_OROG_STORM 1); RAIN_OROGRAPHIC
    0.6.
  - `orographicRain` on the 1° grid (replaces `windwardRain`): e^{β·clamp(w/0.1, −2, 2) − λ·D(1 − e^{−drop/D})}, w the
    upslope speed at the storm-boosted wind, drop the largest height drop from the ground upwind (1° steps, weighted
    e^{−d/400 km}), D the vapour scale height; β = RAIN_SLOPE_FACTOR 1.2, λ = RAIN_LEE_PER_KM 1. Normalised by a
    rain-weighted box mean over ±RAIN_OROG_SPREAD_KM (600 km, sea included) with prefix sums, so rain is moved, not
    made, and whole lee regions can be dry. The drop saturates because a 4 km drop off Tibet otherwise wiped out the
    Himalayan foothills (e^{−4}) whenever the wind blew off the plateau.

**Numbers (Earth, every stage new, 160K).**

| | Phase 9 | Phase 10 | Real |
|---|---|---|---|
| Tropical land at 1°N: January, July; swing | 24.7, 26.0; 3.3 °C | **24.2, 24.5; 1.3 °C** | 24.9, 24.1; 1.7 °C |
| … at 9°N | 22.5, 27.6; 6.3 °C | 23.4, 25.5; 2.7 °C | 25.0, 24.9; 4.2 °C |
| Land rain, mm/yr: all; North America (arid share) | 898; 955 (2 %) | **832; 826 (13 %)** | 839; 745 (15 %) |
| Great Basin rain summer / winter, mm/month | 78 / 108 | 33 / 45 | 20 / 24 |
| Windward ÷ lee, twelve ranges (geometric mean) | ×1.4 | **×2.0** | ×3.4 |
| Detail: neighbouring land cells in different classes | 15.9 % | 16.9 % | 17.8 % |
| Tibet | ET 75 % | ET 84 %, 541 mm/yr | ET 77 %, 487 mm/yr |
| Köppen, all land (continents equal) | 49.5 % (48.5 %) | **50.6 % (48.9 %)** | V1 38 % |

- No drift: 640K and 2.5M 50.7 %, class shares within 0.6 % of 160K. Guardrails: land temperature 3.85 °C, rain 0.73,
  sea 2.79 °C, pressure 3.02 hPa (3.14), wind within 45° 79.0 % (76.7 %).
- Rain's own gate (open loop, real winds and temperature) as before: error 0.66, truth swap 54.7 % (54.4) vs V1's 54.8.
  Named features: southern Chile ÷ Patagonia now passes (×3.4); India's Jun–Aug ÷ Dec–Feb ratio fell from 5.9 to 3.4
  (the heat-dependent terrain height; with the closed loop the monsoon's limit is its winds, below) and California's
  winter ÷ summer from 2.5 to 1.2.
- Evolution worlds: 15 / 35 / 14 / 18 / 18 % at 600 Myr; supercontinent 14 / 37 / 15 / 28 / 7 %. Checks pass except
  the supercontinent's "interior drier than the coasts" (42 vs 44 %; as in Phase 8).
- ≈ 0.73 s in Node at 160K (0.64 before; the upwind march is most of it).

**Known (next: the circulation).**
- **Europe:** winters far too cold on the Atlantic fringe (coldest month UK −1.5 vs 4.7 °C, Germany −2.6 vs 0.8,
  Iceland −9 vs −3) and summers too dry (UK 54 vs 82 mm/month) → Dfc/Dsb/Csb instead of Cfb. As in Phase 9.
- **US West:** summers 5–8 °C too cool inland (Great Basin warmest month 15.4 vs 23.5 °C): marine air reaches the
  interior as if the Sierra and Cascades weren't there. California's winters 2.5× too wet (the storm track too far
  south).
- **Monsoon winds:** July winds on the Gangetic plain blow from the north (v −1.2 to −1.6 m/s) where the real monsoon
  blows toward the Himalaya (+1.9 to +2.7).
- **Small islands are about a third as wet as real** (Hawaii 40–58 vs 126–164 mm/month; Fiji 43 vs 288): on the 3°
  rain grid an island is ocean, and the 1° mean heights dilute its mountains with sea.

## Phase 11 — feedback 3: pressure, monsoons, Europe, the US West, islands

The developer's feedback on Phase 10: "hone in the pressure … see WHERE we are getting things wrong"; "make the monsoon
winds a bit stronger"; "Europe feels too Mediterranean and continental and not oceanic enough (France, UK, Germany)";
"the Rockies a bit east of California are too wet" (California itself is fine); "Hawaii is too dry … smaller islands
should be wetter broadly". Then: "do all of that".

**Diagnosis** (`diag-pressure.mjs`, `diag-seasons.mjs`, `diag-regions.mjs`; SST and gyre probes).
- **Zonal belts.** The real subpolar trough depends on open ocean, not the season: ≈ 31 hPa below the subtropical highs
  over the ≈ 93 %-sea south, ≈ 6 hPa over the ≈ 45 %-sea north, both seasons. The model had 14–18 hPa south (Southern
  Ocean westerlies ×0.38) and 10–20 north (Arctic zonal mean 13 hPa too low in January; Siberian high 1024 vs 1036).
- **The circulation check could not see it:** its pressure score removed each latitude's mean, and wind was scored on
  direction only. An RMS pattern score also rewarded a damped field (the "double penalty"): the Phase 8 tune had cut
  the thermal response, and the July pressure around India was nearly zonal.
- **Subtropical highs:** in winter the model's Azores high sat over the Sahara (cold land, thermal high); trades a third
  of real.
- **Continental seasons:** the energy balance's diffusion (D·l(l+1) ≈ 36–65 W/m²/K for a 2000–4000 km continent, vs
  B + ωC ≈ 4) tied mid-size continents to the sea: Australia swing 6.7 vs 16.3 °C, Kalahari 5.0 vs 12.9, Argentina
  8.1 vs 15.2. Halving D, the land's heat capacity or the wind carry barely changed it. Without hot summer interiors
  there are no heat lows, so the monsoons stay weak.
- **Europe:** the North Atlantic 5 °C too cold (Norwegian Sea −6 °C, ice, in January vs +6.5): the wind-driven gyres are
  weak (≈ 13 Sv, currents 1–3 cm/s) and there is no overturning; tripling the gyres' heat share did nothing.
- **India** 5.5 °C too cold all year: Tibet's cold diffused through the Himalaya.
- **Islands** a third as wet as real: on the 3° rain grid they are ocean, and 1° mean heights dilute their mountains.

**Built.**
- `circulation.js`:
  - Trough depth `CIRC_MIDLAT_HPA × (belt sea share)^CIRC_OPEN_SEA_POWER × √(contrast / 25 K)` (replaces
    `CIRC_MIDLAT_HPA_PER_K`, `CIRC_OPEN_SEA_BOOST`).
  - Thermal term asymmetric over land: heat lows `CIRC_HEAT_LOW_MILD` on mild ground (≤ 15 °C) and in the rainy
    tropics (a Gaussian of `CONVECTIVE_DEG` = 10° about the ITCZ), × (1 + `CIRC_HEAT_LOW_HOT`) on hot dry ground
    (≥ 35 °C); cold highs × (1 + `CIRC_COLD_HIGH_BOOST`) below −25 °C.
  - Oceanic subtropical highs: `CIRC_OCEAN_HIGH_HPA` × (sea share around, Rossby scale, minus its row mean) on a cos²
    ridge ±15° about each high (the zonal mean kept).
  - Land roughness: near-surface wind share `CIRC_SURFACE_WIND_LAND` (the rain stage reads `surfaceShareLand`).
  - `tropicsWeight` and `gaussianSmooth` exported (shared with the temperature stage).
- `temperature.js`:
  - Land's own seasons below the grid (`TEMP_LOCAL_K`, `TEMP_LOCAL_KM`): for n = 1, 2 the isolated column's response
    F/(B_season + K + i·nωC) minus its Gaussian regional mean (1500 km) is added over land, × (1 − the sea share upwind
    along the year's mean wind, e^{−d/700 km} over 4 steps), not over ice sheets. Subtracting the energy balance's own
    contrast at that scale was tried and removed (it cut Canada's and Siberia's seasons).
  - Ridge blocking (`TEMP_BLOCK_KM`): each face of the energy-balance grid open by `BLOCK_FLOOR` (0.5, the weather
    aloft) + 0.5·e^{−(1° crest above the lower side)/H}, strip by strip (`ridgeFaces`). Without the floor, Central
    Asia's winters went ≈ 10 °C too cold.
- `solver.js`: faces in the advective form (`buildRowsFaces`): per-face diffusion and upwind coupling, north / south
  folded; without faces the old path runs unchanged.
- `ocean.js`: the overturning (`OCEAN_OVERTURN_PW`): per hemisphere without a circumpolar channel equatorward of 75°,
  the sea poleward of 40° connected to the polar sea gets the heat, weighted e^{−distance by sea from the polar sea /
  2500 km} × a ramp 40–55°; balanced by the ocean's global net removal. Taking it from the hemisphere's tropics instead
  cost 4.6 points of Köppen (moved the rain belts).
- `rain.js` (`orographicRain`): slopes from the land's own mean height (`meanLandKm`) on land cells; islands ×
  (1 + `RAIN_ISLAND_BOOST` × the sea share around (3 × 3) × warmth (12–24 °C)), moved within the 600 km normalisation.
- `circulation-check.mjs`: per-region score = direction + 3·(1 − pressure correlation) + 2·|ln amplitude| +
  2·|ln speed|, plus 0.25 × the zonal-mean profile error. Its open-loop tune put the thermal response back to 1.0 hPa/K.
- Tried and dropped: rain inside the coupling loop with latent heating in the circulation (Köppen 41 %: the cloud-cooled
  rainforest reads as a thermal high and as stable air in the rain stage, and dries itself).
- Final Köppen-level tune (12 keys, no continent > 2 pts worse, stage guardrails): `TEMP_WIND_CARRY` 0.143,
  `TEMP_LOCAL_K` 14, `TEMP_BLOCK_KM` 1.5, `OCEAN_OVERTURN_PW` 0.925, `CIRC_COLD_HIGH_BOOST` 0.685,
  `CIRC_OCEAN_HIGH_HPA` 2, `CIRC_HEAT_LOW_MILD` 0.963, `TEMP_CLOUD_ALBEDO` 0.3; then by hand `CIRC_HEAT_LOW_HOT` 1
  (monsoons; −0.4 pts) and `RAIN_ISLAND_BOOST` 2 (islands; Köppen unchanged).

**Numbers (Earth, every stage new, 160K; closed loop).**

| | Phase 10 | Phase 11 | Real |
|---|---|---|---|
| Zonal mean 65°S, Jan / Jul (hPa) | 1004.7 / 999.1 | **993.2 / 987.6** | 986.8 / 986.8 |
| Zonal mean 65°N, January | 998.0 | 1006.6 | 1012.3 |
| Siberian high | 1024.1 at 38°N 71°E | **1032.4 at 47°N 83°E** | 1035.6 at 47°N 90°E |
| Icelandic / Aleutian low | 987.2 / 988.6 | **993.2 / 995.7** | 994.0 / 997.6 |
| Southern Ocean westerlies, July (u) | 2.3 m/s | **5.2** | 6.8 |
| Indian monsoon, July (u, v) | 4.6, 3.2 | 4.7, 3.5 | 5.2, 2.9 |
| Bay of Bengal, July | 5.9, 3.2 | 6.1, 3.9 | 5.1, 5.7 |
| East Asian monsoon, July (v) | 2.0 | 2.5 | 1.6 |
| Somali jet, July | 4.6, 5.0 | 4.3, 5.6 | 8.7, 7.5 |
| NE Atlantic / Norwegian Sea, January SST | 5.1 / −6.1 °C | 7.0 / −2.6 | 10.5 / 6.5 |
| Swing: Australia / Kalahari / Argentina | 6.7 / 5.0 / 8.1 °C | 8.8 / 6.7 / 10.9 | 16.3 / 12.9 / 15.2 |
| France Cfb / Csb; UK Cfb | 42 / 51 %; 0 % | **62 / 20 %; 15 %** | 87 / 0 %; 100 % |
| Islands (Hawaii, Fiji, Caribbean): rain | ≈ ⅓ of real | ≈ ½ | — |
| Guardrails: land T / sea T / pressure / wind 45° | 3.85 / 2.79 °C / 3.02 hPa / 79.0 % | **3.75 / 2.64 / 2.89 / 80.5** | — |
| Köppen: major group; all land (continents equal) | 76.8 %; 50.6 % (48.9) | **78.6 %**; 48.5 % (47.6) | V1 38 % |

- Stage gates: circulation PASSED (wind within 45° 73 % open loop; zonal profile error 3.3 hPa); temperature PASSED
  (3.9 vs V1 5.0 °C); ocean PASSED ("North Atlantic warmer than its latitude" fails: −0.1 vs 3.0 °C); rain as before
  (named 10 / 18 open loop), and now the supercontinent's equatorial coasts are 55 mm/month (threshold 60; 60 without
  the hot heat lows: its monsoon reaches inland). Coupled gate PASSED; no drift (640K / 2.5M 48.7 %, shares within 1 %).
- Evolution: 600 Myr A / B / C / D / E 15 / 31 / 15 / 23 / 16 %; the supercontinent's "interior drier than the coasts"
  fails as before (35 vs 37 %).
- ≈ 0.6–0.75 s in Node at 160K, as before.

**Known.**
- **The US interior West** is still ≈ 7 °C too cool in summer and ≈ 1.7× too wet (Great Basin Dfb / Dsb, not BSk /
  BWk): the land-seasons layer at the tuned strength (K 14) is weak, and heated high ground gets the monsoon moisture
  rule.
- **Heat lows sit at ≈ 11°S** (real 20–25°S) in January and at 17–20°N over Africa: the tropical trough follows the
  warmest latitude of the cloud-free temperature. Northern Australia's and West Africa's monsoon winds stay weak.
- **The North Atlantic** is still ≈ 3.5 °C too cold; Germany is Dfb (real Cfb 76 %); the UK a mix.
- **Köppen −2.1 points** for the physics: the tune preferred a weak land-seasons layer and nearly symmetric heat lows.


## Phase 11b — calmer detail on simulated planets

The developer, after the climate went onto the Evolution page: "it looked good on earth but ended up making the
simulated planets look way too blotchy. Can we tone it down a bit (but not fully get rid of it)".

**Diagnosis** (`diag-blotch.mjs`, `render-evolution-koppen.mjs`). On an Evolution world (seed 12345, 160K) the Köppen map
had about twice Earth's class edges (32.6 vs 18.8 %; Beck 17.8), specks (land cells unlike most of their neighbours,
26.8 vs 12.6 %) and patches (1032 vs 491 per 10k land cells). Switching off every source of sub-grid detail (texture,
rain by height, windward / lee / islands, coastal seasons) still left 24 % edges: the cause is the terrain. Evolution's
synthesized terrain is three times rougher cell to cell than Earth's heightmap (a land cell is 222 m from its neighbours'
mean vs 77 m), and each cell's climate followed its own height (the lapse rate, ≈ ±1.4 °C; rain by height, ≈ ±25 %),
so neighbours flipped across thresholds (BSk/BWk, BSh/BWh, Dfb/Dfc, EF/ET).

**Built.** `core.js` option `terrainRelief` (0.5): the height the per-cell finishing uses is the surroundings' 1° mean
land height plus that share of the cell's own relief — for the lapse rate and rain by height. The air near the ground
mixes over small hills; mountain ranges keep their height. A share, so the same at every terrain resolution. A gentler
texture was tried too: it took Earth below Beck's detail and barely calmed Evolution, so it stays.

| | Class edges | Specks | Patches / 10k land cells | Earth Köppen |
|---|---|---|---|---|
| Evolution 160K, before → after | 32.6 → **27.2 %** | 26.8 → **20.3 %** | 1032 → **717** | — |
| Evolution 640K, before → after | 25.3 → **18.9 %** | 18.7 → **12.0 %** | 606 → **357** | — |
| Earth 160K, before → after (Beck 17.8 / 12.3 / 479) | 18.8 → 16.8 % | 12.6 → 10.4 % | 491 → 393 | 48.5 → 48.2 % |

No drift (640K / 2.5M class shares within 0.9 % of 160K); guardrails unchanged; the Evolution checks as before.


## Phase 11c — windward rain grows with height

The developer: "when we come across something steep it does look to be generating rain properly. However when we
encounter higher mountains …, are we releasing more rain? that would be realistic".

**Diagnosis** (`diag-ridges.mjs`: a flat continent in the westerlies with north–south ridges). A 3 km ridge did get
≈ 45 % more windward rain than a 1.5 km one, and a range behind another behaved sensibly; but the rain peaked on the
steepest mid-slope and every crest was drier than the flat plain (the 3 km crest 224 mm/yr vs 450 on the plain upwind
and 253 on a flat continent). The 3° rain grid piles a range's water up 6–8° upwind of it, and the 1° step keyed only
on the local slope. Real windward precipitation grows with elevation up to near the crest.

**Built.** `orographicRain`: the upwind march that finds the rain shadow's drop now also finds the rise (the height the
air has been lifted from lower ground on its way, weighted e^{−d/400 km}); rain × e^{κ·D(1 − e^{−rise/D})},
`RAIN_RISE_PER_KM` 0.5. A drift of the rain toward the crest (the ascent from one step upwind) was tried and dropped:
it mostly spilled rain into the lee (the Sierra's lee 444 → 543 vs real 209).

**Numbers.** 3 km ridge (terrain cells, mm/yr): upper windward slope 572 → 667, crest 224 → 288 (plain 250). Earth,
windward sides: NZ 1634 → 1901 (real 3154), Western Ghats 1767 → 1890 (3282), Norway 921 → 1027 (2105); windward ÷ lee
×2.00 → ×2.11 (real ×3.42). Köppen 48.2 → 48.3 %; Evolution patches 717 → 736 per 10k land cells. No drift; the checks
as before.


## Phase 11d — warm and cold currents, relative to their latitude

The developer: "currents going TOWARDS the poles should bring heat up, while anything going TOWARDS the equator should
bring heat down … it's all relative … this should interplay with land and sea temps", and "make sure these warm / cold
coast currents impact precipitation (up and down respectively)".

**Diagnosis** (`diag-currents.mjs`: fourteen named currents; sea and coast against their latitude's average, and coast
rain). Warm-current seas were no warmer than cold-current seas (+0.1 vs real +2.8 °C); the Gulf Stream and Kuroshio came
out cold, the Canary, California and Benguela currents warm. The heat rule advected the model's own sea temperature,
already evened out by the energy balance, so currents carried ≈ 5–10 W/m² (real ≈ 100 in the Gulf Stream), and the
energy balance then spread even that over thousands of km. The model's gyres are also slow (≈ 1 cm/s): any "speed ×
gradient" rule made the narrow western currents overshoot and the broad eastern ones vanish.

**Built.**
- `ocean.js`:
  - `carried`: each current traced back along its flow for 1500 km (`CARRY_TRACE_KM`); the latitude-average sea
    temperature there minus here, faded below ≈ 0.5 cm/s. A slow broad current counts as much as a fast narrow one.
  - The ocean heat's north–south part now uses the latitudes' average temperature gradient (`OCEAN_MERID_SHARE`;
    east–west still the local sea temperature).
  - Coastal upwelling is one-sided at a coast (the offshore Ekman transport wells up in the coastal cell).
- `temperature.js`: the sea keeps `TEMP_CURRENT_MEMORY` (0.6) of `carried` (the planet-wide sea mean kept), and onshore
  winds carry `TEMP_COAST_CARRY` (0.6) of the upwind sea's anomaly onto land (the land-seasons layer's upwind look,
  shared). The rain stage then sees it: more evaporation and unstable air off warm seas, stable air off cold ones.
- `rain.js`: instability (air warmer than its latitude rains more, `RAIN_INSTABILITY`) only off the sea — land's own
  heat does not count (with it, desert interiors rained: Köppen 43.8 %); on at 0.0187.
- Tried and dropped: the local response to the full ocean heat (weak), subtracting the anomaly's regional mean (it
  cancelled the eastern half of each gyre), a local layer for upwelling (the equatorial cold tongue bent the trade winds:
  wind 80.5 → 73.7 %; the coastal part alone broke South American rain: 38 → 26 %), a stronger instability (no wetter
  coasts, North America −9 points).
- Tune of the neighbours around the trace (7 keys): `RAIN_STABILITY` 0.0262, `RAIN_INSTABILITY` 0.0187,
  `OCEAN_MERID_SHARE` 0.03, `RAIN_STORM_RH` 0.138, `TEMP_CLOUD_ALBEDO` 0.262, `RAIN_COLUMN_LOCAL` 0.414.

**Numbers (Earth, 160K).**

| | Before | Now | Real |
|---|---|---|---|
| Warm minus cold current: sea | +0.1 °C | **+1.2 °C** | +2.8 °C |
| … coast temperature | +1.0 °C | +1.2 °C | +1.8 °C |
| … coast rain | ×1.28 | ×1.35 | ×1.80 |
| e.g. N Atlantic Drift / Humboldt / Labrador sea | +1.3 / −2.1 / −0.7 °C | +2.7 / −3.0 / −2.3 | +4.6 / −4.1 / −2.6 |
| Test planets: sea off the west vs east coast at 30°N | 20.5 vs 21.3 °C | **17.0 vs 23.0** | (California 17, Georgia 24) |
| Australia: rain, arid share | 337 mm, 87 % | 439 mm, 80 % | 537 mm, 74 % |
| Guardrails: land T / sea T / pressure / wind 45° | 3.75 / 2.64 °C / 2.89 hPa / 80.5 % | 3.85 / 2.62 / 2.79 / 80.7 | — |
| Köppen (continents equal) | 48.3 % (47.4) | 47.2 % (45.5) | V1 38 % |

- Gates: coupled PASSED, no drift (640K 47.2 %, 2.5M 47.2 %, shares within 1.1 %); ocean PASSED (SST error 2.59 °C);
  rain's truth swap now beats V1's (54.9 vs 54.6 %; its first pass); Evolution as before.
- The Köppen loss is mostly Australia (54 → 46 %): its interior gets wetter toward the real rain, and hot desert
  crosses into hot steppe (BWh 14 → 9 % of land worldwide, real 14 %).
- **Known:** the Gulf Stream's sea stays cold (the continent's winter air), California's cold current and Peru / Namib
  coast deserts are too weak (their cold is upwelling, left to the energy balance), and the Nordic seas are still ≈ 3 °C
  short of real.


## Phase 11e — why generated worlds are too dry; the currents relative to each latitude

The developer: "in the generated world … they are broadly coming out as too dry. can we investigate why?"

**Measured** (`diag-dry.mjs`: land rain, temperature and arid share by latitude, distance from the sea, height, coast
facing and the wind's fetch over land; four worlds of the current v2-tectonics terrain via `--root`, older climates via
`--climate`). Worlds 34–40 % arid (Earth 30 %, Beck 30 %); with each latitude as arid as Earth's, 29–35 %. The excess:
the subtropics (15–35°: 76–87 % arid vs Earth ≈ 60–67 %) and the inner southern tropics (0–15°S: 13–40 % vs 6–8 %).
Ruled out: the 1° mountain rules (1–2 points), rain's unevenness (percentiles as Earth's), recycling (land E/P 0.83–0.88,
real ≈ 0.6).

**Cause 1 — Phase 11d.** The currents' sea anomaly had only its planet-wide mean removed. The broad slow equatorward half
of a gyre covers more sea than its narrow poleward current, so the subtropical seas ran ≈ 1 K cold (10th percentile −3 K)
and the equatorial seas slightly warm; tropical land lost ≈ 14 % of its rain to the sea (Earth too). Fix
(`temperature.js`): each latitude's sea keeps its mean, over ±`CURRENT_ROW_DEG` (6°) so a narrow sea between continents
keeps its anomaly. Worlds' 0–15°S rain +10–17 %; Earth Köppen 47.2 → 48.3 % (continents 45.5 → 47.5), sea temperature
2.62 → 2.50 °C, pressure 2.83 hPa, wind 80.3 %; currents unchanged (warm minus cold: sea +1.2, coasts +1.2 °C, coast rain
×1.38); ocean-check PASSED (test planets' west / east sea at 30°N 17.7 / 23.4 °C). The worlds' total arid share does not
move: the cold subtropical seas had given subtropical land winter rain (its land looked warm for its latitude).

**Cause 2 — weak summer monsoons** (left for the monsoon phase). Land rain, 10–20°S in January: real 169–243, model on
Earth 87–150, worlds 79–104 mm/month; 20–25°N in July: real 115–125, Earth 134–146, worlds 54–59. On Earth the model's
too-wet southern winters (July at 15–20°S 30–33 vs real 12) make up the annual total; the worlds' big continents have dry
winters. The monsoon's column humidity (≈ 0.6) sits below the deep-convergence range (`RAIN_DEEP_R0` 0.6 … `R1` 0.9), so
its inflow is treated as a shallow dry heat low. On a big continent the heat low sits to one side and the rest takes dry
air from the interior (world 202: 9–24 mm/month across 5000 km in midsummer).


## Phase 12 — continentality: air masses along the wind

The developer: continentality "along coasts or islands … partially accounted for already, but not in enough detail",
with a worldbuilding guide's zones (hyperoceanic → hypercontinental: west coasts oceanic, the continental zone well
inland, east coasts continental, warm seas and lakes interrupting it, islands oceanic).

**Measured** (`diag-continentality.mjs`: the land's annual range per terrain cell by latitude × distance from the sea,
landmass size, west / east coasts, named regions with the coldest and warmest month; Earth vs the 1° observed t2m, a
world vs Earth's observed land in the same bin). Earth's range right on average (18.2 vs 18.7 °C) but RMS 6.83 °C, and
the errors are in winter: Europe's interior too cold (Moscow's coldest month −16.1 vs −7.3, Poland −6.3 vs −1.7,
Ireland 1.9 vs 5.6), east coasts too mild (north-east China −8.3 vs −16.4, Japan 6.7 vs 1.3), Yakutsk −25 vs −37;
summers within ≈ 1–2 °C. Neither the land-seasons layer nor the 1° coast rule causes it (switched off: the same): the
energy balance spreads heat alike in every direction, while a month's weather is the air the wind brought.

**Built** (`temperature.js`): air masses. Each month (and each anchor), the air over each energy-balance cell takes on
the temperature of the surface beneath within τ and is carried by the month's surface wind meanwhile — σ·A + u·∇A = σ·θ
(σ = 1/τ), solved by the multigrid carrier (as the rain's stability). τ: over the open sea (and frozen sea as land)
`TEMP_AIR_SEA_DAYS` 1; over land `TEMP_AIR_SUN_DAYS` 0.5 where the sun is strong (convection mixes the air) to
`TEMP_AIR_DARK_DAYS` 4 where it is weak (stable air on colder ground), blended in time by the day's sunlight from
`AIR_MIXED_SUN` (S₀/5, ≈ 25° in midwinter) to `AIR_STABLE_SUN` (S₀/10, ≈ 45°). It carries potential temperature
(θ = T + (9.8 − the grid's lapse) × height): air coming down from a plateau warms as it sinks. Ridges block it fully
(`ridgeFaces` without the heat's 0.5 floor: the low air itself, not the weather aloft). Land's air is A; the sea's
surface stays its own. Calm air stays put, so a still interior keeps its own temperature.
- Tried and dropped: τ blended as a rate (the sunlit τ dominates, 6 → 12 days changed nothing); the inversion's darkness
  ramp (too narrow) and S₀/6 … S₀/3, S₀/8 … S₀/4 (winter memory reaching the subtropics: south China 5.4 vs 9.8 °C,
  Indochina out of the tropics); the ridge floor kept (Pacific air over the Great Plains: Minnesota −0.8 vs −11.3); a
  wind-aware 1° coast rule (half the land share upwind: west coasts too mild, lee coasts wrong; RMS 6.26 → 6.37); a
  stronger inversion for Yakutsk (−30.8 vs −37 but high-latitude coasts too cold, RMS 7.18); no evaporative damping
  (tropical coasts overshoot).

**Numbers (Earth, 160K).**

| | Before | Now | Real |
|---|---|---|---|
| Annual range: RMS error / correlation | 6.83 °C / 0.902 | **6.26 / 0.913** | — |
| Coldest month: Ireland / Germany / Poland / Moscow | 1.9 / −2.6 / −6.3 / −16.1 | 3.2 / −0.1 / −1.6 / −7.7 | 5.6 / 0.7 / −1.7 / −7.3 |
| … north-east China / south China / Central Asia | −8.3 / 11.3 / −13.7 | −13.3 / 9.2 / −9.0 | −16.4 / 9.8 / −7.8 |
| Range, west / east coasts 35–65°N | 21.2 / 25.1 | 18.9 / 27.6 | 19.4 / 31.2 |
| Köppen (continents equal) | 48.3 % (47.5) | 48.1 % (47.8) | V1 38 % |
| Europe / North America / Asia | 45.6 / 50.2 / 32.5 % | 50.4 / 49.0 / 31.9 % | — |
| Land temperature / pressure / wind 45° | 3.79 °C / 2.83 hPa / 80.3 % | 3.78 / 2.85 / 80.3 | — |

- Gates: coupled PASSED, no drift (640K 48.3 %, 2.5M 48.4 %, shares within 1.0 %); ocean-check PASSED (its North
  Atlantic line fails with or without this: a known shortfall). Timing unchanged (~0.8 s on Earth).
- Worlds: west coasts milder and east coasts harsher (world 202 northern west / east 16.8 / 20.1 → 15.9 / 21.1 °C,
  world 12345 12.6 / 19.0 → 10.5 / 19.0); aridity unchanged.
- **Known:** North America's winter wind blows from the south-west over the Plains (real: north-west, Arctic air behind
  the trough the Rockies force) — Minnesota's coldest month −2.9 vs −11.3, Montana −3.8 vs −6.3: the circulation has
  no mountain-forced stationary waves. Yakutsk still −27 vs −37 (hypercontinental cold under a calm high). Tropical
  interiors still flat (10–20° far inland 5–6 vs 8–10 °C). The North Atlantic ≈ 3 °C cold carries into Ireland and
  Iceland.


## Phase 13 — monsoons and land rain: less dry worlds

From Phase 11e: generated worlds 34–42 % arid (the latitude alone predicts 29–35 %), the excess in the subtropics; the
model's summer monsoons weak (Earth's land at 10–20°S in January 117 vs real 224 mm/month).

**Diagnosed** (scratch probes on the rain stage's budget; `diag-dry.mjs` on four worlds).
- Southern Africa in January: column relative humidity 0.54–0.60, so the deep-convergence share is 0 (`RAIN_DEEP_R0`
  0.6): the monsoon inflow is treated as a shallow dry heat low. Land evaporation supplies most of the rain (E 2.4–3.7
  of P 2.9–5.0 mm/day); the import from the sea (P − E) is 0.5–1.3 mm/day (real ≈ 4). Over all land E/P is
  0.83–0.88 (real ≈ 0.6–0.65): too little ocean water reaches land.
- The summer rain belts over land: southern Africa's peak at 7.5°S (real 12.5), Australia's on New Guinea (real
  11.5°S), South America's 202 vs 312 mm/month; India's July peak at 6.5°N (real 19.5).
- What did not help: the deep-convergence range lowered to 0.45 … 0.75 or 0.5 … 0.65 (January 10–20°S 117 → 129;
  worlds 41 → 40 % arid; July in the north too wet); a land-weighted tropical trough (no change); rain efficiency over
  land × the ground's wetness (concentrates rain where it already falls: 0–15°S more arid).

**Built** (`rain.js`): land convection. Over sunlit land rain picks up at a lower column humidity than over the sea
(afternoon storms: Schiro et al. 2016): the rate × e^{(a·s)²/2} — the same form as the storms' humidity spread — with
s = `RAIN_LAND_CONVECTION` × land share × the sun's share of full strength (daily sunlight `CONVECT_SUN_LOW` S₀/8 …
`CONVECT_SUN_FULL` S₀/4: none under a winter sun, full in the tropics and the summer). A desert's air is too dry for it
to matter much; moisture passing over semi-arid land rains there rather than returning to the sea. At 0.065 it is ×1.38
at full sun, an effective shift of ≈ 2.6 % of column humidity (the literature: 5–10 %).

| | Before | 0.05 | **0.065** | 0.08 |
|---|---|---|---|---|
| Worlds 202 / 101 arid | 41 / 42 % | 38 / 39 | **36 / 36** | 35 / 34 |
| Earth arid (Beck 31 %) | 32 % | 31 | 30 | 28 |
| Köppen (continents equal) | 48.1 % (47.8) | 47.6 (47.4) | **47.0 (46.6)** | 46.0 (44.8) |
| Australia / South America | 56.3 / 39.3 % | 56.0 / 37.8 | 53.6 / 36.4 | 46.9 / 34.3 |

- Worlds (all four): arid 40 / 38 / 34 / 35 → 36 / 36 / 32 / 34 % (latitude alone: 31 / 33 / 35 / 29); land rain
  +8–10 %. Test planets: the mid-latitude continent 63 → 59 % arid, the tropical 53 → 49, the supercontinent 91 → 86.
- Gates: coupled PASSED, no drift (640K 47.5 %, 2.5M 47.6 %, shares within 1.0 %); guardrails hold (land temperature
  3.87 °C, sea 2.50, pressure 2.85 hPa, wind 80.3 %). The Köppen cost is hot desert turning to hot steppe
  (Australia, South America): BWh 12 → 10 % of land (real 14).
- **Known:** the summer rain belts' positions and strength over land (above) are unchanged: the pressure pattern places
  them (the tropical trough follows each longitude's warmest latitude, smoothed with the neighbouring seas); the
  southern winter's tropics are too wet on Earth (July at 10–20°S 36 vs real 12 mm/month), which hid the weak summer.
