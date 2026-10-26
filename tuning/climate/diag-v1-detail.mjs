/**
 * V1's Köppen map detail, for comparison with diag-detail.mjs: the share of neighbouring land cells in different
 * classes (and major groups), V1 vs Beck at the same cells.
 *
 *   node tuning/climate/diag-v1-detail.mjs [--n 160000]
 */

import { buildEarthContext } from './lib/earth-context.mjs';
import { runClimate } from './lib/score.mjs';
import { loadReferences, truthAt01 } from './lib/ref.mjs';
import { KOPPEN_CLASSES } from '../../v2/js/climate/koppen.js';

const argN = process.argv.indexOf('--n');
const N = argN > 0 ? +process.argv[argN + 1] : 160000;
const { koppen01 } = loadReferences();
const ctx = buildEarthContext({ N });
const { r_koppen } = runClimate(ctx);
const n = ctx.mesh.numRegions, DEG = 180 / Math.PI;
const truth = new Uint8Array(n);
for (let r = 0; r < n; r++) truth[r] = truthAt01(koppen01, ctx.r_lat[r] * DEG, ctx.r_lon[r] * DEG);
const { adjOffset, adjList } = ctx.mesh;
function edges(k) {
    let pairs = 0, diff = 0, diffG = 0;
    for (let r = 0; r < n; r++) {
        if (!k[r] || !truth[r]) continue;
        for (let q = adjOffset[r]; q < adjOffset[r + 1]; q++) {
            const s = adjList[q]; if (s < r || !k[s] || !truth[s]) continue;
            pairs++;
            if (k[s] !== k[r]) diff++;
            if (KOPPEN_CLASSES[k[s]].code[0] !== KOPPEN_CLASSES[k[r]].code[0]) diffG++;
        }
    }
    return { classEdges: diff / pairs, groupEdges: diffG / pairs };
}
const eT = edges(truth), eV = edges(r_koppen);
console.log(`V1 at ${n.toLocaleString()} cells — patchiness: Beck ${(100 * eT.classEdges).toFixed(1)} %, V1 ${(100 * eV.classEdges).toFixed(1)} %; major groups: Beck ${(100 * eT.groupEdges).toFixed(1)} %, V1 ${(100 * eV.groupEdges).toFixed(1)} %`);
