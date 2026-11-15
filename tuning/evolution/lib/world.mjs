/**
 * One Evolution world for the checks: its history to the moment, as the page runs it (its scene 'cycle', from its
 * start), cached under tuning/evolution/data/ (gitignored) per seed, continental share, plates and length — the history
 * is the tectonics, which a change to the finish or the climate does not touch — and its finish (Add detail), as the
 * page's worker runs it, with the page's default climate options.
 */

import fs from 'node:fs';
import path from 'node:path';
import v8 from 'node:v8';
import { fileURLToPath } from 'node:url';
import Delaunator from 'delaunator';
import { setDelaunator } from '../../../js/sphere-mesh.js';
import { buildSimMesh } from '../../../v2/js/core/sim-mesh.js';
import { runHistory } from '../../../v2/js/app/history-runner.js';
import { TERRAIN_SCENES } from '../../../v2/js/tectonics/scenarios/terrain-scenes.js';
import { TerrainPool, FRAME_FIELDS } from '../../../v2/js/terrain/terrain-pool.js';
import { finishPlanet } from '../../../v2/js/finish/finish.js';

const MESH_SEED = 12345;                                  // the page's: every planet's sim mesh is the same
const DATA = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
setDelaunator(Delaunator);

/** The world's frame at `time` Myr (seed, continental share in %, plate cells), from the cache or built and cached. */
export async function worldFrame({ seed, cont, sim, time, log = () => {} }) {
    fs.mkdirSync(DATA, { recursive: true });
    const frameFile = path.join(DATA, `frame-${seed}-${cont}-${sim}-${time}.bin`);
    if (fs.existsSync(frameFile)) return v8.deserialize(fs.readFileSync(frameFile)).frame;
    const scene = TERRAIN_SCENES.find(s => s.id === 'cycle');
    let last = 0, frame = null;
    await runHistory({ list: 'terrain', scene, ending: 'none', start: { continentalFraction: cont / 100 }, lengthMyr: Math.ceil((time + 10) / 10) * 10, keep: false },
        buildSimMesh(sim, MESH_SEED), seed, 10, () => {}, f => {
            if (f.time - last >= 100) { last = f.time; log(`history ${f.time} Myr`); }
            if (Math.abs(f.time - time) < 1e-6) { frame = Object.fromEntries(FRAME_FIELDS.map(k => [k, f[k]])); frame.plates = f.plates.map(p => p && { quat: p.quat }); }
        });
    if (!frame) throw new Error(`no frame at ${time} Myr`);
    fs.writeFileSync(frameFile, v8.serialize({ frame }));
    return frame;
}

/** The world finished at `cells` (Add detail) with the finish's constants F; `network`: also its drainage network. */
export async function finishWorld({ frame, seed, sim, cells, F, network = false }) {
    const simMesh = buildSimMesh(sim, MESH_SEED), pool = await TerrainPool.create(simMesh);
    return finishPlanet({ frame, simMesh, seed, cells, pool, closePool: true, F, network, climateOptions: { greenhouseWm2: 0, precipScale: 1 } });
}
