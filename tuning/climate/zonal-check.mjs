/**
 * Zonal precipitation check against observed Earth.
 *
 * Runs the climate simulation on the imported Earth heightmap and compares its
 * zonal-mean precipitation with observed Earth values. This is a different
 * question from evaluate.mjs: that scores Köppen *classification*, which is
 * insensitive to precipitation being uniformly too flat, while this measures
 * the amplitude of the zonal profile directly.
 *
 * Observed values are approximate zonal means over all surface (land + ocean),
 * mm/yr, from the standard climatology literature. They are here to catch
 * order-of-magnitude divergence, not to be a scoring target.
 *
 * Usage:
 *   node tuning/climate/zonal-check.mjs [--n 40000] [--seed 1234]
 *   node tuning/climate/zonal-check.mjs --params '{"PRECIP_CC_STRENGTH":0}'
 */
import { buildEarthContext } from './lib/earth-context.mjs';
import { runClimate } from './lib/score.mjs';
import { CLIMATE } from '../../js/climate-config.js';

const args = { n: 40000, seed: 1234, params: {} };
for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (a === '--n') args.n = +process.argv[++i];
    else if (a === '--seed') args.seed = +process.argv[++i];
    else if (a === '--params') args.params = JSON.parse(process.argv[++i]);
    else throw new Error('Unknown arg: ' + a);
}

// Approximate observed Earth zonal-mean precipitation, mm/yr, by 10° band.
const OBSERVED = {
    80: 180, 70: 300, 60: 550, 50: 800, 40: 800, 30: 600, 20: 800, 10: 1500, 0: 1900,
    '-10': 1700, '-20': 900, '-30': 650, '-40': 800, '-50': 900, '-60': 600, '-70': 250, '-80': 150,
};
// Approximate observed Köppen group shares of Earth's land area.
const OBSERVED_KOPPEN = { A: 19, B: 30, C: 13, D: 25, E: 13 };
const GROUP_OF = ['O', 'A', 'A', 'A', 'B', 'B', 'B', 'B', 'C', 'C', 'C', 'C', 'C', 'C', 'C', 'C', 'C',
    'D', 'D', 'D', 'D', 'D', 'D', 'D', 'D', 'D', 'D', 'D', 'D', 'E', 'E'];

console.log(`building Earth context (N=${args.n.toLocaleString()}, seed ${args.seed})...`);
const ctx = buildEarthContext({ N: args.n, seed: args.seed, groundTruth: false });
const { precipResult, r_koppen } = runClimate(ctx, args.params);

const MM = CLIMATE.KOPPEN_PRECIP_SCALE_MM;
const pS = precipResult.r_precip_summer, pW = precipResult.r_precip_winter;
const { r_xyz, r_elevation, mesh } = ctx;
const N = mesh.numRegions;

const bands = {}, landBands = {};
for (let r = 0; r < N; r++) {
    // The planet's physical axis is Y (js/generate.js)
    const lat = Math.asin(Math.max(-1, Math.min(1, r_xyz[3 * r + 1]))) * 180 / Math.PI;
    const b = Math.floor(lat / 10) * 10;
    const mm = (pS[r] + pW[r]) * MM;
    (bands[b] ??= { sum: 0, n: 0 });
    bands[b].sum += mm; bands[b].n++;
    if (r_elevation[r] > 0) {
        (landBands[b] ??= { sum: 0, n: 0 });
        landBands[b].sum += mm; landBands[b].n++;
    }
}

console.log('\nZONAL PRECIPITATION (all surface), mm/yr');
console.log('   band        simulated   observed    ratio   land only');
let sumAbsLogErr = 0, nBands = 0;
for (const k of Object.keys(bands).map(Number).sort((a, b) => b - a)) {
    const obs = OBSERVED[k];
    const sim = bands[k].sum / bands[k].n;
    const land = landBands[k] ? landBands[k].sum / landBands[k].n : null;
    let ratioTxt = '     -';
    if (obs) {
        const ratio = sim / obs;
        ratioTxt = ratio.toFixed(2).padStart(6);
        sumAbsLogErr += Math.abs(Math.log(ratio));
        nBands++;
    }
    console.log(`   ${String(k).padStart(4)}..${String(k + 10).padStart(4)}  ${sim.toFixed(0).padStart(10)}  ` +
        `${(obs ?? '-').toString().padStart(9)}   ${ratioTxt}   ${land === null ? '    -' : land.toFixed(0).padStart(9)}`);
}
// Mean absolute log ratio: 0 is perfect, 0.69 means a typical factor-of-2 error.
console.log(`\n   mean |ln(sim/obs)| = ${(sumAbsLogErr / nBands).toFixed(3)}   (0 = perfect, 0.69 = typical factor of 2)`);

// Polar-to-tropical contrast is the specific thing a moisture ceiling fixes.
const polar = [80, 70, -80, -70].filter((k) => bands[k]).map((k) => bands[k].sum / bands[k].n);
const tropic = [0, -10].filter((k) => bands[k]).map((k) => bands[k].sum / bands[k].n);
const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
const obsPolar = mean([OBSERVED[80], OBSERVED[70], OBSERVED['-80'], OBSERVED['-70']]);
const obsTropic = mean([OBSERVED[0], OBSERVED['-10']]);
console.log(`   polar/tropical contrast: simulated ${(mean(polar) / mean(tropic)).toFixed(3)}   ` +
    `observed ${(obsPolar / obsTropic).toFixed(3)}`);

// Köppen group balance — guards against the ceiling wrecking classification
const kc = {};
let landCells = 0;
for (let r = 0; r < N; r++) {
    if (r_elevation[r] <= 0) continue;
    const g = GROUP_OF[r_koppen[r]];
    if (g === 'O') continue;
    kc[g] = (kc[g] || 0) + 1;
    landCells++;
}
console.log('\nKÖPPEN GROUP SHARE OF LAND');
console.log('   group   simulated   observed');
let groupErr = 0;
for (const g of 'ABCDE') {
    const sim = 100 * (kc[g] || 0) / landCells;
    console.log(`     ${g}     ${sim.toFixed(1).padStart(8)}%  ${String(OBSERVED_KOPPEN[g]).padStart(8)}%`);
    groupErr += Math.abs(sim - OBSERVED_KOPPEN[g]);
}
console.log(`\n   group balance error = ${groupErr.toFixed(1)} points (sum of absolute differences; lower is better)`);
