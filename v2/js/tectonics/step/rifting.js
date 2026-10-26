// When a continent rifts (WBP Part Va). Probabilistic, from the world's seeded rng: a continent
// that is big enough and has been stable for riftTenureMyr rifts with a chance per Myr that grows
// with the TENSION it is under (the share of its trench pull that cancels itself, Phase 4) and with
// its size, and with the HEAT of the mantle under it (Phase 13: a continent that has sat long on the same mantle has
// insulated it — step/hotspots.js — and rifts readily; one that has drifted onto cool mantle hardly rifts at all, so a
// supercontinent's breakup comes in a burst and then quiets — step/supercontinent.js); a mantle plume head
// (step/hotspots.js) may force one where it rises. The rift itself — where it runs, how it splits the plate — is ops/rift.js.
// The pace of breakups is kept per piece of continent (riftMinGapMyr … riftMaxGapMyr, config.js: none too soon after its own
// last rift or weld, the chance growing as its quiet spell runs long, one forced when it runs too long), with a floor for
// the world as a whole (riftGlobalGapMyr).

import { CrustFlag, CrustType } from '../model/crust.js';
import { tangentToward } from '../../core/sphere-geom.js';
import { findRift, riftContext, splitPlate, chooseJunction } from '../ops/rift.js';
import { EventKind } from '../model/world.js';
import { isContinental } from './hotspots.js';

const JUNCTION_TRIES = 12;     // junctions tried per rift chance: the best crossing among them is taken (many admit none)
const FORCED_JUNCTION_TRIES = 48;  // …and for a rift that is overdue (a few a history): it must take

/**
 * A generator (simulate.js): each rift's search over its junctions is handed out as a request — { plate, junctions, pull,
 * needCratonsBothSides, ctx, config } — and answered with the junctions' findRift results, in order (searchJunctions here,
 * or helper workers side by side: app/helper-pool.js). The same answers either way, so the same history.
 * @param {number} dt
 * @returns {number} plates split this step
 */
export function* riftContinents(world, dt) {
    const { plates, config, time, mesh } = world;
    let splits = 0;
    // The pace of breakups (developer, 2026-10-01): each PIECE of continent keeps its own clock — from when it was born of a
    // rift or welded together (plate.born; a terrane docking does not reset it) — none within riftMinGapMyr of it (a plume
    // head arriving then waits), the chance coming back over riftSpacingMyr and growing past riftDueMyr, and at
    // riftMaxGapMyr a rift forced — if the piece is big enough to rift on its own (riftMinContinentKm2: a small one is never
    // forced apart); the world as a whole rifts at most once per riftGlobalGapMyr (one a step at most)
    const paced = config.riftRatePerMyr > 0 && config.riftMinGapMyr > 0;
    const worldWaits = paced && world.lastRiftAt !== null && time - world.lastRiftAt < config.riftGlobalGapMyr - 1e-9;
    const age = plate => time - plate.born, areaOf = plate => plate.stats.continentalCells * mesh.cellAreaKm2;
    const tooYoung = plate => paced && age(plate) < config.riftMinGapMyr - 1e-9;
    // (the forced rift's clock runs only while the piece is big enough to rift on its own: one that has just grown that big —
    // terranes, arcs docking — is not split at once for the years it spent small)
    for (const p of plates) if (p.alive && !p.isBackground) p.bigSince = areaOf(p) >= config.riftMinContinentKm2 ? p.bigSince ?? time : null;
    const bigAge = plate => time - Math.max(plate.born, plate.bigSince ?? time);
    const cycle = world.cycle;
    // (while the pieces gather, those of the landmass they gather into — over the downwelling — are pressed together: rarer
    // rifts there; pressed into one and welded, their clocks start again)
    const gatherInto = cycle?.gather > 0 ? new Set(cycle.largestPlates ?? []) : null;
    // (forced from riftGlobalGapMyr before the limit: held back by the world's floor, it still comes within it)
    const overdue = plate => paced && bigAge(plate) + dt >= config.riftMaxGapMyr - config.riftGlobalGapMyr - 1e-9 && areaOf(plate) >= config.riftMinContinentKm2;
    // (Phase 13, steered: a supercontinent just counted holds for superTenureMyr — its plates do not rift, a plume's head
    // included: a plume under it still erupts its flood basalt — step/supercontinent.js — unless the piece is overdue)
    const superHeld = cycle?.phase === 'assembled' && cycle.formedAt > 0 && time - cycle.formedAt < config.superTenureMyr ? new Set(cycle.largestPlates ?? []) : null;
    const held = plate => superHeld?.has(plate.id) && !overdue(plate);
    // plume heads that arrived under a continent (step/hotspots.js decided which may split it): the rift starts under the
    // plume — or, if that is a craton, from the ordinary ground nearest it. One that finds the piece too young or held, or
    // the world just rifted, waits for it — up to plumeRiftWaitMyr after the head arrived (the Deccan traps came a few Myr
    // before the Seychelles rifted off India) — where the head arrived on the continent (its junctions, taken then in the
    // plate's own frame: the plate has moved on over the plume since); one that finds no cut gives up
    const waiting = [];
    for (const pr of world.pendingPlumeRifts) {
        const plate = plates[pr.plate];
        if (!plate?.alive) continue;
        if (pr.since === undefined) { pr.since = time; pr.junctions = pr.cell >= 0 ? [pr.cell] : plumeJunctions(world, plate, pr.xyz); }
        if (worldWaits || (paced && splits) || held(plate) || tooYoung(plate)) { if (paced && time - pr.since < config.plumeRiftWaitMyr - 1e-9) waiting.push(pr); continue; }
        // (one that waited finds the piece changed — often a coast near where the head arrived: the looser rules a forced rift
        // falls back on, if the usual ones admit no cut)
        if ((yield* tryRift(world, plate, pr.junctions, pr.cause, false)) || (time > pr.since && (yield* withLooseShape(config, function* () { return yield* tryRift(world, plate, pr.junctions, pr.cause, false); })))) splits++;
    }
    world.pendingPlumeRifts = waiting;
    if (worldWaits || (paced && splits)) return splits;
    const heat = config.riftHeatGain > 0 ? heatUnderContinents(world) : null;
    // pieces overdue: the one longest without a rift first
    if (paced) {
        const due = plates.filter(p => p.alive && !p.isBackground && p.dynamics && overdue(p)).sort((a, b) => bigAge(b) - bigAge(a));
        for (const plate of due) if (yield* forceRift(world, plate, age(plate))) return 1;
    }
    // spontaneous rifting under tension
    // (Phase 13, steered — step/supercontinent.js: while a supercontinent's pieces disperse, the plates of a landmass that has
    // gathered much of the continental crust again too soon come apart readily)
    for (const plate of plates.slice()) {
        if (!plate.alive || plate.isBackground || !plate.dynamics || held(plate) || tooYoung(plate)) continue;
        const areaKm2 = areaOf(plate), tooSoon = !!cycle?.clump?.includes(plate.id);
        const h = heat?.get(plate.id) ?? 0;
        // (unpaced — a scene with riftMinGapMyr 0 — the old tenure: a piece of a rift still over hot mantle may rift again soon)
        const tenure = paced ? 0 : tooSoon ? config.riftTenureHotMyr : heat && plate.bornOfRift ? config.riftTenureMyr + (config.riftTenureHotMyr - config.riftTenureMyr) * h : config.riftTenureMyr;
        if (areaKm2 < config.riftMinContinentKm2 || age(plate) < tenure) continue;
        let heatFactor = heat ? config.riftHeatFloor + config.riftHeatGain * h ** config.riftHeatPower : 1;   // warm mantle below: rifts readily; cool: hardly
        if (tooSoon) heatFactor = Math.max(heatFactor, 1) * config.dispersalRiftBoost;
        // (while the pieces gather over the downwelling they are pressed together: rifts are rarer there; elsewhere as ever)
        if (heat && gatherInto?.has(plate.id)) heatFactor *= 1 - (1 - config.gatherRiftFactor) * cycle.gather;
        // (a continent over hot mantle is stretched by the swell beneath it whatever its boundaries do: its tension is at least
        // riftHeatTension × heat — without it, a supercontinent with no boundaries left pulling at it could never rift)
        const tension = heat ? Math.max(plate.dynamics.tension, config.riftHeatTension * h) : plate.dynamics.tension;
        const pace = paced ? paceOf(age(plate), config) : 1;
        const chance = pace * config.riftRatePerMyr * dt * tension * heatFactor * Math.min(config.riftSizeCap, areaKm2 / config.riftMinContinentKm2 - 1);   // a supercontinent rifts readily, a continent barely big enough hardly ever
        if (world.rng() >= chance) continue;
        const junctions = Array.from({ length: JUNCTION_TRIES }, () => chooseJunction(world, plate, world.rng));
        if (yield* tryRift(world, plate, junctions, { text: `tension ${tension.toFixed(2)}${heat ? `, mantle heat ${h.toFixed(2)}` : ''}`, kind: 'tension', hotspot: -1 })) { splits++; if (paced) break; }
    }
    return splits;
}

/** The pace of a piece's breakup at this age (since it was born of a rift or welded together; × its rift chance): 0 at
 *  riftMinGapMyr, back to 1 by riftSpacingMyr (smoothly), and growing once riftDueMyr has passed. */
function paceOf(age, config) {
    let x = (age - config.riftMinGapMyr) / Math.max(1e-9, config.riftSpacingMyr - config.riftMinGapMyr);
    x = x <= 0 ? 0 : x >= 1 ? 1 : x;
    const late = Math.max(0, age - config.riftDueMyr) / config.riftDueRampMyr;
    return x * x * (3 - 2 * x) * (1 + late * late);
}

/**
 * A piece overdue (riftMaxGapMyr without a rift or a weld) is split: by the usual rules of a rift's shape, from
 * FORCED_JUNCTION_TRIES junctions; then, if no cut passes them — a landmass just gathered is ragged — by looser ones.
 * @returns {boolean} whether it split (if not, it is tried again next step)
 */
function* forceRift(world, plate, age) {
    const { config } = world;
    const cause = { text: `no rift for ${age.toFixed(0)} Myr`, kind: 'overdue', hotspot: -1 };
    const attempt = function* () {
        const junctions = Array.from({ length: FORCED_JUNCTION_TRIES }, () => chooseJunction(world, plate, world.rng));
        return (yield* tryRift(world, plate, junctions, cause)) || (yield* tryRift(world, plate, junctions, cause, false));
    };
    return (yield* attempt()) || (yield* withLooseShape(config, attempt));
}
/** A forced rift's looser rules of shape (and a plume's that waited), when no cut passes the usual ones. */
const LOOSE_SHAPE = { riftTortuosityMax: 2, riftMinChordKm: 1000, riftMinPieceShare: 0.12, riftCoastHugKm: 1500 };
/** Run the generator gen with the rules of a rift's shape loosened (LOOSE_SHAPE), then put them back. */
function* withLooseShape(config, gen) {
    const saved = {};
    for (const [k, v] of Object.entries(LOOSE_SHAPE)) { saved[k] = config[k]; config[k] = v; }
    try { return yield* gen(); } finally { Object.assign(config, saved); }
}

/** A rift request answered right here: each junction's findRift, in order (null for none). */
export function searchJunctions(world, { plate, junctions, pull, needCratonsBothSides, ctx }) {
    return junctions.map(j => (j < 0 ? null : findRift(world, plate, j, pull, needCratonsBothSides, ctx)));
}

/** Per plate: the mean mantle heat under its continental crust (0 = cool, 1 = fully insulated). */
function heatUnderContinents(world) {
    const { owner, mantleHeat, plates } = world, sum = new Float64Array(plates.length), count = new Float64Array(plates.length);
    for (let w = 0; w < owner.length; w++) if (isContinental(world, w)) { sum[owner[w]] += mantleHeat[w]; count[owner[w]]++; }
    return { get: id => count[id] ? sum[id] / count[id] : 0 };
}

/**
 * The rift through the best of the given junctions (a rift's shape is set by where it starts more than by where
 * its arms end, so the compact-piece preference is settled here, between junctions), then the split.
 * @param {{text: string, kind: 'plume' | 'tension', hotspot: number}} cause   what started it (for the event)
 */
export function* tryRift(world, plate, junctions, cause, needCratonsBothSides = true) {
    const { mesh } = world, pull = pullAxisOf(plate, mesh), ctx = riftContext(world, plate);     // (what every junction's search reads of the crust)
    // (the junctions' searches, handed out — each junction's own, the answers in the junctions' order)
    const results = yield { plate, junctions, pull, needCratonsBothSides, ctx, config: world.config };
    let rift = null;
    for (const found of results) if (found && (!rift || found.value < rift.value)) rift = found;
    if (!rift) return false;
    const weak = CrustFlag.SUTURE | CrustFlag.FAILED_RIFT | CrustFlag.RIFT_MARGIN, weakKm = rift.path.filter(c => plate.crust.flags[c] & weak).length * mesh.edgeKm;   // (before the split flags the new margins)
    const before = plate.name, ageMyr = world.time - plate.born, fresh = splitPlate(world, plate, rift.path, rift.failedArm, (a, b) => namesAfterSplit(world, a, b, before), rift.across);
    const km = rift.path.length * mesh.edgeKm;
    world.log(EventKind.RIFT, `${before} rifts (${cause.text}): ${plate.name} and ${fresh.name} part along ${km.toFixed(0)} km of rift${rift.failedArm.length ? `, a failed arm of ${(rift.failedArm.length * mesh.edgeKm).toFixed(0)} km left behind` : ''}`,
        { plate: plate.id, fresh: fresh.id, cause: cause.kind, hotspot: cause.hotspot, lengthKm: km, weakKm, failedArmKm: rift.failedArm.length * mesh.edgeKm, ageMyr });
    world.lastRiftAt = world.time;
    return true;
}

/** Raster cells of `plate` a plume at world position xyz could start a rift from: land, not craton, within plumeJunctionKm — the nearest first. */
const PLUME_TRY_KM = 220;     // the rift of a plume head starts within this of the plume (about 12 cells at 40K)

function plumeJunctions(world, plate, xyz) {
    const { mesh, config } = world, { adjOffset, adjList, index } = mesh, crust = plate.crust;
    const c0 = plate.cellAt(index, xyz[0], xyz[1], xyz[2]), maxHops = Math.max(1, Math.round(config.plumeJunctionKm / mesh.edgeKm));
    const ok = c => crust.mask[c] && crust.type[c] !== CrustType.OCEAN && crust.type[c] !== CrustType.CRATON;
    // every candidate within PLUME_TRY_KM of the plume (or out to plumeJunctionKm while none is found), nearest first;
    // then JUNCTION_TRIES of them spread from the nearest to the farthest — so on any mesh the tries cover the same
    // disc under the plume head, not just the few cells next to it
    const all = ok(c0) ? [c0] : [], seen = new Set([c0]), tryHops = Math.max(1, Math.round(PLUME_TRY_KM / mesh.edgeKm));
    let ring = [c0];
    for (let hop = 0; hop < maxHops && ring.length && (hop < tryHops || all.length === 0); hop++) {
        const next = [];
        for (const c of ring) for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) { const nb = adjList[k]; if (!seen.has(nb) && crust.mask[nb]) { seen.add(nb); next.push(nb); if (ok(nb)) all.push(nb); } }
        ring = next;
    }
    if (all.length <= JUNCTION_TRIES) return all;
    return Array.from({ length: JUNCTION_TRIES }, (_, i) => all[Math.round(i * (all.length - 1) / (JUNCTION_TRIES - 1))]);
}

/**
 * The plate-frame axis along which this plate is being pulled apart: the principal axis of where its
 * trench cells lie around its centre (a ringed plate's NET pull is ~0, so the sum of forces would say
 * nothing; the tug of war shows in the trenches sitting on opposite sides).
 */
export function pullAxisOf(plate, mesh) {
    const { xyz } = mesh, { mask, flags } = plate.crust, c = plate.capCenter, M = new Float64Array(9);
    let n = 0;
    for (let i = 0; i < mask.length; i++) {
        if (!mask[i] || !(flags[i] & CrustFlag.TRENCH)) continue;
        const u = tangentToward(c, c, [xyz[3 * i], xyz[3 * i + 1], xyz[3 * i + 2]]);
        for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) M[3 * a + b] += u[a] * u[b];
        n++;
    }
    if (n * mesh.edgeKm < 485) return null;                   // (less than ~500 km of trench pulls no way in particular)
    let v = [c[1], -c[0], 0];                             // power iteration for the principal axis
    for (let it = 0; it < 30; it++) {
        const w = [0, 1, 2].map(a => M[3 * a] * v[0] + M[3 * a + 1] * v[1] + M[3 * a + 2] * v[2]), l = Math.hypot(...w);
        if (l < 1e-12) return null;
        v = w.map(x => x / l);
    }
    return v;
}

/** Names for the two halves: by the craton letters each side holds when the world knows them, else "X·1 / X·2" (numbers not in use). */
function namesAfterSplit(world, a, b, before) {
    const na = world.nameByCratons(a, null), nb = world.nameByCratons(b, null);
    if (na && nb && na !== nb) return [na, nb];
    const base = before.replace(/(·\d+)+$/, ''), taken = new Set(world.plates.filter(p => p.alive).map(p => p.name)), names = [];
    for (let n = 1; names.length < 2; n++) if (!taken.has(`${base}·${n}`)) names.push(`${base}·${n}`);
    return names;
}
