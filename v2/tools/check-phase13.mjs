// Headless acceptance checks for Phase 13 (the supercontinent cycle — plans/V2_ROADMAP_PHASES_9_13.md): the start world's
// supercontinent breaks up in a burst of rifts, its pieces disperse and keep apart, and around 600 Myr they gather into a
// new supercontinent — one cohesive mass, not continents strung together — which holds a while and then breaks up in its
// turn. Also the round that followed the developer's first look: open-ocean island arcs stay narrow chains, and about
// half the land is lowland. Three seeds, the lab's 1200 Myr scene ("The supercontinent cycle", every rule on).
// Usage: node v2/tools/check-phase13.mjs

import { check, section, finish, labMesh } from './lib/check-kit.mjs';
import { simulate } from '../js/tectonics/simulate.js';
import { TERRAIN_SCENES } from '../js/tectonics/scenarios/terrain-scenes.js';
import { EventKind } from '../js/tectonics/model/world.js';
import { CrustType, CrustFlag, VolcanicType } from '../js/tectonics/model/crust.js';
import { MECHANISMS, TECTONICS } from '../js/tectonics/config.js';
import { ENDINGS, inStage, historyEnding, framesEnding } from '../js/tectonics/ending.js';
import { spreadKm } from '../js/core/min-heap.js';
import { hopDistance } from '../js/core/mesh-bfs.js';
import { synthesizeTerrain, hypsometry } from '../js/terrain/synthesize.js';
import { terrainMesh } from '../js/terrain/terrain-mesh.js';

const SEEDS = [12345, 777, 4242];
const CLUMP_MYR = TECTONICS.riftMinGapMyr + 30;     // (a landmass holding most of the crust while the pieces disperse must come apart within this)
const mesh = labMesh(), n = mesh.numCells, cellKm2 = mesh.cellAreaKm2;
const scene = TERRAIN_SCENES.find(s => s.id === 'cycle');

/** Connected groups of the cells in a set. */
function comps(inSet) {
    const id = new Int32Array(n).fill(-1), out = [];
    for (let w = 0; w < n; w++) {
        if (!inSet(w) || id[w] >= 0) continue;
        const q = [w]; id[w] = out.length;
        for (let i = 0; i < q.length; i++) for (let k = mesh.adjOffset[q[i]]; k < mesh.adjOffset[q[i] + 1]; k++) { const nb = mesh.adjList[k]; if (inSet(nb) && id[nb] < 0) { id[nb] = out.length; q.push(nb); } }
        out.push(q);
    }
    return out;
}

/**
 * The largest landmass of a frame kept as {cont, ocean} bitmaps: its thinness (its deepest point from the coast ÷ the
 * radius of a disc of its area — a disc 1, a ring or a snake ≪ 1) and the largest sea it closes in (ocean floor km²:
 * seas are the groups of non-continental cells other than the world ocean; one it borders counts).
 */
function shapeOf({ cont, ocean }) {
    const land = comps(w => cont[w] === 1).sort((a, b) => b.length - a.length)[0] ?? [];
    const inLand = new Uint8Array(n); for (const w of land) inLand[w] = 1;
    const inland = new Float32Array(n); for (let w = 0; w < n; w++) inland[w] = cont[w] ? Infinity : 0;
    spreadKm(mesh, inland, {});
    let deep = 0; for (const w of land) deep = Math.max(deep, inland[w]);
    const A = land.length * cellKm2, seas = comps(w => cont[w] === 0).sort((a, b) => b.length - a.length).slice(1);
    let seaKm2 = 0;
    for (const c of seas) {
        let borders = false;
        for (const w of c) { for (let k = mesh.adjOffset[w]; k < mesh.adjOffset[w + 1] && !borders; k++) if (inLand[mesh.adjList[k]]) borders = true; if (borders) break; }
        if (borders) seaKm2 = Math.max(seaKm2, c.reduce((s, w) => s + (ocean[w] ? cellKm2 : 0), 0));
    }
    return { thin: deep / Math.sqrt(A / Math.PI), seaKm2, areaMkm2: A / 1e6 };
}

/** Continental crust no belt (current or overprinted), rift margin, failed rift or flood basalt has touched. */
function untouched(f) {
    const cont = w => f.owner[w] >= 0 && (f.type[w] === CrustType.CONTINENT || f.type[w] === CrustType.CRATON);
    const still = w => cont(w) && !f.oroType[w] && !f.prevType[w] && !(f.flags[w] & (CrustFlag.RIFT_MARGIN | CrustFlag.FAILED_RIFT)) && f.volcType[w] !== VolcanicType.LIP;
    let total = 0, calm = 0;
    for (let w = 0; w < n; w++) if (cont(w)) { total++; if (still(w)) calm++; }
    const biggest = Math.max(0, ...comps(still).map(c => c.length));
    return { share: calm / Math.max(1, total), patchMkm2: biggest * cellKm2 / 1e6 };
}

/**
 * Island arcs: the arc crust over 1500 km from any continent, and the largest open-ocean arc landmass — one lying on
 * average over 1000 km from any continent (arc crust accreted along a continent's margin is not an island arc at sea) (Mkm²).
 */
function arcsOf(f) {
    const arc = w => f.owner[w] >= 0 && f.type[w] === CrustType.ARC;
    const d = hopDistance(mesh, w => f.owner[w] >= 0 && (f.type[w] === CrustType.CONTINENT || f.type[w] === CrustType.CRATON)), km = w => d[w] < 0 ? 1e4 : d[w] * mesh.edgeKm;
    let far = 0; for (let w = 0; w < n; w++) if (arc(w) && km(w) > 1500) far++;
    const open = comps(arc).filter(c => c.reduce((s, w) => s + km(w), 0) / c.length > 1000);
    return { largest: Math.max(0, ...open.map(c => c.length)) * cellKm2 / 1e6, far: far * cellKm2 / 1e6 };
}

const tm = terrainMesh(160000);

function run(seed, overrides = {}, { terrain = true } = {}) {
    const world = scene.build(mesh, seed);
    Object.assign(world.config, overrides);
    const kept = [], arcs = [];
    let calm = null, lowland = null, land0 = null, land1200 = null, cont0 = 0, cont1200 = 0, largestPlate = 0;
    const plateCounts = [];
    const started = performance.now();
    // (each step: the longest any piece big enough to rift has gone without a rift, a weld, or growing that big — step/rifting.js)
    let oldestPiece = 0;
    const drive = w => {
        scene.drive(w);
        for (const p of w.plates) if (p.alive && !p.isBackground && p.stats.continentalCells * w.mesh.cellAreaKm2 >= w.config.riftMinContinentKm2) oldestPiece = Math.max(oldestPiece, w.time - Math.max(p.born, p.bigSince ?? w.time));
    };
    simulate(world, { untilMyr: scene.maxMyr, drive, snapshotEveryMyr: 10, onFrame: f => {
        const cont = new Uint8Array(n), ocean = new Uint8Array(n);
        for (let w = 0; w < n; w++) { if (f.owner[w] < 0) continue; const t = f.type[w]; if (t === CrustType.CONTINENT || t === CrustType.CRATON) cont[w] = 1; else if (t === CrustType.OCEAN) ocean[w] = 1; }
        const sizes = comps(w => cont[w] === 1).map(c => c.length), total = sizes.reduce((x, y) => x + y, 0);
        // (the share as the cycle counts it — necks under cycleNeckKm do not join — and, for the switched-off run, which
        // counts nothing, joined by any land)
        kept.push({ time: f.time, share: f.cycle ? f.cycle.share : total ? Math.max(...sizes) / total : 0, phase: f.cycle?.phase, cont, ocean });
        if (f.time % 200 === 0 && f.time > 0) arcs.push(arcsOf(f));
        // (the plates as the world view holds them: the largest one's share, and how many hold ≥ 1 % of the planet — once
        // the start world's supercontinent, one plate with its ocean by design, has broken up)
        if (f.time >= 100) {
            const per = new Map();
            for (let w = 0; w < n; w++) { const o = f.owner[w]; if (o >= 0 && !f.plates[o]?.isBackground) per.set(o, (per.get(o) ?? 0) + 1); }
            largestPlate = Math.max(largestPlate, Math.max(0, ...per.values()) / n);
            plateCounts.push([...per.values()].filter(c => c >= 0.01 * n).length);
        }
        if (f.time === 0) cont0 = cont.reduce((s, v) => s + v, 0);
        if (Math.abs(f.time - scene.maxMyr) < 1e-6) cont1200 = cont.reduce((s, v) => s + v, 0);
        if (terrain && (f.time === 0 || Math.abs(f.time - scene.maxMyr) < 1e-6)) { const share = hypsometry(synthesizeTerrain(f, mesh, tm, { seed }).heightKm).landShare; if (f.time === 0) land0 = share; else land1200 = share; }
        if (Math.abs(f.time - 600) < 1e-6) calm = untouched(f);
        if (terrain && (Math.abs(f.time - 600) < 1e-6 || Math.abs(f.time - scene.maxMyr) < 1e-6)) lowland = (lowland ?? 0) + hypsometry(synthesizeTerrain(f, mesh, tm, { seed }).heightKm).below400 / 2;
    } });
    const ev = world.events;
    const supers = ev.filter(e => e.kind === EventKind.SUPERCONTINENT).map(e => e.time), broken = ev.filter(e => e.kind === EventKind.DISPERSED).map(e => e.time);
    const rifts = ev.filter(e => e.kind === EventKind.RIFT);
    // the pace (developer, 2026-10-01): the world's gaps between rifts, each piece's age when it rifted, and how the start's
    // breakup gets going — rifts within 100 Myr of the first
    const times = rifts.map(e => e.time), worldGap = Math.min(Infinity, ...times.slice(1).map((t, i) => t - times[i]));
    const pieceAge = Math.min(Infinity, ...rifts.map(e => e.data.ageMyr ?? Infinity)), early = times.filter(t => t <= (times[0] ?? 0) + 100).length;
    // dispersal: the lowest share between the first rift and the next supercontinent; and the most any landmass held
    // for 30 Myr (three frames running) while the pieces were dispersing
    const reassembled = supers.find(t => t > 0), lowest = Math.min(...kept.filter(k => k.time >= (rifts[0]?.time ?? 0) && k.time <= (reassembled ?? scene.maxMyr)).map(k => k.share));
    const disp = kept.filter(k => k.phase === 'dispersing');
    // (over CLUMP_MYR — the per-piece wait, riftMinGapMyr, and 30 Myr more: the piece a breakup leaves holding most of the
    // crust may not rift again sooner)
    let clump = 0;
    const span = Math.round(CLUMP_MYR / 10);
    for (let i = 0; i + span < disp.length; i++) if (disp[i + span].time - disp[i].time <= CLUMP_MYR + 1e-6) clump = Math.max(clump, Math.min(...disp.slice(i, i + span + 1).map(d => d.share)));
    // the reassembled supercontinent at its fullest, before it breaks up again
    const againAt = broken.find(t => reassembled !== undefined && t > reassembled);
    const held = reassembled === undefined ? [] : kept.filter(k => k.time >= reassembled - 30 && k.time <= (againAt ?? scene.maxMyr));
    const fullest = held.reduce((b, k) => (!b || k.share > b.share ? k : b), null);
    const weak = rifts.reduce((s, e) => s + (e.data.weakKm ?? 0), 0) / Math.max(1, rifts.reduce((s, e) => s + e.data.lengthKm, 0));
    return { seed, secs: (performance.now() - started) / 1000, supers, broken, rifts: rifts.length, worldGap, pieceAge, oldestPiece, early, lowest, clump, reassembled, againAt,
        fullest: fullest && { time: fullest.time, share: fullest.share, ...shapeOf(fullest) }, weak, calm, lowland, land0, land1200, contRatio: cont1200 / Math.max(1, cont0),
        arcBiggest: Math.max(0, ...arcs.map(a => a.largest)), arcFar: Math.max(0, ...arcs.map(a => a.far)),
        largestPlate, platesMean: plateCounts.reduce((x, y) => x + y, 0) / Math.max(1, plateCounts.length), platesMin: Math.min(...plateCounts),
        shares: kept.filter(k => k.time % 100 === 0).map(k => Math.round(100 * k.share)) };
}

section('the cycle, three seeds over 1200 Myr');
const rows = SEEDS.map(seed => run(seed));
const txt = f => rows.map(r => `${r.seed}: ${f(r)}`).join(' · ');
for (const r of rows) console.log(`    seed ${r.seed} (${r.secs.toFixed(0)} s): supercontinents at ${r.supers.map(t => t.toFixed(0)).join(', ')} Myr; broken up at ${r.broken.map(t => t.toFixed(0)).join(', ')}; ${r.rifts} rifts; largest landmass every 100 Myr ${r.shares.join(' ')} %`);

check('the start world is a supercontinent', rows.every(r => r.supers[0] === 0), txt(r => `first at ${r.supers[0]?.toFixed(0)} Myr`));
// (developer, 2026-10-01: breakups "way way too many … all at once" — each piece of continent its own clock, a floor for the world)
check(`…which breaks up at a pace: rifts ≥ ${TECTONICS.riftGlobalGapMyr} Myr apart, a piece rifting ≥ ${TECTONICS.riftMinGapMyr} Myr after its own last rift or weld, none big enough going over ${TECTONICS.riftMaxGapMyr} Myr without one, and ≥ 2 rifts within 100 Myr of the first`,
    rows.every(r => r.worldGap >= TECTONICS.riftGlobalGapMyr - 1e-6 && r.pieceAge >= TECTONICS.riftMinGapMyr - 1e-6 && r.oldestPiece <= TECTONICS.riftMaxGapMyr + 1e-6 && r.early >= 2),
    txt(r => `gaps ≥ ${r.worldGap.toFixed(0)}, pieces ≥ ${r.pieceAge.toFixed(0)} Myr old, the oldest ${r.oldestPiece.toFixed(0)} Myr, ${r.early} rifts in the first 100 Myr`));
check('the pieces disperse: the largest landmass falls to ≤ 40 % of the continental crust', rows.every(r => r.lowest <= 0.4), txt(r => `lowest ${(100 * r.lowest).toFixed(0)} %`));
// (developer, after the first look: "the supercontinent really shouldnt happen until like 600 [Myr] in")
check(`…and keep apart: while they disperse no landmass holds 70 % for ${CLUMP_MYR} Myr`, rows.every(r => r.clump < 0.7), txt(r => `the most held ${(100 * r.clump).toFixed(0)} %`));
check('around 600 Myr they gather into a new supercontinent (≥ 70 %, held 30 Myr; 550–800 Myr)', rows.every(r => r.reassembled >= 550 && r.reassembled <= 800), txt(r => r.reassembled !== undefined ? `at ${r.reassembled.toFixed(0)} Myr` : 'never'));
check('…which holds a while (≥ 80 Myr) and breaks up in its turn', rows.every(r => r.againAt !== undefined && r.againAt - r.reassembled >= 80),
    txt(r => r.againAt !== undefined ? `broken up at ${r.againAt.toFixed(0)} Myr, ${(r.againAt - r.reassembled).toFixed(0)} Myr on` : 'not by 1200 Myr'));
check('about half of the rift length follows old sutures, failed rifts and rifted margins (40–65 %)', rows.every(r => r.weak >= 0.4 && r.weak <= 0.65), txt(r => `${(100 * r.weak).toFixed(0)} %`));
// (developer: "The idea is they combine into a cohesive landmass, not a big snaking land")
check('the new supercontinent is one mass: ≥ 75 % of the continental crust with necks under 800 km not counted', rows.every(r => r.fullest && r.fullest.share >= 0.75),
    txt(r => r.fullest ? `${(100 * r.fullest.share).toFixed(0)} % at ${r.fullest.time} Myr (${r.fullest.areaMkm2.toFixed(0)} Mkm² joined by any land)` : '—'));
check('…compact (thinness ≥ 0.5)', rows.every(r => r.fullest && r.fullest.thin >= 0.5), txt(r => r.fullest ? `${r.fullest.thin.toFixed(2)}` : '—'));
check('…and closes in no sea over 3 Mkm²', rows.every(r => r.fullest && r.fullest.seaKm2 <= 3e6), txt(r => r.fullest ? `largest ${(r.fullest.seaKm2 / 1e6).toFixed(1)} Mkm²` : '—'));
check('untouched land at 600 Myr: ≤ 25 % of the continental crust, no untouched patch over 8 Mkm²', rows.every(r => r.calm && r.calm.share <= 0.25 && r.calm.patchMkm2 <= 8),
    txt(r => r.calm ? `${(100 * r.calm.share).toFixed(0)} %, largest ${r.calm.patchMkm2.toFixed(1)} Mkm²` : '—') + ' (before Phase 13: 30–46 %, 10–18 Mkm²)');

section('island arcs and lowlands');
// (developer: ocean–ocean arcs far from any continent were "just getting huge unaturally" — the largest reached 15–16 Mkm²,
// 8–15 Mkm² of arc crust stood over 1500 km from any continent)
check('open-ocean arcs stay chains: arc crust over 1500 km from any continent ≤ 5 Mkm², the largest open-ocean arc landmass ≤ 3 Mkm² (every 200 Myr; in the terrain a submerged ridge its volcanoes break through)',
    rows.every(r => r.arcFar <= 5 && r.arcBiggest <= 3), txt(r => `at most ${r.arcFar.toFixed(1)} Mkm² far out, largest ${r.arcBiggest.toFixed(1)} Mkm²`));
// (developer: "a ton of the land it above 400m" — 18–26 % below 400 m over 600–1200 Myr before; then, seeing ~40–47 %,
// "a bit too flat … like 40% usually is a sweeter spot", with the rivers still to cut it lower)
// (before the rivers carve it: they take it lower still — a reassembly's frame is the most mountainous of the cycle)
check('about a third to 40 % of the land is lowland before the rivers carve it (30–45 % below 400 m, the mean of 600 and 1200 Myr)', rows.every(r => r.lowland >= 0.30 && r.lowland <= 0.45), txt(r => `${(100 * r.lowland).toFixed(1)} %`));
// (developer: "the overall landmass … seems like we are decreasing over time. we should … keep it at least closer to flat")
check('the land holds over the history: continental crust at 1200 Myr within ±20 % of the start, the land above sea level not shrinking (≥ −1 point) and growing at most 6 points',
    rows.every(r => Math.abs(r.contRatio - 1) <= 0.2 && r.land1200 - r.land0 >= -0.01 && r.land1200 - r.land0 <= 0.06),
    txt(r => `continental crust ×${r.contRatio.toFixed(2)}, land ${(100 * r.land0).toFixed(1)} → ${(100 * r.land1200).toFixed(1)} %`) + ' (before: ×0.74–0.84, 27.9 → 25.0 % on seed 12345)');

section('living plates (plans/V2_REALISM_PASS_PLAN.md, phase 2)');
// (the recordings, 2026-10-18: with no boundary to found a trench on, a plate that held its continents and its whole ocean
// never broke up again — one plate held 79–100 % of the planet at some point in 5 of 6 histories, and a world froze as a
// single plate for 200 Myr; old margins inside a plate now founder too: step/subduction-init.js founderWithinPlates)
check('no plate holds most of the planet: the largest at most 60 % of it, at every moment from 100 Myr on',
    rows.every(r => r.largestPlate <= 0.6), txt(r => `largest ${(100 * r.largestPlate).toFixed(0)} %`) + ' (before: up to 100 %)');
check('…and the world keeps several plates: at least 6 holding ≥ 1 % of the planet on average, never fewer than 3',
    rows.every(r => r.platesMean >= 6 && r.platesMin >= 3), txt(r => `${r.platesMean.toFixed(1)} on average, at least ${r.platesMin}`));

section('the switches');
{
    // with the heat and the mantle flow switched off, the pieces are left to their trenches: the Phase 12 engine
    const off = run(12345, { ...MECHANISMS.mantleHeatRifts, ...MECHANISMS.mantleFlow }, { terrain: false });
    check('switched off (mantleHeatRifts, mantleFlow), seed 12345 runs as before them: no cycle tracked, no mantle flow',
        off.supers.length === 0, `${off.supers.length} supercontinent events; largest landmass every 100 Myr ${off.shares.join(' ')} %`);
}

section('choose your ending');
{
    // one history run on as far as a history may (1200 + endingExtraMyr): where each ending would stop it
    const seed = 12345, world = scene.build(mesh, seed), light = [];
    simulate(world, { untilMyr: scene.maxMyr + TECTONICS.endingExtraMyr, drive: w => scene.drive(w), snapshotEveryMyr: 10,
        onFrame: f => light.push({ time: f.time, cycle: f.cycle, events: f.events, owner: f.owner }) });
    const ends = ENDINGS.filter(e => e.id !== 'none').map(e => ({ ...e, frames: framesEnding(light, scene.maxMyr, e.id, TECTONICS) }));
    check('each ending is reached after 1200 Myr, within endingExtraMyr (seed 12345)', ends.every(e => e.frames),
        ends.map(e => `${e.id} at ${e.frames ? e.frames.at(-1).time.toFixed(0) + ' Myr' : 'never'}`).join(' · '));
    check('…and the last frame is in that stage (the cycle as the lab shows it)', ends.every(e => e.frames && inStage(e.frames.at(-1), e.id, TECTONICS)),
        ends.map(e => `${e.id}: largest landmass ${e.frames ? (100 * e.frames.at(-1).cycle.share).toFixed(0) + ' %, ' + e.frames.at(-1).cycle.state : '—'}`).join(' · '));
    // a history run with an ending stops there — and is the same history up to it
    const pick = ends.filter(e => e.frames).sort((a, b) => a.frames.at(-1).time - b.frames.at(-1).time)[0];
    if (pick) {
        const w2 = scene.build(mesh, seed), { untilMyr, stopAt } = historyEnding(scene.maxMyr, pick.id, w2.config);
        const r = simulate(w2, { untilMyr, stopAt, drive: w => scene.drive(w), snapshotEveryMyr: 10 });
        const same = r.frames.length === pick.frames.length && r.frames.every((f, i) => f.time === pick.frames[i].time && f.owner.every((o, w) => o === pick.frames[i].owner[w]));
        check(`run with the ending "${pick.id}", the history stops there, and is the same history up to it`, r.stopped && same,
            `stopped at ${r.frames.at(-1).time.toFixed(0)} Myr (expected ${pick.frames.at(-1).time.toFixed(0)}); ${same ? 'every frame the same' : 'frames differ'}`);
    }
}

finish('Phase 13');
