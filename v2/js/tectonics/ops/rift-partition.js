// Which side of a rift line each cell of a plate falls on, and the shape of what that leaves — for choosing a
// rift (ops/rift-path.js) and for splitting the plate along it (ops/rift.js).

import { CrustType } from '../model/crust.js';
import { tangentToward } from '../../core/sphere-geom.js';

/**
 * The two sides of `path`: the share of the plate's land on the smaller side (0 if the path does not divide it),
 * the elongation of the less compact side (long axis ÷ short axis of its land, from second moments; 1 = round), and
 * whether both sides hold craton cells.
 */
export function sidesOf(mesh, crust, path, cells = maskedCells(crust)) {
    const { side, land, cratons } = partition(mesh, crust, path, cells), a = land[1], b = land[2];
    if (a + b === 0) return { share: 0, elongation: 1, cratonsBothSides: false };
    return { share: Math.min(a, b) / (a + b), elongation: Math.max(elongationOf(mesh, side, 1, cells), elongationOf(mesh, side, 2, cells)), cratonsBothSides: cratons[1] > 0 && cratons[2] > 0 };
}

/** The plate's crust cells, in order — what the partition's scans visit (a rift scores many cuts of the same crust). */
export function maskedCells(crust) {
    const mask = crust.mask, out = new Int32Array(crust.count);
    let k = 0;
    for (let c = 0; c < mask.length; c++) if (mask[c]) out[k++] = c;
    return k === out.length ? out : out.subarray(0, k);
}

/**
 * The plate divided along `path` — the ONE partition both the scoring and the split use, so a rift does what it was
 * scored to do. Taking the path out of the land leaves it in pieces; each piece is on the left or the right of the
 * path by where it touches it. The right side is the largest right-hand piece, which parts as the new plate; every
 * other piece stays (they all hang on the rift line, which stays), so each side is one body of land — a piece on a
 * side it is not joined to by land would hang on by ocean alone and drift off as the sea between subducts. The path
 * never crosses a craton, so no craton is ever divided. The plate's ocean (apron, fore-arc, wake) follows its nearest
 * land. Returns the side of every cell (1 left, 2 right; 0 = not on the plate), and per side the count of land cells
 * and of whole cratons. `cells`: the plate's crust cells in order (maskedCells) — every scan visits only those.
 */
export function partition(mesh, crust, path, cells = maskedCells(crust)) {
    path = throughOcean(mesh, crust, path);
    const { xyz, numCells, adjOffset, adjList } = mesh, onPath = new Uint8Array(numCells), side = new Int8Array(numCells);
    for (const c of path) onPath[c] = 1;
    const isLand = c => crust.mask[c] && crust.type[c] !== CrustType.OCEAN;
    // which side of the path each cell next to it lies on (the sign of its offset from the path's local line)
    const lean = new Float32Array(numCells);              // > 0 left, < 0 right, summed over the path cells it touches
    for (let i = 0; i < path.length; i++) {
        const c = path[i], prev = path[Math.max(0, i - 1)], next = path[Math.min(path.length - 1, i + 1)];
        const P = pos(xyz, c), along = tangentToward(P, pos(xyz, prev), pos(xyz, next));
        const left = [along[1] * P[2] - along[2] * P[1], along[2] * P[0] - along[0] * P[2], along[0] * P[1] - along[1] * P[0]];   // along × up
        for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) {
            const nb = adjList[k];
            if (onPath[nb]) continue;
            lean[nb] += (xyz[3 * nb] - P[0]) * left[0] + (xyz[3 * nb + 1] - P[1]) * left[1] + (xyz[3 * nb + 2] - P[2]) * left[2];
        }
    }
    // the pieces of land the path leaves, each voting by the cells of it that touch the path
    const piece = new Int32Array(numCells).fill(-1), pieces = [];
    for (const s0 of cells) {
        if (!isLand(s0) || onPath[s0] || piece[s0] >= 0) continue;
        const id = pieces.length, cells = [s0]; piece[s0] = id;
        let vote = 0;
        for (let i = 0; i < cells.length; i++) {
            const c = cells[i];
            vote += lean[c];
            for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) { const nb = adjList[k]; if (isLand(nb) && !onPath[nb] && piece[nb] < 0) { piece[nb] = id; cells.push(nb); } }
        }
        pieces.push({ cells, vote });
    }
    let right = null;
    for (const p of pieces) if (p.vote < 0 && (!right || p.cells.length > right.cells.length)) right = p;
    for (const c of cells) if (isLand(c)) side[c] = 1;
    if (right) for (const c of right.cells) side[c] = 2;
    // the plate's ocean follows its nearest land; anything unreached (shouldn't happen) stays
    let frontier = [];
    for (const c of cells) if (side[c]) frontier.push(c);
    while (frontier.length) {
        const next = [];
        for (const c of frontier) for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) { const nb = adjList[k]; if (crust.mask[nb] && !side[nb]) { side[nb] = side[c]; next.push(nb); } }
        frontier = next;
    }
    const land = [0, 0, 0], cratons = [0, 0, 0], seenCraton = new Set();
    for (const c of cells) {
        if (!side[c]) side[c] = 1;
        if (!isLand(c)) continue;
        land[side[c]]++;
        if (crust.type[c] === CrustType.CRATON && !seenCraton.has(crust.terrane[c])) { seenCraton.add(crust.terrane[c]); cratons[side[c]]++; }
    }
    return { side, land, cratons };
}

/** Non-land cells connected to the world beyond the plate: the sea an outer coast faces (an enclosed sea is not). */
export function exteriorSea(mesh, crust) {
    const { numCells, adjOffset, adjList } = mesh, out = new Uint8Array(numCells);
    const sea = c => !crust.mask[c] || crust.type[c] === CrustType.OCEAN;
    let frontier = [];
    for (let c = 0; c < numCells; c++) if (!crust.mask[c]) { out[c] = 1; frontier.push(c); }
    // (a plate that has come to cover the whole globe — every other plate welded to it — has no outside: its outer sea is
    // then its largest ocean, the world ocean; with none, it could never rift again)
    if (!frontier.length) {
        const seen = new Uint8Array(numCells);
        let best = [];
        for (let s = 0; s < numCells; s++) {
            if (seen[s] || crust.type[s] !== CrustType.OCEAN) continue;
            const q = [s]; seen[s] = 1;
            for (let i = 0; i < q.length; i++) for (let k = adjOffset[q[i]]; k < adjOffset[q[i] + 1]; k++) { const nb = adjList[k]; if (!seen[nb] && crust.type[nb] === CrustType.OCEAN) { seen[nb] = 1; q.push(nb); } }
            if (q.length > best.length) best = q;
        }
        for (const c of best) out[c] = 1;
        frontier = best;
    }
    while (frontier.length) {
        const next = [];
        for (const c of frontier) for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) { const nb = adjList[k]; if (!out[nb] && sea(nb)) { out[nb] = 1; next.push(nb); } }
        frontier = next;
    }
    return out;
}

/**
 * The path continued at both ends straight on through the plate's own ocean (apron, fore-arc, wake) until it leaves
 * the plate. The rift line then spans the whole plate and divides it cleanly.
 */
function throughOcean(mesh, crust, path) {
    const { xyz, adjOffset, adjList } = mesh, onPath = new Set(path);
    const extend = (end, prev) => {
        const out = [];
        let cur = end, from = prev;
        for (let step = 0, steps = Math.round(RIFT_OCEAN_REACH_KM / mesh.edgeKm); step < steps; step++) {
            const dir = tangentToward(pos(xyz, cur), pos(xyz, from), pos(xyz, cur));
            let best = -1, bestDot = 0.3;
            for (let k = adjOffset[cur]; k < adjOffset[cur + 1]; k++) {
                const nb = adjList[k];
                if (!crust.mask[nb] || onPath.has(nb) || crust.type[nb] !== CrustType.OCEAN) continue;
                const d = tangentToward(pos(xyz, cur), pos(xyz, cur), pos(xyz, nb)), along = d[0] * dir[0] + d[1] * dir[1] + d[2] * dir[2];
                if (along > bestDot) { bestDot = along; best = nb; }
            }
            if (best < 0) break;
            out.push(best); onPath.add(best); from = cur; cur = best;
        }
        return out;
    };
    if (path.length < 2) return path;
    const head = extend(path[0], path[1]).reverse(), tail = extend(path.at(-1), path.at(-2));
    return [...head, ...path, ...tail];
}

/** Long axis ÷ short axis of the cells marked `which` in `side`, from the two largest eigenvalues of their position covariance. */
export function elongationOf(mesh, side, which, cells = null) {
    const { xyz, numCells } = mesh;
    if (!cells) { cells = []; for (let c = 0; c < numCells; c++) if (side[c]) cells.push(c); }       // (only a plate's cells have a side)
    let n = 0, m = [0, 0, 0];
    for (const c of cells) if (side[c] === which) { n++; m[0] += xyz[3 * c]; m[1] += xyz[3 * c + 1]; m[2] += xyz[3 * c + 2]; }
    if (n < 6) return 1;
    m = m.map(v => v / n);
    const C = new Float64Array(9);
    for (const c of cells) {
        if (side[c] !== which) continue;
        const d = [xyz[3 * c] - m[0], xyz[3 * c + 1] - m[1], xyz[3 * c + 2] - m[2]];
        for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[3 * i + j] += d[i] * d[j];
    }
    // eigenvalues of a symmetric 3×3 (Smith's closed form); the smallest is the radial one, ignored
    const p1 = C[1] * C[1] + C[2] * C[2] + C[5] * C[5], q = (C[0] + C[4] + C[8]) / 3;
    const p2 = (C[0] - q) ** 2 + (C[4] - q) ** 2 + (C[8] - q) ** 2 + 2 * p1, p = Math.sqrt(p2 / 6);
    if (p < 1e-18) return 1;
    const B = [0, 1, 2].map(i => [0, 1, 2].map(j => (C[3 * i + j] - (i === j ? q : 0)) / p));
    const detB = B[0][0] * (B[1][1] * B[2][2] - B[1][2] * B[2][1]) - B[0][1] * (B[1][0] * B[2][2] - B[1][2] * B[2][0]) + B[0][2] * (B[1][0] * B[2][1] - B[1][1] * B[2][0]);
    const phi = Math.acos(Math.max(-1, Math.min(1, detB / 2))) / 3;
    const e1 = q + 2 * p * Math.cos(phi), e3 = q + 2 * p * Math.cos(phi + 2 * Math.PI / 3), e2 = 3 * q - e1 - e3;
    const big = [e1, e2, e3].sort((x, y) => y - x);
    return big[1] > 1e-12 ? Math.sqrt(big[0] / big[1]) : 10;
}

const RIFT_OCEAN_REACH_KM = 7300;   // how far a rift line is carried on across the ocean beyond the coast
const pos = (xyz, c) => [xyz[3 * c], xyz[3 * c + 1], xyz[3 * c + 2]];
