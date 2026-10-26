// The carving worker (terrain-pool.js runs one): it holds the meshes the carving climbs — the sim mesh and the terrain
// meshes, sent once each — and carves whole frames (carve.js), so the page's thread never does. The carving needs the
// whole surface at once (rivers run across any split), so it is one job per frame; the chunk workers meanwhile build
// the next frame's surface. Runs as a browser module worker or a Node worker thread; same result as carving in place.

import { carveTerrain } from './carve.js';
import { meshFromArrays } from '../core/sim-mesh.js';

const meshes = new Map();                                  // numCells → mesh
let post;
if (typeof self === 'undefined') {                         // Node worker thread
    const { parentPort } = await import('node:worker_threads');
    post = (msg, transfer) => parentPort.postMessage(msg, transfer);
    parentPort.on('message', handle);
} else {
    post = (msg, transfer) => self.postMessage(msg, transfer);
    self.onmessage = e => handle(e.data);
}

function handle(msg) {
    try {
        if (msg.type === 'mesh') meshes.set(msg.mesh.numCells, meshFromArrays(msg.mesh));
        else if (msg.type === 'carve') {
            const started = performance.now();
            const C = carveTerrain(msg.ladder.map(n => meshes.get(n)), msg.fields, msg.settings);
            post({ type: 'carved', jobId: msg.jobId, z: C.z, area: C.area, ms: performance.now() - started }, [C.z.buffer, C.area.buffer]);
        }
    } catch (err) {
        post({ type: 'error', jobId: msg.jobId, message: err.stack ?? String(err) });
    }
}
