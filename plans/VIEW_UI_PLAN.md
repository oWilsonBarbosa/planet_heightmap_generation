# One view layout on every page — plan

Draft, 2026-10-24. Branch: a new `view-ui`, from `fast-follows`, so it carries the matched climate colours.

## What the developer asked for

- Unify the view UI on Evolution's layout: "left mostly for tweaks, top for what map mode".
- Move the terrain options and the globe/map options out of the sidebar as well.

**Decisions (2026-10-24):**
- **The view settings:** a second strip, always visible, under the layer bar.
- **Generate's debug layers:** kept as an Inspect list in the sidebar, folded.
- **Show Plates:** becomes a **Plates** tab, as in Evolution.
- **Scope:** all three pages.

## The layout

```
[Terrain][Satellite][Climate][Heightmap][Plates]
   └ Köppen · Temperature · Rain · Wind · Currents · More… · Year ▾      (Climate's sub-bar, as Evolution's)
[Globe|Map]  Projection ▾  Centre ──●──  ☐ Rotate  ☑ Grid 30°▾  Colours ▾  ☑ Shade  ☑ Rivers
```

The sidebar keeps only what builds the world:
- **Generate:**
  - Shape Your World (sliders, Build, the code);
  - Terrain Sculpting;
  - Climate;
  - a folded **Inspect (advanced)**: the 27 geology and plate-physics layers, Full Heightmap, Erosion Delta and Wireframe;
  - Stats and Export.
- **Import:**
  - the image, Detail, Import;
  - Terrain Sculpting;
  - Climate;
  - a folded **Inspect (advanced)**: Full Heightmap, Erosion Delta and Wireframe;
  - Stats and Export.
- **Evolution:** New World, World, Detail, Stats. Its View section empties into the strip. Playback Speed moves onto the timeline beside Play.

**The strip shows only what applies:**

| Control | When it shows |
|---|---|
| Globe / Map | always |
| Projection | in Map, on Evolution only: Generate's and Import's map views are equirectangular today; giving them projections is separate work |
| Centre longitude | in Map |
| Auto-rotate | on the Globe |
| Grid lines, spacing | always |
| Terrain Colours, Hillshade | Evolution only (Generate and Import have one terrain palette and no hillshade) |
| Rivers & Lakes, Colour by Regime, River Density | Evolution's detailed moments, as now |

**Phones (≤ 768 px):**
- The layer bar becomes one layer list, as Evolution's phone layout already has, with the climate maps in groups.
- An always-on second row would cover the planet, so the strip's controls sit at the top of the bottom sheet instead. Every control keeps a ≥ 44 px touch target.

**Plates on Generate:**
- The tab shows the plate colours (today's Show Plates).
- Ctrl-click and edit-mode plate editing keep working in every view, as now.
- Import has no Plates tab: its plates are only the land and sea masses.

## Phases

- **V1: the layer bar on Generate and Import.**
  - Evolution's tabs and Climate sub-bar, the Plates tab, the phone layer list.
  - Their sidebars lose the map tabs and the season; the folded Inspect (advanced) holds the rest.
  - **Verify:**
    - every layer is reachable;
    - the season picker follows the Climate maps;
    - plate editing works on the globe and the map, on desktop and in phone emulation;
    - the export panel is unchanged;
    - no console errors.
- **V2: the view strip on all three pages.**
  - Globe/Map, centre, rotate, grid; Evolution's colours, hillshade and rivers; Playback Speed to the timeline.
  - Evolution's sidebar View section goes.
  - **Verify:**
    - each control does what it did;
    - the strip changes with Globe and Map;
    - the phone sheet holds the controls at 44 px;
    - links that carry view settings still open the same way.
- **V3: words.**
  - README, the three tutorials and v2/README.
  - What's New: ask first.

Each phase stops for the developer to check it in the browser before the next.

## Status (2026-10-24)

**V1–V3 built in one go** ("no stopping do all of them"; What's New left alone).

**Code:**
- `js/layer-bar.js`: Generate and Import.
- `js/view-strip.js`: all three pages.
- Shared styles in `styles.css` (`.layer-bar`, `.layer-subbar`, `.view-strip`, `.legend-card`); Evolution's own offsets in
  `v2/evolution.css`.
- Show Plates is `state.showPlates` now, set by the Plates tab.

**Checked in Chrome:**
- **Generate:**
  - every tab, Climate's row (it reopens on the last climate map), More…, the season;
  - Plates, with a Ctrl-click marking a plate (Rebuild (1));
  - the Inspect list lighting no tab;
  - Map mode with Centre in place of Auto-Rotate.
- **Import:** the same, minus Plates; the Full Heightmap in Inspect.
- **Evolution:**
  - Map mode with Projection and its options (Orthographic's centre latitude and hemispheres), and Centre;
  - the rivers' controls on a detailed moment;
  - colours, hillshade and playback speed on the timeline.
- **All three:** no console errors on load.
- **At 398 px wide (each page in a phone-width frame):**
  - the layer list at the top, the season under it, the legend card under that;
  - the strip at the top of the bottom sheet, every control ≥ 44 px.

**Not checked:** a real phone, Firefox and Safari.
