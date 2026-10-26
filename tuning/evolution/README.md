# Evolution Regression Check

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
