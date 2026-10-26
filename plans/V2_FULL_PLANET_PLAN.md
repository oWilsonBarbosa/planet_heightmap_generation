# The tectonic-history generator — plan (after Phase 13)

Draft, 2026-09-27, for the developer to agree before anything is built (plan first; one browser-verifiable step at a time).

## What the developer asked for (2026-09-27)

- **Its own side generator** beside V1 — "so not really a v2". V1 stays as it is, with its plate editing.
- **The planet is shown as it builds**: the history plays while it is simulated (the answer to the wait: ~75 s for
  1200 Myr at 40K sim cells today).
- **The whole history is exposed**: a timeline to scrub and play. Choose-your-ending is part of it, and **any single
  moment can be exported**.
- **Climate from V1** (wind, currents, precipitation, temperature, Köppen). V2's own erosion and rivers are "much
  better", but the developer wants to **explore V1's erosion on top of the final state** to compare. (Later: redo climate
  for both generators.)
- **The world seed and V1's toggles carry over.** **Exports include the sea** (V2's sea floor is meaningful).
- **Way fewer sliders**: starting continent size, history length, where it should end — "keep it at that for now".
  Plus **the resolution options**, as in the lab (sim: plates; terrain: heights) **with a smaller 20K sim resolution**.
- **Mobile: the same layout as V1** (bottom sheet) — but "not 100 % sure this will even work on mobile with the strength
  of the average phone": measured first, not assumed.

## What exists to build on

- **V2 (the lab)**: the history in a worker, frames streamed and packed (126 MB for 1200 Myr at 40K); terrain per frame
  on a worker pool, built for the frame shown and the ten around it; rivers carved (8b); choose-your-ending; a globe and
  a map painted from a texture (fast to change per frame).
- **V1** (mapped 2026-09-27): climate — `computeWind`, `computeOceanCurrents`, `computePrecipitation`,
  `computeTemperature`, `classifyKoppen` — and erosion (`terrain-post.js`) are DOM-free and work on any sphere mesh with
  adjacency and a height per cell; they already run in V1's worker. The import page (`import.html`) is a working model of
  feeding a foreign heightmap through them. V1's renderer (`scene.js`, `planet-mesh.js`) gives the look, the layers
  (Terrain, Satellite, Köppen, Heightmap, climate, wind and current arrows), hover readouts and every export (16-bit
  heightmaps with tiling up to 65536 px). The glue it needs:
  - **axes** (V2: z north; V1: y north — a cyclic swap);
  - **units** (V1's elevation is not km: sea km/10, land a quartic capped at 6 km — V2's peaks reach 9 km, trenches −10);
  - **a full mesh** (V1's renderer needs triangles and halfedges, which V2's terrain mesh drops — V2's mesh is V1's
    `buildSphere` with a fixed seed, so it can be rebuilt identically);
  - **a continental/oceanic partition** for the wind's continentality (V2's crust type is better than V1's import guess);
  - **per-frame updates**: V1 rebuilds its whole globe per planet — scrubbing needs heights and colours updated in place.

## The steps (each confirmed in the browser before the next)

**A. The page, watching it build, and the phone test.**
- A new page beside Generate and Import Heightmap (working name "Tectonic History"). Seed, the three sliders, the two
  resolution selects; Build runs the history in a worker, and the globe shows each frame as it arrives, then a timeline
  to scrub and play (with choose-your-ending: the history runs on until it ends as asked).
- The renderer decided by a short prototype: V1's globe and map with an in-place per-frame update (the look, layers and
  exports come with it) — or, if that cannot keep up with playback, the lab's texture globe while playing and V1's for
  the frame paused on. Recommended: V1's, if it keeps up.
- Mobile layout (V1's bottom sheet), and a **phone-class measurement**: history time and memory at 20K / 40K sim with
  160K terrain, on a throttled desktop browser (and a real phone if the developer tries one). From it, phone defaults —
  or an explicit, flagged "desktop only" decision.
- *Done when*: a planet builds in front of you at default settings, the timeline scrubs smoothly, and the phone numbers
  are on the table.
- **Built 2026-09-27, awaiting the developer's test** — `evolution.html` (V1's page, nav, sidebar and bottom sheet;
  `v2/evolution.css`), `v2/js/evolution/evolution-main.js` (the shell) and `terrain-player.js` (the lab's per-frame
  terrain, for frames that stream in: built on the pool, rivers carved, shaded; the frames near the one shown built ahead
  once the history has arrived). The renderer: **the lab's texture globe**, not V1's — V1 rebuilds its whole globe per
  planet (~1M triangles at 160K cells, ~70 MB per rebuild), which cannot follow a playing timeline; the lab paints a shaded
  texture per frame (2.5M terrain cells included). The globe is now drawn only when something changed (a globe redrawn at
  60 fps for nothing took a core from the history: 600 Myr 79 s → 48 s while watching).
- **Measured** (headless Chrome on the developer's 16-core desktop, software rendering; seed 12345, 160K terrain):
  first frame on screen in ~3 s; 1200 Myr of history in **38 s at 20K** plates, **85 s at 40K** (600 Myr at 40K: 48 s);
  scrubbing to a frame built ahead 0.1–0.3 s; playback holds 25 Myr/s. Memory, the whole browser: an empty page 435 MB,
  V1's Generate page with its planet 1030 MB, **Evolution 1850 MB with one terrain worker per core (8), 1354 MB with 3**.
- **Phones (estimated — the CPU throttle of the headless browser does not slow workers):** a mid-range phone's cores are
  ~2–4× slower, so 1200 Myr would take ~1.5–2.5 min at 20K (the planet on screen after a few seconds, building in front
  of you), ~3–6 min at 40K; memory ~0.9 GB above an empty page with 3 workers (V1: ~0.6). So on a phone: **20K plates,
  3 terrain workers, a 1024-pixel texture and a 64 MB store of built frames** by default — workable on most recent
  phones, tight on 3–4 GB ones; to be confirmed on a real phone (`/evolution` — the developer's).
- **After the developer's first look (2026-09-27):** the timeline spans the whole history from the start (0…length, a
  scale beneath; faint up to what is built, bright up to the moment shown; "340 of 1200 Myr · building"; scrubbing stops
  at what is built). Build New World clears the old planet at once (a plain sea until the new one's first frame, ~1–2 s).
  Terrain Detail redraws the same history at the new resolution, live or finished (the old detail shown until the new
  is ready: ~1–3 s), without running the history again. The playback speed applies while it builds too: watching it
  build is playing from the start at the speed chosen, held at the newest moment built (Live jumps there); before, the
  view followed the newest frame at the simulation's pace and the speed did nothing until the history had finished.
  Measured (20K plates, 160K terrain): 5 / 10 / 25 / 50 Myr/s all achieved, building or finished.
- **Keep going (2026-09-29; developer: "a 'keep going' button that gets the simulation going for as long as the user
  wants").** Once a history is done, *Keep going* (on the timeline) runs it on in 20 Myr pieces until *Stop* (a stop
  lets the piece under way finish); it can be resumed. The history worker keeps its world (`{type:'more', untilMyr}`);
  `simulate(…, {resume: true})` skips the setting-up and the first frame, so pieces ending on the step grid are the one
  history — hashes of every frame and the event log identical to a single run (20K: 300 → 360 Myr in pieces of 20; with
  an ending, stopped at 330 as *dispersed*, run on to 700). Any ending is left behind: it runs on from wherever the
  history ended. The link records how far (`more=`); opening it rebuilds the history and runs on to there. The timeline's
  scale grows as it goes. A packed frame is ~24–28 bytes a plate cell (~0.1 GB per 1000 Myr at 40K): it stops for good
  at 1.5 GB of frames (desktop; ~13,000 Myr at 40K) or 400 MB (phone; ~7,000 Myr at 20K). On phones the timeline now
  puts its track on a row of its own, the buttons beneath (it had got too narrow to scrub).

**B. How it looks, and the toggles.**
- V1's palettes on V2's terrain (rivers carved on the shown frame), V1's toggles (grid, auto-rotate, globe/map, map
  centre, show plates — V2's plates), hover readout (height, age, crust, plate).
- *Done when*: any moment of the history looks like a V1 planet at its best, on globe and map, desktop and phone.
- **Decided with the developer (2026-09-28):** both palettes, switchable ("so i can choose the one i like better");
  keep the Plates tab (not V1's Show Plates toggle); rivers stay carved valleys only (no drawn lines); a sharper globe
  when paused. V1's Wireframe is left out (the globe is a painted texture: no terrain mesh to draw as wires).
- **Built 2026-09-28, awaiting the developer's test** — `v2/js/evolution/looks.js` and the page:
  - Layer tabs Terrain · Heightmap · Plates (phones: the same in the layer dropdown). Heightmap is V1's (the sea
    black, the land grey from 0 to 6 km).
  - **Terrain Colours**: *Relief* (the lab's, the default) and five others to try, all shaded by the relief —
    *Topographic* (Wikipedia's topographic-map convention), *Natural* (muted, Natural Earth), *Swiss* (Imhof's),
    *Satellite* (Blue Marble-like), *Antique* (a parchment atlas); remembered in the browser. V1's own colours
    (*Classic*) were tried first: "too bright and blown out … I definitely prefer the relief" (developer) — removed;
    then "interested in … some OTHER color options": these, and then ("give me all the options") ten more — maps:
    *School Atlas*, *ETOPO* (after GMT's etopo1), *DEM* (after GMT's dem2), *Scientific* (after matplotlib's
    terrain), *Grey* (plain shaded relief); other worlds, concept-art looks: *Arid*, *Frozen*, *Lush*, *Alien*,
    *Volcanic* — sixteen in all, in two groups, until the developer picks. "Many of these are too bright in the
    rendering": each palette's sea and land are toned toward the relief's brightness and saturation (measured in
    linear light over the depths and heights most of a planet has), three quarters of the way, only ever darker and
    calmer, the saturation in OKLab so hues hold; the relief itself untouched.
  - **V1's space around the globe** (developer: "I do like the starry background and the sunlight/reflection of V1"):
    its stars, atmosphere rim, bluish ambient light and sun (carried with the camera, where V1's stands for its
    opening view, so whatever faces you is lit), and the sun glinting off the sea only (a sea mask painted with each
    frame; V1's water sphere: shininess 120, specular 0x4488bb × its opacity 0.55) — on the Terrain view, as V1.
  - V1's Center Longitude slider (map view), grid lines on at 15° (30 / 15 / 10 / 5 / 2.5°).
  - V1's readout: crust type and plate, elevation, coordinates, crust age, and the setting (the mountain belt — Andean
    range, collision belt, volcanic arc, rift shoulder… — active or when last active; else a flood basalt, hotspot
    track, failed rift, old suture). Hover on a desktop; a tap on a phone (a drag turns the globe). Shown above the
    timeline.
  - Sharper when paused (desktop): a 4096-pixel texture (its pixel table built a few rows at a time the first time
    the view is paused, ~1 s, 117 MB), 2048 while playing or scrubbing. Phones 1024 always.

**Coasts at high terrain detail (2026-09-29, awaiting the developer's test).** Developer: "is there any way we can make
the 40k or 80k or even 20k feel a bit more detailed? particularly at high terrain detail the coast can look a bit
polygonal, especially on island arcs." Found: the coast is the zero line of a coast distance kept per sim cell and read
straight across the sim's triangles (121 km at 40K), moved by noise no finer than ~90 km; the page then blended land and
sea COLOURS across each terrain triangle (a zig-zag along every shore). Built (options 1 and 2 of 5 proposed):
- **Curved coasts** (terrain-config `coastCurve`): the coast distance read with each sim cell's slope (least squares
  over its neighbours) — Σ wᵢ (dᵢ + ∇dᵢ·(q − pᵢ)): exact at the cells, seamless along edges, linear fields unchanged;
  its lines curve between the cells. Faded out beyond 1000 km from any coast.
- **Fractal coast detail** (`coastDetailKm` 14, `coastDetailFromKm` 88, `coastDetailRoughness` 0.6): octaves below the
  coast noise down to what the terrain mesh can show (the existing 2–3.2 cells a wave): none at 160K, 88 km at 640K, 88
  and 44 km at 2.5M — within 400 km of the coast, renewing as the coast noise does.
- **Crisp shores in the page** (display only): the Terrain and Heightmap layers are coloured per pixel from the blended
  heights (SmoothMapRaster.paintHeights), the coast the heights' zero line; the glint's sea mask too (paintSea).
- Then (developer: "we dont just need smaller scale but also a bit larger scale movement and noise … mountains form and
  sort of 'take up' the whole grid cell … the type of noise we added here might have went a little too far"; "all this
  noise stays relatively consistent across history at the same location"):
  - **a cell-scale warp** (`cellWarp` 0.35, `cellWarpCells` 3): a second lookup warp with waves of 3 and 1.5 sim cells,
    up to 0.35 of a sim cell's edge — belts, plateaus, coasts and craton edges bent at the scale of the sim's cells; in
    sim cells, so 20K gets as much as 80K; its own table (256–512 a face edge);
  - it rides with the crust everywhere: on a plate's raster (as the main warp does there), and — new — off the rasters
    too (points whose corners are two plates'): warped in the frame of the plate of the heaviest corner, then located on
    the world grid (the cached world sampler keeps the fixed large-scale warp only). Checked on crust-following views
    at 280 / 290 / 300 Myr: the same bends at the same places;
  - the fine coast detail halved (`coastDetailKm` 14 → 7); it renews as the coast noise does (detailRenewMyr epochs).
- Cost (all three, single-threaded A/B): the surface +7 % at 2.5M, +3–6 % at 160K; the carve and the land share
  unchanged; a 4096 texture painted in ~160 ms (when paused).
- Then (developer: "i broadly love these changes as it makes lowlying coastlines very interesting. However I dont know
  if it does enough in the mountainous regions … i mean the mountain coasts. like where the mountains or hills hit the
  sea"): **drowned valleys** (carve.js drownValleys; `drownKm` 180, `drownDepthKm` 1.4, `drownAreaKm2` [800, 15000],
  `drownReliefKm` [0.15, 0.9], `drownWiden` 0.55) — where hills and mountains meet the sea, the sea runs up the big river
  valleys (rias, fjords) and the ridges between stand out as headlands: each valley floor lowered near its mouth
  (measured along the river), by its drainage and by how high the land around is (the next coarser mesh's mean
  height — so a mouth graded to the sea still counts as mountainous); its sides by half as much; then the sea floods in
  from the ocean and any hollow it cannot reach is given back (no pools of sea inland). Lowland coasts barely change
  (a few estuary slits). Faded out toward 160K (a valley's width cannot be drawn on 61 km cells). Follows the rivers,
  which hold their courses: the same inlets frame after frame (checked at 290 / 300 Myr, crust-following).
- Then ("lets do them all", 2026-09-29) — the rest of the list, each checked on close-ups before/after and on
  crust-following views (280 / 290 / 300 Myr):
  - **island arcs as chains** (`arcStraitKm` 35 — halfway from 70, which cut the arcs' texture away, developer — `arcIslandKm` 140): on arc crust, the coast lowered where an island
    noise (140 km apart, crust frame, renewing) is low — within 45–120 km of the coast only, and never below the shelf's
    edge (straits are shallow sea): a young narrow arc becomes a chain of islands, a broad mature one keeps its interior
    (a strait or two, like Japan's);
  - **submarine canyons** (carve.js cutCanyons; `canyonAreaKm2` [5000, 60000], `canyonKm` 260, `canyonDepthKm` 0.7): from
    each big river's mouth down the shelf and slope by the steepest way, a trough deepest across the shelf break; faded
    out toward 160K; ~0.65 % of sea cells at 2.5M;
  - **hills** (`hillsKm` 0.05, `hillsFromKm` 120, `hillsRoughness` 0.6, `hillsUplandGain` 4): relief below the
    platform's noise down to what the mesh can show (none at 160K), more on high ground, none at the shore;
  - **crest lines along the belt** (`crestFollow`): crests read at the distance across the belt the ridge kernels carry
    (crossAt), so a main crest runs as one curved line instead of zig-zagging from cell to cell;
  - **smooth mountain mass** (`mountainCurve`): the uplift and the platform read with each cell's slope, each corner kept
    within its neighbourhood's range (no overshoot) — a slight softening (a step between cells stays a step).
  - Cost (all five, A/B): the surface +5–10 % at 2.5M, ~0–3 % at 160K; the carve unchanged; land −0.2 points (straits).
- **Diagnosed, left as is for now (developer: "lets leave it as is for now")**: at 40K / 80K the coasts read
  "detailed but fake — samey, fractally": the drowned valleys reach nearly every river mouth (the relief test 0.15 km
  is met by most continental land near coasts) at regular spacing — ~85 % of the added coastline (40K: +26 % of +31 %);
  the rest is stationary texture. Proposed: drowned valleys only on real hills and mountains, fewer and bigger, and
  regional; coast roughness by the kind of coast (rugged active margins and shields, smooth passive margins); the fine
  detail matched to the sim resolution (full at 20K, less at 80K).
- **Ring and "eyebrow" ranges (2026-09-29; developer: "a lot of circular and eyebrow shaped mountains that look very
  unrealistic"; stronger at higher terrain detail, present at all).** Diagnosis: a belt's crests, ridges and ridge noise
  are all laid along lines at a distance from its recorded front, and fronts are often blobs or loops (at 1200 Myr, 20K,
  20 % of collision-front cells lie amid their own belt; suture slivers of one plate inside the other ring themselves
  with range); old crests outlast their ground (ruggedTauMyr 368 vs reliefTauMyr 100: belts quiet 300+ Myr kept 0.57 km
  of crest on 0.1 km of uplift); belts cover ~90 % of land by 1200 Myr. First tried and **reverted** (developer: "made
  all the mountains look worse … tendrilly ridges"): cleaning fronts, capping old crests to their ground, breaking crests
  into pieces and wandering them. **Kept**: old ranges erode fatter — each crest smoothed as hillslope wear smooths it
  (lower and wider, the same bulk; σ ∝ √(time quiet)), ridges and ridge noise worn by wavelength (finest first) — and a
  rounded, fractal massif texture on every belt, more as crests spread ("a bit more fractal bulky and erode fatter/out";
  then "slightly too fractally": roughness 0.55 → 0.4). The history is unchanged (hashes). +~3 % surface time at 2.5M.
- **The same land at every terrain detail (2026-09-29; developer: "slopes and rivers … in the main rough area, but it
  can move").** Measured (20K, 1200 Myr, against 2.5M): land flips 1.8 % (640K) / 2.5 % (160K) of the land area, half
  of it rivers and drowned valleys; relief at ~140 km correlates 0.996 / 0.985, at ~60 km 0.95 / 0.84 (160K cannot hold
  60 km features); rivers draining ≥ 20k km² 92–98 % within 60 km, ≥ 100k km² 71–90 %. Cause of the big rivers' moves:
  the carve's coarse levels average the surface shown, which differs by ~90 m rms with the detail. `carveSettleCells`
  (synthesize.js settleFields: those levels given the 160K surface at every finer detail) lifts the big rivers to 74–91 %;
  built, **off** (the worker pool does not pass it yet; +~0.5 s a frame at 640K / 2.5M). Tried, no gain, removed:
  stronger inheritance of the coarse valleys, less routing by fine detail, crests anti-aliased by the mesh spacing.

**C. Export any moment, sea included; the planet code.**
- V1's export dialog on the moment shown: 16-bit heightmap with the sea (its range widened to V2's depths and peaks),
  land heightmap, land mask, colour; Export All. File names carry the code and the time (e.g. `…-760Myr`).
- A planet code for this generator (seed + sliders + resolutions) in the URL, as V1's.
- *Done when*: an exported heightmap of any moment re-imports cleanly (Import Heightmap page) and matches what is shown.
- **Decided 2026-10-01 (developer):** finished moments only (export lives with the Finish step); the 16-bit heightmap
  with the sea floor on a fixed −11…+9 km scale; the land heightmap 0…+9 km (the Import page reads white as 6 km:
  heights come back × 2/3, the shape exact); rivers drawn on the colour and satellite maps as on screen, plus a
  transparent rivers-and-lakes layer; Export All as one ZIP file (a small built-in writer). Phases: E1 the dialog,
  heightmaps, mask, colour as shown; E2 climate, satellite, the rivers layer, Export All; E3 the planet code and docs.
- **E1 built 2026-10-01, awaiting the developer's test** — an Export Map button under Finish (the finished moment shown)
  opens V1's dialog (its markup and styles.css look; 44 px targets on phones): Colour Map (as shown), Heightmap with Sea
  Floor (16-bit), Land Heightmap (16-bit), Land Mask; widths the finished picture's own, a half and a quarter
  (averaged down, never enlarged). `js/evolution/export.js` (the maps), `js/view/png.js` (V1's 16-bit greyscale encoder,
  rows Sub-filtered, 8-bit too; colour through a canvas). Checked (160K, 4096): every greyscale file decodes to exactly
  the values written; the heightmap back within 0.15 m of the finished heights; the land mask's land = the finished
  ocean's complement; files 4.0 / 1.5 / 0.03 MB, colour 3.7 MB, each ~1 s in the browser. Peaks above 9 km clip (11
  pixels of that planet, to 11.9 km).

**The page at its simplest (2026-10-01).** The developer first asked for a clearer order ("everything is jumbled up … make
it clear to a user what the intended actions are and in what order"); numbered steps in the panel (1 Build, 2 This Moment,
3 View, 4 Export) were "more confusing … overwhelming" — then: "what is the absolute minimum that someone needs to see to
make a planet, see everything, and export … surface that, and then hide all the details or knobs". Built: the panel —
New World (a new seed), the build's progress, one line on what to do ("Play the history, stop on a moment you like and
press Finish — then look around and export it"), and Settings, folded: World (seed, the sliders, plates, terrain detail,
Build This World), Finish (its detail, the moments finished), Map (colours, rivers and lakes, regime colours, density,
globe or map, rotate, grid, playback speed, stats); the layers over the planet — Terrain, Satellite, Climate (a row of its
own: Köppen, Temperature, Rain, Wind, Currents; the season where it matters), Heightmap, Plates; the timeline — Finish
(its progress, Cancel), Export in its place once the moment is finished at the detail chosen; the line beneath it says
what to do now. Gone: Calculate Climate (the Climate tab works it out by itself, once per moment), Show Finished Moments (a
finish simply shows), the step numbers and notes. Satellite before a finish: a chip under the tabs with Finish. The legend
in a card beside the planet. Tooltips drawn over the page (still). Phones: V1's layer switch, the season beneath it.
Awaiting the developer's test.

**D. Climate for a chosen moment — on request only.**
- Never computed automatically (developer: "we dont need climate on every moment. It takes way too long … there should
  be a separate 'calculate climate' button … that can be pressed on a timestamp"). With the **new climate**
  (`v2/js/climate/`, the climate rebuild — plans/CLIMATE_REBUILD_REPORT.md), not V1's: decided by the developer, confirmed
  2026-09-28, and done before C.
- *Done when*: pressing the button on any frame gives its climate in seconds, scrubbing away and back keeps it, and a
  supercontinent's interior reads as the dry, continental climate it should.
- **Built 2026-09-28, awaiting the developer's test** — `v2/js/evolution/climate-worker.js` (the climate in a module
  worker: `planetClimate({xyz, elevKm, axes: 'z-up'})` on the frame's terrain heights; it posts back only what the page
  draws — per terrain cell Köppen, annual temperature and rain; on the 1° grid the year, January and July of sea-level
  temperature, rain, sea-level pressure and wind; the annual currents, the sea's temperature against its latitude's
  average, sea ice) and `climate-view.js` (layers, arrows, legend, readout):
  - **Calculate Climate** (sidebar, and a chip over the planet on a climate layer: "No climate for 420 Myr — calculated
    for 760 Myr · Calculate"): pauses, calculates the moment shown, switches to Köppen. Kept per moment while the history
    is open (a new world clears them; another terrain detail asks for it again); the moments with a climate are listed,
    a click goes there. Moments without one show the terrain greyed on the climate layers.
  - **Layers** (a second row of tabs; phones: the layer dropdown's Climate group): **Köppen** (per terrain cell, V1's
    class colours, shaded by the relief; sea ice on the sea), **Temp** and **Rain** (Year / January / July; the land
    from its own cells — their heights and all — the sea from the grid), **Wind** (sea-level pressure, wind arrows),
    **Currents** (the sea's warm and cold water, surface-current arrows; the land greyed). Ramps: the climate lab's.
    Legend: a colour bar, or the Köppen classes on the land with their shares.
  - **Readout**: the Köppen class, the annual temperature and rain of the cell (the sea: its temperature, sea ice).
  - **Measured** (headless Chrome, desktop; 20K plates, 160K terrain): **1.0–1.2 s** a moment in the worker, 1.1–1.3 s
    seen by the page. Seed 12345 at 600 Myr: 17 / 41 / 13 / 11 / 16 % A / B / C / D / E of the land; at 0 Myr (the
    supercontinent) **79 % B** — its interior dry. Scrubbing away and back keeps it. Phone layout (400 × 820, touch):
    chip and button 44 px, tap readout with the climate. `v2/js/climate/*` unchanged.
  - **The climate's later updates taken in** (2026-09-29, fast-forward to 606711e: `terrainRelief` — calmer detail on
    simulated planets — and windward rain growing with height): no change to the page needed (defaults). Re-checked:
    0.8 s a moment; seed 12345 at 600 Myr 17 / 40 / 12 / 11 / 15 % A / B / C / D / E; the supercontinent at 0 Myr 80 % B.

**E. V1's erosion on the final state — an experiment.** *Replaced by the Finish step (plans/V2_FINISH_PLAN.md,
F1–F4 built 2026-09-29): V2's own finishing, climate-driven, on request for a moment.*
- V1's post-processing (warp, smoothing, hydraulic / thermal / glacial erosion, ridges) run on the chosen moment behind a
  compare toggle, to judge side by side against V2's own. Kept, dropped or blended by the developer's eye.

**F. Finish.** Tutorial, What's New, README, SEO / `llms.txt` (CLAUDE.md), and the performance work the phone test
calls for.

## Decided with the developer (2026-09-27)

1. **Sliders**: *starting continent size* — the supercontinent's share of the planet, 20–40 %, **default 30 %**; *history
   length* 300–1500 Myr, **default 1200**; *ending* — **default "wherever it has got to"**.
2. **Resolutions**: sim **40K by default on desktop**, with **20K** (and 80K, 160K) to choose; terrain 160K / 640K / 2.5M.
   Phone defaults from step A's measurement.
3. **Rivers show while playing** (carved on every frame shown, not only when paused) — step A measures what that costs,
   and the building ahead (the lab's ten frames) carves too.
4. **The page is called "Evolution"** (nav: Generate · Import Heightmap · Evolution).
