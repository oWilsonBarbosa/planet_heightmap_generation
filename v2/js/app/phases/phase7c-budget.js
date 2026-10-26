// Lab phase 7c — the crust budget. Continents gain area (island arcs, fore-arc islands) and now also lose it: erosive
// margins eat their coasts, a continent driven into another slides under it, and small arcs go down with their slabs
// instead of accreting. Each scene isolates one; the last runs them all over a long history.

import { BUDGET_SCENES } from '../../tectonics/scenarios/budget-scenes.js';
import { simulate } from '../../tectonics/simulate.js';
import { frameTallies, Margin } from '../../tectonics/measure.js';
import { CrustType } from '../../tectonics/model/crust.js';
import { EventKind } from '../../tectonics/model/world.js';
import { colorByMargin, colorByCrustType, colorByThickness, colorByOrogeny, colorByPlate, css, MARGIN_RGB, EROSIVE_RGB, TYPE_RGB } from '../../view/palettes.js';
import { describeCell, recordedFrameAt, boundaryLegend, eventRows, latLonOf, SNAPSHOT_MYR } from './phase-kit.js';

const TUNABLES = [
    { id: 'marginErosiveShare', label: 'Share of active margins that are erosive', min: 0, max: 1, step: 0.05 },
    { id: 'marginErosionKmPerMyr', label: '…their coast retreating at', min: 0, max: 10, step: 0.5, unit: ' km/Myr' },
    { id: 'underthrustShare', label: 'Share of a collision’s convergence consumed by underthrusting', min: 0, max: 1, step: 0.05 },
    { id: 'arcAccreteMinKm2', label: 'An arc piece smaller than this goes down instead of accreting (km²)', min: 0, max: 5e5, step: 1e4 },
    { id: 'marginIsleRatePerMyr', label: 'Fore-arc islands born per 1000 km of accretionary coast per Myr', min: 0, max: 3, step: 0.1 },
];
const CHECKLISTS = {
    erosion: [
        'Driftia’s western coast is active all along, but in two kinds of stretches (Margins layer): EROSIVE (purple) and ACCRETIONARY (orange-red).',
        'Off the accretionary stretches islands rise and grow into the coast (Crust type layer); along the erosive stretches there are none, and the coast retreats — by some 200–300 km over the run — while its mountain belt keeps forming on the new coast.',
        'A stretch keeps its character as Driftia moves (the field is fixed in the plate). Cratons are never eaten.',
    ],
    india: [
        'India reaches Asia at ~38 Myr. As they converge, India’s land in the overlap is consumed — it slides under Asia — so the land chart falls rather than rises through the collision.',
        'Asia’s crust above the consumed land thickens (Thickness layer: bright) — a plateau for Phase 8, Tibet.',
        'Set “Share of a collision’s convergence consumed” to 0 to compare: nothing slides under, and the collision only welds.',
    ],
    arcs: [
        'The two continents close, each with island arcs on its facing margin; the arcs meet first.',
        'Small arc pieces that reach a continent go DOWN with their slab instead of accreting (event log: “arc recycled”); big arcs still accrete. What the continents keep from arcs comes in fewer, bigger pieces.',
        'Set the arc threshold to 0 to see every scrap accrete instead.',
    ],
    history: [
        'The start world over 600 Myr with every rule on (building takes a while).',
        'The land chart rises — arcs and fore-arc islands add crust — but levels off rather than climbing without end: erosive margins, underthrusting and recycled arcs take some back (stats: the budget so far).',
    ],
};

export function createPhase(simMesh, seed, overrides = {}) {
    const scene = BUDGET_SCENES.find(s => s.id === overrides.scene) ?? BUDGET_SCENES[0];
    const world = scene.build(simMesh, seed);
    for (const t of TUNABLES) if (overrides[t.id] !== undefined) world.config[t.id] = overrides[t.id];
    const started = performance.now();
    const { frames, steps } = simulate(world, { untilMyr: scene.maxMyr, drive: w => scene.drive(w), snapshotEveryMyr: SNAPSHOT_MYR });
    const simMs = performance.now() - started, { cellAreaKm2 } = simMesh;
    const landMkm2 = f => { let n = 0; for (let w = 0; w < f.owner.length; w++) if (f.owner[w] >= 0 && f.type[w] !== CrustType.OCEAN) n++; return n * cellAreaKm2 / 1e6; };
    const series = [{ name: 'land', color: css([200, 190, 150]), points: frames.map(f => [f.time, landMkm2(f)]) }];
    const centre = (frames[0].plates.find(p => !p.isBackground) ?? frames[0].plates[0]).centre;
    const km2 = cells => `${(cells * cellAreaKm2 / 1e6).toFixed(2)} Mkm²`;

    return {
        title: 'Phase 7c — Crust budget',
        summary: 'Continents grow — island arcs and fore-arc islands add crust — and now they also lose it, so they do not grow without bound over a long history. About half of active margins are EROSIVE: the trench eats the fore-arc and the coast retreats. A continent driven into another slides UNDER it, and its area becomes the other’s thickened crust. A small island arc arriving at a continent goes down with its slab instead of accreting, so continents gain from arcs in fewer, bigger pieces. ' + scene.about,
        checklist: [...CHECKLISTS[scene.id], 'No gaps.'],
        checkCommand: 'node v2/tools/check-phase7c.mjs',
        maxTime: scene.maxMyr,
        timeStep: SNAPSHOT_MYR,
        initialView: scene.view ?? latLonOf(centre),
        params: [
            { id: 'scene', label: 'Scene', value: scene.id, options: BUDGET_SCENES.map(s => ({ value: s.id, label: s.label })) },
            ...TUNABLES.map(t => ({ ...t, value: world.config[t.id] })),
        ],
        layers: [
            { label: 'Margins', paint: colorByMargin },
            { label: 'Crust type', paint: colorByCrustType },
            { label: 'Thickness', paint: colorByThickness },
            { label: 'Orogeny', paint: colorByOrogeny },
            { label: 'Plates', paint: colorByPlate },
        ],
        hasBoundaries: true,
        series,
        seriesUnit: 'Mkm² of land',
        legend: [
            { color: css(EROSIVE_RGB), label: 'erosive margin: the trench eats the coast (Margins layer)' },
            { color: css(MARGIN_RGB[Margin.ACTIVE]), label: 'accretionary active margin: islands build out (Margins layer)' },
            { color: css(TYPE_RGB[CrustType.ARC]), label: 'island arc or fore-arc island (Crust type layer)' },
            { color: 'rgb(255,230,160)', label: 'thickened crust — a plateau to come (Thickness layer)' },
            ...boundaryLegend({ collisionNote: ' — the lower continent slides under' }),
        ],

        frameAt(t) { return recordedFrameAt(frames, t); },

        stats(frame) {
            const tally = frameTallies(frame), b = frame.budget;
            const rows = frame.plates.filter(p => !p.isBackground && p.alive).map(p => ({ plateId: p.id, name: p.name, cells: [p.speedCmYr.toFixed(2), `${p.landCells}`, ''] }));
            rows.push(...eventRows(frame.events, [EventKind.ARC_RECYCLED, EventKind.ISLE_MERGE, EventKind.DOCK, EventKind.ARC_SCRAPE, EventKind.COLLISION, EventKind.SUTURE, EventKind.RIFT], 3));
            const land = landMkm2(frame), land0 = landMkm2(frames[0]);
            return {
                cards: [
                    { big: `${land.toFixed(1)} Mkm²`, small: `of land (${land >= land0 ? '+' : ''}${(100 * (land / land0 - 1)).toFixed(1)} % since the start) · ${tally.gaps} gaps` },
                    { big: km2(b.erodedCells + b.underthrustCells + b.recycledCells), small: `lost so far: ${km2(b.erodedCells)} to erosive margins, ${km2(b.underthrustCells)} underthrust, ${km2(b.recycledCells)} of arcs recycled` },
                ],
                head: ['Plate / event', 'cm/yr', 'land cells', ''],
                rows,
                hint: `Simulated ${steps} steps in ${(simMs / 1000).toFixed(1)} s.`,
            };
        },

        markers() { return []; },

        describeCell(frame, w) {
            let text = describeCell(frame, w);
            const m = frame.margin[w];
            if (m && (m & Margin.TYPE) === Margin.ACTIVE) text += m & Margin.EROSIVE ? ' · erosive margin: the coast retreats' : ' · accretionary margin';
            return text;
        },
    };
}
