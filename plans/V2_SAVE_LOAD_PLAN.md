# Evolution: save and load a planet — plan

Draft, 2026-10-22, for the developer to agree before anything is built (plan first; one browser-verifiable phase at a
time). Branch: `fast-follows`, beside the export work.

## What the developer asked for (2026-10-22)

- **Save a planet and load it later** without waiting again: "All history up to a detail moment together and enough
  information to create all the visuals", so a world they like does not take minutes to rebuild (high plate counts and
  large detail).
- **Save the history AND the detailed moment** ("large detail can take a while"). **The rest is computed on load.**
- **Kept up to date as Evolution changes, and as backwards compatible as possible**, as more data is added (geology,
  farming…).

## What the code holds today (fast-follows, read 2026-10-22)

- **The history**: `B.frames`, PackedFrame objects (`tectonics/frame-pack.js`), each `{meta, fields}`. `meta` holds time,
  plates, hotspots, cycle, budget and events. `fields` holds ~45 per-cell typed arrays, packed losslessly ~4×. They arrive
  from the history worker by postMessage, so they are plain data. A frame is recorded every 10 Myr. Measured: ~126 MB
  for 1200 Myr at 40K plates, ~240 MB for 600 Myr at 160K. **Every frame carries a full copy of the event log**
  (`snapshot.js`: `f.events = world.events.slice()`), so it only needs storing once.
- **The detailed moment**: `B.finishes`, holding one `{cells, raster, rivers, climate, stats, secs, climateKey}`
  (`evolution-main.js` finishMoment). It also comes back by postMessage, so it is plain data. Sizes:
  - ~200 MB on a desktop (4096 px, every detail below 10M);
  - ~320 MB at 10M (8192 px);
  - ~58 MB on a phone (2048 px).

  The climate picture dominates (the Satellite colours ~75 MB at 4096). Geology and farming, when merged, add their
  rasters inside `raster`: roughly +60 MB (geology) and +143 MB (farming) at 4096.
- **Cheap to rebuild, so not saved**:
  - the meshes;
  - each frame's terrain and hillshade (0.4–1.3 s a frame, already rebuilt on demand);
  - the preview climates (~1 s);
  - pixel tables and GPU textures;
  - river paths, districts, ages, cradles and crop spread.
- **Not restorable**: running the history on (**Extend history**). It needs the live simulation, whose random-number
  state sits inside closures, so a loaded history is **view-only** (see question 1).
- **Nothing exists yet** for reading files back: `view/zip.js` only writes (stored, no ZIP64), there is no unzip and no
  DecompressionStream. `view/png.js` has `crc32` and `downloadBlob`.

## The design

### One rule
Save only what is slow to make or impossible to remake (the history, the detailed moment). Rebuild everything else on
load with the code of the day. A newer version can then improve how an old save looks without touching the file.
**The history itself is exact**: the plates, continents and every moment are as saved, in any browser. A saved file is
therefore also the cross-browser way to share an exact world, which links cannot be today.

### The file: `<name>.orogen`
A standard ZIP with each entry deflated (CompressionStream `deflate-raw`, ZIP method 8). Any unzip tool can open it, so
it is easy to inspect and debug. It holds:

| Entry | What |
|---|---|
| `manifest.json` | format `orogen-evolution`, `formatVersion`, `frameVersion`, `finishVersion`; saved with (app date/commit), saved at, the browser; the settings (seed, continents, length, ending, plates, terrain detail, Temperature, Precipitation, kept going to); the history (frames, Myr, steps, how it ended); the detailed moment (its time, cells, width, climate key, seconds it took) |
| `history/mesh.bin` | the plate mesh's points (≈1 MB at 40K), so cell numbering matches exactly in every browser (the mesh is built with sin/cos, whose last digit varies by browser) |
| `history/events.json` | the event log, once; each frame records how much of it was written by then |
| `history/frames/NNNN.json` + `.bin` | each frame's meta and its packed fields |
| `detail/moment.json` + `.bin` | the detailed moment: every typed array in `raster`, `rivers` and `climate`, plus the rest |

### A generic codec, so new data is saved without new code
One small tree codec (`v2/js/save/tree-codec.js`):
- It walks a plain object.
- Each typed array goes into the entry's `.bin`; the JSON points to it as `{"$a": [type, offset, length]}`.
- Numbers JSON cannot hold (NaN, ±Infinity, −0) are tagged.
- Anything that is not plain data (a Map, a class, a function) stops the save with a clear error, so the check script
  catches it the day someone adds one.

**Geology's frame fields and `raster.geology`, farming's `raster.farming`, and any future field are saved and loaded with
no change to the save code.**

### Versions and the compatibility policy (the maintenance story)
- **Adding** a frame field or a detail array: nothing to do. An older file simply lacks it. Each feature already checks
  for its data (the finish skips geology on a frame without `coverKm`). Where a view needs data the old detail lacks, the
  card offers **Add detail again**, and the saved history is still there to add it from.
- **Changing the meaning** of saved data (an enum's numbering, a byte scale, a layout, deposit row order, Köppen ids):
  bump `FRAME_VERSION` or `FINISH_VERSION` (`v2/js/save/versions.js`) and add a step to `migrations.js`. If a step is not
  worth writing, an old detail is dropped on load with a note, and the history loads anyway, ready for Add detail again
  (15 s at 2.5M, 53 s at 10M).
- **The frame packing is frozen as "codec 1"** in the save code (a copy of today's 20-line unpack). If
  `frame-pack.js` changes, old files still read.
- **Fixtures**: `v2/tools/fixtures/saves/` keeps one small file (a few MB: 5K plates, 200 Myr, a coarse detail) per
  format version. `node v2/tools/check-save.mjs` checks two things:
  - **(a)** save → load is bit-identical for a fresh history and detail;
  - **(b)** every fixture still loads, and its moment draws.

  It is run after any change to frames, finishes or the save code (a line for CLAUDE.md's Key Rules).

### Loading
- **Load planet…** in Settings → World, plus dropping a file anywhere on the page (desktop).
- Steps:
  1. Read the ZIP's directory, then each entry, from the file in slices (no second copy of the whole file in memory).
  2. Stop any build.
  3. Set Settings from the manifest, and the link to its recipe.
  4. Restore the mesh, the frames and the detailed moment.
  5. Build the terrain mesh as today, then go to the detailed moment, paused.
- Extend history is hidden. The status line says "Loaded from <file>".
- **Phones**:
  - A history over the phone's 400 MB budget is refused with a plain message.
  - A detail beyond the phone's limits (above 640K, or 8192 px wide) loads the history only and offers Add detail at the
    phone's own size.

### Saving
- A **Planet file** row in the Export panel: "the history and this detailed moment, to open again later (.orogen)". It
  sits apart from the maps, with its own Save button and its size shown.
- Saving happens frame by frame and entry by entry, compressed as it goes.

## Phases

### S1: the file (save only)
- `v2/js/save/` (tree-codec, zip reading and writing with deflate, versions, the save itself).
- The Export panel's Planet file row.
- `check-save.mjs` part (a), round-tripping in Node.

**Verify in the browser**:
1. A detailed moment saves a `.orogen` file; its size is shown first, and the time it took is reported.
2. The file opens in Windows' own ZIP viewer or 7-Zip and holds the manifest, the history and the detail.
3. `manifest.json` reads sensibly.

Measured: file size and save time at 40K + 2.5M, and at 160K + 10M.

### S2: load
- Load planet… and drop-to-load.
- Restoring a history (view-only) and its detailed moment.
- Settings and link restored.

**Verify**:
1. Load a file saved in S1: the same continents at every moment, the detailed moment shown with its Satellite, Climate
   and rivers.
2. An Export of the loaded moment matches the original's byte for byte (hash).
3. Load the same file in Chrome and in Firefox: identical history.
4. Load times measured.
5. On a phone: a 20K + 640K file loads; a desktop 10M file loads its history only, with the note.

### S3: compatibility guards and docs
- `versions.js` and `migrations.js`, the first fixture committed, and check part (b).
- The "Add detail again" path for an old or missing detail.
- CLAUDE.md rule; README and v2/README; the Evolution tutorial; What's New (ask); SEO blocks and llms.txt ("save and load
  planets").

**Verify**:
1. A hand-made "old" file (an older `finishVersion`) loads its history and offers Add detail again.
2. A file missing a frame field loads with that feature off.
3. Both checks pass.

### S4 (optional, later): Extend a loaded history
Replay the seed in the background. When the replay's frames match the saved ones (a hash per frame), the simulation is
the saved one and Extend can run on from it. Otherwise (another browser), say so and keep the history view-only.

## Decisions (developer, 2026-10-22: "do it", with the recommendations)
1. **Loaded histories are view-only** (no Extend); S4 maybe later.
2. **Save** is a "Planet file" row in the Export panel; **load** is in Settings → World, plus drag-and-drop.
3. **No history-only save** for now: a planet file needs a detailed moment.
4. **File name**: `orogen-<seed>-<time>Myr.orogen`.

## Status
- **S1 built 2026-10-22.** `v2/js/save/` (planet-file, tree-codec, zip-io, versions), the Export panel's Planet file
  row, and `v2/tools/check-save.mjs`:
  - a 10K plates, 200 Myr, 160K-cell moment round-trips bit for bit;
  - a flipped byte is caught;
  - .NET's own ZIP reader opens the file.
- **Measured in Chrome** at 40K plates, 1200 Myr and 2.5M detail: 355 MB of data → a 139.5 MB file, saved in 4.7 s and
  read back in 1.5 s (121 frames, 1025 events). Not yet measured: 160K plates with 10M detail.

## The seven strengths
- **Climate depth**: untouched (the climate is saved as computed).
- **Zero friction**: files stay local, with no account or server; it adds a faster path back to a world.
- **Plate editing**: V1's, untouched.
- **Globe**: untouched.
- **Free / open**: the format is a plain ZIP of JSON and arrays, documented here.
- **Mobile**: the Load button works with the phone's file picker; drag-and-drop is a desktop extra. Big desktop files are
  partly refused on phones, with a clear note. That is the one tradeoff.
- **Terrain look**: rebuilt on load with the code of the day.
