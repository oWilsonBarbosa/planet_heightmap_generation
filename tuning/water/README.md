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
- `low flow` — the lowest month ÷ the mean, simulated ÷ measured
- `early` — how many months later the simulated year best matches the measured (the shift that correlates them best;
  positive: the simulated comes early): the mean over the gauges, and over the great basins, from 500,000 km²

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
```

## Results (2.56M regions, 130 gauges)

| | runoff within ×2 | year r | peak ±1 month | range | low flow | early (great basins) |
|---|---:|---:|---:|---:|---:|---:|
| observed climate, the Evolution's constants | 82 % (×0.92) | 0.82 | 76 % | ×0.64 | ×1.99 | |
| observed climate, dry basins don't even out the months; baseflow 0.7, 3 months | 82 % (×0.92) | 0.86 | 83 % | ×0.98 | ×0.85 | 0.41 (0.79) |
| observed climate, `WATER`: and the water's way down at 40 km a day | 82 % (×0.92) | 0.89 | 87 % | ×0.92 | ×0.89 | 0.13 (0.07) |
| simulated climate, the Evolution's constants | 52 % (×0.79) | 0.53 | 51 % | ×0.64 | ×1.84 | |
| simulated climate, dry basins, baseflow 0.7, 3 months | 52 % (×0.79) | 0.60 | 56 % | ×1.00 | ×0.75 | 0.18 (1.14) |
| simulated climate, `WATER` | 52 % (×0.79) | 0.66 | 61 % | ×0.93 | ×0.78 | −0.01 (0.36) |

The Evolution's constants even out the months more the finer the mesh (the range ×0.86 at 640K, ×0.64 at 2.56M): the
basins the rivers cut through, more of them at finer detail, pass on their water as lakes would. Without that the
rivers were too seasonal at any detail (the range ×1.24 at both, the low flow ×0.55 and ×0.51), hence more water
through the ground. Without the travel time, `--tune` ranks
0.7 × 2.5 months a little above `WATER`'s 0.7 × 3 with the observed climate (year score 0.208 against 0.189 at 2.56M,
0.245 against 0.178 at 640K) and below it with the simulated one (−0.312 against −0.243): 3 months keeps the dry
season's flow nearer the measured with either (×0.85 against ×0.66 observed, ×0.75 against ×0.56 simulated). With it,
at 640K, 0.6–0.8 × 2.5–3 months × 0–200 km a day score 0.15–0.27, 0.7 × 3 at 50 km a day fifth of the 30 (0.246).

Each month's water reaches a river point as late as its way down takes: the mean distance its water has come,
weighed by the runoff along the way, at `riverSpeedKmDay` (the Evolution's: none, every month's water at the mouth
within the month). `--tune --grid riverSpeedKmDay=0/25/40/50/70/100` with the observed climate at 2.56M: year score
0.189, 0.229, **0.262**, 0.258, 0.227, 0.235; the great basins early by 0.79, −0.43, 0.07, 0.29, 0.43, 0.43 months.
40 km a day is 0.46 m/s: one effective speed for every river, as simple global routing schemes have it — the water
runs faster in its channel, but floodplains and wetlands hold it back. The Amazon now peaks in April, the measured in
May–June (before: March–April); the model has no floodplains.

With the observed climate the rivers are right within ×2 for 84–90 % of the gauges in tropical, temperate and cold
climates, and 50 % in arid ones (dams, irrigation, losses). Most of what remains is the simulated climate's: how much
it rains, and when.

Files:

```
fetch-rivers.mjs    download Dai & Trenberth's coastal stations; data/stations.json
earth-rivers.mjs    the check, --list, --set, --tune
data/               the gauges (gitignored)
```
