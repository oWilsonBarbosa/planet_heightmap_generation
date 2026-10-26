# V2 roadmap — phases 9 to 13 (before the full planet)

Written 2026-09-26, after Phase 8 closed. Each phase below has a **definition of done** to agree with the developer
before it is built; none starts until the one before it is confirmed (design doc §9).

## Decisions that shape this roadmap (developer, 2026-09-26)

- **Order: steady detail, start-world defaults, natural collisions, sim resolution, supercontinent cycle** —
  numbered 9 to 13 in that order — then the full planet. "The parked are the most important things … before moving
  forward. I think it's a lot of small tweaks and rethinking."
- **Steady detail is critical.**
- **Collisions need rethinking** before the supercontinent cycle: "way way too many captured seas in between
  continents, and a lot of dangly and long snake-like continents and islands … collisions need to be more natural,
  more fluid, more rotating and kinematic." A few small remnant seas are right — "it just shouldn't be a crazy amount".
- **More cratons at the start** — "so fewer fully undisturbed pieces of land over history". (Tried in Phase 10: the
  count makes no measurable difference; the developer: craton BEHAVIOUR will do more. Phase 10 became the cratons' edges
  and look; the untouched-land targets moved to Phase 13.)
- **Try a finer sim mesh** — "it is a bit too blocky right now" (the heights already give much of the detail).
- **Not in V2:** plate editing (V1 and V2 live side by side). **Parked:** heights feeding the history (a height ceiling
  that turns into width) — not critical. **Speed** becomes part of the full-planet phase.

## How every phase runs

1. Plan and definition of done agreed (this document).
2. Built, with a lab scene that isolates it, an on-screen checklist, and a headless check script with numeric
   pass/fail.
3. **History changes are allowed in phases 9 (part B), 10, 11, 12 and 13** — each changes how the planet evolves. When one
   does: every earlier suite is re-run; a failure is analysed, and a check is re-baselined only with the reason written
   down (design doc §10); each scene must still tell its story (India still collides and builds its plateau, the Andes
   still rise, Hawaii still draws its chain…). A new probabilistic rule gets its own seeded stream.
4. Scale invariance holds (km, Myr, °C — never cell counts), and moving a terrain look slider never changes the history.
5. Confirmed by the developer in the browser; then the next phase.

## Where the world stands (baseline, 2026-09-26)

History scene (the generated start world, every mechanism on), 600 Myr, sim mesh 40K cells (121 km), seeds 12345 and
777, measured every 100 Myr. Definitions used throughout:

- **enclosed sea** — ocean crust not connected to the world ocean, larger than 50,000 km² (the terrain already fills
  smaller pockets as lowland);
- **thinness** of a landmass — its deepest point from the coast ÷ the radius of a disc of the same area (a disc 1, a
  ring or a snake ≪ 1; below 0.35 reads as a snake or a ring);
- **undisturbed** crust — continental crust that no belt (current or overprinted), rift margin, failed rift or flood basalt
  has touched.

| Measure | Now |
|---|---|
| Enclosed seas | 3–13 at a time; almost all lie inside ONE plate (sealed in at a weld); seed 12345 at 600 Myr: a 62 Mkm² ocean inside a ring continent of 3 plates (73 Mkm² enclosed in all) |
| Big landmasses | thinness 0.27–0.40 for the largest ones late in the history (a ring; snake-like), 0.5–0.9 for the rest |
| Small bits (< 0.3 Mkm²) | 41–96 at a time: 34–85 island-arc pieces, 2–16 fore-arc isles, 1–4 continental scraps |
| Undisturbed continental crust at 600 Myr | 30 % / 42 % (about half of it craton); largest untouched patch 10–18 Mkm² (South America ≈ 17.8) |
| Small rivers between frames 10 Myr apart | log-drainage correlation 0.20 (routed at random: 0.12) |
| History time, 600 Myr | 21–28 s at 40K cells; 51 s at 80K |

What causes the collision problems (read in the code):

- **The collision lock is total.** torque-balance.js ties colliding plates on their WHOLE relative velocity ("slow,
  stop, and move as one"), so at first contact the pair stops pivoting: the rest of the ocean between them stays open.
- **Welding comes too early.** collision.js welds a pair after 600 km of shortening, 40 Myr of contact, a stall or a
  big overlap (front ≥ 800 km); merge-plates.js closes only straits narrower than ~520 km. Anything wider stays inside
  the merged plate — ocean crust with no boundary around it — and nothing can ever close it.
- **Rings.** Continents welding one after another around an ocean build a ring with a sealed ocean inside: the 62 Mkm²
  sea and the 0.27 "snake".
- **Island arcs are most of the "dangly islands"**: long chains of small arc pieces (34–85 at a time).

---

## Phase 9 — Steady detail

*Goal:* scrub the history and a drifting continent keeps its coastline, its medium-scale shapes and its small rivers,
changing only where the history changes.

**A. Records read in each plate's own frame.** The terrain's records (coast distance, shelf, platform, belts, uplift,
…) live on the fixed world grid: every frame a moving plate's crust is re-sampled onto different world cells, and the
terrain interpolates across world-grid triangles — so medium-scale shapes (coast wiggles at ~120 km, the edges of belts)
re-form as a plate moves. The fine noise is already anchored (8a, round 4); this anchors what it rides on.
- Each world cell's record values go to its crust cell (plate, raster cell — anchor.js already knows it); the terrain
  interpolates over the PLATE RASTER's triangles at the point's plate-frame position (the same mesh geometry, carried by
  the plate). Raster cells no world cell shows (rotation leaves a few) take their visible neighbours' mean.
- Across a plate boundary each side samples its own plate, blended as plateFramePoint blends now.
- Records that belong to the world (a trench line, the boundary between two plates) are checked one by one: most are
  measured from features that move with a plate and carry over unchanged.

**B. Stale belt positions fixed at the source.** ~2 % of belt cells carry a distance across their belt that jumps by
more than a cell spacing from their neighbours' (380 of 16,655 at 600 Myr); the terrain repairs them (records.js,
the "donut" fix). Trace each back to the step that stamped it — suspects: a belt front that moved on and left older
stamps behind (orogeny.js spreadBelt), and the resampling of the lower plate at a weld (merge-plates.js) — and fix it
there. This changes histories (belt positions feed the belts' own growth).

**Status: accepted 2026-09-26 (developer) — A built (design doc §10; check-phase9, 8 checks); then, on the developer's
"a little bit too consistent", the fine detail renews slowly (detailRenewMyr, 150 Myr — steady from frame to frame,
re-sculpted over a few hundred Myr). B moved to Phase 11 (developer agreed): its likely sources — the weld's repainting
of the seam, a belt front moving on — are the collision code Phase 11 rewrites, the terrain's repair already hides the
donuts, and fixing it changes every history, which Phase 11 does anyway.**

**Definition of done** (revised with the developer: "improvement and overall feel of stability, not perfection"; the
small-river correlation replaced by river course persistence — streams below the terrain mesh's grain re-form by
construction)
- Lab: the history and India scenes, scrubbed frame by frame, show no re-forming coastlines or belt edges on a drifting
  continent; checklist items for both.
- Rivers over 10,000 km²: ≥ 90 % run within a terrain cell of one at the same crust 10 Myr before (reached 95–96 %).
- Coastline: on the plate that moved most, land/sea agrees at the same crust position 10 Myr apart on **≥ 95 %** of
  terrain cells within 300 km of its coast (was 87–95 %; reached 94–97 %; the terrain mesh's own grain costs ~1–2 %).
- ~~Belt positions: 0 stale cells~~ — moved to Phase 11 with B.
- Anchored detail (8a check) stays ≥ 0.95; 640K terrain still ≤ 2 s; every suite passes (reached: history bit-identical).

## Phase 10 — Start-world defaults and cratons

*Goal:* more, smaller cratons, so more of the land is worked by rifts and belts over the history — fewer big,
untouched interiors (A); and cratons that look like shields and meet the ranges pressed against them the way real ones
do (B — developer, 2026-09-26: "better ways to treat cratons so they blend with stronger mountain ranges that border up
very close to them … research more about cratons and how they work and look").

### A. More, smaller cratons — tried, dropped (2026-09-26)

The plan was cratonCount 14 → ~22 and smaller cores, on the idea that more seams between cratons mean more rifts and
less untouched land. Measured over three seeds (12345, 777, 4242), 600 Myr, undisturbed continental crust / largest
untouched patch:

| Start world | 600 Myr |
|---|---|
| 14 cratons (now) | 30 / 42 / 46 % — 10–18 Mkm² |
| 18 cratons, largest ≤ 3,000 km | 40 / 33 / 49 % — 8–20 Mkm² |
| 22 cratons, largest ≤ 3,000 km | 36 / 30 / 46 % — 12–17 Mkm² |
| 26 cratons, largest ≤ 3,000 km | 38 / 51 / 39 % — 7–27 Mkm² |

No trend: the seeds differ more than the settings. What works the land is how often it breaks up and collides — 13–16
rifts in 600 Myr, only 3–8 plates alive at a time, continents few and huge (the largest 75–140 Mkm²), and a continent
under 18 Mkm² never rifts without a plume. Letting 10 Mkm² continents rift on their own (riftMinContinentKm2 1e7) helped
two seeds of three (22 % / 29 % / 40 %); doubling the rift rate did not help. The developer: "the changes we are making
to craton behavior will do more to affect the desired outcome than the changes to number of cratons". So Phase 10 is B;
the untouched-land targets (≤ 25 %, largest patch ≤ 8 Mkm²) move to Phase 13, where breakups come in bursts — with the
rift threshold as a lever to try there.

### B. Cratons: their edges against the ranges, and their look

**What goes wrong now** (history scene at 300 and 600 Myr, India scene; 51 of 775 craton-edge cells at 600 Myr have
ground > 1.5 km higher within 250 km). A belt cannot enter a craton (orogeny.js) and the uplift's hillslope smoothing
stops at it (heights.js), so:
1. a range pressed against a craton ends in a **wall along the craton's outline — the sim mesh's 121 km staircase**,
   drawn into the terrain;
2. **no foreland**: the flat shield (cratonKm 0.28) runs right up to the foot of the range;
3. **small craton scraps** (a few cells) read as flat, stair-edged holes inside mountain belts;
4. **interiors are blank and all alike**: one flat platform, a start swell at half strength that has worn away by
   ~400 Myr.

**How real cratons meet ranges and what they look like** (read for this plan):
- Cratons are rigid: deformation piles up against them and goes around them, and it concentrates at their margins,
  where the lithosphere steps from thick to thin. Around the Tarim block 94–100 % of the Cenozoic shortening sits in
  the ranges along its margins, with a few basement-cored uplifts inside; the block itself is a low basin ringed by
  ranges. A craton hemmed in by ranges is right; the problem is how the edge is drawn.
- The thrust front follows the craton's margin at the scale of its **promontories and embayments**, not finer: the belt
  reaches farther onto the craton, and wider, in embayments (salients — with the deepest foreland) and is narrow at
  promontories (recesses — basement massifs in the belt). Transform offsets of the old margin become transverse zones
  (Thomas 1977, 2006).
- A stiff craton (effective elastic thickness 80–90 km) bends under a range's weight into a **wide, shallow foreland**
  (Watts 1992): a **foredeep 100–300 km wide**, filled to a lowland of megafans with an **axial trunk river parallel to
  the range**, fed from both sides (the Ganges, between the Himalaya and the Bundelkhand craton: megafans over 150 km
  long), then a **forebulge 60–470 km wide and only tens to a few hundred metres high** — often buried, or broken into
  arches (DeCelles & Giles 1996). So the range's foot is a lowland, lower than the shield beyond it.
- Where a plateau's edge meets a rigid block, the front is abrupt: the Longmen Shan drops ~4 km over 30–50 km to the
  Sichuan Basin (Yangtze craton), with little shortening. **A steep front is right for an upper plate's plateau edge; a
  foreland is right where the craton is the lower plate.**
- Shield interiors are calm but not blank: **basins and swells 1,000–2,000 km apart** (Africa's heights have two modes,
  300–400 m and 900–1,100 m); **saucer-shaped sag basins** from 400 km (Williston) to 1.4 Mkm² (Congo), separated by
  basement arches; a **dome-and-keel grain** — granite domes 50–100 km across between curvilinear greenstone belts; most
  of the Canadian Shield a rolling upland under 600 m. Knob-and-lake terrain and inselberg fields lie below our grid.

**Build** (the rim belts change the history — see the decisions below; the rest is terrain only):
1. **The craton's edge is a line, not cells.** A signed distance to the craton's edge, measured on each plate's own
   raster (as the coast is since Phase 9), moved in and out by noise (as the coastline's bays and headlands are): the
   range front and the shield's platform follow that line, and craton scraps smaller than ~50,000 km² blend into what
   surrounds them. Salients and recesses come from the history's own belt shapes; nothing traces the cells.
2. **The range tapers at the line, and a foreland bends into the craton.** A flexural profile on the craton side: a
   foredeep lowland 100–300 km wide (its width from a stiff plate's flexural parameter, its depth from the load of the
   range beside it, filled to a low plain), rising to a low forebulge (≤ ~0.2 km), then the shield. It goes on the lower
   side of a collision and behind an Andean range; where a plateau's edge meets the block, the front stays steep. The
   carving should then find the trunk river along the front by itself.
3. **Cratons with characters.** Each craton (keyed by its terrane id, a stream of its own) takes a long-wavelength
   shape: a sag basin (a low interior plain), a swell (a high shield plateau, up to ~1 km), or a flat shield; plus a
   faint grain of domes and keels (~70–100 km, tens of metres to ~150 m). Still the calmest ground on the planet.

**Decided with the developer (2026-09-26)**
- **Belts reach a little onto the craton's rim in the history** ("yes that is great"): a thin-skinned fold-thrust belt
  over the craton's edge, as in the sub-Andean zone and the Canadian Rockies' foothills — low relief, no thickening of
  the shield itself; the craton's core stays impassable. This changes histories (re-baselined with reasons, as A does).
- **Craton characters in between** ("in between, we can tweak that later"): swells up to ~0.5 km above the shield,
  sag basins down to ~0.1 km — not the subtle ±0.2 km nor a Kalahari-like 1 km plateau; a lab slider for their strength.

**Status: accepted 2026-09-26 (developer: "ok that is good"; "close and commit 10") — check-phase10 (8), lab scene
"Ranges against cratons".** Built: the rim belts (tectonics/step/orogeny.js; the events of
every history unchanged, only its records and heights), the edge line, the foreland and the characters
(terrain/cratons.js). Measured at pressed edges (history, 600 Myr, median across every kind of front): the drop from the
range to the shield spread over ~160 km instead of ~120; the ground 80–200 km in ~0.1 km below the shield beyond (none
before); craton medians spread 0.21–0.24 km apart (0.07–0.13 before); relief within cratons ×1.6. In the craton scene:
India's shield bent 0.15 km down before the range (Asia's, behind the plateau, 0.04 — a steep front). Craton scraps: median
gap to their surroundings 0.01 km; the worst (0.77 km, 1.27 before) is the tip of a shield hidden in a collision's overlap —
the weld's geometry, for Phase 11 (as is the weld's redraw moving crust under rim records, up to ~280 km in). Terrain at
640K 1.96–2.08 s across runs (an exact early exit, heights byte-identical).

**Definition of done**
- Lab: a craton terrain scene (a collision with a craton on the lower plate, and a plateau's edge against a craton)
  plus the history scene; checklist items: the range front follows the craton's large shape but never its cells; a
  lowland foreland with a river along the front; a plateau edge against a craton stays steep; cratons differ from one
  another; small craton scraps don't show as holes.
- Checks (history scene, 3 seeds, 300 and 600 Myr, 640K; baselines measured first and written into the check):
  - wherever a range ≥ 1.5 km abuts a craton on its lower side, the ground 50–200 km inside the craton is lower than
    the shield 400–600 km in (a foredeep), and the steepest slope lies in the range, not at the craton's edge;
  - craton scraps under 50,000 km² sit within the height range of the ground around them;
  - relief within cratons at least 1.5× now, but still below the relief of ordinary lowland;
  - craton median heights differ from craton to craton (spread ≥ 0.15 km);
  - the rim belts: every suite passes, histories re-baselined with reasons; the terrain parts leave the history unchanged
    (hash); 640K terrain ≤ 2.1 s; the same look at 160K, 640K and 2.5M.
- Order: the rim belts first (they change every history), then the edge line, the foreland and the characters (terrain).

Sources: DeCelles & Giles 1996, *Foreland basin systems*, Basin Research 8; Thomas 2006, *Tectonic inheritance at a
continental margin*, GSA Today 16(2) (and Thomas 1977, AJS); Watts 1992, Basin Research 4; Godard et al. 2009 and
others on the Longmen Shan; the Tarim regional overview (Earth-Science Reviews 2019); Burke's African basin-and-swell;
the Pilbara dome-and-keel (Sandiford et al. 2004); Crosby et al. 2010 (Congo Basin).

## Phase 11 — Natural collisions

*Goal:* collisions that close oceans — continents pivot about their first contact and keep converging, closing the gap
like a zipper, so few seas are sealed in and assemblies are compact, not rings and snakes; fewer, shorter island-arc
chains.

1. **Contact as a pivot, not a lock.** In the torque balance, a land-on-land contact resists the CONVERGING part of the
   relative motion (as a trench resists along its normal) with only a weak drag along it — not the whole relative
   velocity. Slab pull from the lower plate's remaining trenches then turns it about the contact, and the rest of the
   margin closes.
2. **Weld when the seam has closed, not at first contact.** A pair welds once the sea between the two facing coasts is
   narrow along most of the front (or, as a fallback, after a long time locked together) — not after a fixed shortening
   or contact time with the ocean beyond still open.
3. **Remnant seas close.** Ocean crust sealed inside one plate (after a weld, a docking, a captured wing) shrinks from its
   margins at a closing rate (inward thrusting, ophiolite obduction) — so a remnant sea lives some tens of Myr, and only
   a few, small, young ones exist at a time (the Mediterranean, the Black Sea).
4. **Island arcs** — not a target (developer, 2026-09-26: "im less concerned there, im more concerned if there is like a
   snake of continent through the whole world"): arcs stay as they are; counted, not capped.
5. **The weld's redraw** (indentation and escape) is checked for long tongues of land: none should come out snake-like.
6. **Stale belt positions fixed at the source** (from Phase 9B): ~1.8 % of belt crust cells carry a distance across
   their belt far from their neighbours' (174 of 9,632 at 600 Myr) — 104 stamped in the same step as their neighbours
   (most likely the weld's repainting of the seam: trace one through the weld first to confirm), 68 left from an older
   stamp a belt front that moved on no longer reaches (orogeny.js spreadBelt — Andean belts too, not only collisions).
   Fixed in the rewritten weld and in spreadBelt; the terrain's repair (records.js, the "donut" fix) stays as a guard.
7. **The weld's geometry and the cratons** (found in Phase 10): the weld's redraw moves crust under records laid before
   it — a rim belt ends up ~280 km inside a craton (at most 184 km before the weld, the rim being 150 km) — and in a
   collision's overlap the tip of the lower plate's shield shows in the world view as a one-cell "scrap" while the rest
   is hidden under the upper plate, standing as a 0.77 km hole in the plateau. The rewritten weld keeps records with
   the crust they belong to, and a shield under the overlap goes under whole or not at all.

**Decided with the developer (2026-09-26):** built all at once, not in sub-steps ("really the pivot and welding is the
most important piece … it should help with everything"); the snakes that matter are continents, one thin landmass winding
through much of the world — not island arcs.

**Status: accepted 2026-09-26 (developer: "commit this phase").** The pivot (a contact resists closing, only 0.05 of parting
and half along the front), the weld once the seam has closed (or stalled, or 120 Myr locked), no weld round a sea over
1.5 Mkm² unless stacked 500 km deep, land stacked deeper than 250 km goes under, seas sealed inside a plate close from
their shores at 12 km/Myr, holes the redraw leaves filled; the zipper scene in lab 5. check-phase11 (8). Against the
definition of done — developer, while finishing: "dont worry too much about getting the goals perfect, we can just try to
minimize it … the supercontinent cycle will be where we put it to the test":
- enclosed seas (ocean floor; before: 62–73 Mkm²): seed 12345 at most 0.8 Mkm², 4242 one of 8.3 Mkm² for the one frame
  before its zipper shuts, 777 an ocean ringed by three continents that stay apart to close it (25 → 16.5 Mkm² over
  470–530 Myr) — re-baselined to "≤ 3 over 0.5 Mkm², none over 25"; the ringed ocean is Phase 13's;
- rings and snakes: no landmass wrapped thin round a sea it encloses (0.38 at worst); the longest 2.4–2.9× its disc; the
  thinnest of all 0.32 and 0.28 are 143–160 Mkm² supercontinents with open embayments — their shape is Phase 13's;
- item 6, stale belts: measured anew, most "stale" cells were not stale — a craton's rim and old weak seams (their path
  costs, by design; ~110 cells at 600 Myr) and two belts of one kind meeting (~170: a real edge, blended by the terrain,
  records.js beltLayer). Left off by their own belt: 0.07–0.56 % of belt cells (check ≤ 1 %). A reach that never narrows
  within an event was tried and dropped: belts grew wider, the count did not fall;
- item 7, weld and cratons: the "scraps" standing as holes were a shield's narrow neck whose joining cell the world view
  skipped (7 of 10) — found on the plate's own raster, the scraps stand 0.04–0.42 km above their surroundings, no holes;
  the weld's belt reaches 1–2 cells past the 150 km rim (344 km at most on the raster) but the terrain fades a belt across
  the rim by the edge line's distance, so it does not show;
- suites: all pass; re-baselined with reasons — invariants (an overlap with no record measured by its own outline),
  5 (connectivity on the plate's raster), 8a (India range ≥ 0.7 km over its foreland; active belts pooled over 400, 500
  and 600 Myr), 8b (pooled; a log10(0) fixed), 9 (coasts the history itself moved left out, from the plate's own coast
  records), 10 (scraps on the raster).

**Definition of done**
- Lab — a new "zipper" scene: two continents meeting at an angle close the ocean between them after first contact,
  pivoting, and weld along ≥ 70 % of their shared margin, with no sea over 0.5 Mkm² left between them; checklist item.
- History (3 seeds, 600 Myr, every 50 Myr):
  - enclosed seas over 0.5 Mkm²: **≤ 3 at a time, none over 3 Mkm²**, all enclosed seas together ≤ 5 Mkm² (now up to
    73 Mkm²);
  - no continental landmass over 5 Mkm² with thinness below 0.35; the largest landmasses' median thinness ≥ 0.5;
  - no continental snake: no landmass whose length (its longest path across itself) exceeds ~4× the diameter of a disc
    of its area — measured first, the baseline written into the check;
  - island arcs counted and reported (still standing along trenches), not capped.
- Belt positions: **0** stale cells in every frame of three seeds; the terrain-side repair becomes a guard that never
  fires (kept, with a check that it does not).
- The India scene still collides and builds its plateau; plate speeds stay in WBP's bands (Phase 4); every suite
  passes, histories re-baselined with reasons.

## Phase 12 — Sim resolution test

*Goal:* see whether a finer plate stage looks better (less blocky) and what it costs, then choose.

- Run the same seeds at 40K (121 km, now), 80K (~86 km) and 160K (~60 km) sim cells. Everything is in km and Myr
  (check-scale covers the tectonics), so the planet should be the same planet, finer.
- Compare: history time; the Phase 11 shape measures; belt widths and heights; coastline blockiness; the terrain side
  by side in the lab.
- Note: some of the "blockiness" was the terrain's distance bug (fixed 2026-09-26: coast distances, belt directions) —
  compared after that fix.

**Definition of done**
- The lab can build a history at 40K / 80K / 160K sim cells (a setting), and a comparison — screenshots and the
  numbers above — is shown to the developer; the default is chosen from it.
- Measured: 80K ≈ 1.8× the history time of 40K (51 s vs 28 s for 600 Myr); 160K to be measured.
- If the default changes: every suite passes at it, check-scale holds, and 600 Myr stays within a time budget agreed
  here (e.g. ≤ 60 s — speed work proper is in the full-planet phase).

**Status: accepted 2026-09-27 (developer: "i think this phase is done"; "lets have 40k be default for now (I do like the
look of 160 a lot more, but for the remaining testing lets keep it at 40k)").** Built, in the developer's order ("speed
and memory work first, then the others"):
- **Memory, lossless:** the lab's history frames come back packed (tectonics/frame-pack.js — each mostly-empty record
  field as a bitmap of the cells that differ from its background plus their values; sorted cell lists as one-byte
  steps) and are unpacked field by field when read, within a 96 MB budget: 600 Myr in 63 MB at 40K (273 before), 242 MB
  at 160K (1.1 GB); every field of every frame checked bit for bit.
- **Speed:** a step may take two closing plates 1.5 cells (was 1.0; the most crust growth's reach allows) — a third
  fewer steps; 600 Myr ≈ 27 s at 40K, 63 s at 80K, ~2.5 min at 160K. Exact code optimisation was tried (the world
  gather's cap scan, its edge marks) and gave nothing measurable: the history's time is spread over ~15 mechanisms at
  2–8 % each, the gather's lookups already tuned; what is left exact is ~10 % (margin isles, arc collapse, plate
  pieces, rift attempts) — not done. Bigger levers (2 cells a step; WebAssembly/GPU) are for the full-planet phase.
- **The lab's Sim resolution setting** (8a/8b: 40K / 80K / 160K, `&sim=`): the shell builds the sim mesh, the terrain
  pool is rebuilt for it, the carving ladder skips terrain meshes no finer than it. Default 40K.
- **The zipper** (developer, looking at it for the first time: "it didn't work at all … the western lobe never meets the
  coast"): three causes. The scene's Borea was round — a straight chain against a convex coast touches at one point, and
  no turn can close the rest — now a long continent with a fairly straight south coast. The weld judged the gap by its
  width on average along the front, so a wedge at one end passed as closed — now it waits until the sea between is
  nowhere wider than 250 km, measured where the two coasts face each other (the open sea beyond the end of the seam is
  not a gap). And the lock stopped all convergence at the contact, so the plate see-sawed about the contact's middle,
  opening one end as it closed the other — collisionResistance 300 → 100, so a collided part keeps converging a little
  (as India into Asia) and stays pressed while the rest closes. The zipper now turns ~21° and welds at ~40 Myr along the
  whole margin (check-phase11 re-baselined: the turn and the widest sea left).
- **Known, left:** at collisionResistance 100 Phase 5a fails 3 checks — India's foreland belt reaches wider than the
  plateau (949 vs 692 km), the redraw absorbs 91 of 111 overlap cells, and the Wilson scene welds for another reason than
  its check expects — a foreland re-tune to do. The other suites were not re-run after the step and lock changes (the
  developer tested in the lab); check-phase11 passes.

## Phase 13 — Supercontinent cycle

*Goal:* the WBP cycle — a supercontinent breaks up in a burst of rifts, the pieces drift through a quiet spell, and they
reassemble into a new supercontinent, which in time breaks up again.

- Breakup comes in bursts: the chance of rifting grows with the supercontinent's tenure and the heat insulated under it
  (mantle heat), then falls away once it is broken up.
- Reassembly by ocean closure — introversion (the young interior ocean closes) or extroversion (the old outer ocean
  closes) — through subduction starting at old passive margins (6b) and the zipper collisions of Phase 11 (so the new
  supercontinent is compact, not a ring).
- Breakups follow old sutures and belts (the Wilson cycle: the Atlantic reopened along the Appalachian suture).
- (A history asked to end in a stage — breakup, dispersal or assembly — was parked, "Not now"; then, 2026-09-27, the
  developer: "when you finalize this you can go on and build out the 'choose your ending' version" — built, see below.)

**Where it stands (baseline, 2026-09-27; the lab history run to 1200 Myr, largest landmass's share of continental
crust):** every seed breaks up (100 % → ~30 % within 120–300 Myr), but after that nothing draws the pieces together — seed
777 happens to reassemble (100 % at ~400 Myr, and 94 % briefly at ~680), 4242 reaches 84 % once (~820 Myr), 12345 never
passes 72 %. Rifts come at a steady 1–5 per 100 Myr all the way through: no bursts, no quiet spells.

**Plan — three mechanisms, each grounded in how the real cycle is thought to work:**
1. **Breakup in bursts, from the heat under a supercontinent** (thermal insulation — Anderson 1982, Gurnis 1988, Coltice
   et al. 2007; plumes under Pangaea — Li & Zhong 2009). The engine already carries mantle heat that builds up under
   continents (it lifts the land and feeds hotspots). A plate's rift chance is scaled by the heat under it: a
   supercontinent that has sat long over its own warm mantle rifts readily, and the first rifts are followed quickly by
   more while the pieces are still over the hot spot — a burst; once they have drifted off it onto cooler mantle the
   chance falls away — a quiet spell. The steady rate today becomes a low floor.
2. **Reassembly, drawn by the mantle's downwelling** (orthoversion — Mitchell et al. 2012: a new supercontinent forms
   ~90° from the old one, over the ring of subduction that surrounded it; introversion / extroversion — Murphy & Nance).
   A slow, large-scale mantle flow: up under the last supercontinent (where the heat built up), down along a great
   circle 90° from its centre. It drags on continents' roots (a gentle basal traction, a force in the torque balance
   like the others), so after the burst the pieces drift apart and then, over a few hundred Myr, gather toward the
   downwelling and collide there — the zipper collisions of Phase 11 keeping the new supercontinent compact. When a new
   supercontinent has formed (≥ 70 %), its centre becomes the next upwelling and the ring moves: the cycle repeats.
   The traction stays small next to slab pull, so plates still move as their trenches pull them; it only biases where
   they end up.
3. **Rifts along old weak lines, about half the time** — the rift path already prefers sutures, failed rifts and rift
   margins (a lower cost); measure the share and set it near 50 %, not more (developer).
- Lab: the new 1200 Myr scene ("supercontinent cycle") beside the 600 Myr one, with a chart through time (landmass count,
  largest share, rifts) and the upwelling/downwelling shown as a layer; check-phase13 (three seeds, 1200 Myr).
- Each mechanism has its own switch (MECHANISMS) and its own seeded stream, so it can be turned off to compare.

**Definition of done**
- Lab: a chart of the landmass count and the largest landmass's share of continental crust through time; a NEW history
  scene of **at least 1200 Myr** beside the 600 Myr one, which stays for quick testing (developer, 2026-09-27: "Lets do
  at least 1200 myrs", "Add a separate long scene"; ~55 s to build at 40K with the Phase 12 steps, ~130 MB of packed
  frames); checklist items.
- Three seeds, 1200 Myr (developer: "it should start as one, then form at least 1 and then break up. if it happens twice
  that is ok"): the start world's supercontinent breaks up in a burst (≥ 3 rifts within 60 Myr) → the pieces disperse
  (largest landmass ≤ 40 % of continental crust) → they reassemble into a new supercontinent (≥ 70 %) → which breaks up
  in its turn — two breakups and one reassembly at least, a cycle of 300–700 Myr; a second full cycle is welcome.
- About half of rift length follows old sutures or belts (≥ 50 %; developer, 2026-09-27: "not having it follow it
  perfectly will help make more interesting worlds" — so not much more either).
- The reassembled supercontinent has thinness ≥ 0.5 and no enclosed sea over 3 Mkm².
- Untouched land (from Phase 10): undisturbed continental crust **≤ 25 %** at 600 Myr (30–46 % now) and the largest
  untouched patch **≤ 8 Mkm²** (10–18 now), three seeds — breakups in bursts should get there; the rift threshold
  (riftMinContinentKm2 → 1e7 helped two seeds of three) is a lever to try.
- Every suite passes, histories re-baselined with reasons.

**Status: accepted 2026-09-27 (developer: "with this pass things are looking pretty great … we are fine with phase
13")** (scene "The supercontinent cycle (1200 Myr)" in 8a / 8b). Left open, accepted as they are: the misses of
check-phase13 listed under round 3, and the full sweep of the older suites (not run — every whole-planet history changed). What was built — the three mechanisms as planned, each with its switch (MECHANISMS `mantleHeatRifts`,
`mantleFlow`) and the cycle its own stream (`rngCycle`):
1. **Heat-scaled rifting.** A continent's rift chance × (0.05 + 5 × heat⁵), heat = the mean mantle heat under its land
   (×5 on fully insulated mantle, ×1.7 at 0.8, ×0.44 at 0.6); a plume head splits one likewise. The pieces of a rift
   still over hot mantle may rift again after 5 Myr instead of 60 (`riftTenureHotMyr`; at 15 the outflow had pushed them
   off the hot mantle before they could, and one seed in three had no burst); a continent just assembled waits its full
   tenure. So the start's breakup comes in a burst (3–4 rifts within 60 Myr on five seeds of five), and rifting quiets
   once the pieces drift onto cool mantle.
2. **The mantle's flow** (step/supercontinent.js; a force in forces.js, 10–50 % of the boundary forces on a continental
   plate; out of its tension). Outward from the upwelling under the last supercontinent (its centre) × the heat still
   there × sin 2θ (0.025 per 10⁴ km² of continent) — it spreads a jammed pile of pieces, which the boundary forces alone
   did not (tried at 0.01: pieces boxed in by their neighbours re-collided within ~10 Myr, and a 3–4-plate
   "supercontinent" held 250 Myr); toward a downwelling set ~90° away × sin θ (0.005), not while the supercontinent holds
   (pulling it would slide it off its own mantle, which then never heats — rifts at heat 0.6–0.8 and a supercontinent
   held ~300 Myr) and, once it has broken up, × (1 − the heat left at the upwelling): the outflow spreads the pieces
   while that mantle is hot, the inflow gathers them as it cools (without the inflow seed 777 reached 75 % only at 1130
   Myr; at 0.006 the pieces gathered in ~200–260 Myr, at 0.004 one seed of three never did). A new supercontinent (the largest landmass ≥ 70 % of the
   continental crust for 30 Myr) moves the upwelling under itself and the downwelling to a new point 90° away; it
   counts as broken up once the largest has been under 60 % for 30 Myr (a split in two — a Laurasia and a Gondwana —
   is enough: at 50 %, a 61/39 split that gathered again to 100 % was never counted, and the mantle never moved).
3. **Rifts along weak lines about half the time:** riftWeaknessCost 0.75 → 0.9 — over 1200 Myr 45–56 % of rift length
   (0.75 gave ~70 %, late rifts 90 %+ as sutures pile up in a reassembled supercontinent). check-phase6's start-world
   check re-baselined from "> 50 % on sutures" to "≥ 30 %" (34–53 % at 0.9, by the 8 sampled paths).
- The lab: the 1200 Myr scene; the chart (largest landmass's share, landmasses ×10, the heat under the last
  supercontinent, rift ticks); a Mantle layer (heat, flow arrows) and upwelling / downwelling markers; also on the
  600 Myr scene.
- **check-phase13 (after round 2, below): 12 of 17 pass** (seeds 12345 / 777 / 4242): the start is a supercontinent;
  bursts of 4 / 4 / 5 rifts; the pieces disperse (to 22–26 %) and keep apart (no landmass holds 70 % for 30 Myr while
  they disperse); a new supercontinent at 640 / 740 / 750 Myr, one mass (88–99 % with necks under 800 km cut), held
  130–170 Myr before breaking up; rift length on old weak lines 45–54 %; switched off, the old engine; the endings.
  **Short of the targets:** the new supercontinent is one mass but embayed — thinness 0.30–0.34 (≥ 0.5) and on two seeds
  an inlet or sea of 3.3 / 9.5 Mkm² (≤ 3); untouched land at 600 Myr 21–27 % (≤ 25; 30–46 before); arc crust (as crust
  type) over 1500 km from continents 7–13 Mkm² (≤ 5) — what the terrain shows of arcs beyond 500 km from a continent fell
  from 8–12 Mkm² of land to 2–4 (seed 12345), the rest a submerged ridge; land below 400 m at 600 Myr 36.5 / 39.7 / 42.9 %
  (≥ 38 on all). Other suites run: check-phase6 21/21; check-phase8a 46/47 (the rain contrast in old belts: tropics lower
  than with erosion alike, subtropics equal — India's plateau re-baselined, above); check-phase5 23/25 and check-phase5b
  22/25 — the same failures as at the last commit (5b's two arc-collision checks; 5a's India foreland and Wilson weld),
  one different in 5b (the accreted arc joins the coast 55 % of the way; at the last commit that arc never accreted). Not
  run: 1–4, 7, 7b, 7c, 8b, 9, 10, 11, invariants, scale (developer: no full sweeps unless asked) — every whole-planet
  history changes with this phase.

**Choose your ending (built 2026-09-27, with Phase 13).** Both whole-planet scenes have an "End as" drop-down: wherever
the history has got to · a supercontinent (a Pangaea: ≥ 70 %, no rift for 30 Myr) · a supercontinent breaking up (the
first rift since it formed 15–60 Myr old: young seas, the pieces still close) · continents dispersed (broken up, the
largest ≤ 45 % — Earth today ~45 %). The history runs its length, then on (at most 1000 Myr further) until it is in that
stage, and stops at that frame (tectonics/ending.js; simulate's `stopAt`). Nothing is steered — the history is the same
one, only cut at a moment of that kind — so the lab cuts a longer run it already has instead of running again, and
check-phase13 verifies a run with an ending stops where the long run says and matches it frame for frame.

**Round 2 (2026-09-27, after the developer's first look).** Four things, all built before reporting (developer: "get
through all of them before letting me know"):
1. *"The supercontinent really shouldnt happen until like 600 [Myr] in … its ok for us to put our hand on the scale."*
   The cycle has a clock: each supercontinent draws a period of 600–720 Myr (the cycle's stream). Its pieces DISPERSE until
   150 Myr before that (and at least 150 Myr after the breakup began), then GATHER. While they disperse: each continent is
   pushed away from the others near it (`dispersalRepulsion` 0.2 per 10⁴ km², within 2000 km of the other's edge — at
   first measured from the other's centre, which put two touching big continents out of reach; not between two already in
   contact — pushed apart there, a collision ground on unwelded, check-phase6); the young oceans that
   opened between them rarely founder (`disperseFounderFactor` 0.15 — closing them is how the pieces meet); and the
   plates of a landmass that has gathered more than 45 % of the continental crust again rift ×10 after a 5 Myr tenure
   (the clump found in seed 1 was three mid-size plates pressed together, not one welded plate). While they gather: the
   downwelling's pull (0.015) holds full strength until 1500 km from it (`mantleInflowPackKm`), and rifts are ×0.2 (the
   lithosphere over a downwelling is pressed together — and a gathering that kept rifting never finished). A new
   supercontinent can only be counted in the gathering; then it is held together about its own centre, over its own
   footprint, until it first rifts, and nothing rifts on its own for 100 Myr (`superTenureMyr`): counted at first touch,
   not yet welded, it came apart within 40–80 Myr.
2. *"The supercontinents are only TECHNICALLY supercontinents, with thin strips connecting them."* Measured: several
   "100 %" supercontinents were 26–33 % once necks under 1000 km no longer joined land. The cycle now counts landmasses
   so (`cycleNeckKm` 800: land deeper than 400 km from the coast is a core; each core grows back through the land), and
   the pull keeps gathering until such a cohesive landmass holds 70 %.
3. *Land too high ("a ton of the land it above 400m").* Measured: 18–26 % of land below 400 m over 600–1200 Myr (Earth
   ~45–50 %), and not mainly old belts — 30–44 % of the continental land was in a belt active within 50 Myr (Earth's
   active orogens cover ~10–15 %): Andean belts at their 700 km cap on long-lived margins (11–16 % of the land), plateau
   belts in a reassembly (up to 23 %). Now: Andean cap 400 km, plateau cap 1000 km; uplift wears over 110 Myr (178),
   roots over 80 (135), and low ground wears at 0.75 of the reference rate (0.5; still slower than high ground — the
   developer's "really slower on lower places"). 39–45 % below 400 m at 300–900 Myr on seed 12345 (30 % right after a
   reassembly), the highest ground still 8–9 km. Quicker still (90 / 60 Myr) gave 42–46 % but wore India's young plateau
   to 0.6 km above its foreland (check-phase8a re-baselined 0.75 → 0.65 km for 110 / 80: it stands 0.70 above).
4. *Ocean–ocean arcs "forming too many islands … far from actual continental plates … getting huge unaturally."* An arc
   gained a 121 km row per 500 km of slab with no cap: ~1200 km per 100 Myr behind a fast trench; the largest arc
   landmass reached 15–16 Mkm², 8–15 Mkm² of arc crust stood 1500+ km from any continent. Now its width is capped by its
   distance from continental crust: 360 km near one (a Japan), a 240 km chain from 1200 km out (a Mariana; one 121 km
   row left arc pieces too small to dock — check-phase5b), a smooth blend between; and in the terrain an arc 1000+ km from any continent matures only to a submerged ridge (−0.7 km)
   its volcanoes break through, near one to land (+0.3 km). Largest arc landmasses 2–4 Mkm² (those near continents), far
   arc crust 1–4 Mkm².
Found and fixed on the way: one plate welded from every continent had no boundaries left, so no tension, and could never
rift — the world froze (a continent over hot mantle now has tension ≥ 0.3 × its heat: the swell stretches it); a plate
covering the whole globe had no "outside" for a rift to reach (its outer sea is then its largest ocean); and such a plate's
world ocean was taken for a sea sealed inside it and closed into land (a remnant sea is now at most 30 Mkm²).

**Round 3 (2026-09-27).** Developer: "I would like some more mountains … it makes the world seem a bit too flat. Plus we
are going to erode still … like 40% usually is a sweeter spot" — with the crust budget balanced (below) the continents
carry more belts, and erosion at 100 / 70 Myr (the floor 0.75) gives 32–41 % below 400 m before the rivers carve (a
reassembly's frames the most mountainous; 130 / 100 gave 28–37 %); and "the overall landmass is faily low overall. Seems like we are decreasing over time … keep it at
least closer to flat". Measured: continental crust 148 → 110–125 Mkm² over 1200 Myr (three seeds), land above sea level
27.9 → 25.0 % (seed 12345) — and not Phase 13's doing (with its mechanisms off: 148 → 120). The sink was continental
underthrusting at collisions (55–73 Mkm²); gains were only seas closing (+13–22) and arcs, which stayed arcs for ever.
Now: accreted arcs become continent (step/arc-maturation.js: arc crust touching its plate's continental crust and 100+ Myr
old turns continental, its front advancing 3 km/Myr — how continents grow), smaller arc pieces dock (arcAccreteMinKm2
6e4 → 3e4: arcs capped in width came in smaller pieces and sank), and underthrustShare 0.8 → 0.25 (a collision's
consumption mostly goes by the overlap cap regardless; 0.4 hardly changed the total): continental crust 133 / 153 / 165
Mkm² at 1200 Myr (−10 to +11 %), land above sea level 27.9 → 27.8 → 27.5 % (seed 12345). India's plateau stands 1.08 km
above its foreland (was 0.70 with the quicker erosion; the check's 0.75 margin restored).
And (developer) "rifts are forming on way too straight lines. Then should curve a bit and be jagged … it looks like a bunch
of rectangle continents": a rift took the cheapest path over ground that cost the same everywhere — a straight cut. Now
the crust has a grain (ops/rift-path.js): a smooth field fixed in each plate's own frame scales the cost of breaking
ground, ±0.9 over ~1500 km (a rift bends) and ±0.4 over ~350 km (it is jagged) — at ±0.5 a detour hardly paid for its
length and the cuts stayed straight. The pieces keep their parent's grain, so later rifts on the same crust follow the
same fabric. With the grain competing, old sutures are preferred a little more (riftWeaknessCost 0.9 → 0.8) to keep
about half the rift length on them. And two plates whose land rings a big sea — kept apart since Phase 11 so the sea can
close — now weld round it once locked together sutureLockMaxMyr (120): held apart for good they ground on without end, and
gathering pieces left a sea inside the new supercontinent (7.8 Mkm²); welded, the sea is sealed inside one plate and
closes from its shores. check-phase13 after round 3: 14 of 18 — short: seed 777's supercontinent at 820 Myr (≤ 800),
thinness 0.45 / 0.47 on two seeds (0.86 on the third), one 8.6 Mkm² untouched patch, and one seed's open-ocean arcs
(13.7 Mkm² of arc crust far out, a submerged ridge in the terrain). check-phase6 21/21 (the start world's rifts follow
sutures ≥ 15 % now that the grain competes; a pair may wait up to sutureLockMaxMyr for its seam); check-phase8a 46/47
(the rain contrast in old belts, marginal); check-phase7c 18/19 (land grows 4.5 % over 1000 Myr, 5 % asked).

## After phase 13: the full planet

V2 in the real app: projection to V1's render mesh, V1's erosion and climate (wind, currents, Köppen) on V2 terrain,
the app UI, planet codes, export, mobile — and speed (the history's time; showing the world as it evolves). V1 stays
beside it, with its plate editing.

## Parked

- Heights feeding the history — a height ceiling that turns into width (plateaus), belt shape by climate (critical
  taper), wider Andean belts. Not critical (developer).
- Sediment from the history's rivers deciding which margins accrete and which erode.
