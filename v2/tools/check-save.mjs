// The planet file (plans/V2_SAVE_LOAD_PLAN.md), checked headlessly: a small history and a detailed moment of it (as the
// page builds them: the history as the worker records it, the moment as finish-worker.js sends it), saved to a planet
// file and read back — every frame, every field, every array of the moment, bit for bit (−0 and NaN too) — half the
// frames saved as the page keeps them (PackedFrame) and half plain, as Node runs them. The file is written to
// v2/out/check-save.orogen (any unzip tool should open it).
//
//   node v2/tools/check-save.mjs [--sim 10000] [--len 200] [--cells 160000] [--width 1024] [--seed 4242]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Delaunator from 'delaunator';
import { setDelaunator } from '../../js/sphere-mesh.js';
import { buildSimMesh } from '../js/core/sim-mesh.js';
import { runHistory } from '../js/app/history-runner.js';
import { TERRAIN_SCENES } from '../js/tectonics/scenarios/terrain-scenes.js';
import { TerrainPool, FRAME_FIELDS } from '../js/terrain/terrain-pool.js';
import { finishPlanet, finishRaster } from '../js/finish/finish.js';
import { packFrame, PackedFrame } from '../js/tectonics/frame-pack.js';
import { savePlanet, readPlanet, planetBytes } from '../js/save/planet-file.js';
import { encodeTree, decodeTree, binPieces, allocArrays, arrayFiller } from '../js/save/tree-codec.js';

setDelaunator(Delaunator);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? Number(process.argv[i + 1]) : d; };
const SIM = arg('--sim', 10000), LEN = arg('--len', 200), CELLS = arg('--cells', 160000), W = arg('--width', 1024), SEED = arg('--seed', 4242);
const t0 = performance.now(), secs = () => `${((performance.now() - t0) / 1000).toFixed(1)} s`;
let failures = 0;
const check = (ok, what) => { if (!ok) { failures++; console.log(`  ✗ ${what}`); } return ok; };

/** The first difference between two trees, or null: typed arrays by their bytes, numbers as Object.is (−0, NaN). */
function differ(a, b, at = '') {
    if (ArrayBuffer.isView(a) || ArrayBuffer.isView(b)) {
        if (!ArrayBuffer.isView(a) || !ArrayBuffer.isView(b) || a.constructor !== b.constructor || a.length !== b.length) return `${at}: ${a?.constructor?.name}(${a?.length}) vs ${b?.constructor?.name}(${b?.length})`;
        const x = new Uint8Array(a.buffer, a.byteOffset, a.byteLength), y = new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
        for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return `${at}: byte ${i} differs`;
        return null;
    }
    if (typeof a === 'number' || typeof b === 'number') return Object.is(a, b) ? null : `${at}: ${a} vs ${b}`;
    if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return a === b ? null : `${at}: ${String(a)} vs ${String(b)}`;
    if (a instanceof Map || b instanceof Map) {
        if (!(a instanceof Map && b instanceof Map) || a.size !== b.size) return `${at}: Map sizes`;
        for (const [k, v] of a) { const d = differ(v, b.get(k), `${at}.get(${k})`); if (d) return d; }
        return null;
    }
    if (Array.isArray(a) !== Array.isArray(b)) return `${at}: array vs object`;
    const ka = Object.keys(a), kb = Object.keys(b);
    if (ka.length !== kb.length || ka.some(k => !Object.prototype.hasOwnProperty.call(b, k))) return `${at}: keys ${ka.sort().join(',')} vs ${kb.sort().join(',')}`;
    for (const k of ka) { const d = differ(a[k], b[k], `${at}.${k}`); if (d) return d; }
    return null;
}

// ── the codec alone: the awkward values ──
{
    const shared = new Float32Array([1, -0, NaN, Infinity]);
    const tree = { n: [0, -0, NaN, Infinity, -Infinity, 1.5e-300], u: [undefined, null], o: { $a: 3 }, m: new Map([['k', new Int16Array([-2, 7])]]),
        s: new Set([1, 'two']), twice: [shared, shared], empty: new Uint8Array(0), odd: new Uint8Array([1, 2, 3]), f64: new Float64Array([Math.PI]), str: 'ünïcødé', missing: undefined };
    const e = encodeTree(tree), arrays = allocArrays(e.specs), fill = arrayFiller(e.specs, arrays);
    for (const p of binPieces(e)) for (let o = 0; o < p.length; o += 5) fill.push(p.subarray(o, o + 5));     // (pieces cut anywhere)
    fill.done();
    const back = decodeTree(JSON.parse(e.json), arrays), d = differ(tree, back);
    check(!d, `the codec's awkward values come back (${d})`);
    check(back.twice[0] === back.twice[1], 'an array met twice comes back as one');
    let threw = false; try { encodeTree({ bad: new Date() }); } catch { threw = true; }
    check(threw, 'a class instance stops the save');
}
console.log(`codec ✓ (${secs()})`);

// ── a history, as the page's worker records it ──
const simMesh = buildSimMesh(SIM, 12345), scene = TERRAIN_SCENES.find(s => s.id === 'cycle');
const run = await runHistory({ list: 'terrain', scene, ending: 'none', start: { continentalFraction: 0.3 }, lengthMyr: LEN, keep: false }, simMesh, SEED, 10);
// (half the frames as the page keeps them: packed, as the worker sends them)
const frames = run.frames.map((f, i) => (i % 2 ? new PackedFrame(structuredClone(packFrame(f).packed)) : f));
console.log(`history: ${frames.length} frames to ${frames.at(-1).time} Myr at ${SIM} plates, ${run.steps} steps (${secs()})`);

// ── a detailed moment of it, as finish-worker.js sends it ──
const moment = frames[Math.floor(frames.length / 2)];
const slim = Object.fromEntries(FRAME_FIELDS.map(k => [k, moment[k]]));
slim.plates = moment.plates.map(p => p && { quat: p.quat });
const pool = await TerrainPool.create(simMesh);
const out = await finishPlanet({ frame: slim, simMesh, seed: SEED, cells: CELLS, pool, closePool: true });
const raster = finishRaster(out.mesh, out.z, out.ocean, W, null, out.lake, out.lakeLevel, out.climate.cell);
const climate = { ...out.climate.page, raster: raster.climate };
delete raster.climate;
const fin = structuredClone({ cells: CELLS, raster, rivers: out.rivers, climate, stats: out.stats, secs: 12.5, climateKey: '0|0' });
fin.paths = new Map([['a cache', 1]]);                      // (a view's cache: never saved)
console.log(`detailed moment: ${moment.time} Myr at ${CELLS} cells, ${W} px (${secs()})`);

// ── saved, and read back ──
const settings = { seed: SEED, cont: 30, len: LEN, ending: 'none', sim: SIM, terrain: 160000, greenhouse: 0, rain: 0, more: 0 };
let t = performance.now();
const { blob, bytes } = await savePlanet({ settings, history: { frames, simMesh, simMyr: run.time, steps: run.steps, stopped: run.stopped, snapshotMyr: 10 }, detail: { frame: moment, fin } });
const saveMs = performance.now() - t;
const file = path.join(ROOT, 'v2', 'out', 'check-save.orogen');
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, Buffer.from(await blob.arrayBuffer()));
console.log(`saved: ${(bytes / 2 ** 20).toFixed(1)} MB → ${(blob.size / 2 ** 20).toFixed(1)} MB file in ${(saveMs / 1000).toFixed(1)} s (estimate before saving ${(planetBytes(frames, fin) / 2 ** 20).toFixed(1)} MB) → ${path.relative(ROOT, file)}`);
t = performance.now();
const back = await readPlanet(new Blob([fs.readFileSync(file)]));
console.log(`read back in ${((performance.now() - t) / 1000).toFixed(1)} s`);

// ── compared ──
check(back.manifest.history.frames === frames.length && back.frames.length === frames.length, 'every frame is in the file');
check(!differ(back.mesh.xyz, simMesh.xyz), 'the plate mesh comes back');
const metaOf = f => (f._packed ? Object.fromEntries(Object.keys(f).map(k => [k, f[k]])) : packFrame(f).packed.meta);
let frameDiff = null;
for (let i = 0; i < frames.length && !frameDiff; i++) {
    const a = frames[i], b = new PackedFrame(back.frames[i]);
    frameDiff = differ(metaOf(a), back.frames[i].meta, `frame ${i} meta`);
    for (const k of Object.keys(back.frames[i].fields)) if (!frameDiff) frameDiff = differ(a[k], b[k], `frame ${i}.${k}`);
    if (!frameDiff && Object.keys(back.frames[i].fields).length !== Object.keys(a._packed ?? packFrame(a).packed.fields).length) frameDiff = `frame ${i}: fields missing`;
}
check(!frameDiff, `every frame comes back bit for bit (${frameDiff})`);
check(back.detail?.frame === frames.indexOf(moment), 'the detailed moment is the same frame');
const { paths, ...own } = fin, momentDiff = differ(own, back.detail.moment, 'moment');
check(!momentDiff, `the detailed moment comes back bit for bit (${momentDiff})`);
check(!('paths' in back.detail.moment), 'the views\' caches are not saved');
check(back.manifest.detail.time === moment.time && back.manifest.settings.seed === SEED, 'the manifest says what it holds');

console.log(failures ? `\n${failures} check(s) failed (${secs()})` : `\nall checks pass (${secs()})`);
process.exit(failures ? 1 : 0);
