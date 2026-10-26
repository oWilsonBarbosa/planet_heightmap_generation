// Print collision records, events and belt statistics through a scene with the event rules on.
// Usage: node v2/tools/trace-collisions.mjs [sceneId] [untilMyr] [configKey=value …]
//        sceneId: any scene of scenarios/*-scenes.js (a scene's own motion is used if it has one, else the force model)
import { labMesh, LAB_MESH_SEED } from './lib/check-kit.mjs';
import { FORCE_SCENES } from '../js/tectonics/scenarios/force-scenes.js';
import { EVENT_SCENES } from '../js/tectonics/scenarios/event-scenes.js';
import { RIFT_SCENES } from '../js/tectonics/scenarios/rift-scenes.js';
import { HOTSPOT_SCENES } from '../js/tectonics/scenarios/hotspot-scenes.js';
import { MARGIN_SCENES } from '../js/tectonics/scenarios/margin-scenes.js';
import { OROGENY_NAME } from '../js/view/palettes.js';
import { simulate } from '../js/tectonics/simulate.js';
import { updatePlateMotion } from '../js/tectonics/step/torque-balance.js';
import { frameTallies } from '../js/tectonics/measure.js';
import { CrustType } from '../js/tectonics/model/crust.js';

const id = process.argv[2] ?? 'india', until = Number(process.argv[3] ?? 0);
const over = Object.fromEntries(process.argv.slice(4).map(a => a.split('=')).map(([k, v]) => [k, +v]));
const scenes = [...FORCE_SCENES, ...EVENT_SCENES, ...RIFT_SCENES, ...HOTSPOT_SCENES, ...MARGIN_SCENES], scene = scenes.find(s => s.id === id);
if (!scene) { console.error(`unknown scene "${id}"; one of: ${[...new Set(scenes.map(s => s.id))].join(', ')}`); process.exit(1); }
const mesh = labMesh(), world = scene.build(mesh, LAB_MESH_SEED);
Object.assign(world.config, over);
const t0 = Date.now();
const { frames, steps } = simulate(world, { untilMyr: until || scene.maxMyr, drive: scene.drive ? w => scene.drive(w) : updatePlateMotion, snapshotEveryMyr: 2 });
console.log(`${steps} steps in ${Date.now() - t0} ms`);
for (const f of frames) {
    if (Math.round(f.time) % 10 !== 0) continue;
    const t = frameTallies(f), belts = {};
    let thick = 0, thickMax = 0;
    let arcCells = 0;
    for (let w = 0; w < f.owner.length; w++) { if (f.owner[w] >= 0 && f.type[w] === CrustType.ARC) arcCells++; if (f.oroType[w]) belts[OROGENY_NAME[f.oroType[w]]] = (belts[OROGENY_NAME[f.oroType[w]]] ?? 0) + 1; if (f.thickKm[w] > 0) { thick++; thickMax = Math.max(thickMax, f.thickKm[w]); } }
    const plates = f.plates.filter(p => !p.isBackground && p.alive).map(p => `${p.name} ${p.speedCmYr.toFixed(2)}`).join(' | ');
    console.log(`${String(f.time).padStart(4)} gaps ${t.gaps} coll ${t.collision} land ${t.land} | ${plates} | belts ${JSON.stringify(belts)} thick>0: ${thick} max ${thickMax.toFixed(1)} km | arc cells ${arcCells}`);
}
for (const [k, r] of world.collisions) console.log('collision', k, JSON.stringify(r));
for (const e of world.events) console.log(`${e.time.toFixed(1)} Myr  ${e.kind}: ${e.text}  ${JSON.stringify(e.data)}`);
