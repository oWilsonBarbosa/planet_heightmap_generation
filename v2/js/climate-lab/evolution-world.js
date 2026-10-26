// An Evolution world for the climate lab and its checks: the whole-planet history of the V2 engine (600 Myr with every
// rule on — the V2 lab's "A whole planet" scene — or run on until it ends in a stage of the supercontinent cycle), and
// its last frame's terrain on a terrain mesh of the chosen size: heights in km with the sea at 0, z north. DOM-free;
// the caller must have handed V1's sphere-mesh its Delaunator (setDelaunator).

import { buildSimMesh } from '../core/sim-mesh.js';
import { TECTONICS } from '../tectonics/config.js';
import { simulate } from '../tectonics/simulate.js';
import { historyEnding } from '../tectonics/ending.js';
import { TERRAIN_SCENES } from '../tectonics/scenarios/terrain-scenes.js';
import { terrainMesh, sampleOnto } from '../terrain/terrain-mesh.js';
import { synthesizeTerrain } from '../terrain/synthesize.js';
import { terrainConfig } from '../terrain/terrain-config.js';

const SIM_MESH_SEED = 12345;          // the V2 lab's sim mesh (v2/js/app/lab-main.js MESH_SEED)

/**
 * @param {{seed?: number, ending?: 'none'|'supercontinent'|'breakup'|'dispersed', cells?: number}} opts
 * @returns {{xyz: Float32Array, heightKm: Float32Array, terrain: Object, timeMyr: number, reachedEnding: boolean,
 *           landShare: number, ms: {history: number, terrain: number}}}
 */
export function evolutionWorld({ seed = 12345, ending = 'none', cells = 160000 } = {}) {
    let t = performance.now();
    const mesh = buildSimMesh(TECTONICS.simCells, SIM_MESH_SEED);
    const scene = TERRAIN_SCENES.find(s => s.id === 'history');
    const world = scene.build(mesh, seed);
    world.config.heights = terrainConfig();
    const { untilMyr, stopAt } = historyEnding(scene.maxMyr, ending, world.config);
    const run = simulate(world, { untilMyr, stopAt, drive: w => scene.drive(w), snapshotEveryMyr: 10 });
    const frame = run.frames.at(-1);
    const historyMs = performance.now() - t;
    t = performance.now();
    const tm = terrainMesh(cells);
    const sampler = sampleOnto(mesh, tm, terrainConfig(), seed);
    const { heightKm } = synthesizeTerrain(frame, mesh, tm, { seed, sampler, carve: true });
    let land = 0;
    for (let i = 0; i < heightKm.length; i++) if (heightKm[i] > 0) land++;
    return { xyz: tm.xyz, heightKm, terrain: tm, timeMyr: frame.time, reachedEnding: !!run.stopped, landShare: land / heightKm.length,
        ms: { history: historyMs, terrain: performance.now() - t } };
}
