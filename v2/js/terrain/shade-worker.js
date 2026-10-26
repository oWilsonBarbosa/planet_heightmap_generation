// The shading worker (terrain-pool.js runs one): it holds the terrain meshes, sent once each, and hillshades frames'
// heights (view/terrain-shade.js) so the page's thread does not — the same shading, off the page. Runs as a browser
// module worker or a Node worker thread.

import { hillshade } from '../view/terrain-shade.js';

const meshes = new Map();                                  // numCells → { numCells, xyz, adjOffset, adjList }
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
        if (msg.type === 'mesh') meshes.set(msg.mesh.numCells, msg.mesh);
        else if (msg.type === 'shade') {
            const shade = hillshade(meshes.get(msg.numCells), msg.heightKm, msg.opts);
            post({ type: 'shaded', jobId: msg.jobId, shade }, [shade.buffer]);
        }
    } catch (err) {
        post({ type: 'error', jobId: msg.jobId, message: err.stack ?? String(err) });
    }
}
