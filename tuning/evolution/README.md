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
them on for Generate. This check shows they stay off.
