// Headless acceptance checks for Phase 7a (hotspots and Large Igneous Provinces).
// Usage: node v2/tools/check-phase7.mjs

import { check, section, finish, labMesh, checkLabPhaseLoads, LAB_MESH_SEED, cellsWhere, piecesOf, isConnected } from './lib/check-kit.mjs';
import { PLANET_RADIUS_KM } from '../js/core/sim-mesh.js';
import { tangentToward } from '../js/core/sphere-geom.js';
import { makeRng } from '../../js/rng.js';
import { HOTSPOT_SCENES } from '../js/tectonics/scenarios/hotspot-scenes.js';
import { TECTONICS } from '../js/tectonics/config.js';
import { simulate } from '../js/tectonics/simulate.js';
import { resolve } from '../js/tectonics/step/resolve.js';
import { pickPlumeSite } from '../js/tectonics/step/hotspots.js';
import { buildStartWorld } from '../js/tectonics/init/start-world.js';
import { frameTallies, volcanoTopKm, SEAMOUNT_KM } from '../js/tectonics/measure.js';
import { CrustType, VolcanicType } from '../js/tectonics/model/crust.js';
import { EventKind } from '../js/tectonics/model/world.js';
import { normalize } from '../js/core/sphere-geom.js';

const SEED = 12345, SNAPSHOT_MYR = 2;
const mesh = labMesh(), { numCells, xyz, adjOffset, adjList, edgeKm, cellAreaKm2 } = mesh;
const pos = w => [xyz[3 * w], xyz[3 * w + 1], xyz[3 * w + 2]];
const kmBetween = (a, b) => Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))) * PLANET_RADIUS_KM;
const continental = (f, w) => f.owner[w] >= 0 && (f.type[w] === CrustType.CONTINENT || f.type[w] === CrustType.CRATON);

function run(id, overrides = {}, seed = SEED) {
    const scene = HOTSPOT_SCENES.find(s => s.id === id), world = scene.build(mesh, seed);
    Object.assign(world.config, overrides);
    const { frames, steps } = simulate(world, { untilMyr: scene.maxMyr, drive: w => scene.drive(w), snapshotEveryMyr: SNAPSHOT_MYR });
    return { scene, world, frames, steps, events: world.events, last: frames.at(-1) };
}

/** Spearman rank correlation of two equal-length arrays. */
function spearman(a, b) {
    const rank = xs => { const idx = xs.map((x, i) => i).sort((i, j) => xs[i] - xs[j]), r = new Array(xs.length); idx.forEach((i, k) => { r[i] = k; }); return r; };
    const ra = rank(a), rb = rank(b), n = a.length, mean = (n - 1) / 2;
    let num = 0, da = 0, db = 0;
    for (let i = 0; i < n; i++) { num += (ra[i] - mean) * (rb[i] - mean); da += (ra[i] - mean) ** 2; db += (rb[i] - mean) ** 2; }
    return num / Math.sqrt(da * db);
}

section('a plate slides over a fixed plume (Hawaii–Emperor)');
{
    const r = run('hawaii'), { last, scene } = r, H = last.hotspots[0]?.xyz;
    check('one plume, and it stays put in the mantle', !!H && r.frames.filter(f => f.hotspots.length).every(f => f.hotspots.length === 1 && kmBetween(f.hotspots[0].xyz, H) < 1e-6),
        H ? `${last.hotspots[0].name}, at the same mantle position in every frame` : 'no plume');
    const track = cellsWhere(numCells, w => last.volcType[w] === VolcanicType.TRACK && last.owner[w] >= 0);
    const pathKm = scene.speedCmYr * 10 * scene.maxMyr;
    check('the swell it lifts is one continuous ribbon, as long as the plate has travelled', isConnected(mesh, track) && track.length >= 0.8 * pathKm / edgeKm,
        `${track.length} track cells in ${isConnected(mesh, track) ? 'one piece' : 'several pieces'}; the plate travelled ${pathKm.toFixed(0)} km ≈ ${(pathKm / edgeKm).toFixed(0)} cells`);
    // …but the volcanoes on it come in bursts: separate edifices, not a wall of rock (developer)
    const volcanoes = track.filter(w => last.volcKm[w] >= SEAMOUNT_KM), edifices = piecesOf(mesh, volcanoes);
    check('on that swell the volcanoes are separate — bursts, not a line of land', edifices.length >= 8 && volcanoes.length <= 0.6 * track.length,
        `${edifices.length} separate volcanoes (${volcanoes.length} cells) along ${track.length} cells of swell`);
    const islands = volcanoes.filter(w => volcanoTopKm(last, w) > 0), old = volcanoes.filter(w => last.time - last.volcAt[w] > 30);
    check('only fresh volcanoes break the surface; older ones have sunk into seamounts', islands.length >= 1 && islands.every(w => last.time - last.volcAt[w] < 25) && old.length >= 5 && old.every(w => volcanoTopKm(last, w) < 0),
        `${islands.length} island cells, last erupted ${islands.map(w => (last.time - last.volcAt[w]).toFixed(0)).join(', ')} Myr ago; all ${old.length} volcano cells older than 30 Myr are seamounts`);
    const age = w => last.time - last.volcAt[w], dist = w => kmBetween(pos(w), H);
    const rho = spearman(track.map(age), track.map(dist));
    check('the chain is youngest over the plume and older downstream', rho > 0.95, `rank correlation of age with distance from the plume: ${rho.toFixed(3)}`);
    // the young leg (since the bend): distance ÷ age is the plate's speed at the plume
    const young = track.filter(w => age(w) > 3 && age(w) < last.time - scene.bendMyr - 2);
    const rate = young.reduce((s, w) => s + dist(w), 0) / young.reduce((s, w) => s + age(w), 0), expected = scene.speedCmYr * 10;
    check('the chain lengthens at the plate’s speed', Math.abs(rate - expected) < 0.15 * expected, `${rate.toFixed(0)} km per Myr of age along the young leg; the plate moves ${expected} km/Myr`);
    // the bend: at the point that was over the plume when the plate turned, the chain changes direction by the turn
    const bendAge = last.time - scene.bendMyr, B = track.reduce((best, w) => (Math.abs(age(w) - bendAge) < Math.abs(age(best) - bendAge) ? w : best), track[0]);
    const oldest = track.reduce((best, w) => (age(w) > age(best) ? w : best), track[0]);
    const toPlume = tangentToward(pos(B), pos(B), H), toOld = tangentToward(pos(B), pos(B), pos(oldest));
    const bend = 180 - Math.acos(Math.max(-1, Math.min(1, toPlume[0] * toOld[0] + toPlume[1] * toOld[1] + toPlume[2] * toOld[2]))) * 180 / Math.PI;
    const turn = Math.abs(scene.legs[1] - scene.legs[0]);
    check('it bends where the plate turned, by the angle it turned', Math.abs(bend - turn) < 15, `the chain turns ${bend.toFixed(0)}° at the ${bendAge.toFixed(0)}-Myr-old point; the plate turned ${turn}°`);
    check('no gaps', r.frames.every(f => frameTallies(f).gaps === 0), 'every frame');
}

section('a plume head reaches a drifting continent (Deccan)');
{
    const r = run('deccan'), { last, scene, world } = r, cfg = world.config, H = last.hotspots[0]?.xyz;
    const lipEvent = r.events.find(e => e.kind === EventKind.LIP);
    check('the head floods the continent with basalt the moment it arrives', !!lipEvent && Math.abs(lipEvent.time - scene.arrivesMyr) < SNAPSHOT_MYR + 1e-6 && lipEvent.data.onLand,
        lipEvent ? `${lipEvent.time.toFixed(0)} Myr: ${lipEvent.text}` : 'no LIP');
    const lip = cellsWhere(numCells, w => last.volcType[w] === VolcanicType.LIP && last.owner[w] >= 0);
    const smallest = 1e6 * cfg.lipAreaMinMkm2 / cellAreaKm2, largest = 1e6 * cfg.lipAreaMaxMkm2 / cellAreaKm2;
    const onLand = lip.filter(w => continental(last, w)).length;
    // lobed and ragged, like a craton — not a disc (developer)
    const c = normalize(lip.reduce((s, w) => [s[0] + xyz[3 * w], s[1] + xyz[3 * w + 1], s[2] + xyz[3 * w + 2]], [0, 0, 0])), lipSet = new Set(lip);
    const rim = lip.filter(w => { for (let k = adjOffset[w]; k < adjOffset[w + 1]; k++) if (!lipSet.has(adjList[k])) return true; return false; }).map(w => kmBetween(pos(w), c));
    const spread = Math.max(...rim) / Math.min(...rim);
    check('the province is lobed and ragged, not a disc', spread >= 1.4, `its edge lies ${Math.min(...rim).toFixed(0)}–${Math.max(...rim).toFixed(0)} km from its middle (${spread.toFixed(1)}×; a disc would be ~1.2×)`);
    check('…a province of the right size, and it rides on with the continent', lip.length >= 0.7 * smallest && lip.length <= 1.3 * largest && onLand >= 0.8 * lip.length,
        `${lip.length} LIP cells (${(lip.length * cellAreaKm2 / 1e6).toFixed(1)} Mkm², expected ${(smallest * cellAreaKm2 / 1e6).toFixed(1)}–${(largest * cellAreaKm2 / 1e6).toFixed(1)}); ${onLand} of them still on the continent at ${last.time} Myr`);
    // from the plume now, along volcanic crust only, back to the traps
    const here = mesh.index.nearest(H[0], H[1], H[2]), volcanic = new Set(cellsWhere(numCells, w => last.volcType[w] !== VolcanicType.NONE && last.owner[w] >= 0));
    const seen = new Set([here]);
    let reachesTraps = false;
    for (let queue = [here], i = 0; i < queue.length && !reachesTraps; i++) for (let k = adjOffset[queue[i]]; k < adjOffset[queue[i] + 1]; k++) {
        const nb = adjList[k];
        if (!volcanic.has(nb) || seen.has(nb)) continue;
        seen.add(nb); queue.push(nb);
        if (last.volcType[nb] === VolcanicType.LIP) reachesTraps = true;
    }
    check('then the tail draws an unbroken chain from the traps to where the plume is now', reachesTraps, reachesTraps ? `volcanic crust links the plume to the traps, ${kmBetween(H, pos(lip[0])).toFixed(0)} km away` : 'the chain is broken');
    const youngest = cellsWhere(numCells, w => volcanic.has(w)).reduce((best, w) => (last.volcAt[w] > last.volcAt[best] ? w : best), here);
    check('…youngest over the plume', kmBetween(pos(youngest), H) < 1.5 * edgeKm, `the most recent eruption is ${kmBetween(pos(youngest), H).toFixed(0)} km from the plume`);
    check('a continent too small to split is only scarred, not rifted', !r.events.some(e => e.kind === EventKind.RIFT), `${r.events.filter(e => e.kind === EventKind.RIFT).length} rifts`);
}

section('plumes favour insulated mantle — but not only');
{
    // the sampler itself, on the start world with the mantle under the supercontinent fully insulated
    const { world } = buildStartWorld(mesh, SEED);
    for (const p of world.plates) p.refreshExtent(xyz);
    resolve(world);
    let land = 0;
    for (let w = 0; w < numCells; w++) {
        const o = world.owner[w], t = o >= 0 ? world.plates[o].crust.type[world.ownerCell[w]] : -1;
        world.mantleHeat[w] = t === CrustType.CONTINENT || t === CrustType.CRATON ? 1 : 0;
        land += world.mantleHeat[w];
    }
    const rng = makeRng(99);
    let under = 0;
    const draws = 3000;
    for (let i = 0; i < draws; i++) if (world.mantleHeat[pickPlumeSite(world, rng)] === 1) under++;
    const landShare = land / numCells, share = under / draws;
    check('a new plume favours the mantle under a continent, strongly but not absolutely', share > landShare + 0.2 && share < 0.92,
        `${(100 * share).toFixed(0)} % of plumes rise under continent, which covers ${(100 * landShare).toFixed(0)} % of the planet`);

    const r = run('history'), { last, frames } = r, lips = r.events.filter(e => e.kind === EventKind.LIP);
    const traps = lips.filter(e => e.data.onLand).length, plateaus = lips.filter(e => !e.data.onLand).length;
    check('over a history, heads rise under continents and under open ocean', traps >= 2 && plateaus >= 2, `${traps} traps on land, ${plateaus} plateaus at sea, from ${lips.length} plume heads`);
    check('some 10–20 plumes are live at a time, as on Earth', last.hotspots.length >= 6 && last.hotspots.length <= 24, `${last.hotspots.length} live plumes at ${last.time} Myr`);
    let was = 0, nWas = 0, never = 0, nNever = 0;
    for (let w = 0; w < numCells; w++) {
        if (continental(last, w)) continue;
        if (continental(frames[0], w)) { was += last.mantleHeat[w]; nWas++; } else { never += last.mantleHeat[w]; nNever++; }
    }
    const heatWas = was / nWas / 255, heatNever = never / nNever / 255;
    check('the mantle remembers where the supercontinent was', heatWas > 1.5 * heatNever, `mean heat at ${last.time} Myr where the supercontinent sat but is now ocean: ${heatWas.toFixed(2)}; where there was never continent: ${heatNever.toFixed(2)}`);
    const plumeRifts = r.events.filter(e => e.kind === EventKind.RIFT && e.data.cause === 'plume').length, rifts = r.events.filter(e => e.kind === EventKind.RIFT).length;
    check('plume heads add to rifting, but do not become a second rift machine', plumeRifts >= 1 && plumeRifts <= 4 && rifts <= 14, `${rifts} rifts in ${last.time} Myr, ${plumeRifts} of them by a plume head`);
    check('no gaps', frames.every(f => frameTallies(f).gaps === 0), 'every frame');
}

section('the plumes of 6a and of 7a are one and the same');
{
    const r = run('history', { plumeRiftChance: 1 });
    const plumeRifts = r.events.filter(e => e.kind === EventKind.RIFT && e.data.cause === 'plume');
    // (a head under a piece of continent too young to rift waits for it — plumeRiftWaitMyr; its LIP erupts on arrival)
    const wait = TECTONICS.plumeRiftWaitMyr;
    const matched = plumeRifts.filter(rift => r.events.some(e => e.kind === EventKind.LIP && e.data.hotspot === rift.data.hotspot && rift.time - e.time > -1e-6 && rift.time - e.time < wait + 1e-6));
    check('a plume head that splits a continent is the same plume that floods it with basalt', plumeRifts.length >= 1 && matched.length === plumeRifts.length,
        `${plumeRifts.length} plume rifts (every head allowed to split); ${matched.length} of them erupted their own LIP when it arrived, at most ${wait} Myr before the rift`);
    const b = run('history', { plumeRiftChance: 1 });                       // (a replay of r)
    check('the same seed replays the same history', r.events.length === b.events.length && r.events.every((e, i) => e.text === b.events[i].text) && r.frames.at(-1).owner.every((o, w) => o === b.frames.at(-1).owner[w]), `${r.events.length} events and the final world, identical`);
}

section('lab');
await checkLabPhaseLoads('../../js/app/phases/phase7-hotspots.js', mesh, LAB_MESH_SEED, HOTSPOT_SCENES.map(s => ({ scene: s.id })));

finish('Phase 7a');
