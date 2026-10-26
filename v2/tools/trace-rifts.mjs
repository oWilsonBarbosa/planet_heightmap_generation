// The rhythm of a history's breakups: the Evolution page's history (the 'cycle' scene, start world at 30 % continent) run
// headless, its continental rifts listed with the gaps between them (the world's) and the age of the piece that rifted (since
// its own last rift or weld — the per-piece rules: none under 30 Myr, forced at 150), the longest any piece big enough to
// rift went without one (and whether it was then pressed into a gathering supercontinent — exempt), and the supercontinent
// cycle's own events.
// Usage: node v2/tools/trace-rifts.mjs [simCells=20000] [seed …] [--len 1200] [--set key=value,…] [--json]

import { labMesh } from './lib/check-kit.mjs';
import { simulate } from '../js/tectonics/simulate.js';
import { TERRAIN_SCENES } from '../js/tectonics/scenarios/terrain-scenes.js';
import { EventKind } from '../js/tectonics/model/world.js';

const args = process.argv.slice(2), flag = k => { const i = args.indexOf(k); return i >= 0 ? args.splice(i, 2)[1] : null; };
const len = Number(flag('--len') ?? 1200), json = args.includes('--json'), set = flag('--set');
const overrides = set ? Object.fromEntries(set.split(',').map(kv => { const [k, v] = kv.split('='); return [k, Number(v)]; })) : {};
const nums = args.filter(a => a !== '--json').map(Number);
const cells = nums[0] || 20000, seeds = nums.length > 1 ? nums.slice(1) : [12345, 777, 4242];
const mesh = labMesh(cells), scene = TERRAIN_SCENES.find(s => s.id === 'cycle');

const all = [];
for (const seed of seeds) {
    const t0 = performance.now();
    const world = scene.build(mesh, seed, { continentalFraction: 0.3 });
    Object.assign(world.config, overrides);
    // (each step: the oldest piece big enough to rift on its own — outside a gathering landmass, and in one)
    let oldest = 0, oldestGathering = 0;
    const drive = w => {
        scene.drive(w);
        const gathering = w.cycle?.gather > 0 ? new Set(w.cycle.largestPlates ?? []) : null;
        for (const p of w.plates) {
            if (!p.alive || p.isBackground || p.stats.continentalCells * w.mesh.cellAreaKm2 < w.config.riftMinContinentKm2) continue;
            const a = w.time - Math.max(p.born, p.bigSince ?? w.time);       // (since it rifted, welded or grew big enough — step/rifting.js)
            if (gathering?.has(p.id)) oldestGathering = Math.max(oldestGathering, a); else oldest = Math.max(oldest, a);
        }
    };
    simulate(world, { untilMyr: len, drive, snapshotEveryMyr: 10 });
    const rifts = world.events.filter(e => e.kind === EventKind.RIFT).map(e => ({ t: e.time, cause: e.data.cause, age: e.data.ageMyr }));
    const ages = rifts.map(r => r.age).filter(a => a !== undefined && a < 1e5).sort((a, b) => a - b);
    const cycle = world.events.filter(e => e.kind === EventKind.SUPERCONTINENT || e.kind === EventKind.DISPERSED).map(e => ({ t: e.time, kind: e.kind }));
    const gaps = [];
    for (let i = 1; i < rifts.length; i++) gaps.push(rifts[i].t - rifts[i - 1].t);
    // (the quiet stretches, the start and the end of the history included)
    const quiet = [rifts.length ? rifts[0].t : len, ...gaps, len - (rifts.at(-1)?.t ?? 0)];
    // (the most rifts within any 30 Myr)
    let burst = 0;
    for (let i = 0; i < rifts.length; i++) { let k = i; while (k < rifts.length && rifts[k].t - rifts[i].t < 30) k++; burst = Math.max(burst, k - i); }
    const r = { seed, cells, len, secs: (performance.now() - t0) / 1000, rifts: rifts.length, under30: gaps.filter(g => g < 30).length, over150: quiet.filter(g => g > 150).length,
        minGap: gaps.length ? Math.min(...gaps) : null, medianGap: gaps.length ? [...gaps].sort((a, b) => a - b)[gaps.length >> 1] : null, maxQuiet: Math.max(...quiet), meanGap: gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : null, burst30: burst,
        pieceAgeMin: ages[0] ?? null, pieceAgeMedian: ages[ages.length >> 1] ?? null, pieceAgeMax: ages.at(-1) ?? null, oldestPiece: oldest, oldestGathering,
        times: rifts.map(x => Math.round(x.t) + (x.cause === 'plume' ? 'p' : x.cause === 'overdue' ? '!' : '')), cycle: cycle.map(c => `${c.kind === EventKind.SUPERCONTINENT ? 'S' : 'D'}${Math.round(c.t)}`) };
    all.push(r);
    if (json) console.log(JSON.stringify(r));
    else {
        console.log(`seed ${seed} (${cells / 1000}K, ${len} Myr, ${r.secs.toFixed(0)} s): ${r.rifts} rifts; gaps ${r.minGap?.toFixed(0)} min, ${r.medianGap?.toFixed(0)} median, ${r.meanGap?.toFixed(0)} mean; ${r.under30} under 30 Myr, ${r.over150} quiet stretches over 150 Myr (longest ${r.maxQuiet.toFixed(0)}); at most ${r.burst30} rifts in 30 Myr`);
        console.log(`   pieces: age at rift ${r.pieceAgeMin?.toFixed(0)} min, ${r.pieceAgeMedian?.toFixed(0)} median, ${r.pieceAgeMax?.toFixed(0)} max; the oldest piece big enough to rift: ${oldest.toFixed(0)} Myr (in a gathering landmass: ${oldestGathering.toFixed(0)})`);
        console.log(`   rifts: ${r.times.join(' ')}`);
        console.log(`   cycle: ${r.cycle.join(' ') || '—'}  (S supercontinent, D dispersed)`);
    }
}
if (!json && all.length > 1) {
    const sum = k => all.reduce((s, r) => s + r[k], 0);
    console.log(`all: ${sum('rifts')} rifts, ${sum('under30')} gaps under 30 Myr, ${sum('over150')} quiet stretches over 150 Myr, worst burst ${Math.max(...all.map(r => r.burst30))} in 30 Myr, longest quiet ${Math.max(...all.map(r => r.maxQuiet)).toFixed(0)} Myr`);
}
