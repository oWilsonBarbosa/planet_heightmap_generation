// Headless acceptance checks for Phase 2 (divergence & convergence rules, prescribed motion).
// Usage: node v2/tools/check-phase2.mjs

import { check, section, finish, labMesh, checkLabPhaseLoads, LAB_MESH_SEED } from './lib/check-kit.mjs';
import { PLANET_RADIUS_KM } from '../js/core/sim-mesh.js';
import { polarFrame } from '../js/core/sphere-geom.js';
import { buildWilsonWorld, driveWilson, WILSON_MAX_MYR, WILSON_HOME, WILSON_POLE_XYZ, WEST_CM_YR, EAST_CM_YR, WEST_REVERSES_MYR } from '../js/tectonics/scenarios/wilson-cycle.js';
import { simulate } from '../js/tectonics/simulate.js';
import { frameTallies, meanAzimuthDeg, contactBetween } from '../js/tectonics/measure.js';
import { CrustType, CrustFlag } from '../js/tectonics/model/crust.js';
import { BoundaryKind, Provisional } from '../js/tectonics/model/world.js';

const SEED = 12345, SNAPSHOT_MYR = 2, FIRST_LEG_MYR = 50;
const mesh = labMesh();
const world = buildWilsonWorld(mesh, SEED);
const landBefore = world.plates.map(p => { p.refreshExtent(mesh.xyz); return p.stats.continentalCells; });
const landMaskBefore = world.plates.map(p => Uint8Array.from(p.crust.mask, (m, c) => m && p.crust.type[c] !== CrustType.OCEAN ? 1 : 0));

// Run in two legs, so the plate-frame trench flags at 50 Myr can be compared with the end (and to prove a run can be resumed).
const plateNamed = name => world.plates.find(p => p.name === name);
const west = plateNamed('West'), east = plateNamed('East'), far = plateNamed('Far'), ocean = world.plates.find(p => p.isBackground);
const started = performance.now();
const firstLeg = simulate(world, { untilMyr: FIRST_LEG_MYR, drive: driveWilson, snapshotEveryMyr: SNAPSHOT_MYR, events: false });     // kinematics and crust rules only: events are Phase 5
const westLandFlagsAt50 = Uint8Array.from(west.crust.mask, (m, c) => (m && west.crust.type[c] !== CrustType.OCEAN && (west.crust.flags[c] & CrustFlag.TRENCH) ? 1 : 0));
const secondLeg = simulate(world, { untilMyr: WILSON_MAX_MYR, drive: driveWilson, snapshotEveryMyr: SNAPSHOT_MYR, events: false });     // kinematics and crust rules only: events are Phase 5
const frames = [...firstLeg.frames, ...secondLeg.frames.slice(1)], stepLog = [...firstLeg.stepLog, ...secondLeg.stepLog], steps = world.step;
console.log(`${steps} steps → ${frames.length} frames in ${(performance.now() - started).toFixed(0)} ms (${((performance.now() - started) / steps).toFixed(1)} ms/step)`);
const frameAt = myr => frames.find(f => Math.abs(f.time - myr) < 1e-6);
const last = frames.at(-1), mid = frameAt(100);      // 100 Myr: a wide interior ocean, the East–Far collision still shallow
check('a run can be stopped and resumed', frames.every((f, i) => Math.abs(f.time - Math.min(i * SNAPSHOT_MYR, WILSON_MAX_MYR)) < 1e-6), `${frames.length} frames, evenly spaced across the two legs`);

section('the sphere stays tiled');
{
    const worst = Math.max(...frames.map(f => frameTallies(f).gaps));
    check('no gaps survive a step', worst === 0, `max unfilled cells in any frame: ${worst}`);

    // Cells shown as crust although no raster holds crust there yet ("provisional") are legitimate only as the
    // moving ridge axis. A patch of them that is wide, or that stays put, would be a hole the display is hiding.
    const { adjOffset, adjList, numCells } = mesh;
    let widest = 0, mostAtOnce = 0, longestHole = 0;
    const holeAge = new Uint16Array(numCells);      // frames in a row a cell has been a LIKE_NEIGHBOUR hole
    for (const f of frames) {
        let depth = Uint8Array.from(f.provisional, p => (p ? 255 : 0)), count = 0;
        for (let w = 0; w < numCells; w++) if (f.provisional[w]) count++;
        mostAtOnce = Math.max(mostAtOnce, count);
        for (let hop = 1; hop <= 6; hop++) {             // depth = hops to the nearest real crust
            const next = depth.slice();
            for (let w = 0; w < numCells; w++) {
                if (depth[w] !== 255) continue;
                for (let k = adjOffset[w]; k < adjOffset[w + 1]; k++) if (depth[adjList[k]] === hop - 1) { next[w] = hop; break; }
            }
            depth = next;
        }
        for (let w = 0; w < numCells; w++) {
            if (f.provisional[w]) widest = Math.max(widest, depth[w]);
            holeAge[w] = f.provisional[w] === Provisional.LIKE_NEIGHBOUR ? holeAge[w] + 1 : 0;
            longestHole = Math.max(longestHole, holeAge[w]);
        }
    }
    // A hole ahead of an advancing edge lasts until the edge has crossed it. The slowest edge here is West's near the
    // tips of the rift (~30° from the hinge pole), so nothing should outlive the time West needs to cross 1.5 cells there.
    const slowestKmPerMyr = WEST_CM_YR * 10 * Math.sin(30 * Math.PI / 180), holeLimitMyr = 1.5 * mesh.edgeKm / slowestKmPerMyr;
    check('no hidden holes: provisional cells are a thin ridge axis, or a passing hole ahead of a closing edge', widest <= 2 && longestHole * SNAPSHOT_MYR <= holeLimitMyr,
        `at most ${mostAtOnce} at once; never more than ${widest} cell(s) from real crust; longest-lived hole ahead of a closing edge ${longestHole * SNAPSHOT_MYR} Myr (limit ${holeLimitMyr.toFixed(0)} Myr: 1.5 cells at West's slowest, ${slowestKmPerMyr.toFixed(0)} km/Myr)`);
}

section('crust rules');
{   // continents are never created, destroyed or reshaped
    let changed = 0;
    world.plates.forEach((p, i) => {
        for (let c = 0; c < mesh.numCells; c++) {
            const now = p.crust.mask[c] && p.crust.type[c] !== CrustType.OCEAN ? 1 : 0;
            if (now !== landMaskBefore[i][c]) changed++;
        }
    });
    check('continental crust untouched', changed === 0, `${changed} land cells differ from the start (${landBefore.reduce((a, b) => a + b)} land cells total)`);
}

{   // ocean is attached to continents; the background only shrinks
    const oceanCells = frames.map(f => f.plates[ocean.id].cells);
    let grew = 0;
    for (let i = 1; i < oceanCells.length; i++) if (oceanCells[i] > oceanCells[i - 1]) grew++;
    const newOnBackground = ocean.crust.formedAt.some((t, c) => ocean.crust.mask[c] && t >= 0);
    check('pre-history ocean is passive', grew === 0 && !newOnBackground,
        `shrank ${oceanCells[0]} → ${oceanCells.at(-1)} cells, never grew, holds no new crust`);
    const wNew = last.plates[west.id].cells - last.plates[west.id].landCells, eNew = last.plates[east.id].cells - last.plates[east.id].landCells;
    const fNew = last.plates[far.id].cells - last.plates[far.id].landCells;
    check('new ocean is written into the continents’ plates', wNew > 500 && eNew > 500 && fNew < 0.01 * (wNew + eNew),
        `West carries ${wNew} ocean cells, East ${eNew}, stationary Far ${fNew} (slivers where East slides past it)`);
}

section('spreading');
{   // Each flank of the interior ocean gets half, however unequal the plate speeds, and age grows away from the ridge.
    const f = mid;
    const ridge = [];
    for (let c = 0; c < mesh.numCells; c++) if (f.boundary[c] === BoundaryKind.RIDGE && (f.owner[c] === west.id || f.owner[c] === east.id)) ridge.push(c);
    const { xyz } = mesh;
    const distToRidgeKm = c => {
        let best = -2;
        for (const r of ridge) { const d = xyz[3 * c] * xyz[3 * r] + xyz[3 * c + 1] * xyz[3 * r + 1] + xyz[3 * c + 2] * xyz[3 * r + 2]; if (d > best) best = d; }
        return Math.acos(Math.min(1, best)) * PLANET_RADIUS_KM;
    };
    // sample interior-ocean cells near the equator of the hinge (away from the messy tips)
    const samples = { [west.id]: [], [east.id]: [] };
    for (let c = 0; c < mesh.numCells; c += 3) {
        if (f.type[c] !== CrustType.OCEAN || f.formedAt[c] < 1) continue;
        const lat = Math.asin(xyz[3 * c + 2]) * 180 / Math.PI;
        if (Math.abs(lat - WILSON_HOME.lat) > 12) continue;
        if (samples[f.owner[c]]) samples[f.owner[c]].push([f.time - f.formedAt[c], distToRidgeKm(c)]);
    }
    const rate = id => {   // least-squares km per Myr of distance-from-ridge against age
        const s = samples[id]; let sxx = 0, sxy = 0;
        for (const [age, d] of s) { sxx += age * age; sxy += age * d; }
        return sxy / sxx;
    };
    const rw = rate(west.id), re = rate(east.id);
    // Count each flank inside a band of constant distance from the Euler pole — crust flows along
    // such circles, so the band follows the flow lines (a band of latitude would cut across them).
    const toPolar = polarFrame(WILSON_POLE_XYZ, WILSON_HOME.xyz);
    let bandW = 0, bandE = 0;
    for (let c = 0; c < mesh.numCells; c++) {
        if (f.type[c] !== CrustType.OCEAN || f.formedAt[c] < 1) continue;
        const p = toPolar(xyz[3 * c], xyz[3 * c + 1], xyz[3 * c + 2]), turn = (10 / PLANET_RADIUS_KM) * 180 / Math.PI * f.time;
        if (Math.abs(p.colat - WILSON_HOME.poleDistanceDeg) > 12) continue;
        if (p.azimuth < -WEST_CM_YR * turn - 7 || p.azimuth > EAST_CM_YR * turn + 7) continue;   // interior basin only
        if (f.owner[c] === west.id) bandW++; else if (f.owner[c] === east.id) bandE++;
    }
    check('ridge spreads symmetrically', Math.abs(bandW - bandE) / (bandW + bandE) < 0.04,
        `interior ocean across the mid-section at 100 Myr: West flank ${bandW} cells, East flank ${bandE} cells (plate speeds ${WEST_CM_YR} vs ${EAST_CM_YR} cm/yr)`);
    // The full rate must match the prescribed relative motion: (West + East) cm/yr × sin(distance from the hinge pole).
    // (Distance to a zig-zag ridge slightly under-reads along-flow distance, hence the tolerance.)
    const expectedFull = (WEST_CM_YR + EAST_CM_YR) * Math.sin(WILSON_HOME.poleDistanceDeg * Math.PI / 180);
    check('spreading rate matches plate motion', Math.abs((rw + re) / 10 - expectedFull) / expectedFull < 0.12,
        `age-vs-distance gives a full spreading rate of ${((rw + re) / 10).toFixed(2)} cm/yr; prescribed ${expectedFull.toFixed(2)} cm/yr`);
}

{   // the ridge migrates at half the velocity difference
    const degPerMyr = (EAST_CM_YR - WEST_CM_YR) / 2 * (10 / PLANET_RADIUS_KM) * 180 / Math.PI;
    const riftStart = meanAzimuthDeg(frames[0], mesh.xyz, WILSON_POLE_XYZ, WILSON_HOME.xyz, (f, w) => (f.flags[w] & CrustFlag.RIFT_MARGIN) !== 0);
    const expected = degPerMyr * mid.time, got = meanAzimuthDeg(mid, mesh.xyz, WILSON_POLE_XYZ, WILSON_HOME.xyz, contactBetween(mesh, west.id, east.id)) - riftStart;
    const km = deg => deg * Math.PI / 180 * Math.sin(WILSON_HOME.poleDistanceDeg * Math.PI / 180) * PLANET_RADIUS_KM;
    check('ridge migrates at half the speed difference', Math.abs(got - expected) / expected < 0.06,
        `by ${mid.time} Myr the ridge has turned ${got.toFixed(1)}° about the pole (${km(got).toFixed(0)} km); expected ${expected.toFixed(1)}° (${km(expected).toFixed(0)} km)`);
}

section('trenches');
{   // on the overriding plate, persistent, never on rifted margins
    let onSubducting = 0, onRift = 0, flagged = 0, riftCells = 0;
    const home = WILSON_HOME.xyz;
    for (const p of world.plates) {
        for (let c = 0; c < mesh.numCells; c++) {
            if (!p.crust.mask[c] || !(p.crust.flags[c] & CrustFlag.TRENCH)) continue;
            flagged++;
            if (p.isBackground) onSubducting++;
            if (p.crust.flags[c] & CrustFlag.RIFT_MARGIN) {
                // plate-frame position = starting position; the tips of the cut are ≥ 0.38 rad from the landmass centre
                const d = Math.acos(mesh.xyz[3 * c] * home[0] + mesh.xyz[3 * c + 1] * home[1] + mesh.xyz[3 * c + 2] * home[2]);
                if (d < 0.38) onRift++;
            }
        }
    }
    check('trench flags live on overriding plates only', flagged > 100 && onSubducting === 0, `${flagged} flagged cells, ${onSubducting} on the pre-history ocean`);
    for (const p of world.plates) for (let c = 0; c < mesh.numCells; c++) if (p.crust.mask[c] && (p.crust.flags[c] & CrustFlag.RIFT_MARGIN)) riftCells++;
    check('rifted margins stay passive', onRift === 0, `${onRift} of ${riftCells} rift-margin cells carry a trench flag (the two tips, where the cut meets the outer coast, are exempt)`);
    const t50 = frameTallies(frameAt(50)), t100 = frameTallies(mid);
    check('trenches stay live while the margin is active', t50.liveTrench > 60 && t100.liveTrench > 60, `live trench cells: ${t50.liveTrench} at 50 Myr, ${t100.liveTrench} at 100 Myr`);
    let flaggedAt50 = 0, stillFlagged = 0;
    for (let c = 0; c < mesh.numCells; c++) if (westLandFlagsAt50[c]) { flaggedAt50++; if (west.crust.flags[c] & CrustFlag.TRENCH) stillFlagged++; }
    check('a trench flag on land is permanent (same crust cells)', flaggedAt50 > 30 && stillFlagged === flaggedAt50, `${stillFlagged} of the ${flaggedAt50} West land cells flagged at ${FIRST_LEG_MYR} Myr are still flagged at ${last.time} Myr`);
    let work = 0, n = 0;
    for (let c = 0; c < mesh.numCells; c++) if (mid.trench[c] === 1 && mid.slabKm[c] > 0) { work += mid.slabKm[c]; n++; }
    check('trench cells log subducted crust', n > 0 && work / n > 300, `mean ${(work / n).toFixed(0)} km subducted per live trench cell by 100 Myr`);
}

{   // flags go dormant when a margin stops being active (West reverses)
    const westFlags = f => {
        const t = { live: 0, dormant: 0 };
        for (let c = 0; c < mesh.numCells; c++) {
            if (f.owner[c] !== west.id || f.type[c] === CrustType.OCEAN || !f.trench[c]) continue;
            if (f.trench[c] === 1) t.live++; else t.dormant++;
        }
        return t;
    };
    const before = westFlags(frameAt(WEST_REVERSES_MYR - 10)), after = westFlags(last);
    const kept = (after.live + after.dormant) / (before.live + before.dormant);
    check('active margin: flagged band is live', before.live / (before.live + before.dormant) > 0.7,
        `West's flagged land cells at ${WEST_REVERSES_MYR - 10} Myr: ${before.live} live, ${before.dormant} dormant`);
    check('reversal turns the margin dormant, flags persist', after.dormant / (after.live + after.dormant) > 0.85 && kept > 0.9 && kept < 1.15,
        `West's flagged land cells at ${last.time} Myr: ${after.live} live, ${after.dormant} dormant (${(kept * 100).toFixed(0)} % of the flags seen before the reversal)`);
}

section('budget, collision, step size');
{   // area budget: created = consumed − land-on-land overlap
    const t = frameTallies(last);
    const imbalance = Math.abs(world.budget.created - (world.budget.consumed - t.collision));
    check('crust budget balances', imbalance / world.budget.created < 0.05,
        `created ${world.budget.created}, consumed ${world.budget.consumed}, land-on-land ${t.collision} → imbalance ${imbalance} cells`);
}

{   // collision is detected, not resolved
    const first = frames.find(f => frameTallies(f).collision > 0);
    check('East–Far contact is detected', !!first && first.time > 80, first ? `first land-on-land contact at ${first.time} Myr, ${frameTallies(last).collision} cells by ${last.time} Myr` : 'never detected');
}

{   // step size: two plates closing head-on never cover more than maxCellsPerStep cells in one step, nor needlessly little
    const moved = stepLog.map(s => s.cellsMoved).sort((a, b) => a - b), limit = world.config.maxCellsPerStep;
    check('adaptive step keeps motion within one cell per step', moved.at(-1) <= limit + 1e-6 && moved[moved.length >> 1] > 0.4 * limit,
        `closing distance per step: median ${moved[moved.length >> 1].toFixed(2)}, max ${moved.at(-1).toFixed(2)} cells (limit ${limit}); largest step ${Math.max(...stepLog.map(s => s.dt)).toFixed(2)} Myr`);
}

section('lab');
await checkLabPhaseLoads('../../js/app/phases/phase2-wilson-cycle.js', mesh, LAB_MESH_SEED);

finish('Phase 2');
