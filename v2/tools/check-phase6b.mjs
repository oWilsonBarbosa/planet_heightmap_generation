// Headless acceptance checks for Phase 6b (subduction initiation at old passive margins).
// Usage: node v2/tools/check-phase6b.mjs

import { check, section, finish, labMesh, checkLabPhaseLoads, LAB_MESH_SEED, isLand, landCount } from './lib/check-kit.mjs';
import { RIFT_SCENES } from '../js/tectonics/scenarios/rift-scenes.js';
import { simulate } from '../js/tectonics/simulate.js';
import { updatePlateMotion } from '../js/tectonics/step/torque-balance.js';
import { frameTallies } from '../js/tectonics/measure.js';
import { CrustType } from '../js/tectonics/model/crust.js';
import { PLANET_RADIUS_KM } from '../js/core/sim-mesh.js';
import { BoundaryKind, EventKind } from '../js/tectonics/model/world.js';

const SEED = 12345, SNAPSHOT_MYR = 4;
const mesh = labMesh(), { numCells, xyz } = mesh;
// continental crust only: island arcs legitimately ADD land as they grow and accrete, so they are counted apart
const coreCount = f => { let n = 0; for (let w = 0; w < numCells; w++) if (f.owner[w] >= 0 && (f.type[w] === CrustType.CONTINENT || f.type[w] === CrustType.CRATON)) n++; return n; };
const trenchCells = f => { let n = 0; for (let w = 0; w < numCells; w++) if (f.boundary[w] === BoundaryKind.OVERRIDING) n++; return n; };
const movers = f => f.plates.filter(p => p.alive && !p.isBackground);

function run(id, overrides = {}, untilMyr = null) {
    const scene = RIFT_SCENES.find(s => s.id === id), world = scene.build(mesh, SEED);
    Object.assign(world.config, overrides);
    const { frames, steps } = simulate(world, { untilMyr: untilMyr ?? scene.maxMyr, drive: updatePlateMotion, snapshotEveryMyr: SNAPSHOT_MYR });
    return { scene, world, frames, steps, events: world.events, at: t => frames.find(f => Math.abs(f.time - t) < 1e-6) };
}

// How far apart the two continents' land is, and how big each plate is: a margin that founders must make
// the basin between them CLOSE, and the plates must not balloon (they tile the planet, so their cell
// counts stay put — a plate that grows in every direction is the sign of a scene with no real neighbour).
const landCentroid = (f, id) => {
    let x = 0, y = 0, z = 0, n = 0;
    for (let w = 0; w < numCells; w++) if (f.owner[w] === id && f.type[w] !== CrustType.OCEAN) { x += xyz[3 * w]; y += xyz[3 * w + 1]; z += xyz[3 * w + 2]; n++; }
    return n ? [x / n, y / n, z / n] : null;
};
const separationKm = (f, ids) => {
    const a = landCentroid(f, ids[0]), b = landCentroid(f, ids[1]);
    if (!a || !b) return null;                                   // they have welded into one plate
    const la = Math.hypot(...a), lb = Math.hypot(...b);
    return Math.acos(Math.max(-1, Math.min(1, (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (la * lb)))) * PLANET_RADIUS_KM;
};
const plateCells = (f, id) => { let n = 0; for (let w = 0; w < numCells; w++) if (f.owner[w] === id) n++; return n; };

section('an old passive margin founders');
{
    const r = run('founder'), started = r.events.filter(e => e.kind === EventKind.SUBDUCTION_INIT);
    const cfg = r.world.config, first = started[0];
    const ids = ['Westland', 'Eastland'].map(name => r.frames[0].plates.find(p => p.name === name).id);
    check('the scene begins wholly passive: no trench anywhere', trenchCells(r.frames[0]) === 0 && movers(r.frames[0]).every(p => p.speedCmYr < 0.05),
        `${trenchCells(r.frames[0])} trench cells and ${movers(r.frames[0]).map(p => p.speedCmYr.toFixed(2)).join('/')} cm/yr at the start`);
    check('a trench founders along an old margin', started.length >= 1,
        first ? `${started.length} margin(s) founder; first at ${first.time.toFixed(0)} Myr — ${first.text}` : `none founders in ${r.frames.at(-1).time} Myr`);
    if (first) {
        const { lengthKm, ageMyr } = first.data;
        check('…long enough, and old enough, to be worth calling a margin', lengthKm >= cfg.subductionInitMinLengthKm && ageMyr >= cfg.subductionInitAgeMyr,
            `${lengthKm.toFixed(0)} km of ${ageMyr.toFixed(0)} Myr ocean (thresholds ${cfg.subductionInitMinLengthKm} km, ${cfg.subductionInitAgeMyr} Myr)`);
        // the passive ocean never becomes the overriding side of a trench: in no frame does it hold trench crust
        const bgId = r.frames[0].plates.find(p => p.isBackground).id;
        const bgTrench = Math.max(...r.frames.map(f => { let n = 0; for (let w = 0; w < numCells; w++) if (f.owner[w] === bgId && f.trench[w]) n++; return n; }));
        check('the passive pre-history ocean goes DOWN — it never overrides', bgTrench === 0,
            `at most ${bgTrench} trench cells on the passive ocean in any frame; founding trenches: ${started.map(e => `${r.frames.at(-1).plates[e.data.lower].name} beneath ${r.frames.at(-1).plates[e.data.upper].name}`).join(' | ')}`);
    }
    // the point of the whole phase: the basin that was open begins to CLOSE, and the continents meet
    const startSep = separationKm(r.frames[0], ids), closest = Math.min(...r.frames.map(f => separationKm(f, ids)).filter(v => v !== null));
    check('the basin between the continents closes', closest < startSep - 800, `land-to-land ${startSep.toFixed(0)} km at the start → ${closest.toFixed(0)} km at its narrowest`);
    const suture = r.events.find(e => e.kind === EventKind.SUTURE);
    check('and the two continents finally collide', !!suture, suture ? suture.text.slice(0, 110) : 'no suture within the run');
    // the plates tile the planet: neither may balloon (the symptom of a plate with no real neighbour)
    const apart = r.frames.filter(f => separationKm(f, ids) !== null);        // only while they are still two plates (the survivor of a suture holds everything)
    const grew = ids.map(id => Math.max(...apart.map(f => plateCells(f, id))) / plateCells(r.frames[0], id));
    check('neither plate balloons: they only trade crust across their shared margin', grew.every(g => g < 1.3),
        `largest plate-area growth: ${grew.map(g => (100 * (g - 1)).toFixed(0) + ' %').join(' / ')}`);
    check('no gaps; continental crust is neither created nor destroyed', r.frames.every(f => frameTallies(f).gaps === 0) && Math.abs(coreCount(r.frames.at(-1)) - coreCount(r.frames[0])) < 0.1 * coreCount(r.frames[0]),
        `continent+craton ${coreCount(r.frames[0])} \u2192 ${coreCount(r.frames.at(-1))} cells (with island arcs: ${landCount(r.frames[0])} \u2192 ${landCount(r.frames.at(-1))}); no gaps in any frame`);
}

section('it is a rule, not an accident');
{
    const off = run('founder', { subductionInitRatePerMyr: 0 });
    check('with the rule off, nothing founders and the basin stays open', off.events.filter(e => e.kind === EventKind.SUBDUCTION_INIT).length === 0 && off.events.every(e => e.kind !== EventKind.SUTURE) && movers(off.frames.at(-1)).every(p => p.speedCmYr < 0.5),
        `0 margins founder, no collision; ${movers(off.frames.at(-1)).map(p => p.speedCmYr.toFixed(2)).join('/')} cm/yr after ${off.frames.at(-1).time} Myr`);
    const young = run('founder', { subductionInitAgeMyr: 10000 });
    check('crust too young to founder never does', young.events.filter(e => e.kind === EventKind.SUBDUCTION_INIT).length === 0,
        `age threshold 10000 Myr: ${young.events.filter(e => e.kind === EventKind.SUBDUCTION_INIT).length} margins founder`);
    const a = run('founder'), b = run('founder');
    check('the same seed replays the same history', a.events.length === b.events.length && a.events.every((e, i) => e.text === b.events[i].text) && a.frames.at(-1).owner.every((o, w) => o === b.frames.at(-1).owner[w]), `${a.events.length} events and the final world, identical`);
}

section('in a whole history');
{
    const r = run('breakup');
    const started = r.events.filter(e => e.kind === EventKind.SUBDUCTION_INIT);
    check('old margins founder during the start world’s 300 Myr', started.length >= 1,
        started.length ? started.map(e => `${e.time.toFixed(0)} Myr`).join(', ') : 'none');
    // WBP: the sea floor is young — it is recycled. Without subduction initiation the oldest ocean just sits there.
    const last = r.frames.at(-1);
    let ocean = 0, old = 0;
    for (let w = 0; w < numCells; w++) if (last.owner[w] >= 0 && last.type[w] === CrustType.OCEAN) { ocean++; if (last.time - last.formedAt[w] > 250) old++; }
    check('most of the sea floor is younger than 250 Myr', old < 0.35 * ocean, `${(100 * old / ocean).toFixed(0)} % of ${ocean} ocean cells are older than 250 Myr at ${last.time} Myr`);
    check('the plate count stays sane and there are no gaps', Math.max(...r.frames.map(f => movers(f).length)) <= r.world.config.reserved.maxPlates && r.frames.every(f => frameTallies(f).gaps === 0),
        `at most ${Math.max(...r.frames.map(f => movers(f).length))} plates at once`);
}

section('a plate is carved out of the passive ocean');
{
    // the founder scene with birth switched back ON: its continents face the passive ocean all round, so a
    // margin there must carve a plate out of it before any trench can found
    const r = run('founder', { oceanPlateMinAreaKm2: 8e6 }), born = r.events.filter(e => e.kind === EventKind.PLATE_BORN);
    check('a trench against the passive ocean first makes a plate of it', born.length >= 1 && r.events.some(e => e.kind === EventKind.SUBDUCTION_INIT && born.some(b => b.data.plate === e.data.upper || b.data.plate === e.data.lower)),
        born.length ? born.map(e => `${e.time.toFixed(0)} Myr: ${e.text}`).join(' | ').slice(0, 190) : 'no plate born in 300 Myr');
    if (born.length) {
        const last = r.frames.at(-1), ids = born.map(e => e.data.plate);
        const alive = ids.map(id => last.plates[id]).filter(p => p?.alive);
        check('the newborn plates are real: they move under their own slabs', alive.length >= 1 && alive.every(p => p.speedCmYr > 0.2),
            alive.length ? alive.map(p => `${p.name} ${p.speedCmYr.toFixed(2)} cm/yr`).join(', ') : 'none of them survive to the end');
        // the point of birth: a plate facing the passive ocean balloons, one facing a real plate does not
        const oceanCells = (fr, id) => { let n = 0; for (let w = 0; w < numCells; w++) if (fr.owner[w] === id) n++; return n; };
        const first = ids[0], atBirth = r.frames.find(fr => fr.time >= born[0].time);
        const biggest = Math.max(...r.frames.filter(fr => fr.time >= born[0].time).map(fr => oceanCells(fr, first)));      // (over its whole life: it may be swallowed later)
        check('a newborn plate is a normal plate, not a runaway', oceanCells(atBirth, first) > 0 && biggest < 2.5 * oceanCells(atBirth, first),
            `${last.plates[first].name}: ${oceanCells(atBirth, first)} cells at birth, at most ${biggest} later (${oceanCells(last, first)} at ${last.time} Myr)`);
    }
}

section('one polarity per stretch of boundary');
{
    // Ocean against ocean the polarity used to be settled cell by cell, so where trench flags were patchy
    // the "older sinks" rule and the trench rule interleaved and the front came out ragged (the Phase 5b
    // limitation). The vote in step/boundaries.js settles a whole segment at once. Measured as the share of
    // neighbouring ocean boundary cells of ONE plate that are playing opposite roles — run with the vote
    // on and off, so the check tests the mechanism rather than a number that drifts with the history.
    // averaged over the closing frames, not read off one: a single frame's share swings with whatever the
    // plates happen to be doing at that instant
    const ragged = r => {
        const { adjOffset, adjList } = mesh;
        let flips = 0, pairs = 0;
        for (const fr of r.frames.slice(-8)) {
            for (let w = 0; w < numCells; w++) {
                if (fr.owner[w] < 0 || fr.type[w] !== CrustType.OCEAN) continue;
                const mine = fr.boundary[w];
                if (mine !== BoundaryKind.OVERRIDING && mine !== BoundaryKind.SUBDUCTING) continue;
                for (let k = adjOffset[w]; k < adjOffset[w + 1]; k++) {
                    const nb = adjList[k];
                    if (fr.owner[nb] !== fr.owner[w] || fr.type[nb] !== CrustType.OCEAN) continue;
                    const theirs = fr.boundary[nb];
                    if (theirs !== BoundaryKind.OVERRIDING && theirs !== BoundaryKind.SUBDUCTING) continue;
                    pairs++; if (theirs !== mine) flips++;
                }
            }
        }
        return { flips, pairs, share: pairs ? flips / pairs : 0 };
    };
    const on = ragged(run('breakup')), off = ragged(run('breakup', { segmentPolarity: false }));
    check('the segment vote makes ocean-on-ocean fronts less ragged', on.pairs > 1000 && off.pairs > 1000 && on.share < 0.8 * off.share && on.share < 0.06,
        `role flips between neighbouring ocean boundary cells of one plate: ${(100 * on.share).toFixed(1)} % with the vote (${on.flips}/${on.pairs}), ${(100 * off.share).toFixed(1)} % without (${off.flips}/${off.pairs})`);
}

section('lab');
await checkLabPhaseLoads('../../js/app/phases/phase6-rifting.js', mesh, LAB_MESH_SEED, RIFT_SCENES.map(s => ({ scene: s.id })));

finish('Phase 6b');
