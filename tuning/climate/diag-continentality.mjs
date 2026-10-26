/**
 * Continentality: the land's annual temperature range (warmest minus coldest month, per terrain cell, as the Köppen
 * classification sees it) against its latitude and its distance from the sea, the size of its landmass, and whether it
 * is a west or an east coast. On Earth, new vs observed (the 1° reference t2m); on an Evolution world, new vs what
 * Earth's observed land has in the same latitude × distance bin (written by the Earth run to
 * tuning/results/climate/continentality-earth.json).
 *
 *   node tuning/climate/diag-continentality.mjs [--planet earth|evolution] [--seed 12345] [--ending none]
 *                                               [--n 160000] [--root <snapshot>] [--set KEY=value,…]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadEarthGrayscale } from './lib/earth-context.mjs';
import { buildEarthMesh } from './lib/earth-mesh.mjs';
import { loadReferences } from './lib/ref.mjs';
import { elevToHeightKm } from '../../js/color-map.js';
import { planetClimate } from '../../v2/js/climate/climate.js';
import { setParams } from '../../v2/js/climate/config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '..', 'results', 'climate');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const argSet = process.argv.indexOf('--set');
if (argSet > 0) setParams(Object.fromEntries(process.argv[argSet + 1].split(',').map(kv => { const [k, v] = kv.split('='); return [k, +v]; })));
const PLANET = arg('--planet', 'evolution'), N = +arg('--n', 160000), SEED = +arg('--seed', 12345), ENDING = arg('--ending', 'none');
const ROOT = arg('--root', null);
const CORE = process.env.CORE ? JSON.parse(process.env.CORE) : {};
const R_KM = 6371;

// ── the planet ──
let xyz, elevKm, axes, adjOffset, adjList;
if (PLANET === 'earth') {
    const { gray, width, height } = loadEarthGrayscale();
    const e = buildEarthMesh(gray, width, height, { N });
    xyz = e.r_xyz; axes = 'y-up'; ({ adjOffset, adjList } = e.mesh);
    elevKm = new Float32Array(e.mesh.numRegions);
    for (let r = 0; r < elevKm.length; r++) elevKm[r] = elevToHeightKm(e.r_elevation[r]);
} else {
    const tag = ROOT ? 'root-' + path.basename(ROOT) : 'here';
    const file = path.join(OUT, 'cache', `evolution-${tag}-${SEED}-${ENDING}-${N}.f32`);
    const base = ROOT ? pathToFileURL(path.resolve(ROOT) + '/').href : new URL('../../', import.meta.url).href;
    const { default: Delaunator } = await import('delaunator');
    (await import(base + 'js/sphere-mesh.js')).setDelaunator(Delaunator);
    const { terrainMesh } = await import(base + 'v2/js/terrain/terrain-mesh.js');
    const tm = terrainMesh(N);
    if (fs.existsSync(file)) { const b = fs.readFileSync(file); elevKm = new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4); }
    else {
        console.log(`Building the Evolution world (seed ${SEED}, ending ${ENDING}, ${tag}) — about a minute, cached after…`);
        const { evolutionWorld } = await import(base + 'v2/js/climate-lab/evolution-world.js');
        elevKm = evolutionWorld({ seed: SEED, ending: ENDING, cells: N }).heightKm;
        fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, Buffer.from(elevKm.buffer, elevKm.byteOffset, elevKm.byteLength));
    }
    xyz = tm.xyz; axes = 'z-up'; ({ adjOffset, adjList } = tm);
}
const res = planetClimate({ xyz, elevKm, axes }, CORE);
const n = elevKm.length, { lat, lon, koppen } = res.cell, g = res.grid, G = g.size, T = res.months.T;
const land = (r) => koppen[r] > 0;

// ── each land cell's annual range: the 12 months bilinear from the grid, as the Köppen classification sees them ──
const range = new Float64Array(n).fill(NaN), obsRange = new Float64Array(n).fill(NaN);
const cold = new Float64Array(n).fill(NaN), warm = new Float64Array(n).fill(NaN), obsCold = new Float64Array(n).fill(NaN), obsWarm = new Float64Array(n).fill(NaN);
let lastLo = NaN, lastHi = NaN;
const rangeAt = (field, rg, la, lo) => {
    let lo_ = Infinity, hi = -Infinity;
    for (let m = 0; m < 12; m++) { const v = rg.sample(field, la, lo, m * rg.size); if (!(v === v)) return NaN; lo_ = Math.min(lo_, v); hi = Math.max(hi, v); }
    lastLo = lo_; lastHi = hi;
    return hi - lo_;
};
// (the model's months are at each grid cell's reference height, the observed at sea level-ish 1° means: compare ranges,
// and the coldest / warmest months only as departures from each cell's own annual mean)
for (let r = 0; r < n; r++) if (land(r)) { range[r] = rangeAt(T, g, lat[r], lon[r]); cold[r] = lastLo - (lastLo + lastHi) / 2; warm[r] = lastHi - (lastLo + lastHi) / 2; }
if (PLANET === 'earth') {
    const { grid: rg, fields } = loadReferences();
    for (let r = 0; r < n; r++) if (land(r)) { obsRange[r] = rangeAt(fields.t2m, rg, lat[r], lon[r]); obsCold[r] = lastLo; obsWarm[r] = lastHi; }
}
const modelMonths = (r) => { const v = []; for (let m = 0; m < 12; m++) v.push(g.sample(T, lat[r], lon[r], m * G)); return v; };

// ── distance from the sea along the mesh (km), and each landmass's area (km²) ──
const pos = (r) => [xyz[3 * r], xyz[3 * r + 1], xyz[3 * r + 2]];
const dist = new Float64Array(n).fill(Infinity);
{
    const heap = [];
    const push = (d, c) => { heap.push([d, c]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, rr = l + 1; let s = i; if (l < heap.length && heap[l][0] < heap[s][0]) s = l; if (rr < heap.length && heap[rr][0] < heap[s][0]) s = rr; if (s === i) break; [heap[s], heap[i]] = [heap[i], heap[s]]; i = s; } } return top; };
    // land cells next to the sea start at half an edge
    for (let r = 0; r < n; r++) {
        if (!land(r)) continue;
        const [x, y, z] = pos(r);
        for (let q = adjOffset[r]; q < adjOffset[r + 1]; q++) {
            const s = adjList[q]; if (land(s)) continue;
            const d = 0.5 * R_KM * Math.hypot(x - xyz[3 * s], y - xyz[3 * s + 1], z - xyz[3 * s + 2]);
            if (d < dist[r]) dist[r] = d;
        }
        if (dist[r] < Infinity) push(dist[r], r);
    }
    while (heap.length) {
        const [d, r] = pop(); if (d > dist[r]) continue;
        const [x, y, z] = pos(r);
        for (let q = adjOffset[r]; q < adjOffset[r + 1]; q++) {
            const s = adjList[q]; if (!land(s)) continue;
            const nd = d + R_KM * Math.hypot(x - xyz[3 * s], y - xyz[3 * s + 1], z - xyz[3 * s + 2]);
            if (nd < dist[s]) { dist[s] = nd; push(nd, s); }
        }
    }
}
const massArea = new Float64Array(n);
{
    const comp = new Int32Array(n).fill(-1), sizes = [], cellKm2 = 4 * Math.PI * R_KM * R_KM / n;
    for (let r = 0; r < n; r++) {
        if (!land(r) || comp[r] >= 0) continue;
        const id = sizes.length, stack = [r]; comp[r] = id; let k = 0;
        while (stack.length) { const a = stack.pop(); k++; for (let q = adjOffset[a]; q < adjOffset[a + 1]; q++) { const s = adjList[q]; if (land(s) && comp[s] < 0) { comp[s] = id; stack.push(s); } } }
        sizes.push(k * cellKm2);
    }
    for (let r = 0; r < n; r++) if (comp[r] >= 0) massArea[r] = sizes[comp[r]];
}
// west / east coasts on the 1° grid (the sea within 4° on that side, none within 10° on the other)
const lf = res.surface.landFrac;
const seaAlong = (la, lo, dir) => { const c = g.cellAt(la, lo), j = Math.floor(c / g.w), i = c % g.w; for (let k = 1; k <= 12; k++) if (lf[j * g.w + (i + dir * k + g.w) % g.w] < 0.5) return k; return 99; };

// ── tallies ──
const LAT = [0, 10, 20, 30, 40, 50, 60, 70];
const DIST = [0, 100, 250, 500, 1000, 2000, Infinity];
const MASS = [0, 3e4, 3e5, 3e6, Infinity];
const which = (edges, x) => { for (let i = 0; i < edges.length - 1; i++) if (x >= edges[i] && x < edges[i + 1]) return i; return -1; };
const cell = () => ({ n: 0, s: 0, o: 0, no: 0 });
const add = (b, r) => { b.n++; b.s += range[r]; if (obsRange[r] === obsRange[r]) { b.o += obsRange[r]; b.no++; } };
const tab = LAT.slice(1).map(() => DIST.slice(1).map(cell)), mass = LAT.slice(1).map(() => MASS.slice(1).map(cell));
const coasts = { 'west coasts 35–65°N': cell(), 'east coasts 35–65°N': cell(), 'west coasts 35–65°S': cell(), 'east coasts 35–65°S': cell() };
const all = cell();
let sxy = 0, sxx = 0, syy = 0, sx = 0, sy = 0, k = 0;
const bandMean = new Float64Array(LAT.length), bandObs = new Float64Array(LAT.length), bandN = new Float64Array(LAT.length);
for (let r = 0; r < n; r++) {
    if (!(range[r] === range[r])) continue;
    const a = which(LAT, Math.abs(lat[r])); if (a < 0) continue;
    add(all, r);
    add(tab[a][which(DIST, dist[r])], r);
    add(mass[a][which(MASS, massArea[r])], r);
    const al = Math.abs(lat[r]);
    if (al >= 35 && al <= 65 && dist[r] < 400) {
        const e = seaAlong(lat[r], lon[r], 1), wv = seaAlong(lat[r], lon[r], -1), h = lat[r] > 0 ? 'N' : 'S';
        if (wv <= 4 && e > 10) add(coasts[`west coasts 35–65°${h}`], r); else if (e <= 4 && wv > 10) add(coasts[`east coasts 35–65°${h}`], r);
    }
    if (obsRange[r] === obsRange[r]) { const x = range[r], y = obsRange[r]; sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y; k++; }
}
// Earth's observed land, per latitude × distance bin: the reference for other planets
const refFile = path.join(OUT, 'continentality-earth.json');
let ref = null;
if (PLANET === 'earth') { ref = tab.map(row => row.map(b => (b.no >= 20 ? b.o / b.no : null))); fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(refFile, JSON.stringify(ref)); }
else if (fs.existsSync(refFile)) ref = JSON.parse(fs.readFileSync(refFile, 'utf8'));

const f = (x) => (x === x && x != null ? x.toFixed(1) : '—').padStart(5);
const pair = (b, refV) => (b.n < 20 ? '         —   ' : `${f(b.s / b.n)} /${f(b.no >= 20 ? b.o / b.no : refV ?? NaN)}  `);
console.log(`${PLANET === 'earth' ? 'Earth' : `Evolution world, seed ${SEED}${ROOT ? ', ' + path.basename(ROOT) : ''}`}: annual range of the land's monthly temperature (°C), new / ${PLANET === 'earth' ? 'observed' : "Earth's observed land in the same bin"}`);
if (k) {
    const cov = sxy / k - (sx / k) * (sy / k), r2 = cov / Math.sqrt((sxx / k - (sx / k) ** 2) * (syy / k - (sy / k) ** 2));
    let se = 0; for (let r = 0; r < n; r++) if (range[r] === range[r] && obsRange[r] === obsRange[r]) se += (range[r] - obsRange[r]) ** 2;
    console.log(`  all land: ${f(all.s / all.n)} /${f(all.o / all.no)}   bias ${(sx / k - sy / k).toFixed(2)} °C, RMS error ${Math.sqrt(se / k).toFixed(2)} °C, correlation ${r2.toFixed(3)}`);
}
console.log('by |latitude| (rows) and distance from the sea (columns, km)');
console.log('             ' + DIST.slice(0, -1).map((d, i) => `${d}–${DIST[i + 1] === Infinity ? '' : DIST[i + 1]}`.padEnd(13)).join(''));
tab.forEach((row, a) => console.log(`  ${LAT[a]}–${LAT[a + 1]}°`.padEnd(13) + row.map((b, i) => pair(b, ref?.[a]?.[i])).join('')));
console.log('by |latitude| and the size of the landmass (km²)');
console.log('             ' + ['< 30K', '30K–300K', '300K–3M', '> 3M'].map(s => s.padEnd(13)).join(''));
mass.forEach((row, a) => console.log(`  ${LAT[a]}–${LAT[a + 1]}°`.padEnd(13) + row.map(b => pair(b, null)).join('')));
console.log('mid-latitude coasts (land within 400 km of the sea)');
for (const [name, b] of Object.entries(coasts)) console.log(`  ${name.padEnd(22)} ${pair(b, null)}   (${b.n} cells)`);
if (PLANET === 'earth') {
    const REG = [['Ireland', 51, 55, -10, -6], ['Brittany', 47, 49, -5, -2], ['Germany', 48, 54, 7, 14], ['Poland', 50, 54, 16, 24], ['Moscow', 54, 57, 35, 40],
        ['Yakutsk', 60, 64, 125, 135], ['Vancouver Is.', 48, 51, -128, -123], ['Montana', 45, 49, -112, -105], ['Minnesota', 44, 48, -96, -92],
        ['New England', 42, 45, -72, -69], ['Japan (Honshu)', 34, 40, 135, 141], ['NE China', 42, 47, 123, 130], ['Iceland', 63.5, 66, -22, -14],
        ['New Zealand S', -46, -42, 168, 173], ['Patagonia', -48, -42, -70, -66], ['Tasmania', -43, -41, 145, 148], ['Hawaii', 19, 22, -160, -155],
        ['Sri Lanka', 6, 9, 80, 82], ['Madagascar', -24, -14, 44, 49], ['Central Asia', 42, 48, 60, 75],
        ['Myanmar', 18, 24, 94, 98], ['Thailand', 13, 18, 99, 104], ['N Vietnam', 20, 23, 103, 107], ['S China', 22, 27, 108, 118],
        ['Bolivia lowland', -18, -13, -66, -60], ['Paraguay', -25, -21, -60, -56], ['Sahel', 12, 16, -5, 15], ['India N', 24, 29, 75, 85]];
    console.log('regions: range new / observed; coldest and warmest month new / observed (°C, the grid cell\'s own height vs observed)');
    for (const [name, a, b, c, d] of REG) {
        const bn = cell(); let mc = 0, mw = 0, oc = 0, ow = 0, k2 = 0;
        for (let r = 0; r < n; r++) if (range[r] === range[r] && lat[r] >= a && lat[r] <= b && lon[r] >= c && lon[r] <= d) {
            add(bn, r);
            if (obsCold[r] === obsCold[r]) { const v = modelMonths(r); mc += Math.min(...v); mw += Math.max(...v); oc += obsCold[r]; ow += obsWarm[r]; k2++; }
        }
        console.log(`  ${name.padEnd(16)} ${pair(bn, null)}  cold ${f(mc / k2)} /${f(oc / k2)}   warm ${f(mw / k2)} /${f(ow / k2)}   (${bn.n})`);
    }
}
