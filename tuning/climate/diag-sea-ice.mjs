/**
 * The polar seas and lands, Earth against observations: sea-level temperature and sea ice (against OISST) in the
 * Arctic, the Nordic seas and the Southern Ocean; the land's temperature by month at 50–80° N against ERA5 (Greenland
 * aside); a few Arctic stations' January, April and October. A quick look (~10 s at 160K) at the polar climate.
 *
 *   node tuning/climate/diag-sea-ice.mjs [--n 160000] [--set KEY=value,…]
 */

import { loadEarthGrayscale } from './lib/earth-context.mjs';
import { buildEarthMesh } from './lib/earth-mesh.mjs';
import { loadReferences } from './lib/ref.mjs';
import { elevToHeightKm } from '../../js/color-map.js';
import { planetClimate } from '../../v2/js/climate/climate.js';
import { setParams } from '../../v2/js/climate/config.js';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
if (arg('--set')) setParams(Object.fromEntries(arg('--set').split(',').map(kv => { const [k, v] = kv.split('='); return [k, +v]; })));
const { grid, fields: obs, land: obsLand } = loadReferences();
const { gray, width, height } = loadEarthGrayscale();
const e = buildEarthMesh(gray, width, height, { N: +arg('--n', 160000) });
const elevKm = Float32Array.from(e.r_elevation, v => elevToHeightKm(v));
const t0 = performance.now();
const res = planetClimate({ xyz: e.r_xyz, elevKm, axes: 'y-up' });
const T = res.stages.temperature, S = res.surface, G = grid.size, w = grid.w;

// area-weighted mean over a box (lat0, lat1, lon0, lon1) of the cells sel() picks; Greenland's land left out
const box = ([la0, la1, lo0, lo1], sel, f) => {
    let s = 0, k = 0;
    for (let j = 0; j < grid.h; j++) {
        const la = grid.lat[j]; if (la < la0 || la >= la1) continue;
        const wt = Math.cos(la * Math.PI / 180);
        for (let i = 0; i < w; i++) {
            const lo = grid.lon[i], c = j * w + i;
            if (lo < lo0 || lo >= lo1 || (la >= 59 && lo >= -75 && lo <= -10 && obsLand[c]) || !sel(c)) continue;
            const v = f(c); if (v === v) { s += wt * v; k += wt; }
        }
    }
    return s / k;
};
const sea = (c) => S.landFrac[c] < 0.5, land = (c) => obsLand[c] && S.landFrac[c] >= 0.5;
const fx = (x, d = 1, p = 6) => (x === x ? x.toFixed(d) : '—').padStart(p);
const MONTHS = [0, 2, 4, 6, 8, 10];
console.log(`Earth, ${elevKm.length} cells, climate in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
console.log('\nseas: sea level °C (Jan Mar May Jul Sep Nov); sea ice, simulated / OISST, in March and September');
for (const [name, b] of [['Arctic ≥ 80° N', [80, 90, -180, 180]], ['Arctic 70–80° N', [70, 80, -180, 180]], ['Norwegian Sea', [62, 72, -5, 15]],
    ['Barents Sea', [70, 80, 20, 55]], ['Southern 60–70° S', [-70, -60, -180, 180]], ['Southern 70–80° S', [-80, -70, -180, 180]]]) {
    const ice = (m, f) => box(b, sea, c => f[m * G + c]);
    console.log(`  ${name.padEnd(18)} ${MONTHS.map(m => fx(box(b, sea, c => T.monthlySL[m * G + c]), 0, 4)).join('')}   ice Mar ${fx(ice(2, T.seaIce), 2, 4)} / ${fx(ice(2, obs.seaIce), 2, 4)}, Sep ${fx(ice(8, T.seaIce), 2, 4)} / ${fx(ice(8, obs.seaIce), 2, 4)}`);
}
console.log('\nland, simulated − ERA5 (°C), J F M A M J J A S O N D, and the months\' rms');
for (const [lo, hi] of [[50, 60], [60, 70], [70, 80]]) {
    const d = Array.from({ length: 12 }, (_, m) => box([lo, hi, -180, 180], land, c => res.months.T[m * G + c]) - box([lo, hi, -180, 180], land, c => obs.t2m[m * G + c]));
    console.log(`  ${lo}–${hi}° N ${d.map(x => fx(x, 1, 5)).join('')}   rms ${Math.sqrt(d.reduce((a, x) => a + x * x, 0) / 12).toFixed(2)}`);
}
const STATIONS = [['Tromsø', 69.65, 18.96], ['Murmansk', 68.97, 33.08], ['Utqiaġvik', 71.29, -156.79], ['Cambridge Bay', 69.12, -105.06], ['Iqaluit', 63.75, -68.52]];
console.log('\nstations (1° cell), simulated / ERA5 °C, Jan · Apr · Oct');
for (const [name, la, lo] of STATIONS) {
    const c = Math.floor((90 - la) / grid.step) * w + Math.floor((lo + 180) / grid.step);
    console.log(`  ${name.padEnd(14)} ${[0, 3, 9].map(m => `${fx(res.months.T[m * G + c], 0, 4)} / ${fx(obs.t2m[m * G + c], 0, 4)}`).join(' · ')}`);
}
