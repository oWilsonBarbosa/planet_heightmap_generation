/**
 * The zonal-mean temperature row by row across the equator (every stage new, Earth 40K): January and July, over all
 * cells and over the sea (sea level), and the sea's seasonal swing — to find jumps and seasonal bias near the equator.
 * With --stages it also prints the energy balance's own harmonics (mean, annual, semi-annual amplitude) per row.
 *
 *   node tuning/climate/diag-equator.mjs [--set KEY=value,…]   (CORE='{…}' for core options)
 */

import { loadEarthGrayscale } from './lib/earth-context.mjs';
import { buildEarthMesh } from './lib/earth-mesh.mjs';
import { elevToHeightKm } from '../../js/color-map.js';
import { planetClimate } from '../../v2/js/climate/climate.js';
import { setParams } from '../../v2/js/climate/config.js';

const argSet = process.argv.indexOf('--set');
if (argSet > 0) setParams(Object.fromEntries(process.argv[argSet + 1].split(',').map(kv => { const [k, v] = kv.split('='); return [k, +v]; })));
const CORE = process.env.CORE ? JSON.parse(process.env.CORE) : {};
const { gray, width, height } = loadEarthGrayscale();
const e = buildEarthMesh(gray, width, height, { N: 40000 });
const elevKm = new Float32Array(e.mesh.numRegions);
for (let r = 0; r < elevKm.length; r++) elevKm[r] = elevToHeightKm(e.r_elevation[r]);
const res = planetClimate({ xyz: e.r_xyz, elevKm, axes: 'y-up' }, CORE);
const g = res.grid, G = g.size, T = res.months.T, SL = res.stages.temperature.monthlySL, lf = res.surface.landFrac;
const zm = (f, m, j, seaOnly) => { let s = 0, n = 0; for (let i = 0; i < g.w; i++) { const c = j * g.w + i; if (seaOnly && lf[c] > 0.1) continue; s += f[m * G + c]; n++; } return s / n; };
console.log('  lat   Jan all  Jul all    Jan sea  Jul sea   sea swing');
for (let j = 0; j < g.h; j++) {
    const la = g.lat[j]; if (Math.abs(la) > 20) continue;
    let mx = -1e9, mn = 1e9; for (let m = 0; m < 12; m++) { const v = zm(SL, m, j, true); mx = Math.max(mx, v); mn = Math.min(mn, v); }
    console.log(`${la.toFixed(1).padStart(6)}  ${zm(T, 0, j).toFixed(2).padStart(7)} ${zm(T, 6, j).toFixed(2).padStart(8)}   ${zm(SL, 0, j, true).toFixed(2).padStart(7)} ${zm(SL, 6, j, true).toFixed(2).padStart(8)}   ${(mx - mn).toFixed(2).padStart(7)}`);
}

// ── One meridian (--lon, default 20°E): July and January temperature (new vs Beck), rain, height ──
{
    const { loadReferences } = await import('./lib/ref.mjs');
    const { fields: obs } = loadReferences();
    const li = process.argv.indexOf('--lon'), lonA = li > 0 ? +process.argv[li + 1] : 20;
    const i = Math.round((lonA + 180) / g.step - 0.5), P = res.months.P;
    const f = (x) => (x === x ? x.toFixed(1) : '—').padStart(5);
    console.log(`\nMeridian ${lonA}°E (land): lat, height km, Jul T new / Beck, Jan T new / Beck, rain Jul new / Beck, Jan new / Beck`);
    for (let j = 0; j < g.h; j++) {
        const la = g.lat[j]; if (la > 20 || la < -20) continue;
        const c = j * g.w + i; if (lf[c] < 0.5) continue;
        console.log(`  ${la.toFixed(1).padStart(5)}  ${res.surface.meanKm[c].toFixed(2)}  Jul ${f(T[6 * G + c])} /${f(obs.t2m[6 * G + c])}   Jan ${f(T[c])} /${f(obs.t2m[c])}   rain Jul ${f(P[6 * G + c])} /${f(obs.precip[6 * G + c])}  Jan ${f(P[c])} /${f(obs.precip[c])}`);
    }
}
