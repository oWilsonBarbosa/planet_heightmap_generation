// Lab phase 7a — hotspots and Large Igneous Provinces. Plumes fixed in the mantle; each head floods the
// crust above it with basalt (and may split a big continent), each tail draws an age-progressive track
// on the plate sliding over it. Plumes favour the mantle a continent has insulated — not only there.

import { HOTSPOT_SCENES } from '../../tectonics/scenarios/hotspot-scenes.js';
import { simulate } from '../../tectonics/simulate.js';
import { updatePlateMotion } from '../../tectonics/step/torque-balance.js';
import { frameTallies } from '../../tectonics/measure.js';
import { colorByPlate, colorByCrustType, colorByCrustAge, colorByVolcanism, colorByMantleHeat, plateCss, css, trackColor, LIP_RGB, ISLAND_RGB } from '../../view/palettes.js';
import { volcanoTopKm, SEAMOUNT_KM } from '../../tectonics/measure.js';
import { describeCell, recordedFrameAt, boundaryLegend, eventRows, SNAPSHOT_MYR, latLonOf, speedSeries } from './phase-kit.js';
import { EventKind } from '../../tectonics/model/world.js';
import { VolcanicType } from '../../tectonics/model/crust.js';

const TUNABLES = [
    { id: 'plumeRatePerMyr', label: 'New plumes per Myr', min: 0, max: 0.2, step: 0.005 },
    { id: 'hotspotInitialCount', label: 'Plumes already rising at the start', min: 0, max: 20, step: 1 },
    { id: 'plumeOceanWeight', label: 'Chance of a plume under cool mantle (1 = no preference for insulated)', min: 0, max: 1, step: 0.05 },
    { id: 'mantleInsulateMyr', label: 'Mantle under a continent warms over', min: 20, max: 400, step: 10, unit: ' Myr' },
    { id: 'mantleCoolMyr', label: '…and cools again over', min: 20, max: 400, step: 10, unit: ' Myr' },
    { id: 'plumeRiftChance', label: 'Chance a plume head splits a big continent', min: 0, max: 1, step: 0.05 },
    { id: 'lipAreaMaxMkm2', label: 'Largest flood-basalt province', min: 0.5, max: 12, step: 0.25, unit: ' Mkm²' },
    { id: 'hotspotBuildKmPerMyr', label: 'Volcanic pile a burst builds per Myr', min: 1, max: 15, step: 0.5, unit: ' km' },
    { id: 'hotspotQuietMaxMyr', label: 'Longest quiet spell between bursts', min: 1.5, max: 12, step: 0.5, unit: ' Myr' },
    { id: 'lipLobes', label: 'How lobed a flood-basalt province is', min: 0, max: 1, step: 0.05 },
];
const CHECKLISTS = {
    hawaii: [
        'The plume (marker) stays put while Pacifica slides north over it; a chain trails away from it downstream (Volcanism layer), older the further it has travelled: white-hot over the plume, orange, then red and dark.',
        'The chain is not a line of land: the plume erupts in BURSTS, each building one volcano, and goes quiet while the plate carries it off — separate volcanoes (bold) on the faint swell the plume lifts. Only a fresh, tall one breaks the sea surface (pale island); older ones are worn down and sink with the ageing sea floor into seamounts.',
        'At 45 Myr the plate turns 60° to the west-north-west: from then on the chain comes off the plume in the new direction, and the old part keeps its old direction — a bend, like the Hawaiian–Emperor chain.',
        'The swell under the chain is continuous — the plume never skips a stretch of plate — while the volcanoes on it are spaced by the quiet spells between bursts.',
    ],
    deccan: [
        'At 12 Myr the plume reaches the surface under Indica’s southern half: its head floods a lobed, ragged patch of the continent with basalt at once (Volcanism layer: violet) — the traps (event log). Not a disc: flood basalts spread where the ground lets them.',
        'Indica drives on north; the plume’s tail keeps erupting. First it marks the continent behind the traps, then the new ocean floor Indica leaves in its wake: a chain of separate volcanoes from the traps to where the plume is now, youngest over the plume. That floor is young and shallow, so several of them stand as islands.',
        'Indica is too small to be split by the plume (no rift) — the traps are just a scar on it.',
    ],
    history: [
        'A few plumes are already rising when the history starts; more come up as it runs (event log, markers). Most of them rise over mantle a continent has insulated — the supercontinent’s old footprint (Mantle heat layer: warm colours) — but some come up under open ocean.',
        'Each new plume’s head floods the crust above with basalt: traps on land, a plateau at sea (Volcanism layer: violet). Under a continent big enough it may split it: the rift starts under the plume (event log: “rifts (the … plume)”).',
        'Each tail draws a track across whatever plate passes over it, young over the plume and older downstream; on a plate that subducts, the old end of its track goes down with it.',
        'The mantle remembers: long after the supercontinent has broken up, the ground it sat on stays warm (Mantle heat layer), and plumes keep rising there.',
    ],
};

export function createPhase(simMesh, seed, overrides = {}) {
    const scene = HOTSPOT_SCENES.find(s => s.id === overrides.scene) ?? HOTSPOT_SCENES[0];
    const world = scene.build(simMesh, seed);
    for (const t of TUNABLES) if (overrides[t.id] !== undefined) world.config[t.id] = overrides[t.id];
    const started = performance.now();
    const { frames, steps } = simulate(world, { untilMyr: scene.maxMyr, drive: w => scene.drive(w), snapshotEveryMyr: SNAPSHOT_MYR });
    const simMs = performance.now() - started;
    const last = frames.at(-1);
    const plumeName = new Map(world.hotspots.map(h => [h.id + 1, h.name]));      // every plume that ever rose, live or dead
    const series = speedSeries(frames);
    const centre = (frames[0].plates.find(p => !p.isBackground) ?? frames[0].plates[0]).centre;

    return {
        title: 'Phase 7a — Hotspots & LIPs',
        summary: 'Mantle plumes are fixed in the mantle, and the plates slide over them. A new plume’s HEAD floods the crust above it with basalt — a Large Igneous Province: traps on land, a plateau at sea — and under a continent big enough it may split it (the same plumes as 6a’s). ' +
            'Its TAIL then erupts for 100–200 Myr through whatever passes over it, leaving a chain of volcanoes that is youngest over the plume and older downstream, bending where the plate turned. ' +
            'Plumes rise preferentially where a continent has kept the mantle hot (the Mantle heat layer is that memory), but not only there. Records only: Phase 8 makes volcanoes and plateaus of them. ' + scene.about,
        checklist: [...CHECKLISTS[scene.id], 'No gaps; nothing here moves crust from plate to plate except a plume head’s rift.'],
        checkCommand: 'node v2/tools/check-phase7.mjs',
        maxTime: scene.maxMyr,
        timeStep: SNAPSHOT_MYR,
        initialView: scene.view ?? latLonOf(centre),
        params: [
            { id: 'scene', label: 'Scene', value: scene.id, options: HOTSPOT_SCENES.map(s => ({ value: s.id, label: s.label })) },
            ...TUNABLES.map(t => ({ ...t, value: world.config[t.id] })),
        ],
        layers: [
            { label: 'Volcanism', paint: colorByVolcanism },
            { label: 'Mantle heat', paint: colorByMantleHeat },
            { label: 'Plates', paint: colorByPlate },
            { label: 'Crust type', paint: colorByCrustType },
            { label: 'Crust age', paint: colorByCrustAge },
        ],
        hasBoundaries: true,
        series,
        legend: [
            { color: css(ISLAND_RGB), label: 'hotspot volcano whose summit breaks the sea surface: an island (Volcanism layer)' },
            { color: css(trackColor(0)), label: 'hotspot volcano, erupting now…' },
            { color: css(trackColor(30)), label: '…last erupted 30 Myr ago (a seamount, if it has sunk)' },
            { color: css(trackColor(120)), label: '…120 Myr ago' },
            { color: '#3a3f55', label: 'the swell the plume lifted between bursts (faint): no volcano' },
            { color: css(LIP_RGB), label: 'Large Igneous Province: a plume head’s flood basalt' },
            { color: '#ffb000', label: 'a live plume (marker), fixed in the mantle' },
            ...boundaryLegend({ collisionNote: '' }),
        ],

        frameAt(t) { return recordedFrameAt(frames, t); },

        stats(frame) {
            const tally = frameTallies(frame);
            let volcanoes = 0, islands = 0, lip = 0;
            for (let w = 0; w < frame.owner.length; w++) {
                if (frame.volcType[w] === VolcanicType.LIP) { lip++; continue; }
                const top = volcanoTopKm(frame, w);
                if (top === null) continue;
                volcanoes++;
                if (top > 0 && top !== Infinity) islands++;
            }
            const rows = frame.hotspots.map(h => {
                const w = simMesh.index.nearest(h.xyz[0], h.xyz[1], h.xyz[2]), on = frame.owner[w] >= 0 ? frame.plates[frame.owner[w]] : null;
                return { name: h.name, color: '#ffb000', cells: [`${(frame.time - h.bornAt).toFixed(0)} Myr`, h.strength.toFixed(2), on && !on.isBackground ? on.name : 'open ocean'] };
            });
            rows.push(...eventRows(frame.events, [EventKind.PLUME_RISE, EventKind.PLUME_DEATH, EventKind.LIP, EventKind.RIFT], 3));
            return {
                cards: [
                    { big: `${frame.hotspots.length}`, small: 'live plumes' },
                    { big: `${volcanoes}`, small: `hotspot volcano cells · ${islands} of them islands · ${lip} LIP cells · ${tally.gaps} gaps` },
                ],
                head: ['Plume / event', 'age', 'strength', 'erupting through'],
                rows,
                hint: `A plume’s track grows older downstream along the plate’s motion; a plate slower over the plume builds a bigger pile there. Simulated ${steps} steps in ${simMs.toFixed(0)} ms.`,
            };
        },

        markers(frame) { return frame.hotspots.map(h => ({ xyz: h.xyz, label: h.name, color: '#ffb000' })); },

        describeCell(frame, w) {
            let text = describeCell(frame, w);
            const vt = frame.volcType[w], source = plumeName.get(frame.volcSource[w]) ?? 'a plume';
            if (vt === VolcanicType.LIP) text += ` · flood basalt of the ${source} plume head, ${frame.volcKm[w].toFixed(1)} km thick`;
            else if (vt === VolcanicType.TRACK) {
                const since = (frame.time - frame.volcAt[w]).toFixed(0), top = volcanoTopKm(frame, w);
                if (frame.volcKm[w] < SEAMOUNT_KM) text += ` · the ${source} swell: the plume passed ${since} Myr ago, between eruptions`;
                else text += ` · a ${source} volcano, ${frame.volcKm[w].toFixed(1)} km tall, last erupted ${since} Myr ago — ${top === Infinity ? 'on land' : top > 0 ? `an island, summit ${top.toFixed(1)} km above the sea` : `a seamount, summit ${(-top).toFixed(1)} km down`}`;
            }
            text += ` · mantle heat ${(frame.mantleHeat[w] / 255).toFixed(2)}`;
            return text;
        },
    };
}
