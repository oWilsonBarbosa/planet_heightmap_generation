// Experimental temporal-activity memory for volcanic arc widening.
// Native plate-cell indexed; no effect on generated terrain outside this
// experimental branch. A recently active trench may keep an arc for a
// bounded time, but not indefinitely on an abandoned subduction flag.
//
// Memory belongs to the simulation World instance; WeakMap keeps unrelated
// seeds and worlds isolated even when simulated in the same process.
// This is NOT a geological age of ARC: it is a short temporal boundary state.
const histories = new WeakMap();

export function recentOverriding(lastActiveMyr, nowMyr, windowMyr, active) {
    if (windowMyr < 0) return true; // baseline mode: preserve legacy rule
    if (!Number.isFinite(windowMyr) || windowMyr > 1000)
        throw new Error('Invalid subduction memory');
    if (active) return true;
    return Number.isFinite(lastActiveMyr) &&
        nowMyr >= lastActiveMyr &&
        nowMyr - lastActiveMyr <= windowMyr;
}

export function updateTrenchActivity(world, plateId, nativeCell, active, windowMyr) {
    if (windowMyr < 0) return true;
    let perWorld = histories.get(world);
    if (!perWorld) { perWorld = new Map(); histories.set(world, perWorld); }
    let byCell = perWorld.get(plateId);
    if (!byCell) {
        byCell = new Float64Array(world.mesh.numCells);
        byCell.fill(-Infinity);
        perWorld.set(plateId, byCell);
    }
    if (active) byCell[nativeCell] = world.time;
    return recentOverriding(byCell[nativeCell], world.time, windowMyr, active);
}
