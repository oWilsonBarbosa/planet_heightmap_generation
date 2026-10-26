// Measurements of a generated start world, straight from the crust rasters — independent of how
// the generator reasons, so they can confirm (or refute) its guarantees. Used by the lab's stat
// panel and by check-phase3.mjs. Distances are centre-to-centre minus one cell, i.e. the width
// of other crust actually lying between two regions.

import { PLANET_RADIUS_KM, kmToHops } from '../../core/sim-mesh.js';
import { floodFrom, hopDistance, touches } from '../../core/mesh-bfs.js';
import { CrustType, CrustFlag } from '../model/crust.js';

export function measureStartWorld(world, start) {
    const mesh = world.mesh, { xyz, numCells, edgeKm } = mesh;
    const crust = world.plates[start.continentId].crust;
    const isLand = c => crust.mask[c] === 1 && crust.type[c] !== CrustType.OCEAN;
    const isCraton = c => crust.mask[c] === 1 && crust.type[c] === CrustType.CRATON;
    const cellKm2 = mesh.cellAreaKm2;

    // ── areas ──
    let land = 0, cratonCells = 0, apron = 0, sutures = 0;
    const cratonArea = new Map(), terraneArea = new Map();
    for (let c = 0; c < numCells; c++) {
        if (!crust.mask[c]) continue;
        if (!isLand(c)) { apron++; continue; }
        land++;
        const t = crust.terrane[c];
        terraneArea.set(t, (terraneArea.get(t) || 0) + 1);
        if (crust.flags[c] & CrustFlag.SUTURE) sutures++;
        if (isCraton(c)) { cratonCells++; cratonArea.set(t, (cratonArea.get(t) || 0) + 1); }
    }
    const cratons = start.cratons.map(k => {
        const km2 = (cratonArea.get(k.id) || 0) * cellKm2;
        return { id: k.id, letter: k.letter, areaKm2: km2, diameterKm: 2 * Math.sqrt(km2 / Math.PI), terraneKm2: (terraneArea.get(k.id) || 0) * cellKm2 };
    });

    // ── spacing: exact centre-to-centre distances between region edges ──
    const edgeOf = test => { const out = []; for (let c = 0; c < numCells; c++) if (test(c) && touches(mesh, c, nb => !test(nb))) out.push(c); return out; };
    const cratonEdges = start.cratons.map(k => edgeOf(c => isCraton(c) && crust.terrane[c] === k.id));
    const coast = edgeOf(c => !isLand(c)).filter(c => touches(mesh, c, isLand));          // sea cells touching land
    const minSeparationKm = (a, b) => {
        let best = -2;
        for (const p of a) for (const q of b) {
            const d = xyz[3 * p] * xyz[3 * q] + xyz[3 * p + 1] * xyz[3 * q + 1] + xyz[3 * p + 2] * xyz[3 * q + 2];
            if (d > best) best = d;
        }
        return Math.acos(Math.min(1, best)) * PLANET_RADIUS_KM - edgeKm;
    };
    let minGapKm = Infinity, minCoastKm = Infinity;
    for (let i = 0; i < cratonEdges.length; i++) {
        minCoastKm = Math.min(minCoastKm, minSeparationKm(cratonEdges[i], coast));
        for (let j = i + 1; j < cratonEdges.length; j++) {
            // cheap reject: discs far apart cannot be the closest pair
            const a = start.cratons[i], b = start.cratons[j];
            const discGap = Math.acos(Math.max(-1, Math.min(1, a.centre[0] * b.centre[0] + a.centre[1] * b.centre[1] + a.centre[2] * b.centre[2]))) - a.radius - b.radius;
            if (discGap * PLANET_RADIUS_KM > minGapKm + 600) continue;
            minGapKm = Math.min(minGapKm, minSeparationKm(cratonEdges[i], cratonEdges[j]));
        }
    }

    // ── shape ──
    const landEdge = edgeOf(isLand);
    let longest = 1;
    for (let i = 0; i < landEdge.length; i += 2) for (let j = i + 1; j < landEdge.length; j += 2) {
        const p = landEdge[i], q = landEdge[j];
        const d = xyz[3 * p] * xyz[3 * q] + xyz[3 * p + 1] * xyz[3 * q + 1] + xyz[3 * p + 2] * xyz[3 * q + 2];
        if (d < longest) longest = d;
    }
    const firstLand = landEdge[0];
    const mainland = floodFrom(mesh, firstLand, isLand);
    let strayLand = 0;
    for (let c = 0; c < numCells; c++) if (isLand(c) && !mainland[c]) strayLand++;
    const antipode = mesh.index.nearest(-start.centre[0], -start.centre[1], -start.centre[2]);
    const openSea = floodFrom(mesh, antipode, c => !isLand(c));
    let enclosedSea = 0;
    for (let c = 0; c < numCells; c++) if (!isLand(c) && !openSea[c]) enclosedSea++;

    // ── apron & trench ──
    const inPlate = c => crust.mask[c] === 1;
    const fromOutside = hopDistance(mesh, c => !inPlate(c), kmToHops(mesh, 5000), inPlate);
    let minApronHops = Infinity;
    for (const c of landEdge) if (fromOutside[c] >= 0 && fromOutside[c] < minApronHops) minApronHops = fromOutside[c];
    let trenchCells = 0, trenchOffRim = 0;
    const rimSet = new Set(start.rim);
    for (let c = 0; c < numCells; c++) if (crust.mask[c] && (crust.flags[c] & CrustFlag.TRENCH)) { trenchCells++; if (!rimSet.has(c)) trenchOffRim++; }

    const diam = cratons.map(k => k.diameterKm), terr = cratons.map(k => k.terraneKm2);
    return {
        cratons,
        continentalFraction: land / numCells, cratonShare: cratonCells / land,
        apronFraction: apron / numCells, sutureShare: sutures / land,
        minGapKm, minCoastKm,
        cratonSizeRatio: Math.max(...diam) / Math.min(...diam), terraneSizeRatio: Math.max(...terr) / Math.min(...terr),
        longestAxisDeg: Math.acos(Math.max(-1, longest)) * 180 / Math.PI,
        strayLandCells: strayLand, enclosedSeaCells: enclosedSea,
        minApronKm: (minApronHops - 1) * edgeKm,                 // sea cells between the coast and the plate edge
        coastCells: landEdge.length, rimCells: start.rim.length,
        trenchCoverage: trenchCells / start.rim.length, trenchOffRim,
    };
}
