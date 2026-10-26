/**
 * Mediterranean climates, inside the rain stage (every stage new, Earth 40K): column water, its relative humidity,
 * rain-out factors, evaporation, winds, temperatures in each of the five Cs regions, winter and summer.
 *
 *   node tuning/climate/diag-med.mjs [--set KEY=value,…]
 */

import { loadEarthGrayscale } from './lib/earth-context.mjs';
import { buildEarthMesh } from './lib/earth-mesh.mjs';
import { elevToHeightKm } from '../../js/color-map.js';
import { planetClimate } from '../../v2/js/climate/climate.js';
import { setParams } from '../../v2/js/climate/config.js';

const argSet = process.argv.indexOf('--set');
if (argSet > 0) setParams(Object.fromEntries(process.argv[argSet + 1].split(',').map(kv => { const [k, v] = kv.split('='); return [k, +v]; })));
globalThis.RAIN_DEBUG = true;
const { gray, width, height } = loadEarthGrayscale();
const e = buildEarthMesh(gray, width, height, { N: 40000 });
const elevKm = new Float32Array(e.mesh.numRegions);
for (let r = 0; r < elevKm.length; r++) elevKm[r] = elevToHeightKm(e.r_elevation[r]);
const res = planetClimate({ xyz: e.r_xyz, elevKm, axes: 'y-up' });
const { g, prep, Wk, results, land } = res.stages.rain.debug;
const SEC = 30.44 * 86400;
const REGIONS = process.argv.includes('--tibet') ? [['Tibet', [30, 36, 80, 100], 0], ['Tibet S rim', [27, 30, 85, 100], 0], ['Bangladesh', [22, 26, 88, 92], 0], ['Gangetic plain', [24, 28, 78, 88], 0], ['Yunnan', [22, 28, 97, 104], 0]] : [['Mediterranean', [35, 42, -8, 30], 0], ['California', [33, 40, -123, -117], 0], ['central Chile', [-38, -31, -73, -70], 1], ['SW Australia', [-35, -30, 114, 120], 1], ['Cape', [-35, -32, 17, 21], 1]];
const ocean = (la0, la1, lo0, lo1) => [la0, la1, lo0 - 12, lo0 - 2];      // the sea just west of the region
for (const [name, [la0, la1, lo0, lo1], south] of REGIONS) {
    for (const [what, k] of [['winter', south ? 3 : 0], ['summer', south ? 0 : 3]]) {
        for (const [where, b] of [['land', [la0, la1, lo0, lo1]], ['sea W', ocean(la0, la1, lo0, lo1)]]) {
            const acc = { n: 0, P: 0, W: 0, Ws: 0, rate: 0, E: 0, u: 0, v: 0, T: 0, K: 0 };
            for (let j = 0; j < g.h; j++) {
                const la = g.lat[j]; if (la < b[0] - 1 || la > b[1] + 1) continue;
                for (let i = 0; i < g.w; i++) {
                    const lo = g.lon[i]; if (lo < b[2] - 1 || lo > b[3] + 1) continue;
                    const c = j * g.w + i; if ((where === 'land') !== (land[c] >= 0.5)) continue;
                    const p = prep[k];
                    acc.n++; acc.P += results[k].P[c] * SEC; acc.W += Wk[k][c]; acc.Ws += p.Ws[c]; acc.rate += p.rate[c]; acc.E += results[k].E[c] * SEC;
                    acc.u += p.gu[c]; acc.v += p.gv[c]; acc.T += p.Tair[c]; acc.K += p.Krow[j] * 6.371e6 ** 2 / 1e6;
                }
            }
            const f = (x, d = 0) => (acc.n ? (x / acc.n).toFixed(d) : '—');
            console.log(`${name.padEnd(14)} ${what} ${where.padEnd(5)} P ${f(acc.P).padStart(4)}  W ${f(acc.W, 1).padStart(5)}/${f(acc.Ws, 1).padStart(5)}  rate ${f(acc.rate, 2)}  E ${f(acc.E).padStart(4)}  wind ${f(acc.u, 1)},${f(acc.v, 1)}  T ${f(acc.T, 1)}  K ${f(acc.K, 1)}`);
        }
    }
}
