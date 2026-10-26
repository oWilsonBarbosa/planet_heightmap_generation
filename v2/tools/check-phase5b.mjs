// Headless acceptance checks for Phase 5b (trench wings, island arcs, terrane docking, polarity reversal).
// Usage: node v2/tools/check-phase5b.mjs

import { check, section, finish, labMesh, checkLabPhaseLoads, LAB_MESH_SEED, mean, isLand, cellsWhere, nearestKm, kmBetween } from './lib/check-kit.mjs';
import { PLANET_RADIUS_KM } from '../js/core/sim-mesh.js';
import { EVENT_SCENES } from '../js/tectonics/scenarios/event-scenes.js';
import { simulate } from '../js/tectonics/simulate.js';
import { updatePlateMotion } from '../js/tectonics/step/torque-balance.js';
import { frameTallies } from '../js/tectonics/measure.js';
import { CrustType, CrustFlag, OrogenyType } from '../js/tectonics/model/crust.js';
import { BoundaryKind } from '../js/tectonics/model/world.js';
import { tallies, NO_RIFTS } from '../js/app/phases/phase5b-arcs.js';
import { EventKind } from '../js/tectonics/model/world.js';

const SEED = 12345, SNAPSHOT_MYR = 2;
const mesh = labMesh(), { xyz, numCells, adjOffset, adjList } = mesh;

function run(id, overrides = {}) {
    const scene = EVENT_SCENES.find(s => s.id === id), world = scene.build(mesh, SEED);
    Object.assign(world.config, NO_RIFTS, overrides);           // wings, arcs and terranes alone: rifting is Phase 6
    const { frames, steps } = simulate(world, { untilMyr: scene.maxMyr, drive: updatePlateMotion, snapshotEveryMyr: SNAPSHOT_MYR });
    const idOf = Object.fromEntries(frames[0].plates.map(p => [p.name, p.id]));
    return { scene, world, frames, steps, idOf, at: t => frames.find(f => Math.abs(f.time - t) < 1e-6), events: world.events, plate: (name, t) => frames.find(f => Math.abs(f.time - t) < 1e-6).plates[idOf[name]] };
}
/** Overriding-edge cells of plate `a` whose contact is with plate `b`. */
function overridingAgainst(f, a, b) {
    let n = 0;
    for (let w = 0; w < numCells; w++) {
        if (f.owner[w] !== a || f.boundary[w] !== BoundaryKind.OVERRIDING) continue;
        for (let k = adjOffset[w]; k < adjOffset[w + 1]; k++) if (f.owner[adjList[k]] === b) { n++; break; }
    }
    return n;
}

section('trench wings & island arc');
{
    const r = run('wings'), cfg = r.world.config, last = r.frames.at(-1), solo = r.idOf.Solo;
    const wingsAt = t => tallies(r.at(t), mesh).wingCells;
    check('the trench reaches past the land and stays there (arcs accreting bring the land closer, so the count need not rise)', wingsAt(0) === 0 && wingsAt(40) > 6 && wingsAt(100) > 6,
        `trench cells more than 600 km from any land: ${wingsAt(0)} at 0 Myr, ${wingsAt(40)} at 40, ${wingsAt(100)} at 100`);
    // wings run across the motion: the wing cells' spread is larger perpendicular to the velocity than along it
    const f = r.at(100), p = f.plates[solo], c = p.centre, v = [p.omega[1] * c[2] - p.omega[2] * c[1], p.omega[2] * c[0] - p.omega[0] * c[2], p.omega[0] * c[1] - p.omega[1] * c[0]];
    const along = v.map(x => x / (Math.hypot(...v) || 1)), across = [along[1] * c[2] - along[2] * c[1], along[2] * c[0] - along[0] * c[2], along[0] * c[1] - along[1] * c[0]];
    const landCells = cellsWhere(numCells, w => f.owner[w] === solo && (f.type[w] === CrustType.CONTINENT || f.type[w] === CrustType.CRATON)), wings = cellsWhere(numCells, w => f.owner[w] === solo && (f.flags[w] & CrustFlag.TRENCH) && nearestKm(mesh, w, landCells.filter((_, i) => i % 5 === 0)) > 600);   // past the CONTINENT: accreted arcs are land too
    const extent = (cells, dir) => { const s = cells.map(w => (xyz[3 * w] * dir[0] + xyz[3 * w + 1] * dir[1] + xyz[3 * w + 2] * dir[2]) * PLANET_RADIUS_KM); return [Math.min(...s), Math.max(...s)]; };
    const [landLo, landHi] = extent(landCells, across), [wingLo, wingHi] = extent(wings, across);
    check('the trench reaches past the land on both sides, across the plate’s motion', wings.length > 6 && landLo - wingLo > 500 && wingHi - landHi > 500,
        `at 100 Myr the trench extends ${(landLo - wingLo).toFixed(0)} km beyond one end of the land and ${(wingHi - landHi).toFixed(0)} km beyond the other, measured across the motion`);
    const speeds = r.frames.filter(fr => fr.time >= 30 && fr.time <= 150).map(fr => fr.plates[solo].speedCmYr);
    check('the continent keeps its active-margin speed', Math.min(...speeds) >= 1.5 && Math.max(...speeds) <= 5, `${Math.min(...speeds).toFixed(2)}–${Math.max(...speeds).toFixed(2)} cm/yr over 30–150 Myr (it slows later as it accretes arcs and grows)`);
    const arcs = cellsWhere(numCells, w => last.owner[w] >= 0 && last.type[w] === CrustType.ARC);
    const continental = cellsWhere(numCells, w => last.owner[w] >= 0 && (last.type[w] === CrustType.CONTINENT || last.type[w] === CrustType.CRATON));
    const trench = cellsWhere(numCells, w => last.owner[w] >= 0 && (last.flags[w] & CrustFlag.TRENCH) && last.type[w] === CrustType.OCEAN);   // (an arc island at the plate edge carries its own flag)
    const offshoreArcs = arcs.filter(w => !(last.flags[w] & CrustFlag.SUTURE));      // arcs that have not collapsed onto the coast
    const fromLand = offshoreArcs.map(w => nearestKm(mesh, w, continental.filter((_, i) => i % 3 === 0))).sort((a, b) => a - b), arcFromLand = fromLand.length ? fromLand[fromLand.length >> 1] : 0;   // median: a widening arc can reach toward the coast
    const toTrench = arcs.map(w => nearestKm(mesh, w, trench)).sort((a, b) => a - b), arcToTrench = toTrench.length ? toTrench[toTrench.length >> 1] : 0;   // median: an old arc can be left behind when its trench moves on
    check('island arcs form as chains behind the wings, away from the continent, on the continent’s plate', arcs.length >= 40 && arcs.every(w => last.owner[w] === solo) && arcFromLand > cfg.arcNoLandWithinKm - 2 * mesh.edgeKm && arcToTrench <= 3 * mesh.edgeKm,
        `${arcs.length} arc cells at ${last.time} Myr (${arcs.length - offshoreArcs.length} already collapsed onto the coast); offshore arcs typically ${arcFromLand.toFixed(0)} km from continental crust; typically ${arcToTrench.toFixed(0)} km from a trench cell`);
    // a chain, not dots: the arc cells' largest connected group
    const arcSet = new Set(arcs), grouped = new Set();
    let biggest = 0;
    for (const a of arcs) {
        if (grouped.has(a)) continue;
        const group = [a]; grouped.add(a);
        for (let i = 0; i < group.length; i++) for (let k = adjOffset[group[i]]; k < adjOffset[group[i] + 1]; k++) { const nb = adjList[k]; if (arcSet.has(nb) && !grouped.has(nb)) { grouped.add(nb); group.push(nb); } }
        biggest = Math.max(biggest, group.length);
    }
    check('…as connected chains, not scattered dots', biggest >= 6, `longest connected arc chain: ${biggest} cells (${(biggest * mesh.edgeKm).toFixed(0)} km)`);
    // the plate never grows forward: ocean ahead of the land's front, along the motion, stays within the apron plus jitter
    let worstFront = 0;
    for (const fr of r.frames) {
        if (fr.time < 10) continue;
        const pl = fr.plates[solo], cc = pl.centre, oo = pl.omega, vv = [oo[1] * cc[2] - oo[2] * cc[1], oo[2] * cc[0] - oo[0] * cc[2], oo[0] * cc[1] - oo[1] * cc[0]], sp = Math.hypot(...vv) || 1, vh = vv.map(x => x / sp);
        let landMax = -Infinity, oceanMax = -Infinity;
        for (let w = 0; w < numCells; w++) { if (fr.owner[w] !== solo) continue; const pr = (xyz[3 * w] * vh[0] + xyz[3 * w + 1] * vh[1] + xyz[3 * w + 2] * vh[2]) * PLANET_RADIUS_KM; if (fr.type[w] === CrustType.OCEAN) oceanMax = Math.max(oceanMax, pr); else landMax = Math.max(landMax, pr); }
        worstFront = Math.max(worstFront, oceanMax - landMax);
    }
    check('the plate never grows forward: its front stays an apron’s width ahead of the land', worstFront <= cfg.apronKm + 2.5 * mesh.edgeKm, `deepest fore-arc ahead of the land, along the motion, in any frame: ${worstFront.toFixed(0)} km (apron ${cfg.apronKm} km)`);
    // the rule itself, rather than a time that happens to be before the first arc: while no slab anywhere has
    // reached arcMatureConsumedKm, there is no arc crust (the first arc then follows a few Myr after maturity)
    let immatureFrames = 0, arcsWhileImmature = 0, firstArcMyr = null, matureMyr = null;
    for (const fr of r.frames) {
        let maxSlab = 0, arc = 0;
        for (let w = 0; w < numCells; w++) { if (fr.owner[w] < 0) continue; if (fr.slabKm[w] > maxSlab) maxSlab = fr.slabKm[w]; if (fr.type[w] === CrustType.ARC) arc++; }
        if (maxSlab >= cfg.arcMatureConsumedKm && matureMyr === null) matureMyr = fr.time;
        if (arc > 0 && firstArcMyr === null) firstArcMyr = fr.time;
        if (maxSlab < cfg.arcMatureConsumedKm) { immatureFrames++; arcsWhileImmature += arc; }
    }
    check('arcs need a mature slab: none before one matures', immatureFrames > 4 && arcsWhileImmature === 0,
        `no arc crust in the ${immatureFrames} frames before a slab reached ${cfg.arcMatureConsumedKm} km (at ${matureMyr} Myr); first arc at ${firstArcMyr} Myr`);
    check('no gaps', r.frames.every(fr => frameTallies(fr).gaps === 0), 'every frame');
}

section('microcontinent docks');
{
    const r = run('terrane'), dock = r.events.find(e => e.kind === EventKind.DOCK);
    check('the microcontinent accretes as a terrane (no suture, no plateau)', !!dock && !dock.data.arc && !r.events.some(e => e.kind === EventKind.SUTURE), dock ? dock.text : 'no accretion event');
    if (dock) {
        const before = r.frames.filter(f => f.time < dock.time).at(-1), after = r.frames.find(f => f.time >= dock.time + 4), last = r.frames.at(-1);
        const asia = r.idOf.Asia, rider = r.idOf.Rider;
        const landOf = (f, id) => cellsWhere(numCells, w => f.owner[w] === id && isLand(f, w)).length;
        const continentOf = (f, id) => cellsWhere(numCells, w => f.owner[w] === id && isLand(f, w) && f.type[w] !== CrustType.ARC).length;   // (Rider may grow island arc of its own at its trench)
        check('its land moves to Asia; Rider keeps only ocean (bar a stray speck of the noisy outline)', continentOf(after, rider) <= 3 && landOf(after, asia) > landOf(before, asia) + 30 && after.plates[rider].alive,
            `Asia land ${landOf(before, asia)} → ${landOf(after, asia)} cells; Rider land ${landOf(before, rider)} → ${landOf(after, rider)}, still alive`);
        check('subduction jumps outboard: Asia overrides Rider at the terrane’s far side, and Rider keeps going down', overridingAgainst(after, asia, rider) > 5 && after.plates[rider].speedCmYr > 5,
            `${overridingAgainst(after, asia, rider)} overriding-edge cells of Asia against Rider ${after.time - dock.time | 0} Myr after docking; Rider at ${after.plates[rider].speedCmYr.toFixed(1)} cm/yr`);
        const ural = cellsWhere(numCells, w => isLand(last, w) && last.oroType[w] === OrogenyType.URAL), him = cellsWhere(numCells, w => isLand(last, w) && last.oroType[w] === OrogenyType.HIMALAYAN);
        const reach = Math.max(...ural.map(w => nearestKm(mesh, w, cellsWhere(numCells, v => isLand(last, v) && (last.flags[v] & CrustFlag.SUTURE)))));
        check('a narrow Ural belt marks the join', ural.length > 20 && him.length === 0 && reach <= r.world.config.belts.ural.maxKm * r.world.config.beltSpeedFactorMax + 2 * mesh.edgeKm,
            `${ural.length} Ural cells reaching ${reach.toFixed(0)} km from the suture; ${him.length} Himalayan cells`);
        check('overlap is cleared by the docking; no gaps', frameTallies(after).collision === 0 && r.frames.every(f => frameTallies(f).gaps === 0), `overlap after docking: ${frameTallies(after).collision}`);
    }
}

section('arc meets a passive margin');
{
    const r = run('arc'), dock = r.events.find(e => e.kind === EventKind.DOCK);
    check('the arc accretes onto the continent', !!dock && dock.data.arc && dock.data.host === r.idOf.Austral, dock ? dock.text : 'no accretion event');
    if (dock) {
        const austral = r.idOf.Austral, oceanica = r.idOf.Oceanica;
        const before = r.frames.filter(f => f.time < dock.time - 2).at(-1), afterFrames = r.frames.filter(f => f.time >= dock.time + 10);
        const beforeO = overridingAgainst(before, oceanica, austral), beforeA = overridingAgainst(before, austral, oceanica);
        const afterA = mean(afterFrames.map(f => overridingAgainst(f, austral, oceanica))), afterO = mean(afterFrames.map(f => overridingAgainst(f, oceanica, austral)));
        check('polarity reverses: Oceanica overrode before, Austral overrides after', beforeO > beforeA && afterA > 2 * afterO && afterA > 5,
            `overriding-edge cells at their contact — before: Oceanica ${beforeO}, Austral ${beforeA}; after (mean over ${afterFrames.length} frames): Austral ${afterA.toFixed(1)}, Oceanica ${afterO.toFixed(1)}`);
        const end = r.frames.at(-1), arcOnAustral = cellsWhere(numCells, w => end.owner[w] === austral && end.type[w] === CrustType.ARC).length;
        check('the arc crust now belongs to the continent', arcOnAustral >= 30, `${arcOnAustral} arc cells on Austral at the end`);
        // pieces that touch the continent dock too — none is left touching Austral's land at the end
        let leftTouching = 0;
        for (let w = 0; w < numCells; w++) {
            if (end.owner[w] !== oceanica || end.type[w] === CrustType.OCEAN) continue;
            for (let k = adjOffset[w]; k < adjOffset[w + 1]; k++) { const nb = adjList[k]; if (end.owner[nb] === austral && isLand(end, nb)) { leftTouching++; break; } }
        }
        const docks = r.events.filter(e => e.kind === EventKind.DOCK && e.data.host === austral).length;
        check('every arc piece that touches the continent docks', leftTouching === 0 && docks >= 2, `${docks} pieces docked onto Austral; ${leftTouching} Oceanica land cells still touching Austral’s land at ${end.time} Myr`);
        // the arc ends up joined to the coast, the sea between them closed — by docking straight onto it (its land stacks
        // up beside the coast where it arrives), or by collapsing onto it later (the collapse rule has its own scene below)
        const arcCells = cellsWhere(numCells, w => end.owner[w] === austral && end.type[w] === CrustType.ARC);
        const mainland = new Set(), seeds = cellsWhere(numCells, w => end.owner[w] === austral && isLand(end, w) && end.type[w] !== CrustType.ARC);
        let biggest = [];
        for (const s0 of seeds) {
            if (mainland.has(s0)) continue;
            const piece = [s0]; mainland.add(s0);
            for (let i = 0; i < piece.length; i++) for (let k = adjOffset[piece[i]]; k < adjOffset[piece[i] + 1]; k++) { const nb = adjList[k]; if (!mainland.has(nb) && end.owner[nb] === austral && isLand(end, nb)) { mainland.add(nb); piece.push(nb); } }
            if (piece.length > biggest.length) biggest = piece;
        }
        const joined = new Set(biggest), attached = arcCells.filter(w => joined.has(w)).length;
        check('the accreted arc ends up joined to the coast: the sea between them closes', arcCells.length >= 30 && attached >= 0.8 * arcCells.length,   // (before land-conserving docking: ~64 %)
            `${attached} of ${arcCells.length} arc cells on Austral are joined to its mainland at ${end.time} Myr${r.events.some(e => e.kind === EventKind.ARC_COLLAPSE) ? ' (after a collapse)' : ' (docked straight onto it)'}`);
        check('no gaps; overlap never builds up', r.frames.every(f => frameTallies(f).gaps === 0) && Math.max(...r.frames.map(f => frameTallies(f).collision)) < 30, `overlap peaks at ${Math.max(...r.frames.map(f => frameTallies(f).collision))} cells`);
    }
}

section('arcs between closing continents');
{
    const r = run('arc-collision'), west = r.idOf.Westland, east = r.idOf.Eastland;
    const coreOf = (f, id) => { const out = []; for (let w = 0; w < numCells; w++) if (f.owner[w] === id && (f.type[w] === CrustType.CONTINENT || f.type[w] === CrustType.CRATON)) out.push(w); return out; };
    const coreGapKm = f => {
        const W = coreOf(f, west), E = coreOf(f, east);
        if (!W.length || !E.length) return 0;                       // they have welded into one plate
        let best = -2;
        for (const a of W) for (const b of E) { const d = xyz[3 * a] * xyz[3 * b] + xyz[3 * a + 1] * xyz[3 * b + 1] + xyz[3 * a + 2] * xyz[3 * b + 2]; if (d > best) best = d; }
        return Math.acos(Math.min(1, best)) * PLANET_RADIUS_KM;
    };
    const scraped = [...r.world.arcScrapes.values()];
    const firstScrape = scraped.length ? Math.min(...scraped.map(s => s.since)) : null;
    const suture = r.events.find(e => e.kind === EventKind.SUTURE);
    check('arc crust is scraped off at the contact, not welded there', scraped.length === 2 && scraped.every(s => s.cells > 0),
        scraped.length ? scraped.map(s => `${s.donorName} lost ${s.cells} arc cells from ${s.since.toFixed(0)} Myr`).join('; ') : 'nothing scraped');
    // the arcs touching is not itself a collision: no record opens, and no shortening is booked, until the cores meet
    const collision = r.events.find(e => e.kind === EventKind.COLLISION), shortening = suture?.data.shorteningKm ?? 0;
    check('arcs touching does not open a collision: that waits for the cores', !!collision && firstScrape !== null && collision.time >= firstScrape - 1e-6 && shortening > 400,
        collision ? `first arc scraped at ${firstScrape.toFixed(0)} Myr; the collision record opens at ${collision.time.toFixed(0)} Myr and books ${shortening.toFixed(0)} km of shortening before welding` : 'no collision record');
    check('the suture comes later, when the CORES meet', !!suture && firstScrape !== null && suture.time > firstScrape + 5,
        suture ? `first arc scraped at ${firstScrape.toFixed(0)} Myr; the plates weld at ${suture.time.toFixed(0)} Myr` : 'no suture');
    const land0 = cellsWhere(numCells, w => isLand(r.frames[0], w)).length, landEnd = cellsWhere(numCells, w => isLand(r.frames.at(-1), w)).length;
    check('land is not manufactured at the contact', Math.abs(landEnd - land0) < 0.25 * land0, `${land0} → ${landEnd} land cells over ${r.frames.at(-1).time} Myr`);
    check('no gaps', r.frames.every(f => frameTallies(f).gaps === 0), 'every frame');
}

section('lab');
await checkLabPhaseLoads('../../js/app/phases/phase5b-arcs.js', mesh, LAB_MESH_SEED, EVENT_SCENES.map(s => ({ scene: s.id })));

finish('Phase 5b');
