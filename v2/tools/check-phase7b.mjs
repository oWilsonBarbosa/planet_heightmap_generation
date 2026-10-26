// Headless acceptance checks for Phase 7b (margins, flat slabs, slab rollback and back-arc basins).
// Usage: node v2/tools/check-phase7b.mjs

import { check, section, finish, labMesh, checkLabPhaseLoads, LAB_MESH_SEED, isLand, cellsWhere, plateNamed, plateById, nearestFrame, largestPiece, relativeCmYr } from './lib/check-kit.mjs';
import { PLANET_RADIUS_KM } from '../js/core/sim-mesh.js';
import { MARGIN_SCENES } from '../js/tectonics/scenarios/margin-scenes.js';
import { heading, omegaFor } from '../js/tectonics/scenarios/hotspot-scenes.js';
import { latLonToXyz } from '../js/tectonics/step/kinematics.js';
import { beltShape } from '../js/tectonics/step/orogeny.js';
import { simulate } from '../js/tectonics/simulate.js';
import { frameTallies, Margin } from '../js/tectonics/measure.js';
import { rollbackCmYr } from '../js/tectonics/step/backarc.js';
import { CrustType, OrogenyType } from '../js/tectonics/model/crust.js';
import { BoundaryKind, EventKind } from '../js/tectonics/model/world.js';
import { CM_PER_YR_TO_RAD_PER_MYR, TECTONICS } from '../js/tectonics/config.js';
import { mechanismsOff } from '../js/tectonics/config.js';

const SEED = 12345, SNAPSHOT_MYR = 2;
const r0cfg = () => TECTONICS;
const mesh = labMesh(), { numCells, xyz, adjOffset, adjList, edgeKm, cellAreaKm2 } = mesh;
const pos = w => [xyz[3 * w], xyz[3 * w + 1], xyz[3 * w + 2]];

function run(id, overrides = {}, drive = null) {
    const scene = MARGIN_SCENES.find(s => s.id === id), world = scene.build(mesh, SEED);
    Object.assign(world.config, overrides);
    const { frames, steps } = simulate(world, { untilMyr: scene.maxMyr, drive: drive ?? (w => scene.drive(w)), snapshotEveryMyr: SNAPSHOT_MYR });
    return { scene, world, frames, steps, events: world.events, last: frames.at(-1), cfg: world.config };
}

/** Hops over land from the active coast, as km, for every land cell of a plate. */
function inlandKm(f, plateId) {
    const dist = new Int32Array(numCells).fill(-1);
    let ring = cellsWhere(numCells, w => f.owner[w] === plateId && (f.margin[w] & Margin.TYPE) === Margin.ACTIVE);
    for (const w of ring) dist[w] = 0;
    for (let d = 1; ring.length; d++) {
        const next = [];
        for (const c of ring) for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) { const nb = adjList[k]; if (dist[nb] < 0 && f.owner[nb] === plateId && isLand(f, nb)) { dist[nb] = d; next.push(nb); } }
        ring = next;
    }
    return w => (dist[w] < 0 ? -1 : dist[w] * edgeKm);
}

section('coasts are classified (margins)');
{
    const r = run('margins'), f = r.last, drift = plateNamed(f, 'Driftia');
    const coast = cellsWhere(numCells, w => f.owner[w] === drift.id && f.margin[w]);
    // which way each coast cell faces, from the continent's middle
    const lc = cellsWhere(numCells, w => f.owner[w] === drift.id && isLand(f, w)).reduce((s, w) => [s[0] + xyz[3 * w], s[1] + xyz[3 * w + 1], s[2] + xyz[3 * w + 2]], [0, 0, 0]);
    const l = Math.hypot(...lc), mid = lc.map(v => v / l), west = heading(mid, -90);
    const facing = w => { const p = pos(w), k = p[0] * mid[0] + p[1] * mid[1] + p[2] * mid[2], t = [p[0] - k * mid[0], p[1] - k * mid[1], p[2] - k * mid[2]], tl = Math.hypot(...t) || 1; return (t[0] * west[0] + t[1] * west[1] + t[2] * west[2]) / tl; };
    const w = coast.filter(c => facing(c) > 0.7), e = coast.filter(c => facing(c) < -0.7);
    const share = (cells, test) => cells.filter(test).length / Math.max(1, cells.length);
    const wActive = share(w, c => (f.margin[c] & Margin.TYPE) === Margin.ACTIVE), wLead = share(w, c => f.margin[c] & Margin.LEADING);
    const eQuiet = share(e, c => (f.margin[c] & Margin.TYPE) === Margin.PASSIVE), eTrail = share(e, c => f.margin[c] & Margin.TRAILING);
    check('the coast with the trench is active and leading', w.length > 10 && wActive >= 0.7 && wLead >= 0.6, `${w.length} west-facing coast cells: ${(100 * wActive).toFixed(0)} % active, ${(100 * wLead).toFixed(0)} % leading`);
    check('the far coast is passive and trailing', e.length > 10 && eQuiet >= 0.7 && eTrail >= 0.6, `${e.length} east-facing coast cells: ${(100 * eQuiet).toFixed(0)} % passive, ${(100 * eTrail).toFixed(0)} % trailing`);
}

section('a young slab goes in flat (laramide)');
{
    const flat = run('laramide'), steep = run('laramide', { flatSlabMaxAgeMyr: 0 });
    const count = (r, type) => { const id = plateNamed(r.last, 'Laurentia').id; return cellsWhere(numCells, w => r.last.owner[w] === id && r.last.oroType[w] === type).length; };
    const lar = count(flat, OrogenyType.LARAMIDE), and = count(flat, OrogenyType.ANDEAN), andSteep = count(steep, OrogenyType.ANDEAN), larSteep = count(steep, OrogenyType.LARAMIDE);
    check('under a plate driving at it, a young slab flattens: the belt is Laramide', flat.events.some(e => e.kind === EventKind.SLAB_FLAT) && lar >= 3 * Math.max(1, and),
        `${lar} Laramide belt cells, ${and} Andean ones; event: ${flat.events.find(e => e.kind === EventKind.SLAB_FLAT)?.text.slice(0, 70) ?? 'none'}…`);
    check('with flat slabs off, the same margin builds an Andean belt', larSteep === 0 && andSteep > 20, `${andSteep} Andean belt cells, ${larSteep} Laramide ones`);
    // how far inland the belt runs: the median of its cells' distance from the active coast (the far tail is stray records
    // spread along the flanks, not the belt)
    const reach = (r, type) => { const id = plateNamed(r.last, 'Laurentia').id, d = inlandKm(r.last, id), ds = cellsWhere(numCells, w => r.last.owner[w] === id && r.last.oroType[w] === type).map(d).filter(v => v >= 0).sort((x, y) => x - y); return ds.length ? ds[Math.floor(0.5 * (ds.length - 1))] : 0; };
    const rLar = reach(flat, OrogenyType.LARAMIDE), rAnd = reach(steep, OrogenyType.ANDEAN);
    check('the flat-slab belt reaches far further inland', rLar >= 1.5 * rAnd && rLar >= 400, `the Laramide belt lies typically ${rLar.toFixed(0)} km from the coast; the Andean one ${rAnd.toFixed(0)} km (medians)`);
    // the belt grows with the flat slab: it starts near the coast and sweeps inland as more slab goes down flat
    const farthest = (f, type) => { const id = plateNamed(f, 'Laurentia').id, d = inlandKm(f, id), ds = cellsWhere(numCells, w => f.owner[w] === id && f.oroType[w] === type).map(d).filter(v => v >= 0).sort((x, y) => x - y); return ds.length ? ds[Math.floor(0.9 * (ds.length - 1))] : 0; };
    const early = farthest(nearestFrame(flat.frames, 4), OrogenyType.LARAMIDE), late = farthest(nearestFrame(flat.frames, 24), OrogenyType.LARAMIDE);
    check('the Laramide belt migrates inland over time, not all at once', late >= 1.6 * early && early > 0, `90th percentile of its reach: ${early.toFixed(0)} km at 4 Myr → ${late.toFixed(0)} km at 24 Myr`);
    check('the slab steepens again once the slab going down has aged', flat.events.some(e => e.kind === EventKind.SLAB_STEEP && e.time > 25), (t => (t === undefined ? 'never' : `${t.toFixed(0)} Myr`))(flat.events.find(e => e.kind === EventKind.SLAB_STEEP)?.time));
}

section('how the plates meet shapes the belt');
{
    // the same Andean margin, the plates meeting head-on or 50° oblique (the same speeds)
    const P = latLonToXyz(42, -118), driven = turn => w => {
        w.plates.find(p => p.name === 'Laurentia').omega = omegaFor(P, heading(P, -90 + turn), 5);
        w.plates.find(p => p.name === 'Farallona').omega = omegaFor(P, heading(P, 90 + turn), 5);
    };
    const steep = { flatSlabMaxAgeMyr: 0, marginIsleRatePerMyr: 0, marginIsleGrowKmPerMyr: 0 }, headOn = run('laramide', steep, driven(0)), oblique = run('laramide', steep, driven(50));
    const beltCells = r => { const f = nearestFrame(r.frames, 30), id = plateNamed(f, 'Laurentia').id; return cellsWhere(numCells, w => f.owner[w] === id && f.oroType[w] === OrogenyType.ANDEAN).length; };
    const nHead = beltCells(headOn), nObl = beltCells(oblique);
    check('an oblique margin builds a narrower belt than a head-on one', nObl < 0.8 * nHead && nObl > 0, `${nHead} Andean belt cells head-on, ${nObl} at 50° oblique (at 30 Myr)`);
    const young = beltShape(1, 5, r0cfg()), old = beltShape(1, 140, r0cfg()), slant = beltShape(Math.cos(60 * Math.PI / 180), 60, r0cfg()), square = beltShape(1, 60, r0cfg());
    check('a belt reaches further over a young slab (ridge close offshore) than over an old one, and head-on than oblique', young > 1.3 * old && square > 1.8 * slant,
        `reach × ${young.toFixed(2)} over a 5-Myr slab, × ${old.toFixed(2)} over a 140-Myr one; × ${square.toFixed(2)} head-on, × ${slant.toFixed(2)} at 60°`);
}

section('an arc rifts off its ocean plate (mariana)');
{
    const r = run('mariana'), cfg = r.cfg, split = r.events.find(e => e.kind === EventKind.BACKARC_OPEN);
    check('the old slab rolls back and the arc rifts off, early', !!split && split.time < 10 && !split.data.continental && r.last.plates[split.data.parent].name === 'Philippina',
        split ? `${split.time.toFixed(0)} Myr: ${split.text.slice(0, 150)}` : 'no back-arc');
    if (split) {
        const stripName = r.last.plates[split.data.strip].name, f0 = nearestFrame(r.frames, split.time + 2), fOpen = nearestFrame(r.frames, split.time + cfg.backArcActiveMyr - 5);
        const strip = plateById(fOpen, split.data.strip), parent = plateById(fOpen, split.data.parent);
        const arcs = cellsWhere(numCells, w => f0.owner[w] >= 0 && f0.type[w] === CrustType.ARC), onStrip = arcs.filter(w => f0.owner[w] === split.data.strip);
        check('the arc goes with the strip', arcs.length > 10 && onStrip.length >= 0.8 * arcs.length, `${onStrip.length} of ${arcs.length} arc cells on ${stripName}`);
        const young = cellsWhere(numCells, w => fOpen.owner[w] >= 0 && fOpen.type[w] === CrustType.OCEAN && fOpen.formedAt[w] > split.time && (fOpen.owner[w] === strip?.id || fOpen.owner[w] === parent?.id));
        const ridge = cellsWhere(numCells, w => fOpen.boundary[w] === BoundaryKind.RIDGE && (fOpen.owner[w] === strip?.id || fOpen.owner[w] === parent?.id));
        check('a back-arc sea opens behind it, at a spreading ridge', !!strip && young.length >= 40 && ridge.length >= 10, `${young.length} cells of new sea floor between them and ${ridge.length} ridge cells at ${fOpen.time} Myr`);
        const rel = strip && parent ? relativeCmYr(strip, parent) : 0, expected = rollbackCmYr(150, cfg);
        check('it opens at the slab’s rollback rate — a few cm/yr, not flung', Math.abs(rel - expected) < 0.35 * expected, `the strip moves ${rel.toFixed(1)} cm/yr against Philippina; an old slab rolls back at ${expected} cm/yr`);
        const stop = r.events.find(e => e.kind === EventKind.BACKARC_CLOSE && e.data.strip === split.data.strip);
        check('after a few tens of Myr it stops spreading and moves with its plate again', !!stop && stop.data.rejoined && Math.abs(stop.time - split.time - cfg.backArcActiveMyr) < 3 && !plateById(r.last, split.data.strip),
            stop ? `${stop.time.toFixed(0)} Myr: ${stop.text}` : 'still spreading at the end');
        const keptYoung = cellsWhere(numCells, w => r.last.owner[w] >= 0 && r.last.type[w] === CrustType.OCEAN && r.last.formedAt[w] > split.time && r.last.formedAt[w] < split.time + cfg.backArcActiveMyr);
        check('…and keeps the sea it opened', keptYoung.length >= 40, `${keptYoung.length} cells of the back-arc sea floor are still there at ${r.last.time} Myr`);
    }
    check('no gaps', r.frames.every(f => frameTallies(f).gaps === 0), 'every frame');
}

section('a strip of coast rifts off a continent (japan)');
{
    const r = run('japan'), cfg = r.cfg, split = r.events.find(e => e.kind === EventKind.BACKARC_OPEN);
    check('the old slab rolls back from under the continent: a strip of its coast rifts off', !!split && split.data.continental && r.last.plates[split.data.parent].name === 'Asiana',
        split ? `${split.time.toFixed(0)} Myr: ${split.text.slice(0, 150)}` : 'no back-arc');
    if (split) {
        const stripName = r.last.plates[split.data.strip].name, f0 = nearestFrame(r.frames, split.time + 2), fOpen = nearestFrame(r.frames, split.time + cfg.backArcActiveMyr - 5);
        const strip = plateById(f0, split.data.strip), asia = plateById(f0, split.data.parent);
        const stripLand = cellsWhere(numCells, w => f0.owner[w] === strip.id && isLand(f0, w));
        check('the strip is a coherent arc of land, not a sliver', stripLand.length * cellAreaKm2 >= cfg.backArcMinLandKm2 && largestPiece(mesh, stripLand) >= 0.9 * stripLand.length,
            `${stripLand.length} land cells (${(stripLand.length * cellAreaKm2 / 1e6).toFixed(2)} Mkm²), ${largestPiece(mesh, stripLand) === stripLand.length ? 'in one piece' : `largest piece ${largestPiece(mesh, stripLand)}`}`);
        const cratons = cellsWhere(numCells, w => f0.owner[w] >= 0 && f0.type[w] === CrustType.CRATON);
        check('no craton goes with it', cratons.length > 0 && cratons.every(w => f0.owner[w] === asia.id), `${cratons.filter(w => f0.owner[w] !== asia.id).length} of ${cratons.length} craton cells off Asiana`);
        const young = cellsWhere(numCells, w => fOpen.owner[w] >= 0 && fOpen.type[w] === CrustType.OCEAN && fOpen.formedAt[w] > split.time);
        check('a sea opens between the strip and the mainland', young.length >= 30, `${young.length} cells of new sea floor at ${fOpen.time} Myr`);
        // when it stops spreading the strip joins Asiana again — its land and its sea stay where they are
        const landOf = f => cellsWhere(numCells, w => isLand(f, w)).length, before = nearestFrame(r.frames, split.time + cfg.backArcActiveMyr - 2), after = r.last;
        const isles = cellsWhere(numCells, w => before.owner[w] === plateNamed(before, stripName)?.id && isLand(before, w));
        // the Isles: Asiana's land that stands apart from its mainland, across the sea it opened
        const asiaLand = cellsWhere(numCells, w => after.owner[w] === plateNamed(after, 'Asiana')?.id && isLand(after, w)), apart = asiaLand.length - largestPiece(mesh, asiaLand);
        check('when it rejoins its continent, no land is lost', Math.abs(landOf(after) - landOf(before)) <= 0.02 * landOf(before) && apart >= 0.8 * isles.length && !plateNamed(after, stripName),
            `land ${landOf(before)} cells before the rejoin, ${landOf(after)} at ${after.time} Myr; the Isles (${isles.length} cells) ride on with Asiana as ${apart} cells of land across the sea`);
    }
    check('no gaps', r.frames.every(f => frameTallies(f).gaps === 0), 'every frame');
}

section('in a whole history');
{
    const r = run('history'), cfg = r.cfg;
    const opened = r.events.filter(e => e.kind === EventKind.BACKARC_OPEN), closed = r.events.filter(e => e.kind === EventKind.BACKARC_CLOSE);
    check('rolling-back trenches open back-arc seas now and then', opened.length >= 1 && opened.length <= 10, `${opened.length} back-arc seas in ${r.last.time} Myr (${opened.map(e => e.time.toFixed(0)).join(', ')} Myr)`);
    // every strip is accounted for: it stopped spreading (and rejoined, or carried on alone), is still opening, or was
    // itself swallowed by a collision in the meantime
    const unresolved = opened.filter(o => !closed.some(e => e.data.strip === o.data.strip) && r.last.time - o.time >= cfg.backArcActiveMyr && plateById(r.last, o.data.strip));
    check('each stops spreading in time', unresolved.length === 0, `${closed.length} stopped, ${opened.length - closed.length} still opening or swallowed; unresolved: ${unresolved.map(o => r.last.plates[o.data.strip].name).join(', ') || 'none'}`);
    // while it opens, a strip follows its trench at the rollback rate — it is not flung by the force balance
    let worst = 0, judged = 0;
    opened.forEach(e => {
        for (const f of r.frames) {
            if (f.time < e.time + 2 || f.time > e.time + cfg.backArcActiveMyr - 2) continue;
            const s = plateById(f, e.data.strip), p = plateById(f, e.data.parent);
            if (s && p) { worst = Math.max(worst, relativeCmYr(s, p)); judged++; }
        }
    });
    check('while a sea opens, its strip follows the trench — not flung', judged >= opened.length && worst <= cfg.rollbackMaxCmYr + 0.5,
        `fastest a strip ever moved against its parent: ${worst.toFixed(1)} cm/yr (rollback at most ${cfg.rollbackMaxCmYr}), over ${judged} frames of ${opened.length} opening seas`);
    const fastest = Math.max(...r.frames.map(f => Math.max(0, ...f.plates.filter(p => p.alive && !p.isBackground).map(p => p.speedCmYr))));
    check('every plate stays within Worldbuilding Pasta’s speeds', fastest <= cfg.maxSpeedOceanic, `fastest plate in any frame: ${fastest.toFixed(1)} cm/yr (oceanic limit ${cfg.maxSpeedOceanic})`);
    const plates = Math.max(...r.frames.map(f => f.plates.filter(p => p.alive && !p.isBackground).length));
    check('the plate count stays sane; no gaps; it runs fast', plates <= cfg.reserved.maxPlates && r.frames.every(f => frameTallies(f).gaps === 0) && r.steps < 650, `at most ${plates} plates; ${r.steps} steps`);
    const kinds = new Set(); for (let w = 0; w < numCells; w++) if (r.last.margin[w]) kinds.add(r.last.margin[w] & Margin.TYPE);
    check('its coasts come in every kind', kinds.has(Margin.ACTIVE) && kinds.has(Margin.PASSIVE) && kinds.has(Margin.TRANSFORM), `margin kinds present at ${r.last.time} Myr: ${[...kinds].sort().join(', ')}`);
    // fore-arc islands: they rise off active coasts and grow into the mainland — land grows, but not without bound
    const merges = r.events.filter(e => e.kind === EventKind.ISLE_MERGE);
    // (the islands alone: both runs with erosive margins off, which eat about as much as the islands add — Phase 7c)
    const landAt = x => cellsWhere(numCells, w => isLand(x.last, w)).length, noErosion = mechanismsOff('marginErosion');
    const withIsles = run('history', noErosion), bare = run('history', { ...noErosion, ...mechanismsOff('marginIsles') });
    const growth = landAt(withIsles) / landAt(bare);
    check('islands rise off active coasts and grow into the mainland', merges.length >= 3, `${merges.length} islands merged into their mainland; first: ${merges[0]?.text ?? 'none'}`);
    check('…growing the continents, but not without bound', growth > 1.03 && growth < 1.3, `land at ${r.last.time} Myr: ${landAt(withIsles)} cells with fore-arc islands, ${landAt(bare)} without (× ${growth.toFixed(2)}; erosive margins off in both)`);
    const transp = cellsWhere(numCells, w => r.last.owner[w] >= 0 && r.last.oroType[w] === OrogenyType.TRANSPRESSION).length;
    check('transforms pressed together raise narrow ridges', transp > 0, `${transp} cells of transpression ridge at ${r.last.time} Myr`);
    const b = run('history');                                                  // (a replay of r)
    check('the same seed replays the same history', r.events.length === b.events.length && r.events.every((e, i) => e.text === b.events[i].text) && r.frames.at(-1).owner.every((o, w) => o === b.frames.at(-1).owner[w]), `${r.events.length} events and the final world, identical`);
}

section('lab');
await checkLabPhaseLoads('../../js/app/phases/phase7b-margins.js', mesh, LAB_MESH_SEED, MARGIN_SCENES.map(s => ({ scene: s.id })));

finish('Phase 7b');
