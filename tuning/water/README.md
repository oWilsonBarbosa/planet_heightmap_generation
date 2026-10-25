# Rivers Check

Scores the rivers that Generate and Import make (`js/water-new.js`, the Evolution's hydrology on a V1 planet) against
**measured river flows on real Earth**, the way `tuning/climate/` scores the climate against observations.

`earth-rivers.mjs` imports `assets/earth.png` as the Import page imports it (`tuning/climate/lib/earth-mesh.mjs`) and
runs its rivers twice: with the climate simulated as Import runs it, and with the observed climate (Beck et al. 2023,
1991–2020, 1°) given to the same rivers — so the rivers' own error shows apart from the climate's. It then places each
of Dai & Trenberth's gauges (the station nearest the mouth of each of the world's 925 largest rivers, monthly flows
1900–2018; NCAR GDEX d551000, CC BY 4.0) that drains at least 25,000 km² on the simulated network: at the dry-land
region within 100 km whose drainage area is nearest its own, kept if within ×1.5. The coarse Earth map (20 km pixels,
8 bits) sends some great basins elsewhere — the Congo, the Mississippi, the Orinoco, the Ob — so ~130 gauges are scored.

## Scores

By the climate zone at the gauge (Beck's Köppen group A–E):

- `runoff` — the year's flow ÷ the drainage area, simulated ÷ measured: median, share within ×2, rms factor
- `year r` — correlation of the twelve monthly mean flows with the measured
- `peak ±1 month` — share of gauges whose highest month is within one month of the measured
- `range` — the coefficient of variation of the twelve months, simulated ÷ measured (1 = as seasonal as measured)
- `peak` — the highest month ÷ the mean, simulated ÷ measured
- `low flow` — the lowest month ÷ the mean, simulated ÷ measured
- `flood season` — the share of gauges whose highest month carries 2.5 × the mean or more (`floodRatio`: the regime
  the Evolution colours violet, `regime` 1 in an export), simulated and measured
- `early` — how many months later the simulated year best matches the measured (the shift that correlates them best;
  positive: the simulated comes early): the mean over the gauges, and over the great basins, from 500,000 km²

And the **closed basins**: the share of the land (without Antarctica) whose water ends in a lake with no outflow — Earth's
≈ 18–20 % (Wang et al. 2018) — and which of fifteen of Earth's closed basins close (`CLOSED` in `earth-rivers.mjs`).

The **year's score** — per gauge `r − |ln range| − ½ |ln low flow|`, the median over the gauges — ranks `--tune`.
The rivers' year (`baseflowShare`, `baseflowMonths`, `monthEvapShare`, `snowMeltMmPerC`, `lakeRegulation…`,
`riverSpeedKmDay`) does not change the year's flows.

## Usage

```bash
npm install --no-save netcdfjs pngjs delaunator         # dev-only, never the app
node tuning/water/fetch-rivers.mjs                       # the gauges → tuning/water/data/ (gitignored)
node tuning/climate/fetch-references.mjs && node tuning/climate/regrid-references.mjs   # the observed climate

node tuning/water/earth-rivers.mjs                       # both climates, at 640K regions (~20 s)
node tuning/water/earth-rivers.mjs --n 2560000 --list    # at 2.56M (~1 min), every gauge with its twelve months
node tuning/water/earth-rivers.mjs --set baseflowShare=0.6,baseflowMonths=2.5    # other constants (WATER keys)
node tuning/water/earth-rivers.mjs --tune [--grid baseflowShare=0.5/0.7,baseflowMonths=2/3]   # search, observed climate
node tuning/water/earth-rivers.mjs --tune --climate sim --grid baseflowShare=0.6/0.7          # search, simulated climate
```

## Results (2.56M regions, 130 gauges)

| | runoff within ×2 | year r | peak ±1 month | range | low flow | early (great basins) |
|---|---:|---:|---:|---:|---:|---:|
| observed climate, the Evolution's constants | 82 % (×0.92) | 0.82 | 76 % | ×0.64 | ×1.99 | |
| observed climate, dry basins don't even out the months; baseflow 0.7, 3 months | 82 % (×0.92) | 0.86 | 83 % | ×0.98 | ×0.85 | 0.41 (0.79) |
| observed climate, `WATER`: and the water's way down at 40 km a day | 82 % (×0.92) | 0.89 | 87 % | ×0.92 | ×0.89 | 0.13 (0.07) |
| simulated climate, the Evolution's constants | 52 % (×0.79) | 0.53 | 51 % | ×0.64 | ×1.84 | |
| simulated climate, dry basins, baseflow 0.7, 3 months | 52 % (×0.79) | 0.60 | 56 % | ×1.00 | ×0.75 | 0.18 (1.14) |
| simulated climate, `WATER` before closed basins | 52 % (×0.77) | 0.66 | 60 % | ×0.94 | ×0.78 | 0.01 (0.36) |
| observed climate, `WATER`: inland seas of any size | 82 % (×0.92) | 0.89 | 87 % | ×0.91 | ×0.90 | 0.13 (0.07) |
| observed climate, `WATER`: closed basins (122 gauges) | 84 % (×0.91) | 0.90 | 88 % | ×0.94 | ×0.88 | 0.07 (0.00) |
| simulated climate, `WATER`: closed basins (126 gauges) | 53 % (×0.79) | 0.68 | 61 % | ×0.94 | ×0.75 | −0.02 (0.38) |

The simulated rows from "`WATER` before closed basins" on are with the simulated climate as it is now, the snowmelt on
frozen ground mostly running off (`RAIN_MELT_SOAK`, `v2/js/climate/config.js`); those above it with the climate before,
with which `WATER` scored 52 % (×0.79), 0.66, 61 %, ×0.93, ×0.78 and −0.01 (0.36). The observed climate's rows do not
depend on it.

**Closed basins** (`closedBasins`, `closedBasinPluvial` in `v2/js/finish/finish-config.js`): a basin on land its rivers
cannot fill — not even with twice what they bring, as in the ice ages' wetter times — is where they end, a salt lake at
its balance or a salt pan; the Evolution's rule cuts every basin through to the sea. With them 18.8 % of the land drains
to closed basins with the observed climate (19.5 % simulated; 17.5 % at 640K), and Earth's own close: the Tarim's,
Balkhash's, Lake Eyre's (a pan, as it is in most years), the Great Basin's, the Great Salt Lake's, Sistan's, the Dead
Sea's, Urmia's; the Altiplano's, Lake Chad's, the Okavango's, Turkana's and Issyk-Kul's do not (the Caspian and the Aral
are sea on the map). Without them 2.9 % did (2.3 % simulated), to seas the coarse map encloses (the Persian Gulf, the
head of the Gulf of California), and none of Earth's own closed; before inland seas of any size (`seaRemnantAnySize`),
12.1 %, most of it the Ob's and the Paraná's, ending in an estuary of one region. `closedBasinPluvial` 1 closes 23.9 %
of the land, 3 17.6 %, 5 15.9 %. With 2 the year's score is unchanged with the observed climate (0.252) and better with
the simulated one (−0.231 → −0.179; both before closed basins with inland seas of any size). The gauges lost with the
observed climate (130 → 122) are of rivers that end, on the coarse map, in a dry basin upstream: Western Australia's
(the Avon, the Gascoyne, the Murchison, the de Grey, the Ashburton's flow) — their headwaters really are chains of salt
lakes that seldom flow — and the Indus, the Juba, the Colorado of Argentina, the Burdekin, the Itapicuru and the Tapi,
whose courses cross basins the map's 20 km pixels close (a gorge narrower than a region, a terrace of its 8-bit steps).

The Evolution's constants before it took up `WATER`'s year (2026-10-25; `v2/js/finish/finish-config.js`) evened out
the months more the finer the mesh (the range ×0.86 at 640K, ×0.64 at 2.56M): the basins the rivers cut through, more
of them at finer detail, passed on their water as lakes would. Without that the rivers were too seasonal at any detail
(the range ×1.24 at both, the low flow ×0.55 and ×0.51), hence more water through the ground. Without the travel time,
`--tune` ranks
0.7 × 2.5 months a little above `WATER`'s 0.7 × 3 with the observed climate (year score 0.208 against 0.189 at 2.56M,
0.245 against 0.178 at 640K) and below it with the simulated one (−0.312 against −0.243): 3 months keeps the dry
season's flow nearer the measured with either (×0.85 against ×0.66 observed, ×0.75 against ×0.56 simulated). With it,
at 640K, 0.6–0.8 × 2.5–3 months × 0–200 km a day score 0.15–0.27, 0.7 × 3 at 50 km a day fifth of the 30 (0.246).

Each month's water reaches a river point as late as its way down takes, spread over the months as its water comes
from near and far: the distances its water has come, weighed by the runoff along the way, at `riverSpeedKmDay` (the
Evolution's: none, every month's water at the mouth within the month) — their mean and spread as a Nash cascade's
travel times (a gamma distribution of the same mean and variance; the classic unit hydrograph). `--tune --grid
riverSpeedKmDay=0/25/30/40/50/60/80` with the observed climate at 2.56M: year score 0.189, 0.249, 0.242, **0.262**,
0.258, 0.242, 0.231; the great basins early by 0.79, −0.43, −0.07, 0.07, 0.29, 0.43, 0.43 months. 40 km a day is
0.46 m/s: one effective speed for every river, as simple global routing schemes have it — the water runs faster in
its channel, but floodplains and wetlands hold it back. The Amazon now peaks in April–May, the measured in May–June
(before: March–April); the model has no floodplains. The spread changes little here (the Mackenzie's year: r 0.97 →
0.99 against a shift alone); it matters for basins larger than Earth's, whose water comes from thousands of km apart.

**Flood seasons.** As many gauges have one as measured (36 % against 39 % with the observed climate, 34 % against 38 %
with the simulated, at 2.56M), but in the wrong climates: too few in cold ones (zone D, 41 gauges: 24 % and 22 % against
51 %; the peak ×0.87 and ×0.81), too many in temperate (C: 29 % and 42 % against 14 % and 8 %) and dry ones (B: 56 %
and 50 % against 33 % and 20 %). The spring flood of rivers on frozen ground comes in its month — with the observed
climate (within one month at 98 % of the cold gauges) — but too flat. Tried, ranked by the year's score at 2.56M:
- **less water through the ground**: `baseflowShare` 0.65 brings the cold floods to 32 % and scores 0.259 against 0.252
  with the observed climate, but −0.212 against −0.179 with the simulated (27 %); 0.6: 59 % and 0.249 observed, 39 %
  and −0.263 simulated;
- **snowmelt seeping in less than rain**, the ground still frozen beneath (the climate's `RAIN_MELT_SOAK`; tried as a
  share of what rain seeps in): 0.85 brings them to 49 % and scores 0.270 with the observed climate, but with the
  simulated only to 24 %, at −0.214 — its snow melts early (the cold floods within a month of the measured at 80 %,
  68 % with the sharper flood), and a sharper flood in the wrong month scores lower; 0.7: 76 % and 0.223 observed,
  49 % and −0.229 simulated;
- **a faster or slower melt** (`snowMeltMmPerC` 60–400, at 640K): 11–14 % observed, 22–27 % simulated.

`WATER` stays as it was: for a planet's cold rivers, which run on the simulated climate, the place to start is that
climate's spring. With the observed climate, snowmelt seeping in at 0.85 of rain's sets their floods right.

With the observed climate the rivers are right within ×2 for 84–90 % of the gauges in tropical, temperate and cold
climates, and 50 % in arid ones (dams, irrigation, losses). Most of what remains is the simulated climate's: how much
it rains, and when.

Files:

```
fetch-rivers.mjs    download Dai & Trenberth's coastal stations; data/stations.json
earth-rivers.mjs    the check, --list, --set, --tune
data/               the gauges (gitignored)
```
