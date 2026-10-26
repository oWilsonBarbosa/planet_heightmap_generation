// Accreted arcs become continent (after Phase 13). Island arcs are how continents grow: welded onto a continent —
// docked, scraped on, collapsed onto its coast — an arc's crust is thickened, intruded and reworked into continental
// crust (the North American Cordillera, the Central Asian Orogenic Belt, most of Japan). Here arc crust that touches its
// plate's continental crust, and is at least arcContinentAgeMyr old, turns continental one ring at a time — its front
// advancing arcContinentKmPerMyr. Without it the continental crust only ever lost ground (collisions underthrust it,
// erosive margins eat it: 148 → 110 Mkm² over 1200 Myr) while the arcs that should have made it up stayed arcs
// (developer: "the overall landmass … seems like we are decreasing over time").

import { CrustType, CrustFlag } from '../model/crust.js';

/** @returns {number} plates whose crust changed (cell types only) */
export function matureArcs(world, dt) {
    const { mesh, plates, config, time } = world, { numCells, adjOffset, adjList, edgeKm } = mesh;
    const rate = config.arcContinentKmPerMyr;
    if (!(rate > 0) || dt <= 0) return 0;
    const spacing = edgeKm * Math.sqrt(3) / 2;
    let changed = 0;
    for (const plate of plates) {
        if (!plate.alive || plate.isBackground || plate.crust.count === 0) continue;
        // (a ring is due every cell spacing's worth of the front's advance)
        plate.arcMatureKm = (plate.arcMatureKm ?? 0) + rate * dt;
        if (plate.arcMatureKm < spacing) continue;
        plate.arcMatureKm -= spacing;
        const { mask, type, formedAt, flags } = plate.crust, ring = [];
        for (let c = 0; c < numCells; c++) {
            if (!mask[c] || type[c] !== CrustType.ARC || (flags[c] & CrustFlag.MARGIN_ISLE) || time - formedAt[c] < config.arcContinentAgeMyr) continue;
            for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) {
                const nb = adjList[k];
                if (mask[nb] && (type[nb] === CrustType.CONTINENT || type[nb] === CrustType.CRATON)) { ring.push(c); break; }
            }
        }
        if (!ring.length) continue;
        for (const c of ring) type[c] = CrustType.CONTINENT;          // (its terrane, its age, its belts and its volcanoes stay)
        world.budget.arcMaturedCells = (world.budget.arcMaturedCells ?? 0) + ring.length;
        plate.dirty = true;
        changed++;
    }
    return changed;
}
