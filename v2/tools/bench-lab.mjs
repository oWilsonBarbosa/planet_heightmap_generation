// Benchmark of what the live terrain lab does, piece by piece, on one thread — to find where the time goes before
// optimising. For the whole-planet history: the history itself, then for one frame at the given terrain resolution the
// terrain surface (records, sampling, surface), the carving, and the work the page does on its own thread when it shows
// a frame (hillshade, hypsometry). Prints hashes of every output, so an optimisation can prove it changed nothing.
// Usage: node v2/tools/bench-lab.mjs [cells=2500000] [timeMyr=600] [seed=12345]

import { createHash } from 'node:crypto';
import { labMesh } from './lib/check-kit.mjs';
import { simulate } from '../js/tectonics/simulate.js';
import { TERRAIN_SCENES } from '../js/tectonics/scenarios/terrain-scenes.js';
import { terrainMesh, sampleOnto } from '../js/terrain/terrain-mesh.js';
import { synthesizeTerrain, hypsometry } from '../js/terrain/synthesize.js';
import { terrainConfig } from '../js/terrain/terrain-config.js';
import { hillshade } from '../js/view/terrain-shade.js';

const [cells = '2500000', until = '600', seed = '12345'] = process.argv.slice(2);
const hash = a => createHash('md5').update(new Uint8Array(a.buffer, a.byteOffset, a.byteLength)).digest('hex').slice(0, 12);
const time = (label, fn) => { const t = performance.now(), r = fn(); console.log(`${label.padEnd(34)} ${((performance.now() - t) / 1000).toFixed(2)} s`); return r; };

const mesh = labMesh(), scene = TERRAIN_SCENES.find(s => s.id === 'history');
const frames = time(`history ${until} Myr (every 10 Myr)`, () => simulate(scene.build(mesh, Number(seed)), { untilMyr: Number(until), drive: w => scene.drive(w), snapshotEveryMyr: 10 }).frames);
const F = frames.at(-1), cfg = terrainConfig();
const tm = time(`terrain mesh ${cells}`, () => terrainMesh(Number(cells)));
const S = time('sampling (once per mesh)', () => sampleOnto(mesh, tm, cfg, Number(seed)));
const T = time('terrain surface (+ carving)', () => synthesizeTerrain(F, mesh, tm, { seed: Number(seed), sampler: S, parts: true, carve: true }));
console.log(`   of which: ${Object.entries(T.ms ?? {}).map(([k, v]) => `${k} ${(v / 1000).toFixed(2)} s`).join(', ')}`);
const shade = time('page: hillshade', () => hillshade(tm, T.heightKm, { exaggeration: 20, seaLevelKm: 0 }));
const hy = time('page: hypsometry', () => hypsometry(T.heightKm, 0));
console.log(`hashes — heights ${hash(T.heightKm)} · tectonic ${hash(T.tectonicKm)} · drainage ${hash(T.drainage)} · shade ${hash(shade)} · land ${hy.landShare.toFixed(6)}`);
