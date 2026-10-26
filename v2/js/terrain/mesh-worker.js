// Builds a terrain mesh (Fibonacci points → Delaunay → adjacency) off the page's thread and sends its arrays back:
// on a 2.5M-cell mesh that is seconds of work, done while the history runs. Same builder, same seed: the same mesh.
// The page tells it where Delaunator lives (a worker cannot use the page's import map).

import { setDelaunator, buildSphere } from '../../../js/sphere-mesh.js';
import { makeRng } from '../../../js/rng.js';

self.onmessage = async ({ data: { numCells, seed, delaunatorUrl } }) => {
    try {
        setDelaunator((await import(delaunatorUrl)).default);
        const { mesh, r_xyz } = buildSphere(numCells, 0.35, makeRng(seed + 4242));      // (as core/sim-mesh.js buildSimMesh)
        const out = { numCells: mesh.numRegions, xyz: r_xyz, adjOffset: mesh.adjOffset, adjList: mesh.adjList };
        self.postMessage(out, [out.xyz.buffer, out.adjOffset.buffer, out.adjList.buffer]);
    } catch (err) {
        self.postMessage({ error: err.stack ?? String(err) });
    }
};
