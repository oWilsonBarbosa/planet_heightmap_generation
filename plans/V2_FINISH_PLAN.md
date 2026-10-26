# Evolution: finishing a moment — plan

The developer (2026-09-29): *"more 'finishing touches' on the planet. Once someone finds a good place, we can have a
relatively more expensive step that can diligently warp, add noise, and run more realistic erosion based on climate that
more accurately sculpts the final terrain. I'd love to incorporate real to the ocean rivers and erosion, adding in
glaciation/fjords/depressions from the last ice age, and sand/wind erosion."*

Decided with the developer (2026-09-29):
- **The whole planet**, with a choice of detail: the Evolution page's three (160K, 640K, 2.5M cells) **and one more,
  10M cells (~7.7 km)**, offered for finishing only.
- **Up to about a minute on a desktop**, with a progress bar (phones: a lighter version, and no 10M).
- **No water drawn** in rivers and lakes yet ("we WILL do rivers and lakes at some point, but not right now"): the land
  as the water shaped it.

This replaces step E of plans/V2_FULL_PLANET_PLAN.md (V1's erosion run as an experiment) and feeds step C (export): a
finished moment is what gets exported.

## What there is to build on

- **V2's carve** (`v2/js/terrain/carve.js`): analytical stream-power erosion, coarse to fine over meshes ×4 apart; every
  river reaches the sea (a priority flood breaches every pit); the history's own rivers followed (gorges); drowned
  valleys at mountainous coasts; submarine canyons. Rain is a latitude estimate (`rainAtLatitude`).
- **The new climate** (`v2/js/climate/`, run for the page in `evolution/climate-worker.js`): per terrain cell annual
  temperature and rain, Köppen; on a 1° grid the year / January / July temperature, rain, pressure and wind; currents,
  sea ice. ~1 s at 160K.
- **V1's finishing** (`js/terrain-post.js`): domain warp, detail noise, smoothing, a combined hydraulic (Braun–Willett) +
  thermal + glacial loop (the glaciation by latitude and height only; fjord carving), ridge sharpening, soil creep. Ideas
  and pieces to reuse, tuned for V1's meshes.
- **Measured for 10M cells** (Node, one thread, 20K plates, 1200 Myr): the mesh 14 s to build, 400 MB of arrays (2.4 GB
  peak with one frame's surface and carve); the surface 24 s, the carve 6.7 s. (2.5M: 2.5 s, 100 MB; 6.4 s; 2.6 s.)
  So at 10M the page and its terrain workers cannot each hold the mesh, as they do at 2.5M.

## How it works

- A **Finish** button beside Calculate Climate: finishes the moment shown at the detail chosen in its own drop-down
  (160K · 640K · 2.5M · 10M; phones up to 640K). It pauses, shows its stages as it goes, and can be cancelled.
- It runs in **its own worker**, which builds (and keeps) the mesh; the surface is synthesized by the terrain pool in
  **slices** (each worker gets only its cells' positions and sampling, never the whole 10M mesh); the carving and the
  finishing stages run in the finishing worker.
- The result comes back as an **equirectangular height raster** (e.g. 8192 × 4096, 16-bit: 67 MB), not as a mesh: the
  page paints and shades it for the globe and the map, and step C exports it. The page never holds the 10M mesh.
- Kept per moment while the history is open (as the climate is — the last four); a **Show Finished Moments** toggle
  compares it with the timeline's terrain; scrubbing away shows the live terrain again, and the finished moments are
  listed as links under the button.
- The climate it needs is calculated on the finish mesh itself (its costly part is on a fixed 1° grid; the per-cell part
  — lapse rate, orographic rain, Köppen — is linear, ~2 s at 10M). Smooth regional fields (an ice sheet's surface, its
  rebound, sand seas' surroundings, loess) are worked on a 0.25° lat-lon grid in km (finish-grid.js).
- Every rate in km, Myr, °C and mm (scale invariance): the same planet at every detail, more of it at the finer ones;
  the big rivers settled on the same coarse surface at every detail (`carveSettleCells`, already built).

## Phases (each checked in the browser before the next)

**F1 — the frame, and a first finish.** The button, the detail drop-down (10M included), the worker, slices, the raster,
Finished / Live, the cache. First contents: a diligent warp and detail noise (in the world's frame: a one-off moment), then
the carve run longer and with the **climate's rain** instead of the latitude estimate. *Done when*: a moment finishes at
each detail within the budget (10M ≤ ~1 min on the development desktop), memory stays within a tab's (measured), and
the finished terrain is the same planet as the live one, only sculpted.

**F2 — rivers, basins and hillslopes by climate.** Runoff = rain less evaporation (from temperature): wet regions drain
to the sea as now, but **dry basins stay closed** — salt flats, playas and inland basins, some below sea level (the Great
Basin, the Caspian, the Dead Sea) — instead of being breached; rivers **deposit** as well as cut: floodplains, alluvial
fans where they leave the mountains, deltas at their mouths. Hillslopes by climate: frost-shattered, talus-steep in cold
mountains; soil creep rounding the hills in wet lowlands; sharp and bare in deserts.

**F3 — the last ice age.** The moment's climate cooled by an **Ice age** amount (a setting: none · mild · Earth-like ·
strong; Earth's was ~5–6 °C globally, much more at high latitudes) with the sea ~120 m lower; **ice** where snow outlasts
summer — ice sheets on high-latitude continents, ice caps and valley glaciers on high mountains — its thickness and flow
from a simple ice-surface model. Where ice flowed fast it carved: **U-shaped valleys** along its paths, **cirques** at its
heads, **fjords** where it reached the sea (troughs cut below sea level, flooded when the sea came back), **scoured lake
districts** on shields, **moraines** and **outwash plains** at its farthest reach. Then the ice melts: the land it pressed
down is still sunk, rebounding (**Hudson Bay, the Baltic**). At 10M (~8 km) fjords and cirques show as landforms; at
2.5M as broad troughs.

**F4 — wind.** In hot deserts (Köppen BW), **sand seas**: low ground filled flat, with dune ridges across the
prevailing wind of the climate (their spacing the smallest the mesh can show — draa-scale, a texture more than
landforms); **deflation pans** in basin floors; **loess** mantling the land downwind of deserts and of the ice age's
outwash (softened, raised plains).

**F5 — finish.** Step C's export of a finished moment; phone limits measured on a real phone; README, tutorial, What's
New as CLAUDE.md asks.

## Status (2026-09-29)

**F1–F4 built** (developer: "just do 1-4, but for 3 just do earth like for now") — `v2/js/finish/`, the page's Finish
section (`evolution.html`, `evolution/finish-view.js`). F5 not started. Measured in headless Chrome on the development
desktop (20K plates, 300 Myr): 640K 8 s, 2.5M 15 s, 10M 53 s (13 s of it building the mesh, kept after); the whole
browser from ~2.4 GB to ~5.5 GB at the peak of a 10M finish (the finish worker ~3 GB), ~3.5 GB at 2.5M. In Node (20K,
1200 Myr, 10M): surface 8.4 s, climate 2.2 s, rivers 15 s, sediment 2.3 s, ice 2.5 s, wind 2.5 s; ~1 380 closed basins,
~1 300 deltas, ~30M km² of ice-age ice (5 sheets), ~7M km² of sand seas, ~18M km² of loess. Phones: 160K and 640K only
(640K in ~7 s on the desktop's CPU — to be measured on a phone).

What reads best: fjorded, island-strewn coasts where the ice reached the sea; troughs cut into glaciated uplands; flat
pan floors in dry basins. Weakest: sand seas — dunes only at 10M (30 km ridges, ~4 cells a wave), and the rivers' narrow
channels still show through them in places. The hover readout still describes the live terrain on a finished moment.
Not yet: the ice age's strength (Earth-like only, as asked), water drawn in rivers and lakes (later, by choice), export
(F5 / step C).

**Round 2 (developer: "rivers and cutting can be quite straight … only cutting in some places and not 'everywhere' (some
mountains look blurry and not cut in) … the poles have their weird carving way too deep and bad artifacts"; "even deserts
should get rivery erosion (even a little) cuz it gets some rain").** Diagnosed by switching stages off: the pole grooves
were the ice troughs — routed down the smooth dome of the ice-sheet surface, its flow lines straight and radial; the
isolated cutting is the carve's valley share (a cell drops by the share its valley takes, ∝ √drainage: trunk rivers cut
canyons, tributaries hardly mark the ground between); straight channels, routing over smooth slopes and the coarse
levels' straight valley segments; creep, loess and the warp were not the blur. Changed: the ice routed over the bed (its
valleys) plus 6 % of its thickness, cutting only near its margins (full within 40 km, none past 250 km — sliding outlet
glaciers, not the frozen interior), troughs 0.6 km at most (was 1.1); **dissection everywhere** after the carve — every
drainage line cut by up to 0.35 km × how steep the ground is × how many cells drain there (a ridge … a valley the mesh
shows), rivers still downhill; a fine routing relief (30 m, 60 km down to the mesh) so channels wander; the drainage
weighted 30 % by the rain itself (deserts' rivers cut a little); the carve 0.8 Myr (was 1.2). Timings unchanged
(10M ~52 s, 640K ~9 s on the page).

**Round 3 (developer: "places with a lot of water look unnaturally blurry").** Not the creep or the sediment (the same
with both off): the drainage weights were linear in the runoff, so the wettest regions carried ~10× the mean — their
valleys far wider and their land graded far flatter than the live terrain's. Now the weight is the square root of the
relative water, at most 2.5× the mean (deserts ~0.3× — their rivers cut a little more, as asked). The climate's rain is
also capped at 6000 mm for the finish: its grid has rare hotspots of 10 000–70 000 mm a year (~0.2 % of land; up to
6 400 mm in a month) — for the climate work to look at; the live Calculate Climate shows them too.

## Rivers and lakes on finished moments (R1–R2)

Decided with the developer (2026-09-30): drawn on **finished moments only** (not the live timeline, not V1 yet);
**cartographic** style — blue lines tapering with discharge, seasonal rivers and wadis fainter / dashed; lakes **fresh,
salt, and dry salt pans**, by water balance. (This revises step B's "rivers stay carved valleys only" for finished maps.)

**R1 — hydrology (finish-hydro.js), checked with maps and numbers.** On the finished surface:
- **Discharge in m³/s**: each cell's runoff (rain less evaporation — the Finish's Budyko runoff) summed down the network.
  A river is drawn by its discharge, not by cells: the same rivers at every detail.
- **Rivers lose water in dry country**: seepage and evaporation along the bed (∝ its width, ∝ √discharge, and the
  aridity) — big rivers from wet mountains cross deserts (the Nile), small ones die out in inland deltas (the Okavango).
- **Seasonality**: months the climate gives more rain than a share of the evaporation (or frozen), averaged over what
  feeds each river — perennial, seasonal, ephemeral (wadis).
- **Lakes by water balance**: every hollow of the finished surface (priority flood from the sea) is filled if its inflow
  outweighs evaporation from it at its rim — a fresh lake, spilling on into the river below; else it shrinks to the level
  where they balance — a salt lake (terminal); where next to nothing flows in, a dry salt pan. Formerly glaciated wet
  country makes its lake districts from the ice age's hollows. Tiny and very shallow hollows are passed through.
- No rivers drawn on ice caps (Köppen EF).
- Output with the finished picture: river polylines (points with discharge and seasonality) and a lake picture (none /
  fresh / salt / pan per pixel).

**R1 built (2026-09-30), awaiting the developer** — `v2/js/finish/finish-hydro.js`; the finish returns river polylines
and a lake picture (not drawn yet: R2). Test world (20K plates, 1200 Myr, 640K): runoff 300 mm/yr over the land (Earth
~270); 95 % of it reaches the sea, 2 % ends in closed basins, 1 % lost in dry beds; the biggest river ~125 000 m³/s; lakes
and pans ~4 % of the land (most of it the ice age's lake districts and proglacial lakes). Found on the way: ground below
sea level the ocean does not reach had no climate (NaN) — its lakes read as terminal (31 % of runoff "into closed
basins"): it now takes the grid's rain and temperature; and the finishing's own hollows (fans, loess, dissection) made
lake chains in wet lowlands (~10 % of land under water): a lake now needs an origin — the ice age's scour, or a hollow
≥ 100 m deep in the tectonic surface (rifts, forelands, closed basins) — the other hollows are filled (flat valley floors).
Memory (developer's report: "Array buffer allocation failed" in the carve): the finish now lets go of the warped positions
and the sampler after the surface, of the carve's inputs and caches after the carve (pool.forget, forgetMesh), and the
warped positions are Float32 — 10M peak in Node ~4.0 → ~3.0 GB; an out-of-memory finish lets its worker go and says to
try a coarser detail. 10M on the page: ~45–64 s.

**R2 — drawing.** Lakes painted into the finished texture (fresh blue, salt teal, pans off-white), rivers drawn on it as
smoothed, tapering, anti-aliased lines (globe and map); a Rivers & Lakes toggle, a density choice (few / normal / many:
discharge thresholds), the hover readout (a river's discharge and regime, a lake's kind); phones as desktop.

**R2 built (2026-09-30), awaiting the developer** — lakes painted into the finished picture (fresh in the palette's water
blue, salt teal, pans pale salt), rivers drawn on the texture as a flow map (developer, on a first draft of tapering
blue lines: "much thinner and closer to the flow mapmode from the lab"): hairlines 0.45–1 px, stronger with the log of
the discharge, seasonal fainter, dry-most-of-the-year dashed; River Density Few / Normal / Many = 150 / 40 / 8 m³/s;
Rivers & Lakes toggle; the readout names a river's discharge and regime and a lake's kind. Also after the developer's
"too many lakes … the finishing step erosion not cutting deep or far enough to break these basins up": an old basin that
overflows — or would, in a humid climate (rain over half its potential evaporation) — cuts a gorge through its rim
(up to 0.6 km, by its outflow: the carve cannot, a gorge being far narrower than a cell) and drains; only the ice age's own
hollows are exempt (too young); salt lakes and pans stay in dry basins. Test world at 2.5M: lakes and pans 4.8 → 2.0 %
of the land (ice-age lake districts 1.3, salt 0.6, pans 0.1), 97 % of runoff to the sea. Phones: the controls 44 px.
Fixed after the developer's "some rivers seem to end nowhere … in non-dry regions too": a lake basin's cells gave their
water straight to the lake's balance without flowing across it, so wherever the water covered less than the basin (a
lake shrunk to its balance, a basin breached and drained) its rivers stopped at the old full shoreline. The basin's dry
ground is now routed by a priority flood from its water (or from its outlet, drained) — rivers run down to the shore or
across to the gorge; and the page no longer bridges a gap where a river falls below the drawn threshold. Rivers of
≥ 40 m³/s ending on dry land (not the sea, a lake or a confluence), 640K: 7 of 17 864 reaches (at ice caps' edges).
Then (developer: "some of these rivers are enormous and end up in tiny lakes … most of these would break out to the
sea"): (1) a breached basin's water stood at the gorge's level in every pocket below it, cut off from the outlet — rivers
ran into a pocket and stopped, the outflow began elsewhere: a lake is now one body, connected to its outlet (or, closed,
grown from its deepest point, its surface as high as the water had to rise — before, a closed lake's level was taken over
the whole basin, pockets and all, and drawn as one pocket: a 5 700 m³/s river "ending" in 8 000 km²; now it feeds a
278 000 km² salt lake); (2) the ice age's own hollows breach too — half as deep, and only by big rivers (500–5000 m³/s):
big rivers break through, small ones keep their lake districts; (3) a lake is at least two cells (no one-cell blobs on
rivers). 640K: rivers ≥ 500 m³/s ending in a lake 106 → 31, nearly all big lakes that drain on (or great salt lakes).
2.5M: lakes and pans 1.2 % of the land (ice-age 0.4, salt 0.7, pans 0.1), 97 % of runoff to the sea.

**River regimes (2026-09-30), awaiting the developer** (developer: "id love to know which are permanent rivers and which
are fed from seasonal rains (to pick out nile flooding type rivers)"; a Colour by Regime toggle; snowmelt floods not told
apart — "just flood season"). Each river's twelve monthly flows: on the climate's grid, each month's water (rain, and
snow kept until it melts, `snowMeltMmPerC` per °C a month) less a share of its potential evaporation; a share of that
(`baseflowShare`, where it is humid) seeps into the ground and drains back slowly (a store with `baseflowMonths` = 2.5:
a dry season's flow dwindles month by month). Every cell's runoff shared out by its month's share, routed down the same
network four months at a time (memory at 10M); big lakes pass on the year's outflow shaped by their inflow's months,
evened out (`lakeRegulation`); the bed losses by each month's own dryness (the most in a dry season, none frozen), so a
low month's flow can vanish. Per river point: dry months (under 3 % of its mean); dry 7 months or more — dry most of the
year; 1–6 — seasonal; never — permanent, with a flood season if the peak month carries 2.5 × the mean (the Nile ~2.9, the
Ganges ~3.4, the Mekong ~2.5; not the Amazon ~1.4, the Mississippi, the Rhine); fed from afar where it is permanent in
dry country. Drawn: permanent solid, seasonal dashed, dry most of the year dotted; Colour by Regime — blue permanent,
violet flood season, cyan seasonal, brown dry most of the year, with a legend; the readout: "River · 852 m³/s ·
permanent · floods Jul–Aug · fed from far upstream". Test world, rivers ≥ 40 m³/s: 640K steady 53 %, flood 44 %, seasonal
2.7 % (7 % of those ≥ 8 m³/s), far-fed 4 %; 2.5M 56 / 41 / 2.9 % (scale-invariant); the water stage ~1.3 s at 2.5M. A
first cut with an even groundwater share and yearly bed losses left almost no river seasonal and a snowmelt river's
winter low (4 % of its mean) "seasonal".

**Later**: export with step C; perhaps a lighter version on the live timeline.

## A finished moment's own climate (2026-09-30, awaiting the developer)

Developer: "when we do the finishing … the climate we calculate for that is at whatever detail we use. Its important that
all the map modes use that (terrain and the climate modes)". Before, the climate tabs on a finished moment showed the live
terrain's climate (Calculate Climate, at Terrain Detail) and the finish's own climate — calculated anyway, for the rivers —
was thrown away. Now: the finish keeps the grid's climate from its climate stage and, at the end (stage "final climate",
0.1 s at 640K), finishes each cell again on the finished surface (`core.js cellClimate` — step 5 of the climate again,
the same code: with the same heights it returns exactly the climate's own cells), sunk basins the sea does not reach
counted as land. The picture stage samples it per pixel (at most 4096 px wide — the page's sharpest texture): Köppen,
°C × 100, mm a year; the worker hands it over with the grid's fields (`evolution/climate-fields.js`, shared with the
climate worker). On a finished moment every climate tab (Köppen, Temp, Rain, Wind, Currents — Year / January / July) is
drawn per pixel from it, shaded by the finished relief; the legend counts the classes on the picture by area; the readout
gives the finished climate; the "No climate" chip does not show. Show Finished Moments off: the live climate as before.
Test world, 640K: Köppen shares within ~1 point of the live climate's (valley floors warmer and drier, ridges colder); every
land pixel classified; on the page no errors.

## Open questions, for when they come up

- Should the finish also run on the history's timeline (every frame)? Not planned: it is the expensive, on-request step.

## Rivers carve to the sea (2026-09-30)

Developer: "a lot of the time large rivers are ending up in tiny lakes. Most of the time, unless the lakes are huge,
rivers should be carving to the sea (and even if the 'sea' is a small piece of ocean trapped it should probably carve into
the big ocean anyway if its small). Only the biggest and most isolated lakes should prevent rivers from making it to the
ocean. Importantly this shouldn't 'elevate' a ton of the land, it should just carve through mountains if needed."
Measured first (640K): of 49 rivers ≥ 200 m³/s ending in a lake, most were 2-cell fresh lakes on huge rivers (9 000 m³/s
through 1 600 km²). Now (`finish-hydro.js`, `cut`: a gorge down a cell's receivers, the ground only ever lowered):
- a lake is kept only if its water is big for its river — `lakeKeepKm2` 5 000 km² × √(inflow / 1000 m³/s), the ice age's
  lake districts half that; smaller, it is cut through to its floor and the river runs on (the size that counts is the
  water a partly cut basin keeps, not the basin);
- a closed basin keeps its river from the sea only if it is ≥ 20 000 km² with a rim ≥ 0.3 km (`closedKeepKm2`,
  `closedRimKm`); else, if its river could not fill it, it is drained (filled to the rim instead, it made lakes the size of
  plains);
- the finishing's own hollows are drained by a channel from their floor out through the rim, not filled (filling raised
  the land); cut once every hollow is found (cutting mid-search made the cut cells read as hollows: plains-sized lakes);
- below sea level a cut goes down only to open a small trapped sea into the ocean within `seaCutKm` (120 km) of dry land;
  further, the gorge stops at sea level (else a winding arm of the sea ran far inland); the sea is recomputed after.
640K: rivers ≥ 200 m³/s ending in a lake 49 → 19 (all ≤ 650 m³/s, lake districts); lakes 0.3 % of land; 98 % of the runoff
to the sea; 6 % of land cells cut, 45 m on average, at most 1.3 km. 2.5M alike (15; 0.5 %; at most 2.5 km).

Then (developer: "sometimes there is tiny bits of 'sea' surrounded by continent that are where rivers end. continental
crust below 0. That should NOT be a valid end it should go out to the real sea"): the sea's own flood (`oceanMask`) seeded
any ground deeper than 1 km — a pit on a continent became a little sea. It now starts only from deep water in bodies of
at least 250 000 km² (`seaSeedKm2`) and floods through all below sea level it reaches; a continent's pit is a basin below
sea level (the lake rules: drained through to the real sea unless huge and walled), and small trapped seas are no longer
opened into the ocean (`seaCutKm` 0). 640K: small enclosed seas 3 (29 500, 5 600, 2 400 km²; 15 river mouths) → 0;
2.5M: 0 — only the real oceans remain.

Then (developer: "it resulted in some of the small seas just being TOTALLY DRAINED and leaving huge holes in the ground. I
feel like id expect them to still be filled"): a drained basin below sea level was cut only down to sea level, its pit
left dry. Filling every such basin with water made "a lot of lakes … the rivers i liked so much before were ruined";
seas from 15 000 km² and trapped seas as lakes had rivers "all ending in small lakes now instead of going to the ocean".
So, simply (developer: "every river needs to end at ocean not lake"), `finish-hydro.js`:
- a lake stays only where its river fills it and it is big for its river (`lakeKeepKm2` × √(inflow / 1000 m³/s), the ice
  age's lake districts half that); it passes on all that flows in. Anything else — a big river's pond, a basin its river
  cannot fill — is cut through to its floor: no closed basins, no salt lakes or pans;
- no dry land below sea level: what a gorge leaves below sea level (it stops there) is filled in to sea level;
- the sea: only the real oceans (`oceanMask`: a body below sea level of at least 250 000 km² holding deep water).
160K: of rivers ≥ 20 m³/s, 3 126 end in the sea and 71 in a lake, 67 of them with the river leaving it (the other four
by the check's own reading: every lake passes its water on); no salt lakes, pans or dry land below sea level; 98.7 % of
the runoff to the sea (the rest lost along dry beds); gorges at most 1.7 km. 640K alike (233 of 237 through; 98.6 %).
