/**
 * How much detail the Köppen map has, and Tibet. Every stage new, Earth at N terrain cells.
 *  • Patchiness: the share of neighbouring land cells whose classes differ — for Beck's map (sampled at the same cells)
 *    and the new climate; and the same for the major groups. A smooth climate has far fewer class edges than Beck.
 *  • Tibet (≥ 3.5 km, 28–38°N, 75–103°E): classes, annual rain and warmest month, new vs Beck.
 *
 *   node tuning/climate/diag-detail.mjs [--n 160000] [--set KEY=value,…]
 */

import { loadEarthGrayscale } from './lib/earth-context.mjs';
import { buildEarthMesh } from './lib/earth-mesh.mjs';
import { loadReferences, truthAt01 } from './lib/ref.mjs';
import { elevToHeightKm } from '../../js/color-map.js';
import { planetClimate } from '../../v2/js/climate/climate.js';
import { KOPPEN_CLASSES } from '../../v2/js/climate/koppen.js';
import { setParams } from '../../v2/js/climate/config.js';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const argSet = process.argv.indexOf('--set');
if (argSet > 0) setParams(Object.fromEntries(process.argv[argSet + 1].split(',').map(kv => { const [k, v] = kv.split('='); return [k, +v]; })));
const N = +arg('--n', 160000);
const { grid, fields: obs, koppen01 } = loadReferences();
const G = grid.size;
const { gray, width, height } = loadEarthGrayscale();
const e = buildEarthMesh(gray, width, height, { N });
const n = e.mesh.numRegions, elevKm = new Float32Array(n);
for (let r = 0; r < n; r++) elevKm[r] = elevToHeightKm(e.r_elevation[r]);
const t0 = performance.now();
const CORE = process.env.CORE ? JSON.parse(process.env.CORE) : {};
const res = planetClimate({ xyz: e.r_xyz, elevKm, axes: 'y-up' }, CORE);
const ms = performance.now() - t0;
const { koppen, lat, lon, pAnnual } = res.cell;
const truth = new Uint8Array(n);
for (let r = 0; r < n; r++) truth[r] = truthAt01(koppen01, lat[r], lon[r]);

// ── Patchiness ──
const { adjOffset, adjList } = e.mesh;
function edges(k) {
    let pairs = 0, diff = 0, diffG = 0;
    for (let r = 0; r < n; r++) {
        if (!k[r] || !truth[r]) continue;
        for (let q = adjOffset[r]; q < adjOffset[r + 1]; q++) {
            const s = adjList[q]; if (s < r || !k[s] || !truth[s]) continue;
            pairs++;
            if (k[s] !== k[r]) diff++;
            if (KOPPEN_CLASSES[k[s]].code[0] !== KOPPEN_CLASSES[k[r]].code[0]) diffG++;
        }
    }
    return { classEdges: diff / pairs, groupEdges: diffG / pairs };
}
const eT = edges(truth), eN = edges(koppen);
let agree = 0, land = 0;
for (let r = 0; r < n; r++) if (truth[r]) { land++; if (truth[r] === koppen[r]) agree++; }
console.log(`Earth ${n.toLocaleString()} cells; climate ${ms.toFixed(0)} ms; Köppen ${(100 * agree / land).toFixed(1)} %`);
console.log(`Patchiness (share of neighbouring land cells in different classes): Beck ${(100 * eT.classEdges).toFixed(1)} %, new ${(100 * eN.classEdges).toFixed(1)} %; major groups: Beck ${(100 * eT.groupEdges).toFixed(1)} %, new ${(100 * eN.groupEdges).toFixed(1)} %`);

// ── Tibet ──
const annObs = new Float32Array(G), warmObs = new Float32Array(G);
for (let c = 0; c < G; c++) { let s = 0, w = -1e9; for (let m = 0; m < 12; m++) { s += obs.precip[m * G + c]; w = Math.max(w, obs.t2m[m * G + c]); } annObs[c] = s; warmObs[c] = w; }
const T = res.months.T;
const tally = (k, sel) => { const t = {}; let cnt = 0; for (let r = 0; r < n; r++) { if (!sel(r) || !k[r]) continue; cnt++; const code = KOPPEN_CLASSES[k[r]].code; t[code] = (t[code] ?? 0) + 1; } return Object.entries(t).sort((a, b) => b[1] - a[1]).slice(0, 7).map(([c, v]) => `${c} ${(100 * v / cnt).toFixed(0)} %`).join(', '); };
const tibet = (r) => lat[r] >= 28 && lat[r] <= 38 && lon[r] >= 75 && lon[r] <= 103 && elevKm[r] >= 3.5;
let pN = 0, pO = 0, wN = 0, wO = 0, cnt = 0, hs = 0;
for (let r = 0; r < n; r++) {
    if (!tibet(r)) continue;
    const c = grid.cellAt(lat[r], lon[r]);
    if (!(annObs[c] === annObs[c])) continue;
    cnt++; hs += elevKm[r];
    pN += pAnnual[r]; pO += annObs[c];
    let w = -1e9; for (let m = 0; m < 12; m++) w = Math.max(w, T[m * G + c]);
    const href = res.surface.meanLandKm[c] === res.surface.meanLandKm[c] ? Math.max(0, res.surface.meanLandKm[c]) : 0;
    wN += w - 6.5 * (elevKm[r] - href); wO += warmObs[c];
}
console.log(`\nTibet (${cnt} cells, mean height ${(hs / cnt).toFixed(1)} km): rain ${(pN / cnt).toFixed(0)} mm/yr new vs ${(pO / cnt).toFixed(0)} Beck (1° cells); warmest month ${(wN / cnt).toFixed(1)} °C new (at the cell's height) vs ${(wO / cnt).toFixed(1)} Beck (1° mean height)`);
console.log(`  classes new: ${tally(koppen, tibet)}`);
console.log(`  classes Beck: ${tally(truth, tibet)}`);

// ── Mediterranean climates: where the model puts Cs, and what is really there; where real Cs is, and what the model says ──
const isCs = (k) => k && KOPPEN_CLASSES[k].code.startsWith('Cs');
const where = (r) => `${lat[r] >= 0 ? 'N' : 'S'}${Math.floor(Math.abs(lat[r]) / 10) * 10}° ${lon[r] < -100 ? 'W Americas' : lon[r] < -30 ? 'E Americas' : lon[r] < 60 ? 'Europe/Africa' : lon[r] < 110 ? 'Asia' : 'E Asia/Oz'}`;
const groupBy = (sel, key) => { const t = new Map(); let cnt = 0; for (let r = 0; r < n; r++) if (sel(r)) { cnt++; const k = key(r); t.set(k, (t.get(k) ?? 0) + 1); } return [...t].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k} ${(100 * v / cnt).toFixed(0)} %`).join(', ') + ` (of ${cnt})`; };
console.log(`\nModel Cs cells, by region: ${groupBy(r => isCs(koppen[r]), where)}`);
console.log(`  really there: ${groupBy(r => isCs(koppen[r]) && truth[r], r => KOPPEN_CLASSES[truth[r]].code)}`);
console.log(`Real Cs cells, by region: ${groupBy(r => isCs(truth[r]), where)}`);
console.log(`  model says: ${groupBy(r => isCs(truth[r]), r => koppen[r] ? KOPPEN_CLASSES[koppen[r]].code : 'sea')}`);

// ── Named regions: model vs Beck classes ──
for (const [name, la0, la1, lo0, lo1] of [['SE United States', 30, 37, -95, -77], ['Western Europe', 45, 55, -5, 15], ['Central Europe', 45, 55, 15, 30], ['Mediterranean basin', 34, 42, -8, 36]]) {
    const sel = (r) => lat[r] >= la0 && lat[r] <= la1 && lon[r] >= lo0 && lon[r] <= lo1;
    console.log(`\n${name}: new ${tally(koppen, sel)}\n${' '.repeat(name.length)}  Beck ${tally(truth, sel)}`);
}
