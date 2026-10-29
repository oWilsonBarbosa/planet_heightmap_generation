# Evolution Checks

Two checks on one Evolution world built and finished headless (`lib/world.mjs`): the regression check, below, and the
[drainage check](#drainage-check).

## Regression check

The Evolution page shares code with Generate and Import — the climate (`v2/js/climate/`) and the finish's hydrology
(`v2/js/finish/`). `regress.mjs` builds one Evolution world headless, as the page builds it (its scene `cycle`, from its
start), finishes it (Add detail) as the page's worker does, and hashes every output — the heights, the sea, the lakes,
the rivers and their years, the finished climate — so a change to that shared code can be shown to leave the
Evolution as it was, or to change only what it should.

```bash
# the baseline: the code before the change, in a worktree with this checkout's node_modules
git worktree add /tmp/base HEAD && ln -s "$PWD/node_modules" /tmp/base/node_modules
node /tmp/base/tuning/evolution/regress.mjs /tmp/before.json
# the change
node tuning/evolution/regress.mjs /tmp/after.json
node tuning/evolution/regress.mjs --compare /tmp/before.json /tmp/after.json   # exit code 1 when anything differs
git worktree remove --force /tmp/base
```

Options: `--seed` (10673275), `--sim` (40,000 plate cells), `--time` (300 Myr), `--cells` (250,000 at Add detail). The
world's history is cached under `tuning/evolution/data/` (gitignored): about 30 s to build, the finish about 20 s; two
runs of the same code give identical hashes (116 outputs).

Generate's own options in the finish (`FINISH` in `v2/js/finish/finish-config.js`: `seaRemnantAnySize`,
`closedBasins`) are off for the Evolution; `js/water-new.js` `WATER` turns them on for Generate. This check shows they
stay off. `--set key=value,…` turns one on (any `FINISH` constant), to see what it would change in the Evolution:
`--compare` against a run without it, and the lakes and the rivers' regimes each run prints.

```bash
node tuning/evolution/regress.mjs /tmp/base.json
node tuning/evolution/regress.mjs /tmp/closed.json --set closedBasins=true
node tuning/evolution/regress.mjs --compare /tmp/base.json /tmp/closed.json
```

Measured so (2026-10-25), and the owner's choice: the Evolution took up Generate's gorges and rivers' year, not the
rest.
- `drainBelowFloor`: 121 → 100 fresh lakes at 250K (0.65 → 0.47 % of the land), 386 → 355 at 640K, 1,319 → 1,302 at
  2.5M — the "lakes" strung along gorges are mostly the coarse meshes'. Taken up.
- The rivers' year set against Earth's gauges (`baseflowShare` 0.5 → 0.7, `baseflowMonths` 2.5 → 3,
  `riverSpeedKmDay` 0 → 40, `lakeRegulationDry` 0.6 → 0): the river points with a flood season 57 → 39 % at 250K,
  47 → 30 % at 2.5M, steady 34 → 58 % and 45 → 68 %. Taken up; the finish's time and memory the same (headless, 4
  cores: 92 s against 91 s at 2.5M; 316 s against 341 s and a 3.95 GB peak against 3.93 at 10M).
- `seaRemnantAnySize` changes nothing (a remnant of the sea under `seaBasinKm2` is the land's there).
- `closedBasins` at 640K: 17 salt lakes and 159 salt pans, 1,102 regions kept up to 1.4 km higher (rims no longer cut
  through). Not taken up: the developer's rule, "every river needs to end at ocean".

## Drainage check

`drainage.mjs` finishes the same world at each of `--cells` (160K and 640K by default) with its drainage network
(`finishPlanet`'s `network`: each cell's receiver, each lake cell's outlet, discharge, drainage area, runoff) and checks
it as a river network must be, beyond the finite numbers and the closed water budget:

- **connectivity** — every land cell drains to a neighbour (a lake's cells to its outlet), only a closed lake's water
  goes no further, no loops, every cell's water reaches the sea or a closed lake, each dry cell's drainage area is what
  drains into it down the network, no cell passes on more water than it gathers;
- **levels** — a lake's surface is flat and above its bed, its shore not below it (a remnant of the sea's down to sea
  level), the rivers run downhill (a climb is a pit the water cannot leave), no dry land below sea level but a salt
  sea's shore;
- **outlets** — each fresh lake has one outlet (in it, beside it, or at the end of the gorge a remnant of the sea leaves
  by), passes on no more than flows in and never back into itself; a closed lake has none; what reaches the sea down the
  network is the water budget's;
- **scale** — between the first and last detail: the runoff, the land draining to the sea, the ten largest rivers at the
  sea, the drawn rivers' length per area, the drawn river points' regimes, the lakes the coarser mesh can draw.

```bash
node tuning/evolution/drainage.mjs                                    # the regression world, 160K and 640K (~1.5 min)
node tuning/evolution/drainage.mjs --cells 640000,2560000             # finer (~5 min, ~9 GB)
node tuning/evolution/drainage.mjs --seed 754534770 --cont 20 --time 1200 --cells 160000,640000   # salt lakes, pans
```

Exit code 1 when a check fails. What it found on 2026-10-29, and the fixes, are in
[docs/DRAINAGE_20261029.md](../../docs/DRAINAGE_20261029.md).
