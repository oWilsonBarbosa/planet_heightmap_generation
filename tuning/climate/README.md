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

Default mesh resolution is `--n 40000` (fast, ~seconds per evaluation).
Tuning results carry across resolutions only roughly (see *Reference scores*
below), so always validate at ≥160K, where the defaults were tuned, before applying.

## Reference scores

Köppen objective against the Kottek file (seed 1234, `evaluate.mjs --n N`). A good copy of the
ground truth reproduces the last row on the current code.

| mesh cells | 40K | 160K | 640K | 2.56M |
|---|---:|---:|---:|---:|
| before the gyre and cold-rain changes (cc2662b) | 0.6778 | 0.6683 | 0.6578 | 0.6526 |
| ocean-gyre fix only (de62a3c) | 0.6779 | 0.6683 | 0.6578 | — |
| current defaults (cold-land rain on) | 0.6769 | 0.6682 | 0.6594 | 0.6537 |

The climate is **not** quite scale-invariant. The score falls as the mesh gets finer and the area
shares drift away from Earth's, although the terrain is identical at every size (`probe-scale.mjs`,
cold-land rain off, % of scored land):

| mesh cells | 40K | 160K | 640K | 2.56M | Earth |
|---|---:|---:|---:|---:|---:|
| temperate (C) | 17.9 | 12.4 | 10.6 | 9.5 | 14.9 |
| continental (D) | 20.8 | 24.1 | 28.2 | 28.3 | 22.0 |
| arid (B) | 22.7 | 25.3 | 27.4 | 28.9 | 26.9 |

Land at 50–70° is 3.5–4 °C colder at 2.56M than at 160K, and subtropical land 10–12 % drier. The
defaults were validated at 160K, where the shares come closest to Earth's.

The temperature drift is nearly all winter: northern land at 50–60° has a winter-season mean of
−7 °C at 160K and −16 °C at 640K (summer 19 → 22 °C). The cause is in `computeTempContinentality`
(temperature.js). Its coast "shaves" ask whether a bin of a fixed-angle occupancy grid
(`scLonBins*`, `nsOcc*`, `bandLonBins`; 0.5–1° of longitude) is ocean, and a bin counts as ocean
when no cell *centre* falls in it. When the mesh is sparser than the bins, interior bins read as
ocean (about 3 % of the 1° bins inside the northern continents at 50–69° at 160K, 0.1 % at 640K),
the interior is treated as coast, and its continentality is erased. Marking every bin that a cell's
footprint (±`avgEdgeKm`/2) touches, instead of the one holding its centre, removes the drift in a
scratch patch: winter at 50–60° is −17.7 / −16.4 / −17.6 °C at 160K / 640K / 2.56M. It also exposes
how much the shipped tuning leans on the artifact: the objective then reads 0.6710 /
0.6604 / 0.6581 / 0.6536 at 40K / 160K / 640K / 2.56M, and continental land is 27–29 % at every size
(Earth 22 %). The fix needs a re-tune of the continental winter cooling with it. Not applied. Not
the cause (each checked): the terrain (identical at every size), the Stage A zone shares (the same
at every size), and the reach of the ocean-warmth and zone smoothing (holding either at its 160K
reach changed nothing).

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

The objective cannot choose the strength of the cold-land rain factor
(`PRECIP_COLD_CAPACITY_PER_C`, `PRECIP_COLD_CAPACITY_REF_C`). On the Kottek file at 160K it reads
0.6677–0.6683 over a grid of k = 0.03–0.12 and T0 = 6, 10, 14 °C (0.6683 with the factor off),
except one cliff at k = 0.12, T0 = 14 °C (0.6603). At T0 = 10 °C, polar-tundra rain falls
from 461 mm (k = 0.07, the default) to 364 (0.09) and 306 (0.12) while the objective stays within
0.0006 of the default at 40K, 160K and 640K. Earth is 150–250 mm, so the choice rests on the rain.

The climate should read the same at every mesh size. It currently does not (see *Reference
scores*); this probe shows by how much:

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
`evaluate.mjs --n 160000` on the current defaults prints objective 0.6682 and area shares
A 20.7 / B 25.4 / C 12.4 / D 23.6 / E 18.0 %.

## How parameters flow

`js/climate-config.js` exports a mutable `CLIMATE` object (defaults frozen in
`CLIMATE_DEFAULTS`). The climate modules (`wind.js`, `temperature.js`,
`precipitation.js`, `heuristic-precip.js`) read it at runtime, so the optimizer
sweeps parameters in-process without reloading. The browser app always runs the
defaults — tuning only changes the app when you run `apply-params.mjs` and
commit the result.
