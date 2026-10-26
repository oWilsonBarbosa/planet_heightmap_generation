# Generate & Import on the new climate — plan

The developer (2026-10-13): *"update the generate AND import to use the new climate code, as it's much faster and imo more
accurate"* — and *"the other piece that evolution doesn't have but should is the temperature and precipitation toggles
that allow users to increase or decrease planet-wide temperature and precipitation."*

Not started. This is the map of what it takes; the decisions it needs are at the end.

## Why

| | V1 climate (`js/wind.js` … `js/koppen.js`) | New climate (`v2/js/climate/`) |
|---|---|---|
| Earth Köppen match (Beck, land) | 38 % | 47–51 % (oracle ceiling ~88 %) |
| Temperature error on Earth | 5.0 °C | 4.2 °C |
| Wind direction within 45° | 52 % | 72 % |
| Time, desktop Chrome | 0.51 s at 40K · 2.07 s at 160K · 10.9 s at 640K · ~1 min at 2.5M | **0.8–1.0 s at any size** |
| Scale invariance | temperate share 18 % → 11 % from 160K to 2.5M | drift ≤ 0.4 % |

(plans/CLIMATE_REBUILD_REPORT.md.) Generate's default detail (~204K regions) runs V1's climate in roughly 2.5–3 s (between the 160K and 640K timings); the new one
would take ~1 s, and the same ~1 s at 2.5M — so **climate no longer has to be deferred above 300K**. The one place it is
slower: below ~80K regions (V1 0.5 s at 40K, less at 2K; the new one is ~0.8 s flat).

## What makes this tractable

- **The new climate was built to be called from V1.** `planetClimate({ xyz, elevKm, axes: 'y-up' }, options)` takes the
  unit-sphere positions and heights in km — no adjacency, no plates — and already supports V1's Y-up axes. The tuning
  scripts already run it on V1's Earth mesh (`profile-climate.mjs`, `coupled-check.mjs`) and the climate lab does too.
- **It is DOM-free and imports nothing of V1's climate** (one transitive import of `js/rng.js`). V1's module worker can
  import `../v2/js/climate/climate.js` directly — no build step, no copy.
- **Köppen is identical**: same 31 classes in the same order with the same colours (`js/koppen.js` vs
  `v2/js/climate/koppen.js`, checked). So the Climate tab, the Satellite colours (`biomeColor` by class), the Köppen legend
  and hover, and the Köppen / Satellite / Export All exports keep working unchanged.
- **The sliders' hooks exist**: `tempOffsetC` (°C) and `precipScale` (×) are options of `computeClimate` — neither page
  passes them today.
- **Heights**: V1 already has `elevToHeightKm` (`js/color-map.js:7`), sea at 0 km — what the new climate expects.

## What does not line up

V1's consumers read **per-region summer/winter fields, normalized 0–1**; the new climate gives **per-cell annual
temperature, rain and Köppen**, and **monthly fields on a 1° grid**. So the work is an adapter plus some consumer changes.

| V1 field / layer | Read by | From the new climate |
|---|---|---|
| `r_temperature_summer/winter` (0–1 ↔ −45…45 °C) | temperature layers, hover, (old Köppen) | land: each cell's July / January from `cellClimate`'s `onCell` (12 months per land cell); sea: the 1° grid's `monthlySL`, sampled bilinearly |
| `r_precip_summer/winter` (0–1, p95) | precipitation layers, hover | same, from the 12 months' rain — **in mm/month** (see Units) |
| `r_wind_east/north_*`, wind speed, pressure (hPa from 1013) | wind/pressure layers, wind arrows | circulation `u`, `v`, `slp` for July / January on the 1° grid, sampled to regions (east/north are the grid's u/v) |
| `itczLons`, `itczLatsSummer/Winter` | ITCZ line on the pressure layers | circulation's `itczLat` per longitude, July / January |
| `r_ocean_current_east/north_*`, speed, warmth | current layers + arrows | ocean `u`, `v` — **annual only** (the new ocean is driven by the year's mean stress), so summer = winter; warmth from the sea-temperature anomaly (as Evolution's Currents view), speed p95 |
| `koppen` | Climate tab, Satellite, legend, exports | `cell.koppen` — as is |
| `rainShadowSummer/Winter` | Inspect › Rain Shadow | **not an output today**: the orographic windward/lee factor is computed inside `rain.js` (`orographicRain`) — expose it |
| `continentality`, `tempContinentality` | Inspect › Continentality, Temp Continentality | **no like-for-like**: the new climate does continentality physically (air masses, `temperature.js` Phase 12). Nearest honest layer: the annual temperature range (July − January), which *is* continentality's effect |

### Units

V1 normalizes temperature and rain to 0–1 and the readouts then mislabel them (Import prints 0–1 values as "°C" and
"mm/yr"; Generate shows rain ×1000 as "mm"). The new climate's fields are physical. Plan: **carry °C and mm/month to
the main thread** and change the colour ramps and readouts to physical scales — Evolution's ramps
(`v2/js/evolution/climate-view.js`) already exist for exactly these, which also makes the three pages agree.

### The temperature offset

Was added **after** the physics: a −15 °C world read colder and classified colder, but grew no sea ice or ice sheets
and its rain did not change. **Now (2026-10-13, the developer: "integrate the temperature (and precipitation if
relevant) into the physics")** both work inside the stages:

- **Greenhouse** (was Temperature): `greenhouseWm2`, a radiative forcing in `temperature.js` — the heat to space
  (`TEMP_OLR_A`) lowered by that many W/m²; the slider −30…+30 in steps of 2 (the same 31 positions as the old −15…15,
  so planet codes keep their slider positions; Evolution's old `temp=` links read as ×2). First calibrated so the
  average matched a °C label; the developer then: *"I kind of love the implications of the runaway effects here. So
  maybe we keep it… just name the slider something more appropriate"* — so no calibration, the snow and ice amplify it
  as they will. Earth, global mean surface change at −30 / −28 / −24 / −20 / −10 / +10 / +20 / +30 W/m²: −64.5 /
  −47.6 / −27.6 / −19.1 / −8.0 / +6.0 / +11.5 / +16.6 °C; sea ice 2.9 % → 25 % of the sea at −20, 62 % at −26, 96 % at
  −28 (a snowball), 0 at +20; ice sheets 11 % → 33 % of the land at −20, 3 % at +30.
- `precipScale` scales evaporation (sea and land) in `rain.js`: Earth's land rain −46 % / +41 % at −1 / +1 (global
  rain −50 % / +49 %); the clouds the rain brings shade the land a little more or less.
- Warmth brings rain on its own (warmer seas evaporate more — Clausius–Clapeyron): Earth's global rain ×0.34 at −20 W/m²
  and ×2.3 at +30, about twice the real world's hydrological sensitivity (≈ 2–3 %/K, energy-limited). Left as is for
  now: a hothouse that is lush and an ice age that is dry read right.
- At the defaults the climate is bit-identical (`hash-climate.mjs`).

## Inspect layers (decided 2026-10-13)

The developer: *"re-evaluate all the inspect layers … lean on what makes sense for the new model (or is a real life value
that is easy to compute from the model)"*; then: Jan and July *"make sense"*, and *"add all the optional layers"*.

Each climate layer is **one entry with a season picker — Year · January · July** (as Evolution's), instead of V1's
Summer / Winter pairs (which were northern-hemisphere seasons). Generate and Import get the same list:

| Layer | Shows | From the model |
|---|---|---|
| Pressure | sea-level pressure, hPa; the ITCZ line; wind arrows | circulation `slp`, `itczLat`, `u` / `v` |
| Wind | speed, m/s; arrows | circulation `u`, `v` |
| Ocean Currents | arrows, warm / cold by the sea's temperature against its latitude's mean | ocean `monthly.u`, `monthly.v` (seasonal — see *Seasonal currents*); `monthlySL` over sea |
| Temperature | °C, land and sea (the sea's is its surface temperature) | per-cell 12 months (`onCell`), the grid's `monthlySL` at sea |
| Precipitation | mm/month (mm/year on Year) | per-cell 12 months; the grid's `months.P` at sea |
| Rain Shadow | how mountains move rain: windward wetter, the lee drier (one layer) | `rain.js`'s orographic factor — to be exposed |
| Temperature Range | warmest month − coldest month, °C (what continentality does) | per-cell 12 months |
| Ice | sea ice by season; ice sheets | temperature `seaIce`, `iceFrac`, `domeKm` |
| Aridity | UNEP aridity index P / PET: hyper-arid · arid · semi-arid · dry sub-humid · humid | per-cell 12 months; PET from temperature (Thornthwaite) |
| Growing Season | months above 10 °C | per-cell 12 months |
| Rain Seasonality | wettest month against the driest (monsoons, Mediterranean summers) | per-cell 12 months |
| Upwelling | cold, nutrient-rich coasts (why the Atacama and Namib are deserts) | ocean `upwelling` (m/day) |

Dropped: **Temp Continentality** (V1's zone bookkeeping; nothing in the new model is like it). The Geology and Plate
Physics groups are the terrain generator's and are not part of this port.

## Seasonal currents (built 2026-10-13)

The developer: *"let's definitely update to have more seasonality. I think the fade out should go all the way to like 60
degrees"* — done first, in the new climate itself (so Evolution has it too), before the port.

**How** (`v2/js/climate/ocean.js`). The gyre model is linear in the wind stress, so it is solved three times — for the
year's mean stress and for the two parts of its annual cycle (first harmonic) — and each month's currents are the mean
plus that month's share of the cycle. The seasonal part is whole within `OCEAN_SEASON_FULL_DEG` (10°) and fades smoothly
to nothing at `OCEAN_SEASON_ZERO_DEG` (60°): the tropical ocean adjusts to the wind in weeks to months, the midlatitude
gyres take years. The Ekman upwelling follows each month's wind at every latitude, unfaded (it answers within days). The
heat — advection, upwelling, the overturning — is worked out per month and handed to the temperature stage, which takes
it into its harmonics (`ocean.monthly.qflux`). `OCEAN_SEASON_SCALE` = 0 gives back the old annual ocean exactly (checked:
identical Köppen on Earth). Evolution's Currents view now has Year / January / July (currents and sea-temperature anomaly).

**On Earth** (V1's Earth mesh, 40K, through the new climate; `season-ocean` experiment):

| | Annual ocean | Seasonal | Real |
|---|---|---|---|
| Somali Current, Jan → Jul (m/s, + north) | −0.011 → −0.011 | −0.058 → **+0.040** | reverses with the monsoon |
| Arabian Sea upwelling, July (m/day) | 0 | **0.24** | strong in the summer monsoon |
| Arabian Sea sea temperature, July | 29.8 °C | 29.0 °C | ≈ 27 °C |
| Equatorial countercurrent, Jan → Jul | −0.012 → −0.012 | −0.10 → +0.07 | strongest Aug–Oct |
| California upwelling, Jan → Jul | 0.013 → 0.013 | 0.016 → 0.040 | spring–summer peak |
| Gulf Stream | 0.037 | 0.035 / 0.038 | steady |
| Western Europe air, Jan / Jul | 2.3 / 15.8 °C | 2.8 / 16.3 °C | (the known cold bias eases) |

Köppen: 7.3 % of land cells change class (2.8 % their major group). Most look like gains — ice cap → tundra on Alaska's
north slope and west Greenland, tundra → subarctic on Kamchatka and the Bering coast, Cfb → Cfa in Uruguay, BSk → BSh in
Western Australia — and one like a loss: Sumatra Am → Aw (it is rainforest). Part of the high latitudes' warming is not
the currents (faded there) but the upwelling: monthly upwelling cools more in all than the year's did, and the ocean
moves heat without making it, so the difference is spread over all the sea.

**Cost**: the ocean stage ≈ 2.5× (≈ +0.3 s in this container's Node, ≈ +8 % of the whole climate in a browser).

**Open: Sumatra dries** (Af → Am / Aw). Why: month by month, upwelling under a reversing monsoon is rectified — it wells
up one season and sinks the other, and only the first cools. The model's December–March winds just north of the equator
west of Sumatra blow from the north at ≈ 10 m/s (real: a weak north-easterly, ≈ 3–4), turning the Ekman transport
offshore; the Indo-Pacific warm pool cools ≈ 1 °C all year, and the ocean's heat budget hands the difference to every
other sea as warmth — so part of the high latitudes' gains above is that hand-out. A fix that kept each place's yearly
ocean heat and added only the seasonal swing (Köppen change 7.3 % → 1.8 %, Sumatra Af again) was tried and reverted —
the developer: *"I don't know if we need to implement that hacky fix right now. We can wait until I'm on my machine for
the comparisons."* The likelier root cause is the circulation's cross-equatorial winds there.

**Still to do — the real score.** The reference data (NOAA, Beck) cannot be fetched in the cloud container, so the
Earth-match has to be run locally, with and without: `node tuning/climate/fetch-references.mjs` once, then
`node tuning/climate/coupled-check.mjs --quick` and `… --quick --set OCEAN_SEASON_SCALE=0`.

## Phases

**0 — Spike (S).** In Node: run the new climate on a Generate planet and an Import Earth at 2K · 40K · 200K · 640K · 2.5M
through V1's own mesh pipeline. Record timings, check land/sea (V1's elevation ≤ 0 is sea), and render Köppen maps next to
V1's. Try the two temperature-offset semantics at ±15 °C. No page changes.

**1 — The adapter (M).** `js/climate-new.js`: V1 mesh + `r_elevation` + sliders → `planetClimate(…, { axes: 'y-up',
tempOffsetC, precipScale })` → V1-shaped `climateFields` and `debugLayers` (table above), plus the physical values.
Expose the orographic factor from `rain.js` (a small, additive change in v2 — Evolution unaffected). Unit-test the
adapter's mapping on Earth (July hotter than January in the north, westerlies at 45°, Köppen = `cell.koppen`).

**2 — Wire it in (S).** `js/planet-worker.js`: the five places that run the V1 chain (`handleGenerate`, `handleReapply`,
`handleEditRecompute`, `handleImportHeightmap`, `handleComputeClimate`) and `generateFallback` call the adapter. Keep a
`?climate=v1` URL flag during development for side-by-side comparison. A slider change reruns the climate (~1 s, as now —
V1 cached wind and ocean; the new one recomputes, which is what the coupling needs).

**3 — Consumers (M).** `planet-mesh.js` colour functions (three copies: map mesh, globe mesh, recolour) to physical
ramps; legends; hover readouts on both pages (fixes Import's mislabelled units); ITCZ line; the Inspect list
(Rain Shadow from the exposed factor; Continentality → annual temperature range; drop or re-point Temp Continentality —
**decision**). The list is decided — see *Inspect layers*; the season picker replaces the paired entries.

**4 — Deferred climate and speed (S).** With ~1 s at any size, drop the 300K "skip climate" path (`shouldSkipClimate`,
`state.climateComputed`, the export modal's disabled types, Export All's pre-compute) or keep it only on phones — measure
on a phone first. Below ~80K the new climate is slower than V1; acceptable at ≤ 0.5 s extra, but measure.

**5 — Import specifics (S).** The initial import ignores the Temperature / Precipitation sliders (sends neither) — pass
them. Land Coverage's dryness hack (`precipitation.js:515`: big continents drier) has no place in the new climate, which
dries continental interiors physically — remove it, check large-continent planets still look right.

**6 — Tuning & CLAUDE.md (S–M).** `tuning/climate/evaluate.mjs` / `optimize.mjs` still score **V1's** climate (their
`lib/score.mjs` imports `js/wind.js` …). Point them at the adapter (or at `computeClimate` on the V1 Earth mesh, as the
v2 scripts already do), reconcile the three conflicting descriptions of the objective (README, comment, code), and update
CLAUDE.md's climate paragraph: tunables live in `v2/js/climate/config.js` (`PARAMS`), not `js/climate-config.js`.

**7 — Evolution's Temperature & Precipitation (S–M).** The same two controls (−15…+15 °C; ±50 %) in Evolution's World
section, in the link (`temp=`, `rain=`), passed to the climate worker and to Finish. Changing one: preview climates are
recomputed on demand (~1 s); a detailed moment is *out of date* — its rivers, glaciers and Satellite were sculpted by the
old climate — so the card says so and offers Add detail again. Also update the tutorial's "Steer it" step.

**8 — Satellite (optional, L).** V1's Satellite view colours by Köppen class (`biomeColor`). Evolution's is far better —
forest / grass / bare / snow cover from each cell's 12 months (`finish-cover.js` `landCover`). Using it for Generate and
Import is the biggest visual upgrade on offer, but a bigger job (per-region months, its colour pipeline, export). A
separate step, after the rest has settled.

**9 — Cleanup & docs (S).** Once the flag has been unused for a while: delete V1's climate modules (`wind.js`, `ocean.js`,
`precipitation.js`, `heuristic-precip.js`, `temperature.js`, `climate-config.js`, the old Köppen rules), `?climate=v1`
and the old tuning. README (Features: wind, ocean, precipitation paragraphs describe V1's models), the Generate tutorial
(step 3: "At high detail, climate is skipped automatically"), `llms.txt` (technical details), What's New (a heads-up:
planet codes still load but climates change, as last time).

## Against "What Users Love"

- **Climate depth** — gains accuracy; every layer keeps a meaningful equivalent (the Continentality layers change
  meaning — decision below). Never fewer layers.
- **Instant** — faster at the default detail and far faster above it; slightly slower at the lowest detail.
- **Customizability** — the Temperature / Precipitation sliders keep their ranges, so **planet codes stay valid** (no
  `planet-code.js` change) — but the same code gives a different climate.
- **Mobile** — the 1° grid costs the same on a phone at any detail; measure the absolute time on a phone (Phase 4).

## Decisions needed

1. ~~Continentality layers~~ — decided: Temperature Range; Temp Continentality dropped.
2. **Temperature slider semantics**: a post-hoc shift (as now, cheap) or a forcing (ice and rain respond — more believable
   at ±15 °C)?
3. ~~Seasons~~ — decided: Year · January · July everywhere.
4. **Satellite (Phase 8)**: in this project or later?
5. **Transition**: ship behind a flag first, or switch outright on the branch and compare there?
