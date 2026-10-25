/**
 * The Evolution's regression check: one Evolution world built and finished (Add detail) headless, as the page builds and
 * finishes it, and every output hashed — the heights, the sea, the lakes, the rivers and their years, the finished
 * climate — so a change to the code the Evolution shares (the finish, the climate) can be shown to leave the Evolution
 * as it was, or to change only what it should.
 *
 *   node tuning/evolution/regress.mjs <out.json> [--seed 10673275] [--sim 40000] [--time 300] [--cells 250000]
 *                                     [--set key=value,…]
 *   node tuning/evolution/regress.mjs --compare <before.json> <after.json>
 *
 * --set overrides the finish's constants (FINISH) — what a rule Generate turns on (js/water-new.js WATER) would change
 * in the Evolution: --compare against a run without it, and the lakes and the rivers' regimes it prints.
 *
 * The baseline comes from the code before the change: a worktree of that commit (git worktree add <dir> <commit>, its
 * node_modules linked to this checkout's), its copy of this script run with the same options; then this checkout's, and
 * --compare (exit code 1 when anything differs). The world's history is cached under tuning/evolution/data/
 * (gitignored), per seed, plates and length: the history is the tectonics, which a change to the finish or the climate
 * does not touch.
 */

import fs from 'node:fs';
import path from 'node:path';
import v8 from 'node:v8';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import Delaunator from 'delaunator';
import { setDelaunator } from '../../js/sphere-mesh.js';
import { buildSimMesh } from '../../v2/js/core/sim-mesh.js';
import { runHistory } from '../../v2/js/app/history-runner.js';
import { TERRAIN_SCENES } from '../../v2/js/tectonics/scenarios/terrain-scenes.js';
import { TerrainPool, FRAME_FIELDS } from '../../v2/js/terrain/terrain-pool.js';
import { finishPlanet } from '../../v2/js/finish/finish.js';
import { FINISH } from '../../v2/js/finish/finish-config.js';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };

if (process.argv[2] === '--compare') {
    const [a, b] = [process.argv[3], process.argv[4]].map(f => JSON.parse(fs.readFileSync(f, 'utf8')));
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort(), diff = keys.filter(k => a[k] !== b[k]);
    console.log(`${keys.length} outputs; ${diff.length ? `${diff.length} differ:` : 'all identical'}`);
    for (const k of diff.slice(0, 40)) console.log(`  ${k}: ${a[k] ?? '—'} → ${b[k] ?? '—'}`);
    process.exit(diff.length ? 1 : 0);
}

const OUT = process.argv[2];
if (!OUT || OUT.startsWith('--')) throw new Error('usage: node tuning/evolution/regress.mjs <out.json> [--seed …] | --compare <a.json> <b.json>');
const SEED = Number(arg('--seed', 10673275)), CONT = Number(arg('--cont', 30)), SIM = Number(arg('--sim', 40000));
const TIME = Number(arg('--time', 300)), CELLS = Number(arg('--cells', 250000));
const SET = Object.fromEntries((arg('--set', '') || '').split(',').filter(Boolean).map(kv => { const [k, v] = kv.split('='); return [k, v === 'true' ? true : v === 'false' ? false : Number(v)]; }));
for (const k of Object.keys(SET)) if (!(k in FINISH)) throw new Error(`--set: no constant ${k} in FINISH`);
const MESH_SEED = 12345;                                  // the page's: every planet's sim mesh is the same
const DATA = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data');
const t0 = performance.now(), log = (m) => console.error(`[${((performance.now() - t0) / 1000).toFixed(0)} s] ${m}`);
setDelaunator(Delaunator);

// ── the world's history to the moment, as the page runs it (its scene 'cycle', from its start), cached ──
fs.mkdirSync(DATA, { recursive: true });
const frameFile = path.join(DATA, `frame-${SEED}-${CONT}-${SIM}-${TIME}.bin`);
let frame;
if (fs.existsSync(frameFile)) frame = v8.deserialize(fs.readFileSync(frameFile)).frame;
else {
    const scene = TERRAIN_SCENES.find(s => s.id === 'cycle');
    let last = 0;
    await runHistory({ list: 'terrain', scene, ending: 'none', start: { continentalFraction: CONT / 100 }, lengthMyr: Math.ceil((TIME + 10) / 10) * 10, keep: false },
        buildSimMesh(SIM, MESH_SEED), SEED, 10, () => {}, f => {
            if (f.time - last >= 100) { last = f.time; log(`history ${f.time} Myr`); }
            if (Math.abs(f.time - TIME) < 1e-6) { frame = Object.fromEntries(FRAME_FIELDS.map(k => [k, f[k]])); frame.plates = f.plates.map(p => p && { quat: p.quat }); }
        });
    if (!frame) throw new Error(`no frame at ${TIME} Myr`);
    fs.writeFileSync(frameFile, v8.serialize({ frame }));
}
log(`history: seed ${SEED}, ${SIM.toLocaleString()} plate cells, ${TIME} Myr`);

// ── the finish (Add detail), as the page's worker runs it, with the page's default climate options ──
const simMesh = buildSimMesh(SIM, MESH_SEED), pool = await TerrainPool.create(simMesh);
const fin = await finishPlanet({ frame, simMesh, seed: SEED, cells: CELLS, pool, closePool: true, F: { ...FINISH, ...SET }, climateOptions: { greenhouseWm2: 0, precipScale: 1 } });
log(`finished at ${CELLS.toLocaleString()} cells${Object.keys(SET).length ? `, ${JSON.stringify(SET)}` : ''}`);
const w = fin.stats.water, reg = [0, 0, 0, 0];
for (const r of fin.rivers.regime) reg[r]++;
log(`lakes: ${w.freshLakes} fresh, ${w.saltLakes} salt, ${w.pans} pans, ${(100 * w.lakeShare).toFixed(2)} % of the land; ${(100 * w.toBasinsShare).toFixed(2)} % of the runoff to closed basins; `
    + `${w.points.toLocaleString()} river points: ${['steady', 'flood season', 'seasonal', 'dry most of the year'].map((k, i) => `${(100 * reg[i] / Math.max(1, w.points)).toFixed(1)} % ${k}`).join(', ')}`);

// ── every output: arrays by their hash, numbers and strings as they are ──
const hashes = {};
const visit = (prefix, o, depth = 0) => {
    for (const [k, v] of Object.entries(o)) {
        const name = prefix ? `${prefix}.${k}` : k;
        if (ArrayBuffer.isView(v)) hashes[name] = crypto.createHash('sha256').update(Buffer.from(v.buffer, v.byteOffset, v.byteLength)).digest('hex').slice(0, 16) + ` (${v.constructor.name}[${v.length}])`;
        else if (Array.isArray(v) && v.length && ArrayBuffer.isView(v[0])) v.forEach((a, i) => visit(`${name}[${i}]`, { a }, depth + 1));
        else if (v && typeof v === 'object' && depth < 4 && k !== 'mesh' && k !== 'ms') visit(name, v, depth + 1);
        else if (typeof v === 'number' || typeof v === 'string') hashes[name] = v;
    }
};
visit('', { z: fin.z, ocean: fin.ocean, lake: fin.lake, lakeLevel: fin.lakeLevel, rivers: fin.rivers, stats: fin.stats, climate: fin.climate });
fs.writeFileSync(OUT, JSON.stringify(hashes, null, 1) + '\n');
console.log(`${Object.keys(hashes).length} outputs → ${OUT}`);
process.exit(0);
