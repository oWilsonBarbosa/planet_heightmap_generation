// Oceanic plate birth (Phase 6b). The pre-history ocean is one passive, stationary body that never
// moves and never accepts crust — a modelling device, not a plate. As soon as a trench is to run
// along part of it, that will not do: a plate facing it has nothing to push back, so the trench tows
// its owner outward for ever, and, because the passive ocean never takes crust, the owner also
// spreads in every direction as it turns.
//
// So before a trench founds against the passive ocean, a real plate is CARVED OUT of it: the ocean
// within reach of the new margin becomes a plate of its own, with its own name, free to move under
// slab pull and to receive crust at a ridge like any other. This is WBP's rule that ocean-only plates
// are born only when a new trench cuts old ocean off, and it is how a world of continents and one
// dead ocean becomes a world of plates.

import { transferCells } from './tidy-plates.js';
import { EventKind } from '../model/world.js';

/**
 * Carve a plate out of `background`, taking its crust within `reachKm` of `seedCells` (world cells).
 * @returns {import('../model/plate.js').Plate|null} the new plate, or null if there is too little to take
 */
export function birthOceanPlate(world, background, seedCells, reachKm, name) {
    const { mesh, owner, ownerCell, config } = world, { adjOffset, adjList, edgeKm, cellAreaKm2 } = mesh;
    const maxHops = Math.max(1, Math.round(reachKm / edgeKm));
    // the background's crust reachable from the margin, through the background alone
    const seen = new Set(), take = [];
    let ring = [];
    for (const w of seedCells) for (let k = adjOffset[w]; k < adjOffset[w + 1]; k++) {
        const nb = adjList[k];
        if (owner[nb] === background.id && !seen.has(nb)) { seen.add(nb); ring.push(nb); take.push(nb); }
    }
    for (let hop = 0; hop < maxHops && ring.length; hop++) {
        const next = [];
        for (const w of ring) for (let k = adjOffset[w]; k < adjOffset[w + 1]; k++) {
            const nb = adjList[k];
            if (owner[nb] !== background.id || seen.has(nb)) continue;
            seen.add(nb); next.push(nb); take.push(nb);
        }
        ring = next;
    }
    if (take.length * cellAreaKm2 < config.oceanPlateMinAreaKm2) return null;

    const fresh = world.addPlate(name);
    fresh.setQuat(background.quat.slice());
    fresh.omega = [0, 0, 0];                                   // it starts where it stood; the torque balance takes it from there
    const cells = take.map(w => ownerCell[w]).filter(c => background.crust.mask[c]);
    if (!transferCells(world, background, fresh, [...new Set(cells)])) { fresh.alive = false; return null; }
    fresh.born = world.time;
    fresh.isOceanBorn = true;
    world.log(EventKind.PLATE_BORN, `${name} is born: ${(take.length * cellAreaKm2 / 1e6).toFixed(1)} Mkm² of the old ocean becomes a plate of its own`, { plate: fresh.id, areaMkm2: take.length * cellAreaKm2 / 1e6 });
    return fresh;
}

/** A name for a newborn ocean plate: Thalassa, Thalassa 2, … */
export function oceanPlateName(world) {
    const n = world.plates.filter(p => p.isOceanBorn).length + 1;
    return n === 1 ? 'Thalassa' : `Thalassa ${n}`;
}
