// What every lab phase shares: the contract a phase module must satisfy, and helpers that were
// otherwise being copied from phase to phase. No DOM code here — check scripts import it too.

import { CrustType, CrustFlag } from '../../tectonics/model/crust.js';
import { xyzToLatLon } from '../../tectonics/step/kinematics.js';
import { BoundaryKind, EventKind } from '../../tectonics/model/world.js';
import { BOUNDARY_RGB, ACTIVE_FLAG_RGB, DORMANT_TRENCH_RGB, LIP_RGB, OROGENY_RGB, OROGENY_NAME, plateCss, css } from '../../view/palettes.js';

/** Every lab phase records a frame this often (Myr); a multiple of config.stepGridMyr. */
export const SNAPSHOT_MYR = 2;

/**
 * A phase module exports `createPhase(simMesh, seed, overrides, hooks) → Phase` (or a Promise of one); hooks.progress(text)
 * tells the page how a long build is going.
 *
 * @typedef {Object} Phase
 * @property {string} title
 * @property {string} summary                 one paragraph: what this scene shows
 * @property {string[]} checklist             what the developer should verify, in plain language
 * @property {string} checkCommand            the headless check for this phase
 * @property {number} maxTime                 Myr; the timeline runs 0…maxTime
 * @property {number} timeStep                Myr between frames the timeline can show
 * @property {number} [initialTime]           Myr the timeline starts at (default 0)
 * @property {[number, number]} initialView   [lat, lon] the globe looks at first
 * @property {Layer[]} layers                 base layers (one is shown at a time)
 * @property {LegendItem[]} legend
 * @property {boolean} hasBoundaries          offer the "plate boundaries & trenches" overlay
 * @property {(frame, out: Uint8Array) => void} [paintBoundaries]  replaces the default boundary overlay
 * @property {boolean} [hasForces]            offer the force-arrow overlay (frames carry plate dynamics)
 * @property {number} [forceScale]            largest net force in the whole run — keeps arrow lengths comparable through time
 * @property {Param[]} [params]               generator / scene controls; changing one rebuilds the phase
 * @property {(t: number) => Frame} frameAt   the Frame (tectonics/snapshot.js) to show at time t
 * @property {(frame, layer) => Promise} [prepare]   slow work for a frame (terrain, on workers): the shell awaits it
 *           before painting `layer` (a phase may also build other frames ahead meanwhile)
 * @property {(frame, layer) => boolean} [isReady]   can `layer` be painted for this frame now? (A layer may declare
 *           `needsParts: true`: it needs more of the frame's build than the others do.)
 * @property {(frame) => Stats} stats
 * @property {(frame) => Marker[]} markers
 * @property {(frame, cell: number) => string} describeCell   hover / tap readout
 * @property {Series[]} [series]              lines through time for the chart (by default one speed per plate)
 * @property {string} [seriesUnit]             what the chart's numbers are (default 'cm/yr')
 * @property {Object} [displayMesh]           a finer mesh the layers paint on instead of the sim mesh (Phase 8 terrain);
 *                                            out then holds 3 bytes per display cell, describeCell gets a display cell,
 *                                            and the sim-cell overlays (gaps, boundaries) are not offered
 * @property {(frame, a: number[], b: number[], samples: number) => {km: number[], heightKm: number[], note?: string}} [profileAlong]
 *                                            heights along the great circle a → b (unit vectors): offers the cross-section tool
 *
 * @typedef {{label: string, paint: (frame, out: Uint8Array) => void, overlay?: (ctx, raster, frame) => void}} Layer
 *          overlay: drawn on the map canvas over the painted layer (e.g. ridge directions)
 * @typedef {{color?: string, gradient?: boolean, label: string}} LegendItem
 * @typedef {{id: string, label: string, value: number|string, min?: number, max?: number, step?: number, unit?: string,
 *            options?: {value: string, label: string}[], keepView?: boolean, toEnd?: boolean}} Param     a slider, or a drop-down when
 *          `options` is given (changing a drop-down starts the scene over — camera and time — unless keepView; toEnd: it keeps
 *          the camera but shows the phase's initial time, e.g. a history's new end)
 * @typedef {{cards: {big: string, small: string}[], head: string[], rows: StatsRow[], hint: string}} Stats
 * @typedef {{name: string, cells: string[], note?: string, plateId?: number, color?: string}} StatsRow
 * @typedef {{xyz: number[], label: string, plateId?: number, color?: string, kind?: 'label'}} Marker
 * @typedef {{name: string, color: string, points?: [number, number][], ticks?: number[]}} Series   a line, or ticks at the foot of the chart (event times)
 */

const REQUIRED = { title: 'string', summary: 'string', checklist: 'object', checkCommand: 'string', maxTime: 'number', timeStep: 'number',
    initialView: 'object', layers: 'object', legend: 'object', hasBoundaries: 'boolean', frameAt: 'function', stats: 'function',
    markers: 'function', describeCell: 'function' };

/** Throws a readable error if `phase` does not satisfy the contract above. Used by the shell and by every check script. */
export function assertPhaseContract(phase) {
    for (const [key, type] of Object.entries(REQUIRED)) if (typeof phase[key] !== type) throw new Error(`phase.${key} must be a ${type}`);
    if (!phase.layers.length || phase.layers.some(l => typeof l.paint !== 'function' || !l.label)) throw new Error('phase.layers needs {label, paint} entries');
    if (!(phase.maxTime > 0) || !(phase.timeStep > 0)) throw new Error('phase.maxTime and phase.timeStep must be positive');
    for (const p of phase.params ?? []) if (!p.id || !p.label || (p.options ? !p.options.length : !(p.max > p.min))) throw new Error(`bad param ${p.id}`);
    if (phase.hasForces && !(phase.forceScale > 0)) throw new Error('a phase with force arrows must supply forceScale');
}

/** The recorded frame nearest to time t, for phases that simulate up front and then scrub. */
export function recordedFrameAt(frames, t) {
    let best = frames[0];
    for (const f of frames) if (Math.abs(f.time - t) < Math.abs(best.time - t)) best = f;
    return best;
}

export const BOUNDARY_KIND_NAME = {
    [BoundaryKind.RIDGE]: 'ridge', [BoundaryKind.TRANSFORM]: 'transform', [BoundaryKind.SUBDUCTING]: 'going down a trench',
    [BoundaryKind.OVERRIDING]: 'overriding edge of a trench', [BoundaryKind.COLLISION]: 'collision front',
};

/** Legend entries for the boundary overlay, generated from the palette so they cannot drift from it. */
export function boundaryLegend({ collisionNote = '' } = {}) {
    return [
        { color: css(BOUNDARY_RGB[BoundaryKind.RIDGE]), label: 'ridge — plates separating, new crust forming' },
        { color: css(BOUNDARY_RGB[BoundaryKind.OVERRIDING]), label: 'trench — edge of the overriding plate' },
        { color: css(ACTIVE_FLAG_RGB), label: 'trench flag behind the edge (persistent, in that plate’s crust)' },
        { color: css(BOUNDARY_RGB[BoundaryKind.SUBDUCTING]), label: 'trench, subducting side' },
        { color: css(BOUNDARY_RGB[BoundaryKind.TRANSFORM]), label: 'transform — plates sliding past' },
        { color: css(BOUNDARY_RGB[BoundaryKind.COLLISION]), label: `collision — land on land${collisionNote}` },
        { color: css(DORMANT_TRENCH_RGB), label: 'former active margin (dormant trench flag, land only)' },
    ];
}

/** Hover / tap text for one cell of a frame: plate, crust, and whatever is notable about it. */
export function describeCell(frame, w, { terraneName = null } = {}) {
    const id = frame.owner[w];
    if (id < 0) return 'gap — no plate has crust here';
    const type = frame.type[w], flags = frame.flags[w];
    const crust = type === CrustType.CRATON ? 'craton'
        : type === CrustType.CONTINENT ? 'continental crust'
        : type === CrustType.ARC ? (flags & CrustFlag.MARGIN_ISLE ? 'fore-arc island' : 'island-arc crust')
        : frame.formedAt[w] < 0 ? 'pre-history ocean crust' : `ocean crust, ${(frame.time - frame.formedAt[w]).toFixed(0)} Myr old`;
    const parts = [frame.plates[id].name, crust];
    if (terraneName && type !== CrustType.OCEAN && frame.terrane[w]) parts.push(`terrane ${terraneName(frame.terrane[w])}`);
    if (frame.overlap[w] === 1) parts.push('riding over ocean');
    if (frame.overlap[w] === 2) parts.push(`COLLIDING with ${frame.collider[w] >= 0 ? frame.plates[frame.collider[w]].name : 'other land'}`);
    if (frame.boundary[w]) parts.push(BOUNDARY_KIND_NAME[frame.boundary[w]]);
    if (flags & CrustFlag.TRENCH) parts.push(`trench, ${frame.slabKm[w].toFixed(0)} km of slab`);
    if (flags & CrustFlag.APRON) parts.push('apron (captured old ocean)');
    if (flags & CrustFlag.SUTURE) parts.push('suture belt (weak)');
    if (flags & CrustFlag.RIFT_MARGIN) parts.push('rifted margin');
    if (flags & CrustFlag.FAILED_RIFT) parts.push('failed rift arm');
    if (flags & CrustFlag.LIP) parts.push('flood basalt');
    if (frame.oroType[w]) parts.push(`${OROGENY_NAME[frame.oroType[w]]} belt: ${frame.oroWork[w].toFixed(0)} km of shortening, ${frame.oroStart[w].toFixed(0)}–${frame.oroLast[w].toFixed(0)} Myr`);
    if (frame.thickKm[w] > 0.05) parts.push(`crust thickened ${frame.thickKm[w].toFixed(1)} km`);
    return parts.join(' · ');
}

/** How the lab lists each kind of event: a short label and a colour (every EventKind has one). */
export const EVENT_STYLE = Object.freeze({
    [EventKind.START]: { label: 'start', color: '#888' },
    [EventKind.PLATE_BORN]: { label: 'new plate', color: '#9ab8d8' },
    [EventKind.COLLISION]: { label: 'collision', color: '#ff00c8' },
    [EventKind.SUTURE]: { label: 'suture', color: '#f0c040' },
    [EventKind.DOCK]: { label: 'docking', color: '#e0a030' },
    [EventKind.ARC_SCRAPE]: { label: 'arc scraped', color: '#e0a030' },
    [EventKind.ARC_COLLAPSE]: { label: 'arc collapse', color: '#e0a030' },
    [EventKind.ISLE_MERGE]: { label: 'island joins', color: '#c8b070' },
    [EventKind.ARC_RECYCLED]: { label: 'arc recycled', color: '#7a6a8a' },
    [EventKind.FRAGMENT]: { label: 'fragment', color: '#888' },
    [EventKind.RIFT]: { label: 'rift', color: '#ff6b6b' },
    [EventKind.SUBDUCTION_INIT]: { label: 'new trench', color: '#7aa2ff' },
    [EventKind.SLAB_FLAT]: { label: 'flat slab', color: '#d6a028' },
    [EventKind.SLAB_STEEP]: { label: 'slab steepens', color: '#d6a028' },
    [EventKind.BACKARC_OPEN]: { label: 'back-arc opens', color: '#5ec8e0' },
    [EventKind.BACKARC_CLOSE]: { label: 'back-arc closes', color: '#5ec8e0' },
    [EventKind.PLUME_RISE]: { label: 'plume', color: '#ffd166' },
    [EventKind.PLUME_DEATH]: { label: 'plume dies', color: '#b09a60' },
    [EventKind.LIP]: { label: 'LIP', color: css(LIP_RGB) },
    [EventKind.SUPERCONTINENT]: { label: 'supercontinent', color: '#e9c46a' },
    [EventKind.DISPERSED]: { label: 'broken up', color: '#8ecae6' },
});

/**
 * Table rows for a phase's event log: one per event, oldest first, optionally only the given kinds.
 * @param {{time: number, kind: string, text: string}[]} events
 * @param {string[] | null} kinds      EventKind values to list (null = all)
 * @param {number} columns             how many cells the phase's table has after the name column
 */
export function eventRows(events, kinds = null, columns = 3) {
    return events.filter(e => !kinds || kinds.includes(e.kind)).map(e => {
        const style = EVENT_STYLE[e.kind] ?? { label: e.kind, color: '#888' };
        return { name: `${e.time.toFixed(0)} Myr`, color: style.color, cells: [style.label, ...Array(columns - 1).fill('')], note: e.text };
    });
}

/** Legend entries for the Orogeny layer: the given OrogenyType values (default: every one), named and coloured from the palette. */
export function orogenyLegend(types = Object.keys(OROGENY_NAME).map(Number), note = ' (black while being built, fading with age)') {
    return types.map(t => ({ color: css(OROGENY_RGB[t]), label: `${OROGENY_NAME[t]} belt${note}` }));
}

/** The speed chart: one line per plate that ever lived in the run (plates born later included), 0 while not alive. */
export function speedSeries(frames) {
    const last = frames.at(-1);
    return last.plates.filter(p => !p.isBackground).map(p => ({ name: p.name, color: plateCss(p.hue ?? p.id), points: frames.map(f => [f.time, f.plates[p.id]?.alive ? f.plates[p.id].speedCmYr : 0]) }));
}

/** [lat, lon] in degrees of a unit vector — where the globe should look first. */
export function latLonOf(xyz) { const ll = xyzToLatLon(xyz[0], xyz[1], xyz[2]); return [ll.lat, ll.lon]; }
