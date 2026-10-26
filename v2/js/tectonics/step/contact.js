// Where a world cell touches another plate: the local boundary normal and the plate across it.
// Shared by boundary classification (what kind of boundary is this?) and the force model
// (which way does it push or pull?).

/**
 * @param {Float64Array|number[]} out  receives [nx, ny, nz] — unit normal pointing from cell `w`
 *        toward the foreign plate (mean direction to all foreign neighbours: a single neighbour's
 *        direction is too noisy, along a sliding contact it reads as opening or closing at random)
 *        out[3] receives the number of foreign neighbours (how many cell edges are shared with other plates)
 * @returns {number} the world cell straight across the boundary (owned by the other plate), or −1
 *        if `w` is an interior cell
 */
export function contactAt(world, w, out) {
    // The answer depends on the world view alone, which only a resolve changes (each bumps occupancyStamp): boundary
    // classification and the force model ask for the same cells between resolves, so answers are kept until the next.
    let cache = world._contact;
    if (!cache || cache.across.length !== world.owner.length) cache = world._contact = { done: new Uint32Array(world.owner.length), across: new Int32Array(world.owner.length), normal: new Float64Array(4 * world.owner.length) };
    const version = world.occupancyStamp + 1;       // (+1: never 0, the empty mark)
    if (cache.done[w] === version) {
        const across = cache.across[w];
        if (across >= 0) { out[0] = cache.normal[4 * w]; out[1] = cache.normal[4 * w + 1]; out[2] = cache.normal[4 * w + 2]; out[3] = cache.normal[4 * w + 3]; }
        return across;
    }
    cache.done[w] = version;
    const across = contactUncached(world, w, out);
    cache.across[w] = across;
    if (across >= 0) { cache.normal[4 * w] = out[0]; cache.normal[4 * w + 1] = out[1]; cache.normal[4 * w + 2] = out[2]; cache.normal[4 * w + 3] = out[3]; }
    return across;
}

function contactUncached(world, w, out) {
    const { owner, mesh } = world, { xyz, adjOffset, adjList } = mesh, unit = unitDirectionsOf(mesh);
    const a = owner[w], x = xyz[3 * w], y = xyz[3 * w + 1], z = xyz[3 * w + 2];
    let nx = 0, ny = 0, nz = 0, shared = 0;
    for (let k = adjOffset[w]; k < adjOffset[w + 1]; k++) {
        const nb = adjList[k], b = owner[nb];
        if (b < 0 || b === a) continue;
        shared++;
        nx += unit[3 * k]; ny += unit[3 * k + 1]; nz += unit[3 * k + 2];
    }
    if (shared === 0) return -1;                   // interior cell
    let nl = Math.hypot(nx, ny, nz);
    if (nl < 1e-9) {                               // a one-cell sliver with foreign cells on opposite sides: any of them will do
        for (let k = adjOffset[w]; k < adjOffset[w + 1]; k++) {
            const nb = adjList[k];
            if (owner[nb] >= 0 && owner[nb] !== a) { nx = xyz[3 * nb] - x; ny = xyz[3 * nb + 1] - y; nz = xyz[3 * nb + 2] - z; break; }
        }
        nl = Math.hypot(nx, ny, nz) || 1;
    }
    nx /= nl; ny /= nl; nz /= nl;
    let across = -1, best = -2;
    for (let k = adjOffset[w]; k < adjOffset[w + 1]; k++) {
        const nb = adjList[k], b = owner[nb];
        if (b < 0 || b === a) continue;
        const align = (xyz[3 * nb] - x) * nx + (xyz[3 * nb + 1] - y) * ny + (xyz[3 * nb + 2] - z) * nz;
        if (align > best) { best = align; across = nb; }
    }
    out[0] = nx; out[1] = ny; out[2] = nz; out[3] = shared;
    return across;
}

/** The unit direction from each cell to each of its neighbours (per adjacency entry), once per mesh — as contactUncached had it. */
const unitDirections = new WeakMap();
function unitDirectionsOf(mesh) {
    let u = unitDirections.get(mesh);
    if (u) return u;
    const { xyz, adjOffset, adjList, numCells } = mesh;
    u = new Float64Array(3 * adjList.length);
    for (let w = 0; w < numCells; w++) {
        const x = xyz[3 * w], y = xyz[3 * w + 1], z = xyz[3 * w + 2];
        for (let k = adjOffset[w]; k < adjOffset[w + 1]; k++) {
            const nb = adjList[k], dx = xyz[3 * nb] - x, dy = xyz[3 * nb + 1] - y, dz = xyz[3 * nb + 2] - z, dl = Math.hypot(dx, dy, dz) || 1;
            u[3 * k] = dx / dl; u[3 * k + 1] = dy / dl; u[3 * k + 2] = dz / dl;
        }
    }
    unitDirections.set(mesh, u);
    return u;
}
