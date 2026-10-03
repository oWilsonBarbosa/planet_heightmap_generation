# Climate Tuning Suite

Automated tuning of the climate simulation parameters against **real Earth**.

The suite runs the app's heightmap-import pipeline on `assets/earth.png` directly
in Node (no browser), simulates climate (wind → ocean currents → precipitation →
temperature → Köppen), and scores the resulting Köppen map against the observed
Köppen-Geiger classification (Kottek et al. 2006, 0.5°, observed 1976–2000).
An optimizer then tweaks the parameters in `js/climate-config.js` to maximize
the match.

## Scoring

Only cells where **both** the simulated mesh says land **and** the ground-truth
grid has a climate class are scored — coastline/land-mask disagreements are
excluded (and reported separately as `landAgreement`).

- `exactAcc` — fraction of scored cells with the exact Köppen class (30 types)
- `majorAcc` — match on major group only (A/B/C/D/E)
- `macroF1` — unweighted mean F1 across classes present in the truth, so rare
  but important classes (Mediterranean Csa/Csb, monsoon Cwa/Dwa…) aren't drowned
  out by large deserts and subarctic zones
- **objective** — what the optimizer maximizes (weights in `lib/score.mjs`):
  0.60 · graded accuracy (per-cell climatic similarity: a rainforest scored as desert counts ~0,
  a neighbouring class ~0.8) + 0.12 · macroF1 + 0.15 · group balance (1 − ½·Σ|sim − truth| over the
  A/B/C/D/E area shares) + 0.13 · F1 on the Mediterranean and monsoon subtypes

Ground-truth codes are mapped onto the app's class set (`As` → `Aw`, the standard
merge). Ground truth lives in `data/ascii/Koeppen-Geiger-ASCII.txt`.

## Usage

```bash
# Baseline score of current defaults (+ PNG comparison maps)
node tuning/climate/evaluate.mjs --maps

# Optimize the ~35 high-impact parameters (150 evaluations)
node tuning/climate/optimize.mjs

# Longer run over all ~80 parameters
node tuning/climate/optimize.mjs --iters 500 --subset all --label big-run

# Validate the winner at higher resolution before trusting it
node tuning/climate/evaluate.mjs --params tuning/results/climate/<label>-best.json --n 160000 --maps

# Write the tuned values into js/climate-config.js (then review the diff!)
node tuning/climate/apply-params.mjs tuning/results/climate/<label>-best.json
```

Default mesh resolution is `--n 40000` (fast, ~seconds per evaluation). Temperature carries
across mesh sizes; precipitation does not quite (see *Reference scores*). So validate at ≥160K,
where the defaults were tuned, and again at 640K before applying.

## Reference scores

Köppen objective against the Kottek file (seed 1234, `evaluate.mjs --n N`). A good copy of the
ground truth reproduces the last row on the current code.

| mesh cells | 40K | 160K | 640K | 2.56M |
|---|---:|---:|---:|---:|
| before the gyre and cold-rain changes (cc2662b) | 0.6778 | 0.6683 | 0.6578 | 0.6526 |
| + ocean-gyre fix (de62a3c) | 0.6779 | 0.6683 | 0.6578 | – |
| + cold-land rain (623d7fd) | 0.6769 | 0.6682 | 0.6594 | 0.6537 |
| + occupancy-grid fix, old temperature parameters | 0.6660 | 0.6602 | 0.6581 | 0.6532 |
| + temperature parameters re-tuned (current defaults) | 0.6793 | 0.6790 | 0.6743 | 0.6674 |

At the app's default Detail (204K) the current defaults read 0.6795 and match the real Köppen
group on 74 % of scored land (73.7 % at 160K, against 71.7 % before).

**Temperature now holds across sizes.** Until the occupancy-grid fix the climate was not
scale-invariant: northern land at 50–60° had a winter-season mean of −7 °C at 160K and −16 °C
at 640K, and the continental (D) share of land went 20.8 → 28.3 % from 40K to 2.56M. The cause was
in `computeTempContinentality` (temperature.js). Its coast "shaves" ask whether a bin of a
fixed-angle occupancy grid (`scLonBins*`, `nsOcc*`, `bandLonBins`; 0.5–1° of longitude) is ocean,
and a bin counted as ocean when no cell *centre* fell in it. When the mesh is sparser than the
bins, interior bins read as ocean (about 3 % of the 1° bins inside the northern continents at
50–69° at 160K, 0.1 % at 640K), the interior was treated as coast, and its continentality was
erased. Each cell now marks every bin its footprint (0.6 × `avgEdgeKm`) touches. That alone made
the continental share flat but too high (28–29 % against Earth's 22 %), because the shipped
tuning had absorbed the artifact: `TEMP_CONT_WINTER_COOL_C`, added to fix a continental deficit,
stood at 12.6 °C per unit continentality. The temperature parameters were then re-tuned at 160K
(three seeded optimizer runs over ten `TEMP_*` knobs, 300 evaluations each; `TEMP_CONT_WINTER_COOL_C`
now 2.9). `probe-scale.mjs`, cold-land rain off, % of scored land:

| mesh cells | 40K | 160K | 640K | 2.56M | Earth |
|---|---:|---:|---:|---:|---:|
| continental (D) | 22.0 | 22.5 | 22.4 | 22.4 | 22.0 |
| polar (E) | 16.0 | 15.8 | 16.3 | 16.4 | 15.6 |
| temperate (C) | 16.5 | 13.8 | 12.5 | 11.7 | 14.9 |
| arid (B) | 22.9 | 26.7 | 28.8 | 30.2 | 26.9 |
| tropical (A) | 22.6 | 21.2 | 20.0 | 19.3 | 20.7 |

Land temperature by latitude band now agrees to within 0.7 °C from 40K to 2.56M, and to within
0.2 °C from 160K up (it was 3.5–4 °C colder at 50–70° at 2.56M).

**Precipitation still drifts**, which is what moves C, B and A: land at 20–40° is 10–12 % drier
at 2.56M than at 160K. It is in the advection ("complex") model, not the zonal heuristic
(heuristic-only rain is stable to 3 % from 160K to 640K; advection-only rain falls 7–12 % at
10–40°), and within it in the rain-shadow propagation (steps 2b/2c of precipitation.js). Before
that step the mean complex-model rain over land is within 5 % across sizes (0.863 at 40K, 0.827 at
2.56M); after it 0.561 and 0.411 (−27 %). The shadow seeds barely change with size (28 % of land
is above 0.8 km at every size, 4–6 % of land is seeded as lee slope), but the propagated front
covers more land per km on finer meshes: after 1000 km it has shadowed 62 % of land at 160K and
73 % at 640K, 78 % and 90 % of land in the end at 40K and 2.56M. Not the cause (each checked): the
terrain (identical at every size), the cap on the advection hop count (`maxHops`, at most 20:
removing it, at a 1000 km reach, moved band rain by under 1 % at 10–50° and 3 % at most elsewhere),
and the reach of the precipitation smoothing passes. Not fixed.

## Files

```
evaluate.mjs        score one parameter set, print report, optional PNG maps
optimize.mjs        coordinate descent + stochastic hill-climb over param-space
apply-params.mjs    write tuned values back into js/climate-config.js
param-space.mjs     min/max range + high-impact flag for every parameter
diagnose.mjs        spatial error report: group fractions per lat band + named regions
probe.mjs           parameter sensitivity: swing each lever, flag inert ones
probe-nindia.mjs    root-cause probe for the monsoon region
probe-desert.mjs    which lever controls the subtropical desert glut
probe-tier01.mjs    wiring check for the Tier 0/1 levers
probe-currents.mjs  do the ocean currents close into gyres? (poleward west edge, equatorward east edge)
probe-coldrain.mjs  land rain by latitude band and Köppen class (is the far north too wet?) + the Köppen objective
probe-scale.mjs     does the climate hold still as the mesh gets finer? (Köppen shares, land temperature and rain by band, per mesh size)
lib/earth-context.mjs   Earth mesh + heightmap sampling + ground-truth mapping
lib/score.mjs           climate chain runner + metrics (objective weights here)
lib/koppen-distance.mjs climatic-distance model for graded scoring
lib/ground-truth.mjs    Köppen-Geiger ASCII grid parser
lib/render.mjs          equirectangular PNG rendering (sim / truth / diff)
data/               ground truth (gitignored; see below to re-download)
maps/               rendered comparison maps (gitignored)
```

## Diagnostic workflow

The tuning loop is: **diagnose → probe → change/tune → re-diagnose**.

```bash
node tuning/climate/diagnose.mjs --n 160000   # where is it wrong (lat bands + regions)?
node tuning/climate/probe.mjs                 # do the levers that should fix it actually work?
```

`probe.mjs` swings each parameter between extremes and flags any that are **INERT**
(a likely bug or downstream cancellation) — this is how the monsoon-relief bug and
the classifier miscalibration were found. Always probe before adding new code: a
lever that does nothing means the fault is elsewhere.

The diff map colors: green = exact match, yellow = major group match,
red = wrong group, dark = not scored (ocean or mask disagreement).

Köppen scoring cannot see the ocean current *vectors* (only warmth and speed reach the
climate), so they have their own check:

```bash
node tuning/climate/probe-currents.mjs --n 640000 [--dump FILE]
```

It runs wind + currents on the Earth heightmap and reports, for latitude bands, how many
basin-wide ocean rows have a poleward western edge and an equatorward eastern edge (a
subtropical gyre; reversed poleward of ~50°), plus the sign of ten named boundary currents
(Gulf Stream, Kuroshio, Brazil, East Australian, Agulhas, Canary, California, Humboldt,
Benguela, West Australian). A resolution-free property: it should read the same at 160K and 2.5M.

Köppen scoring is likewise nearly blind to *how much* rain falls on cold land (the polar and
boreal classes are set by temperature), so rainfall amounts have their own probe:

```bash
node tuning/climate/probe-coldrain.mjs --n 160000 [--params FILE]
```

Mean annual land rain by latitude band and for ET / Dfc / Dwc, in mm. Earth for scale: Arctic
tundra roughly 150–250 mm a year (a few hundred at most, more in uplands), boreal forest
200–750 mm, Russia as a whole ~460 mm (FAO AQUASTAT).

The objective barely sees the strength of the cold-land rain factor
(`PRECIP_COLD_CAPACITY_PER_C`, `PRECIP_COLD_CAPACITY_REF_C`). On the Kottek file at 160K it reads
0.6786–0.6790 over k = 0.03–0.07 at T0 = 6–10 °C (0.6787 with the factor off) and falls off only
for the strongest settings (0.6642 at k = 0.12, T0 = 14 °C). At T0 = 10 °C, polar-tundra rain falls
from 440 mm (k = 0.07, the default) to 342 (0.09) and 301 (0.12) at an objective cost of 0.0003 and
0.0014 at 160K (0.0002 and 0.0016 at 640K). Earth is 150–250 mm, so beyond k = 0.07 the choice is
a trade between the score and the rain.

The climate should read the same at every mesh size. Temperature does; precipitation does not
quite (see *Reference scores*). This probe shows both:

```bash
node --max-old-space-size=7000 tuning/climate/probe-scale.mjs --n 40000,160000,640000,2560000 [--params FILE]
```

## Re-downloading ground truth

The Vienna server can be unreachable; the Wayback Machine mirror works:

```powershell
curl.exe -L -o tuning/climate/data/Koeppen-Geiger-ASCII.zip `
  https://web.archive.org/web/2023id_/https://koeppen-geiger.vu-wien.ac.at/data/Koeppen-Geiger-ASCII.zip
Expand-Archive tuning/climate/data/Koeppen-Geiger-ASCII.zip tuning/climate/data/ascii
```

Where neither host can be reached (a sandbox with an egress allowlist blocks both), any copy of
the file does: three columns `Lat Lon Cls`, 92,416 land rows, LF or CRLF line endings. The copy
behind *Reference scores* has SHA-1 `7ef140fc294ea704e611afa4eebfe1aebd4026fa`. With it,
`evaluate.mjs --n 160000` on the current defaults prints objective 0.6790 and area shares
A 21.2 / B 26.9 / C 13.8 / D 21.8 / E 16.3 %.

## How parameters flow

`js/climate-config.js` exports a mutable `CLIMATE` object (defaults frozen in
`CLIMATE_DEFAULTS`). The climate modules (`wind.js`, `temperature.js`,
`precipitation.js`, `heuristic-precip.js`) read it at runtime, so the optimizer
sweeps parameters in-process without reloading. The browser app always runs the
defaults — tuning only changes the app when you run `apply-params.mjs` and
commit the result.
