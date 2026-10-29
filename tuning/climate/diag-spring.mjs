/**
 * The spring of cold land: the simulated climate's months against Beck's (1991–2020, 1°) where winters freeze (Beck's
 * Köppen D and E), by latitude band and in named boxes — the temperature month by month, the rain and snow, and the
 * snow the winter piles up and when it melts, by the rivers' own snow model (v2/js/finish/finish.js runoffMonths: snow
 * kept below 0 °C, melting at FINISH.snowMeltMmPerC a °C a month), so a river's spring flood can be traced to the
 * climate's spring. Both on the 1° grid at the grid cells' mean land height.
 *
 *   node tuning/climate/diag-spring.mjs [--n 160000] [--set KEY=value,…]
 */

import Delaunator from 'delaunator';
import { setDelaunator } from '../../js/sphere-mesh.js';
import { elevToHeightKm } from '../../js/color-map.js';
import { planetClimate } from '../../v2/js/climate/climate.js';
import { setParams } from '../../v2/js/climate/config.js';
import { FINISH } from '../../v2/js/finish/finish-config.js';
import { loadEarthGrayscale } from './lib/earth-context.mjs';
import { buildEarthMesh } from './lib/earth-mesh.mjs';
import { loadReferences } from './lib/ref.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
if (arg('--set')) setParams(Object.fromEntries(arg('--set').split(',').map(kv => { const [k, v] = kv.split('='); return [k, +v]; })));
const N = Number(arg('--n', 160000));
setDelaunator(Delaunator);
const { gray, width, height } = loadEarthGrayscale();
const E = buildEarthMesh(gray, width, height, { N });
const n = E.r_elevation.length, elevKm = new Float32Array(n), land = new Uint8Array(n);
for (let r = 0; r < n; r++) { elevKm[r] = elevToHeightKm(E.r_elevation[r]); land[r] = E.r_elevation[r] > 0 ? 1 : 0; }
const sim = planetClimate({ xyz: E.r_xyz, elevKm, land, axes: 'y-up' }, { greenhouseWm2: 0, precipScale: 1 });
const ref = loadReferences(), { grid } = ref, G = grid.size;

const MONTHS = 'JFMAMJJASOND';
/** One place's year as the rivers see it: each month's snow left at its end, its melt, its liquid water (rain and melt). */
function snowYear(T, P) {
    const snowEnd = new Float64Array(12), melt = new Float64Array(12), liquid = new Float64Array(12);
    let snow = 0;
    for (let cyc = 0; cyc < 3; cyc++) for (let m = 0; m < 12; m++) {
        let mt = 0, liq;
        if (T[m] < 0) { snow += P[m]; liq = 0; } else { mt = Math.min(snow, FINISH.snowMeltMmPerC * T[m]); snow -= mt; liq = P[m] + mt; }
        if (cyc === 2) { snowEnd[m] = snow; melt[m] = mt; liquid[m] = liq; }
    }
    const peakSnow = Math.max(...snowEnd), top = snowEnd.indexOf(peakSnow);
    let gone = -1;                                     // the first month after the deepest snow that ends with none
    for (let k = 1; k <= 12 && peakSnow > 0; k++) if (snowEnd[(top + k) % 12] === 0) { gone = (top + k) % 12; break; }
    const meltTop = melt.indexOf(Math.max(...melt)), wetTop = liquid.indexOf(Math.max(...liquid));
    return { peakSnow, gone, meltTop, wetTop, liquid };
}
const at = (f, g) => Array.from({ length: 12 }, (_, m) => f[m * G + g]);
/** Month b relative to month a, −5 … 6 (positive: b later). */
const later = (a, b) => ((b - a + 17) % 12) - 5;

const cold = [];
for (let g = 0; g < G; g++) {
    const k = ref.koppen[g];
    if (!ref.land[g] || k < 17) continue;
    const To = at(ref.fields.t2m, g), Po = at(ref.fields.precip, g).map(v => Math.max(0, v));
    const Ts = at(sim.months.T, g), Ps = at(sim.months.P, g).map(v => Math.max(0, v));
    if (Ts.some(v => !(v === v))) continue;
    cold.push({ g, lat: grid.lat[Math.floor(g / grid.w)], lon: grid.lon[g % grid.w], To, Po, Ts, Ps, o: snowYear(To, Po), s: snowYear(Ts, Ps) });
}

const f1 = (x) => (x === x ? (x >= 0 ? ' ' : '') + x.toFixed(1) : '   —').padStart(5);
function report(name, cells) {
    if (cells.length < 5) return;
    const mean = (f) => cells.reduce((t, c) => t + f(c), 0) / cells.length;
    const dT = Array.from({ length: 12 }, (_, m) => mean(c => c.Ts[m] - c.To[m]));
    const To = Array.from({ length: 12 }, (_, m) => mean(c => c.To[m]));
    const pr = Array.from({ length: 12 }, (_, m) => mean(c => c.Ps[m]) / Math.max(1e-6, mean(c => c.Po[m])));
    const both = cells.filter(c => c.o.gone >= 0 && c.s.gone >= 0);
    const goneEarly = both.filter(c => later(c.o.gone, c.s.gone) < 0).length / Math.max(1, both.length);
    const goneLate = both.filter(c => later(c.o.gone, c.s.gone) > 0).length / Math.max(1, both.length);
    const shift = (key) => mean(c => later(c.o[key], c.s[key]));
    console.log(`\n${name} (${cells.length} cells)`);
    console.log(`  month              ${[...MONTHS].map(x => x.padStart(5)).join('')}`);
    console.log(`  T observed (°C)    ${To.map(f1).join('')}`);
    console.log(`  T model − observed ${dT.map(f1).join('')}`);
    console.log(`  rain model ÷ obs.  ${pr.map(v => v.toFixed(2).padStart(5)).join('')}`);
    console.log(`  deepest snow ${mean(c => c.s.peakSnow).toFixed(0)} mm of water (observed ${mean(c => c.o.peakSnow).toFixed(0)}); gone ${both.length ? `${(100 * goneEarly).toFixed(0)} % a month or more early, ${(100 * goneLate).toFixed(0)} % late` : '—'}`
        + `; the melt's peak ${shift('meltTop') >= 0 ? '+' : ''}${shift('meltTop').toFixed(2)} months, rain-and-melt's ${shift('wetTop') >= 0 ? '+' : ''}${shift('wetTop').toFixed(2)} (negative: early)`);
}
console.log(`Cold land (Beck's Köppen D and E), Earth at ${n.toLocaleString()} regions: the climate's months against Beck's`);
for (let lat = 80; lat > 30; lat -= 10) report(`${lat - 10}–${lat}° N`, cold.filter(c => c.lat > lat - 10 && c.lat <= lat));
report('south of the equator', cold.filter(c => c.lat < 0));
const BOXES = [['Siberia', [55, 70, 90, 140]], ['Yakutia, Kolyma', [60, 70, 120, 160]], ['West Siberia', [55, 68, 60, 90]],
    ['European Russia', [52, 65, 30, 60]], ['Scandinavia', [58, 70, 5, 30]], ['Canada interior', [50, 62, -115, -90]],
    ['Quebec, Labrador', [48, 60, -80, -58]], ['Alaska, Yukon', [60, 70, -165, -130]], ['Rockies', [40, 55, -120, -105]],
    ['Mongolia, Manchuria', [42, 52, 95, 130]], ['Tibet', [30, 37, 78, 100]]];
for (const [name, [la0, la1, lo0, lo1]] of BOXES) report(name, cold.filter(c => c.lat >= la0 && c.lat <= la1 && c.lon >= lo0 && c.lon <= lo1));
