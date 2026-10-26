// Runs one scene's whole history off the page's thread and streams its frames back as they are recorded, packed (the
// page stays responsive, can show how far it has got, and holds a long history in a third of the memory). Same code, same inputs: the same history as on the page.
// It keeps its world afterwards: {type: 'more', untilMyr} runs the history on from where it stopped (simulate's resume —
// the same history as one long run) and streams those frames too, then answers {type: 'more-done'} (Evolution's "Keep going").
// Where it can start workers of its own, a few helpers (app/helper-pool.js) take the pieces of the work that do not depend
// on one another — the start world's layout attempts, each rift's junctions — side by side: the same history, sooner.

import { simulate, simulateAsync } from '../tectonics/simulate.js';
import { TERRAIN_SCENES } from '../tectonics/scenarios/terrain-scenes.js';
import { meshFromArrays } from '../core/sim-mesh.js';
import { terrainConfig } from '../terrain/terrain-config.js';
import { packFrame } from '../tectonics/frame-pack.js';
import { historyEnding } from '../tectonics/ending.js';
import { HelperPool } from './helper-pool.js';

const SCENE_LISTS = { terrain: TERRAIN_SCENES };

let kept = null;                  // { world, scene, snapshotEveryMyr }: the history run, to run on from
let packMs = 0;
let helpers = null;               // the helper pool, once made (null where a worker cannot start workers of its own)
let small = false;                // a phone or small device (the page's core/device.js): the helpers go once a run is done
// (packed: a whole history's frames are mostly zeros — tectonics/frame-pack.js)
const send = frame => { const t = performance.now(), { packed, transfer } = packFrame(frame); packMs += performance.now() - t; self.postMessage({ type: 'frame', frame: packed }, transfer); };
// (with helpers, or right here — the same history either way)
const run = (world, opts) => (helpers ? simulateAsync(world, opts, helpers) : simulate(world, opts));

async function helpersFor(simMesh) {
    if (helpers || typeof Worker === 'undefined') return helpers;
    try { helpers = await HelperPool.create(simMesh); } catch { helpers = null; }
    return helpers;
}
// (on a small device, between runs: four idle workers hold ~200 MB a phone needs for Add detail; they start again — in
// well under a second — when the history runs on. With or without them, the same history)
const restHelpers = () => { if (small && helpers) { helpers.terminate(); helpers = null; } };

self.onmessage = async ({ data }) => {
    try {
        if (data.type === 'more') {
            const { world, scene, snapshotEveryMyr } = kept, started = performance.now();
            await helpersFor(world.mesh);
            const { steps } = await run(world, { untilMyr: data.untilMyr, resume: true, drive: w => scene.drive(w), snapshotEveryMyr, onFrame: send, keepFrames: false });
            restHelpers();
            self.postMessage({ type: 'more-done', steps, time: world.time, ms: performance.now() - started });
            return;
        }
        const { list, sceneId, seed, mesh, snapshotEveryMyr, heights = {}, ending = 'none', start = {}, lengthMyr = null } = data;
        small = !!data.small;
        const scene = SCENE_LISTS[list].find(s => s.id === sceneId), simMesh = meshFromArrays(mesh);
        await helpersFor(simMesh);
        // (start: start-world tunables, for scenes that take them)
        const world = helpers && scene.buildAsync ? await scene.buildAsync(simMesh, seed, start, helpers) : scene.build(simMesh, seed, start);
        world.config.heights = terrainConfig(heights);                 // (the heights evolve with these; the history itself ignores them)
        const { untilMyr, stopAt } = historyEnding(lengthMyr ?? scene.maxMyr, ending, world.config);      // (a chosen ending: it may run on)
        packMs = 0;
        const started = performance.now();
        const { steps, stopped } = await run(world, { untilMyr, stopAt, drive: w => scene.drive(w), snapshotEveryMyr, onFrame: send, keepFrames: false });
        kept = { world, scene, snapshotEveryMyr };
        const helperCount = helpers?.size ?? 0;
        restHelpers();
        self.postMessage({ type: 'done', steps, stopped, untilMyr, time: world.time, ms: performance.now() - started, packMs, helpers: helperCount });
    } catch (err) {
        self.postMessage({ type: 'error', message: err.stack ?? String(err) });
    }
};
