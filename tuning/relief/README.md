# Earth's Hypsometry

The two curves `js/earth-relief.js` maps a Generate planet's heights onto: how much of Earth's land lies below each
height, and how much of its sea floor lies above each depth, from ETOPO 2022 (NOAA National Centers for Environmental
Information, 60 arc-second surface elevation; public domain, doi:10.25921/fd45-gt74).

`fetch-etopo.mjs` reads one sample every 6 arc-minutes (~11 km) through NCEI's THREDDS server (OPeNDAP), a 26 MB
download instead of the whole grid's 233 million values, into `tuning/relief/data/` (gitignored). Each sample is
weighed by its area (cos latitude). The land is everything above sea level except Antarctica, whose height is the
thickness of its ice; the sea is everything at or below it. The tables are 201 values each, one every half per cent
of the area.

```bash
node tuning/relief/fetch-etopo.mjs          # fetch if missing, then the tables (as js/earth-relief.js holds them)
node tuning/relief/fetch-etopo.mjs --force  # fetch again
```

## Earth against the generator's own curve

Planet `06cy8w6z6a89kow6psje93`, its heights by `js/color-map.js` `elevToHeightKm` (the curve the climate uses):

| | Earth (ETOPO 2022) | the planet, generator's curve |
|---|---:|---:|
| land, mean | 830 m | 250 m |
| land, median | 442 m | 28 m |
| land below 10 m | 2.1 % | 32 % |
| land below 200 m | 26.8 % | 80 % |
| land below 1 km | 72.8 % | 92.8 % |
| sea, mean depth | 3,698 m | 2,301 m |
| sea shallower than 200 m (shelf) | 7.3 % | 0.7 % |

The generator's curve is drawn for the eye; `earthLikeHeights()` gives a planet Earth's numbers, every region keeping
its place in its planet's order. On that planet the climate's land is 3.5 °C colder (16.0 → 12.5 °C on average), the
tundra and ice caps grow (Köppen E 4.9 → 11.5 % of the land, mostly mountains at 40–65° that now reach 2–4 km), the
hot steppes turn cold (BSh → BSk), and its rivers carry more (runoff 289 → 333 mm a year).

Its broad coastal ranges in moist trade winds then wring up to 16 m a year out of a 1° cell, 20 m a region — Earth's
wettest 1° cells get ≈ 7.5 m. `EARTH_RELIEF_CLIMATE` bounds the air's supply of rain for a planet on these heights
(`v2/js/climate/config.js` `RAIN_SUPPLY_*`; off for the pages): at most 12.8 m a region, 0.018 % of the land above
10 m. Earth's own climate is the same with the bound as without (`tuning/climate/evaluate.mjs`,
`coupled-check.mjs --quick`).

Which water is sea stays decided on the generator's own heights (`js/water-new.js`): on Earth-like ones a strip of
coast one region wide — the generator's lowest land, a metre or two — would stand tens of metres high and cut 445 bays
off the sea.

Files:

```
fetch-etopo.mjs     download ETOPO 2022's sample; the land and sea tables
data/               the sample and hypsometry.json (gitignored)
```
