// Resolve: rebuild the world view for "now" AND settle what plate motion did to the crust.
//   • two plates claim a cell → convergence: the subducting crust is deleted (polarity.js);
//                               land against land is left overlapping and reported as a collision
//   • no plate claims a cell  → divergence: new ocean crust grows on the flanking plates, split
//                               along the gap's mid-line (never on the passive background)
// Afterwards every world cell has an owner. `ownerCell` always points at real crust; the few cells
// that may not be filled yet are flagged in `world.provisional` (see assignGapOwners).

import { CrustType, CrustFlag } from '../model/crust.js';
import { Provisional } from '../model/world.js';
import { CM_PER_YR_TO_RAD_PER_MYR } from '../config.js';
import { forEachClaim, clearWorldView } from './gather.js';
import { overrides } from './polarity.js';
import { binIndex, markBin, mayHaveCrustNear } from './occupancy.js';
import { ringsOf, RING_COUNT } from '../../core/mesh-rings.js';
import { fractureCoordinate } from '../model/segments.js';

// How far the growth step looks, in cells. Both assume a gap opens by a cell or so per step, each flank growing its half
// (config.maxCellsPerStep ≲ 2.25 — the whole-planet scenes' — about a cell a flank): raise that and these must grow with it.
const REACH_RINGS = 2;        // rings of raster cells around a gap cell that are considered for growth
const AHEAD_CONE = 0.5;        // cos 60°: crust counts as "ahead" of a moving edge if it lies within 60° of the motion
const PROXIMITY_RINGS = 3;    // how far from existing crust a new cell may be, and how far "nearby" crust is sought
if (PROXIMITY_RINGS > RING_COUNT) throw new Error('core/mesh-rings.js keeps too few rings for the growth step');

/** @returns {{created:number, consumed:number, collisionCells:number}} this step's tallies, in cells */
export function resolve(world) {
    world.occupancyStamp++;                            // this pass's mark in the coarse occupancy bins (step/occupancy.js)
    const consumed = gatherAndSubduct(world);
    const gaps = [];
    for (let w = 0; w < world.owner.length; w++) if (world.owner[w] < 0) gaps.push(w);
    const created = gaps.length ? growCrustIntoGaps(world, gaps) : 0;
    if (gaps.length) assignGapOwners(world, gaps);
    world.budget.created += created;
    world.budget.consumed += consumed;

    let collisionCells = 0;
    for (let w = 0; w < world.landClaims.length; w++) if (world.landClaims[w] > 1) collisionCells++;
    for (const p of world.plates) {
        if (p.alive && p.dirty) p.refreshExtent(world.mesh.xyz);
        p.reshaped = false;                            // the world view is current again for every plate
    }
    return { created, consumed, collisionCells };
}

// ─────────────────────────────── convergence ───────────────────────────────

function gatherAndSubduct(world) {
    const { owner, ownerCell, claimCount, landClaims, consumedAt, collider, plates } = world;
    let consumed = 0;
    const subduct = (plate, cell, w) => { plate.crust.remove(cell); plate.dirty = true; consumedAt[w] = 1; consumed++; };
    const bins = binIndex(world.mesh), stamp = world.occupancyStamp;
    clearWorldView(world);

    forEachClaim(world, (w, plate, cell) => {
        markBin(plate, bins.binOf[w], stamp, bins.count);
        const land = plate.crust.type[cell] !== CrustType.OCEAN;
        const holder = owner[w] < 0 ? null : plates[owner[w]];
        // no holder yet — or its crust here was just subducted via another world cell that maps to the same raster cell
        if (!holder || !holder.crust.mask[ownerCell[w]]) {
            owner[w] = plate.id; ownerCell[w] = cell;
            claimCount[w] = 1; landClaims[w] = land ? 1 : 0;
            return;
        }
        const wins = overrides(plate, cell, holder, ownerCell[w], world.oceanOverrider[w]);
        if (wins === null) {                            // land on land — unresolved collision
            claimCount[w]++; landClaims[w]++;
            if (collider[w] < 0) collider[w] = plate.id;
        } else if (wins) {                              // the holder's crust goes down
            subduct(holder, ownerCell[w], w);
            owner[w] = plate.id; ownerCell[w] = cell;
            if (land) landClaims[w] = 1;
        } else subduct(plate, cell, w);                 // this plate's crust goes down
    });

    // A raster cell can be the nearest one for two world cells; if it was subducted through one of them,
    // the other must not keep pointing at it.
    for (let w = 0; w < owner.length; w++) if (owner[w] >= 0 && !plates[owner[w]].crust.mask[ownerCell[w]]) { owner[w] = -1; claimCount[w] = 0; landClaims[w] = 0; }
    return consumed;
}

// ─────────────────────────────── divergence ───────────────────────────────
// Symmetric spreading: each flank takes the half of a gap on its side of the mid-line, so the ridge
// sits mid-way and migrates at the mean of the two plate velocities.
//
// Growth happens on each plate's OWN lattice: plate X creates exactly those of its raster cells whose
// true centres (a) lie in the gap, (b) are nearer to X's existing crust than to any other plate's —
// by at least half a cell, because a cell's footprint reaches half a cell past its centre — and
// (c) are not at an edge of X that is advancing on a neighbour. Deciding per WORLD cell instead is
// subtly biased: a plate's lattice is rotated against the world's, a created cell lands up to half a
// cell off the world cell it stands for, and the faster-moving plate creeps outward every step.
// All tests use the crust as it was before this step, so plate order cannot matter. The passive
// background never grows: beside it, the moving plate takes the whole gap.

function growCrustIntoGaps(world, gaps) {
    const growers = world.plates.filter(p => p.alive && !p.isBackground && p.crust.count > 0);
    const everyone = world.plates.filter(p => p.alive && p.crust.count > 0).map(plate => ({ plate, cap: plate.capInWorld(world.mesh) }));
    const births = [];
    for (const grower of growers) {
        for (const cell of candidateCells(world, grower, gaps)) {
            const verdict = decideBirth(world, grower, cell, everyone);
            if (verdict.born) births.push({ plate: grower, cell, trenchParent: verdict.trenchParent });
        }
    }
    const bins = binIndex(world.mesh), P = [0, 0, 0];
    for (const { plate, cell, trenchParent } of births) {
        const crust = plate.crust;
        crust.create(cell, CrustType.OCEAN, world.time);
        plate.toWorld(world.mesh.xyz[3 * cell], world.mesh.xyz[3 * cell + 1], world.mesh.xyz[3 * cell + 2], P);
        crust.fzU[cell] = fractureAt(world, plate, cell, P);
        markBin(plate, bins.at(P[0], P[1], P[2]), world.occupancyStamp, bins.count);       // so the owner search below sees it
        // Trench rollback, in its simplest form: when a plate backs away from its own trench, the trench is
        // not left behind inside the plate — it stays at the plate's edge, on the new crust that forms
        // there, and keeps its slab (WBP's trailing-edge margin; arcs and back-arc basins come later).
        if (trenchParent >= 0) { crust.armTrench(cell, crust.slabKm[trenchParent]); crust.flags[cell] |= CrustFlag.APRON; }
        plate.dirty = true;
    }
    return births.length;
}

/**
 * Where along its ridge new floor at world point P forms (records only: model/segments.js): its coordinate about the
 * relative rotation of the grower and the plate across the gap — the most frequent other owner around P's world cell
 * (the passive ocean, or no one, counts as still).
 */
function fractureAt(world, grower, cell, P) {
    const { index, adjOffset, adjList } = world.mesh, { owner, plates } = world, w = index.nearest(P[0], P[1], P[2]);
    // (across the gap, ring by ring through the gap's own cells, to the first ring that meets another plate: a gap is often
    // wider than a cell, and the grower alone around a cell would measure about its own rotation, not the ridge's)
    let partner = -1, most = 0, ring = [w];
    const seen = new Set(ring), count = new Map();
    for (let hop = 0; hop < 8 && ring.length && partner < 0; hop++) {
        const next = [];
        for (const q of ring) for (let k = adjOffset[q] - 1; k < adjOffset[q + 1]; k++) {
            const r = k < adjOffset[q] ? q : adjList[k], o = owner[r];
            if (o >= 0 && o !== grower.id) { const c = (count.get(o) ?? 0) + 1; count.set(o, c); if (c > most) { most = c; partner = o; } }
            else if (o < 0 && !seen.has(r)) { seen.add(r); next.push(r); }
        }
        ring = next;
    }
    // (their rotations averaged over ~20 Myr — simulate.js: the steady spreading pole, not the step's wobble)
    const other = partner >= 0 && !plates[partner].isBackground ? plates[partner].omegaSlow ?? plates[partner].omega : [0, 0, 0], g = grower.omegaSlow ?? grower.omega;
    // (oriented by plate id, so both flanks of a ridge measure about the same pole)
    const rel = partner < 0 || grower.id < partner ? [g[0] - other[0], g[1] - other[1], g[2] - other[2]] : [other[0] - g[0], other[1] - g[1], other[2] - g[2]];
    // (in the grower's own frame: a fracture zone is fixed to the plate's floor, not to the world the ridge drifts across —
    // about a steady relative pole the coordinate of new floor then stays the same along each strip)
    const { xyz } = world.mesh, a = grower.toPlateFrame(rel[0], rel[1], rel[2], [0, 0, 0]);
    return fractureCoordinate(xyz[3 * cell], xyz[3 * cell + 1], xyz[3 * cell + 2], a);
}

/** Raster cells of `grower` that stand under a gap cell, plus a small neighbourhood of them. (Exported, like decideBirth, so a debugging script can ask why a cell was or was not born.) */
export function candidateCells(world, grower, gaps) {
    const { xyz, index, adjOffset, adjList, numCells } = world.mesh, cap = grower.capInWorld(world.mesh), mask = grower.crust.mask;
    const bins = binIndex(world.mesh), stamp = world.occupancyStamp;
    // (the cells seen, in the order first seen: marks instead of a Set — the same cells in the same order)
    const seen = seenMarks(numCells), mark = seen.stamp, marks = seen.marks, order = [];
    let ring = [];
    for (const g of gaps) {
        const x = xyz[3 * g], y = xyz[3 * g + 1], z = xyz[3 * g + 2];
        if (x * cap[0] + y * cap[1] + z * cap[2] < cap[3]) continue;
        if (!mayHaveCrustNear(grower, bins.binOf[g], stamp, bins)) continue;             // a gap nowhere near this plate: nothing could attach
        const c = grower.cellAt(index, x, y, z);
        if (marks[c] !== mark) { marks[c] = mark; order.push(c); ring.push(c); }
    }
    for (let r = 0; r < REACH_RINGS; r++) {
        const next = [];
        for (const c of ring) for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) { const nb = adjList[k]; if (marks[nb] !== mark) { marks[nb] = mark; order.push(nb); next.push(nb); } }
        ring = next;
    }
    return order.filter(c => !mask[c]);
}
let seen = null;
/** A fresh mark on a cell-sized array (no clearing between uses). */
function seenMarks(numCells) {
    if (!seen || seen.marks.length !== numCells) seen = { marks: new Uint32Array(numCells), stamp: 0 };
    if (++seen.stamp === 0xFFFFFFFF) { seen.marks.fill(0); seen.stamp = 1; }
    return seen;
}

/**
 * May `grower` create its raster cell `cell` this step?
 * @returns {{born: boolean, why?: string, trenchParent?: number}} `why` names the rule that said no (for debugging)
 */
export function decideBirth(world, grower, cell, everyone) {
    const { mesh, config } = world, { xyz, edgeRad } = mesh;
    const p = grower.toWorld(xyz[3 * cell], xyz[3 * cell + 1], xyz[3 * cell + 2], [0, 0, 0]);
    const own = nearestCrust(grower, mesh, p);
    if (own.cell < 0) return { born: false, why: 'not attached to this plate’s crust' };

    const bins = binIndex(mesh), bin = bins.at(p[0], p[1], p[2]), stamp = world.occupancyStamp;
    let rivalDot = -2, neighbour = null, neighbourHit = null;
    for (const { plate, cap } of everyone) {
        if (plate === grower || p[0] * cap[0] + p[1] * cap[1] + p[2] * cap[2] < cap[3]) continue;
        if (!mayHaveCrustNear(plate, bin, stamp, bins)) continue;                        // nothing of that plate anywhere near
        const under = plate.cellAt(mesh.index, p[0], p[1], p[2]);
        if (plate.crust.mask[under]) return { born: false, why: 'not a gap: another plate has crust here' };   // (a)
        const hit = nearestCrust(plate, mesh, p, under);
        if (hit.cell < 0) continue;                                         // that plate has nothing nearby
        if (!plate.isBackground && hit.dot > rivalDot) rivalDot = hit.dot;
        if (!neighbourHit || hit.dot > neighbourHit.dot) { neighbourHit = hit; neighbour = plate; }
    }
    // (b) on this plate's side of the mid-line, with half a cell to spare
    if (rivalDot > -2 && Math.acos(Math.min(1, rivalDot)) - Math.acos(Math.min(1, own.dot)) < edgeRad) return { born: false, why: 'too close to the mid-line' };
    // (c) not where this plate's edge is advancing on the crust in front of it
    if (neighbour && isAdvancingOn(grower, neighbour, neighbourHit.cell, mesh, p, config.closingCmYr)) return { born: false, why: 'closing boundary' };

    // Trench rollback: crust created beside a trench cell carries the trench on, so a trailing trench stays at the
    // plate's edge. On a WING (step/wings.js) only crust beside or ahead of the trench inherits — a gap can open
    // behind a wing's tip as the plate moves on, and what fills it is ordinary ocean.
    const parentIsTrench = (grower.crust.flags[own.cell] & CrustFlag.TRENCH) && grower.crust.type[own.cell] === CrustType.OCEAN
        && (grower.crust.wingKm[own.cell] === 0 || !isBehind(grower, own.cell, cell, mesh));
    return { born: true, trenchParent: parentIsTrench ? own.cell : -1 };
}

/**
 * Gap cells that are still empty need an owner for this step's world view. They are the ridge axis (no
 * plate's cell centre is safely on its own side yet) or a jitter hole at a closing boundary. Each goes
 * to the nearest plate that may grow, points at that plate's nearest REAL crust cell, and is marked
 * provisional so that views can draw it and nothing mistakes it for crust.
 */
function assignGapOwners(world, gaps) {
    const { mesh, owner, ownerCell, claimCount, provisional, provisionalLike, plates, config } = world, { xyz, index } = mesh;
    const everyone = plates.filter(p => p.alive && p.crust.count > 0), bins = binIndex(mesh), stamp = world.occupancyStamp;
    const p = [0, 0, 0];
    for (const g of gaps) {
        p[0] = xyz[3 * g]; p[1] = xyz[3 * g + 1]; p[2] = xyz[3 * g + 2];
        const bin = bins.binOf[g], near = everyone.filter(plate => mayHaveCrustNear(plate, bin, stamp, bins));
        let best = null, bestHit = null, foreign = null, foreignHit = null;
        const under = [];
        for (const plate of near) {
            const cell = plate.cellAt(index, p[0], p[1], p[2]);
            under.push(cell);
            if (plate.crust.mask[cell]) { best = plate; bestHit = { dot: 1, cell, real: true }; break; }     // filled this step
        }
        if (!best) {
            // (each plate's nearest crust found once, for both searches)
            const hits = near.map((plate, i) => nearestCrust(plate, mesh, p, under[i]));
            near.forEach((plate, i) => {
                const hit = hits[i];
                if (hit.cell < 0) return;
                if (!plate.isBackground && (!bestHit || hit.dot > bestHit.dot)) { best = plate; bestHit = hit; }
            });
            near.forEach((plate, i) => {
                if (plate === best) return;
                const hit = hits[i];
                if (hit.cell >= 0 && (!foreignHit || hit.dot > foreignHit.dot)) { foreign = plate; foreignHit = hit; }
            });
        }
        if (!best) continue;                               // nothing within reach: stays a gap and is reported as one
        owner[g] = best.id; ownerCell[g] = bestHit.cell; claimCount[g] = 1;
        if (bestHit.real) continue;
        const closing = foreign && isAdvancingOn(best, foreign, foreignHit.cell, mesh, p, config.closingCmYr);
        provisional[g] = closing ? Provisional.LIKE_NEIGHBOUR : Provisional.NEWBORN;
        provisionalLike[g] = bestHit.cell;
    }
}

// ─────────────────────────────── geometry helpers ───────────────────────────────

/**
 * Is plate X advancing on plate Y's crust at world position p? True if X moves, relative to Y, faster
 * than `closingCmYr` AND Y's nearest crust lies ahead of that motion (within AHEAD_CONE of it). Where X
 * slides past Y, or backs away from it, the answer is no — so holes on a transform margin get filled.
 * (Judged from the motion rather than from the edge's normal: a one-cell normal is mostly lattice noise.)
 */
function isAdvancingOn(X, Y, foreignCell, mesh, p, closingCmYr) {
    const { xyz } = mesh;
    const ox = X.omega[0] - Y.omega[0], oy = X.omega[1] - Y.omega[1], oz = X.omega[2] - Y.omega[2];
    const vx = oy * p[2] - oz * p[1], vy = oz * p[0] - ox * p[2], vz = ox * p[1] - oy * p[0];              // ω_rel × p
    const speed = Math.hypot(vx, vy, vz);
    if (speed <= closingCmYr * CM_PER_YR_TO_RAD_PER_MYR) return false;
    const q = Y.toWorld(xyz[3 * foreignCell], xyz[3 * foreignCell + 1], xyz[3 * foreignCell + 2], [0, 0, 0]);
    const dx = q[0] - p[0], dy = q[1] - p[1], dz = q[2] - p[2], distance = Math.hypot(dx, dy, dz);
    if (distance < 1e-9) return true;
    return (dx * vx + dy * vy + dz * vz) / (distance * speed) > AHEAD_CONE;
}

/** Is raster cell `cell` behind `edgeCell` — away from the side where the plate has no crust (by more than ~110°)? */
function isBehind(plate, edgeCell, cell, mesh) {
    const { xyz, adjOffset, adjList } = mesh, mask = plate.crust.mask;
    let nx = 0, ny = 0, nz = 0, open = 0;
    for (let k = adjOffset[edgeCell]; k < adjOffset[edgeCell + 1]; k++) {
        const nb = adjList[k];
        if (mask[nb]) continue;
        open++; nx += xyz[3 * nb] - xyz[3 * edgeCell]; ny += xyz[3 * nb + 1] - xyz[3 * edgeCell + 1]; nz += xyz[3 * nb + 2] - xyz[3 * edgeCell + 2];
    }
    if (!open) return false;
    const dx = xyz[3 * cell] - xyz[3 * edgeCell], dy = xyz[3 * cell + 1] - xyz[3 * edgeCell + 1], dz = xyz[3 * cell + 2] - xyz[3 * edgeCell + 2];
    return (dx * nx + dy * ny + dz * nz) / (Math.hypot(dx, dy, dz) * Math.hypot(nx, ny, nz) || 1) < -0.35;
}

/**
 * Nearest crust in the plate's raster to world position p, searching a few rings around it in the
 * plate's frame: { dot: cosine of the angular distance, cell } — cell = −1 (dot = −2) if none is near.
 * `under`: the plate's raster cell under p if the caller has it already (plate.cellAt — the same lookup).
 */
function nearestCrust(plate, mesh, p, under = -1) {
    const { xyz, index } = mesh, mask = plate.crust.mask;
    const l = plate.toPlateFrame(p[0], p[1], p[2], scratch.l);
    // Rings are read from a table built once per mesh (this runs millions of times per history): the same cells in
    // the same order as a ring-by-ring search from the nearest cell, so the answer — ties included — is unchanged.
    const { start, cells, stride } = ringsOf(mesh), base = (under >= 0 ? under : index.nearest(l[0], l[1], l[2])) * stride;
    let best = -2, bestCell = -1;
    for (let r = 0; r <= PROXIMITY_RINGS; r++) {
        for (let i = start[base + r], e = start[base + r + 1]; i < e; i++) {
            const c = cells[i];
            if (mask[c]) {
                const d = l[0] * xyz[3 * c] + l[1] * xyz[3 * c + 1] + l[2] * xyz[3 * c + 2];
                if (d > best) { best = d; bestCell = c; }
            }
        }
        if (bestCell >= 0 && r >= 1) break;      // one ring past the first hit guarantees the true nearest
    }
    return { dot: best, cell: bestCell };
}
const scratch = { l: [0, 0, 0] };

