/**
 * Two checks on the whole new climate (Earth, every stage new):
 *  • Temperature across the equator: land zonal means in 2° bands from 20°S to 20°N — January, July and the seasonal
 *    swing (warmest − coldest month), new vs Beck — to see jumps and seasonal bias near the equator.
 *  • How wet: land-mean annual rain and the arid (B) share of land, new vs Beck, per continent.
 *
 *   node tuning/climate/diag-tropics.mjs [--set KEY=value,…]   (CORE='{…}' for core options)
 */

import { loadEarthGrayscale } from './lib/earth-context.mjs';
import { buildEarthMesh } from './lib/earth-mesh.mjs';
import { loadReferences, truthAt01 } from './lib/ref.mjs';
import { continentOf, TUNED_CONTINENTS } from './lib/continents.mjs';
import { elevToHeightKm } from '../../js/color-map.js';
import { planetClimate } from '../../v2/js/climate/climate.js';
import { KOPPEN_CLASSES } from '../../v2/js/climate/koppen.js';
import { setParams } from '../../v2/js/climate/config.js';

const argSet = process.argv.indexOf('--set');
if (argSet > 0) setParams(Object.fromEntries(process.argv[argSet + 1].split(',').map(kv => { const [k, v] = kv.split('='); return [k, +v]; })));
const CORE = process.env.CORE ? JSON.parse(process.env.CORE) : {};
const { grid, fields: obs, koppen01 } = loadReferences();
const G = grid.size;
const { gray, width, height } = loadEarthGrayscale();
const e = buildEarthMesh(gray, width, height, { N: 160000 });
const n = e.mesh.numRegions, elevKm = new Float32Array(n);
for (let r = 0; r < n; r++) elevKm[r] = elevToHeightKm(e.r_elevation[r]);
const res = planetClimate({ xyz: e.r_xyz, elevKm, axes: 'y-up' }, CORE);
const T = res.months.T, lf = res.surface.landFrac;
const href = (c) => { const v = res.surface.meanLandKm[c]; return v === v ? Math.max(0, v) : 0; };

console.log('Land zonal means (°C, 1° grid, both at the grid cells\' mean land height): Jan new / Beck, Jul new / Beck, swing new / Beck');
for (let lat0 = 20; lat0 > -20; lat0 -= 2) {
    const a = { jN: 0, jB: 0, uN: 0, uB: 0, sN: 0, sB: 0, n: 0 };
    for (let j = 0; j < grid.h; j++) {
        const la = grid.lat[j]; if (la > lat0 || la <= lat0 - 2) continue;
        for (let i = 0; i < grid.w; i++) {
            const c = j * grid.w + i; if (lf[c] < 0.5 || !(obs.t2m[c] === obs.t2m[c])) continue;
            let mxN = -1e9, mnN = 1e9, mxB = -1e9, mnB = 1e9;
            for (let m = 0; m < 12; m++) { const tn = T[m * G + c], tb = obs.t2m[m * G + c]; mxN = Math.max(mxN, tn); mnN = Math.min(mnN, tn); mxB = Math.max(mxB, tb); mnB = Math.min(mnB, tb); }
            a.jN += T[c]; a.jB += obs.t2m[c]; a.uN += T[6 * G + c]; a.uB += obs.t2m[6 * G + c]; a.sN += mxN - mnN; a.sB += mxB - mnB; a.n++;
        }
    }
    const f = (x) => (x / a.n).toFixed(1).padStart(5);
    console.log(`  ${String(lat0 - 1).padStart(4)}°  Jan ${f(a.jN)} /${f(a.jB)}   Jul ${f(a.uN)} /${f(a.uB)}   swing ${f(a.sN)} /${f(a.sB)}   (${a.n} cells)`);
}

// ── How wet ──
const { koppen, lat, lon, pAnnual } = res.cell;
const acc = {};
for (let r = 0; r < n; r++) {
    const t = truthAt01(koppen01, lat[r], lon[r]); if (!t || !koppen[r]) continue;
    const k = continentOf(lat[r], lon[r]); const A = (acc[k] ??= { n: 0, bN: 0, bT: 0, pN: 0, pT: 0 });
    const c = grid.cellAt(lat[r], lon[r]);
    let po = 0; for (let m = 0; m < 12; m++) po += obs.precip[m * G + c];
    if (!(po === po)) continue;
    A.n++; A.pN += pAnnual[r]; A.pT += po;
    if (KOPPEN_CLASSES[koppen[r]].code[0] === 'B') A.bN++;
    if (KOPPEN_CLASSES[t].code[0] === 'B') A.bT++;
}
console.log('\nAnnual rain on land (mm/yr) and arid (B) share, new / Beck:');
let tot = { n: 0, bN: 0, bT: 0, pN: 0, pT: 0 };
for (const k of [...TUNED_CONTINENTS]) {
    const A = acc[k]; if (!A) continue;
    for (const q of Object.keys(tot)) tot[q] += A[q];
    console.log(`  ${k.padEnd(14)} rain ${(A.pN / A.n).toFixed(0).padStart(5)} / ${(A.pT / A.n).toFixed(0).padStart(5)}   arid ${(100 * A.bN / A.n).toFixed(0).padStart(3)} % / ${(100 * A.bT / A.n).toFixed(0).padStart(3)} %`);
}
console.log(`  ${'all'.padEnd(14)} rain ${(tot.pN / tot.n).toFixed(0).padStart(5)} / ${(tot.pT / tot.n).toFixed(0).padStart(5)}   arid ${(100 * tot.bN / tot.n).toFixed(0).padStart(3)} % / ${(100 * tot.bT / tot.n).toFixed(0).padStart(3)} %`);
