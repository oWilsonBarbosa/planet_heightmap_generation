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

Generate's options in the finish (`FINISH` in `v2/js/finish/finish-config.js`: `drainBelowFloor`,
`seaRemnantAnySize`, `closedBasins`, `riverSpeedKmDay`, …) are off for the Evolution; `js/water-new.js` `WATER` turns
them on for Generate. This check shows they stay off. `--set key=value,…` turns them on (any `FINISH` constant), to see
what one would change in the Evolution: `--compare` against a run without it, and the lakes and the rivers' regimes
each run prints.

```bash
node tuning/evolution/regress.mjs /tmp/base.json
node tuning/evolution/regress.mjs /tmp/gorge.json --set drainBelowFloor=true
node tuning/evolution/regress.mjs --compare /tmp/base.json /tmp/gorge.json
```

At 250K (2026-10-25): `drainBelowFloor` 121 → 100 fresh lakes, 0.65 → 0.47 % of the land; at 640K
`seaRemnantAnySize` changes nothing (a remnant of the sea under `seaBasinKm2` is the land's there), `closedBasins`
makes 17 salt lakes and 159 salt pans and keeps 1,102 regions up to 1.4 km higher (rims no longer cut through), and
Generate's river year (`baseflowShare=0.7,baseflowMonths=3,riverSpeedKmDay=40,lakeRegulationDry=0`) turns 54 → 34 %
of the river points' regime to a flood season, 38 → 64 % to steady.
