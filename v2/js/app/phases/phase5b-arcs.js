// Lab phase 5b — plates larger than their land: trench wings, island arcs, terranes docking, and
// the polarity reversal that falls out of the polarity rule when an arc lands on a passive margin.

import { onlyMechanisms } from '../../tectonics/config.js';
import { EVENT_SCENES } from '../../tectonics/scenarios/event-scenes.js';
import { simulate } from '../../tectonics/simulate.js';
import { updatePlateMotion } from '../../tectonics/step/torque-balance.js';
import { frameTallies } from '../../tectonics/measure.js';
import { CrustType, CrustFlag, OrogenyType } from '../../tectonics/model/crust.js';
import { BoundaryKind } from '../../tectonics/model/world.js';
import { xyzToLatLon } from '../../tectonics/step/kinematics.js';
import { colorByPlate, colorByCrustType, colorByOrogeny, colorByWeakness, plateCss, css, TYPE_RGB, OROGENY_RGB } from '../../view/palettes.js';
import { describeCell, recordedFrameAt, boundaryLegend, eventRows, SNAPSHOT_MYR, latLonOf, speedSeries } from './phase-kit.js';

/** These scenes isolate wings, arcs and terranes: rifting (Phase 6) stays off. */
export const NO_RIFTS = onlyMechanisms('wings', 'arcs');   // wings, arcs and terranes alone: nothing of Phases 6–7
const TUNABLES = [
    { id: 'wingGrowthCmYr', label: 'Wing growth (trench ends propagate)', min: 0, max: 12, step: 0.5, unit: ' cm/yr' },
    { id: 'wingMaxKm', label: 'Wing length past the land, max', min: 500, max: 5000, step: 100, unit: ' km' },
    { id: 'wingBendToMotion', label: 'Wings across the motion (0 = along strike)', min: 0, max: 1, step: 0.05 },
    { id: 'wingFillKm', label: 'Fore-arc captured behind a wing', min: 0, max: 1200, step: 50, unit: ' km' },
    { id: 'arcMatureConsumedKm', label: 'Slab needed before an arc forms', min: 600, max: 4000, step: 100, unit: ' km' },
    { id: 'arcWidenSlabKm', label: 'Slab per extra row of arc (widening with age)', min: 200, max: 3000, step: 100, unit: ' km' },
    { id: 'arcNoLandWithinKm', label: 'No arc within this distance of land', min: 100, max: 1000, step: 50, unit: ' km' },
    { id: 'terraneMaxAreaKm2', label: 'Landmasses smaller than this dock as terranes', min: 2e5, max: 4e6, step: 1e5, unit: ' km²' },
    { id: 'arcCollapseKm', label: 'An arc this close to its own coast collapses onto it', min: 300, max: 2000, step: 50, unit: ' km' },
    { id: 'arcCollapseAgeMyr', label: '…once this old', min: 5, max: 100, step: 5, unit: ' Myr' },
];
const CHECKLISTS = {
    wings: [
        'From the first tens of Myr the trench (blue) reaches past the north and south ends of the continent, out to sea, running across the plate’s motion rather than along the coast; the plate (Plates layer) grows a fore-arc of old ocean behind each wing.',
        'The continent keeps its active-margin speed (2–5 cm/yr): wings pull it the same way the coastal trench does.',
        'After ~40 Myr, island-arc crust (Crust type layer: rust-brown) appears one cell behind the wings and grows into chains along them — never next to the continent, where the belt is Andean instead — and it belongs to the continent’s plate. With continued subduction the chains widen: islets, then clusters, then long islands (scrub 100 → 200 → 300 Myr).',
        'The plate never grows forward: the trench stays an apron’s width ahead of the land; what the plate gains lies beside the continent, behind the wings.',
    ],
    terrane: [
        'The microcontinent rides north at subducting-ocean speed and, on arrival, is added to Asia at once (event log: “terrane … accretes”), with a narrow Ural belt on both sides and a suture along the join — no wide plateau, no redraw.',
        'Subduction jumps: right after docking, the trench (overriding edge, dark blue) runs along the terrane’s outboard side, and Rider’s ocean keeps going down there at close to its old speed.',
    ],
    arc: [
        'Austral, with no trench of its own, is pulled north by its ocean going down Oceanica’s trench; it meets the arc at ~30 Myr.',
        'The arc is small, so it accretes onto Austral (event log: “island arc … accretes”); a Ural belt marks the join.',
        'Polarity reverses: before contact the overriding edge (dark blue) belongs to Oceanica; afterwards it belongs to Austral, and Oceanica’s ocean goes down beneath Austral — Oceanica speeds up again as slab pull takes hold.',
        'Every arc piece that later touches Austral docks too; and once the accreted arc sits close to Austral’s coast with sea between, it collapses onto the coast: the sea closes, the fore-arc is given up, the trench jumps in — the plate’s front retreats.',
    ],
    'arc-collision': [
        'Westland and Eastland close on each other, each with an island arc on its facing margin (Crust type layer: rust-brown).',
        'Where the arcs meet they do NOT weld the two plates: arc crust is thin, so it is scraped onto whichever continent it hits (event log: “island arc … is scraped onto …”) and the ocean behind it keeps going down. The continents go on closing.',
        'The collision proper — the overlap (magenta), the shortening, the belts and finally the suture — comes only when the two CONTINENTAL cores meet, tens of Myr later.',
    ],
};

export function createPhase(simMesh, seed, overrides = {}) {
    const scene = EVENT_SCENES.find(s => s.id === overrides.scene) ?? EVENT_SCENES[0];
    const world = scene.build(simMesh, seed);
    Object.assign(world.config, NO_RIFTS);
    for (const t of TUNABLES) if (overrides[t.id] !== undefined) world.config[t.id] = overrides[t.id];
    const started = performance.now();
    const { frames, steps } = simulate(world, { untilMyr: scene.maxMyr, drive: updatePlateMotion, snapshotEveryMyr: SNAPSHOT_MYR });
    const simMs = performance.now() - started;
    const last = frames.at(-1), movers = frames[0].plates.filter(p => !p.isBackground);
    const series = speedSeries(frames);

    return {
        title: 'Phase 5b — Wings, arcs and terranes',
        summary: 'Plates are larger than their land. A trench’s ends propagate out to sea across the plate’s motion, capturing old ocean into the plate as a fore-arc; ' +
            'where a wing has swallowed enough slab an island arc forms behind it, on the plate that carries the trench. A small landmass that reaches another does not suture: ' +
            'it is added to the bigger one’s plate, and because land always overrides ocean, subduction then jumps to its outboard side — or, when the small piece was an arc ' +
            'on the overriding plate, the polarity reverses. ' + scene.about,
        checklist: [...CHECKLISTS[scene.id], 'No gaps; land changes only where the log says crust changed hands.'],
        checkCommand: 'node v2/tools/check-phase5b.mjs',
        maxTime: scene.maxMyr,
        timeStep: SNAPSHOT_MYR,
        initialView: scene.view,
        params: [
            { id: 'scene', label: 'Scene', value: scene.id, options: EVENT_SCENES.map(s => ({ value: s.id, label: s.label })) },
            ...TUNABLES.map(t => ({ ...t, value: world.config[t.id] })),
        ],
        layers: [
            { label: 'Plates', paint: colorByPlate },
            { label: 'Crust type', paint: colorByCrustType },
            { label: 'Orogeny', paint: colorByOrogeny },
            { label: 'Weakness', paint: colorByWeakness },
        ],
        hasBoundaries: true,
        series,
        legend: [
            { color: css(TYPE_RGB[CrustType.ARC]), label: 'island-arc crust (Crust type layer) — land, on the plate that carries the trench' },
            { color: css(OROGENY_RGB[OrogenyType.URAL]), label: 'Ural belt: a terrane or arc docking (Orogeny layer)' },
            ...boundaryLegend({ collisionNote: ' — a small landmass docks at once' }),
        ],

        frameAt(t) { return recordedFrameAt(frames, t); },

        stats(frame) {
            const tally = frameTallies(frame), t = tallies(frame, simMesh);
            const rows = frame.plates.filter(p => !p.isBackground && p.alive).map(p => {
                const own = t.byPlate.get(p.id) ?? { arc: 0, trench: 0, overriding: 0 };
                return { plateId: p.id, name: p.name, cells: [p.speedCmYr.toFixed(2), `${own.trench}`, `${own.overriding}`, `${own.arc}`] };
            });
            rows.push(...eventRows(frame.events, null, 4));
            return {
                cards: [
                    { big: `${t.wingCells}`, small: 'trench cells more than 600 km from any land (the wings)' },
                    { big: `${t.arcCells}`, small: 'cells of island-arc crust' },
                ],
                head: ['Plate / event', 'cm/yr', 'trench flags', 'overriding edge', 'arc cells'],
                rows,
                hint: `Overlap cells now: ${tally.collision} (a docking clears them at once). Simulated ${steps} steps in ${simMs.toFixed(0)} ms.`,
            };
        },

        markers() { return []; },

        describeCell(frame, w) {
            return describeCell(frame, w);
        },
    };
}

/** Per-plate trench / overriding / arc counts, and the wing cells (trench far from any land). */
export function tallies(frame, mesh) {
    const { adjOffset, adjList, numCells, edgeKm } = mesh, byPlate = new Map();
    const land = new Uint8Array(numCells);
    for (let w = 0; w < numCells; w++) land[w] = frame.owner[w] >= 0 && frame.type[w] !== CrustType.OCEAN ? 1 : 0;
    // hop distance to land, out to 600 km
    const dist = new Int16Array(numCells).fill(-1);
    let frontier = [];
    for (let w = 0; w < numCells; w++) if (land[w]) { dist[w] = 0; frontier.push(w); }
    const farHops = Math.ceil(600 / edgeKm);
    for (let d = 1; frontier.length && d <= farHops; d++) {
        const next = [];
        for (const w of frontier) for (let k = adjOffset[w]; k < adjOffset[w + 1]; k++) { const nb = adjList[k]; if (dist[nb] < 0) { dist[nb] = d; next.push(nb); } }
        frontier = next;
    }
    let wingCells = 0, arcCells = 0;
    for (let w = 0; w < numCells; w++) {
        const id = frame.owner[w];
        if (id < 0) continue;
        const own = byPlate.get(id) ?? byPlate.set(id, { arc: 0, trench: 0, overriding: 0 }).get(id);
        if (frame.type[w] === CrustType.ARC) { own.arc++; arcCells++; }
        if (frame.flags[w] & CrustFlag.TRENCH) { own.trench++; if (dist[w] < 0) wingCells++; }
        if (frame.boundary[w] === BoundaryKind.OVERRIDING) own.overriding++;
    }
    return { byPlate, wingCells, arcCells };
}

