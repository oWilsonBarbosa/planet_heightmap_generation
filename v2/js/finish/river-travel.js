// Runoff-weighted travel distances on the final directed network, in km.
// Lakes may be represented by direct connections to their outlet and a passed
// fraction there. Reservoir smoothing remains in riverYears, separate from travel.
const R_KM = 6371;
export const riverEdgeKm = (xyz, a, b) => R_KM * Math.hypot(xyz[3 * a] - xyz[3 * b], xyz[3 * a + 1] - xyz[3 * b + 1], xyz[3 * a + 2] - xyz[3 * b + 2]);

/**
 * All nodes are active land cells. receiver(c) returns another active cell or -1.
 * The supplied node order is only a list: redirection may have invalidated it.
 * Each node is visited after all its upstream nodes. A cycle is an error, not a
 * partially routed result. Extra workspace: 4 bytes per mesh cell and active node.
 */
export function travelMoments({ numCells, nodes, xyz, receiver, own, through = () => 1 }) {
    const missing = 0xffffffff, degree = new Uint32Array(numCells).fill(missing);
    for (const c of nodes) {
        if (!Number.isInteger(c) || c < 0 || c >= numCells || degree[c] !== missing) throw new Error('Invalid or duplicate travel node');
        degree[c] = 0;
    }
    for (const c of nodes) {
        const r = receiver(c);
        if (r === -1) continue;
        if (!Number.isInteger(r) || r < 0 || r >= numCells || degree[r] === missing) throw new Error('Travel receiver is not active');
        degree[r]++;
    }
    const queue = new Int32Array(nodes.length), q = new Float64Array(numCells), s1 = new Float64Array(numCells), s2 = new Float64Array(numCells);
    let head = 0, tail = 0;
    for (const c of nodes) if (degree[c] === 0) queue[tail++] = c;
    while (head < tail) {
        const c = queue[head++], local = own(c), passed = through(c);
        if (!Number.isFinite(local) || local < 0 || !Number.isFinite(passed) || passed < 0 || passed > 1) throw new Error('Invalid travel water balance');
        q[c] = (q[c] + local) * passed; s1[c] *= passed; s2[c] *= passed;
        const r = receiver(c);
        if (r < 0) continue;
        if (q[c] > 0) {
            const distance = riverEdgeKm(xyz, c, r);
            if (!Number.isFinite(distance)) throw new Error('Invalid travel distance');
            q[r] += q[c];
            s1[r] += s1[c] + distance * q[c];
            s2[r] += s2[c] + 2 * distance * s1[c] + distance * distance * q[c];
        }
        if (--degree[r] === 0) queue[tail++] = r;
    }
    if (head !== nodes.length) throw new Error('Cycle in the final river travel network');
    return { q, s1, s2 };
}

/** Monthly travel weights of a Nash cascade, folded over a periodic year. */
export function travelTimes(mean, variance, w) {
    w.fill(0);
    const shape = variance > 0 ? mean * mean / variance : Infinity;
    if (shape > 400) { const k = Math.floor(mean), f = mean - k; w[k % 12] += 1 - f; w[(k + 1) % 12] += f; return w; }
    const scale = variance / mean, sd = Math.sqrt(variance), dt = Math.min(0.05, sd / 8), end = mean + 8 * sd;
    let sum = 0;
    for (let t = dt / 2; t < end; t += dt) {
        const p = Math.exp((shape - 1) * Math.log(t / mean) - (t - mean) / scale);
        const k = Math.floor(t), f = t - k;
        w[k % 12] += p * (1 - f); w[(k + 1) % 12] += p * f; sum += p;
    }
    for (let k = 0; k < 12; k++) w[k] /= sum;
    return w;
}
