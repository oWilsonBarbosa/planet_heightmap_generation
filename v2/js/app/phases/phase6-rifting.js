// Lab phase 6a — rifting. A plume splits a lone continent; the Phase 3 start world breaks up on its
// own. Probabilistic (seeded), along the sutures, round the cratons.

import { RIFT_SCENES } from '../../tectonics/scenarios/rift-scenes.js';
import { simulate } from '../../tectonics/simulate.js';
import { updatePlateMotion } from '../../tectonics/step/torque-balance.js';
import { frameTallies } from '../../tectonics/measure.js';
import { CrustFlag } from '../../tectonics/model/crust.js';
import { colorByPlate, colorByCrustType, colorByCrustAge, colorByWeakness, colorByOrogeny, plateCss, css, SUTURE_RGB, FAILED_RIFT_RGB, RIFT_MARGIN_RGB } from '../../view/palettes.js';
import { describeCell, recordedFrameAt, boundaryLegend, eventRows, SNAPSHOT_MYR, latLonOf, speedSeries, orogenyLegend } from './phase-kit.js';

const TUNABLES = [
    { id: 'riftMinGapMyr', label: 'A piece of continent may rift again after', min: 0, max: 100, step: 5, unit: ' Myr' },
    { id: 'riftRatePerMyr', label: 'Rift chance per Myr at full tension', min: 0, max: 0.1, step: 0.005 },
    { id: 'subductionInitRatePerMyr', label: 'Chance per Myr an old margin founders', min: 0, max: 0.1, step: 0.005 },
    { id: 'subductionInitAgeMyr', label: '…ocean must be older than', min: 40, max: 300, step: 10, unit: ' Myr' },
    { id: 'plumeRatePerMyr', label: 'Random plumes per Myr', min: 0, max: 0.02, step: 0.001 },
    { id: 'riftWeaknessCost', label: 'Cost of a rift along an old suture (1 = no preference)', min: 0.1, max: 1, step: 0.05 },
    { id: 'riftPush', label: 'Push of a fresh rift on its two sides', min: 0, max: 2, step: 0.05 },
    { id: 'riftPushMyr', label: '…fading over', min: 10, max: 150, step: 5, unit: ' Myr' },
    { id: 'riftTortuosityMax', label: 'Rift length ÷ end-to-end distance, max', min: 1.1, max: 3, step: 0.1 },
    { id: 'riftFailedArmKm', label: 'Failed arm length', min: 0, max: 1500, step: 50, unit: ' km' },
    { id: 'riftElongationBias', label: 'Preference for round / square pieces', min: 0, max: 3, step: 0.1 },
    { id: 'riftCostSlack', label: '…among cuts costing up to × the cheapest', min: 1, max: 3, step: 0.1 },
    { id: 'sutureStallMinKm', label: 'Shortening before a stalled seam may weld', min: 0, max: 600, step: 25, unit: ' km' },
];
const CHECKLISTS = {
    plume: [
        'At 20 Myr the plume rises (marker) and the rift runs from it to two coasts on opposite sides: round the craton, never through it, along any old seams (Weakness layer).',
        'A third arm sets off and stops: the failed arm (Weakness layer, dotted line) — a weak line for later.',
        'The halves keep the parent’s motion for an instant, then their own trenches pull them apart: a ridge (red) and new ocean open along the rift; the halves do not collide with each other.',
        'Scrub to the end: the halves are separate plates with their own speeds (chart), each with a trench on its outer side.',
    ],
    breakup: [
        'The supercontinent is old, so it may rift from the start: the first rift comes within a few tens of Myr — when exactly is a matter of chance from the seed (try New).',
        'The rift follows the sutures between cratons (Weakness layer) and never cuts a craton; the two pieces are compact — round or square, not slivers or long crescents — and named by the cratons they hold.',
        'The pieces disperse under their own trenches — slowly, as continents this size do — grow wings and arcs, and may hinge, pinch and weld again where they stay in contact.',
        'Further rifts and sutures follow over 300 Myr: the first history the generator produces by itself. The event log reads like WBP’s.',
        'Old passive margins founder into new trenches as the history runs (event log: “a new trench founders…”), so oceans that opened begin to close again.',
    ],
    founder: [
        'Both continents start wholly passive: no trench anywhere (Plates layer), nothing moving, an old ocean between them.',
        'Somewhere in the first couple of hundred Myr a margin founders: a new trench appears along a long stretch of it (event log: “a new trench founders…”), always with the OLDER ocean going down and never with the passive pre-history ocean on top.',
        'Once a slab hangs from the new trench it pulls: the continent above it starts to move, and the ocean that was open begins to close — the far side of a Wilson cycle.',
        'When it happens is a matter of chance from the seed (try New); that it happens at all is the rule.',
    ],
};

export function createPhase(simMesh, seed, overrides = {}) {
    const scene = RIFT_SCENES.find(s => s.id === overrides.scene) ?? RIFT_SCENES[0];
    const world = scene.build(simMesh, seed);
    for (const t of TUNABLES) if (overrides[t.id] !== undefined) world.config[t.id] = overrides[t.id];
    const started = performance.now();
    const { frames, steps } = simulate(world, { untilMyr: scene.maxMyr, drive: updatePlateMotion, snapshotEveryMyr: SNAPSHOT_MYR });
    const simMs = performance.now() - started;
    const last = frames.at(-1);
    const plumes = world.plumes.map(p => ({ time: p.time, xyz: p.cell >= 0 ? plumeWorldXyz(world, p, frames) : null })).filter(p => p.xyz);
    const series = speedSeries(frames);
    const centre = frames[0].plates.find(p => !p.isBackground).centre;

    return {
        title: 'Phase 6a — Rifting',
        summary: 'Oceans open. A continent that has been stable for a while and is under tension (its trenches pulling it opposite ways) rifts with a chance per Myr from the world’s seeded random stream; ' +
            'a mantle plume forces one. The rift starts at a junction, runs to the coasts on opposite sides along the cheapest line — old sutures and failed rifts are cheap, cratons are dear — ' +
            'leaves a failed arm, and splits the plate in two. From then on the Phase 2–5 rules do the rest: a ridge opens, the halves drift under their own trenches. ' + scene.about,
        checklist: [...CHECKLISTS[scene.id], 'No gaps; land is conserved through every rift (cells change plate, never vanish).'],
        checkCommand: 'node v2/tools/check-phase6.mjs',
        maxTime: scene.maxMyr,
        timeStep: SNAPSHOT_MYR,
        initialView: scene.view ?? latLonOf(centre),
        params: [
            { id: 'scene', label: 'Scene', value: scene.id, options: RIFT_SCENES.map(s => ({ value: s.id, label: s.label })) },
            ...TUNABLES.map(t => ({ ...t, value: world.config[t.id] })),
        ],
        layers: [
            { label: 'Plates', paint: colorByPlate },
            { label: 'Weakness', paint: colorByWeakness },
            { label: 'Crust type', paint: colorByCrustType },
            { label: 'Crust age', paint: colorByCrustAge },
            { label: 'Orogeny', paint: colorByOrogeny },
        ],
        hasBoundaries: true,
        series,
        legend: [
            { color: css(SUTURE_RGB), label: 'suture belt (Weakness layer): old seams a rift prefers' },
            { color: css(FAILED_RIFT_RGB), label: 'failed rift arm (Weakness layer)' },
            { color: css(RIFT_MARGIN_RGB), label: 'rifted margin (Weakness layer)' },
            ...orogenyLegend(undefined, ' (Orogeny layer; black while being built, fading with age)'),
            ...boundaryLegend({ collisionNote: '' }),
        ],

        frameAt(t) { return recordedFrameAt(frames, t); },

        stats(frame) {
            const tally = frameTallies(frame);
            let riftMargins = 0, failedArms = 0;
            for (let w = 0; w < frame.owner.length; w++) { if (frame.flags[w] & CrustFlag.RIFT_MARGIN) riftMargins++; if (frame.flags[w] & CrustFlag.FAILED_RIFT) failedArms++; }
            const rows = frame.plates.filter(p => !p.isBackground && p.alive).map(p => ({ plateId: p.id, name: p.name, cells: [p.speedCmYr.toFixed(2), p.dynamics ? p.dynamics.tension.toFixed(2) : '—', `${p.landCells}`] }));
            rows.push(...eventRows(frame.events, null, 3));
            return {
                cards: [
                    { big: `${frame.plates.filter(p => p.alive && !p.isBackground).length}`, small: 'continental plates' },
                    { big: `${riftMargins}`, small: `rifted-margin cells · ${failedArms} failed-arm cells · ${tally.gaps} gaps` },
                ],
                head: ['Plate / event', 'cm/yr', 'tension', 'land cells'],
                rows,
                hint: `Tension = share of a plate’s trench pull that cancels itself; a rift becomes likely once it is high and the plate has been stable for the tenure. Simulated ${steps} steps in ${simMs.toFixed(0)} ms.`,
            };
        },

        markers(frame) { return plumes.filter(p => frame.time >= p.time - 1e-9 && frame.time < p.time + 20).map(p => ({ xyz: p.xyz, label: 'plume', color: '#ffd166' })); },

        describeCell(frame, w) {
            return describeCell(frame, w);
        },
    };
}

/** World position of a scheduled plume: its plate-frame cell carried by the plate's orientation at that time. */
function plumeWorldXyz(world, plume, frames) {
    const f = frames.find(fr => fr.time >= plume.time) ?? frames[0], p = f.plates[plume.plate];
    if (!p) return null;
    const { xyz } = world.mesh, q = p.quat, c = plume.cell, v = [xyz[3 * c], xyz[3 * c + 1], xyz[3 * c + 2]];
    // rotate v by quaternion q (w, x, y, z)
    const [w, x, y, z] = q, t = [2 * (y * v[2] - z * v[1]), 2 * (z * v[0] - x * v[2]), 2 * (x * v[1] - y * v[0])];
    return [v[0] + w * t[0] + (y * t[2] - z * t[1]), v[1] + w * t[1] + (z * t[0] - x * t[2]), v[2] + w * t[2] + (x * t[1] - y * t[0])];
}

