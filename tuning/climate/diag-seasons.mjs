/**
 * The seasons of the continents' interiors and coasts (Earth, every stage new): warmest and coldest month over land in
 * named boxes, new vs Beck (1° grid, both at the grid cells' mean land height), and the swing between them — to see
 * where summers are too cool or winters too mild.
 *
 *   node tuning/climate/diag-seasons.mjs [--set KEY=value,…]   (CORE='{…}' for core options)
 */

import { loadEarthGrayscale } from './lib/earth-context.mjs';
import { buildEarthMesh } from './lib/earth-mesh.mjs';
import { loadReferences } from './lib/ref.mjs';
import { elevToHeightKm } from '../../js/color-map.js';
import { planetClimate } from '../../v2/js/climate/climate.js';
import { setParams } from '../../v2/js/climate/config.js';

const argSet = process.argv.indexOf('--set');
if (argSet > 0) setParams(Object.fromEntries(process.argv[argSet + 1].split(',').map(kv => { const [k, v] = kv.split('='); return [k, +v]; })));
const CORE = process.env.CORE ? JSON.parse(process.env.CORE) : {};
export const BOXES = [
    ['Australia interior', [-28, -19, 120, 140]],
    ['Sahara',            [20, 30, -5, 25]],
    ['Arabia',            [18, 28, 42, 55]],
    ['Iran-Pakistan',     [26, 34, 55, 72]],
    ['Kalahari',          [-28, -20, 17, 27]],
    ['Great Basin',       [37, 43, -119, -112]],
    ['US Great Plains',   [35, 45, -102, -95]],
    ['Kazakhstan',        [43, 52, 55, 78]],
    ['Siberia',           [55, 65, 90, 120]],
    ['Canada interior',   [50, 60, -110, -95]],
    ['Argentina',         [-38, -28, -68, -60]],
    ['UK and Ireland',    [51, 57, -8, 0]],
    ['France',            [44, 49, -1, 5]],
    ['Amazon',            [-10, 0, -70, -55]],
    ['Congo',             [-4, 4, 15, 28]],
    ['India',             [18, 26, 74, 84]],
];
const { grid, fields: obs } = loadReferences();
const G = grid.size;
const { gray, width, height } = loadEarthGrayscale();
const e = buildEarthMesh(gray, width, height, { N: 40000 });
const elevKm = new Float32Array(e.mesh.numRegions);
for (let r = 0; r < elevKm.length; r++) elevKm[r] = elevToHeightKm(e.r_elevation[r]);
const res = planetClimate({ xyz: e.r_xyz, elevKm, axes: 'y-up' }, CORE);
const T = res.months.T, lf = res.surface.landFrac;
console.log('Land, 1° grid: warmest month, coldest month, swing — new / Beck (°C)');
for (const [name, [la0, la1, lo0, lo1]] of BOXES) {
    let wN = 0, wB = 0, cN = 0, cB = 0, n = 0;
    for (let j = 0; j < grid.h; j++) { const la = grid.lat[j]; if (la < la0 || la > la1) continue;
        for (let i = 0; i < grid.w; i++) { const lo = -180 + (i + 0.5) * grid.step; if (lo < lo0 || lo > lo1) continue;
            const c = j * grid.w + i; if (!(lf[c] >= 0.5) || !(obs.t2m[c] === obs.t2m[c])) continue;
            let mxN = -1e9, mnN = 1e9, mxB = -1e9, mnB = 1e9;
            for (let m = 0; m < 12; m++) { mxN = Math.max(mxN, T[m * G + c]); mnN = Math.min(mnN, T[m * G + c]); mxB = Math.max(mxB, obs.t2m[m * G + c]); mnB = Math.min(mnB, obs.t2m[m * G + c]); }
            wN += mxN; wB += mxB; cN += mnN; cB += mnB; n++; } }
    const f = (x) => (x / n).toFixed(1).padStart(5);
    console.log(`  ${name.padEnd(19)} warmest ${f(wN)} /${f(wB)}   coldest ${f(cN)} /${f(cB)}   swing ${f(wN - cN)} /${f(wB - cB)}`);
}
