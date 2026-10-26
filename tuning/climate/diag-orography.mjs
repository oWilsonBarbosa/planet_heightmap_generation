/**
 * Mountains and rain (Earth, every stage new): for well-known ranges, annual rain on the windward side and in the lee
 * — the new climate's terrain cells (with all the detail below the grid) against Beck's 1° rain — and the contrast
 * between them. Measures whether mountains wring out enough rain and cast enough of a shadow.
 *
 *   node tuning/climate/diag-orography.mjs [--n 160000] [--set KEY=value,…]   (CORE='{…}' for core options)
 */

import { loadEarthGrayscale } from './lib/earth-context.mjs';
import { buildEarthMesh } from './lib/earth-mesh.mjs';
import { loadReferences } from './lib/ref.mjs';
import { elevToHeightKm } from '../../js/color-map.js';
import { planetClimate } from '../../v2/js/climate/climate.js';
import { setParams } from '../../v2/js/climate/config.js';

const argSet = process.argv.indexOf('--set');
if (argSet > 0) setParams(Object.fromEntries(process.argv[argSet + 1].split(',').map(kv => { const [k, v] = kv.split('='); return [k, +v]; })));
const ni = process.argv.indexOf('--n'), N = ni > 0 ? +process.argv[ni + 1] : 160000;
const CORE = process.env.CORE ? JSON.parse(process.env.CORE) : {};

// [name, windward box [lat0, lat1, lon0, lon1], lee box]
export const RANGES = [
    ['Cascades',         [45, 48.5, -124, -122],    [45, 48.5, -120.5, -118]],
    ['Sierra Nevada',    [36.5, 40, -121.3, -119.8], [37, 40.5, -118.8, -116]],
    ['S Andes',          [-46, -39, -74, -72],     [-46, -39, -70.5, -67.5]],
    ['Norway / Sweden',  [59, 63, 5, 7.5],         [59, 63, 13, 16]],
    ['Himalaya / Tibet', [26, 28, 84, 92],         [30.5, 33, 84, 92]],
    ['Western Ghats',    [10, 16, 73.3, 75],       [12, 18, 76, 78.5]],
    ['NZ Southern Alps', [-44, -42, 169.5, 171],   [-45, -43, 171.5, 173]],
    ['Scotland',         [56, 58, -6, -4.5],       [55.5, 57.5, -3, -1.8]],
    ['E Australia',      [-34, -28, 151, 153.5],   [-34, -28, 145.5, 148]],
    ['Madagascar',       [-20, -14, 48.5, 50],     [-20, -14, 44, 46]],
    ['Rockies / Plains', [39, 44, -107.5, -105.5], [39, 44, -103, -100]],
    ['Patagonia E',      [-50, -46, -74.5, -73],   [-50, -46, -71, -68]],
];

const { grid, fields: obs } = loadReferences();
const G = grid.size;
const { gray, width, height } = loadEarthGrayscale();
const e = buildEarthMesh(gray, width, height, { N });
const n = e.mesh.numRegions, elevKm = new Float32Array(n);
for (let r = 0; r < n; r++) elevKm[r] = elevToHeightKm(e.r_elevation[r]);
const res = planetClimate({ xyz: e.r_xyz, elevKm, axes: 'y-up' }, CORE);
const { lat, lon, pAnnual } = res.cell;

const inBox = (la, lo, b) => la >= b[0] && la <= b[1] && lo >= b[2] && lo <= b[3];
function boxRain(b) {
    let sN = 0, nN = 0, sB = 0, nB = 0;
    for (let r = 0; r < n; r++) if (elevKm[r] > 0 && inBox(lat[r], lon[r], b)) { sN += pAnnual[r]; nN++; }
    for (let j = 0; j < grid.h; j++) for (let i = 0; i < grid.w; i++) {
        const la = grid.lat[j], lo = -180 + (i + 0.5) * grid.step;
        if (!inBox(la, lo, b)) continue;
        let p = 0; for (let m = 0; m < 12; m++) p += obs.precip[m * G + j * grid.w + i];
        if (p === p) { sB += p; nB++; }
    }
    return { nw: nN ? sN / nN : NaN, beck: nB ? sB / nB : NaN };
}
console.log('Annual rain (mm/yr), new / Beck — windward, lee, and windward ÷ lee');
let logN = 0, logB = 0, cnt = 0;
for (const [name, wb, lb] of RANGES) {
    const W = boxRain(wb), L = boxRain(lb);
    const cN = W.nw / L.nw, cB = W.beck / L.beck;
    if (cN > 0 && cB > 0) { logN += Math.log(cN); logB += Math.log(cB); cnt++; }
    const f = (x) => (x === x ? x.toFixed(0) : '—').padStart(5);
    console.log(`  ${name.padEnd(17)} windward ${f(W.nw)} /${f(W.beck)}   lee ${f(L.nw)} /${f(L.beck)}   contrast ×${cN.toFixed(1).padStart(4)} / ×${cB.toFixed(1).padStart(4)}`);
}
console.log(`  typical contrast (geometric mean): new ×${Math.exp(logN / cnt).toFixed(2)}, Beck ×${Math.exp(logB / cnt).toFixed(2)}`);
