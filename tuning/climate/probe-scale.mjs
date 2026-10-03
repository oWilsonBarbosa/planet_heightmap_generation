/**
 * Does the climate hold still as the mesh gets finer?
 *
 * Runs the climate chain on the Earth heightmap at several mesh sizes and prints, per size, the
 * Köppen objective and area shares, and the mean annual land temperature and rain by latitude band.
 * The terrain is the same at every size, so anything that moves is the simulation. The climate code
 * is meant to be scale-invariant (see CLAUDE.md) and the defaults were validated at 160K cells.
 * The README ("Reference scores") has what it shows and why.
 *
 *   node tuning/climate/probe-scale.mjs [--n 40000,160000,640000] [--params FILE]
 *
 * 2.56M cells (the largest Detail setting) needs ~2 minutes and a few GB: add
 * `node --max-old-space-size=7000`. Pass `{"PRECIP_COLD_CAPACITY_PER_C": 0}` as --params to read
 * the climate without the cold-land rain factor.
 */
import fs from 'node:fs';
import { buildEarthContext } from './lib/earth-context.mjs';
import { runClimate, scoreKoppen } from './lib/score.mjs';
import { CLIMATE_DEFAULTS } from '../../js/climate-config.js';

const arg = (name, dflt) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : dflt; };
const sizes = arg('--n', '40000,160000,640000').split(',').map(s => parseInt(s, 10));
const paramsFile = arg('--params', null);
const overrides = paramsFile ? (p => p.params || p)(JSON.parse(fs.readFileSync(paramsFile, 'utf8'))) : {};
const RAD = 180 / Math.PI;
const BANDS = [[0, 10], [10, 20], [20, 30], [30, 40], [40, 50], [50, 60], [60, 70], [70, 90]];
const tempC = x => -45 + 90 * Math.max(0, Math.min(1, x));      // the field is 0..1; koppen.js reads it as -45..+45 °C

function measure(N) {
    const ctx = buildEarthContext({ N });
    const run = runClimate(ctx, overrides);
    const score = scoreKoppen(ctx, run.r_koppen);
    const scale = overrides.KOPPEN_PRECIP_SCALE_MM ?? CLIMATE_DEFAULTS.KOPPEN_PRECIP_SCALE_MM;
    const tS = run.tempResult.r_temperature_summer, tW = run.tempResult.r_temperature_winter;
    const pS = run.precipResult.r_precip_summer, pW = run.precipResult.r_precip_winter;
    const acc = BANDS.map(() => ({ t: 0, p: 0, c: 0 }));
    for (let r = 0; r < ctx.mesh.numRegions; r++) {
        if (ctx.r_elevation[r] <= 0) continue;
        const lat = Math.abs(ctx.r_lat[r] * RAD);
        const b = BANDS.findIndex(([lo, hi]) => lat >= lo && lat < hi);
        if (b < 0) continue;
        acc[b].t += (tempC(tS[r]) + tempC(tW[r])) / 2;
        acc[b].p += (pS[r] + pW[r]) * scale;
        acc[b].c++;
    }
    return { N, score, bands: acc.map(a => ({ t: a.t / a.c, p: a.p / a.c })) };
}

const results = sizes.map(measure);
const label = N => (N >= 1e6 ? `${(N / 1e6).toFixed(2)}M` : `${Math.round(N / 1000)}K`).padStart(8);
const row = (name, vals, fmt) => console.log(`${name.padEnd(9)}${vals.map(v => fmt(v).padStart(8)).join('')}`);

console.log(`Earth heightmap${paramsFile ? `, params ${paramsFile}` : ''}\n`);
console.log('cells'.padEnd(9) + results.map(r => label(r.N)).join(''));
row('objective', results.map(r => r.score.objective), v => v.toFixed(4));
console.log('\narea share of scored land, % (Earth, at the first size, in brackets)');
for (const g of ['A', 'B', 'C', 'D', 'E']) {
    const sims = results.map(r => (r.score.groupFractions[g].sim * 100).toFixed(1).padStart(8));
    console.log(`  ${g}`.padEnd(9) + sims.join('') + `   [${(results[0].score.groupFractions[g].truth * 100).toFixed(1)}]`);
}
console.log('\nmean annual land temperature, °C');
BANDS.forEach(([lo, hi], i) => row(`${lo}-${hi}°`, results.map(r => r.bands[i].t), v => v.toFixed(1)));
console.log('\nmean annual land rain, mm');
BANDS.forEach(([lo, hi], i) => row(`${lo}-${hi}°`, results.map(r => r.bands[i].p), v => v.toFixed(0)));
