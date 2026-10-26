// Scale invariance: the same scenes on two sim meshes (40K and 80K cells) must give the same world in physical
// units — km, km², Myr — and a history must not depend on how often it is recorded. The sim mesh is fixed in the
// app (the Detail slider never changes it), but a rule written in cells instead of km shows up here at once.
// Forces converge more slowly (finer outlines, ~5–10 %), so the checks prescribe the motion wherever the force
// balance is not the point. Usage: node v2/tools/check-scale.mjs

import { check, section, finish, labMesh, nearestFrame, isLand } from './lib/check-kit.mjs';
import { simulate } from '../js/tectonics/simulate.js';
import { CrustType, CrustFlag, OrogenyType, VolcanicType } from '../js/tectonics/model/crust.js';
import { EventKind } from '../js/tectonics/model/world.js';
import { MARGIN_SCENES } from '../js/tectonics/scenarios/margin-scenes.js';
import { HOTSPOT_SCENES, omegaFor, heading } from '../js/tectonics/scenarios/hotspot-scenes.js';
import { EVENT_SCENES } from '../js/tectonics/scenarios/event-scenes.js';
import { NO_RIFTS } from '../js/app/phases/phase5b-arcs.js';

const COARSE = 40000, FINE = 80000, SEED = 12345;
const meshes = { [COARSE]: labMesh(COARSE), [FINE]: labMesh(FINE) };
const areaMkm2 = (mesh, f, test) => { let n = 0; for (let w = 0; w < mesh.numCells; w++) if (test(w)) n++; return n * mesh.cellAreaKm2 / 1e6; };

/** Run `measure(mesh)` on both meshes and check the two agree within `tolerance` (a share of the larger). */
function agrees(name, measure, tolerance, unit = '') {
    const a = measure(meshes[COARSE]), b = measure(meshes[FINE]);
    const ok = Number.isFinite(a) && Number.isFinite(b) && Math.max(a, b) > 0 && Math.abs(a - b) <= tolerance * Math.max(Math.abs(a), Math.abs(b));
    check(name, ok, `${a.toFixed(2)}${unit} at ${COARSE / 1000}K cells, ${b.toFixed(2)}${unit} at ${FINE / 1000}K (tolerance ${(100 * tolerance).toFixed(0)} %)`);
}
const runScene = (list, id, mesh, { until, overrides = {}, drive } = {}) => {
    const scene = list.find(s => s.id === id), world = scene.build(mesh, SEED);
    Object.assign(world.config, overrides);
    const { frames } = simulate(world, { untilMyr: until ?? scene.maxMyr, drive: drive ? drive(world) : w => scene.drive(w), snapshotEveryMyr: 2 });
    return { world, frames };
};

section('a history does not depend on how often it is recorded');
{
    const run = every => { const scene = MARGIN_SCENES.find(s => s.id === 'mariana'), world = scene.build(meshes[COARSE], SEED); const { frames } = simulate(world, { untilMyr: 40, drive: w => scene.drive(w), snapshotEveryMyr: every }); return { events: world.events, last: frames.at(-1) }; };
    const a = run(2), b = run(10);
    const same = a.events.length === b.events.length && a.events.every((e, i) => e.text === b.events[i].text) && a.last.owner.every((o, w) => o === b.last.owner[w]);
    check('the same world whether recorded every 2 or every 10 Myr', same, `${a.events.length} vs ${b.events.length} events; final ownership ${a.last.owner.every((o, w) => o === b.last.owner[w]) ? 'identical' : 'differs'}`);
}

section('hotspots');
agrees('a plume head floods the same area with basalt (Deccan)', mesh => runScene(HOTSPOT_SCENES, 'deccan', mesh).world.events.find(e => e.kind === EventKind.LIP)?.data.areaMkm2 ?? NaN, 0.1, ' Mkm²');
agrees('a hotspot track covers the same area (Hawaii)', mesh => { const { frames } = runScene(HOTSPOT_SCENES, 'hawaii', mesh); const f = frames.at(-1); return areaMkm2(mesh, f, w => f.volcType[w] === VolcanicType.TRACK); }, 0.15, ' Mkm²');

section('margins');
{
    const laramide = {};
    for (const n of [COARSE, FINE]) laramide[n] = runScene(MARGIN_SCENES, 'laramide', meshes[n]);
    const area = n => { const f = laramide[n].frames.at(-1); return areaMkm2(meshes[n], f, w => f.oroType[w] === OrogenyType.LARAMIDE); };
    check('a flat slab builds a Laramide belt of the same size', Math.abs(area(COARSE) - area(FINE)) <= 0.1 * Math.max(area(COARSE), area(FINE)), `${area(COARSE).toFixed(2)} Mkm² at ${COARSE / 1000}K, ${area(FINE).toFixed(2)} at ${FINE / 1000}K (tolerance 10 %)`);
    const steep = n => laramide[n].world.events.find(e => e.kind === EventKind.SLAB_STEEP)?.time ?? NaN;
    check('…and the slab steepens again at the same time', Math.abs(steep(COARSE) - steep(FINE)) <= 3, `${steep(COARSE).toFixed(1)} Myr at ${COARSE / 1000}K, ${steep(FINE).toFixed(1)} at ${FINE / 1000}K`);
}
agrees('a back-arc sea opens to the same size (Mariana, 25 Myr)', mesh => {
    const { world, frames } = runScene(MARGIN_SCENES, 'mariana', mesh), open = world.events.find(e => e.kind === EventKind.BACKARC_OPEN), f = nearestFrame(frames, 25);
    return open ? areaMkm2(mesh, f, w => f.owner[w] >= 0 && f.type[w] === CrustType.OCEAN && f.formedAt[w] > open.time) : NaN;
}, 0.1, ' Mkm²');

section('island arcs (motion prescribed)');
agrees('behind the same trench, the same area of arc grows', mesh => {
    const { frames } = runScene(EVENT_SCENES, 'wings', mesh, {
        until: 110, overrides: NO_RIFTS,
        drive: world => { const solo = world.plates.find(p => p.name === 'Solo'); solo.refreshExtent(mesh.xyz); const P = solo.toWorld(solo.capCenter[0], solo.capCenter[1], solo.capCenter[2], [0, 0, 0]), omega = omegaFor(P, heading(P, -90), 3.4); return () => { solo.omega = omega.slice(); }; },
    });
    const f = frames.at(-1);
    return areaMkm2(mesh, f, w => f.owner[w] >= 0 && f.type[w] === CrustType.ARC);
}, 0.2, ' Mkm²');

finish('Scale');
