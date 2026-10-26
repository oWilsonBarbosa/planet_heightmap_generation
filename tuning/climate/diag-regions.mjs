/**
 * Named regions, new climate vs Beck (Earth, every stage new): the Köppen mix on land, the coldest and warmest month,
 * and rain in the summer and winter halves — to see why a region lands in the wrong class.
 *
 *   node tuning/climate/diag-regions.mjs [--set europe|west|islands|all] [--params KEY=value,…]   (CORE='{…}' for core options)
 */

import { loadEarthGrayscale } from './lib/earth-context.mjs';
import { buildEarthMesh } from './lib/earth-mesh.mjs';
import { loadReferences, truthAt01 } from './lib/ref.mjs';
import { elevToHeightKm } from '../../js/color-map.js';
import { planetClimate } from '../../v2/js/climate/climate.js';
import { KOPPEN_CLASSES } from '../../v2/js/climate/koppen.js';
import { setParams } from '../../v2/js/climate/config.js';

const ai = process.argv.indexOf('--params');
if (ai > 0) setParams(Object.fromEntries(process.argv[ai + 1].split(',').map(kv => { const [k, v] = kv.split('='); return [k, +v]; })));
const si = process.argv.indexOf('--set'), which = si > 0 ? process.argv[si + 1] : 'all';
const REGIONS = {
    europe: [
        ['UK and Ireland', [50.5, 58, -10, 1.5]],
        ['France',         [43.5, 50, -1.5, 6]],
        ['Germany',        [48, 54, 7, 14]],
        ['Poland',         [50, 54, 15, 23]],
        ['Iberia',         [37, 43, -9, -1]],
    ],
    west: [
        ['Pacific NW coast', [43, 48.5, -124.5, -122]],
        ['California',     [34, 40, -122.5, -118.5]],
        ['Great Basin',    [38, 43, -119.5, -112.5]],
        ['Colorado Plat.', [35, 38.5, -112, -107]],
        ['Rockies',        [39, 46, -112, -105.5]],
        ['High Plains',    [36, 44, -104, -99]],
    ],
    islands: [
        ['Hawaii',         [18.8, 22.4, -160.5, -154.7]],
        ['Puerto Rico+Hisp', [17.5, 20, -74.5, -65.5]],
        ['Jamaica+Cuba E', [17.6, 20.5, -78.5, -74.2]],
        ['Sri Lanka',      [5.8, 9.9, 79.6, 82]],
        ['Fiji+Vanuatu',   [-19.5, -14.5, 166, 180]],
        ['New Caledonia',  [-22.8, -20, 163.5, 167.5]],
        ['Reunion+Maurit.', [-21.5, -19.9, 55.2, 57.9]],
        ['Azores+Madeira', [32.5, 39.8, -31.5, -16.5]],
        ['Canaries',       [27.6, 29.5, -18.2, -13.3]],
        ['Faroe+Iceland S', [61.3, 64.5, -24, -6]],
    ],
};
const list = which === 'all' ? [...REGIONS.europe, ...REGIONS.west, ...REGIONS.islands] : REGIONS[which];

const CORE = process.env.CORE ? JSON.parse(process.env.CORE) : {};
const { grid, fields: obs, koppen01 } = loadReferences();
const G = grid.size;
const { gray, width, height } = loadEarthGrayscale();
const e = buildEarthMesh(gray, width, height, { N: 160000 });
const n = e.mesh.numRegions, elevKm = new Float32Array(n);
for (let r = 0; r < n; r++) elevKm[r] = elevToHeightKm(e.r_elevation[r]);
const res = planetClimate({ xyz: e.r_xyz, elevKm, axes: 'y-up' }, CORE);
const { koppen, lat, lon } = res.cell;
const T = res.months.T, P = res.months.P;
const SUMMER_N = [3, 4, 5, 6, 7, 8], WINTER_N = [9, 10, 11, 0, 1, 2];
const inBox = (la, lo, b) => la >= b[0] && la <= b[1] && lo >= b[2] && lo <= b[3];

for (const [name, b] of list) {
    const cN = {}, cT = {}; let nc = 0;
    for (let r = 0; r < n; r++) {
        if (!inBox(lat[r], lon[r], b) || !koppen[r]) continue;
        const t = truthAt01(koppen01, lat[r], lon[r]); if (!t) continue;
        const kn = KOPPEN_CLASSES[koppen[r]].code, kt = KOPPEN_CLASSES[t].code;
        cN[kn] = (cN[kn] || 0) + 1; cT[kt] = (cT[kt] || 0) + 1; nc++;
    }
    const top = (o) => Object.entries(o).sort((x, y) => y[1] - x[1]).slice(0, 4).map(([k, v]) => `${k} ${Math.round(100 * v / nc)}`).join(', ');
    // 1° grid: coldest / warmest month and seasonal rain over land (new at the grid's height, Beck at its own)
    const a = { tcN: 0, twN: 0, tcB: 0, twB: 0, psN: 0, pwN: 0, psB: 0, pwB: 0, k: 0 };
    for (let j = 0; j < grid.h; j++) for (let i = 0; i < grid.w; i++) {
        const la = grid.lat[j], lo = -180 + (i + 0.5) * grid.step, c = j * grid.w + i;
        if (!inBox(la, lo, b) || !(res.surface.landFrac[c] >= (which === 'islands' ? 0.15 : 0.5)) || !(obs.t2m[c] === obs.t2m[c]) || !(obs.precip[c] === obs.precip[c])) continue;
        let mnN = 1e9, mxN = -1e9, mnB = 1e9, mxB = -1e9;
        for (let m = 0; m < 12; m++) { mnN = Math.min(mnN, T[m * G + c]); mxN = Math.max(mxN, T[m * G + c]); mnB = Math.min(mnB, obs.t2m[m * G + c]); mxB = Math.max(mxB, obs.t2m[m * G + c]); }
        const summer = la >= 0 ? SUMMER_N : WINTER_N, winter = la >= 0 ? WINTER_N : SUMMER_N;
        for (const m of summer) { a.psN += P[m * G + c] / 6; a.psB += obs.precip[m * G + c] / 6; }
        for (const m of winter) { a.pwN += P[m * G + c] / 6; a.pwB += obs.precip[m * G + c] / 6; }
        a.tcN += mnN; a.twN += mxN; a.tcB += mnB; a.twB += mxB; a.k++;
    }
    const f = (x) => (x / a.k).toFixed(1).padStart(5), g0 = (x) => (x / a.k).toFixed(0).padStart(4);
    console.log(`${name.padEnd(17)} new: ${top(cN)}\n${''.padEnd(17)} Beck: ${top(cT)}`);
    console.log(`${''.padEnd(17)} coldest ${f(a.tcN)} /${f(a.tcB)} °C   warmest ${f(a.twN)} /${f(a.twB)}   rain summer ${g0(a.psN)} /${g0(a.psB)}   winter ${g0(a.pwN)} /${g0(a.pwB)} mm/month`);
}
