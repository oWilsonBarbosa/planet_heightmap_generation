// Lab phase 7b — margins, flat slabs, slab rollback and back-arc basins. Every coast is classified by what
// its plate does out to sea; a young slab under a plate driving at it goes in flat; an old, rolling-back
// trench peels an arc — or a strip of a continent — off its plate and opens a sea behind it.

import { MARGIN_SCENES } from '../../tectonics/scenarios/margin-scenes.js';
import { simulate } from '../../tectonics/simulate.js';
import { frameTallies, Margin } from '../../tectonics/measure.js';
import { OrogenyType, CrustType } from '../../tectonics/model/crust.js';
import { colorByMargin, colorByOrogeny, colorByPlate, colorByCrustType, colorByCrustAge, plateCss, css, MARGIN_RGB, OROGENY_RGB, TYPE_RGB } from '../../view/palettes.js';
import { describeCell, recordedFrameAt, boundaryLegend, eventRows, SNAPSHOT_MYR, latLonOf, speedSeries } from './phase-kit.js';
import { EventKind } from '../../tectonics/model/world.js';

const TUNABLES = [
    { id: 'backArcRatePerMyr', label: 'Chance per Myr a rolling-back trench opens a back-arc sea', min: 0, max: 0.2, step: 0.005 },
    { id: 'backArcContinentalShare', label: '…at a continental margin, × this', min: 0, max: 1, step: 0.05 },
    { id: 'rollbackMinAgeMyr', label: 'A slab rolls back once older than', min: 20, max: 200, step: 5, unit: ' Myr' },
    { id: 'rollbackMaxCmYr', label: '…retreating at up to', min: 0.5, max: 8, step: 0.5, unit: ' cm/yr' },
    { id: 'backArcActiveMyr', label: 'A back-arc sea opens for', min: 5, max: 80, step: 5, unit: ' Myr' },
    { id: 'backArcWidthKm', label: 'Width of an arc that rifts off (from its trench)', min: 150, max: 800, step: 25, unit: ' km' },
    { id: 'backArcContinentalWidthKm', label: '…of a continental strip', min: 300, max: 1200, step: 25, unit: ' km' },
    { id: 'marginIsleRatePerMyr', label: 'Fore-arc islands born per 1000 km of active coast per Myr', min: 0, max: 3, step: 0.1 },
    { id: 'marginIsleGrowKmPerMyr', label: '…growing toward the mainland at', min: 0, max: 40, step: 1, unit: ' km/Myr' },
    { id: 'flatSlabMaxAgeMyr', label: 'A slab goes in flat while younger than', min: 0, max: 80, step: 5, unit: ' Myr' },
    { id: 'flatSlabAdvanceCmYr', label: '…under a plate driving at it faster than', min: 0, max: 8, step: 0.5, unit: ' cm/yr' },
];
const CHECKLISTS = {
    margins: [
        'Driftia is pulled west by its only trench. Its western coast is ACTIVE and LEADING (Margins layer: bright orange-red) — there will be a narrow shelf and a coastal range.',
        'Its eastern coast is PASSIVE and TRAILING (dark green) — a wide shelf and low coast; the north and south flanks, where it slides past the old ocean, are transform margins (yellow).',
    ],
    laramide: [
        'Laurentia drives west at 5 cm/yr into a narrow, young ocean plate made at a ridge just offshore, so the slab going down is never old.',
        'The slab goes in FLAT (event log): the mountain belt is Laramide (Orogeny layer: gold). It starts near the coast and sweeps inland over some 20 Myr as more slab goes down flat — over a thousand km in the end — instead of hugging the coast like an Andean belt. Set “A slab goes in flat while younger than” to 0 to see the Andean belt a steep slab makes instead.',
        'After some 35 Myr the slab going down is no longer young: it steepens again (event log) and the belt stops spreading inland.',
        'Off the coast, islands rise between the coast and the trench and grow into the mainland (Crust type layer), until the land reaches almost to the trench.',
    ],
    mariana: [
        'Philippina, an ocean plate, goes down under Asiana on its west while it overrides old Pacifica on its east, where it carries an island arc. It does not keep up with its own eastern trench.',
        'Within a few Myr the old slab rolls back: the arc — with the strip of Philippina behind it — rifts away after the trench (event log; Plates layer: a new plate), and a spreading ridge opens a back-arc sea between the two (Crust age layer: young ocean).',
        'The sea opens at the slab’s rollback rate, a few cm/yr — the strip follows the retreating hinge, not a force balance. After some 30 Myr it stops spreading and the arc moves with Philippina again (event log), the new sea kept.',
    ],
    japan: [
        'Asiana overrides very old Pacifica along its eastern coast, and creeps east at only 1 cm/yr: slower than the old slab rolls back.',
        'A strip of the coast — a coherent arc of land some 300 km wide, accreted crust, never a craton — rifts away after the trench as the “Isles”, and a sea opens behind it (Plates, Crust type and Crust age layers).',
        'After some 30 Myr the sea stops spreading and the Isles move with Asiana again, the sea between them kept — Japan and the Sea of Japan.',
    ],
    history: [
        'Every coast of the generated world is classified as it goes (Margins layer): active where a trench lies offshore, passive where there is none, and leading or trailing by the plate’s motion.',
        'Where a young slab goes down under a plate driving at it, it flattens and the belt reaches far inland (event log: “the slab flattens”; Orogeny layer: gold).',
        'Old, rolling-back trenches now and then peel an arc — or a strip of a continent — off their plate, and a sea opens behind it for a few tens of Myr (event log: “rolls back”); then the arc moves with its plate again.',
    ],
};
const MARGIN_NAME = { [Margin.ACTIVE]: 'active', [Margin.PASSIVE]: 'passive', [Margin.TRANSFORM]: 'transform', [Margin.COLLISION]: 'collision' };

export function createPhase(simMesh, seed, overrides = {}) {
    const scene = MARGIN_SCENES.find(s => s.id === overrides.scene) ?? MARGIN_SCENES[0];
    const world = scene.build(simMesh, seed);
    for (const t of TUNABLES) if (overrides[t.id] !== undefined) world.config[t.id] = overrides[t.id];
    const started = performance.now();
    const { frames, steps } = simulate(world, { untilMyr: scene.maxMyr, drive: w => scene.drive(w), snapshotEveryMyr: SNAPSHOT_MYR });
    const simMs = performance.now() - started;
    const last = frames.at(-1);
    const series = speedSeries(frames);
    const centre = (frames[0].plates.find(p => !p.isBackground) ?? frames[0].plates[0]).centre;

    return {
        title: 'Phase 7b — Margins & back-arcs',
        summary: 'What each coast is, and what old and young slabs do. A coast is ACTIVE where its plate’s trench lies offshore, PASSIVE where there is none, and LEADING or TRAILING by the plate’s motion — Phase 8 turns this into narrow or wide shelves and coastal ranges. ' +
            'A YOUNG slab under a plate that drives at it goes in flat: the belt becomes Laramide and reaches far inland, and the arc falls silent. An OLD slab sinks steeply and rolls back; where its trench retreats faster than the overriding plate follows, that plate is stretched until the strip behind the trench — an arc at sea, or a coherent strip of a continent — rifts away after it and a back-arc sea opens behind, for a few tens of Myr. ' + scene.about,
        checklist: [...CHECKLISTS[scene.id], 'No gaps; a strip that rifts off never takes a craton with it.'],
        checkCommand: 'node v2/tools/check-phase7b.mjs',
        maxTime: scene.maxMyr,
        timeStep: SNAPSHOT_MYR,
        initialView: scene.view ?? latLonOf(centre),
        params: [
            { id: 'scene', label: 'Scene', value: scene.id, options: MARGIN_SCENES.map(s => ({ value: s.id, label: s.label })) },
            ...TUNABLES.map(t => ({ ...t, value: world.config[t.id] })),
        ],
        layers: [
            { label: 'Margins', paint: colorByMargin },
            { label: 'Orogeny', paint: colorByOrogeny },
            { label: 'Plates', paint: colorByPlate },
            { label: 'Crust type', paint: colorByCrustType },
            { label: 'Crust age', paint: colorByCrustAge },
        ],
        hasBoundaries: true,
        series,
        legend: [
            { color: css(MARGIN_RGB[Margin.ACTIVE]), label: 'active coast: a trench offshore (Margins layer; brighter where it leads, darker where it trails)' },
            { color: css(MARGIN_RGB[Margin.PASSIVE]), label: 'passive coast: no trench' },
            { color: css(MARGIN_RGB[Margin.TRANSFORM]), label: 'transform coast: the plate slides past its neighbour' },
            { color: css(MARGIN_RGB[Margin.COLLISION]), label: 'collision: land meets land' },
            { color: css(OROGENY_RGB[OrogenyType.LARAMIDE]), label: 'Laramide belt over a flat slab (Orogeny layer)' },
            { color: css(OROGENY_RGB[OrogenyType.ANDEAN]), label: 'Andean belt over a steep slab' },
            { color: css(OROGENY_RGB[OrogenyType.TRANSPRESSION]), label: 'transpression ridge: a transform pressed together (narrow)' },
            { color: css(TYPE_RGB[CrustType.ARC]), label: 'fore-arc island or island arc (Crust type layer)' },
            ...boundaryLegend({ collisionNote: '' }),
        ],

        frameAt(t) { return recordedFrameAt(frames, t); },

        stats(frame) {
            const tally = frameTallies(frame), counts = {};
            for (let w = 0; w < frame.owner.length; w++) { const m = frame.margin[w]; if (m) counts[m & Margin.TYPE] = (counts[m & Margin.TYPE] ?? 0) + 1; }
            const rows = frame.plates.filter(p => !p.isBackground && p.alive).map(p => ({ plateId: p.id, name: p.name, cells: [p.speedCmYr.toFixed(2), `${p.landCells}`, ''] }));
            rows.push(...eventRows(frame.events, [EventKind.BACKARC_OPEN, EventKind.BACKARC_CLOSE, EventKind.SLAB_FLAT, EventKind.SLAB_STEEP, EventKind.ISLE_MERGE, EventKind.RIFT, EventKind.SUTURE], 3));
            return {
                cards: [
                    { big: `${counts[Margin.ACTIVE] ?? 0}`, small: `active coast cells · ${counts[Margin.PASSIVE] ?? 0} passive · ${counts[Margin.TRANSFORM] ?? 0} transform` },
                    { big: `${frame.events.filter(e => e.kind === EventKind.BACKARC_OPEN).length}`, small: `back-arc seas opened so far · ${tally.gaps} gaps` },
                ],
                head: ['Plate / event', 'cm/yr', 'land cells', ''],
                rows,
                hint: `An active coast has its plate’s trench within ${world.config.marginReachKm} km offshore. Simulated ${steps} steps in ${simMs.toFixed(0)} ms.`,
            };
        },

        markers() { return []; },

        describeCell(frame, w) {
            let text = describeCell(frame, w);
            const m = frame.margin[w];
            if (m) text += ` · ${MARGIN_NAME[m & Margin.TYPE]} coast${m & Margin.LEADING ? ', leading' : m & Margin.TRAILING ? ', trailing' : ''}`;
            return text;
        },
    };
}
