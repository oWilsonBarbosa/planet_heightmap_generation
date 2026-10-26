// Lab phase 2 — divergence & convergence rules under prescribed motion.
// The whole history is simulated once up front; the timeline then scrubs recorded Frames.

import { buildWilsonWorld, driveWilson, WILSON_MAX_MYR, WILSON_POLE_XYZ, WILSON_HOME, WEST_CM_YR, EAST_CM_YR, WEST_REVERSES_MYR } from '../../tectonics/scenarios/wilson-cycle.js';
import { simulate } from '../../tectonics/simulate.js';
import { frameTallies, meanAzimuthDeg, contactBetween } from '../../tectonics/measure.js';
import { colorByPlate, colorByCrustType, colorByCrustAge } from '../../view/palettes.js';
import { CrustFlag } from '../../tectonics/model/crust.js';
import { describeCell, recordedFrameAt, boundaryLegend, SNAPSHOT_MYR } from './phase-kit.js';


// Symmetric spreading puts the ridge mid-way between the coasts, so it turns about the shared
// Euler pole at the mean of the two plates' rates: (East − West) / 2.
const DEG_PER_MYR_PER_CM_YR = (10 / 6371) * 180 / Math.PI;
function expectedRidgeTurn(timeMyr) {   // West moves west until it reverses, then east
    const before = Math.min(timeMyr, WEST_REVERSES_MYR), after = Math.max(0, timeMyr - WEST_REVERSES_MYR);
    return ((EAST_CM_YR - WEST_CM_YR) / 2 * before + (EAST_CM_YR + WEST_CM_YR) / 2 * after) * DEG_PER_MYR_PER_CM_YR;
}
function turnToKm(deg) { return deg * Math.PI / 180 * Math.sin(WILSON_HOME.poleDistanceDeg * Math.PI / 180) * 6371; }

export function createPhase(simMesh, seed) {
    const world = buildWilsonWorld(simMesh, seed);
    const t0 = performance.now();
    const { frames, steps } = simulate(world, { untilMyr: WILSON_MAX_MYR, drive: driveWilson, snapshotEveryMyr: SNAPSHOT_MYR, events: false });     // kinematics and crust rules only: events are Phase 5
    const simMs = performance.now() - t0;
    const notes = world.plates.map(p => p.scene.motion.note);
    const kmPerCell2 = simMesh.cellAreaKm2 / 1e6;   // million km² per cell
    // where the rift line started, measured the same way the ridge is measured later
    const riftAzimuth = meanAzimuthDeg(frames[0], simMesh.xyz, WILSON_POLE_XYZ, WILSON_HOME.xyz, (f, w) => (f.flags[w] & CrustFlag.RIFT_MARGIN) !== 0);
    const westEastContact = contactBetween(simMesh, 0, 1);   // the ridge proper: where West's crust meets East's
    const ridgeTurn = fr => meanAzimuthDeg(fr, simMesh.xyz, WILSON_POLE_XYZ, WILSON_HOME.xyz, westEastContact) - riftAzimuth;

    return {
        title: 'Phase 2 — Divergence & convergence rules',
        summary: 'A hand-made mini Wilson cycle with prescribed motion. One landmass, already cut along a zig-zag line, ' +
            `hinges apart into West (${WEST_CM_YR} cm/yr) and fast East (${EAST_CM_YR} cm/yr): the gap between them fills with new ocean crust that is written into the ` +
            'flanking continent’s plate, so the ridge always sits mid-way between the two coasts and ages stripe outward ' +
            'symmetrically — which means the ridge itself migrates east at half the speed difference. Their outer coasts ' +
            'ride over the passive pre-history ocean, which is consumed beneath a persistent trench carried by the overriding ' +
            'plate. At ' + WEST_REVERSES_MYR + ' Myr West reverses, so its western trench shuts off and its flags go dormant. East finally meets ' +
            'Far — land never subducts, so that contact is only detected here (strong magenta).',
        checklist: [
            'No black gaps at any time: every cell that opens is filled with new ocean crust in the same step.',
            'Crust age layer: stripes mirror each other across the red ridge, youngest at the ridge, oldest against the two rifted coasts. The zig-zag of the original cut is inherited by the ridge.',
            `The ridge migrates. West barely moves, East races away, yet both flanks stay equally wide — so the ridge drifts east away from the “rift opened here” marker at (${EAST_CM_YR} − ${WEST_CM_YR}) / 2 = ${(EAST_CM_YR - WEST_CM_YR) / 2} cm/yr (× 0.9 at this distance from the pole). The “ridge drift” card tracks it.`,
            'New ocean belongs to the continents: on the Plates layer the interior ocean is split between West’s and East’s colours, and it moves with them. The pre-history ocean gains nothing and only shrinks.',
            'An active margin shows three bands, outboard to inboard: pale blue = the old ocean going down · deep blue = the overriding plate’s edge · violet = the rest of the persistent trench flag, stored in the overriding plate’s own crust. The band travels with the plate and does not leave a trail, because the flag belongs to the crust, not to a place on the globe. The rifted (trailing) coasts never get one.',
            `Dormancy: at ${WEST_REVERSES_MYR} Myr West reverses. Its western coast stops converging, the deep-blue/violet band turns navy along the whole coast and stays there — the record of a former active margin — while new ocean starts opening outboard of it. East’s margin stays active throughout.`,
            'Continents are untouched: land area stays exactly constant while ocean is created and destroyed.',
            'Budget: crust created ≈ crust consumed + land-on-land overlap (the sphere’s area is conserved).',
            'Late in the run East runs into Far: strong magenta contact that keeps growing, because nothing stops the plates yet (Phases 4–5).',
            'Before the reversal a few navy cells already exist where a headland’s lee filled with new ocean and shielded the coast behind it.',
        ],
        checkCommand: 'node v2/tools/check-phase2.mjs',
        maxTime: WILSON_MAX_MYR,
        timeStep: SNAPSHOT_MYR,
        initialView: [10, -30],
        layers: [
            { label: 'Crust age', paint: colorByCrustAge },
            { label: 'Plates', paint: colorByPlate },
            { label: 'Crust type', paint: colorByCrustType },
        ],
        hasBoundaries: true,
        legend: [...boundaryLegend({ collisionNote: ' (unresolved in this phase)' }), { gradient: true, label: 'ocean crust age: 0 → 180 Myr · slate = pre-history ocean' }],

        frameAt: t => recordedFrameAt(frames, t),

        stats(fr) {
            const t = frameTallies(fr), mkm2 = cells => (cells * kmPerCell2).toFixed(1);
            const landCells = any => any.plates.reduce((sum, p) => sum + p.landCells, 0);
            const landDrift = landCells(fr) - landCells(frames[0]);   // exact: counted in the plates' own rasters
            return {
                cards: [
                    { big: `${mkm2(fr.budget.created)} M km²`, small: 'ocean crust created so far' },
                    { big: `${mkm2(fr.budget.consumed)} M km²`, small: `consumed · ${mkm2(t.collision)} M km² land-on-land` },
                    { big: `${(fr.time > 0 ? turnToKm(ridgeTurn(fr)) : 0).toFixed(0)} km`, small: `ridge drift east of where the rift opened · expected ${turnToKm(expectedRidgeTurn(fr.time)).toFixed(0)} km` },
                    { big: `${t.gaps}`, small: 'unfilled gap cells (must be 0)' },
                    { big: `${landDrift >= 0 ? '+' : ''}${landDrift}`, small: 'land cells vs. start (must be 0)' },
                ],
                head: ['Plate', 'cm/yr', 'land', 'ocean'],
                rows: fr.plates.map(p => ({
                    plateId: p.id, name: p.name, note: notes[p.id],
                    cells: [p.speedCmYr.toFixed(2), `${mkm2(p.landCells)}`, `${mkm2(p.cells - p.landCells)}`],
                })),
                hint: `Areas in million km². Live trench cells: ${t.liveTrench} · dormant: ${t.dormantTrench}. ` +
                    `Simulated ${steps} adaptive steps in ${simMs.toFixed(0)} ms; the slider scrubs a recorded frame every ${SNAPSHOT_MYR} Myr.`,
            };
        },

        markers() {
            return [
                { xyz: WILSON_POLE_XYZ, plateId: 0, label: 'West + East hinge pole' },
                { xyz: WILSON_HOME.xyz, color: '#ffffff', label: 'rift opened here (fixed point)' },
            ];
        },

        describeCell,
    };
}
