// Subduction initiation (WBP Part Va, Phase 6b). An ocean does not stay open for ever: a passive
// margin — the trenchless edge a rift left behind — grows a thicker, colder, denser slab of ocean
// beside it as the crust there ages, and sooner or later it founders and a NEW trench is born along
// it. That is what ends a Wilson cycle: the ocean that opened at a rift begins to close again.
//
// Where: a run of cells along one plate's outer ocean edge, against another plate, with
//   · no trench of its own already (that edge is doing the job),
//   · ocean crust older than subductionInitAgeMyr on the side that will go down,
//   · the two plates not pulling apart there (a spreading edge does not founder).
// When: a chance per Myr per margin, from the world's seeded stream, rising with the age of the
// crust that is to sink and with the length of the margin — old, long margins go first.
// Which side goes down: the OLDER, denser side; against a continent the ocean always does. The
// trench is armed on the overriding side, and from then on the ordinary rules (polarity.js,
// boundaries.js) run it like any other trench.

import { CrustType, CrustFlag } from '../model/crust.js';
import { birthOceanPlate, oceanPlateName } from '../ops/birth-ocean-plate.js';
import { transferCells } from '../ops/tidy-plates.js';
import { exteriorSea } from '../ops/rift-partition.js';
import { EventKind } from '../model/world.js';
import { largestPieceOf } from '../../core/mesh-bfs.js';

/**
 * @param {number} dt Myr
 * @returns {number} margins that began subducting this step
 */
export function initiateSubduction(world, dt) {
    const { mesh, owner, ownerCell, plates, convergence, config, time } = world;
    const { numCells, adjOffset, adjList, edgeKm } = mesh;
    if (config.subductionInitRatePerMyr <= 0) return 0;

    // 1. every contact cell that could found a trench, grouped by the pair of plates it lies between. The world view was
    // built before this step's other events: a plate they reshaped is skipped (its view is stale — see Plate.reshaped),
    // and every cell is re-checked against its raster (the passive ocean is reshaped by every wing, but never remapped)
    const stale = (P, cell) => (P.reshaped && !P.isBackground) || !P.crust.mask[cell];
    const byPair = new Map();
    for (let w = 0; w < numCells; w++) {
        const a = owner[w];
        if (a < 0 || plates[a].isBackground) continue;
        const A = plates[a], cellA = ownerCell[w];
        if (stale(A, cellA) || A.crust.type[cellA] !== CrustType.OCEAN || (A.crust.flags[cellA] & CrustFlag.TRENCH)) continue;
        for (let k = adjOffset[w]; k < adjOffset[w + 1]; k++) {
            const nb = adjList[k], b = owner[nb];
            if (b < 0 || b === a) continue;
            const B = plates[b], cellB = ownerCell[nb];
            if (stale(B, cellB) || (B.crust.flags[cellB] & CrustFlag.TRENCH)) continue;          // that edge already subducts
            if (convergence[w] < -config.subductionInitMaxOpeningCmYr) continue;   // pulling apart here: a ridge, not a founder
            const key = a < b ? `${a}:${b}` : `${b}:${a}`;
            const entry = byPair.get(key) ?? byPair.set(key, { cells: [], ages: 0 }).get(key);
            entry.cells.push(w);
            entry.ages += time - Math.min(A.crust.formedAt[cellA], B.crust.formedAt[cellB]);
            break;                                                          // one entry per world cell
        }
    }

    let started = 0;
    for (const [key, entry] of byPair) {
        const [idA, idB] = key.split(':').map(Number), A = plates[idA], B = plates[idB];
        if (!A?.alive || !B?.alive) continue;
        const lengthKm = entry.cells.length * edgeKm, ageMyr = entry.ages / entry.cells.length;
        if (lengthKm < config.subductionInitMinLengthKm || ageMyr < config.subductionInitAgeMyr) continue;
        // chance rises with how far past the threshold the crust is, and with the margin's length
        const overAge = ageMyr / config.subductionInitAgeMyr - 1;
        let chance = config.subductionInitRatePerMyr * dt * Math.min(config.subductionInitAgeCap, overAge) * (lengthKm / config.subductionInitMinLengthKm);
        // (Phase 13, steered: while a supercontinent's pieces disperse, the young oceans that opened between them rarely
        // founder — closing them is how the pieces gather again, and that waits for the cycle's gathering: step/supercontinent.js)
        const cycle = world.cycle;
        if (cycle?.phase === 'dispersing' && ageMyr <= world.time - cycle.breakupAt + 1e-9) chance *= config.disperseFounderFactor;
        if (world.rngSubduction() >= chance) continue;
        const segment = largestPieceOf(mesh, entry.cells);
        if (segment.length * edgeKm < config.subductionInitMinLengthKm) continue;
        // The passive ocean is no partner — it never moves, never pushes back and never accepts crust, so a
        // trench against it would tow its owner outward for ever. A real plate is carved out of it first
        // (ops/birth-ocean-plate.js); if there is too little old ocean there to be worth one, no trench founds.
        let a2 = A, b2 = B;
        if (A.isBackground || B.isBackground) {
            const background = A.isBackground ? A : B, born = birthOceanPlate(world, background, segment, config.oceanPlateReachKm, oceanPlateName(world));
            if (!born) continue;
            if (A.isBackground) a2 = born; else b2 = born;
        }
        const { upper, lower } = chooseFoundering(world, a2, b2, segment);
        armMargin(world, upper, lower, segment);
        started++;
        world.log(EventKind.SUBDUCTION_INIT, `a new trench founders along ${(segment.length * edgeKm).toFixed(0)} km of ${lower.name}’s passive margin, beneath ${upper.name}: ocean ${ageMyr.toFixed(0)} Myr old begins to go down`,
            { upper: upper.id, lower: lower.id, lengthKm: segment.length * edgeKm, ageMyr });
    }
    return started;
}

/**
 * Old passive margins founder INSIDE a plate too (developer, 2026-10-18: the recordings — with no boundary between two
 * plates to found a trench on, a plate holding its continents and its whole ocean never broke up again, and an
 * assembled supercontinent's world froze as one plate for up to 200 Myr, its ocean ageing past 300 Myr). The rule is the
 * one above — a long run of old ocean against a continent's coast, a chance per Myr rising with the age and the length —
 * on one plate's own raster: when it founders, the ocean on that side breaks away as a plate of its own (the ocean nearer
 * this coast than any other coast of the plate, within oceanPlateReachKm) and the coast's apron stays as the trench, on
 * the continent's side. The continent is never split: a supercontinent stays one landmass, ringed by trenches as Pangaea
 * was. Only the outer sea (an enclosed sea closes from its shores: step/remnant-seas.js). Only a plate that has grown to
 * hold marginFounderMinShare of the planet: the rule breaks up giant plates, it does not add trenches everywhere (with it on
 * every plate, the extra trenches raised arcs and ranges enough to grow the land by a quarter and take its lowlands below a
 * third). On the slow clock.
 * @param {number} dt Myr since it last ran  @returns {number} margins that began subducting
 */
export function founderWithinPlates(world, dt) {
    const { mesh, plates, config, time } = world, { numCells, adjOffset, adjList, edgeKm, cellAreaKm2 } = mesh;
    if (!(config.marginFounderRatePerMyr > 0)) return 0;
    const minCells = config.oceanPlateMinAreaKm2 / cellAreaKm2, reachHops = Math.max(1, Math.round(config.oceanPlateReachKm / edgeKm));
    let started = 0;
    for (const P of [...plates]) {                                          // (a copy: plates are added as it goes)
        if (!P.alive || P.isBackground || P.crust.count === 0 || !(P.stats.continentalCells > 0) || P.stats.cells - P.stats.continentalCells < minCells) continue;
        if (P.stats.cells < config.marginFounderMinShare * numCells) continue;
        const { mask, type, flags, formedAt } = P.crust;
        const land = c => mask[c] && (type[c] === CrustType.CONTINENT || type[c] === CrustType.CRATON);
        // the plate's own coast — its ocean beside its continental crust — and the old part of it (no trench there yet)
        const coast = new Uint8Array(numCells), old = [];
        for (let c = 0; c < numCells; c++) {
            if (!mask[c] || type[c] !== CrustType.OCEAN) continue;
            for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) {
                if (!land(adjList[k])) continue;
                coast[c] = 1;
                if (!(flags[c] & CrustFlag.TRENCH) && time - formedAt[c] >= config.subductionInitAgeMyr) old.push(c);
                break;
            }
        }
        // the runs of old coast, each joined along the coast
        const inOld = new Uint8Array(numCells), runOf = new Int32Array(numCells).fill(-1), runs = [];
        for (const c of old) inOld[c] = 1;
        for (const s of old) {
            if (runOf[s] >= 0) continue;
            const run = [s]; runOf[s] = runs.length;
            for (let i = 0; i < run.length; i++) for (let k = adjOffset[run[i]]; k < adjOffset[run[i] + 1]; k++) { const nb = adjList[k]; if (inOld[nb] && runOf[nb] < 0) { runOf[nb] = runs.length; run.push(nb); } }
            runs.push(run);
        }
        for (const run of runs) {
            const lengthKm = run.length * edgeKm;
            if (lengthKm < config.subductionInitMinLengthKm) continue;
            let ages = 0;
            for (const c of run) ages += time - formedAt[c];
            const ageMyr = ages / run.length;
            let chance = config.marginFounderRatePerMyr * dt * Math.min(config.subductionInitAgeCap, ageMyr / config.subductionInitAgeMyr - 1) * (lengthKm / config.subductionInitMinLengthKm);
            const cycle = world.cycle;
            if (cycle?.phase === 'dispersing' && ageMyr <= time - cycle.breakupAt + 1e-9) chance *= config.disperseFounderFactor;
            if (world.rngMarginFounder() >= chance) continue;
            const outer = exteriorSea(mesh, P.crust);
            if (!run.some(c => outer[c])) continue;
            // the ocean nearer this run than any other coast of the plate, out to the reach: through the plate's ocean only
            const label = new Uint8Array(numCells), mine = runOf[run[0]];
            let ring = [];
            for (let c = 0; c < numCells; c++) if (coast[c]) { label[c] = runOf[c] === mine ? 1 : 2; ring.push(c); }
            const take = [];
            for (let hop = 0; hop < reachHops && ring.length; hop++) {
                const next = [];
                for (const c of ring) for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) {
                    const nb = adjList[k];
                    if (label[nb] || !mask[nb] || type[nb] !== CrustType.OCEAN) continue;
                    label[nb] = label[c]; next.push(nb);
                    if (label[nb] === 1) take.push(nb);
                }
                ring = next;
            }
            if (take.length < minCells) continue;
            const fresh = world.addPlate(oceanPlateName(world));
            fresh.setQuat(P.quat.slice());
            fresh.omega = P.omega.slice();                                   // it starts as it was; the torque balance takes it from there
            fresh.isOceanBorn = true;
            for (const [tip, dir] of P.wings) if (label[tip] === 1 && !coast[tip]) { fresh.wings.set(tip, dir); P.wings.delete(tip); }   // (wing tips go with their half)
            if (!transferCells(world, P, fresh, take)) { fresh.alive = false; continue; }
            fresh.born = time;
            for (const c of run) P.crust.armTrench(c, config.subductionInitSlabKm);
            P.dirty = true;
            started++;
            world.log(EventKind.PLATE_BORN, `${fresh.name} is born: ${(take.length * cellAreaKm2 / 1e6).toFixed(1)} Mkm² of ${P.name}’s old ocean breaks away`, { plate: fresh.id, areaMkm2: take.length * cellAreaKm2 / 1e6 });
            world.log(EventKind.SUBDUCTION_INIT, `a new trench founders along ${lengthKm.toFixed(0)} km of ${P.name}’s passive margin: ${fresh.name}, ocean ${ageMyr.toFixed(0)} Myr old, begins to go down beneath it`,
                { upper: P.id, lower: fresh.id, lengthKm, ageMyr });
            break;                                                           // (one a plate at a time: the plate has changed)
        }
    }
    return started;
}

/** The longest run of cells joined to one another (a trench is one line, not scattered specks). */

/** Which side founders: against land, the ocean; ocean against ocean, the older (colder, denser) side. */
function chooseFoundering(world, A, B, segment) {
    const { mesh, owner, ownerCell } = world, { xyz, index } = mesh;
    let ageA = 0, ageB = 0, landA = 0, landB = 0, n = 0;
    for (const w of segment) {
        const cellA = A.cellAt(index, xyz[3 * w], xyz[3 * w + 1], xyz[3 * w + 2]);
        const cellB = B.cellAt(index, xyz[3 * w], xyz[3 * w + 1], xyz[3 * w + 2]);
        if (A.crust.mask[cellA]) { ageA += A.crust.formedAt[cellA]; if (A.crust.type[cellA] !== CrustType.OCEAN) landA++; }
        if (B.crust.mask[cellB]) { ageB += B.crust.formedAt[cellB]; if (B.crust.type[cellB] !== CrustType.OCEAN) landB++; }
        n++;
    }
    if (landA !== landB) return landA > landB ? { upper: A, lower: B } : { upper: B, lower: A };
    return ageA <= ageB ? { upper: A, lower: B } : { upper: B, lower: A };     // the older crust (formed earlier) sinks
}

/** Arm a trench on the upper plate's cells along the segment, and give it a starting slab. */
function armMargin(world, upper, lower, segment) {
    const { mesh, config } = world, { xyz, index } = mesh;
    for (const w of segment) {
        const q = upper.cellAt(index, xyz[3 * w], xyz[3 * w + 1], xyz[3 * w + 2]);
        if (!upper.crust.mask[q]) continue;
        upper.crust.armTrench(q, config.subductionInitSlabKm);
        // its neighbours along the line too, so the new trench is continuous on the upper plate's own lattice
        for (let k = mesh.adjOffset[q]; k < mesh.adjOffset[q + 1]; k++) {
            const nb = mesh.adjList[k];
            if (upper.crust.mask[nb] && upper.crust.type[nb] === CrustType.OCEAN && isOnSegment(world, lower, nb, upper)) upper.crust.armTrench(nb, config.subductionInitSlabKm);
        }
    }
    upper.dirty = true;
}

/**
 * Is `cell` of `upper` at the contact with `lower` (its world position sits within a cell of lower's crust)? Read from
 * lower's raster, not the world view: lower may have been carved out of the passive ocean this very step.
 */
function isOnSegment(world, lower, cell, upper) {
    const { xyz, index, adjOffset, adjList } = world.mesh, P = [0, 0, 0];
    upper.toWorld(xyz[3 * cell], xyz[3 * cell + 1], xyz[3 * cell + 2], P);
    const q = lower.cellAt(index, P[0], P[1], P[2]);
    if (lower.crust.mask[q]) return true;
    for (let k = adjOffset[q]; k < adjOffset[q + 1]; k++) if (lower.crust.mask[adjList[k]]) return true;
    return false;
}
