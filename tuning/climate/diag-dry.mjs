/**
 * Why is a planet dry? The same breakdown for Earth (the new climate, and Beck / the observed rain) and for an
 * Evolution world: its land's rain, temperature and arid (B) share — overall, by latitude, by distance from the sea and by
 * height — and the planet's water budget (rain over land and sea).
 *
 *   node tuning/climate/diag-dry.mjs [--planet earth|evolution|<a lib/gen-planets.mjs key, e.g. gen-6>] [--seed 12345] [--ending none|supercontinent]
 *                                    [--n 160000] [--root <a code snapshot with v2/ and js/>]
 *                                    [--climate <a snapshot with v2/js/climate/>] [--set KEY=value,…]
 *
 * --root builds the Evolution world with another branch's terrain code (e.g. a `git archive` of v2-tectonics);
 * --climate runs another version's climate on it (default: this tree's). The world's terrain is cached in
 * tuning/results/climate/cache/.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadEarthGrayscale } from './lib/earth-context.mjs';
import { buildEarthMesh } from './lib/earth-mesh.mjs';
import { loadReferences, truthAt01 } from './lib/ref.mjs';
import { elevToHeightKm } from '../../js/color-map.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const climateBase = arg('--climate', null) ? pathToFileURL(path.resolve(arg('--climate')) + '/').href : new URL('../../', import.meta.url).href;
const { planetClimate } = await import(climateBase + 'v2/js/climate/climate.js');
const { KOPPEN_CLASSES } = await import(climateBase + 'v2/js/climate/koppen.js');
const { setParams } = await import(climateBase + 'v2/js/climate/config.js');
const argSet = process.argv.indexOf('--set');
if (argSet > 0) setParams(Object.fromEntries(process.argv[argSet + 1].split(',').map(kv => { const [k, v] = kv.split('='); return [k, +v]; })));
const PLANET = arg('--planet', 'evolution'), N = +arg('--n', 160000), SEED = +arg('--seed', 12345), ENDING = arg('--ending', 'none');
const ROOT = arg('--root', null);
const CORE = process.env.CORE ? JSON.parse(process.env.CORE) : {};

// ── the planet ──
let xyz, elevKm, axes, truth = null, obsP = null;
if (PLANET === 'earth') {
    const { gray, width, height } = loadEarthGrayscale();
    const e = buildEarthMesh(gray, width, height, { N });
    xyz = e.r_xyz; axes = 'y-up';
    elevKm = new Float32Array(e.mesh.numRegions);
    for (let r = 0; r < elevKm.length; r++) elevKm[r] = elevToHeightKm(e.r_elevation[r]);
} else if (PLANET !== 'evolution') {
    // one of lib/gen-planets.mjs's planets by key, e.g. gen-6, evo-202, test-supercontinent
    const { loadGenPlanets } = await import('./lib/gen-planets.mjs');
    const [p] = await loadGenPlanets({ only: [PLANET] });
    if (!p) throw new Error(`no planet ${PLANET} in lib/gen-planets.mjs`);
    ({ xyz, elevKm, axes } = p);
} else {
    const tag = ROOT ? 'root-' + path.basename(ROOT) : 'here';
    const dir = path.join(__dirname, '..', 'results', 'climate', 'cache'), file = path.join(dir, `evolution-${tag}-${SEED}-${ENDING}-${N}.f32`);
    const base = ROOT ? pathToFileURL(path.resolve(ROOT) + '/').href : new URL('../../', import.meta.url).href;
    const { default: Delaunator } = await import('delaunator');
    (await import(base + 'js/sphere-mesh.js')).setDelaunator(Delaunator);
    const { terrainMesh } = await import(base + 'v2/js/terrain/terrain-mesh.js');
    const tm = terrainMesh(N);
    if (fs.existsSync(file)) { const b = fs.readFileSync(file); elevKm = new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4); }
    else {
        console.log(`Building the Evolution world (seed ${SEED}, ending ${ENDING}, ${tag}) — about a minute, cached after…`);
        const { evolutionWorld } = await import(base + 'v2/js/climate-lab/evolution-world.js');
        const wld = evolutionWorld({ seed: SEED, ending: ENDING, cells: N });
        elevKm = wld.heightKm;
        fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(file, Buffer.from(elevKm.buffer, elevKm.byteOffset, elevKm.byteLength));
    }
    xyz = tm.xyz; axes = 'z-up';
}
const res = planetClimate({ xyz, elevKm, axes }, CORE);
const n = elevKm.length, { lat, lon, koppen, pAnnual, tAnnual } = res.cell;
if (PLANET === 'earth') {
    const { grid: rg, fields, koppen01 } = loadReferences();
    truth = new Uint8Array(n); obsP = new Float64Array(n);
    const yr = new Float64Array(rg.size);
    for (let m = 0; m < 12; m++) for (let c = 0; c < rg.size; c++) yr[c] += fields.precip[m * rg.size + c];
    for (let r = 0; r < n; r++) { truth[r] = truthAt01(koppen01, lat[r], lon[r]); obsP[r] = yr[rg.cellAt(lat[r], lon[r])]; }
}

// ── distance from the sea (km), on the 1° grid: land = land fraction ≥ ½ ──
const g = res.grid, G = g.size, lf = res.surface.landFrac;
const dist = new Float64Array(G).fill(Infinity);
{
    const R = 6371, DEG = Math.PI / 180, heap = [];
    const push = (d, c) => { heap.push([d, c]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, rr = l + 1; let s = i; if (l < heap.length && heap[l][0] < heap[s][0]) s = l; if (rr < heap.length && heap[rr][0] < heap[s][0]) s = rr; if (s === i) break; [heap[s], heap[i]] = [heap[i], heap[s]]; i = s; } } return top; };
    for (let c = 0; c < G; c++) if (lf[c] < 0.5) { dist[c] = 0; push(0, c); }
    while (heap.length) {
        const [d, c] = pop(); if (d > dist[c]) continue;
        const j = Math.floor(c / g.w), i = c % g.w;
        for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
            if (!dj && !di) continue;
            const jj = j + dj; if (jj < 0 || jj >= g.h) continue;
            const ii = (i + di + g.w) % g.w, q = jj * g.w + ii;
            const dx = di * g.step * DEG * Math.cos(0.5 * (g.lat[j] + g.lat[jj]) * DEG), dy = dj * g.step * DEG;
            const nd = d + R * Math.hypot(dx, dy);
            if (nd < dist[q]) { dist[q] = nd; push(nd, q); }
        }
    }
}

// ── tallies over land cells (mesh cells are about equal in area) ──
const isB = (k) => KOPPEN_CLASSES[k].code[0] === 'B', isBW = (k) => KOPPEN_CLASSES[k].code.startsWith('BW');
const bin = () => ({ n: 0, p: 0, t: 0, b: 0, bw: 0, on: 0, opn: 0, op: 0, ob: 0 });
const add = (s, r) => {
    s.n++; s.p += pAnnual[r]; s.t += tAnnual[r]; if (isB(koppen[r])) s.b++; if (isBW(koppen[r])) s.bw++;
    if (truth && truth[r]) { s.on++; if (isB(truth[r])) s.ob++; if (obsP[r] === obsP[r]) { s.opn++; s.op += obsP[r]; } }
};
const all = bin(), bands = [], coast = [], heights = [];
const LAT = [-60, -45, -30, -15, 0, 15, 30, 45, 60, 75];
const DIST = [0, 250, 500, 1000, 1500, 2000, 3000, Infinity];
const HGT = [0, 0.3, 0.7, 1.2, 2, 3, Infinity];
for (let i = 0; i < LAT.length - 1; i++) bands.push(bin());
for (let i = 0; i < DIST.length - 1; i++) coast.push(bin());
for (let i = 0; i < HGT.length - 1; i++) heights.push(bin());
const which = (edges, x) => { for (let i = 0; i < edges.length - 1; i++) if (x >= edges[i] && x < edges[i + 1]) return i; return -1; };
for (let r = 0; r < n; r++) {
    if (!koppen[r]) continue;
    if (truth && !truth[r]) continue;                       // Earth: only land both maps agree is land
    if (KOPPEN_CLASSES[koppen[r]].code === 'EF' && lat[r] < -60) continue;   // (not Antarctica)
    add(all, r);
    const a = which(LAT, lat[r]); if (a >= 0) add(bands[a], r);
    const d = which(DIST, dist[g.cellAt(lat[r], lon[r])]); if (d >= 0) add(coast[d], r);
    const h = which(HGT, Math.max(0, elevKm[r])); if (h >= 0) add(heights[h], r);
}
const pc = (x) => `${(100 * x).toFixed(0).padStart(3)} %`;
const mm = (x) => `${x.toFixed(0).padStart(5)}`;
const row = (label, s) => `  ${label.padEnd(16)} land ${pc(s.n / all.n)}   rain ${mm(s.p / s.n)} mm${truth ? ` /${mm(s.op / s.opn)}` : ''}   T ${(s.t / s.n).toFixed(1).padStart(5)} °C   arid (B) ${pc(s.b / s.n)}${truth ? ` /${pc(s.ob / s.on)}` : ''}   desert (BW) ${pc(s.bw / s.n)}`;

// ── the planet's water: rain over land and sea (area-weighted, 1° grid) ──
let pl = 0, al = 0, ps = 0, as = 0;
for (let j = 0; j < g.h; j++) for (let i = 0; i < g.w; i++) {
    if (Math.abs(g.lat[j]) > 80) continue;
    const c = j * g.w + i, a = g.rowArea[j]; let p = 0; for (let m = 0; m < 12; m++) p += res.months.P[m * G + c];
    pl += lf[c] * a * p; al += lf[c] * a; ps += (1 - lf[c]) * a * p; as += (1 - lf[c]) * a;
}
let landN = 0; for (let r = 0; r < n; r++) if (elevKm[r] > 0) landN++;
let hs = 0, hn = 0; for (let r = 0; r < n; r++) if (elevKm[r] > 0) { hs += elevKm[r]; hn++; }
console.log(`${PLANET}${PLANET === 'evolution' ? ` (seed ${SEED}, ${ENDING}${ROOT ? ', ' + path.basename(ROOT) : ''})` : ''}: land ${pc(landN / n)} of the planet, its mean height ${(hs / hn).toFixed(2)} km`);
console.log(`  rain over land ${(pl / al).toFixed(0)} mm/yr, over sea ${(ps / as).toFixed(0)} mm/yr (within 80° of the equator)${truth ? '   [Earth observed ≈ 750 / 1100]' : ''}`);
console.log(row('all land', all) + (truth ? '      (new / Beck & observed)' : ''));
console.log('by latitude');
for (let i = 0; i < bands.length; i++) if (bands[i].n) console.log(row(`${LAT[i]}…${LAT[i + 1]}°`, bands[i]));
console.log('by distance from the sea');
for (let i = 0; i < coast.length; i++) if (coast[i].n) console.log(row(`${DIST[i]}…${DIST[i + 1]} km`, coast[i]));
console.log('by height');
for (let i = 0; i < heights.length; i++) if (heights[i].n) console.log(row(`${HGT[i]}…${HGT[i + 1]} km`, heights[i]));

// ── subtropical coasts (10–35°): facing east (the sea within 4° to the east, none within 10° to the west) or west ──
const seaAlong = (c, dir) => { const j = Math.floor(c / g.w), i = c % g.w; for (let k = 1; k <= 12; k++) if (lf[j * g.w + (i + dir * k + g.w) % g.w] < 0.5) return k; return 99; };
const facing = { 'N, east coast': bin(), 'N, west coast': bin(), 'S, east coast': bin(), 'S, west coast': bin() };
for (let r = 0; r < n; r++) {
    if (!koppen[r] || (truth && !truth[r]) || Math.abs(lat[r]) < 10 || Math.abs(lat[r]) > 35) continue;
    const c = g.cellAt(lat[r], lon[r]), e = seaAlong(c, 1), wv = seaAlong(c, -1), hemi = lat[r] > 0 ? 'N' : 'S';
    if (e <= 4 && wv > 10) add(facing[`${hemi}, east coast`], r);
    else if (wv <= 4 && e > 10) add(facing[`${hemi}, west coast`], r);
}
console.log('subtropical coasts (10–35°)');
for (const [k, s] of Object.entries(facing)) if (s.n) console.log(row(k, s));

// ── fetch: how far the year's mean wind has come over land (km, marched upwind in 50 km steps to the sea), within 35° ──
{
    const u = res.stages.circulation.u, v = res.stages.circulation.v, ua = new Float64Array(G), va = new Float64Array(G);
    for (let m = 0; m < 12; m++) for (let c = 0; c < G; c++) { ua[c] += u[m * G + c] / 12; va[c] += v[m * G + c] / 12; }
    const fetchKm = (la, lo) => {
        const R = 6371, DEG = Math.PI / 180;
        for (let d = 0; d <= 6000; d += 50) {
            const c = g.cellAt(la, lo); if (lf[c] < 0.5) return d;
            const s = Math.hypot(ua[c], va[c]); if (!(s > 0.2)) return Infinity;
            la -= va[c] / s * 50 / R / DEG; lo -= ua[c] / s * 50 / (R * DEG * Math.max(0.2, Math.cos(la * DEG)));
            if (la > 89 || la < -89) return Infinity; lo = ((lo + 540) % 360) - 180;
        }
        return Infinity;
    };
    const F = [0, 250, 500, 1000, 2000, 4000, Infinity], fb = F.slice(1).map(() => bin());
    for (let r = 0; r < n; r++) {
        if (!koppen[r] || (truth && !truth[r]) || Math.abs(lat[r]) > 35) continue;
        const k = which(F, fetchKm(lat[r], lon[r])); if (k >= 0) add(fb[k], r);
    }
    console.log('within 35°: by the distance the year\'s mean wind has come over land');
    for (let i = 0; i < fb.length; i++) if (fb[i].n) console.log(row(`${F[i]}…${F[i + 1]} km`, fb[i]));
}

// ── how evenly the land's rain is spread: percentiles (mm/yr) of the land outside the polar ice ──
const pct = (arr) => { const a = Float64Array.from(arr).sort(); return [10, 25, 50, 75, 90].map(q => a[Math.floor(q / 100 * (a.length - 1))].toFixed(0).padStart(5)).join(' '); };
const sim = [], obs = [];
for (let r = 0; r < n; r++) {
    if (!koppen[r] || (truth && !truth[r]) || Math.abs(lat[r]) > 60) continue;
    sim.push(pAnnual[r]); if (truth && obsP[r] === obsP[r]) obs.push(obsP[r]);
}
console.log(`land within 60°: rain percentiles 10 / 25 / 50 / 75 / 90 %: ${pct(sim)} mm${truth ? `   (observed ${pct(obs)})` : ''}`);
