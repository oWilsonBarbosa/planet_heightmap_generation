// Lab phase 5a — collision events. The Phase 4 force scenes again, now with the event rules on:
// convergence is recorded as orogeny belts, colliding plates shorten, and when they weld the
// outlines are redrawn — indenter pushed in, crust squeezed aside — the way WBP redraws by hand.

import { onlyMechanisms } from '../../tectonics/config.js';
import { FORCE_SCENES } from '../../tectonics/scenarios/force-scenes.js';
import { COLLISION_SCENES } from '../../tectonics/scenarios/collision-scenes.js';
import { simulate } from '../../tectonics/simulate.js';
import { updatePlateMotion } from '../../tectonics/step/torque-balance.js';
import { frameTallies } from '../../tectonics/measure.js';
import { CrustType, OrogenyType } from '../../tectonics/model/crust.js';
import { xyzToLatLon } from '../../tectonics/step/kinematics.js';
import { colorByPlate, colorByCrustType, colorByOrogeny, colorByThickness, colorByWeakness, overlayBoundaries, overlayRedraw, plateCss, css, OROGENY_RGB, SUTURE_RGB, OROGENY_NAME } from '../../view/palettes.js';
import { describeCell, recordedFrameAt, boundaryLegend, eventRows, SNAPSHOT_MYR, latLonOf, orogenyLegend, speedSeries } from './phase-kit.js';
import { EventKind } from '../../tectonics/model/world.js';

const REDRAW_SHOWN_MYR = 6;             // the before/after overlay stays up this long after a suture
/** These scenes isolate collisions: trench wings and island arcs (Phase 5b) and rifting (Phase 6) stay off. */
export const NO_WINGS = onlyMechanisms();          // collisions alone: no wings, no arcs, and nothing of Phases 6–7
const TUNABLES = [
    { id: 'sutureShorteningKm', label: 'Shortening before plates weld', min: 200, max: 1500, step: 50, unit: ' km' },
    { id: 'sutureStallMyr', label: '…or the seam stalled for', min: 4, max: 40, step: 1, unit: ' Myr' },
    { id: 'escapeShare', label: 'Escape (sideways share of the indent at the ends)', min: 0, max: 1, step: 0.05 },
    { id: 'indentGain', label: 'Push ahead of the indenter (× overlap depth)', min: 0.5, max: 3, step: 0.1 },
    { id: 'indentFalloffKm', label: 'Indent reaches this far behind the front', min: 200, max: 3000, step: 50, unit: ' km' },
    { id: 'sealStraitKm', label: 'Straits narrower than 2× this close at the suture', min: 0, max: 600, step: 20, unit: ' km' },
    { id: 'inlandSeaMaxKm2', label: 'Enclosed seas smaller than this close', min: 0, max: 2e6, step: 5e4, unit: ' km²' },
    { id: 'beltSpeedRefCmYr', label: 'Belt reach: convergence rate for factor 1', min: 1, max: 15, step: 0.5, unit: ' cm/yr' },
    { id: 'beltSpeedExponent', label: 'Belt reach: how strongly speed widens it', min: 0, max: 1.5, step: 0.1 },
    { id: 'thickeningPerWorkKm', label: 'Thickening per km of shortening', min: 0, max: 0.06, step: 0.005, unit: ' km/km' },
    { id: 'weakCellCost', label: 'Old sutures carry a belt further (1 = no effect)', min: 0.1, max: 1, step: 0.05 },
    { id: 'collisionResistance', label: 'Collision resistance', min: 0, max: 1000, step: 25 },
    { id: 'collisionSeparateShare', label: 'A contact resists parting at this share (low: it pivots)', min: 0, max: 1, step: 0.05 },
    { id: 'collisionShearShare', label: '…and sliding along the front at this share', min: 0, max: 1, step: 0.05 },
    { id: 'sutureGapWidthKm', label: 'Weld once the sea between is nowhere wider than', min: 0, max: 1000, step: 25, unit: ' km' },
    { id: 'ringSeaKm2', label: 'Plates ringing a sea larger than this stay apart', min: 2e5, max: 1e7, step: 1e5, unit: ' km²' },
];

const SCENES = [
    {
        id: 'zipper', base: 'zipper', label: 'Continents meet at an angle (zipper)', maxMyr: 160,
        about: COLLISION_SCENES.find(s => s.id === 'zipper').about,
        checklist: [
            'Austra’s long chain of land strikes Borea’s long south coast at an angle, its north-east end first (about 12 Myr); the magenta overlap starts there.',
            'After contact Austra turns about that first contact (Plates layer, scrub 10 → 40 Myr): its west end swings north and the ocean between the two closes like a zipper, westward along the whole margin — the contact neither freezes the two where they first touched nor see-saws (the far end does not swing back out).',
            'Only once the sea between them is narrow everywhere along the margin (under ~250 km at its widest) — or has stopped closing — do they weld (about 40 Myr); the event log says how much sea was left.',
            'Try the weld slider: set “weld once the sea between is nowhere wider than” to 1000 km and they weld within ~10 Myr of first contact, before Austra has turned (5° instead of ~20°) — the contact itself allows the turn; what froze it was welding too soon.',
        ],
    },
    {
        id: 'india', base: 'india', label: 'India meets Asia', maxMyr: 100,
        about: '“India” arrives at subducting-ocean speed and hits “Asia”. Watch the Orogeny layer: an Andean belt first grows along Asia’s active coast; on contact a collision belt spreads inland, then the two weld and the map is redrawn.',
        checklist: [
            'Before contact, an Andean belt (orange) sits along Asia’s trench-bearing coast — on land, inland of the coast, nowhere else.',
            'On contact the collision belt (purple, black while active) spreads from the front into Asia, wider the more shortening it absorbs and the faster India comes in, and stops at the craton — it wraps it, never enters it. A narrower foreland belt appears on India.',
            'At the suture the outlines are redrawn: Asia’s coast is indented around India’s nose, the flanks are squeezed outward, India sits in the notch, and narrow sea caught between the two closes (a large enclosed sea would survive). The before/after overlay (red = land gone, green = land gained) shows the change for a few Myr.',
            'After the suture there is one plate, no magenta overlap, a suture belt (Weakness layer) along the closed seam, and the merged plate moves as one.',
            'The event log below reads like WBP’s: “India meets Asia”, then “sutured … km front, … km of shortening”.',
        ],
    },
    {
        id: 'wilson', base: 'wilson', label: 'Self-driven Wilson cycle', maxMyr: 160,
        about: 'The self-driven cycle from Phase 4. East reaches Far, the lock slows the seam until it stalls, and the stalled seam welds: the two continents become one plate with a belt between them, then the new plate goes on under its own forces.',
        checklist: [
            'East slows on contact; the seam stalls; after a few tens of Myr the stalled seam welds (event log says so) instead of overlapping forever.',
            'The merged East+Far plate is one body with a collision belt along the old seam; its outline was redrawn where the two met.',
            'West is untouched: it carries only its Andean belt.',
        ],
    },
    {
        id: 'one-sided', base: 'one-sided', label: 'Andean margin', maxMyr: 80,
        about: 'A lone continent with a trench on its west coast only. Ocean goes down the trench for 80 Myr; an Andean belt grows along that coast and nowhere else. No collision here.',
        checklist: [
            'The Andean belt is a band inland of the west coast that widens as subduction goes on (it is a few hundred km at 20 Myr, wider at 80) and would be wider still with faster convergence (try a higher speed scale in Phase 4’s terms: lower drag).',
            'The east coast (passive) and the craton carry no record at all.',
            'Thickness (Thickness layer) forms a plateau across the belt — flat behind the coast, dropping at the belt’s inner edge — not a spike at the coast.',
        ],
    },
];

export function createPhase(simMesh, seed, overrides = {}) {
    const scene = SCENES.find(s => s.id === overrides.scene) ?? SCENES[0], base = FORCE_SCENES.find(s => s.id === scene.base) ?? COLLISION_SCENES.find(s => s.id === scene.base);
    const world = base.build(simMesh, seed);
    Object.assign(world.config, NO_WINGS);
    for (const t of TUNABLES) if (overrides[t.id] !== undefined) world.config[t.id] = overrides[t.id];
    const started = performance.now();
    const { frames, steps } = simulate(world, { untilMyr: scene.maxMyr, drive: updatePlateMotion, snapshotEveryMyr: SNAPSHOT_MYR });
    const simMs = performance.now() - started;
    const last = frames.at(-1);
    const movers = frames[0].plates.filter(p => !p.isBackground);
    const series = speedSeries(frames);
    const sutures = world.events.filter(e => e.kind === EventKind.SUTURE);
    const frameBefore = time => { let b = frames[0]; for (const f of frames) if (f.time < time - 1e-9) b = f; return b; };

    return {
        title: 'Phase 5a — Collision events',
        summary: 'The force scenes again, with the event rules on. Convergence at every trench and collision front is recorded as a mountain belt that reaches inland ' +
            '(width by type, onto a craton only its rim, carried further along old sutures). Colliding plates lock across the front and shorten — but a contact is a pivot, not a clamp: ' +
            'the pull of the ocean still going down beside it turns a plate about it and closes the rest like a zipper (Phase 11). Once the seam has closed, or stopped closing, they weld into one, and the outlines are redrawn as WBP redraws them by hand: the indenter pushed in, the crust ahead of it ' +
            'squeezed back and sideways, cratons moved as rigid blocks. ' + scene.about,
        checklist: [...scene.checklist,
            'The crust rules still hold: no gaps, and land is only ever lost where a collision absorbed it (the event log gives the count).'],
        checkCommand: 'node v2/tools/check-phase5.mjs',
        maxTime: scene.maxMyr,
        timeStep: SNAPSHOT_MYR,
        initialView: base.view ?? latLonOf(movers[0].centre),
        params: [
            { id: 'scene', label: 'Scene', value: scene.id, options: SCENES.map(s => ({ value: s.id, label: s.label })) },
            ...TUNABLES.map(t => ({ ...t, value: world.config[t.id] })),
        ],
        layers: [
            { label: 'Orogeny', paint: colorByOrogeny },
            { label: 'Plates', paint: colorByPlate },
            { label: 'Crust type', paint: colorByCrustType },
            { label: 'Thickness', paint: colorByThickness },
            { label: 'Weakness', paint: colorByWeakness },
        ],
        hasBoundaries: true,
        paintBoundaries(frame, out) {
            overlayBoundaries(frame, out);
            const suture = sutures.find(e => frame.time >= e.time - 1e-9 && frame.time < e.time + REDRAW_SHOWN_MYR);
            if (suture) overlayRedraw(frameBefore(suture.time), frame, out);
        },
        series,
        legend: [
            ...orogenyLegend([OrogenyType.ANDEAN, OrogenyType.LARAMIDE, OrogenyType.URAL, OrogenyType.HIMALAYAN]),
            { color: css(SUTURE_RGB), label: 'suture belt (Weakness layer)' },
            { color: 'rgb(160,20,30)', label: 'redraw: land absorbed into the belt (shown for a few Myr after a suture)' },
            { color: 'rgb(90,240,120)', label: 'redraw: land pushed out sideways' },
            ...boundaryLegend({ collisionNote: ' — shortening, until the plates weld' }),
        ],

        frameAt(t) { return recordedFrameAt(frames, t); },

        stats(frame) {
            const tally = frameTallies(frame), belts = beltTallies(frame, simMesh.cellAreaKm2);
            const rows = frame.plates.filter(p => !p.isBackground && p.alive).map(p => ({
                plateId: p.id, name: p.name, cells: [p.speedCmYr.toFixed(2), p.dynamics?.collisionCells ? `colliding over ${p.dynamics.collisionCells} cells` : '—'],
            }));
            rows.push(...eventRows(frame.events, null, 2));
            return {
                cards: [
                    { big: `${tally.collision}`, small: 'land-on-land overlap cells (0 once welded)' },
                    { big: `${(belts.areaMkm2).toFixed(1)} Mkm²`, small: `of mountain belt · thickest ${belts.maxThickKm.toFixed(0)} km` },
                ],
                head: ['Plate / event', 'cm/yr', ''],
                rows,
                hint: `${belts.summary}. ${sutures.length ? `Sutured at ${sutures.map(e => e.time.toFixed(0)).join(', ')} Myr.` : 'No suture yet.'} Simulated ${steps} steps in ${simMs.toFixed(0)} ms.`,
            };
        },

        markers() { return []; },

        describeCell(frame, w) {
            return describeCell(frame, w);
        },
    };
}

function beltTallies(frame, cellAreaKm2) {
    const count = {};
    let cells = 0, maxThickKm = 0;
    for (let w = 0; w < frame.owner.length; w++) {
        if (frame.owner[w] < 0 || frame.type[w] === CrustType.OCEAN) continue;
        if (frame.oroType[w]) { count[frame.oroType[w]] = (count[frame.oroType[w]] ?? 0) + 1; cells++; }
        if (frame.thickKm[w] > maxThickKm) maxThickKm = frame.thickKm[w];
    }
    const summary = Object.entries(count).map(([t, n]) => `${OROGENY_NAME[t]} ${(n * cellAreaKm2 / 1e6).toFixed(1)} Mkm²`).join(', ') || 'no belts yet';
    return { areaMkm2: cells * cellAreaKm2 / 1e6, maxThickKm, summary };
}

