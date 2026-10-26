# The new climate — report

For the developer, written on 2026-09-28 while you were at work. Each phase has its own commit, its own section below
and its own panel section in the climate lab, so you can review them one at a time. The detailed engineering notes
per phase are in `plans/CLIMATE_REBUILD_PLAN.md`.

## In short

All eight planned phases are built and committed, plus Phases 9–11 from your feedback. The new climate is a chain of
stages you can read and check one at a time: temperature, pressure and wind, ocean, rain, then Köppen.
- **Earth, every stage new: Köppen matches Beck on 48.5 % of land vs V1's 38 %** (50.6 % after Phase 10; Phase 11 traded
  two points for more realistic pressure, winds, seas and seasons — see decision 7).
- **Pressure and winds** (Phase 11): the Southern Ocean's deep trough and westerlies, the Siberian high, the Icelandic
  and Aleutian lows and the oceanic subtropical highs now sit near their real places and strengths; stronger South and
  East Asian monsoons; an overturning ocean that warms the North Atlantic.
- **Detail:** since Phase 9, rain and seasons follow the terrain and coasts below the climate grid, with a gentle
  texture. 16.9 % of neighbouring land cells differ in class (real map 17.8 %, V1 15.1 %, Phase 8 9.7 %).
- **Mountains** (Phase 10): wet windward slopes and dry rain shadows, twice as strong as before (real: about 3.4×).
- **The tropics** (Phase 10) keep a steady temperature through the year, with no jump at the equator.
- **Tibet is tundra** (ET 84 %, real 77 %).
- **The same result at 160K, 640K and 2.5M terrain cells.** V1 drifts with resolution.
- **Speed:** 0.8–1.0 s in Chrome on the desktop at any terrain size. V1 takes 0.51 s at 40K but 2.07 s at 160K and
  10.9 s at 640K.
- **It runs on real Evolution frames:** the lab builds an Evolution world and gives it a climate.
- **Not yet where you want them:**
  1. **Mediterranean climates.** 13 % found, about the right area, but the Mediterranean basin itself is still mostly
     steppe: its winters are too dry.
  2. **Western Europe's winters are still too cold** (better: France is mostly oceanic now; Germany and the UK are not).
  3. **The US interior West** is too cool in summer and too wet.
  4. **Heat lows sit too near the equator** in the southern summer, so northern Australia's and West Africa's monsoons
     stay weak.
  5. **Speed at V1's 40K default.** The new climate is 1.6× slower there.

## How to review

- **Code.** Everything is in the worktree `.claude/worktrees/climate-rebuild`, on branch `climate-rebuild`, with one
  commit per phase: `git log --oneline v2-tectonics..climate-rebuild`, then `git show <commit>` for one phase. V1's app
  code (`js/`, `index.html`, `import.html`) is not touched by any phase.
- **The lab.** From the worktree, run `node tuning/dev-server.mjs 8147`, then open
  `http://localhost:8147/v2/climate-lab.html` (phone on the same Wi-Fi: `http://192.168.1.230:8147/v2/climate-lab.html`).
  - The panel has one section per phase, with its numbers.
  - "New climate" runs the whole new climate on this device, on Earth, a test planet or an Evolution world.
  - Every field (Köppen, Temperature, Seasonal swing, Rain, Pressure & wind, Ocean) has an "Observed", a "V1" and a
    "New" source; use Side by side to compare.
- **The checks.** One script per phase in `tuning/climate/`, listed in its README. They need the downloaded Earth data;
  the steps are in the README.
- **The lab's tables show the final settings.** The checks were re-run at the end, so a phase's table can differ a
  little from the numbers in its section below, which are from when the phase was built.

## Where it stands

| Phase | What | Gate | Headline |
|---|---|---|---|
| 0 | Earth references, the lab, V1 audited stage by stage | — | V1's stages are individually poor; rain costs the most |
| 1 | The core skeleton (grid, 12 months, height correction, Köppen) | passed | With real data, ≈ 88 % Köppen per terrain cell; no drift 160K–2.5M |
| 2 | Temperature (energy balance) | passed | 4.2 vs V1's 5.0 °C error (continents weighted equally); test planets physical |
| 3 | Pressure and wind (derived from temperature) | passed | Wind direction 73 % vs V1 52 %; monsoons reverse; rain belt 7° vs 11.6° |
| 4 | Ocean (gyres, circumpolar currents, upwelling → temperature) | passed | Warm-west / cold-east sea pattern 0.36 vs V1 0.24; Europe milder; all named currents right; effects ≈ ⅓ of real |
| 5 | Rain (a column-water budget) | partly | Every stage new: Köppen 46 % vs V1's 38 %; rain patterns and continents beat V1; deserts beside monsoons too wet, rainforests too dry |
| 6 | The coupled climate, tuned on Köppen; speed | mostly | **Köppen 49.5 % vs V1's 38 %**; no drift to 2.5M; 0.8 s in Chrome (V1: 0.5 s at 40K, 2.1 s at 160K) |
| 7 | Evolution (engine level) | passed | The climate runs on real Evolution frames (z north, km): 0.6–0.75 s; the page wiring waits for the Evolution page |
| 8 | Mediterranean climates | not met | Subtropical highs now migrate with the seasons; dry-winter climates appear (Cw 32 %, Dw 15 %); Köppen 50.5 %; Mediterranean area ≈ right but mostly misplaced (8 % recall) |
| 9 | Your feedback: detail, Tibet, Mediterranean, warm and cold currents | mostly | Detail 15.9 % class edges (real 17.8 %, V1 15.1 %, before 9.7 %); Tibet tundra (ET 75 %); Mediterranean 13 % found; Köppen 49.5 % |
| 10 | Your feedback: the equator, too wet, mountains | mostly | Tropics steady through the year; land rain 832 vs 839 mm/yr (was 898); windward ÷ lee ×2.0 (was ×1.4, real ×3.4); Köppen 50.6 % |
| 11 | Your feedback: pressure, monsoons, Europe, the US West, islands | partly | Belts and centres of action near real; Southern Ocean westerlies 5.2 vs 6.8 m/s (was 2.3); stronger Asian monsoons; an overturning ocean; islands twice as wet; every physical measure better; Köppen 48.5 % |
| 11b | Your feedback: simulated planets too blotchy | done | The climate follows half of each terrain cell's own bumps: Evolution worlds ≈ 30–40 % fewer speckles and patches; Earth still near the real map's detail; Köppen 48.2 % |
| 11c | Your question: do higher mountains release more rain? | done | Windward slopes now get wetter with height up to the crest; crests no longer drier than the plains; mountain contrast ×2.11 (real ×3.42) |
| 11d | Your feedback: warm and cold currents, relative to their latitude, and their rain | mostly | Warm-current seas now clearly warmer than cold-current seas (+1.2 °C, was +0.1; real +2.8); their coasts warmer and wetter or cooler and drier; Köppen 47.2 % (decision 8) |
| 11e | Your feedback: generated worlds too dry | found, part fixed | Two causes: Phase 11d cooled the subtropical seas ≈ 1 °C (fixed: currents now relative to each latitude; Köppen back to 48.3 %), and weak summer monsoons (next phases) |
| 12 | Your feedback: continentality along coasts and islands | mostly | Air masses carried by each month's wind: Europe's winters right inland (Moscow's coldest month −7.7 vs real −7.3, was −16.1), east coasts colder, the annual-range error 6.83 → 6.26 °C; Köppen 48.1 % (Europe +5 points) |
| 13 | Your feedback: generated worlds too dry (monsoons) | partly | Land now rains more readily than the sea under a strong sun: worlds 36 % arid (were 40–42 %), within a few points of what their latitudes predict; Köppen 47.0 % (decision 9) |

## Decisions waiting for you

1. **The texture** (Phase 9): keep it, soften it or drop it? The lab's "Detail below the climate grid" switch shows
   it on and off. It costs about a point of Köppen.
2. **What next.** Three open weaknesses; which matters most to you?
   - **Mediterranean placement.** It needs stronger winter westerlies at 30–45° in the circulation stage.
   - **The arid bias.** It shows on invented worlds: moisture reaches continental interiors too weakly.
   - **Speed at 40K.** Pass coarse fields between stages; compute the circulation only at the points in the year.
3. **Two settings moved from their earlier tunes in the final Köppen tune:**
   - the circulation's thermal lows and highs, 0.78 → 1.23 hPa/K;
   - the Hadley cells' seasonal share, 0.63.

   Both are within their literature ranges. What they bought and what they cost:
   - Köppen 49.5 → 50.5 %;
   - the dry-winter climates appear (Cw 19 → 32 %, Dw 0 → 15 %);
   - Evolution worlds are less arid;
   - but the circulation's own pressure error rose from 2.9 to 3.3 hPa (V1: 4.0), and a supercontinent's interior is no
     longer drier than its coasts (a stronger summer monsoon reaches inland).

   Keep, or hold the circulation at its Phase 3 tune?
4. **Points in the year: 4 or 6.** This matters for rain. The default is 6, the only setting that passed the Phase 0
   gate.
5. **Commit and merge.**
   - **Commits:** the phases are committed on `climate-rebuild`; nothing is pushed.
   - **Merging:** merge into `v2-tectonics` once your Evolution work is committed there. Phase 7's page wiring (three
     steps, in the plan) needs that page in this branch.
6. **The CLAUDE.md smoothing rule** (from the research). The new climate doesn't depend on it; fixing it for terrain
   code is separate.
7. **Realism vs the Köppen score** (Phase 11). Every physical measure improved (pressure, winds, sea and land
   temperature, the Köppen major groups), but the exact Köppen match fell from 50.6 to 48.5 %. The Köppen tune also
   chose a weak "land's own seasons" layer (`TEMP_LOCAL_K` 14): Australia's seasons are still half of real and the Great
   Basin's summer 7 °C too cool. `TEMP_LOCAL_K` 8 gives them most of their real seasons for about a point of Köppen.
   Which way do you want it?
8. ~~Currents vs the Köppen score~~ — settled by Phase 11e: the point of Köppen was a bug (the subtropical seas ran
   cold); with it fixed the currents cost nothing.
9. **Wetter worlds vs the Köppen score** (Phase 13). Land convection (`RAIN_LAND_CONVECTION` in
   `v2/js/climate/config.js`) makes generated worlds less arid at a cost on Earth: 0.05 → worlds 38–39 % arid, Köppen
   47.6 %; **0.065 (now)** → 36 %, 47.0 %; 0.08 → 34–35 %, 46.0 % (Australia's deserts turn to steppe). Which feel do
   you want?

## The approach, in one paragraph

Each stage answers one physical question with a handful of physical settings, and each setting has a literature value
and a range (`v2/js/climate/config.js`). Earth is a check, not the target.
- Each stage is scored on its own against real observations.
- Scoring uses the whole Earth, but each continent (and each ocean basin, for fields at sea) counts equally.
- A setting may move from its literature value only if no region gets worse.
- Four synthetic test planets must behave as physics expects.

The stages are temperature ↔ pressure and wind ↔ ocean, then rain, then clouds back into the temperature, then 12
months and Köppen. The grid-scale stages run on a fixed 3° grid and the finishing on 1°, so the result is the same at
every terrain resolution.

---

## Phase 0 — groundwork and measurements

**Built.**
- Real Earth data on a shared 1° grid: Beck 2023 monthly temperature and rain plus its Köppen map; NOAA pressure,
  winds, sea temperature, sea ice and rain.
- The climate lab.
- A stage-by-stage audit of V1's climate.
- A test of how many points in the year the climate needs.

**Found.**

| Stage | V1 against real Earth |
|---|---|
| Wind direction | Within 45° only 55 % of the time |
| Rain belt | 10–13° too far poleward |
| Ocean warmth | Barely related to the real warm and cold currents (corr. 0.22) |
| Rain | Poor (corr. ≈ 0.5) |
| Temperature | The best stage, but 7.8 °C typical winter error |

- V1 matches Beck's Köppen map on 38 % of land.
- Swapping real data in: real temperature with V1's rain gives 56 %, and V1's temperature with real rain gives 66 %.
  So rain costs the most.
- **Your suspicion that errors average out: confirmed.**
- **Two seasons break Köppen.** Six points in the year keep 96.5 % of land in its class; four keep 93.6 %.

**Check in the lab.** Köppen with the sources Beck, 12 months, 6 points, 4 points, 2 seasons and V1. Rain, Pressure &
wind and Ocean warmth: Observed vs V1, side by side.

## Phase 1 — the core skeleton

**Built.** `computeClimate()` (`v2/js/climate/core.js`):
- a fixed grid;
- 12 months rebuilt from K points;
- each terrain cell corrected for its own height;
- Köppen per terrain cell, with Beck's rules.

It is generator-neutral: V1's axes or Evolution's, heights in km.

**Numbers.**
- Fed real Earth data, it matches Beck's fine map on ≈ 88 % of land. That is the ceiling for everything that follows.
- No drift from 160K to 2.5M terrain cells: class shares move ≤ 0.4 %. V1's temperate share, by contrast, falls from
  18 % to 11 % between 40K and 640K.
- It takes 0.34 s at 2.5M cells in Chrome.

**Check in the lab.** New climate → Temperature: "Real data" → Run; then Köppen → New, side by side with Beck.

## Phase 2 — temperature

**Built.** A seasonal energy-balance model (`temperature.js`, with the multigrid solver `solver.js`):
- sunlight for any tilt;
- land stores little heat, the sea a lot;
- heat spreads mainly poleward and is carried by the winds;
- snow and sea ice, with only snow that survives the summer acting like an ice sheet;
- plateaus heat the air above them; ice sheets chill it;
- winter inversions over snow in calm air.

**Your two directions during the phase.**
- *Physical settings that transfer to other worlds; Earth isn't gospel.* Tuning on the Americas and checking on the rest
  overfit, so the fix was physics.
- *Tune on the whole Earth, per continent.* Done. Only five settings moved a little from their literature values.

**Numbers.**
- Typical June–August / December–February error on land: 4.2 / 5.4 °C, vs V1's 4.9 / 7.8.
- Continents weighted equally: 4.2 vs 5.0 °C.
- Köppen with real rain: 68 %, vs 64 % with V1's temperature.
- Test planets: seasons biggest inland, a mild west coast, supercontinent interiors swinging 38 °C.

**Known.**
- Europe is too cold (the Gulf Stream comes in Phase 4).
- Desert summers are too mild and the rainforest too warm (both need rain and clouds, Phase 6).

**Check in the lab.** New climate → Earth → Run → Temperature → New, side by side with any month; Seasonal swing;
"New − observed"; each test planet.

## Phase 3 — pressure and wind

**Built.** `circulation.js` derives pressure and winds from the temperature:
- belts placed by the planet's own warmth: the rain belt at each longitude's warmest latitude, Hadley edges from Held &
  Hou;
- thermal lows over warm ground and highs over cold ground, with plateaus as elevated heat sources;
- winds from pressure with friction.

Temperature and winds run together until they agree.

**Numbers** (against V1 on the same cells, regions weighted equally):

| Measure | New | V1 |
|---|---|---|
| Wind direction within 45° | 73 % | 52 % |
| Pressure pattern error | 2.9 hPa | 4.0 hPa |
| Rain belt | 7.0° off | 11.6° off |

- **Named features:** the South Asian monsoon reverses (south-westerly in July), and the West African and East Asian
  winter monsoons are right. The eastern-ocean summer highs, the Siberian High and the Aleutian Low are present at
  about half strength.
- **Coupled:** temperature is no worse with its own winds.
- **Test planets:** trade winds and westerlies appear by themselves; monsoon winds onto the tropical continent and the
  supercontinent.

**Known.**
- The highs and lows are about half strength, which matters for Mediterranean climates (Phase 8).
- Southern Ocean winds are too weak.
- The coupled step is ~0.5–0.9 s (a speed pass is planned).

**Check in the lab.** New climate → Earth, Winds "Derived" → Run → Pressure & wind → New, side by side, month slider;
the cyan line is the new rain belt.

## Phase 4 — ocean

**Built.** `ocean.js`:
- Wind-driven gyres (a Stommel model). The Gulf Stream and Kuroshio come out of the physics on any map.
- Circumpolar currents where a latitude belt is open sea.
- The heat both carry into the temperature: warm water poleward along western edges, and cold upwelling where winds
  push surface water offshore (California, Peru, Namib, the Canaries, the equatorial Pacific).

Temperature, winds and ocean run together.

**Numbers.**
- The sea's warm-west / cold-east pattern: 0.36 vs V1's 0.24.
- Europe's temperature error: 5.4 vs 6.0 °C (real winds), 5.1 vs 5.4 °C (coupled).
- All named currents flow the right way, and all four upwelling coasts come out colder than their latitude.
- Test planets: warm currents poleward along east coasts, cold ones along west coasts.

**Known.**
- The effects are about a third of reality's.
- The North Atlantic isn't warmer than its latitude (that needs the deep overturning circulation, which this simple
  ocean doesn't have).
- With the model's own, gentler winds, the pattern weakens.

**Check in the lab.** New climate → Earth → Run → Ocean warmth → New, side by side with Observed (the arrows are the
currents); Sea ice → New by month.

## Phase 5 — rain

**Built.** `rain.js`: the water in each air column, in balance at each point in the year.
- **In:** evaporation from the sea (warm water, wind, storms); from land as much as the sunshine can evaporate and the
  ground holds, with snow and soil carrying water from wet months into dry ones.
- **Moved:** by the winds (only a shallow layer converges under dry air, a deep one where it rains) and mixed by storms.
- **Out:** rain, which grows steeply as the air nears saturation.
  - Winter storms make the storm belts rain more, so winter-wet west coasts appear by themselves.
  - Air off a cold sea is stable and rains less.
  - Mountains hold water back: wet windward, dry lee.

Water is conserved exactly (rain = evaporation worldwide). Everything is physics with literature ranges; Earth only
nudged the settings.

**Numbers** (real temperature, so the error is the rain stage's own):

| Measure | New (real winds) | New (own winds) | V1 |
|---|---|---|---|
| Rain pattern, Jun–Aug / Dec–Feb | 0.66 / 0.65 | 0.61 / 0.57 | 0.46 / 0.62 |
| Wet season the right way round | 78 % | 79 % | 81 % |
| Typical error per continent (lower is better) | 0.75 | 0.79 | 0.82 |
| Köppen: real temperature + this rain | 56.4 % | — | 55.2 % |

- **The whole new climate on Earth** (every stage new): **Köppen 46 % of land vs V1's 38 %**, wet season right way round
  88 %.
- **Named features that work:** the Atacama and inland Australia are dry; the South Asian, West African and East Asian
  monsoons; winter-wet California; the Pacific Northwest's rain shadow; the eastern Pacific rain belt north of the
  equator.
- **Test planets:** all pass. The coastal range is 77 vs 28 mm/month windward vs lee. The supercontinent has wet
  equatorial coasts and an arid interior, as paleoclimate runs of Pangaea do.

**Gate: partly met.** The truth swap, season patterns, continents and test planets beat V1 or pass. Two things don't:
the wet-season measure (78 % vs 81 %; it is 88 % with every stage new), and 9 of 16 named features.

**Known.**
- Deserts next to monsoons are too wet (Sahara, Arabia, Thar).
- Rainforests are too dry (Congo, the Maritime Continent).
- Patagonia's rain shadow is too weak.
- With the model's own winds, Africa's rain belt runs into the Sahara: the circulation puts the tropical trough at the
  hottest latitude. Placing it by where the air is moist and warm was tried in Phase 6 and made Köppen worse.
- It is slow: the whole climate takes 2.2 s at 160K in Chrome (V1: 0.5 s at 40K). The speed pass is Phase 6.

**Check in the lab.** New climate → Earth (Rain "New (Phase 5)") → Run → Rain → New, side by side with Observed; "New −
observed" for the ratio; Köppen → New against the Beck map. The test planets, including the new coastal range.

## Phase 6 — the coupled climate

**Built.**
- **Rain feeds back into temperature through clouds.** Rainy land is shaded and dry land gets the full sun; the planet's
  average brightness is unchanged. This fixed part of Phase 2's known error (desert summers too mild, wet summers too
  warm): land temperature error 4.4 → 3.9 °C, Köppen +2.3 points.
- **A final Köppen-level tune** of a few coupling settings. Each stage's own score was a guardrail and no continent could
  get worse; only the cloud strength moved, within its literature range.
- **A speed pass.**
  - The grid-scale stages now run on a 3° grid (scores the same or better).
  - Two coupling rounds instead of three.
  - Solver and smoothing speed-ups.
- **Tried and dropped:** placing the tropical rain belt by where the air is moist (the textbook monsoon fix) made
  Köppen worse (45–46 % vs 46.3 %), so it isn't in.

**Numbers** (Earth, every stage new):

| | New | V1 |
|---|---|---|
| Köppen, same class as Beck | **49.5 %** | 38 % |
| Same major group (A/B/C/D/E) | 74.9 % | — |
| Per continent | N. America 50, S. America 41, Europe 50, Africa 61, Asia 30, Australia 62 % | — |
| Same at 640K / 2.5M cells | 49.4 % / 49.4 % (class shares within 0.6 %) | V1 drifts: its temperate share falls 18 → 11 % from 40K to 640K |
| Time, Chrome desktop, 40K / 160K | 0.8 s / 0.8 s | 0.51 s / 2.07 s |

Every stage's own gate still passes at the final settings.

**Gate: mostly passed.** Köppen beats V1, no drift, stages hold. **Speed:** 1.6× slower than V1 at V1's 40K default,
faster than V1 from 160K up (the new climate barely depends on the terrain resolution).

**Known.**
- Asia is the weakest continent (30 %): boreal summers still a little warm; Tibet comes out as cold desert.
- Dry-winter climates (Cw, Dw) are nearly missing.
- Mediterranean recall is 7 %: Phase 8.
- The test planets come out arid (a flat mid-latitude continent is about ⅔ desert or steppe). The model's own
  westerlies are weak, so moisture reaches inland poorly. On Evolution's planets this will read as too much desert.

**Check in the lab.** New climate → Earth → Run (40K or 160K; the time is in the table) → Köppen → New, side by side with
the Beck map; Temperature → "New − observed". The Phase 6 table has the per-continent scores, regimes, drift and the
test planets' climates.

## Phase 7 — Evolution

**Built.**
- **`planetClimate()`:** one call for any planet — cell positions and heights in km; Evolution's frames have z north.
- **The lab can build a real Evolution world.** It runs the V2 engine's whole-planet history (600 Myr, or run on until
  a supercontinent forms), takes its last frame's terrain, and runs the climate on it: "Evolution world" and
  "Evolution supercontinent" in the planet list.

**Numbers.**

| World | Climate groups A / B / C / D / E | Checks |
|---|---|---|
| 600 Myr | 16 / 35 / 14 / 18 / 17 % | all pass |
| Supercontinent | 12 / 42 / 15 / 24 / 8 % | all pass: interior drier (54 vs 50 %) and more continental (34 vs 20 °C seasons) than the coasts |

- The same climate at 160K and 640K (class shares within about 1 %).
- 0.6–0.75 s for the climate.

**Not done: the Evolution page's "Calculate climate" button.** That page is being built in the other checkout; once
it's committed and merged here, the wiring is three steps (listed in the plan's Phase 7 section).

**Known.** Evolution worlds come out very arid in the subtropics (about 90 % of land at 15–35°), like the test planets.

**Check in the lab.** New climate → Planet "Evolution world" (or "Evolution supercontinent") → 160K → Run (wait about a
minute the first time) → Köppen, Temperature, Rain … → New.

## Phase 8 — Mediterranean climates

**What was wrong.**
- Real Mediterranean coasts came out as steppe: winter rain was a half to a sixth of the real amount, and summers too
  wet.
- **The deeper cause:** the model's subtropical highs didn't move through the year. The northern one sat at 24–34°, out
  of phase, where the real one moves from 28° in winter to 38° in late summer; that seasonal swing is what makes
  Mediterranean summers dry and winters wet.

**Built.**
- **The Hadley cells' width now follows the year-round contrast between equator and pole** (Lindzen & Hou), so the highs
  move with the seasons: 22–24° in winter and spring, 36–38° in late summer.
- **The final tune now also rewards the rarer climates** (Mediterranean, dry-winter, monsoon) and holds the circulation's
  own scores as guardrails. A first try without those guardrails bought Köppen by breaking the circulation; it was
  discarded.
- **Four other ideas were tried, measured and dropped:** frontal rain, storms breaking through stable air, drying under
  high pressure, and regional storm tracks. None helped.

**Numbers:**

| | Before (Phase 6) | Now |
|---|---|---|
| Köppen, all land | 49.5 % | **50.5 %** |
| Dry-winter temperate (Cw) found | 19 % | 32 % |
| Dry-winter continental (Dw) found | 0 % | 15 % |
| Tropical monsoon (Am) found | 21 % | 23 % |
| Mediterranean (Cs) found | 7 % | 8 % |
| Mediterranean area, new ÷ real | 0.67 | 0.79 |

- **Cost:** the circulation's pressure error rose from 2.9 to 3.3 hPa (still better than V1's 4.0); every stage's gate
  still passes.
- **Evolution worlds** (A / B / C / D / E): 16 / 34 / 15 / 18 / 18 % at 600 Myr, and 11 / 37 / 19 / 25 / 7 % for the
  supercontinent (less arid than before: B 42 → 37 %).
- **Tradeoff:** the supercontinent's stronger summer monsoon now reaches inland, so its interior is about as arid as
  its coasts (41 vs 44 %) instead of drier. Its seasons are still much bigger (34 vs 20 °C). Keep this, or keep the
  drier interior? (Decision 2.)

**Gate: not met.**
- Mediterranean climates now cover about the right area, but mostly in the wrong places. Winter rain on the 30–40° west
  coasts is still about half of real, because the model's westerlies there are weak (Phase 3's known limit).
- Next steps are in the plan's Phase 8 section: stronger winter westerlies at 30–45°, and less summer recycling.

**Check in the lab.** New climate → Earth → Run → Köppen → New, side by side with the Beck map. Look at the
Mediterranean, California, central Chile, SW Australia, the Cape; and at East Asia and Siberia for the new dry-winter
climates. The Phase 6 table lists the regimes.

## Phase 9 — your feedback: detail, Tibet, the Mediterranean, warm and cold currents

**What I found.**
- **"Too smooth"** is measurable. In the real map, 17.8 % of neighbouring land cells differ in class; in V1,
  15.1 %; in the new climate before today, 9.7 %.
- **Finer climate grids barely help** (a 1° rain grid only reached 10.4 %, at four times the cost). The real map's
  detail is terrain: ridges, valleys, rain shadows, coasts. Temperature already followed the terrain cell by cell;
  rain didn't.

**Built.**
- **Rain now follows the terrain below the grid:** ridges wetter, valleys drier, windward slopes wetter and lee slopes
  drier.
- **Coasts are sharper than the grid:** a coastal cell's seasons are milder, an inland cell's harsher.
- **A gentle texture:** smooth variation of a fixed size in km (≈ ±1 °C, rain ±35 %). It stands in for what the grid
  can't resolve, and looks the same at every terrain resolution.
- **Tibet:** the water held over high ground now falls off more slowly with height, calibrated on the water actually
  observed over the plateau. Tibet is now tundra (ET 75 %, real 77 %), with 516 mm/yr of rain (real
  487).
- **Mediterranean:** air sinking under the subtropical highs dries the coasts downwind of them in summer, carried onshore
  with the air, and only near the subtropical highs, so western Europe stays wet.
- **Your warm and cold currents.**
  - Air off cold water already rained less (cold currents, upwelling).
  - Air off warm water (or over a heated plateau) can now rain more.
  - Measured on Earth, the warm half helps Tibet but lowers Köppen elsewhere and doesn't move the Mediterranean, so
    it's off by default (`RAIN_INSTABILITY`), ready to try.
- **Five other ideas were tried, measured and dropped** (listed in the plan).

**Numbers:**

| | Before | Now | Real |
|---|---|---|---|
| Class edges (detail) | 9.7 % | **15.9 %** | 17.8 % (V1 15.1 %) |
| Tibet | cold desert | **tundra (ET 75 %)** | ET 77 % |
| Mediterranean found | 8 % | 13 % | — |
| Dry-winter climates found (Cw / Dw) | 32 / 15 % | 36 / 22 % | — |
| Köppen, all land | 50.5 % | 49.5 % | (V1 38 %) |

**The trade.** About a point of Köppen accuracy for the texture and the terrain detail. No drift across terrain
resolutions; every stage's gate still holds except rain's (as before).

**Still not right.**
- **The Mediterranean basin** is still mostly steppe: its winters are too dry because the winter storm track doesn't
  reach it. That's circulation work.
- **California summers** are still too wet.
- **Western Europe** is still too cold in winter (continental Dfb instead of oceanic Cfb).

**Check in the lab.** New climate → Earth → 160K → "Detail below the climate grid" → Run → Köppen → New, side by side
with the Beck map. Run it again with "Smooth" or "Terrain only" to compare. Tibet, the Andes and the Rockies show the
terrain detail best.

## Phase 10 — your feedback: the equator, too wet, mountains

**What I found.**
- **The equator.** The zonal means were smooth; the problem was tropical land north of the equator, whose seasons were
  about twice the real swing (at 9°N: July 27.6, January 22.5 °C; real 24.9 and 25.0). Two things were missing:
  - wet tropical ground spends the sun's heat on evaporation, which steadies its temperature;
  - the rainy season's clouds and wet ground keep it mild. The energy balance spreads any local heating over thousands
    of km, so it couldn't show this locally.
- **Too wet.** Phase 9's fix for Tibet let every high basin hold nearly as much water as the windward coast, in every
  season. North America had 955 mm/yr (real 745) and almost no dry climates (2 % vs 15 %).
- **Mountains.** Measured on twelve ranges, windward rain was only 1.4× the lee's; real is 3.4×. Mountain rain was
  driven by the gentle monthly-mean wind, while real mountain rain falls in storms. Rain shadows could only move rain
  within one 3° grid cell, so a whole region behind a range could never be dry.

**Built.**
- **The tropics keep a steady temperature:**
  - Evaporation damps the seasons over wet tropical ground and sea.
  - Wet tropical ground stays mild under the grid: the rainy season is cooler, and the dry season before the rains is
    the hottest, as in real monsoon lands.
  - Both fade out toward the subtropical highs, so mid-latitude seasons are unchanged.
- **Less wet:** high ground holds a deep moist layer only when it heats the air, like a sunlit plateau in summer. Cold
  high basins hold water like the free air above them, so Tibet still gets its monsoon rain and the Great Basin dries.
- **Mountains:**
  - Air is forced up mountains at storm strength.
  - Windward slopes take their rain from up to 600 km around, so the lee is dry.
  - Air that has come down from higher ground upwind is dry: the rain shadow reaches a few hundred km behind a range.

**Numbers:**

| | Before | Now | Real |
|---|---|---|---|
| Tropical land at 9°N: January, July | 22.5, 27.6 °C | 23.4, 25.5 °C | 25.0, 24.9 °C |
| … at the equator (1°N) | 24.7, 26.0 °C | 24.2, 24.5 °C | 24.9, 24.1 °C |
| Land rain, all / North America | 898 / 955 mm/yr | **832 / 826** | 839 / 745 |
| North America's dry climates (B) | 2 % | 13 % | 15 % |
| Mountains: windward ÷ lee | ×1.4 | **×2.0** | ×3.4 |
| Detail (class edges) | 15.9 % | 16.9 % | 17.8 % |
| Köppen, all land | 49.5 % | **50.6 %** | (V1 38 %) |

No drift across terrain resolutions; every stage's check holds as before. The whole climate is ≈ 10 % slower (0.73 s
in Node at 160K).

**Still not right** (looked at with your later notes; the circulation is behind most of them, so it's next):
- **Europe isn't oceanic enough.** Winters on the Atlantic fringe are far too cold (UK −1.5 vs 4.7 °C, Germany −2.6 vs
  0.8) and summers too dry, so the UK comes out continental and France half Mediterranean.
- **The US West.** The Great Basin is still ≈ 1.8× too wet, and its summers are 8 °C too cool: ocean air reaches the
  interior as if the Sierra and Cascades weren't there. California's winters are 2.5× too wet.
- **Monsoon winds.** In July the model's winds on the Gangetic plain blow down from Tibet instead of toward the
  Himalaya.
- **Small islands are about a third as wet as real** (Hawaii, Fiji, the Caribbean).

**Check in the lab.** New climate → Earth → 160K → Run. Temperature → New in January and July across Africa and South
America: no band at the equator. Rain → New along the Andes, the Sierra and New Zealand: wet windward, dry lee.

## Phase 11 — your feedback: pressure, monsoons, Europe, the US West, islands

**Where the pressure was wrong** (`node tuning/climate/diag-pressure.mjs --maps` shows it all):
- **The Southern Ocean's trough was far too shallow**, so its westerlies blew at 40 % of real.
- **The northern high latitudes were 10–13 hPa too low in winter**: the Aleutian and Icelandic lows too deep, the
  Siberian high weak and too far south.
- **The subtropical highs slid onto the land in winter** (the Azores high over the Sahara), so the trades were weak.
- **The monsoons were weak** because the continents' summers were not hot enough to make heat lows.
- The checks couldn't see much of this: they ignored the belts' depth and the winds' speed, and their error measure
  rewarded a flattened pressure map.

**What else I found on the way.**
- **Mid-size continents had half their real seasons** (Australia, southern Africa, Argentina, the Great Basin): the
  energy balance spreads heat over thousands of km, which ties them to the sea around them.
- **The North Atlantic was 5 °C too cold** (the Norwegian Sea froze in winter): the model had no overturning ocean.
- **India was 5 °C too cold**: Tibet's cold leaked through the Himalaya.
- **Islands were ocean** on the rain grid.

**Built.**
- **The belts follow open sea:** a deep trough over the Southern Ocean and a shallow one where the continents break it
  up, as on Earth.
- **The highs and lows follow the ground:**
  - heat lows are deep over hot, dry interiors and weak over mild land;
  - cold highs are strong over very cold land;
  - the subtropical highs stay over the oceans.
- **Land keeps its own seasons** below the energy balance's scale, except where the wind brings the sea's air (so the UK
  stays maritime).
- **Mountains block the low air's heat:** India is shielded from Tibet, Chile from Argentina.
- **An overturning ocean:** warm water flows to seas that open onto the polar ocean (the Atlantic through the Nordic
  seas; not the Pacific) and releases its heat there.
- **Islands are wetter:** their mountains count at full height, and warm islands draw in the sea's moist air.
- **The checks now score the belts' depth, the winds' speed and the pressure map's strength.**

**Numbers:**

| | Before | Now | Real |
|---|---|---|---|
| Trough at 65°S, July | 999 hPa | **988** | 987 |
| Siberian high | 1024 hPa at 38°N | **1032 at 47°N** | 1036 at 47°N |
| Icelandic / Aleutian low | 987 / 989 hPa | **993 / 996** | 994 / 998 |
| Southern Ocean westerlies (July) | 2.3 m/s | **5.2** | 6.8 |
| Indian / Bay of Bengal monsoon (July, northward) | 3.2 / 3.2 m/s | 3.5 / 3.9 | 2.9 / 5.7 |
| Sea west of the UK / Norwegian Sea, January | 5 / −6 °C | 7 / −3 | 10.5 / 6.5 |
| Australia's seasonal swing | 6.7 °C | 8.8 | 16.3 |
| France: oceanic / Mediterranean | 42 / 51 % | **62 / 20 %** | 87 / 0 % |
| Islands' rain (Hawaii, Fiji, Caribbean) | ≈ ⅓ of real | ≈ ½ | — |
| Errors: land / sea temperature, pressure | 3.85 / 2.79 °C, 3.02 hPa | **3.75 / 2.64 °C, 2.89 hPa** | — |
| Köppen: major group; exact | 76.8 %; 50.6 % | **78.6 %**; 48.5 % | (V1 38 %) |

Every stage's own check passes (circulation, temperature, ocean); rain's is as before, with one more test-planet miss (a
supercontinent's equatorial coasts slightly drier as its monsoon reaches inland). No drift across terrain resolutions;
the same speed.

**Still not right.**
- **The US interior West** (the Great Basin and the Rockies, not California) is still too cool in summer and too wet:
  continental Dfb instead of steppe. Decision 7 would help its summers.
- **Heat lows sit too near the equator** in the southern summer, so northern Australia's and West Africa's monsoon
  winds stay weak.
- **Europe:** France is mostly oceanic now; Germany is still continental and the UK a mix, because the North Atlantic
  is still ≈ 3.5 °C too cold.
- **The Köppen score fell two points** — decision 7.

**Check in the lab.** New climate → Earth → Run. Pressure & wind → New in January and July, side by side with
Observed: the Southern Ocean's trough, the Siberian high, the oceanic highs. Köppen → New over France, Hawaii and Fiji.

## Phase 11b — calmer detail on simulated planets

**What I found.** On Evolution worlds the Köppen map had about twice Earth's speckle. The cause is the terrain, not the
texture: Evolution's terrain is three times bumpier from one cell to the next than Earth's, and each cell's climate
followed its own height, so neighbouring cells kept flipping between desert and steppe, or boreal and tundra.

**Built.** The climate now sees each cell's surroundings plus half of its own bumps. Mountain ranges and valleys still
show; single cells no longer flip on their own.

| | Speckles (cells unlike their neighbours) | Patches per 10,000 land cells |
|---|---|---|
| Evolution world, 160K: before → now | 27 → **20 %** | 1032 → **717** |
| Evolution world, 640K: before → now | 19 → **12 %** | 606 → **357** |
| Earth (real map: 12 %, 479) | 13 → 10 % | 491 → 393 |

Köppen on Earth 48.5 → 48.2 %; nothing else changed. For more or less of it: `terrainRelief` in `v2/js/climate/core.js`
(1 = every cell's own height, as before; 0.35 is calmer still).

## Phase 11c — windward rain grows with height

**What I found.** Mostly yes: a higher range wrung out more rain and cast a deeper shadow, and a high range behind a
low one still got its own rain. But the rain peaked on the steepest part of each slope, and every crest came out drier
than the flat plain in front of the range, while real windward slopes get wetter with height, up to near the crest.

**Built.** Air lifted from lower ground on its way now rains more the higher it has been lifted, using the same
upwind look as the rain shadow.

| 3 km ridge, annual rain | Plain upwind | Upper slope | Crest | Lee |
|---|---|---|---|---|
| Before | 450 | 572 | 224 | 42 |
| Now | 450 | **667** | **288** | 42 |

On Earth the windward sides are wetter (New Zealand's Southern Alps 1634 → 1901 mm/yr, real 3154; the Western Ghats
1767 → 1890, real 3282), and the mountain contrast is ×2.11 (was ×2.0; real ×3.4). Köppen 48.3 %. The Rockies barely
change. `node tuning/climate/diag-ridges.mjs --cells` shows the ridge tests.

## Phase 11d — warm and cold currents, relative to their latitude

**What I found.** Currents barely changed anything: the model's warm-current seas were no warmer than its cold-current
seas, and several had the wrong sign (the Gulf Stream and Kuroshio cold, the Canary and California currents warm). The
heat rule carried the model's own sea temperature, already evened out, so there was almost nothing to carry; and the
energy balance spread even that over thousands of km.

**Built — your "it's all relative".** Each patch of sea is traced back along its current (≈ 1500 km) to the latitudes
its water comes from, and keeps part of their temperature: currents flowing poleward are warm, those flowing toward the
equator cold, whatever their speed. Onshore winds carry that warmth or cold onto the coast. The rain follows: a warmer
sea evaporates more and its air rises and rains more; a colder sea's air is stable and dry, and the wind carries both
onshore.

| | Before | Now | Real |
|---|---|---|---|
| Warm-current seas minus cold-current seas | +0.1 °C | **+1.2 °C** | +2.8 °C |
| Their coasts | +1.0 °C | +1.2 °C | +1.8 °C |
| Their coasts' rain | ×1.28 | ×1.35 | ×1.80 |
| A test continent: sea off its west vs east coast at 30° | 20.5 vs 21.3 °C | **17.0 vs 23.0 °C** | (California 17, Georgia 24) |

Pressure and winds are unchanged or slightly better. Australia's rain moves toward real (337 → 439 mm, real 537).
Köppen 48.3 → 47.2 % — decision 8.

**Still not right.** The Gulf Stream's sea stays cold (the continent's winter air wins), and the coldest coasts (Peru,
Namibia, California) are cold mostly from upwelling, which I tried to strengthen here but it bent the trade winds and
broke South America's rain, so it stays as it was.

## Phase 11e — why generated worlds are too dry

**What I found.** Generated worlds are 34–40 % desert and steppe, against Earth's 30 %. Some of that is geography: they
have less cold northern land, which can never be arid. If each latitude were as dry as Earth's they would be 29–35 %. The
rest is in the subtropics (15–35°: about 85 % arid, Earth about 60–67 %) and just south of the equator. The mountain rules,
how unevenly rain falls, and rain recycled from wet ground are all fine.

**Cause 1 — my currents change (fixed).** Each sea's warmth or cold was balanced over the whole planet instead of per
latitude. A gyre's broad slow cold side covers more sea than its narrow warm current, so the subtropical seas ran about
1 °C cold and tropical land lost about 14 % of its rain to the sea, on Earth too. Now each latitude's sea is balanced on
its own. Tropical land south of the equator gets 10–17 % more rain; Earth's Köppen match is back to 48.3 % (was 47.2), the
sea temperature error falls, and the currents look the same (warm minus cold +1.2 °C).

**Cause 2 — weak summer monsoons (next).** In January, land at 10–20°S gets about half its real rain in the model; on
Earth the model's too-wet southern winters hide that, but the worlds' big continents have dry winters, so nothing hides
it. The model treats monsoon air as a shallow, dry heat low, and on a big continent the heat low sits to one side while
the rest of the continent breathes dry air from the interior.

## Phase 12 — continentality: air masses along the wind

**What I found.** Summers were about right; winters didn't follow the wind that brings them. Europe inland was far too
cold (Moscow's coldest month −16 °C, real −7), and east coasts too mild (north-east China −8, real −16; Japan 7, real 1).
The model spread heat alike in every direction, while a month's weather is really the air the wind brought.

**Built — air masses.** Each month, air moves with that month's wind and slowly takes on the temperature of the ground it
crosses: within a day over the sea; within half a day over sunlit land, where convection mixes it; and over about four
days over land in the winter half of the world, where it lies stable over cold ground. So Atlantic air keeps Europe mild
far inland, the continent's cold blows out over east coasts, a narrow sea on the way (the Sea of Japan) partly warms the
air again, islands and coasts the wind blows onto stay oceanic, and a calm interior keeps its own climate. Mountain
ranges block it, and air coming down from a plateau warms as it sinks. Most of your guide's zone rules follow from this
on their own, on any planet.

| Coldest month, °C | Before | Now | Real |
|---|---|---|---|
| Germany | −2.6 | −0.1 | 0.7 |
| Poland | −6.3 | −1.6 | −1.7 |
| Moscow | −16.1 | −7.7 | −7.3 |
| North-east China | −8.3 | −13.3 | −16.4 |
| South China | 11.3 | 9.2 | 9.8 |

The error in the yearly temperature range falls from 6.8 to 6.3 °C; Köppen 48.1 % (Europe 45.6 → 50.4 %); every other
check holds. On the generated worlds west coasts get milder and east coasts harsher.

**Still not right.** North America's winter wind over the Plains blows from the south-west in the model (really from the
north-west, bringing Arctic air), so Minnesota's winter is 8 °C too mild — a gap in the pressure pattern (mountains
bending the westerlies), not in continentality. Yakutsk's extreme cold (−37 °C) reaches only −27. Tropical interiors
are still a little too even through the year.

## Phase 13 — less dry worlds: land rain and monsoons

**What I found.** The model's summer monsoons are weak — on Earth, land at 10–20°S gets about half its real January
rain — and more generally too little of the ocean's water reaches land: the continents mostly rain their own
evaporation (83–88 % of their rain; really about 60 %). The model treated the monsoon's inflow as a shallow, dry heat low,
and it placed the southern summer rain belts too near the equator.

**Built — land convection.** Over sunlit ground, afternoon storms make land rain at a lower humidity than the sea does.
That is now in: full in the tropics and the summer, none under a winter sun, and it hardly touches deserts (their air is
too dry). Air crossing semi-arid land now rains there instead of carrying its water back out to sea.

| | Before | Now |
|---|---|---|
| Generated worlds, share desert and steppe | 34–42 % | 32–36 % |
| … what their latitudes alone would predict | 29–35 % | |
| Test supercontinent, share desert and steppe | 91 % | 86 % |
| Earth: share desert and steppe (real 31 %) | 32 % | 30 % |
| Köppen on Earth | 48.1 % | 47.0 % |

Decision 9 is the dial: stronger makes the worlds greener and costs Earth's hot deserts.

**Still not right.** Where the summer rain belts sit over land comes from the pressure pattern, and I could not move them
here without breaking other things: southern Africa's belt peaks at 7.5°S (really 12.5°S), India's July rains
fall mostly in the south. That, with North America's winter wind (Phase 12), points to the next big piece — the
pressure pattern over continents (mountains bending the westerlies, and where heat lows sit).
