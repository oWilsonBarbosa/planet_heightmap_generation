// Lab phase 4 — plate driving forces. Nothing is prescribed: each scene is simulated with
// updatePlateMotion() as the only source of motion, then scrubbed frame by frame.

import { FORCE_SCENES } from '../../tectonics/scenarios/force-scenes.js';
import { simulate } from '../../tectonics/simulate.js';
import { updatePlateMotion } from '../../tectonics/step/torque-balance.js';
import { frameTallies, situationOf, isSteady, SITUATIONS } from '../../tectonics/measure.js';
import { xyzToLatLon } from '../../tectonics/step/kinematics.js';
import { colorByPlate, colorByCrustType, colorByCrustAge, plateCss } from '../../view/palettes.js';
import { FORCE_COLORS } from '../overlays.js';
import { describeCell, recordedFrameAt, boundaryLegend, SNAPSHOT_MYR, latLonOf } from './phase-kit.js';

const POLE_MARKER_MIN_CM_YR = 0.3;      // a plate slower than this has no meaningful Euler pole to show
const TUNABLES = [
    { id: 'slabPull', label: 'Slab pull (on the subducting plate)', min: 0, max: 2, step: 0.05 },
    { id: 'slabResistance', label: 'Mantle resistance to a sinking slab', min: 5, max: 100, step: 5 },
    { id: 'slabSuction', label: 'Slab suction (on the overriding plate)', min: 0, max: 0.8, step: 0.01 },
    { id: 'ridgePush', label: 'Ridge push', min: 0, max: 0.4, step: 0.01 },
    { id: 'dragContinent', label: 'Drag under continents (ocean = 1)', min: 1, max: 12, step: 0.5, unit: '×' },
    { id: 'dragCraton', label: 'Drag under cratons (ocean = 1)', min: 1, max: 20, step: 0.5, unit: '×' },
    { id: 'collisionResistance', label: 'Collision resistance', min: 0, max: 1000, step: 25 },
    { id: 'slabMatureKm', label: 'Slab length for full trench pull', min: 100, max: 1500, step: 50, unit: ' km' },
    { id: 'relaxMyr', label: 'Response time', min: 1, max: 20, step: 1, unit: ' Myr' },
    { id: 'mobility', label: 'Overall speed scale', min: 1, max: 8, step: 0.1 },
];

const SHARED_CHECKLIST = [
    'Motion is smooth — the speed chart has no spikes or oscillation — and plates take a few Myr to respond (the “response time” slider).',
    'The table below gives each plate’s situation, judged from the forces on it, and the speed band Worldbuilding Pasta gives for that situation. ✓ / ✗ appears once the plate has settled at the speed its forces call for; “…” means it is still speeding up or slowing down. “SPEED CAP HIT” must never appear.',
    'The Phase 2–3 crust rules still hold under computed motion: no gaps, continents keep their shape, trench bands sit on the overriding edge.',
];

export function createPhase(simMesh, seed, overrides = {}) {
    const scene = FORCE_SCENES.find(s => s.id === overrides.scene) ?? FORCE_SCENES[0];
    const world = scene.build(simMesh, seed);
    for (const t of TUNABLES) if (overrides[t.id] !== undefined) world.config[t.id] = overrides[t.id];
    const started = performance.now();
    const { frames, steps } = simulate(world, { untilMyr: scene.maxMyr, drive: updatePlateMotion, snapshotEveryMyr: SNAPSHOT_MYR, events: false });     // kinematics and crust rules only: events are Phase 5
    const simMs = performance.now() - started;

    const movers = frames[0].plates.filter(p => !p.isBackground);
    const series = movers.map(p => ({ name: p.name, color: plateCss(p.hue ?? p.id), points: frames.map(f => [f.time, f.plates[p.id].speedCmYr]) }));
    let forceScale = 1e-9;
    for (const f of frames) for (const p of f.plates) for (const force of p.dynamics?.forces ?? []) forceScale = Math.max(forceScale, Math.hypot(...force.vector));

    return {
        title: 'Phase 4 — Plate driving forces',
        summary: 'Nothing is told how to move any more. Every step, each plate’s rotation is solved from a balance of torques: ' +
            'slab pull on a subducting plate (held back by the mantle’s resistance to the sinking slab), slab suction on the plate ' +
            'that carries a trench, ridge push at young ridges, a viscous lock where land meets land — all against basal drag, ' +
            'which is heavier under continents and cratons. The pre-history ocean never moves. ' + scene.about,
        checklist: [...scene.checklist, ...SHARED_CHECKLIST],
        checkCommand: 'node v2/tools/check-phase4.mjs',
        maxTime: scene.maxMyr,
        timeStep: SNAPSHOT_MYR,
        initialView: scene.view ?? latLonOf(movers[0].centre),
        params: [
            { id: 'scene', label: 'Scene', value: scene.id, options: FORCE_SCENES.map(s => ({ value: s.id, label: s.label })) },
            ...TUNABLES.map(t => ({ ...t, value: world.config[t.id] })),
        ],
        layers: [
            { label: 'Plates', paint: colorByPlate },
            { label: 'Crust type', paint: colorByCrustType },
            { label: 'Crust age', paint: colorByCrustAge },
        ],
        hasBoundaries: true,
        hasForces: true,
        forceScale,
        series,
        legend: [
            ...Object.entries(FORCE_COLORS).map(([name, color]) => ({ color, label: `force arrow: ${name} (summed over the plate)` })),
            ...boundaryLegend({ collisionNote: ', plates locking' }),
        ],

        frameAt(t) { return recordedFrameAt(frames, t); },

        stats(frame) {
            const tally = frameTallies(frame);
            return {
                cards: [
                    { big: `${tally.collision}`, small: 'land-on-land overlap cells (should stay a thin seam)' },
                    { big: `${tally.gaps}`, small: 'unfilled gap cells (must be 0)' },
                ],
                head: ['Plate', 'cm/yr', 'WBP band', 'tension'],
                rows: frame.plates.filter(p => !p.isBackground && p.alive).map(p => plateRow(p, scene)),
                hint: 'Speed is measured at the plate’s centre. Tension = share of the pulling that cancels itself (0 = all one way, 1 = perfect tug of war). ' +
                    `Simulated ${steps} steps in ${simMs.toFixed(0)} ms.`,
            };
        },

        /** Each moving plate's Euler pole right now (both ends of the axis), so rotation vs translation is visible. */
        markers(frame) {
            const out = [];
            for (const p of frame.plates) {
                if (p.isBackground || p.speedCmYr < POLE_MARKER_MIN_CM_YR) continue;
                const rate = Math.hypot(...p.omega), pole = p.omega.map(v => v / rate);
                out.push({ xyz: pole, plateId: p.id, label: `${p.name} pole` }, { xyz: pole.map(v => -v), plateId: p.id, label: '' });
            }
            return out;
        },

        describeCell,
    };
}

function plateRow(p, scene) {
    const d = p.dynamics, kind = situationOf(d), band = SITUATIONS[kind];
    const expected = scene.expect[p.name] ?? scene.expect['*'] ?? [];
    const inBand = p.speedCmYr >= band.min - 0.05 && p.speedCmYr <= band.max + 0.05;
    const verdict = !isSteady(p) ? '…' : inBand && expected.includes(kind) ? '✓' : '✗';
    const forces = d ? d.forces.filter(f => f.cells).map(f => `${f.name} on ${f.cells} cells`).join(' · ') : '';
    return {
        plateId: p.id, name: p.name,
        cells: [p.speedCmYr.toFixed(2), `${band.min}–${band.max} ${verdict}`, d ? d.tension.toFixed(2) : '—'],
        note: band.label + (expected.includes(kind) ? '' : ` (this scene expects: ${expected.join(' or ')})`) + (forces ? ' — ' + forces : '') +
            (d?.collisionCells ? ` · locked to a neighbour over ${d.collisionCells} cells` : '') + (d?.capped ? ' · SPEED CAP HIT' : ''),
    };
}

