/**
 * Where the new climate spends its time: every stage call timed, over a few runs of the whole climate on Earth.
 *
 *   node tuning/climate/profile-climate.mjs [--n 40000] [--runs 3] [--set KEY=value,…]
 */

import { loadEarthGrayscale } from './lib/earth-context.mjs';
import { buildEarthMesh } from './lib/earth-mesh.mjs';
import { elevToHeightKm } from '../../js/color-map.js';
import { computeClimate } from '../../v2/js/climate/core.js';
import { energyBalanceTemperature } from '../../v2/js/climate/temperature.js';
import { derivedCirculation } from '../../v2/js/climate/circulation.js';
import { windDrivenOcean } from '../../v2/js/climate/ocean.js';
import { columnWaterRain } from '../../v2/js/climate/rain.js';
import { setParams } from '../../v2/js/climate/config.js';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const argSet = process.argv.indexOf('--set');
if (argSet > 0) setParams(Object.fromEntries(process.argv[argSet + 1].split(',').map(kv => { const [k, v] = kv.split('='); return [k, +v]; })));
const N = +arg('--n', 40000), RUNS = +arg('--runs', 3);
const { gray, width, height } = loadEarthGrayscale();
const earth = buildEarthMesh(gray, width, height, { N });
const elevKm = new Float32Array(earth.mesh.numRegions);
for (let r = 0; r < elevKm.length; r++) elevKm[r] = elevToHeightKm(earth.r_elevation[r]);

const acc = {};
const timed = (name, fn) => (...a) => { const t = performance.now(); const r = fn(...a); (acc[name] ??= []).push(performance.now() - t); return r; };
let last;
for (let run = 0; run < RUNS; run++) {
    for (const k of Object.keys(acc)) acc[k] = [];
    const t = performance.now();
    last = computeClimate({ xyz: earth.r_xyz, elevKm, axes: 'y-up' }, {
        stages: {
            temperature: timed('temperature', energyBalanceTemperature()), circulation: timed('circulation', derivedCirculation()),
            ocean: timed('ocean', windDrivenOcean()), rain: timed('rain', columnWaterRain()),
        },
    });
    console.log(`run ${run + 1}: ${(performance.now() - t).toFixed(0)} ms — ${Object.entries(acc).map(([k, v]) => `${k} ${v.map(x => x.toFixed(0)).join('+')}`).join(' · ')}`);
}
console.log(`  timing: ${last.timing.map(t => `${t.stage} ${t.ms.toFixed(0)}`).join(' · ')}`);
const T = last.stages.temperature;
if (T.profile) console.log(`  last temperature call: ${Object.entries(T.profile).map(([k, v]) => `${k} ${(+v).toFixed(0)}`).join(', ')}`);
if (last.stages.rain.newton) console.log(`  rain: ${last.stages.rain.newton} Newton steps, ${last.stages.rain.cycles} cycles; ${Object.entries(last.stages.rain.profile).map(([k, v]) => `${k} ${(+v).toFixed(0)}`).join(', ')}`);
