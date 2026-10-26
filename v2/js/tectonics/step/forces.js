// Plate driving forces, gathered from the resolved world view. "Subduction is active; ridges and
// rifts are passive" (WBP): forces come from the STATE of a boundary — the persistent trench flag,
// what crust is on each side, how old it is, how much slab the trench has — never from how fast the
// plates happen to be moving, so a world at rest can start itself.
//
// Per boundary cell of plate A, facing plate B along normal n (pointing at B):
//   slab pull      A's ocean goes down B's trench       +n × slabPull    × age factor × slab maturity  (on A)
//   slab suction   A carries the trench, B goes down    +n × slabSuction × age factor × slab maturity  (on A)
//   ridge push     young ocean of A meets young ocean   −n × ridgePush                                  (on A)
//   rift push      a fresh rift: A's rifted margin (or its young ocean) faces B's across a rift younger than
//                  riftPushMyr                            −n × riftPush × (1 − age/riftPushMyr)             (on A)
//                  — the uplifted shoulders of a new rift drive its sides apart along the whole line. It acts in ONE
//                  direction per plate, straight away from its partner (fixed at the split), not along the local
//                  normal: along a winding rift the local normals point every way and would only spin the halves
// And one force that is not at a boundary:
//   mantle flow    per 10⁴ km² of continental crust: the mantle's flow drags on continents' deep roots — out from the
//                  upwelling under the last supercontinent, toward the downwelling where the next will gather
//                  (Phase 13, step/supercontinent.js) — and, while the pieces of a supercontinent disperse, away from
//                  the other continents near it (steered: they keep apart until it is time to gather). A bias, not a
//                  driver; it is left out of a plate's tension (the tug of war between its boundaries, which decides
//                  whether it rifts).
// A trench that has only just formed has no slab hanging from it yet, so it pulls weakly and
// strengthens as crust goes down (slabMatureKm). Forces are per 100 km of boundary, measured along the
// cell edges actually shared with the other plate — not per boundary cell — so totals do not depend on
// the mesh resolution or on how jagged an outline is.
//
// Two things here are couplings rather than forces — they depend on velocity, so they are only
// tallied here and enter the balance in torque-balance.js:
//   slab resistance   the mantle resists a slab sinking through it, in proportion to the convergence rate
//   collision lock    where land overlaps land, the two plates are viscously tied together

import { CrustType, CrustFlag } from '../model/crust.js';
import { contactAt } from './contact.js';
import { areYoungRiftPartners } from './collision.js';
import { ringsOf } from '../../core/mesh-rings.js';
import { tangentToward } from '../../core/sphere-geom.js';
import { mantleFlowAt, dispersalField, repelAt } from './supercontinent.js';

/** Force names, in the order of PlateLoad.byKind / forceByKind. Display code keys colours by these names. */
export const FORCE_KINDS = ['slab pull', 'slab suction', 'ridge push', 'rift push', 'mantle flow'];
const PULL = 0, SUCTION = 1, RIDGE = 2, RIFT = 3, FLOW = 4;

/**
 * @typedef {Object} PlateLoad
 * @property {number[]} torque            net driving torque (world frame)
 * @property {number[][]} byKind          torque per force kind
 * @property {number[][]} forceByKind     vector sum of the forces per kind (for display arrows)
 * @property {number} torqueMagnitudeSum  Σ |r × F| over the boundary forces — compare with |Σ r × F| to see how much cancels
 * @property {number[]} flowTorque        the mantle flow's share of `torque` (not a boundary force: left out of the tension)
 * @property {number[]} cells             boundary cells contributing, per kind
 * @property {{r:number[], n:number[], other:number, length:number}[]} slabs     where this plate's ocean goes down a trench
 * @property {{r:number[], n:number[], other:number, weight:number}[]} contacts  land-on-land overlap cells (weight > 1 where a craton is
 *                                                                             involved; n: the front's normal there, toward the other plate)
 */

/** @returns {Map<number, PlateLoad>} loads for every living, non-background plate */
export function gatherLoads(world) {
    const { mesh, owner, ownerCell, plates, landClaims, collider, time, config } = world;
    const { xyz, numCells, edgeKm } = mesh;
    const edgeLength = edgeKm / Math.sqrt(3) / 100;       // one shared cell edge, in units of 100 km (hexagonal cells)
    const loads = new Map(), loadOf = [];
    for (const p of plates) if (p.alive && !p.isBackground && p.crust.count > 0) { const l = newLoad(); loads.set(p.id, l); loadOf[p.id] = l; }
    const n = [0, 0, 0, 0];
    const ageFactor = formedAt => Math.sqrt(Math.min(1, Math.max(0, time - formedAt) / config.slabPullAgeRefMyr));
    const maturity = (crust, cell) => Math.min(1, crust.slabKm[cell] / config.slabMatureKm);
    const isYoung = (crust, cell) => crust.formedAt[cell] >= 0 && time - crust.formedAt[cell] < config.ridgeMaxAgeMyr;
    const flowing = world.cycle?.up && (config.mantleOutflow > 0 || config.mantleInflow > 0 || config.dispersalRepulsion > 0), flow = [0, 0, 0];
    const apart = flowing ? dispersalField(world) : null;
    const flowArea = mesh.cellAreaKm2 / 1e4;

    for (let w = 0; w < numCells; w++) {
        const a = owner[w];
        if (a < 0) continue;
        const r0 = xyz[3 * w], r1 = xyz[3 * w + 1], r2 = xyz[3 * w + 2];
        if (flowing) {                                      // the mantle's flow drags on a continent's root
            const load = loadOf[a], t = plates[a].crust.type[ownerCell[w]];
            if (load && (t === CrustType.CONTINENT || t === CrustType.CRATON)) {
                mantleFlowAt(world, r0, r1, r2, flow);
                if (apart) repelAt(apart, a, r0, r1, r2, flow);
                const fx = flow[0] * flowArea, fy = flow[1] * flowArea, fz = flow[2] * flowArea;
                const tx = r1 * fz - r2 * fy, ty = r2 * fx - r0 * fz, tz = r0 * fy - r1 * fx;
                load.torque[0] += tx; load.torque[1] += ty; load.torque[2] += tz;
                load.flowTorque[0] += tx; load.flowTorque[1] += ty; load.flowTorque[2] += tz;
                const k = load.byKind[FLOW]; k[0] += tx; k[1] += ty; k[2] += tz;
                const v = load.forceByKind[FLOW]; v[0] += fx; v[1] += fy; v[2] += fz;
                load.cells[FLOW]++;
            }
        }
        if (landClaims[w] > 1 && collider[w] >= 0) {        // land on land: tie the two plates together here
            const r = [r0, r1, r2], other = plates[collider[w]], otherCell = other.cellAt(mesh.index, r0, r1, r2);
            // (not along a fresh rift itself, where the two margins jitter against each other — elsewhere the halves of a rift
            // lock like any colliding plates: a third plate may drive them back together)
            if (areYoungRiftPartners(plates[a], other, time, config) && (plates[a].crust.flags[ownerCell[w]] & CrustFlag.RIFT_MARGIN) && (other.crust.flags[otherCell] & CrustFlag.RIFT_MARGIN)) continue;
            if (plates[a].crust.type[ownerCell[w]] === CrustType.ARC || other.crust.type[otherCell] === CrustType.ARC) continue;   // arc crust is scraped off, it does not lock plates (step/collision.js)
            const craton = plates[a].crust.type[ownerCell[w]] === CrustType.CRATON || other.crust.type[otherCell] === CrustType.CRATON;
            const weight = craton ? config.cratonLockFactor : 1;         // cratons never underthrust: the lock hardens
            const nAB = frontNormal(world, w, a, collider[w], r);
            loadOf[a]?.contacts.push({ r, n: nAB, other: collider[w], weight });
            loadOf[collider[w]]?.contacts.push({ r, n: [-nAB[0], -nAB[1], -nAB[2]], other: a, weight });
            continue;
        }
        const load = loadOf[a];
        if (!load) continue;
        const across = contactAt(world, w, n);
        if (across < 0) continue;
        const A = plates[a].crust, cellA = ownerCell[w], B = plates[owner[across]].crust, cellB = ownerCell[across];
        const oceanA = A.type[cellA] === CrustType.OCEAN, oceanB = B.type[cellB] === CrustType.OCEAN;
        const trenchA = (A.flags[cellA] & CrustFlag.TRENCH) !== 0, trenchB = (B.flags[cellB] & CrustFlag.TRENCH) !== 0;
        const length = edgeLength * n[3];

        let kind = -1, size = 0, rAge;
        if (trenchB && oceanA && !trenchA) {
            kind = PULL; size = config.slabPull * ageFactor(A.formedAt[cellA]) * maturity(B, cellB);
            load.slabs.push({ r: [r0, r1, r2], n: [n[0], n[1], n[2]], other: owner[across], length });
        } else if (trenchA && oceanB && !trenchB) { kind = SUCTION; size = config.slabSuction * ageFactor(B.formedAt[cellB]) * maturity(A, cellA); }
        else if ((rAge = riftAge(plates[a], A, cellA, plates[owner[across]], B, cellB, time)) < config.riftPushMyr) { kind = RIFT; size = -config.riftPush * (1 - rAge / config.riftPushMyr); }
        else if (oceanA && oceanB && isYoung(A, cellA) && isYoung(B, cellB)) { kind = RIDGE; size = -config.ridgePush; }
        if (kind < 0 || size === 0) continue;

        let dir = n;
        // a rift pushes a plate in ONE direction, straight away from its partner (riftPushDir, fixed at the split) — not along
        // the local normal. `size` is negative for the pushes (away from n); along riftPushDir the push is + that direction.
        if (kind === RIFT && plates[a].riftPushDir) { dir = plates[a].toWorld(plates[a].riftPushDir[0], plates[a].riftPushDir[1], plates[a].riftPushDir[2], [0, 0, 0]); size = Math.abs(size); }
        const f = size * length, fx = dir[0] * f, fy = dir[1] * f, fz = dir[2] * f;
        const tx = r1 * fz - r2 * fy, ty = r2 * fx - r0 * fz, tz = r0 * fy - r1 * fx;      // r × F
        load.torque[0] += tx; load.torque[1] += ty; load.torque[2] += tz;
        const k = load.byKind[kind]; k[0] += tx; k[1] += ty; k[2] += tz;
        const v = load.forceByKind[kind]; v[0] += fx; v[1] += fy; v[2] += fz;
        load.torqueMagnitudeSum += Math.hypot(tx, ty, tz);
        load.cells[kind]++;
    }
    return loads;
}

/**
 * The collision front's normal at overlap cell w, pointing from plate a's side toward plate b's: from a's own land
 * within three rings of it to b's own land (the overlap itself excluded) — or, with neither in reach, from a's centre
 * toward b's.
 */
function frontNormal(world, w, a, b, r) {
    const { mesh, owner, ownerCell, plates, landClaims } = world, { xyz } = mesh, { start, cells, stride } = ringsOf(mesh);
    let vx = 0, vy = 0, vz = 0;
    for (let i = start[w * stride + 1]; i < start[w * stride + stride - 1]; i++) {
        const q = cells[i], o = owner[q];
        if (o !== a && o !== b) continue;
        if (landClaims[q] > 1 || plates[o].crust.type[ownerCell[q]] === CrustType.OCEAN) continue;
        const s = o === b ? 1 : -1;
        vx += s * xyz[3 * q]; vy += s * xyz[3 * q + 1]; vz += s * xyz[3 * q + 2];
    }
    const d = vx * r[0] + vy * r[1] + vz * r[2];
    vx -= d * r[0]; vy -= d * r[1]; vz -= d * r[2];
    const l = Math.hypot(vx, vy, vz);
    if (l > 1e-9) return [vx / l, vy / l, vz / l];
    const A = plates[a], B = plates[b];
    return tangentToward(r, A.toWorld(A.capCenter[0], A.capCenter[1], A.capCenter[2], [0, 0, 0]), B.toWorld(B.capCenter[0], B.capCenter[1], B.capCenter[2], [0, 0, 0]));
}

/**
 * How long ago the rift between these two cells opened, or Infinity if this is not a rift contact: both cells are
 * rifted margins (age = since the younger plate was born), or both are ocean born since the younger plate was.
 */
function riftAge(plateA, A, cellA, plateB, B, cellB, time) {
    const born = Math.max(plateA.born, plateB.born);
    if (plateA.riftPartner !== plateB.id || plateB.riftPartner !== plateA.id) return Infinity;     // real rift partners only
    // (a new ridge in an ocean plate: its old floor along the line is the margin — step/ocean-plates.js)
    const split = plateA.oceanSplitWith === plateB.id && plateB.oceanSplitWith === plateA.id;
    const marginA = split || (A.flags[cellA] & CrustFlag.RIFT_MARGIN) !== 0, marginB = split || (B.flags[cellB] & CrustFlag.RIFT_MARGIN) !== 0;
    const youngA = A.type[cellA] === CrustType.OCEAN && A.formedAt[cellA] >= born, youngB = B.type[cellB] === CrustType.OCEAN && B.formedAt[cellB] >= born;
    return (marginA || youngA) && (marginB || youngB) ? time - born : Infinity;
}

function newLoad() {
    const zero = () => [0, 0, 0];
    return { torque: zero(), flowTorque: zero(), byKind: FORCE_KINDS.map(zero), forceByKind: FORCE_KINDS.map(zero), torqueMagnitudeSum: 0, cells: FORCE_KINDS.map(() => 0), slabs: [], contacts: [] };
}
