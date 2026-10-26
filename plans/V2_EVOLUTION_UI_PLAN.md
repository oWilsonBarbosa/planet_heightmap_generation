# Evolution: a page that says what to do next — UI plan

The developer (2026-10-13): *"the ui on the v2 'evolution' page is a bit too sparse and confusing. It isn't intuitive
what a user should be doing and interacting with."*

Built 2026-10-13 (`evolution.html`, `v2/evolution.css`, `v2/js/evolution/evolution-main.js`); where the build differs
from the first draft below, it says so.

Decided with the developer (2026-10-13), after a round of questions and an adversarial pass against CLAUDE.md:
- **Who it's for: explore, then commit.** Watch and scrub a history first, then turn one moment into a detailed world.
- **No numbered steps.** The workflow loops (scrub, add detail, scrub again, extend), so a wizard's "current step" lies.
  Instead **one context card** always shows the single next action for what is on screen.
- **The page builds on load**, like Generate, with a **first-run tutorial** over it (and a **?** to reopen it).
- **"Finish" is shown as "Add detail"**; the globe says **Preview** or **Detailed**. (The code keeps `finish`.)
- **One detailed moment at a time.** Adding detail to another moment replaces it — and the card says so, above the button (first drafted as a "Replace 900 Myr" button; the developer: the wording on the timeline was "confusing since it's unclear what it DOES"). The button always says what it does: Add detail.
- **The timeline is for time.** Live goes; Keep going moves to the card; Add detail sits beside the timeline *and* in the
  card (the developer: "I intuitively expected it to be there too").
- **A Quality preset** (Fast / Balanced / Best / Custom) for the simulation; the **detail level** stays separate, next to
  Add detail, since it is built on top of the simulation.
- **Preview climate stays** (on demand, ~1 s, when paused on the Climate tab). Climate *across* the history, and a
  Satellite view of previews, are follow-ups — both would slow the already slow steps.

## What's wrong today

- **The sidebar is empty, then a junk drawer.** New World, one line of how-to, then one *Settings* fold that mixes the
  world (seed, size, length, ending), three different resolutions (Plates, Terrain Detail, Finish Detail), the map
  display, playback speed and stats.
- **"Finish" doesn't say what it does.** Nothing on screen tells a preview from a finished moment, so it isn't clear
  that the timeline shows rough previews and Finish makes one of them the real, detailed world.
- **The timeline is crowded** — Play, scrubber, time, Live, Keep going, Finish, Export — and buttons come and go
  without saying why. "Live" also suggests the newest moment matters; it doesn't. All we mean is that more time has
  been computed and can be scrubbed through.
- **The instructions live in `#info`**, a line of small text the eye doesn't go to.

## The page

```
┌─ Sidebar ─────────────────────────┐
│ World Orogen · Evolution      ? « │
│ ┌ World ────────────────────────┐ │   folded to one line once a history is building:
│ │ Seed 4821 · 30% · 1200 Myr ▸  │ │   "Seed 4821 · 30% · 1200 Myr · Balanced"  [New World]
│ │ [New World]                   │ │
│ └───────────────────────────────┘ │
│ ┌ (context card) ───────────────┐ │
│ │ 640 Myr · Preview             │ │
│ │ Adding detail sculpts this    │ │
│ │ moment again: rivers, lakes,  │ │
│ │ glaciers, its own climate,    │ │
│ │ Satellite view, export.       │ │
│ │ Detail [2.5M cells · 15 km ▾] │ │
│ │ [      Add detail       ]     │ │
│ └───────────────────────────────┘ │
│ ▸ View                            │
│ GitHub                            │
└───────────────────────────────────┘
       Terrain · Satellite🔒 · Climate · Heightmap · Plates          [Preview]
                               (globe)
 ▶ ━━━━━━━━━━●━━━━━━░░░░░░░░░░░░   640 Myr                 [ Add detail ]
```

### World section (top of the sidebar)

- **New World** (new seed, these settings) — *as built*, a quieter button than V1's: the card's button is the one bright
  one.
- **Seed**, **Starting Continent Size**, **History Length**, **End As** — as today.
- **Quality**: *Fast* · *Balanced* · *Best* · *Custom*, the simulation's resolution in one choice:

  | Preset   | Plates            | Terrain Detail (while watching) |
  |----------|-------------------|---------------------------------|
  | Fast     | 20K · 172 km      | 160K · 61 km                    |
  | Balanced | 40K · 121 km      | 160K · 61 km (today's default)  |
  | Best     | 80K · 86 km       | 640K · 30 km                    |
  | Custom   | any (adds 160K)   | any (adds 2.5M)                 |

  *Custom* reveals the two drop-downs. A link (`?sim=…&terrain=…`) that matches a preset shows the preset, otherwise
  Custom. Phones default to Fast (today they force 20K plates). Terrain Detail still redraws the same history at once
  when changed — no rebuild — so changing it never asks for **Build this world**.
- **Build this world** — rebuild with this seed and these settings (today's *Build This World*).
- Once a history is building, the section **folds to one summary line** with New World beside it; open it to change
  anything.

### The context card

One card, under the World section, whose text and main button follow what is on screen. Its main button is **also
shown beside the timeline**, so the action is next to the decision; the card is where it's explained.

| On screen | Card | Main button |
|---|---|---|
| History computing, playing | "Computing the history — scrub through any of it as it fills in. Pause on a moment you like, then add detail." | **Add detail** (pauses first) |
| History done, playing | "Pause on a moment you like, then add detail." | **Add detail** |
| Paused on a preview | "640 Myr · Preview", what detail adds (rivers, lakes, glaciers, its own climate, the Satellite view, export), the **Detail** drop-down | **Add detail** |
| Paused on a preview, another moment detailed | as above, plus, above the button, "Replaces the detailed 900 Myr — one moment is kept in detail. Go to 900 Myr" | **Add detail** |
| Adding detail | the stage and progress bar | **Cancel · 42 %** |
| On the detailed moment | "640 Myr · Detailed", **Rivers & Lakes**, **Colour by Regime**, **River Density** | **Export** (+ a quiet "Add detail again at 10M" when the drop-down differs) |
| At the end of the history (any of the above) | adds **Extend history** | — (a secondary button) |

- *As built*: the button is there while playing too — the timeline's button would otherwise come and go, and the track
  jump; pressing it pauses on the moment shown, as Finish did.
- **Detail** drop-down: 160K · 640K · 2.5M (default) · 10M (~1 min); phones up to 640K, as now.
- **Replacing**: the old detailed moment stays until the new one is done, so cancelling loses nothing; then it goes.
  `FINISH_BUDGET` today evicts *before* the new finish starts (`evolution-main.js` ~l.503) — change it to keep one, and
  drop the old one on success. The budget already holds two at 10M on a desktop (2 × ~320 MB = 640 MB) and on a phone.
- **"Detailed: 900 Myr — go to it"** stays in the card wherever the timeline is, so the detailed moment is never lost.
- **Extend history** is today's *Keep going* (`updateGoUi`): it runs the history on in 20 Myr pieces until pressed again
  (**Stop extending**), up to `HISTORY_BYTES`. Shown once the history has reached its end, as today.
- Errors and notes (`finishNote`, climate failures) show in the card, not in `#info`.

### Timeline (bottom)

- **Play/pause**, the **scrubber**, the **time label** — and the context card's main button on the right
  (Add detail / Cancel / Export), nothing else.
- **Live goes.** The rail shades the time computed so far, like a video's buffered bar: scrub anywhere inside it;
  playback waits at its edge until more is computed. Nothing marks "the newest moment" as special.
- The playing-while-building behaviour stays (watching it build is playing it from the start).

### On the globe

- A **Preview** / **Detailed** badge — *as built*, on the timeline beside the time and in the card's heading (by the
  layer bar it competed with the tabs, and on a phone with the layer switch). The detailed moment's shows its detail
  ("Detailed · 2.5M").
- **Layer tabs**: Terrain, Heightmap, Plates — always. **Climate** — on paused previews (worked out on demand, as now,
  and labelled "Preview climate" in its legend) and on the detailed moment (its own climate). **Satellite** — shown
  with a lock on previews; choosing it explains that it comes with Add detail and offers the button (today's chip,
  reworded). While playing, Climate keeps today's "Pause on a moment to see its climate".

### View fold (bottom of the sidebar, closed by default)

Terrain Colours · Globe/Map (+ Center Longitude) · Grid Lines (+ Spacing) · Auto-Rotate · Playback Speed · Stats.
Rivers & Lakes, Colour by Regime and River Density are not here — they live in the card, on the detailed moment.

### First-run tutorial

The Generate page's tutorial pattern (`js/main.js`, `#tutorialOverlay`, a `localStorage` flag; its own key for this
page) over a history that is already building. Steps, short:
1. **A planet's history** — a supercontinent breaks up, oceans open and close, continents gather again.
2. **Scrub the timeline** — every moment is a preview you can stop on; the shaded rail is what's computed so far.
3. **Add detail** — turns the moment shown into a detailed world: rivers, lakes, glaciers, climate, Satellite view.
   One at a time.
4. **Look around and export** — layers, Climate, Satellite; Export saves heightmaps and the colour map.
5. **Steer it** — seed, continent size, length, ending, Quality; Extend history to run on.

The UI must make sense without it: the card and the badge carry the same message.

### Mobile (≤ 768 px)

- The collapsed bottom sheet shows the **context card's main button** (and its one-line state) — swipe up for the World
  section, the full card and View. The timeline's copy of the button stays too; if both don't fit, the timeline's wins
  and the sheet shows the state line only.
- All new buttons ≥ 44 px; the badge must not collide with the layer switch (`#mobileViewSwitch`) or the timeline.
- Touch hint text (`IS_TOUCH` in `evolution-main.js`) moves into the card's text.

## Against CLAUDE.md's "What Users Love"

- **Climate depth** — kept: preview climate on demand and the detailed moment's own climate, unchanged.
- **Instant, zero-friction** — kept: the page still builds on load; the tutorial sits over a moving planet.
- **Customizability** — every way to steer stays: seed, sliders, ending, Extend history (Keep going), the timeline and
  the detail level. Plates and Terrain Detail move under Quality → Custom, not away.
- **True globe** — unchanged.
- **Mobile** — the sheet gets *more* useful (the next action without opening it).
- **Terrain aesthetics** — unchanged; no pipeline change.

Tradeoff: one detailed moment at a time is a step back for anyone comparing two finished moments today (the page now
keeps several within a budget). Accepted for clarity and phone memory; see follow-ups.

## Order of work

1. **Markup and styles** (`evolution.html`, `v2/evolution.css`): World section with Quality, context card, View fold,
   Preview/Detailed badge, slim timeline; remove `#liveBtn`, `#moreBtn`, `#finishInfo`, the `.evo-howto` line.
2. **State → card** (`evolution-main.js`): one `updateCard()` from the states above, replacing the scattered
   `updateFinishUi` / `updateGoUi` / `#info` text; the timeline's button mirrors it.
3. **One detailed moment**: replace-on-success instead of evict-first; "go to it" link.
4. **Quality preset** ↔ the two drop-downs and the URL.
5. **Layer tabs**: Satellite lock + chip wording; "Preview climate" legend label.
6. **Tutorial** + **?** button.
7. **Mobile pass**: sheet's collapsed content, touch targets, badge placement.
8. **Docs**: README (Evolution controls), `v2/README.md`, `evolution.html` meta description if needed, `llms.txt` if
   the page is described there; ask about a What's New entry.

## Follow-ups (not in this change)

- **Climate across the history** — while playing; needs a cheaper climate or a precomputed coarse one per snapshot.
- **Satellite for previews** — a cheap look from the preview's climate.
- **Editing a moment of the history** (plates, directions) — the customizability rule's next step; the World section
  or the card is its home.
- **Detailed moments that survive** a reload or a shared link (their times in the URL, rebuilt on load).
- **More than one detailed moment** once memory is measured on phones — with a word for the list (not "snapshots": the
  code's `SNAPSHOT_MYR` frames are already that).
- **Timeline events** (breakups, collisions, supercontinents) as markers worth stopping on.
