// Debug helper: run a test scene headlessly and write equirectangular PNG frames to v2/out/.
// Usage: node v2/tools/render-frames.mjs [scene] [layer] [everyNthFrame] [events=0|1]
//        scene = wilson2 (the prescribed Phase 2 cycle, default) or any scene of scenarios/*-scenes.js (the first of
//        that id: "history" is the hotspot one); layer = age | plates | type | orogeny | thickness | weakness |
//        volcanism | heat | margins

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { labMesh, LAB_MESH_SEED } from './lib/check-kit.mjs';
import { buildWilsonWorld, driveWilson, WILSON_MAX_MYR } from '../js/tectonics/scenarios/wilson-cycle.js';
import { FORCE_SCENES } from '../js/tectonics/scenarios/force-scenes.js';
import { EVENT_SCENES } from '../js/tectonics/scenarios/event-scenes.js';
import { RIFT_SCENES } from '../js/tectonics/scenarios/rift-scenes.js';
import { HOTSPOT_SCENES } from '../js/tectonics/scenarios/hotspot-scenes.js';
import { MARGIN_SCENES } from '../js/tectonics/scenarios/margin-scenes.js';
import { updatePlateMotion } from '../js/tectonics/step/torque-balance.js';
import { simulate } from '../js/tectonics/simulate.js';
import { MapRaster } from '../js/view/map-raster.js';
import { colorByCrustAge, colorByPlate, colorByCrustType, colorByOrogeny, colorByThickness, colorByWeakness, colorByVolcanism, colorByMantleHeat, colorByMargin, overlayOverlaps, overlayBoundaries } from '../js/view/palettes.js';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'out');
fs.mkdirSync(OUT, { recursive: true });
const sceneId = process.argv[2] || 'wilson2', layer = process.argv[3] || 'age', every = Number(process.argv[4] || 4);
const paint = { age: colorByCrustAge, plates: colorByPlate, type: colorByCrustType, orogeny: colorByOrogeny, thickness: colorByThickness, weakness: colorByWeakness, volcanism: colorByVolcanism, heat: colorByMantleHeat, margins: colorByMargin }[layer];
const events = (process.argv[5] ?? '1') !== '0';
const allScenes = [...FORCE_SCENES, ...EVENT_SCENES, ...RIFT_SCENES, ...HOTSPOT_SCENES, ...MARGIN_SCENES];
const forceScene = allScenes.find(s => s.id === sceneId);
if (!paint || (!forceScene && sceneId !== 'wilson2')) {
    console.error(`usage: node v2/tools/render-frames.mjs [wilson2|${[...new Set(allScenes.map(s => s.id))].join('|')}] [age|plates|type|orogeny|thickness|weakness|volcanism|heat|margins] [everyNthFrame] [events=0|1]`);
    process.exit(1);
}

const mesh = labMesh();
const world = forceScene ? forceScene.build(mesh, LAB_MESH_SEED) : buildWilsonWorld(mesh, LAB_MESH_SEED);
const started = performance.now();
const { frames, steps } = simulate(world, { untilMyr: forceScene ? forceScene.maxMyr : WILSON_MAX_MYR, drive: forceScene ? (forceScene.drive ? w => forceScene.drive(w) : updatePlateMotion) : driveWilson, snapshotEveryMyr: 2, events });
console.log(`${steps} steps, ${frames.length} frames in ${(performance.now() - started).toFixed(0)} ms; budget`, world.budget);

const raster = new MapRaster(mesh, 1024), rgb = new Uint8Array(mesh.numCells * 3);
frames.forEach((frame, i) => {
    if (i % every && i !== frames.length - 1) return;
    paint(frame, rgb); overlayOverlaps(frame, rgb); overlayBoundaries(frame, rgb);
    const png = new PNG({ width: raster.width, height: raster.height });
    raster.paint(rgb, png.data);
    const name = `${sceneId}_${layer}_t${String(Math.round(frame.time)).padStart(3, '0')}.png`;
    fs.writeFileSync(path.join(OUT, name), PNG.sync.write(png));
});
console.log(`PNGs written to ${OUT}`);
