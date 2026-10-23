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

The **year's score** — per gauge `r − |ln range| − ½ |ln low flow|`, the median over the gauges — ranks `--tune`.
The rivers' year (`baseflowShare`, `baseflowMonths`, `monthEvapShare`, `snowMeltMmPerC`, `lakeRegulation…`) does not
change the year's flows.

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

| | runoff within ×2 | year r | peak ±1 month | range | low flow |
|---|---:|---:|---:|---:|---:|
| observed climate, the Evolution's constants | 82 % (×0.92) | 0.82 | 78 % | ×0.74 | ×1.55 |
| observed climate, `WATER` (dry basins don't even out the months; baseflow 0.7, 3 months) | 82 % (×0.92) | 0.86 | 84 % | ×0.98 | ×0.85 |
| simulated climate, the Evolution's constants | 52 % (×0.79) | 0.53 | 52 % | ×0.69 | ×1.51 |
| simulated climate, `WATER` | 52 % (×0.79) | 0.60 | 57 % | ×0.98 | ×0.75 |

With the observed climate the rivers are right within ×2 for 84–90 % of the gauges in tropical, temperate and cold
climates, and 50 % in arid ones (dams, irrigation, losses). Most of what remains is the simulated climate's: how much
it rains, and when. The model has no travel time down a river and no floodplains: the Amazon peaks in March–April, the
measured in May–June.

Files:

```
fetch-rivers.mjs    download Dai & Trenberth's coastal stations; data/stations.json
earth-rivers.mjs    the check, --list, --set, --tune
data/               the gauges (gitignored)
```
