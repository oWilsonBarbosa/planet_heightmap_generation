# Evolution: a satellite view from the climate — plan

Developer (2026-09-30): "a more realistic and accurate satelite mode that takes climate, temperature, slope, height, and
rain all into account. (and terrain aware noise to make it more realistic). It should have distinct biomes but blend
smoothly still and look natural. And there should be a Jan and July version … rivers should make things greener, this
should only really be noticable in arid climates."

Today's "Satellite" is one of the terrain palettes: a colour by height only (green lowlands, brown heights, white peaks),
the same in the Sahara and the Amazon. The new view paints what the ground *is*: forest, grass, bare soil, sand, rock,
snow and ice — from the climate of each place, month by month — the way a cloud-free satellite mosaic (NASA's Blue Marble,
Sentinel-2 composites) shows Earth.

## The idea: the ground's cover, then its colour

Not a colour per Köppen class (hard edges, a map key, not a photograph) but continuous **cover fractions** worked out
from the climate, then mixed:

1. **What can grow** — per place, from its twelve months (the finish has them for every cell):
   - *wetness*: rain against potential evaporation (the same PET the rivers use) → how much is covered at all;
   - *warmth*: the growing season (months above ~5–10 °C) → forest, or tundra; the tree line on mountains;
   - *cold*: the coldest month → needle-leaved (boreal) or broad-leaved; evergreen or deciduous;
   - → **tree cover**, **grass/shrub cover**, **bare ground** (fractions adding to 1, with smooth S-curves, so a
     savanna is trees thinning into grass, not a line).
2. **What it looks like this month** (January / July):
   - *green or dormant*: grass and deciduous trees brown in a cold month, golden in a dry one (the monsoon's green wet
     season, the Mediterranean's gold summer, the steppe's short green spring), evergreen forest dark all year;
   - *snow*: a snowpack kept through the cold months (the degree-day melt the rivers already use) — white on open ground,
     only a grey dusting under boreal forest (trees hide snow, as from space); glaciers and ice caps white all year;
   - *the sea*: dark deep water, lighter shelves (turquoise in the tropics, grey-green in cold seas), sea ice in its
     winter month.
3. **The ground under it** — bare soil's colour by climate and rock: pale sand in the sand seas the wind stage already
   makes, buff loess, white salt pans, red-brown tropical soils, grey-brown tundra, dark basalt where the history laid
   down large igneous provinces, grey rock on steep slopes and above the tree line.
4. **Shading** — the finished relief's hillshade, as every other view.

Reference colours from real satellite mosaics (rainforest, boreal forest, savanna, steppe, sand and rock deserts, tundra,
ice), so each biome *reads* right at a glance, and blends between them because the fractions do.

## Terrain-aware detail (what makes it look like a photograph)

All sized in km, so it looks the same at every detail (CLAUDE.md scale invariance):
- **slope**: steep ground sheds soil — rock and scree show through, more so where it is dry or cold;
- **height**: the tree line and the snow line from the place's own temperature (mountains get their zones —
  forest, alpine meadow, rock, snow);
- **aspect**: in dry and cold country the slopes facing the pole stay greener and keep their snow longer;
- **valleys**: hollows and valley floors greener (water gathers), ridges drier;
- **noise**: patchiness at a few scales (km to tens of km) — vegetation in clumps, soils mottled — following the terrain
  (stretched along slopes, stronger on rough ground), never a uniform grain.

## Rivers green the dry land

From the finish's own rivers: a green ribbon along each river, wider for bigger ones (the Nile's valley and delta), fading
over a few km — weighted by how dry the place is, so it is plain in a desert or a steppe and invisible where everything is
green anyway. Deltas and floodplains (the sediment stage knows where rivers laid down silt) greener too; lake shores the
same.

## Where it runs

- **Finished moments**: everything above, per pixel of the finished picture (as the climate tabs now are). The finish
  works out the few slow things per cell (the cover fractions, January's and July's green and snow, the river ribbon) and
  hands them over with the climate picture (about 7 bytes a pixel: ~60 MB a finished moment on a desktop, ~15 MB on a
  phone); the page mixes the colours (well under a second; kept per season).
- **Live moments** (open question): with Calculate Climate done, a coarser version per terrain cell (no rivers).

A new **Satellite** tab beside Köppen … Currents, with the season switch (January / July). The height-only "Satellite"
palette is then confusing next to it (open question: rename it, e.g. "Blue Marble (by height)", or drop it).

## Phases (each checked in the browser before the next)

- **S1 — biomes and seasons.** Cover fractions, January / July (green, dormant, snow, sea ice, shelves), soil colours,
  hillshade; the tab, season switch, legend-free (a photograph), readout ("Boreal forest · snow" etc.), phones.
  *Check*: the planet's biomes read right at a glance; January and July differ the way Earth's do (northern snow and
  bare deciduous forest in January, the monsoon belt green in its wet season, Mediterranean gold in summer); no hard
  edges between biomes. **An Earth check**: the same colour model run on *observed* Earth climate (Beck et al. monthly
  temperature and rain, already in tuning/climate) beside NASA's Blue Marble for January and July — to judge the colours
  against the real planet, apart from any climate-model error.
- **S2 — terrain detail.** Slope, tree and snow lines, aspect, valley greening, the noise; sand seas, loess, pans, basalt.
  *Check*: mountains have zones and rock; deserts have sand seas and rocky plateaus; it looks the same at 640K and 10M.
- **S3 — rivers.** The green ribbons and deltas in dry country. *Check*: a Nile through a desert reads at a glance; humid
  rivers do not draw lines of green.
- **(S4 — live moments, if wanted.)**

## Decided (developer, 2026-09-30)

1. Finished moments only ("just with detail"); on the live timeline the tab is greyed, its chip offering to finish.
2. The old palette renamed "Blue Marble (by height)".
3. Year, January and July.

## S1 built (2026-09-30), awaiting the developer

`finish/finish-cover.js` (tunables `COVER` in finish-config.js): per cell, from its twelve months — handed over by the
climate's own per-cell step (`core.js cellClimate`'s `onCell`, no change to the climate) in the finish's "final climate"
stage — the cover and its colour for the year, January and July (sRGB, per cell; the picture stage blends them per pixel,
≤ 4096 px wide), its biome and snow for the readout. The page paints them shaded by the finished relief; the sea by depth
(Blue Marble's dark ocean, lighter shelves — the shallowest no brighter than a broad shelf, or every narrow finished coast
got a cyan outline — turquoise warm shallows), sea ice in its season (its 1° edge sharpened), lakes (frozen in a cold
month), salt pans white; no river lines (from space rivers are ground — S3). Readout: "Ground: Boreal forest · under
snow". Phones: the layer dropdown.

**The Earth check** (scratchpad earth-cover.mjs / earth-fit.py / earth-compare.py): the cover model on Beck et al.'s
observed monthly temperature and rain at 1° beside NASA's Blue Marble Next Generation (January, July 2004). The colour is
linear in the reference colours, so they were fitted by least squares (pulled toward hand-picked priors; July only, as
January's snow confounds the forests), then the snow tuned on January: a canopy hides 30 % of the snow (the snowy taiga
is grey-white from space), needle-shedding larch in very cold winters, a dry winter's thin snowpack lost to the air
(less the colder), ice caps where the warmest month freezes. Mean difference per channel over interior land, by Köppen
class: July 7 → 6, January 16 → 10 (of 255). The model's first cut needed ≥ 5 growing months for forest — the boreal
forest came out half grass.

Cost: 0.7 µs a cell (a threshold table for sRGB instead of powers halved it, same colours); the final climate stage
0.6 s at 640K, 1.9 s at 2.5M (the cell's months and the classification included). Memory: 9 + 1 bytes a pixel of the
climate picture (~84 MB at 4096 × 2048).

Not yet (S2): deserts all one beige (no sand seas, red shields, dark basalt, rock); no slope, aspect or noise.

**Greener, toward each climate's own colour (2026-09-30)** (developer: "everything looks a bit too dry/not green. I
think it might need to bias a bit more towards the 'average color for a given season' for a climate. That should blend
closer to what we have here as detail"). Measured first: per Köppen class the finished planet was lighter and more tan
than Earth's (Cfb in summer (78, 80, 45) against Blue Marble's (53, 58, 28)) — light olive-tan reads dry. Now:
- each climate's colour per season — `CLIMATE_RGB`: Blue Marble's mean per Köppen class over Earth's land, for the local
  winter, the local summer and the year (all twelve months of Blue Marble NG 2004) — made livelier (`livelier`: greens
  turned halfway toward pure green, saturation × 1.4, brightness × 1.3; golds, browns, greys and snow untouched — Blue
  Marble's real greens are a dark khaki; V1's satellite greens are the look);
- each class's mean colour on the planet moved 70 % of the way there (`biasTowardClimate`): a ratio per class, season and
  channel applied to every cell of the class (an offset drove the dark forests to black: a climate's offset is set by its
  bright grass and soil), the ratios blurred over 100 km on a 0.5° grid so climates hand over without outlines; the
  cover's own detail within a climate stays. (A first try blurred each cell's difference over 120 km: snowy mountains'
  corrections greyed the lowlands around them.)
- the vegetation responds to less water (vegetation 0.02–0.28 of potential evaporation, was 0.03–0.4; trees 0.3–0.85;
  a month's grass green 0.18–0.6) — closer to Blue Marble on Earth too: July 6.3 → 4.2, January 10.2 → 9.2 per channel.
January shows it most (winter-wet coasts and savannas green where they were tan). Deserts stay deserts: the test worlds are
~46 % arid by Köppen (the climate's known dryness). Cost unchanged: the final climate stage 1.9 s at 2.5M.

**Fluid, not banded (2026-09-30)** (developer: "both better and worse. Its surfacing a lot of bands … maybe it should be
a bit more fluid … noise or warping of the edges … OR relying more on the real color … when transitioning between
climate zones, but relying more on the base color … the further from another climate we are"; and "a little noise and
warping and smoothing on things like precipitation so its a bit less splotchy (to an extent)"):
- the pull toward a climate's colour now grows with the depth inside it — none at its edge with another, all 450 km in
  (`climateDepthKm`; the distance by a chamfer on a 0.5° grid of each grid cell's main class, the sea passed over) — so
  the cover's own colours, which change smoothly, carry every transition; the depth roughened by noise (±180 km) and the
  corrections warped (up to ~150 km), at a 700 km size, so the transitions meander;
- the rain the cover reads (only the cover's — the climate tabs keep the climate's own) moved halfway (in logs) to its
  surroundings', blurred over 80 km, warped by up to ~110 km and roughened × e^{±0.2} at 250 km (`coverRain*`): the green
  and the bare follow the regional climate instead of each cell's wobble around a threshold.
The final climate stage 2.2 s at 2.5M.

**Variety (2026-09-30)** (developer: "now things are too 'one color' … add noise to shift naturally between a couple
colors for each climate and between climates"): each kind of ground is tinted by noise between a few natural colours
(`placeVariety`, `COVER.vary*`; linear-light multipliers on its reference colours, so the same tint suits any climate's
base and the variety flows across climates): bare ground red (iron-rich) or pale (sand, limestone) by province, dark
(basalt, varnish) or grey (gravel, granite) by patch; grass lusher or olive, khaki where the ground runs red; trees deeper
or olive, needle-leaved bluer in the dark patches. The noise is domain-warped (streaks and wandering shapes, like geology —
a first cut, thresholded and unwarped at 400/130 km, gave the deserts leopard spots), provinces ~900 km in two octaves,
patches ~260 km, vegetation ~400 km; plus a fine ±3.5 % brightness mottling per pixel at ~50 km. Its own noise streams.
Cost ~0.7 s at 2.5M (the tints' logs precomputed: one exponential a channel); the final climate stage 2.9 s at 2.5M.
Also from the developer's out-of-memory report ("a tab used for a while"): finished moments are now kept within a memory
budget (640 MB desktop, 160 MB phones) instead of four at any size, the finishing worker keeps one mesh at a time, and an
out-of-memory finish lets the older moments and the old worker go and tries once more.

## S2 built (2026-09-30), awaiting the developer

The variety first toned down (developer: "way too much, tone it down a lot but still keep it": full tint at 4.5 standard
deviations, was 1.5; mottling ±2 %). Then the terrain ("move on to using the terrain/mountains"):
- **Tree and snow lines by full height** (`fullLapse`): the climate takes only half a place's height above its surroundings
  (`CORE_DEFAULTS.terrainRelief`, so Köppen is not speckled); the cover's twelve months are lowered by the other half
  (γ × (1 − 0.5) × (height − the 1° grid's mean land height)) — mountains get their zones: forest, alpine, rock, snow.
- **Rock and scree** where the ground is rugged — the height's spread within 25 km (0.15–0.55 km; a pixel's slope is too
  broad to find steep ground: the land's 99th percentile is ~60 m/km at 640K) or, where the detail shows cliffs, steep
  (60–200 m/km) — most where dry or cold (30 % in a warm, humid place: forest holds steep slopes), 60 % of it in a snowy
  month (cliffs); warm brown or cold grey rock.
- **Dry country's slopes and valleys**: the slopes facing the pole greener, facing the equator barer; valleys greener,
  ridges barer — by the place's dryness.
- **The ground's own rock**: the bare ground tinted toward the wind stage's sand seas (pale sand), its loess (buff) and the
  flood basalt where it still caps the ground after the carving (dark trap rock).
- **Flow texture** (developer: "a light earthy/natural texture layed over the whole planet scaled by the FLOW of each
  area … to add additional texture and help blend between areas"; "not … the accumulation of water but … the areas that
  if there was water it would flow through"): the area each place drains (km², from the hydrology's routing, whatever the
  rain) — an earthy darker tint, grained by noise at 12 km, laid over everything at up to 60 % by the log of that area
  (400 → 40 000 km²), half as strong on snow: every valley network shows as faint dendritic veins.
All per land pixel of the climate picture in the worker's picture stage (`terrainLook`), from the finished heights; the
first version took 3.6 s at 2.5M — one box pass for the surroundings' mean and spread, the tints once a pixel: the picture
stage 3.1 s, the finish 17 s at 2.5M (was ~16).

**Mountains you can see (2026-09-30)** (developer: "crank up the noise to be like 75% towards what we had before, and
make the flow color a bit warmer. The mountains themselves need to be more prominent and evocative … adding this mountain
texture on higher slope areas … blending that addition with the climate … it is NOT immediately clear where the big
mountains are"; and: "the goal isnt perfect satelite imagery, but more artistic and evocative that describes the climate
and terrain at a glance. And also just looks good"):
- the variety at 75 % of the first strength (`varyStrength` 1.8; mottling ±3.1 %); the flow tint warmer;
- a mountain texture: where the ground is rugged (height spread 0.08–0.35 km within 25 km) or high (1.2–3.5 km), a
  crumpled ridged micro-relief (up to 0.35 km, 60 km and its octaves down to two pixels) lit as the page lights the
  relief, its crests barer (more rock) — multiplying the climate's own colours: dark creased forest, rock, snow with grey
  creases;
- more rock on rugged ground (from 0.1 km of spread, up to 85 %, 40 % of it even where warm and humid);
- the Satellite view's relief shading deeper than the other layers' (0.28–1.08 of the light, its exaggeration × 1.6).

Then (developer: "the hillshading is too strong. I also think maybe a darker or browner color for the mountains could
help? maybe varied by age or height?"): the Satellite view's shading halfway back (0.37–1.05 of the light, exaggeration
× 1.25; the mountain texture's own light × 14, within 0.55–1.35); and a mountain tone — a dark warm brown over
mountainous ground, all of it on young ranges (the belt's activity the carving uses, `carveIn.hold`: 1 while the history
still raises it), 35 % on old worn ones (soil and forest cover them; real old ranges are subdued), more the higher, a third
under snow (`mtnTone*`).

## S3 built (2026-09-30), awaiting the developer — and polar ice

**Rivers green the dry land.** Each river carrying 15 m³/s or more is drawn into the climate picture as a soft glow
(`riparian`): Chaikin-smoothed, a bell profile (all at the middle, none 3.5 half-widths out), at least 14 km wide, 16 km ×
√(q / 1000 m³/s), up to 2.5× wider on low ground (floodplains, deltas); a copy displaced by meander noise (~7 km, 45 km
waves) blended with the original course; its opacity a third for a small river to all for a great one, grained, by the
place's dryness (invisible where all is green), none under snow; lakes get a fringe (oases). Its colour is the climate's
own, well watered — the place's cover again with its rain raised to 0.55 of its potential evaporation (its season, its
warmth, its variety: an oasis's palms, a cold steppe's willows, dormant in a cold month), laid over the flow texture and
under the mountains' texture (developer: "mountain texture should probably layer on top of rivers"). Before: a fixed green
("the neon green is awful. It should be more an intensification of the natural hues of green of the climate"), thin lines
("blend more, stronger in the middle and fade out … a bit of a warp"); the flow texture darkened the green into brown
threads until the riverside was laid over it. Ribbons only where it is dry enough to show (the picture stage 6.5 → 4.9 s
at 2.5M with them; 5.6 s after the wider glow).

**Polar ice** (developer: "the poles, especially when there is land, is frequently not icey, which feels super wrong";
"if the poles are actually that hot that is a bug"). The test world's southern polar land: snowy ~59 % of the year,
warmest month ~+6 °C at 70–90°S, +9.6 °C at 60–70°S — the climate's ice-sheet feedback (`temperature.js`: snow surviving
≥ 70 % of the year raises the albedo to 0.6 and the lapse rate) starts only above that, and ~⅓ of the polar land sits just
under it: the climate settles on the bare branch (an ice-free polar continent — summers like Svalbard's, not a bug in the
arithmetic, but bistable: a real one would glaciate). The satellite view now grows ice sheets where the summer is cool
(warmest month 7 → 3 °C, those up to 5 °C warmer toward the pole from 60 → 80°) and enough snow falls (60 → 200 mm a year)
— by the summer, not the year's mean (by the mean, Siberia's and Canada's forests froze over: Earth check July 6 → 16;
now 4.7). Polar land 70–80°S: satellite ice 9 → 57 %. The climate itself unchanged (pending the developer: starting its
ice-sheet iteration from ice on cold land would let bistable polar land settle glaciated, as Earth's did).

**Then** — the climate's ice sheets fixed (developer: "yes fix the climate ice sheet init"; plans/CLIMATE_REBUILD_PLAN.md
in the climate-rebuild worktree): a fresh start with ice on land the first guess makes colder than −30 °C; an ice sheet
white all year; its surface ≥ 1.5 km (a dome); a sheet kept while snowy ≥ ~0.8 of the year. Earth Köppen 47.0 → 48.1 %
(ice-cap recall 77 → 99 %) but Australia −6, continents-equal 46.6 → 45.0: a retune pending (developer: "keep everything
… pivot back … before retuning"). The test world's 70–90°S land: ice sheets, warmest month −1 to −6 °C (was +5.5).
And (developer: "rivers need to be less noisy and the thickest rivers need to be way thinner on the satelite map"): the
riverside glow 8–12 km wide (was up to 30, × 3.5 on low ground), ×1.5 at most on floodplains, its grain ± 6 %, its
meander 3.5 km.
