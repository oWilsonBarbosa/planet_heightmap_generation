// Finding a rift (WBP Part Va): from a junction, the cheapest arms to the coast — round cratons, along old sutures —
// and, of the cuts they make, the one that crosses the landmass in the best shape; one arm fails. See ops/rift.js.

import { CrustType, CrustFlag } from '../model/crust.js';
import { PLANET_RADIUS_KM } from '../../core/sim-mesh.js';
import { tangentToward, normalize, cross, dot, cellDistanceKm } from '../../core/sphere-geom.js';
import { sidesOf, exteriorSea, maskedCells } from './rift-partition.js';
import { FastNoise } from '../../core/fast-noise.js';

/**
 * The grain of the crust a rift follows (developer: rifts "on way too straight lines … should curve a bit and be jagged";
 * straight cuts left rectangular continents). A continent is not uniform: old fabric, fault zones and weak terranes
 * make some ground cheaper to break than other ground (the Atlantic opened along the Appalachian–Caledonian grain, and its
 * margins bend and step). Here a smooth field fixed in the plate's own frame — so a continent's pieces keep the grain it
 * had, and later rifts on the same crust follow the same fabric — scales the cost of breaking each cell: a broad swing
 * (riftCurveKm) that bends a rift, and a finer one (riftJagKm) that makes it jagged. × 1 ± the amplitudes.
 */
export function grainOf(world) {
    const { config } = world;
    if (!(config.riftCurveAmp > 0 || config.riftJagAmp > 0)) return () => 1;
    const noise = world.riftGrain ??= new FastNoise((world.seed ^ 0x6a41) >>> 0);
    const f1 = PLANET_RADIUS_KM / config.riftCurveKm, f2 = PLANET_RADIUS_KM / config.riftJagKm, { xyz } = world.mesh;
    // (a raster cell's grain is fixed — the plate's frame, the world's seed — so it is worked out once per history)
    const known = world.riftGrainOf ??= new Float64Array(world.mesh.numCells).fill(NaN);
    return c => {
        let g = known[c];
        if (g === g) return g;
        const x = xyz[3 * c], y = xyz[3 * c + 1], z = xyz[3 * c + 2];
        g = known[c] = Math.max(0.2, 1 + config.riftCurveAmp * noise.noise3D(x * f1, y * f1, z * f1) + config.riftJagAmp * noise.noise3D(x * f2 + 31.7, y * f2 + 17.3, z * f2 + 5.1));
        return g;
    };
}

/**
 * What a rift search reads of a plate's crust, the same for every junction tried (rifting.js tryRift): its cells in order,
 * the sea its outer coast faces, each land cell's hops from that coast, and the grain.
 */
export function riftContext(world, plate) {
    const { mesh } = world, crust = plate.crust, exterior = exteriorSea(mesh, crust);
    return { cells: maskedCells(crust), exterior, fromCoast: coastDistance(mesh, crust, exterior), grain: grainOf(world) };
}

/**
 * Find a rift across `plate`'s landmass through raster cell `junction`.
 * @param {number[]|null} pullAxis   plate-frame unit vector of the tug of war (the rift prefers to run across it); null = no preference
 * @param {Object} [ctx]   riftContext(world, plate), when several junctions of the same crust are tried
 * @returns {{path: number[], failedArm: number[], arms: number[][], across: number[], value: number}|null}   path = coast to coast through the junction
 */
export function findRift(world, plate, junction, pullAxis, needCratonsBothSides = true, ctx = null) {
    const { mesh, config } = world, { xyz, adjOffset, adjList, edgeKm } = mesh, crust = plate.crust;
    const land = c => crust.mask[c] && crust.type[c] !== CrustType.OCEAN;
    if (!land(junction) || crust.type[junction] === CrustType.CRATON) return null;
    ctx ??= riftContext(world, plate);

    // cheapest paths from the junction across the land: weak lines cost riftWeaknessCost, cratons cannot be entered at all
    const weak = CrustFlag.SUTURE | CrustFlag.FAILED_RIFT | CrustFlag.RIFT_MARGIN;
    const grain = ctx.grain;
    const { cost, from } = cheapestPaths(mesh, crust, junction, c => ((crust.flags[c] & weak) ? config.riftWeaknessCost : 1) * grain(c));
    // coastal land cells reached — on the OUTER coast (an inland sea is not a way out), with the direction they lie in
    const { exterior, fromCoast } = ctx;
    const J = pos(xyz, junction), coast = [];
    for (const c of ctx.cells) {
        if (!land(c) || cost[c] === Infinity) continue;
        let isCoast = false;
        for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) if (exterior[adjList[k]]) { isCoast = true; break; }
        if (!isCoast || cellDistanceKm(xyz, junction, c) < config.riftMinArmKm) continue;
        const dir = tangentToward(J, J, pos(xyz, c));
        // a rift prefers to run ACROSS the pull: arms along the pull axis are dearer
        const along = pullAxis ? Math.abs(dir[0] * pullAxis[0] + dir[1] * pullAxis[1] + dir[2] * pullAxis[2]) : 0;
        coast.push({ c, dir, score: cost[c] * (1 + config.riftAcrossPullBias * along) });
    }
    if (coast.length < 2) return null;
    coast.sort((a, b) => a.score - b.score);
    const apart = (a, b) => Math.acos(Math.max(-1, Math.min(1, a.dir[0] * b.dir[0] + a.dir[1] * b.dir[1] + a.dir[2] * b.dir[2]))) * 180 / Math.PI;
    // the rift = the pair of arms, leaving the junction in (nearly) opposite directions, with the lowest cost PER
    // KILOMETRE of the chord between their ends — so a rift crosses the landmass along its cheap lines rather than
    // cutting a short wedge off the nearest coast or looping round one craton
    const trace = end => { const out = []; for (let c = end; c >= 0; c = from[c]) out.push(c); return out.reverse(); };   // junction → coast
    const top = coast.slice(0, Math.max(8, Math.round(config.riftArmEndCoastKm / mesh.edgeKm)));
    for (const e of top) e.lengthKm = trace(e.c).length * edgeKm;
    const pairs = [];
    for (const a of top) for (const b of top) {
        if (a === b || apart(a, b) < RIFT_ARMS_APART_DEG) continue;
        const chord = cellDistanceKm(xyz, a.c, b.c);
        if (chord < config.riftMinChordKm || a.lengthKm + b.lengthKm > config.riftTortuosityMax * chord) continue;   // a rift zig-zags, it does not meander
        pairs.push({ a, b, perKm: (a.score + b.score) / chord });
    }
    pairs.sort((p, q) => p.perKm - q.perKm);
    // Among the cheap pairs (within riftCostSlack of the cheapest), take the one whose pieces come out most compact
    // (developer: round or square, not elongated) — a cut across an elongated landmass rather than along it. Only
    // DISTINCT cuts count: the cheapest pairs are mostly the same two coast spots a cell apart, so a pair whose
    // ends both lie near an evaluated pair's ends is passed over. Pairs must have no overhangs (the path always
    // advances along its own line, or a promontory of one half would stick into the other and the halves would
    // jam as they part) and leave riftMinPieceShare of the land on each side.
    let chosen = null, chosenPath = null, bestValue = Infinity;
    const tried = [];
    for (const pair of pairs) {
        if (tried.length >= PAIRS_TRIED || (tried.length && pair.perKm > config.riftCostSlack * pairs[0].perKm)) break;
        const near = (p, q) => cellDistanceKm(xyz, p.c, q.c) < DISTINCT_CUT_KM;
        if (tried.some(t => (near(t.a, pair.a) && near(t.b, pair.b)) || (near(t.a, pair.b) && near(t.b, pair.a)))) continue;
        tried.push(pair);
        const path = [...trace(pair.a.c).slice(1).reverse(), junction, ...trace(pair.b.c).slice(1)];
        if (!isMonotone(mesh, path, config)) continue;
        if (!crossesRatherThanHugs(mesh, path, fromCoast, config)) continue;
        const sides = sidesOf(mesh, crust, path, ctx.cells);
        if (sides.share < config.riftMinPieceShare || (needCratonsBothSides && !sides.cratonsBothSides)) continue;   // a rift divides cratons: each side keeps at least one (a plume may shear a craton-less piece off)
        const value = pair.perKm * (1 + config.riftElongationBias * (sides.elongation - 1));
        if (value < bestValue) { bestValue = value; chosen = pair; chosenPath = path; }
    }
    if (!chosen) return null;
    const arm1 = chosen.a, arm2 = chosen.b;
    const a1 = trace(arm1.c), a2 = trace(arm2.c);
    // The arms that FAIL are traced on a second, plain tree — one that gives old sutures no discount — so an
    // aulacogen strikes out across ordinary ground and leaves a NEW weak line behind it, instead of merely
    // re-tracing a line that was weak already (developer). Each one dies after riftFailedArmKm.
    const plain = cheapestPaths(mesh, crust, junction, grain);
    const plainTrace = end => { const out = []; for (let c = end; c >= 0; c = plain.from[c]) out.push(c); return out.reverse(); };
    const failedArm = [], taken = [arm1, arm2];
    const plainCoast = coast.filter(e => plain.cost[e.c] < Infinity).sort((p, q) => plain.cost[p.c] - plain.cost[q.c]);
    for (const e of plainCoast) {
        if (taken.length >= 2 + config.riftFailedArms) break;
        if (taken.some(t => apart(t, e) < ARM_SEPARATION_DEG)) continue;
        taken.push(e);
        const path = plainTrace(e.c);
        let km = 0;
        for (let i = 1; i < path.length && km < config.riftFailedArmKm; i++) { failedArm.push(path[i]); km += cellDistanceKm(xyz, path[i - 1], path[i]); }
    }
    const a3 = taken.length > 2 ? plainTrace(taken[2].c) : [];
    const ends = [chosenPath[0], chosenPath.at(-1)];
    // across = normal to the rift's great circle; value = cost per km × the elongation penalty, comparable between junctions
    return { path: chosenPath, failedArm, arms: [a1, a2, a3], across: normalize(cross(pos(xyz, ends[0]), pos(xyz, ends[1]))), value: bestValue };
}

/** Hops from the outer coast, over the plate's land (−1 where the land cannot be reached). */
function coastDistance(mesh, crust, exterior) {
    const { numCells, adjOffset, adjList } = mesh, dist = new Int16Array(numCells).fill(-1);
    const land = c => crust.mask[c] && crust.type[c] !== CrustType.OCEAN;
    let ring = [];
    for (let c = 0; c < numCells; c++) {
        if (!land(c)) continue;
        for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) if (exterior[adjList[k]]) { dist[c] = 0; ring.push(c); break; }
    }
    for (let d = 1; ring.length; d++) {
        const next = [];
        for (const c of ring) for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) { const nb = adjList[k]; if (land(nb) && dist[nb] < 0) { dist[nb] = d; next.push(nb); } }
        ring = next;
    }
    return dist;
}

/**
 * Does the path CROSS the land rather than run along its edge? Its two ends must reach the coast, so the
 * cells within the clearance of each end are free; in between, the path may come near the coast — an
 * isthmus is a fine place to break — but only for riftCoastHugKm at a stretch. A longer stretch means the
 * rift is running parallel to a coast, which shaves a ribbon off it and leaves that ribbon hanging from
 * whichever piece it joins.
 */
function crossesRatherThanHugs(mesh, path, fromCoast, config) {
    const { edgeKm } = mesh;
    const clearance = Math.round(config.riftCoastClearanceKm / edgeKm), maxHug = config.riftCoastHugKm / edgeKm;
    const endFree = Math.max(1, clearance);
    let hug = 0;
    for (let i = endFree; i < path.length - endFree; i++) {
        const d = fromCoast[path[i]];
        if (d >= 0 && d < clearance) { if (++hug > maxHug) return false; } else hug = 0;
    }
    return true;
}

/** Cheapest path from `junction` to every land cell, at `costOf` per cell; cratons cannot be entered. */
function cheapestPaths(mesh, crust, junction, costOf) {
    const { xyz, adjOffset, adjList, numCells, edgeKm } = mesh;
    const cost = new Float64Array(numCells).fill(Infinity), from = new Int32Array(numCells).fill(-1);
    const land = c => crust.mask[c] && crust.type[c] !== CrustType.OCEAN;
    const heap = new MinHeap();
    cost[junction] = 0; heap.push(junction, 0);
    while (heap.size) {
        const c = heap.pop();
        for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) {
            const nb = adjList[k];
            if (!land(nb) || crust.type[nb] === CrustType.CRATON) continue;
            const next = cost[c] + costOf(nb) * cellDistanceKm(xyz, c, nb) / edgeKm;
            if (next < cost[nb]) { cost[nb] = next; from[nb] = c; heap.push(nb, next); }
        }
    }
    return { cost, from };
}

/** Does the path always advance along the great circle from its first cell to its last (backsteps under a cell allowed)? */
function isMonotone(mesh, path, config) {
    const { xyz, edgeRad } = mesh, a = pos(xyz, path[0]), b = pos(xyz, path.at(-1)), m = normalize(cross(a, b));
    let last = -Infinity;
    for (const c of path) {
        const p = pos(xyz, c), k = dot(p, m), q = normalize([p[0] - k * m[0], p[1] - k * m[1], p[2] - k * m[2]]);   // onto the rift's plane
        const phi = Math.atan2(dot(cross(a, q), m), dot(a, q));                                                        // angle along the circle from a
        if (phi < last - Math.max(config.riftOverhangKm / PLANET_RADIUS_KM, edgeRad)) return false;
        last = Math.max(last, phi);
    }
    return true;
}

const RIFT_ARMS_APART_DEG = 135;   // the two rift arms leave it at least this far apart: the rift crosses the landmass
const ARM_SEPARATION_DEG = 60;     // the failed arm leaves the junction at least this far from both rift arms
const PAIRS_TRIED = 12;            // how many DISTINCT cuts (arm pairs) are tried for shape and share
const DISTINCT_CUT_KM = 500;       // two cuts whose ends both lie within this of each other are the same cut

class MinHeap {
    constructor() { this.keys = []; this.vals = []; }
    get size() { return this.keys.length; }
    push(key, val) {
        const k = this.keys, v = this.vals;
        k.push(key); v.push(val);
        for (let i = k.length - 1; i > 0;) { const p = (i - 1) >> 1; if (v[p] <= v[i]) break; [k[p], k[i]] = [k[i], k[p]]; [v[p], v[i]] = [v[i], v[p]]; i = p; }
    }
    pop() {
        const k = this.keys, v = this.vals, top = k[0], lastK = k.pop(), lastV = v.pop();
        if (k.length) {
            k[0] = lastK; v[0] = lastV;
            for (let i = 0;;) {
                const l = 2 * i + 1, r = l + 1;
                let m = i;
                if (l < k.length && v[l] < v[m]) m = l;
                if (r < k.length && v[r] < v[m]) m = r;
                if (m === i) break;
                [k[m], k[i]] = [k[i], k[m]]; [v[m], v[i]] = [v[i], v[m]]; i = m;
            }
        }
        return top;
    }
}

const pos = (xyz, c) => [xyz[3 * c], xyz[3 * c + 1], xyz[3 * c + 2]];
