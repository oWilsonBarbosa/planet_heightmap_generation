/**
 * Where the new climate is too wet or too dry (Earth, every stage new): a text map of annual rain on land, new ÷ Beck,
 * in 3° boxes over a region — and the same for summer (the hemisphere's warm half) and winter.
 *
 *   node tuning/climate/diag-wet-map.mjs [--region na|eu|as|sa|af|au] [--set KEY=value,…]   (CORE='{…}' for core options)
 *
 * Symbols: '#' ≥ ×2, '+' ×1.4–2, '.' within ×1.4, '-' ×0.5–0.7, '=' < ×0.5; a blank is sea or no data.
 */

import { loadReferences } from './lib/ref.mjs';
import { loadEarthGrayscale } from './lib/earth-context.mjs';
import { buildEarthMesh } from './lib/earth-mesh.mjs';
import { elevToHeightKm } from '../../js/color-map.js';
import { planetClimate } from '../../v2/js/climate/climate.js';
import { setParams } from '../../v2/js/climate/config.js';

const argSet = process.argv.indexOf('--set');
if (argSet > 0) setParams(Object.fromEntries(process.argv[argSet + 1].split(',').map(kv => { const [k, v] = kv.split('='); return [k, +v]; })));
const ri = process.argv.indexOf('--region'), region = ri > 0 ? process.argv[ri + 1] : 'na';
const BOXES = {
    na: { lat: [72, 15], lon: [-170, -52] }, eu: { lat: [72, 34], lon: [-12, 60] }, as: { lat: [75, 5], lon: [40, 150] },
    sa: { lat: [13, -56], lon: [-82, -34] }, af: { lat: [37, -35], lon: [-18, 52] }, au: { lat: [-10, -44], lon: [112, 155] },
};
const B = BOXES[region];
const CORE = process.env.CORE ? JSON.parse(process.env.CORE) : {};
const { grid, fields: obs } = loadReferences();
const G = grid.size;
const { gray, width, height } = loadEarthGrayscale();
const e = buildEarthMesh(gray, width, height, { N: 40000 });
const elevKm = new Float32Array(e.mesh.numRegions);
for (let r = 0; r < elevKm.length; r++) elevKm[r] = elevToHeightKm(e.r_elevation[r]);
const res = planetClimate({ xyz: e.r_xyz, elevKm, axes: 'y-up' }, CORE);
const P = res.months.P, lf = res.surface.landFrac;

const STEP = 3;
const sym = (x) => !(x > 0) ? ' ' : x >= 2 ? '#' : x >= 1.4 ? '+' : x > 1 / 1.4 ? '.' : x > 0.5 ? '-' : '=';
for (const [name, months] of [['year', [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]], ['Apr–Sep', [3, 4, 5, 6, 7, 8]], ['Oct–Mar', [9, 10, 11, 0, 1, 2]]]) {
    console.log(`\n${region}: rain on land new ÷ Beck, ${name} (rows ${B.lat[0]}° → ${B.lat[1]}°, columns ${B.lon[0]}° → ${B.lon[1]}°, ${STEP}° boxes)`);
    let totN = 0, totB = 0;
    for (let la = B.lat[0]; la > B.lat[1]; la -= STEP) {
        let row = `${String(la).padStart(4)} `;
        for (let lo = B.lon[0]; lo < B.lon[1]; lo += STEP) {
            let sN = 0, sB = 0, n = 0;
            for (let dj = 0; dj < STEP; dj++) for (let di = 0; di < STEP; di++) {
                const c = grid.cellAt(la - dj - 0.5, lo + di + 0.5);
                if (!(lf[c] >= 0.5)) continue;
                let pn = 0, pb = 0; for (const m of months) { pn += P[m * G + c]; pb += obs.precip[m * G + c]; }
                if (!(pb === pb)) continue;
                sN += pn; sB += pb; n++;
            }
            row += n ? sym((sN + 1) / (sB + 1)) : ' ';
            totN += sN; totB += sB;
        }
        console.log(row);
    }
    console.log(`  region total new ÷ Beck: ${(totN / totB).toFixed(2)}`);
}
