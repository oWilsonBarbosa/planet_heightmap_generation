// Headless acceptance checks for Phase 5a (collision events: orogeny belts, shortening, suturing with redraw).
// Usage: node v2/tools/check-phase5.mjs

import { check, section, finish, labMesh, checkLabPhaseLoads, LAB_MESH_SEED, isLand, cellsWhere, nearestKm, kmBetween } from './lib/check-kit.mjs';
import { PLANET_RADIUS_KM } from '../js/core/sim-mesh.js';
import { floodFrom } from '../js/core/mesh-bfs.js';
import { FORCE_SCENES } from '../js/tectonics/scenarios/force-scenes.js';
import { simulate } from '../js/tectonics/simulate.js';
import { updatePlateMotion } from '../js/tectonics/step/torque-balance.js';
import { frameTallies } from '../js/tectonics/measure.js';
import { CrustType, CrustFlag, OrogenyType } from '../js/tectonics/model/crust.js';
import { NO_WINGS } from '../js/app/phases/phase5-collisions.js';
import { EventKind } from '../js/tectonics/model/world.js';

const SEED = 12345, SNAPSHOT_MYR = 2;
const mesh = labMesh(), { xyz, numCells } = mesh;

function run(id, untilMyr, overrides = {}, events = true) {
    const world = FORCE_SCENES.find(s => s.id === id).build(mesh, SEED);
    Object.assign(world.config, NO_WINGS, overrides);           // collisions alone: wings and arcs are Phase 5b
    const { frames, steps } = simulate(world, { untilMyr, drive: updatePlateMotion, snapshotEveryMyr: SNAPSHOT_MYR, events });
    const at = t => frames.find(f => Math.abs(f.time - t) < 1e-6);
    return { world, frames, steps, at, events: world.events, sutures: world.events.filter(e => e.kind === EventKind.SUTURE), collision: frames.map(f => frameTallies(f).collision) };
}

section('India meets Asia');
const india = run('india', 100), cfg = india.world.config;
india: {
    const contact = india.events.find(e => e.kind === EventKind.COLLISION), suture = india.sutures[0];
    check('collision and suture events are logged in order', contact && suture && suture.time > contact.time,
        india.events.map(e => `${e.time.toFixed(0)} Myr ${e.kind}: ${e.text}`).join(' | '));
    if (!suture) break india;                                   // (the check above has failed; the other sections still run)
    const last = india.frames.at(-1), before = india.frames.filter(f => f.time < suture.time).at(-1), after = india.frames.find(f => f.time >= suture.time);
    const alive = last.plates.filter(p => p.alive && !p.isBackground);
    check('after the suture there is one plate, and it stays one', alive.length === 1 && india.frames.filter(f => f.time >= suture.time).every(f => frameTallies(f).collision === 0),
        `${alive.map(p => p.name).join(', ')}; overlap cells from the suture on: max ${Math.max(...india.frames.filter(f => f.time >= suture.time).map(f => frameTallies(f).collision))}`);
    check('overlap stays a seam while the collision lasts, then closes', Math.max(...india.collision) < 120 && india.collision.at(-1) === 0, `overlap peaked at ${Math.max(...india.collision)} cells`);

    // the recorded shortening is what the two landmasses really did (their land centroids; plate centres include ocean being consumed)
    const rec = [...india.world.collisions.values()][0];
    const landCentroid = (f, id) => {
        let x = 0, y = 0, z = 0;
        for (let w = 0; w < numCells; w++) if ((f.owner[w] === id && f.type[w] !== CrustType.OCEAN) || (f.overlap[w] === 2 && f.collider[w] === id)) { x += xyz[3 * w]; y += xyz[3 * w + 1]; z += xyz[3 * w + 2]; }
        const l = Math.hypot(x, y, z) || 1;
        return [x / l, y / l, z / l];
    };
    const landGap = f => { const a = landCentroid(f, rec.upper), b = landCentroid(f, rec.lower); return Math.acos(Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])) * PLANET_RADIUS_KM; };
    const atContact = india.at(Math.ceil(contact.time / SNAPSHOT_MYR) * SNAPSHOT_MYR), approached = landGap(atContact) - landGap(before);
    check('the recorded shortening matches how far the two landmasses really closed', Math.abs(approached - rec.shorteningKm) < 0.3 * rec.shorteningKm + mesh.edgeKm,
        `land centroids closed ${approached.toFixed(0)} km between ${atContact.time} and ${before.time} Myr; recorded shortening ${rec.shorteningKm.toFixed(0)} km (threshold ${cfg.sutureShorteningKm})`);

    // the redraw. Land as seen on the map (the overlap counted once) barely changes: the overlap is absorbed and crust
    // squeezed sideways bulges the coast. What the event reports is the two plates' land summed, minus the merged land.
    const landBefore = cellsWhere(numCells, w => isLand(before, w)).length, landAfter = cellsWhere(numCells, w => isLand(after, w)).length;
    const overlapAtSuture = frameTallies(before).collision, reported = suture.data.landLostCells;
    // (the push ahead of the indenter compresses crust beyond the overlap too — that area goes into thickness)
    check('the redraw absorbs the overlap, plus some crust squeezed into thickness', Math.abs(landAfter - landBefore) < 0.04 * landBefore && reported >= overlapAtSuture - 12 && reported <= 2 * overlapAtSuture + 12,
        `map land ${landBefore} → ${landAfter} cells; event reports ${reported} cells absorbed, the overlap was ${overlapAtSuture}`);
    const cratonCells = f => cellsWhere(numCells, w => f.owner[w] >= 0 && f.type[w] === CrustType.CRATON).length;
    // (compared with the moment of contact: while the plates overlap, craton cells under the other plate are hidden from the map)
    check('cratons survive the redraw as rigid blocks', Math.abs(cratonCells(after) - cratonCells(atContact)) <= 0.05 * cratonCells(atContact),      // (the world view samples a rotated raster: counts wobble ±2 % frame to frame)
        `${cratonCells(atContact)} craton cells at contact, ${cratonCells(after)} after the suture`);
    const lowerId = rec.lower, indent = suture.data.maxIndentKm;
    check('the upper plate is indented by the lower one', Number(indent) > 300 && Number(indent) < 1500, `indented up to ${indent} km; front ${rec.frontKm.toFixed(0)} km`);
    // the merged land is one body with no holes that are not sea — on the merged plate's own raster, the crust itself (the
    // world view samples a moving plate's raster, and where it skips the cell that joins a narrow neck of coast to the
    // rest, the neck's tip shows as a one-cell island that comes and goes: Phase 11, at 56, 60, 68 and 100 Myr)
    const merged = india.world.plates.find(p => p.alive && !p.isBackground), K = merged.crust;
    const landMask = Uint8Array.from({ length: numCells }, (_, c) => (K.mask[c] && K.type[c] !== CrustType.OCEAN && K.type[c] !== CrustType.ARC ? 1 : 0));
    const seedCell = landMask.findIndex(v => v), body = floodFrom(mesh, seedCell, c => landMask[c] === 1);
    let stray = 0;
    for (let c = 0; c < numCells; c++) if (landMask[c] && !body[c]) stray++;
    check('the merged continent is one connected body (island arcs excepted)', stray === 0, `${stray} non-arc land cells of ${merged.name}'s crust not connected to the main body`);

    // belts
    const seam = cellsWhere(numCells, w => isLand(last, w) && (last.flags[w] & CrustFlag.SUTURE));
    check('a suture belt runs along the closed seam', seam.length > 30, `${seam.length} suture cells`);
    const upperTerranes = new Set(cellsWhere(numCells, w => before.owner[w] === rec.upper && isLand(before, w)).map(w => before.terrane[w]));
    const himalayan = cellsWhere(numCells, w => isLand(last, w) && last.oroType[w] === OrogenyType.HIMALAYAN);
    const upperSide = himalayan.filter(w => upperTerranes.has(last.terrane[w])), lowerSide = himalayan.filter(w => !upperTerranes.has(last.terrane[w]));
    const reachUpper = Math.max(...upperSide.map(w => nearestKm(mesh, w, seam))), reachLower = Math.max(...lowerSide.map(w => nearestKm(mesh, w, seam)));
    const median = xs => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[s.length >> 1] : 0; };
    const midUpper = median(upperSide.map(w => nearestKm(mesh, w, seam))), midLower = median(lowerSide.map(w => nearestKm(mesh, w, seam)));
    const widest = kind => cfg.belts[kind].maxKm * cfg.beltSpeedFactorMax;
    check('the plateau belt is wide on the upper plate, the foreland belt narrow on the lower', reachUpper > 500 && reachUpper <= widest('himalayan') + 2 * mesh.edgeKm && reachLower <= widest('foreland') + 3 * mesh.edgeKm && reachLower > 100 && midLower < 0.75 * midUpper,   // the belts’ caps differ 1300 vs 350 km, but how far each actually reaches also depends on how much land is there to spread over
        `collision belt reaches ${reachUpper.toFixed(0)} km from the seam on the upper side (${upperSide.length} cells, median ${midUpper.toFixed(0)} km), ${reachLower.toFixed(0)} km on the lower (${lowerSide.length} cells, median ${midLower.toFixed(0)} km)`);
    // (Phase 10, re-baselined: a belt reaches onto a craton's rim — a thin-skinned fold-thrust belt over the shield's edge,
    // as the sub-Andean zone — but never into its core, and the shield itself never thickens)
    const notCraton = cellsWhere(numCells, w => last.owner[w] >= 0 && last.type[w] !== CrustType.CRATON);
    const rimCells = cellsWhere(numCells, w => last.owner[w] >= 0 && last.type[w] === CrustType.CRATON && last.oroType[w] !== 0);
    const deepest = rimCells.length ? Math.max(...rimCells.map(w => nearestKm(mesh, w, notCraton))) : 0, thickRim = rimCells.filter(w => last.thickKm[w] > 0).length;
    check('belts reach only a craton\'s rim, never its core, and the shield does not thicken', deepest <= cfg.cratonRimKm + mesh.edgeKm && thickRim === 0,
        `${rimCells.length} craton cells with a record, the deepest ${deepest.toFixed(0)} km in (the rim is ${cfg.cratonRimKm} km); ${thickRim} of them thickened`);
    let maxThick = 0, thickCells = 0;
    for (let w = 0; w < numCells; w++) if (isLand(last, w) && last.thickKm[w] > 0) { thickCells++; maxThick = Math.max(maxThick, last.thickKm[w]); }
    check('crust is thickened in the belts, within reason', maxThick > 5 && maxThick < 45, `${thickCells} thickened cells, up to ${maxThick.toFixed(1)} km`);
    let plateau = 0, inBelt = 0;
    for (let w = 0; w < numCells; w++) if (isLand(last, w) && last.oroType[w] === OrogenyType.HIMALAYAN) { inBelt++; if (last.thickKm[w] >= 0.4 * maxThick) plateau++; }
    check('thickening spreads across the belt as a plateau, not a spike at the front', plateau / inBelt > 0.3, `${(100 * plateau / inBelt).toFixed(0)} % of collision-belt cells are at least 40 % as thick as the thickest`);
    check('no gaps in any frame', india.frames.every(f => frameTallies(f).gaps === 0), 'checked every frame');

    const off = run('india', 100, {}, false);
    check('with the event rules off, the Phase 4 behaviour is unchanged (overlap persists, no suture)', off.sutures.length === 0 && off.collision.at(-1) > 0, `overlap at 100 Myr: ${off.collision.at(-1)} cells, ${off.events.length} events`);
}

section('self-driven Wilson cycle');
{
    const r = run('wilson', 160), suture = r.sutures[0];
    check('a stalled seam welds', suture?.data.why === 'stalled', suture ? suture.text : 'no suture');
    if (suture) {
        const last = r.frames.at(-1), alive = last.plates.filter(p => p.alive && !p.isBackground);
        check('East and Far become one plate; West stays separate', alive.length === 2 && alive.some(p => p.name.includes('East') && p.name.includes('Far')), alive.map(p => p.name).join(', '));
        const west = last.plates.find(p => p.name === 'West');
        const westBelt = cellsWhere(numCells, w => last.owner[w] === west.id && isLand(last, w) && last.oroType[w] && last.oroType[w] !== OrogenyType.ANDEAN && last.oroType[w] !== OrogenyType.TRANSPRESSION).length;   // (a transpression ridge where its trench turns oblique is no collision)
        check('West carries only its Andean belt', westBelt === 0, `${westBelt} West cells with a collision record`);
        check('no gaps, overlap closed', r.frames.every(f => frameTallies(f).gaps === 0) && r.collision.at(-1) === 0, `overlap at the end: ${r.collision.at(-1)}`);
    }
}

section('Andean margin');
{
    const widestAndean = cfg.belts.andean.maxKm * cfg.beltSpeedFactorMax;
    const r = run('one-sided', 80), last = r.frames.at(-1), solo = last.plates.find(p => p.name === 'Solo');
    const coast = cellsWhere(numCells, w => last.owner[w] === solo.id && last.type[w] === CrustType.OCEAN && mesh.adjList.subarray(mesh.adjOffset[w], mesh.adjOffset[w + 1]).some(nb => isLand(last, nb)));
    const belt = cellsWhere(numCells, w => isLand(last, w) && last.oroType[w] === OrogenyType.ANDEAN);
    const reach = Math.max(...belt.map(w => nearestKm(mesh, w, coast)));
    const reachAt = (frame, cells) => Math.max(...cells.map(w => nearestKm(mesh, w, cellsWhere(numCells, v => frame.owner[v] === solo.id && frame.type[v] === CrustType.OCEAN && mesh.adjList.subarray(mesh.adjOffset[v], mesh.adjOffset[v + 1]).some(nb => isLand(frame, nb))))));
    const at40 = r.at(40), belt40 = cellsWhere(numCells, w => isLand(at40, w) && at40.oroType[w] === OrogenyType.ANDEAN), reach40 = reachAt(at40, belt40);
    check('the belt widens the longer subduction goes on', belt.length > 1.12 * belt40.length && reach > reach40, `${belt40.length} cells reaching ${reach40.toFixed(0)} km at 40 Myr → ${belt.length} cells reaching ${reach.toFixed(0)} km at 80 Myr`);
    const fast = run('one-sided', 80, { dragContinent: cfg.dragContinent / 2, dragCraton: cfg.dragCraton / 2 }), fastLast = fast.frames.at(-1), fastSolo = fastLast.plates.find(p => p.name === 'Solo');
    const fastBelt = cellsWhere(numCells, w => isLand(fastLast, w) && fastLast.oroType[w] === OrogenyType.ANDEAN), fastReach = reachAt(fastLast, fastBelt);
    check('…and further with faster convergence', fastBelt.length > 1.2 * belt.length, `at ${fastSolo.speedCmYr.toFixed(1)} instead of ${solo.speedCmYr.toFixed(1)} cm/yr: ${fastBelt.length} cells reaching ${fastReach.toFixed(0)} km`);
    // the trailing coast (within ±40° of due east of the centre) must carry nothing; a slight rotation may let the rim
    // override old ocean near the tips of the trench, which is a real (small) trench and is allowed
    const centre = solo.centre, east = [-centre[1], centre[0], 0], north = [-centre[2] * centre[0], -centre[2] * centre[1], centre[0] ** 2 + centre[1] ** 2];
    const azimuth = w => Math.atan2(xyz[3 * w] * north[0] + xyz[3 * w + 1] * north[1] + xyz[3 * w + 2] * north[2], xyz[3 * w] * east[0] + xyz[3 * w + 1] * east[1]) * 180 / Math.PI;
    const eastOfCentre = belt.filter(w => Math.abs(azimuth(w)) < 40).length;
    check('the Andean belt is a coastal band within the configured reach', belt.length > 50 && reach <= widestAndean + 2 * mesh.edgeKm,
        `${belt.length} cells, reaching ${reach.toFixed(0)} km inland (cap ${widestAndean.toFixed(0)} km at the fastest convergence)`);
    check('…and none on the trailing (passive) coast', eastOfCentre === 0, `${eastOfCentre} belt cells within ±40° of due east of the centre`);
    check('no collision records, no suture, no gaps', r.sutures.length === 0 && r.frames.every(f => frameTallies(f).gaps === 0) && cellsWhere(numCells, w => last.oroType[w] === OrogenyType.HIMALAYAN).length === 0, `${r.events.length} events`);
}

section('lab');
await checkLabPhaseLoads('../../js/app/phases/phase5-collisions.js', mesh, LAB_MESH_SEED, [{ scene: 'india' }, { scene: 'wilson' }, { scene: 'one-sided' }]);

finish('Phase 5a');
