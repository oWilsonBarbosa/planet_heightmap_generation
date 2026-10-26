// Every cell's concentric rings — itself, its neighbours, theirs… — out to RING_COUNT, as one flat table built once per
// mesh, in breadth-first order (the same cells in the same order a ring-by-ring search would visit). Searches that run
// millions of times per history read their neighbourhoods from here instead of re-walking the mesh.

/** Rings 0…RING_COUNT are kept (≈ 37 cells per cell on a near-hexagonal mesh). */
export const RING_COUNT = 3;

/**
 * Ring r of cell c is cells[start[c·stride + r] … start[c·stride + r + 1]), for r = 0…RING_COUNT.
 * @returns {{start: Int32Array, cells: Int32Array, stride: number}}
 */
export function ringsOf(mesh) {
    if (mesh._rings) return mesh._rings;
    const { numCells, adjOffset, adjList } = mesh, R = RING_COUNT, stride = R + 2;
    const start = new Int32Array(numCells * stride), seen = new Uint32Array(numCells);
    let cells = new Int32Array(numCells * 40), n = 0, ring = [], next = [];
    for (let c = 0; c < numCells; c++) {
        const stamp = c + 1;
        ring.length = 0; ring.push(c); seen[c] = stamp;
        for (let r = 0; r <= R; r++) {
            start[c * stride + r] = n;
            if (n + ring.length > cells.length) { const grown = new Int32Array(cells.length * 2); grown.set(cells); cells = grown; }
            for (const x of ring) cells[n++] = x;
            next.length = 0;
            if (r < R) for (const x of ring) for (let k = adjOffset[x]; k < adjOffset[x + 1]; k++) { const nb = adjList[k]; if (seen[nb] !== stamp) { seen[nb] = stamp; next.push(nb); } }
            [ring, next] = [next, ring];
        }
        start[c * stride + R + 1] = n;
    }
    return (mesh._rings = { start, cells: cells.subarray(0, n), stride });
}
