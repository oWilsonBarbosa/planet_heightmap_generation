// Who goes down when two pieces of crust converge. One rule, used by both the resolve
// pass (which crust to delete) and boundary classification (which side is the trench).

import { CrustType, CrustFlag } from '../model/crust.js';

/**
 * Does crust (plateA, cellA) override crust (plateB, cellB)?
 * Returns true / false, or null when neither can subduct (land against land = collision).
 * `decided` is the id of the plate that overrides along this stretch of boundary, from the
 * segment-wise vote in boundaries.js (−1 = no decision yet); it settles ocean against ocean, where
 * the per-cell rules below would otherwise interleave and leave the front ragged.
 */
export function overrides(plateA, cellA, plateB, cellB, decided = -1) {
    const a = plateA.crust, b = plateB.crust;
    const landA = a.type[cellA] !== CrustType.OCEAN, landB = b.type[cellB] !== CrustType.OCEAN;
    if (landA && landB) return null;              // continental crust never subducts
    if (landA !== landB) return landA;            // ocean always goes under land

    // Ocean against ocean:
    // 0. the whole segment goes the way it was voted (one trench line, not a cell-by-cell patchwork)
    if (decided >= 0 && (decided === plateA.id || decided === plateB.id)) return decided === plateA.id;
    // 1. an established trench keeps its polarity (persistent subduction zones)
    const trenchA = (a.flags[cellA] & CrustFlag.TRENCH) !== 0, trenchB = (b.flags[cellB] & CrustFlag.TRENCH) !== 0;
    if (trenchA !== trenchB) return trenchA;
    // 2. the passive pre-history ocean always loses
    if (plateA.isBackground !== plateB.isBackground) return plateB.isBackground;
    // 3. older crust is colder and denser, so it sinks under younger crust
    if (a.formedAt[cellA] !== b.formedAt[cellB]) return a.formedAt[cellA] > b.formedAt[cellB];
    // 4. same age (two flanks of one ridge brushing each other): no physical preference, so the
    //    tie-break must not favour either plate — alternate by cell parity.
    return ((cellA ^ cellB) & 1) === 0 ? plateA.id < plateB.id : plateA.id > plateB.id;
}

