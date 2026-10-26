// The supercontinent cycle (Phase 13; WBP Part Va): a supercontinent breaks up in a burst of rifts, its pieces disperse,
// and in a few hundred Myr they gather again into a new one — which in its turn breaks up. What drives it, as it is
// thought to work on Earth:
//   · a supercontinent is a lid on the mantle: heat builds up under it (thermal insulation — Anderson 1982, Gurnis 1988,
//     Coltice et al. 2007; world.mantleHeat, step/hotspots.js), it rifts readily over that heat — step/rifting.js scales a
//     plate's rift chance by the heat under it — and once its pieces have drifted off onto cooler mantle, rifting dies
//     down: breakup comes in a burst, then a quiet spell;
//   · the mantle flows: up under the last supercontinent, where the heat built up, and down along the ring of subduction
//     that surrounded it; the next supercontinent forms over that downwelling, about 90° from the last (orthoversion —
//     Mitchell, Kilian & Evans 2012). Here the flow drags gently on continents' roots (a basal traction, one more force in
//     step/forces.js): outward from the upwelling, as strong as the heat still under it — pushing the pieces apart after a
//     breakup and fading as that mantle cools — and toward a downwelling 90° away — gathering them again. Small next to
//     slab pull: plates still go where their trenches pull them; the flow only biases where they end up.
// This module watches the landmasses (every cycleCheckMyr). They are counted as a supercontinent sees them: land joined
// only by a neck narrower than cycleNeckKm is two landmasses, not one (a chain of continents linked by strips is not a
// supercontinent — developer). When the largest has held superShare of the continental crust for cycleHoldMyr, a
// supercontinent has formed — its centre becomes the upwelling, a downwelling is set on the ring 90° from it (where on
// the ring: the cycle's own seeded stream); when the largest has held no more than dispersedShare as long, it has broken
// up. (A start world that is one landmass is a supercontinent from the first step.)
//
// The cycle's pace is steered (developer: the supercontinent "really shouldnt happen until like 600 [Myr] in … its ok for
// us to put our hand on the scale here"). Each supercontinent draws a period, cyclePeriodMinMyr–cyclePeriodMaxMyr, from
// the cycle's stream: its pieces DISPERSE until cycleGatherMyr before it is up (and for at least cycleDisperseMinMyr after
// the breakup began) — the continents keep apart (dispersalRepulsion: a push away from every other continent near it) —
// and then GATHER: the downwelling's pull switches on, full strength until mantleInflowPackKm from it, so the pieces press
// together into one mass rather than stopping at first touch; the next supercontinent can only be counted then.

import { isContinental } from './hotspots.js';
import { EventKind } from '../model/world.js';
import { PLANET_RADIUS_KM } from '../../core/sim-mesh.js';
import { spreadKm } from '../../core/min-heap.js';

/** Watch the landmasses; move the mantle's upwelling and downwelling when a new supercontinent forms; keep the cycle's clock. */
export function trackCycle(world) {
    const { config, time, events } = world;
    if (!(config.mantleOutflow > 0 || config.mantleInflow > 0 || config.riftHeatGain > 0)) return;
    const cycle = world.cycle ??= { up: null, down: null, upHeat: 0, gather: 0, share: 1, landmasses: 1, state: 'dispersed', since: 0,
        phase: 'none', formedAt: 0, period: 0, breakupAt: null, gatherAt: Infinity, hold: 0, holdKm: 0, checkedAt: -Infinity, near: null, highSince: null, lowSince: null, seenEvents: 0 };
    // the breakup begins with the first rift since the supercontinent gathered (a rift while it was being counted too)
    for (; cycle.seenEvents < events.length; cycle.seenEvents++) {
        const e = events[cycle.seenEvents];
        if (e.kind !== EventKind.RIFT || !cycle.up || cycle.breakupAt !== null || e.time < cycle.formedAt - config.cycleHoldMyr - 1e-9) continue;
        cycle.breakupAt = e.time;
        cycle.gatherAt = Math.max(cycle.formedAt + cycle.period - config.cycleGatherMyr, e.time + config.cycleDisperseMinMyr);
    }
    if (time - cycle.checkedAt >= config.cycleCheckMyr - 1e-9 || !cycle.up) {
        cycle.checkedAt = time;
        const { largest, share, count } = landmasses(world);
        cycle.share = share; cycle.landmasses = count;
        // (the plates that make up much of the largest landmass: if it gathers too soon, they are the ones that come apart)
        const by = new Map();
        for (const w of largest) by.set(world.owner[w], (by.get(world.owner[w]) ?? 0) + 1);
        cycle.largestPlates = [...by].filter(([, n]) => n >= 0.15 * largest.length).map(([id]) => id);
        cycle.highSince = share >= config.superShare ? cycle.highSince ?? time : null;
        cycle.lowSince = share <= config.dispersedShare ? cycle.lowSince ?? time : null;
        const held = since => since !== null && time - since >= config.cycleHoldMyr - 1e-9;
        const may = !cycle.up ? cycle.highSince !== null : cycle.state !== 'assembled' && time >= cycle.gatherAt - 1e-9 && held(cycle.highSince);
        if (may) {
            // a supercontinent: its centre is the new upwelling; the downwelling somewhere on the ring 90° from it; its period
            const up = centroid(world.mesh.xyz, largest), [e1, e2] = basisAround(up), a = 2 * Math.PI * world.rngCycle();
            cycle.up = up;
            cycle.down = [Math.cos(a) * e1[0] + Math.sin(a) * e2[0], Math.cos(a) * e1[1] + Math.sin(a) * e2[1], Math.cos(a) * e1[2] + Math.sin(a) * e2[2]];
            cycle.period = config.cyclePeriodMinMyr + (config.cyclePeriodMaxMyr - config.cyclePeriodMinMyr) * world.rngCycle();
            cycle.formedAt = time; cycle.breakupAt = null; cycle.gatherAt = Infinity;
            cycle.holdKm = Math.sqrt(largest.length * world.mesh.cellAreaKm2 / Math.PI) + config.superHoldMarginKm;   // (its own footprint)
            cycle.near = null;
            cycle.state = 'assembled'; cycle.since = time;
            world.log(EventKind.SUPERCONTINENT, `a supercontinent: ${(100 * share).toFixed(0)} % of the continental crust in one landmass (${(largest.length * world.mesh.cellAreaKm2 / 1e6).toFixed(0)} Mkm²) — the mantle under it will warm; the next one will gather ~90° away, ~${cycle.period.toFixed(0)} Myr from now`,
                { share, areaMkm2: largest.length * world.mesh.cellAreaKm2 / 1e6, up: cycle.up, down: cycle.down, periodMyr: cycle.period });
        } else if (cycle.state === 'assembled' && held(cycle.lowSince)) {
            cycle.state = 'dispersed'; cycle.since = time;
            world.log(EventKind.DISPERSED, `the supercontinent has broken up: the largest landmass holds ${(100 * share).toFixed(0)} % of the continental crust`, { share, landmasses: count });
        }
    }
    cycle.upHeat = heatNear(world, cycle);
    // the clock: assembled (whole, heating) → dispersing (from the first rift) → gathering (from gatherAt, until the next is counted)
    cycle.phase = !cycle.up ? 'none' : cycle.breakupAt === null ? 'assembled' : time < cycle.gatherAt ? 'dispersing' : 'gathering';
    cycle.gather = cycle.phase === 'gathering' ? Math.min(1, (time - cycle.gatherAt) / config.cycleRampMyr) : 0;
    // while the pieces disperse, a landmass that has gathered much of the continental crust again too soon: its plates
    // come apart readily (step/rifting.js) — whether welded into one or only pressed together
    cycle.clump = cycle.phase === 'dispersing' && cycle.share > config.dispersalMaxShare ? cycle.largestPlates ?? null : null;
    // …and once gathered, the pull holds it together about its own centre until it first rifts (it formed over the downwelling:
    // a pull toward its centre presses it together without sliding it off the mantle it now heats — let go at once, pieces
    // that had not yet welded drifted apart again within ~40 Myr). Only over its own footprint (holdKm): pulling every
    // continent on the planet in welded them all into one plate, which had no boundaries left to pull it apart. Not the
    // start world: it is already whole.
    cycle.hold = cycle.phase === 'assembled' && cycle.formedAt > 0 ? 1 : 0;
}

/**
 * The mantle flow's drag at world position (x, y, z), into `out` (a tangent vector, per 10⁴ km² of continent): outward
 * from the upwelling, as strong as the heat still under it, fading to nothing 90° off it; and, while the pieces gather
 * (cycle.gather), toward the downwelling — at full strength until mantleInflowPackKm from it, so they press together there.
 */
export function mantleFlowAt(world, x, y, z, out) { return flowOfCycle(world.cycle, world.config, x, y, z, out); }

/** The same, from a cycle state as a frame carries it (frame.cycle) — the lab draws the flow with it. */
export function flowOfCycle(cycle, config, x, y, z, out) {
    out[0] = out[1] = out[2] = 0;
    if (!cycle?.up) return out;
    const add = (q, k) => {            // k × the unit tangent at p toward q
        const d = q[0] * x + q[1] * y + q[2] * z;
        let tx = q[0] - d * x, ty = q[1] - d * y, tz = q[2] - d * z;
        const l = Math.hypot(tx, ty, tz);
        if (l < 1e-9) return 0;
        out[0] += k * tx / l; out[1] += k * ty / l; out[2] += k * tz / l;
        return d;
    };
    const cu = cycle.up[0] * x + cycle.up[1] * y + cycle.up[2] * z, su = Math.sqrt(Math.max(0, 1 - cu * cu));
    if (cu > 0 && config.mantleOutflow > 0) add(cycle.up, -config.mantleOutflow * cycle.upHeat * 2 * su * cu);      // sin 2θ, outward
    const pull = (q, k) => {           // toward q, full strength until mantleInflowPackKm from it
        const cq = q[0] * x + q[1] * y + q[2] * z, km = Math.acos(Math.max(-1, Math.min(1, cq))) * PLANET_RADIUS_KM;
        add(q, k * Math.min(1, km / config.mantleInflowPackKm));
    };
    if (config.mantleInflow > 0 && cycle.gather > 0) pull(cycle.down, config.mantleInflow * cycle.gather);     // gathering at the downwelling
    if (config.mantleInflow > 0 && cycle.hold > 0 && Math.acos(Math.max(-1, Math.min(1, cu))) * PLANET_RADIUS_KM <= cycle.holdKm) pull(cycle.up, config.mantleInflow * cycle.hold);   // held together until it rifts
    return out;
}

/**
 * While the pieces disperse, the continents keep apart (a hand on the scale — developer): per continent of 1 Mkm² or more
 * (a plate's land), its centre and share of the land. null when not dispersing. repelAt reads it.
 */
export function dispersalField(world) {
    const { cycle, config, owner, plates } = world;
    if (!(config.dispersalRepulsion > 0) || cycle?.phase !== 'dispersing') return null;
    const { xyz, numCells, cellAreaKm2 } = world.mesh, sums = new Map();
    for (let w = 0; w < numCells; w++) {
        if (!isContinental(world, w)) continue;
        let s = sums.get(owner[w]);
        if (!s) sums.set(owner[w], s = [0, 0, 0, 0]);
        s[0] += xyz[3 * w]; s[1] += xyz[3 * w + 1]; s[2] += xyz[3 * w + 2]; s[3]++;
    }
    let total = 0;
    for (const s of sums.values()) total += s[3];
    const centres = [];
    for (const [id, s] of sums) {
        if (s[3] * cellAreaKm2 < 1e6 || plates[id].isBackground) continue;
        const l = Math.hypot(s[0], s[1], s[2]) || 1;
        // (its edge taken as the rim of a disc of its area about its centre: a big continent is ~4000 km across its middle)
        const radius = Math.sqrt(s[3] * cellAreaKm2 / Math.PI) / PLANET_RADIUS_KM, far = radius + config.dispersalRepulsionKm / PLANET_RADIUS_KM;
        // (cutoff: a cell whose dot with the centre is below it is clearly out of reach — the exact test would say so too)
        centres.push({ id, c: [s[0] / l, s[1] / l, s[2] / l], share: s[3] / total, radius, cutoff: far < Math.PI ? Math.cos(far) - 1e-9 : -3 });
    }
    // (not between two already in contact: the push keeps continents from meeting, it does not hold a collision open —
    // pushed apart at contact, one ground on unwelded; a clump that forms anyway rifts: step/rifting.js)
    const touching = new Set();
    for (let w = 0; w < numCells; w++) if (world.landClaims[w] > 1 && world.collider[w] >= 0) { touching.add(owner[w] * PAIR + world.collider[w]); touching.add(world.collider[w] * PAIR + owner[w]); }
    return { centres, touching, k: config.dispersalRepulsion, reach: config.dispersalRepulsionKm / PLANET_RADIUS_KM };
}

/** Add to `out` the push on plate `id`'s land at (x, y, z) away from every other continent whose edge is within reach (more from a big one). */
export function repelAt(field, id, x, y, z, out) {
    for (const { id: j, c, share, radius, cutoff } of field.centres) {
        if (j === id) continue;
        const d = c[0] * x + c[1] * y + c[2] * z;
        if (d < cutoff || field.touching.has(id * PAIR + j)) continue;
        const gap = Math.max(0, Math.acos(Math.max(-1, Math.min(1, d))) - radius);
        if (gap >= field.reach) continue;
        const tx = d * x - c[0], ty = d * y - c[1], tz = d * z - c[2];      // away from c: −(the tangent at p toward c)
        const l = Math.hypot(tx, ty, tz);
        if (l < 1e-9) continue;
        const k = field.k * Math.min(1, 2 * share) * (1 - gap / field.reach) ** 2 / l;
        out[0] += k * tx; out[1] += k * ty; out[2] += k * tz;
    }
    return out;
}

const PAIR = 65536;                 // a pair of plates (a, b) as the number a·PAIR + b (plate ids stay far below it)

/** The mean mantle heat within cycleUpwellingKm of the upwelling (how hot the mantle the last supercontinent left still is). */
function heatNear(world, cycle) {
    const { mesh, mantleHeat, config } = world, { xyz, numCells } = mesh;
    if (!cycle.up) return 0;                              // (no supercontinent yet: a world that did not start as one)
    if (!cycle.near) {
        const cos = Math.cos(config.cycleUpwellingKm / PLANET_RADIUS_KM), near = [];
        for (let w = 0; w < numCells; w++) if (xyz[3 * w] * cycle.up[0] + xyz[3 * w + 1] * cycle.up[1] + xyz[3 * w + 2] * cycle.up[2] >= cos) near.push(w);
        cycle.near = Int32Array.from(near);
    }
    let s = 0;
    for (const w of cycle.near) s += mantleHeat[w];
    return cycle.near.length ? s / cycle.near.length : 0;
}

/**
 * The world's landmasses of continental crust as the cycle counts them: land joined only by a neck narrower than
 * cycleNeckKm is apart (its cores — land deeper than half that from the coast — each grown back out through the land, the
 * nearest core taking each cell). The largest (its world cells), its share of all the continental crust, and how many
 * landmasses (joined by any land) hold 1 Mkm² or more.
 */
export function landmasses(world) {
    const { mesh, config } = world, { numCells, adjOffset, adjList, cellAreaKm2 } = mesh;
    const cont = new Uint8Array(numCells);
    let total = 0;
    for (let w = 0; w < numCells; w++) if (isContinental(world, w)) { cont[w] = 1; total++; }
    // (landmasses joined by any land, for the count)
    const seen = new Uint8Array(numCells);
    let count = 0;
    for (let s = 0; s < numCells; s++) {
        if (!cont[s] || seen[s]) continue;
        const q = [s]; seen[s] = 1;
        for (let i = 0; i < q.length; i++) for (let k = adjOffset[q[i]]; k < adjOffset[q[i] + 1]; k++) { const x = adjList[k]; if (cont[x] && !seen[x]) { seen[x] = 1; q.push(x); } }
        if (q.length * cellAreaKm2 >= 1e6) count++;
    }
    // how far in from the coast; the cores; each core grown back through the land, the nearest core taking each cell
    const R = config.cycleNeckKm / 2, inland = new Float32Array(numCells);
    for (let w = 0; w < numCells; w++) inland[w] = cont[w] ? Infinity : 0;
    spreadKm(mesh, inland, {});
    const core = new Int32Array(numCells).fill(-1);
    let cores = 0;
    for (let s = 0; s < numCells; s++) {
        if (!cont[s] || inland[s] <= R || core[s] >= 0) continue;
        const q = [s]; core[s] = cores;
        for (let i = 0; i < q.length; i++) for (let k = adjOffset[q[i]]; k < adjOffset[q[i] + 1]; k++) { const x = adjList[k]; if (cont[x] && inland[x] > R && core[x] < 0) { core[x] = cores; q.push(x); } }
        cores++;
    }
    const d = new Float32Array(numCells).fill(Infinity);
    for (let w = 0; w < numCells; w++) if (core[w] >= 0) d[w] = 0;
    spreadKm(mesh, d, { canEnter: (a, q) => cont[q] === 1, onReach: (a, q) => { core[q] = core[a]; } });
    const size = new Int32Array(cores);
    for (let w = 0; w < numCells; w++) if (cont[w] && core[w] >= 0) size[core[w]]++;
    let best = -1;
    for (let c = 0; c < cores; c++) if (best < 0 || size[c] > size[best]) best = c;
    const largest = [];
    if (best >= 0) for (let w = 0; w < numCells; w++) if (cont[w] && core[w] === best) largest.push(w);
    return { largest, share: total ? largest.length / total : 0, count };
}

function centroid(xyz, cells) {
    let x = 0, y = 0, z = 0;
    for (const w of cells) { x += xyz[3 * w]; y += xyz[3 * w + 1]; z += xyz[3 * w + 2]; }
    const l = Math.hypot(x, y, z) || 1;
    return [x / l, y / l, z / l];
}

/** Two unit vectors perpendicular to p and to each other. */
function basisAround(p) {
    const a = Math.abs(p[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    let e1 = [p[1] * a[2] - p[2] * a[1], p[2] * a[0] - p[0] * a[2], p[0] * a[1] - p[1] * a[0]];
    const l = Math.hypot(...e1); e1 = e1.map(v => v / l);
    const e2 = [p[1] * e1[2] - p[2] * e1[1], p[2] * e1[0] - p[0] * e1[2], p[0] * e1[1] - p[1] * e1[0]];
    return [e1, e2];
}
