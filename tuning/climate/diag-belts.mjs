/**
 * The circulation's belts through the year (every stage new, Earth 40K): the rain belt (ITCZ), the subtropical highs
 * and subpolar lows per hemisphere, and the midlatitude pressure drops — to see how far the highs migrate.
 * Observed for comparison: the latitude of the zonal-mean sea-level pressure maximum per hemisphere (NCEP).
 *
 *   node tuning/climate/diag-belts.mjs [--set KEY=value,…]
 */

import { loadEarthGrayscale } from './lib/earth-context.mjs';
import { buildEarthMesh } from './lib/earth-mesh.mjs';
import { loadReferences } from './lib/ref.mjs';
import { elevToHeightKm } from '../../js/color-map.js';
import { planetClimate } from '../../v2/js/climate/climate.js';
import { setParams } from '../../v2/js/climate/config.js';

const argSet = process.argv.indexOf('--set');
if (argSet > 0) setParams(Object.fromEntries(process.argv[argSet + 1].split(',').map(kv => { const [k, v] = kv.split('='); return [k, +v]; })));
const { grid, fields: obs } = loadReferences();
const { gray, width, height } = loadEarthGrayscale();
const e = buildEarthMesh(gray, width, height, { N: 40000 });
const elevKm = new Float32Array(e.mesh.numRegions);
for (let r = 0; r < elevKm.length; r++) elevKm[r] = elevToHeightKm(e.r_elevation[r]);
const res = planetClimate({ xyz: e.r_xyz, elevKm, axes: 'y-up' });
const belts = res.stages.circulation.belts, G = grid.size;
/** Latitude of the zonal-mean pressure maximum between 15° and 50° in each hemisphere (sea cells only). */
function obsHigh(m, sgn) {
    let best = -1e9, lat = NaN;
    for (let j = 0; j < grid.h; j++) {
        const la = grid.lat[j] * sgn; if (la < 15 || la > 50) continue;
        let s = 0, n = 0;
        for (let i = 0; i < grid.w; i++) { const c = j * grid.w + i; if (res.surface.landFrac[c] > 0.2) continue; const v = obs.slp[m * G + c]; if (v === v) { s += v; n++; } }
        if (n && s / n > best) { best = s / n; lat = grid.lat[j]; }
    }
    return lat;
}
const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
console.log('month  ITCZ   high N (real)   high S (real)   low N  low S   drop N  drop S (hPa)');
belts.forEach((b, m) => console.log(`${M[m]}   ${b.itcz.toFixed(1).padStart(5)}   ${b.hiN.toFixed(1).padStart(5)} (${obsHigh(m, 1).toFixed(1).padStart(5)})   ${b.hiS.toFixed(1).padStart(6)} (${obsHigh(m, -1).toFixed(1).padStart(6)})   ${b.loN.toFixed(0).padStart(4)}  ${b.loS.toFixed(0).padStart(5)}   ${b.midN.toFixed(1).padStart(5)}  ${b.midS.toFixed(1).padStart(5)}`));
