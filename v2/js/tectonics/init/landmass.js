// Turn a craton layout into the starting supercontinent's crust: irregular craton outlines, the
// accreted crust that wraps and joins them, a terrane id per cell, and the suture belts between
// neighbouring cratons (future rift corridors).
//
// Shapes are artistic; the two spacing promises are enforced separately so no shape function can
// break them:
//   craton ↔ craton  — cratons.js packs the ideal outlines at full reach, at least
//                      (cratonMinGapKm + 2 × cratonEdgeNoiseKm) apart, and the noise applied here
//                      moves an outline by at most cratonEdgeNoiseKm.
//   craton ↔ sea     — after shaping, every cell within cratonMinCoastKm of a craton is made land.

import { PLANET_RADIUS_KM } from '../../core/sim-mesh.js';
import { floodFrom, withinKm } from '../../core/mesh-bfs.js';
import { CrustType } from '../model/crust.js';
import { cratonSignedDistance } from './cratons.js';

/**
 * @returns {null | {type: Uint8Array, terrane: Uint16Array, suture: Uint8Array, skirtKm: number}}
 *          type uses CrustType (OCEAN / CONTINENT / CRATON); null if the layout cannot form one landmass
 */
export function shapeLandmass(simMesh, cratons, clusterCentre, noise, cfg, stretch = 1) {
    const { xyz, numCells } = simMesh;
    const km = v => v / PLANET_RADIUS_KM;
    const edgeNoise = km(cfg.cratonEdgeNoiseKm), soft = km(cfg.coastUnionSoftnessKm), wander = km(cfg.terraneBorderWanderKm);

    const type = new Uint8Array(numCells), terrane = new Uint16Array(numCells), suture = new Uint8Array(numCells);
    const field = new Float32Array(numCells), coastWobble = new Float32Array(numCells);
    for (let c = 0; c < numCells; c++) {
        const x = xyz[3 * c], y = xyz[3 * c + 1], z = xyz[3 * c + 2];
        let nearest = Infinity, nearestId = 0, b1 = Infinity, b2 = Infinity, who = 0, union = 0;
        for (const k of cratons) {
            const f = cratonSignedDistance(k, x, y, z);
            if (f < nearest) { nearest = f; nearestId = k.id; }
            union += Math.exp(-Math.max(f, -soft * 4) / soft);
            // terrane borders: the mid-line between two cratons, pushed around by per-craton noise
            const b = f + wander * noise.noise3D(x * 2.2 + 7.3 * k.id, y * 2.2 - 3.1 * k.id, z * 2.2 + 1.7 * k.id);
            if (b < b1) { b2 = b1; b1 = b; who = k.id; } else if (b < b2) b2 = b;
        }
        terrane[c] = who;
        if (b2 - b1 < 2 * km(cfg.sutureHalfWidthKm)) suture[c] = 1;
        // craton outline = ideal lobed shape ± bounded noise: a broad wander (the outline bulges and is bitten into
        // over hundreds of km) plus finer raggedness. A craton cell always carries its own craton's id, however far
        // the terrane border wanders (a core labelled with a neighbour's id would count as a divided craton).
        const wobble = clamp(1.2 * noise.fbm(x * 1.6 + 5, y * 1.6 + 5, z * 1.6 + 5, 3) + 0.7 * noise.fbm(x * 4.5 + 9, y * 4.5 + 9, z * 4.5 + 9, 3), -1, 1) * edgeNoise;
        if (nearest + wobble < 0) { type[c] = CrustType.CRATON; terrane[c] = nearestId; }
        // coast field = soft union of the cratons (no notch where two of them meet) …
        field[c] = -soft * Math.log(union);
        // … bent by broad lobes plus finer bays, domain-warped so it does not read as a buffered outline
        const wx = x + 0.2 * noise.noise3D(x * 2 + 40, y * 2, z * 2), wy = y + 0.2 * noise.noise3D(x * 2, y * 2 + 40, z * 2);
        // … and a continent-scale swell, so one side carries a wide shelf of accreted crust while on another the
        // cratons come close to the sea (developer: the land around the cratons must not be evenly sized)
        coastWobble[c] = clamp(0.55 * noise.noise3D(x * 0.8 + 31, y * 0.8 + 31, z * 0.8 + 31) + 0.9 * noise.fbm(wx * 1.3 + 11, wy * 1.3 + 11, z * 1.3 + 11, 3) + 0.4 * noise.fbm(x * 4.5 + 23, y * 4.5 + 23, z * 4.5 + 23, 4), -1, 1);
    }

    // The promised margin of accreted crust around every craton: true distance between cell centres, plus one
    // cell because a cell has an extent (init/measure-start.js measures the margin the same way).
    const nearCraton = withinKm(simMesh, c => type[c] === CrustType.CRATON, cfg.cratonMinCoastKm + simMesh.edgeKm);
    // Bridges: a corridor of accreted crust along each edge of the cratons' spanning tree, so the landmass is one
    // body however deep the coast bites in between two cores (a loose, ragged cluster would otherwise lose a core).
    const bridge = bridges(simMesh, cratons, km(cfg.bridgeHalfWidthKm));

    // Skirt width: whatever reaches the requested continental fraction — counted the way the final landmass is
    // made: seas enclosed by the landmass become land, land not attached to the main body becomes sea.
    // (`stretch` < 1 on the layout search's later attempts: a tamer coast too, so a stubborn seed fits the span cap)
    const relief = km(cfg.coastReliefKm) * (0.5 + 0.5 * stretch), antipode = simMesh.index.nearest(-clusterCentre[0], -clusterCentre[1], -clusterCentre[2]);
    const heart = simMesh.index.nearest(cratons[0].centre[0], cratons[0].centre[1], cratons[0].centre[2]);
    const isLand = (c, skirt) => nearCraton[c] === 1 || bridge[c] === 1 || field[c] < skirt + relief * coastWobble[c];
    const landmass = skirt => {
        const t = Uint8Array.from(type);
        for (let c = 0; c < numCells; c++) if (t[c] !== CrustType.CRATON && isLand(c, skirt)) t[c] = CrustType.CONTINENT;
        if (t[antipode] !== CrustType.OCEAN) return null;         // land right round the planet: not a layout we want
        const openOcean = floodFrom(simMesh, antipode, c => t[c] === CrustType.OCEAN);
        for (let c = 0; c < numCells; c++) if (t[c] === CrustType.OCEAN && !openOcean[c]) t[c] = CrustType.CONTINENT;
        const mainland = floodFrom(simMesh, heart, c => t[c] !== CrustType.OCEAN);
        let n = 0;
        for (let c = 0; c < numCells; c++) {
            if (t[c] === CrustType.OCEAN) continue;
            if (mainland[c]) { n++; continue; }
            if (t[c] === CrustType.CRATON) return null;            // a craton got cut off — layout rejected
            t[c] = CrustType.OCEAN;
        }
        return { t, n };
    };
    let lo = -0.25 - relief, hi = 0.7;                       // at lo nothing but the promised margins and bridges is land
    for (let it = 0; it < 24; it++) {
        const skirt = (lo + hi) / 2, made = landmass(skirt);
        if (!made) return null;
        if (made.n / numCells < cfg.continentalFraction) lo = skirt; else hi = skirt;
    }
    const skirt = (lo + hi) / 2, made = landmass(skirt);
    if (!made) return null;
    type.set(made.t);
    for (let c = 0; c < numCells; c++) {
        if (type[c] === CrustType.OCEAN) { terrane[c] = 0; suture[c] = 0; }
        else if (type[c] === CrustType.CRATON) suture[c] = 0;
    }
    return { type, terrane, suture, skirtKm: skirt * PLANET_RADIUS_KM };
}

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

/** Cells within `halfWidth` (radians) of the great-circle segments joining the cratons' centres along their minimum spanning tree. */
function bridges(simMesh, cratons, halfWidth) {
    const { xyz, numCells } = simMesh, out = new Uint8Array(numCells), n = cratons.length;
    const dist = (a, b) => Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])));
    // Prim's spanning tree over the centres
    const inTree = new Array(n).fill(false), edges = [];
    inTree[0] = true;
    for (let added = 1; added < n; added++) {
        let best = null;
        for (let i = 0; i < n; i++) if (inTree[i]) for (let j = 0; j < n; j++) if (!inTree[j]) { const d = dist(cratons[i].centre, cratons[j].centre); if (!best || d < best.d) best = { i, j, d }; }
        inTree[best.j] = true; edges.push(best);
    }
    for (const { i, j, d } of edges) {
        const A = cratons[i].centre, B = cratons[j].centre;
        const nx = A[1] * B[2] - A[2] * B[1], ny = A[2] * B[0] - A[0] * B[2], nz = A[0] * B[1] - A[1] * B[0], nl = Math.hypot(nx, ny, nz) || 1;
        for (let c = 0; c < numCells; c++) {
            const x = xyz[3 * c], y = xyz[3 * c + 1], z = xyz[3 * c + 2];
            const crossTrack = Math.asin(Math.max(-1, Math.min(1, (x * nx + y * ny + z * nz) / nl)));          // signed distance from the great circle
            if (Math.abs(crossTrack) > halfWidth) continue;
            const p = [x, y, z], along = dist(A, p), alongB = dist(B, p);                                        // between the two ends?
            if (along <= d + halfWidth && alongB <= d + halfWidth) out[c] = 1;
        }
    }
    return out;
}
