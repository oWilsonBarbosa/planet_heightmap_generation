/**
 * Rain across a test planet: annual (and June–August / December–February) rain, height, evaporation and column
 * humidity along one latitude — e.g. across the coastal range of the "mountains" planet.
 *
 *   node tuning/climate/diag-planet-rain.mjs [kind=mountains] [lat=45] [--set RAIN_OROGRAPHIC=0.5]
 */

import Delaunator from 'delaunator';
import { buildSphere, setDelaunator } from '../../js/sphere-mesh.js';
import { makeRng } from '../../js/rng.js';
import { computeClimate } from '../../v2/js/climate/core.js';
import { energyBalanceTemperature } from '../../v2/js/climate/temperature.js';
import { derivedCirculation } from '../../v2/js/climate/circulation.js';
import { windDrivenOcean } from '../../v2/js/climate/ocean.js';
import { columnWaterRain } from '../../v2/js/climate/rain.js';
import { setParams } from '../../v2/js/climate/config.js';
import { buildTestPlanet } from '../../v2/js/climate/test-planets.js';

setDelaunator(Delaunator);
const args = process.argv.slice(2).filter(a => !a.startsWith('--') && !a.includes('='));
const argSet = process.argv.indexOf('--set');
if (argSet > 0) setParams(Object.fromEntries(process.argv[argSet + 1].split(',').map(kv => { const [k, v] = kv.split('='); return [k, +v]; })));
const kind = args[0] ?? 'mountains', lat = +(args[1] ?? 45);
const p = buildTestPlanet(kind, 40000, buildSphere, makeRng(7));
const res = computeClimate({ xyz: p.xyz, elevKm: p.elevKm, axes: p.axes }, { stages: { temperature: energyBalanceTemperature(), circulation: derivedCirculation(), ocean: windDrivenOcean(), rain: columnWaterRain() } });
const g = res.grid, G = g.size, j = Math.round((90 - lat) / g.step - 0.5);
const R = res.stages.rain, W = res.stages.circulation;
const mean = (f, months, c, L = 12) => { let s = 0; for (const m of months) s += f[m * G + c]; return s / months.length; };
const ALL = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], K = res.anchorMonths.length, KA = Array.from({ length: K }, (_, k) => k);
console.log(`${kind} at ${g.lat[j]}°: lon, height km, rain year / Jun–Aug / Dec–Feb mm/month, evaporation, column RH, wind u`);
for (let i = 0; i < g.w; i += 2) {
    const lon = g.lon[i]; if (lon < -60 || lon > 60) continue;
    const c = j * g.w + i;
    console.log(`  ${lon.toFixed(1).padStart(6)}  h ${res.surface.meanKm[c].toFixed(2).padStart(5)}  P ${mean(res.months.P, ALL, c).toFixed(0).padStart(4)} ${mean(res.months.P, [5, 6, 7], c).toFixed(0).padStart(4)} ${mean(res.months.P, [11, 0, 1], c).toFixed(0).padStart(4)}`
        + `  E ${mean(R.E, KA, c).toFixed(0).padStart(4)}  r ${mean(R.r, KA, c).toFixed(2)}  u ${mean(W.u, ALL, c).toFixed(1)}`);
}
