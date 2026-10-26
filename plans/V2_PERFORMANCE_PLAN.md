# Evolution performance — plan and status

Started 2026-09-28. Developer: "Lets do the multi core, and the tuning round now" … "i am most curious about the 160 and
2.5m detail. so we should see how we make that fastest (improving 40k im sure helps too)" … "keep trying to optimize
after this. After that pass, identify the areas that are still expensive and propose (but do not implement) ways to
approximate them while shaving off a large portion of time". Rule for the pass: the same output, faster — no lower
resolution or quality ("20k as default is not an [optimization]. its a crutch"); every change proven by hashes.

The machine: AMD Ryzen 7 9800X3D — **8 cores, 16 threads** (not 16 cores). Timings are noisy run to run (one baseline
run of the 600 Myr history took 49 s, the next 40 s): the numbers below are the best of alternating runs.

## The exact pass (done, uncommitted) — outputs byte-identical

Verified by hashes: four histories (40K 600 Myr seed 12345, 40K 300 Myr seed 777, 80K 150 Myr seed 4242, 20K 400 Myr
seed 99 — every frame's arrays and plate rotations, and the event log) and the terrain pool's output at 160K / 640K /
2.5M (surface, carving inputs, sampler, carved heights, drainage, hillshade).

**History** (40K 600 Myr: 39.7 → 36.1 s, **−9 %**; 80K 200 Myr: 24.5 → 22.6 s, −8 %):
- the supercontinent push: pairs of plates as numbers, not strings built per call; continents clearly out of reach
  skipped before the arc-cosine;
- the world view: each plate's nearest crust found once per point (it was looked up twice), gap candidates marked in an
  array (not a Set);
- contact normals: each neighbour's unit direction computed once per mesh;
- forces: no array per cell; loads by plate id;
- arc collapse: working arrays kept between calls; "sea on the way in" found during the distance search (it walked
  every path again);
- plate pieces: the working array kept; margin islands: the erosion noise (a fixed field on the mesh) computed once per cell;
- distance searches (spreadKm, the history's and the terrain plan's): each edge's length computed once per mesh.

**Terrain** (per frame: ~5 % at 160K; 2.5M playback 1.26 → 1.11 s a frame with the second carving worker):
- the plan's near-lists built without 40,000 small arrays (pairs sorted by cell);
- a second carving worker for the finest terrain (frames carved side by side) — at 2.5M only: at 640K it was slower.

**Tried and reverted:** every synthesis worker planning the frame itself (instead of one planning and handing a 25 MB
plan to the others): slower — eight plans at once contend on 8 cores. More synthesis workers than cores (15 on this
16-thread CPU): slower at every size — the heights are noise arithmetic, which a core's second thread barely helps.

## Multi-core history — assessed, not built

The history steps one after another; within a step the work is spread over dozens of rules (the biggest, the world
view's gather, is 11 %). The parts that could run on several cores without changing a single bit — the gather's
lookups, gap growth, boundary and force loops, heights, rivers, frame capture and packing (sums kept in their order) —
are ~35–40 % of a step. On 8 cores, with six helpers, that is ~1.3× at best while nothing else runs — and less while the
page is building terrain (its 8 synthesis workers use the same cores: that is when you are watching). Its cost: most of
the engine's hot loops rewritten over shared memory, and the page cross-origin isolated (GitHub Pages cannot send the
headers: a service worker would, on every page of the site). Recommendation: not now; the approximations below give more.

## Still expensive (after the pass)

| | cost | where it goes |
|---|---|---|
| the history, 40K | ~36 s / 600 Myr (~72 s for 1200); ~46 ms a step, 782 steps | the world view rebuilt twice a step (gather + resolve ≈ 35 %), boundaries and forces (~10 %), rifting (~8 %), heights and rivers (~7 %), arcs, margin islands, tidying (~10 %), frames (~5 %) |
| the history, 160K plates | ~4× a step, ~2× the steps: ~8× the 40K history | the same rules |
| a frame at 160K terrain | ~0.4–0.5 s | the plan ~0.2 s (one worker; the others wait), handing it out ~0.1 s, the heights ~0.1 s, carving 0.1 s |
| a frame at 2.5M terrain | ~1.1 s playing ahead (2 carvers), ~2 s asked for alone | the heights ~0.9 s (noise: ~50 evaluations per land cell), carving ~1.0 s (one priority flood over 2.5M cells), the plan 0.2 s |

## Phones and a second exact pass (2026-10-18)

Developer, after a phone test: "collisions are particularly heavy and take a long time on phone. And the add detail at 640
crashed the site" … "in general, it could be faster and more efficient on all devices!" … "i only care about evolution".
Measured in headless Chrome made to look like an 8-core 4 GB phone (20K plates, 160K terrain, 1200 Myr):

- **Memory (phase 1, exact).** The page peaked at 1.8 GB during a 640K Add detail (phones close a tab well before):
  the history's worker kept every frame it had sent (~2 MB each at 20K); Add detail spawned one surface worker per core
  (7 on an 8-core phone) while the terrain's own workers sat idle with their copies of the meshes; its worker kept the
  640K mesh after (~0.3 GB) and the climate's garbage. Fixed: frames not kept by the worker (simulate `keepFrames`);
  on small devices (core/device.js) the terrain's workers let go during Add detail (TerrainPlayer.rest / wake), 3 surface
  workers, a third of the unpacked frames; the finishing worker let go after any finish below 2.5M. Peak 1.81 → 1.35 GB
  (the browser's count; the threads' own 1.43 → 0.80 GB), built 1.36 → 1.03 GB, after Add detail 1.53 → 0.84 GB.
- **Speed (phase 2, exact; hashes of three histories, the terrain pool, the climate and a 640K Add detail).** Add detail:
  per-column trig in the picture and the satellite look, the look's exponentials once per pixel, column sums in memory
  order (box statistics, the grid's blur), plain loops for the grid's results — picture at 4096 6.0 → 4.4 s, ice age −57 %,
  wind −39 %, final climate −16 %. The history: nothing measurable left in exact changes (edge marks kept while a plate's
  crust is unchanged, the rift partition's arrays reused — both reverted); its time is the world view rebuilt twice a step
  (~35 %; the rebuild after the events runs on 83 % of steps — tidying, arcs and collisions change something nearly every
  step), the rift search (~15 % at 20K; an overdue piece is searched every step until a cut passes — the collision-heavy
  stretches), heights and rivers. The terrain per frame (~0.63 s at 160K on one thread) is noise and the surface's own
  arithmetic, already bit-matched and tuned. What is left is the approximations' — re-evaluated below.

## Phase 3 (2026-10-18): the options re-evaluated, the history's pace

Developer: "for 3, we should re-evaluate all our options there"; picked the history's pace (A), then the world view by
bands (B) — re-measured at the new pace B was worth ~5–10 %, not 20–25 % (the growth half of the rebuild already works at
plate edges only), so: "ok lets do the rift search improvement. Also lets stress things on 80 and 160K".

- **A, the pace** (the whole-planet scenes only): 2.25 cells a step, the slow rules every 3 Myr (not tidying — every
  step costs ~7 % but leaves no fragments lingering; not the rivers — fed in 3 Myr chunks their 4 Myr clock stretched to
  6). Measured on a copy of the engine first (two seeds: −28 to −33 %), then in the engine: 20–39 % at 20K / 1200 Myr,
  19 % at 40K / 600 Myr. Extend history still the one history. Checks: no new miss beyond chance.
- **The rift search, exactly**: per plate (not per junction) the outer sea, coast distances and crust cells; the grain
  once per history; the cuts scored over the plate's cells — −6 to −8 % of a history, hashes unchanged. (A search runs
  ~56 times a history, a third failing; ~67 ms each on the desktop — bursts in the collision-heavy stretches.)
- **The gather, exactly**: blocks of 128 cells wholly outside a plate's band of latitude skipped (the Fibonacci mesh is
  numbered down the sphere) — −3 to −5 % at 20–40K, more at 160K.
- **Scaling** (300 Myr at 20K / 40K / 80K / 160K: 6.8 / 15 / 30 / 72 s): the passes over every cell every step grow
  14–21× (the gather 18 % at 160K, boundaries 12 %, forces and contacts ~8 %), the rift search 9×. Nothing pathological;
  a band-wise (incremental) world view would pay more at high detail than at 20K.
- **Rendering** (headless Chrome on the real GPU, ANGLE/D3D11): turning the globe is smooth (66/s, no slow frames); every
  new frame repaints the map texture on the page's thread — paintHeights ~20 ms at 2048, paintSea ~4 ms — the stutter
  playing (24 slow frames in 8 s) and scrubbing (43 of 202). Proposed: draw the terrain mesh's triangles into the texture
  on the GPU (its rasterising is the table's blending), heights and shade the only upload.
- **Not done**: B; GPU terrain (the noise is ~30 % of a 160K frame; GPUs differ in their rounding, so a link could carve
  different rivers on two devices — only with a plan for that); WebGPU heights for 2.5M+.

## Proposed approximations (not implemented — the developer's call)

**History**
1. **Longer steps** — a plate edge may move ~2 cells a step instead of ~1–1.5 (growth reach and gap rules widened to
   match): about half the steps, **~40 % off the history**. Risk: coarser collision timing and ridge jitter; the phase
   checks would need re-running and some re-tuning.
2. **Slow rules less often** — heights and erosion, rivers, margin islands, arc collapse, tidying, the rift search and
   the supercontinent's bookkeeping every 2–5 Myr (with their dt scaled) instead of every ~0.8 Myr step: **~20 %**.
   Risk: events shift by a step or two; rifts found a little later.
3. **World view by bands** — rebuild ownership only in a band around plate edges each step (interiors keep their owner;
   their crust records refreshed every few steps, and fully after any event): **~20–25 %**. Risk: interior records
   (crust age, belt records) lag a few steps.
Together (1 + 2 + 3): roughly **2–2.5× faster** — 1200 Myr at 40K in ~30 s instead of ~72.

**Terrain**
4. **Plan reuse** — build the full plan (coasts, belts, kernels, volcanoes) every 30–50 Myr and, between, carry it on
   the plates' current rotations (it is anchored to the plates): the plan's 0.2 s + 0.1 s hand-out mostly gone —
   **~50–60 % off a 160K frame**. Risk: features at active boundaries (new ridges, trenches, collisions) lag up to the
   reuse interval; seams where crust was created or destroyed.
5. **Octaves the terrain can show** — skip noise octaves finer than ~2 terrain cells (invisible, aliased at 160K):
   **~25–40 % off the heights at 160K**, less at 2.5M (whose cells resolve them). Risk: a slightly smoother look where
   the aliasing read as texture.
6. **Carve coarser while playing** — carve at 640K and carry the valleys onto 2.5M while the timeline plays; the full
   carve when paused and for exports: **~45 % off a 2.5M frame while playing**. Risk: the smallest streams missing in
   motion.
7. **Progressive detail while playing** — at 2.5M, play at 640K terrain (upsampled) and build the 2.5M frame when
   paused, as the sharper texture already does: **~70 % off 2.5M playback**; the frame you stop on, and every export,
   full detail. Risk: softer terrain in motion.

**Not an approximation, but the big lever for 2.5M:** the heights on the GPU (WebGPU compute: noise is ideal for it) —
~10–30× faster heights; float32 instead of float64, so heights differ below a metre (invisible; exports not
bit-identical with today's); a large port (the whole surface synthesis), with the CPU path kept for browsers without
WebGPU.
