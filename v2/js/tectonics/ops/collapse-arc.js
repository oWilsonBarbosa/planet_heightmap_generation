// Fore-arc closure: an island arc that has grown on a plate's own fore-arc, big enough and close
// enough to that plate's continent, collides with it (the arc–continent collision WBP describes for
// arcs the overriding plate carries). The arc is pushed onto the coast, the sea between them
// closes, and the fore-arc the arc stood on — with its trench — is given up: subduction jumps in to
// the new coast, so the plate's leading edge RETREATS. Continents grow by accreting their arcs, and
// never grow forward by claiming ocean.

import { CrustType, CrustFlag } from '../model/crust.js';
import { spreadBelt, beltWidthKm, OrogenyType } from '../step/orogeny.js';
import { giveToBackground } from './tidy-plates.js';
import { EventKind } from '../model/world.js';

/** @returns {number} arc cells collapsed onto coasts this step */
export function collapseArcs(world) {
    const { mesh, plates, config, time } = world, { adjOffset, adjList, edgeKm, numCells } = mesh;
    const background = plates.find(p => p.isBackground);
    const maxHops = Math.ceil(config.arcCollapseKm / edgeKm), minCells = config.arcCollapseMinKm2 / mesh.cellAreaKm2;
    let collapsed = 0;
    for (const plate of plates) {
        if (!plate.alive || plate.isBackground || plate.crust.count === 0) continue;
        if (plate.stats.continentalCells * mesh.cellAreaKm2 < config.terraneMaxAreaKm2) continue;     // only a continent has a coast to collapse onto
        const { mask, type, formedAt } = plate.crust;
        if (!mayCollapse(plate, mesh, minCells, time, config.arcCollapseAgeMyr)) continue;   // (no arc chain big and old enough: skip the distance search)
        // distance from continental crust, through this plate's cells, with the first sea cell off the coast remembered
        const { dist, coastCell, parent, sea } = work(numCells);
        dist.fill(-1); coastCell.fill(-1); parent.fill(-1);
        let frontier = [];
        for (let c = 0; c < numCells; c++) if (mask[c] && (type[c] === CrustType.CONTINENT || type[c] === CrustType.CRATON)) { dist[c] = 0; frontier.push(c); }
        if (!frontier.length) continue;
        for (let d = 1; frontier.length && d <= maxHops; d++) {
            const next = [];
            for (const c of frontier) for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) {
                const nb = adjList[k];
                if (dist[nb] >= 0 || !mask[nb] || type[nb] === CrustType.CONTINENT || type[nb] === CrustType.CRATON) continue;
                dist[nb] = d; parent[nb] = c; coastCell[nb] = d === 1 ? nb : coastCell[c]; next.push(nb);
                // (sea on its way in: an ocean cell among the cells between it and the coast — its parent, or the parent's)
                sea[nb] = dist[c] > 0 && (type[c] === CrustType.OCEAN || sea[c] === 1) ? 1 : 0;
            }
            frontier = next;
        }
        // arc chains
        const seen = work(numCells).seen.fill(0);
        for (let start = 0; start < numCells; start++) {
            if (seen[start] || !mask[start] || type[start] !== CrustType.ARC) continue;
            const chain = [start]; seen[start] = 1;
            for (let i = 0; i < chain.length; i++) for (let k = adjOffset[chain[i]]; k < adjOffset[chain[i] + 1]; k++) {
                const nb = adjList[k];
                if (!seen[nb] && mask[nb] && type[nb] === CrustType.ARC) { seen[nb] = 1; chain.push(nb); }
            }
            if (chain.length < minCells || chain.some(c => plate.crust.flags[c] & CrustFlag.MARGIN_ISLE)) continue;     // (fore-arc islands grow into their coast instead)
            // within reach of the coast, with SEA on the way in (a band of arc already stacked on the coast has nothing to close)
            const near = chain.filter(c => dist[c] > 0), age = time - Math.min(...chain.map(c => formedAt[c]));
            const seaBetween = chain.filter(c => dist[c] > 0 && sea[c] === 1);
            if (near.length < 0.5 * chain.length || seaBetween.length < 0.4 * chain.length || age < config.arcCollapseAgeMyr) continue;

            collapsed += collapseChain(world, plate, background, chain, dist, coastCell, parent);
            world.log(EventKind.ARC_COLLAPSE, `island arc of ${plate.name} (${(chain.length * mesh.cellAreaKm2 / 1e6).toFixed(2)} Mkm²) collapses onto its own coast: the sea between closes, the fore-arc is given up, subduction jumps in to the new coast`, { plate: plate.id, areaMkm2: chain.length * mesh.cellAreaKm2 / 1e6 });
            break;                        // one collapse per plate per step: the distances above no longer hold once one has landed
        }
    }
    return collapsed;
}

/** Does the plate have an island-arc chain of at least minCells, with no fore-arc island in it, old enough — the tests below that need no distances (the same expressions)? */
function mayCollapse(plate, mesh, minCells, time, minAgeMyr) {
    const { adjOffset, adjList, numCells } = mesh, { mask, type, flags, formedAt } = plate.crust;
    const seen = work(numCells).seen.fill(0);
    for (let start = 0; start < numCells; start++) {
        if (seen[start] || !mask[start] || type[start] !== CrustType.ARC) continue;
        const chain = [start]; seen[start] = 1;
        for (let i = 0; i < chain.length; i++) for (let k = adjOffset[chain[i]]; k < adjOffset[chain[i] + 1]; k++) {
            const nb = adjList[k];
            if (!seen[nb] && mask[nb] && type[nb] === CrustType.ARC) { seen[nb] = 1; chain.push(nb); }
        }
        if (chain.length >= minCells && !chain.some(c => flags[c] & CrustFlag.MARGIN_ISLE) && !(time - Math.min(...chain.map(c => formedAt[c])) < minAgeMyr)) return true;
    }
    return false;
}

function collapseChain(world, plate, background, chain, dist, coastCell, parent) {
    const { mesh, config, time } = world, { xyz, adjOffset, adjList } = mesh, crust = plate.crust;
    const { mask, type } = crust;
    // Every arc cell lands: on the coast cell at the end of its path in, or — when that is taken — on the next cell
    // out along the same path, so a band of arc becomes a band of coast and no land is lost. Arc cells the coast
    // cannot reach through the plate stay where they are.
    const giveBack = new Set(), landed = new Map();          // sea cells the plate gives up; landing cell → arc cell
    const byDistance = chain.filter(a => dist[a] > 0).sort((a, b) => dist[a] - dist[b]);
    for (const a of byDistance) {
        const path = [];                                       // from the coast outward to a
        for (let c = a; c >= 0 && dist[c] > 0; c = parent[c]) path.unshift(c);
        const dest = path.find(c => !landed.has(c)) ?? a;
        landed.set(dest, a);
        for (const c of path) if (c !== dest && !landed.has(c)) giveBack.add(c);      // the sea on the way in
    }
    // the fore-arc beyond the arc, its trench included: plate sea reached outward from the chain, away from the coast —
    // except a rim of trench right in front of where the arc lands, which the plate keeps (the new margin's apron)
    let ring = chain;
    const outward = new Set(chain), keepNear = new Set();
    for (const [dest] of landed) { keepNear.add(dest); for (let k = adjOffset[dest]; k < adjOffset[dest + 1]; k++) keepNear.add(adjList[k]); }
    const beyondHops = Math.max(1, Math.round(config.arcCollapseForeArcKm / mesh.edgeKm));
    for (let hop = 0; hop < beyondHops; hop++) {
        const next = [];
        for (const c of ring) for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) {
            const nb = adjList[k];
            if (outward.has(nb) || !mask[nb] || type[nb] !== CrustType.OCEAN || (dist[nb] >= 0 && dist[nb] < dist[c])) continue;
            outward.add(nb); next.push(nb);
            if (!(keepNear.has(nb) && (crust.flags[nb] & CrustFlag.TRENCH))) giveBack.add(nb);
        }
        ring = next;
    }
    // land the arc on the coast (read every source before writing, since sources and destinations overlap)
    const moved = [...landed].map(([dest, a]) => [dest, crust.snapshot(a)]);
    for (const [dest, a] of landed) { giveBack.delete(dest); if (!landed.has(a)) giveBack.add(a); }
    for (const [dest, snap] of moved) {
        crust.restore(dest, snap);
        crust.slabKm[dest] = 0; crust.wingKm[dest] = 0;                                  // (it is land now, no trench)
        crust.flags[dest] = (crust.flags[dest] & ~(CrustFlag.TRENCH | CrustFlag.APRON)) | CrustFlag.SUTURE;
    }
    // give the fore-arc back to the open ocean in front of the trench
    giveToBackground(world, plate, background, [...giveBack].filter(c => !landed.has(c)));
    // a short belt and a suture where the arc joined
    const joined = [...landed.keys()];
    const width = beltWidthKm('ural', 0, 0, config);
    spreadBelt(plate, mesh, joined, { type: OrogenyType.URAL, widthKm: width, workKm: config.belts.ural.baseKm * 0.5, time }, config);
    for (const q of joined) for (let k = adjOffset[q]; k < adjOffset[q + 1]; k++) { const nb = adjList[k]; if (mask[nb] && type[nb] === CrustType.CONTINENT) crust.flags[nb] |= CrustFlag.SUTURE; }
    return landed.size;
}

/** Cell-sized working arrays, kept between calls (filled afresh by each use). */
let working = null;
function work(numCells) {
    if (!working || working.dist.length !== numCells) {
        working = { dist: new Int16Array(numCells), coastCell: new Int32Array(numCells), parent: new Int32Array(numCells), sea: new Uint8Array(numCells), seen: new Uint8Array(numCells) };
    }
    return working;
}
