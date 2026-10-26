/**
 * Where the rain stage is wrong: zonal means over land and sea (rain, evaporation, column water and its relative
 * humidity) and named boxes by season, against Beck (land) and GPCP (all). Open loop (observed winds and temperature).
 *
 *   node tuning/climate/diag-rain.mjs [--derived] [--set RAIN_EDDY_DIFF=2e6,...]
 *   (--derived: the circulation stage's winds, from the observed temperature)
 */

import { loadEarthGrayscale } from './lib/earth-context.mjs';
import { buildEarthMesh } from './lib/earth-mesh.mjs';
import { loadReferences, seasonMean, JJA, DJF } from './lib/ref.mjs';
import { elevToHeightKm } from '../../js/color-map.js';
import { aggregateSurface, cellLatLon } from '../../v2/js/climate/core.js';
import { energyBalanceTemperature } from '../../v2/js/climate/temperature.js';
import { columnWaterRain } from '../../v2/js/climate/rain.js';
import { derivedCirculation } from '../../v2/js/climate/circulation.js';
import { observedWinds } from '../../v2/js/climate/inputs.js';
import { setParams } from '../../v2/js/climate/config.js';

const argSet = process.argv.indexOf('--set');
if (argSet > 0) setParams(Object.fromEntries(process.argv[argSet + 1].split(',').map(kv => { const [k, v] = kv.split('='); return [k, +v]; })));
const { grid, fields: obs } = loadReferences();
const G = grid.size;
const { gray, width, height } = loadEarthGrayscale();
const earth = buildEarthMesh(gray, width, height, { N: 160000 });
const nR = earth.mesh.numRegions, elevKm = new Float32Array(nR);
for (let r = 0; r < nR; r++) elevKm[r] = elevToHeightKm(earth.r_elevation[r]);
const latC = new Float32Array(nR), lonC = new Float32Array(nR);
cellLatLon(earth.r_xyz, 'y-up', latC, lonC);
const landC = new Uint8Array(nR); for (let r = 0; r < nR; r++) landC[r] = elevKm[r] > 0 ? 1 : 0;
const surface = aggregateSurface(grid, latC, lonC, elevKm, landC);
const MONTHS12 = Array.from({ length: 12 }, (_, m) => m);
const ctx = { grid, surface, anchorMonths: MONTHS12, options: {} };
const winds = observedWinds(obs.u10, obs.v10)(ctx);
const phase2 = energyBalanceTemperature()(ctx, winds);
const T = { monthly: new Float32Array(12 * G), monthlySL: new Float32Array(12 * G), seaIce: new Float32Array(12 * G) };
for (let k = 0; k < 12 * G; k++) {
    const c = k % G, f = surface.landFrac[c], tl = obs.t2m[k], ts = obs.sst[k], ice = obs.seaIce[k];
    const landOk = tl === tl, seaOk = ts === ts && !(ice > 0.15);
    const href = surface.meanLandKm[c] === surface.meanLandKm[c] ? Math.max(0, surface.meanLandKm[c]) : 0;
    T.monthly[k] = landOk && seaOk ? f * tl + (1 - f) * ts : landOk && f >= 0.3 ? tl : seaOk && f < 0.7 ? ts : phase2.monthly[k];
    T.monthlySL[k] = seaOk ? ts : landOk ? tl + 6.5 * href : phase2.monthlySL[k];
    T.seaIce[k] = ice === ice ? Math.min(1, ice) : 0;
}
const DERIVED = process.argv.includes('--derived');           // the circulation stage's winds instead of the observed ones
const R = columnWaterRain()(ctx, DERIVED ? derivedCirculation()(ctx, T) : winds, T);
const ann = (f) => seasonMean(f, G, MONTHS12);
const P = ann(R.P), E = ann(R.E), Wc = ann(R.W), rh = ann(R.r), Pl = ann(obs.precip), Pa = ann(obs.precipAll);
const f0 = (x) => (x === x ? x.toFixed(0).padStart(5) : '    —'), f2 = (x) => (x === x ? x.toFixed(2).padStart(5) : '    —');

let gp = 0, go = 0, gw = 0;
for (let c = 0; c < G; c++) { const w = grid.rowArea[Math.floor(c / grid.w)]; gp += w * P[c]; if (Pa[c] === Pa[c]) { go += w * Pa[c]; gw += w; } }
let aw = 0; for (let c = 0; c < G; c++) aw += grid.rowArea[Math.floor(c / grid.w)];
console.log(`Global mean rain ${(gp / aw / 30.44).toFixed(2)} mm/day (GPCP ${(go / gw / 30.44).toFixed(2)}); ${R.newton} Newton steps, ${R.cycles} cycles, ${R.ms.toFixed(0)} ms`);
console.log('\nZonal means, annual (mm/month; W mm; r column relative humidity):');
console.log('   lat |  sea: P  GPCP     E     W     r | land: P  Beck     E     W     r');
for (let lat0 = 80; lat0 >= -80; lat0 -= 10) {
    const acc = { s: [0, 0, 0, 0, 0, 0], l: [0, 0, 0, 0, 0, 0] };
    for (let j = 0; j < grid.h; j++) {
        const la = grid.lat[j]; if (la > lat0 + 5 || la <= lat0 - 5) continue;
        for (let i = 0; i < grid.w; i++) {
            const c = j * grid.w + i, lf = surface.landFrac[c];
            if (lf < 0.2 && Pa[c] === Pa[c]) { const a = acc.s; a[0] += P[c]; a[1] += Pa[c]; a[2] += E[c]; a[3] += Wc[c]; a[4] += rh[c]; a[5]++; }
            else if (lf >= 0.5 && Pl[c] === Pl[c]) { const a = acc.l; a[0] += P[c]; a[1] += Pl[c]; a[2] += E[c]; a[3] += Wc[c]; a[4] += rh[c]; a[5]++; }
        }
    }
    const s = acc.s.map((v, i) => (i < 5 ? v / acc.s[5] : v)), l = acc.l.map((v, i) => (i < 5 ? v / acc.l[5] : v));
    console.log(`${String(lat0).padStart(6)} | ${f0(s[0])} ${f0(s[1])} ${f0(s[2])} ${f0(s[3])} ${f2(s[4])} | ${f0(l[0])} ${f0(l[1])} ${f0(l[2])} ${f0(l[3])} ${f2(l[4])}`);
}

const box = (f, la0, la1, lo0, lo1, months) => {
    let s = 0, n = 0;
    for (const m of months) for (let j = 0; j < grid.h; j++) {
        const la = grid.lat[j]; if (la < la0 || la > la1) continue;
        for (let i = 0; i < grid.w; i++) { const lo = grid.lon[i]; if (lo < lo0 || lo > lo1) continue; const c = j * grid.w + i; if (surface.landFrac[c] < 0.5) continue; const v = f[m * G + c]; if (v === v) { s += v; n++; } }
    }
    return n ? s / n : NaN;
};
const BOXES = [
    ['Western Europe', 45, 55, -5, 10], ['Central Europe', 47, 55, 10, 25], ['Russia (Moscow)', 50, 60, 30, 50], ['Siberia (west)', 55, 65, 60, 90],
    ['Eastern US', 32, 42, -90, -75], ['Great Plains', 35, 45, -105, -95], ['Pacific NW', 42, 55, -128, -121], ['Great Basin', 38, 44, -120, -112],
    ['Mediterranean', 35, 42, -8, 25], ['Sahara', 18, 28, -10, 30], ['Sahel', 10, 16, -10, 20], ['Congo', -5, 5, 12, 28],
    ['Amazon', -10, 2, -70, -50], ['Pampas', -38, -30, -65, -57], ['India', 15, 25, 72, 88], ['South China', 23, 33, 105, 120],
    ['Australia interior', -30, -20, 122, 140], ['Southeast Australia', -38, -30, 142, 152], ['Atacama', -25, -8, -76, -69], ['Namib', -28, -18, 12, 16],
];
console.log('\nBoxes, land (mm/month): Jun–Aug model / real, Dec–Feb model / real; column relative humidity Jun–Aug / Dec–Feb');
for (const [name, ...b] of BOXES) {
    console.log(`  ${name.padEnd(20)} JJA ${f0(box(R.P, ...b, JJA))} /${f0(box(obs.precip, ...b, JJA))}   DJF ${f0(box(R.P, ...b, DJF))} /${f0(box(obs.precip, ...b, DJF))}   r ${f2(box(R.r, ...b, JJA))} ${f2(box(R.r, ...b, DJF))}   E ${f0(box(R.E, ...b, JJA))} ${f0(box(R.E, ...b, DJF))}`);
}

// ── Terms in named boxes (with RAIN_DEBUG=1): rain-out rate factor, lift, W / Ws, evaporation ──
if (R.debug) {
    const { g, prep, Wk, results, land: lf, hgt } = R.debug;
    const K = prep.length;
    const show = (name, la0, la1, lo0, lo1) => {
        console.log(`\n  ${name}:`);
        for (let j = 0; j < g.h; j++) {
            const la = g.lat[j]; if (la < la0 || la > la1) continue;
            for (let i = 0; i < g.w; i++) {
                const lo = g.lon[i]; if (lo < lo0 || lo > lo1) continue;
                const c = j * g.w + i; if (lf[c] < 0.5) continue;
                const k = 6, p = prep[k], P = results[k].P[c] * 30.44 * 86400;
                console.log(`    ${la.toFixed(0)},${lo.toFixed(0)} h ${hgt[c].toFixed(1)} km  July: P ${P.toFixed(0)}  W ${Wk[k][c].toFixed(1)} / Ws ${p.Ws[c].toFixed(1)}  rate ${p.rate[c].toFixed(2)}  lift·Ws ${(p.lift[c] * p.Ws[c] * 30.44 * 86400).toFixed(0)} mm/mo  wind ${p.gu[c].toFixed(1)},${p.gv[c].toFixed(1)}  E ${(results[k].E[c] * 30.44 * 86400).toFixed(0)}`);
            }
        }
    };
    show('Atacama', -25, -8, -76, -69);
    show('Namib', -28, -18, 12, 16);
    show('Russia', 50, 60, 30, 50);
}
if (R.debug) {
    const { g, prep } = R.debug;
    console.log('\n  Storm growth (Eady, 1/day), eddy mixing K (10⁶ m²/s) and rain boost, January / July:');
    for (let lat0 = 80; lat0 >= -80; lat0 -= 10) {
        const j = g.rowOf ? Math.round(g.rowOf(lat0)) : Math.round((90 - lat0) / g.step - 0.5);
        const K1 = prep[0].Krow[j] * 6.371e6 ** 2 / 1e6, K7 = prep[6].Krow[j] * 6.371e6 ** 2 / 1e6;
        console.log(`    ${String(lat0).padStart(4)}  eady ${R.eady[0][j].toFixed(2)} / ${R.eady[6][j].toFixed(2)}   K ${K1.toFixed(2)} / ${K7.toFixed(2)}   boost(sea) ${prep[0].rate[j * g.w].toFixed(2)} / ${prep[6].rate[j * g.w].toFixed(2)}`);
    }
}
{
    // Where the wetter half of the year is wrong: 15° × 30° boxes, share of clearly seasonal land cells right way round
    const oS = seasonMean(obs.precip, G, JJA), oW = seasonMean(obs.precip, G, DJF), mS = seasonMean(R.P, G, JJA), mW = seasonMean(R.P, G, DJF);
    console.log('\n  Wet season right way round (Jun–Aug vs Dec–Feb), % of clearly seasonal land per box (· = too few cells):');
    let head = '        '; for (let lo = -180; lo < 180; lo += 30) head += String(lo).padStart(5); console.log(head);
    for (let la = 75; la > -60; la -= 15) {
        let line = String(la).padStart(4) + '    ';
        for (let lo = -180; lo < 180; lo += 30) {
            let ok = 0, n = 0;
            for (let j = 0; j < grid.h; j++) {
                const lat = grid.lat[j]; if (lat > la || lat <= la - 15) continue;
                for (let i = 0; i < grid.w; i++) {
                    const lon = grid.lon[i]; if (lon < lo || lon >= lo + 30) continue;
                    const c = j * grid.w + i;
                    if (surface.landFrac[c] < 0.5 || !(oS[c] === oS[c])) continue;
                    const dO = oS[c] - oW[c], mean = (oS[c] + oW[c]) / 2; if (Math.abs(dO) < 0.3 * mean || mean < 5) continue;
                    n++; if (Math.sign(dO) === Math.sign(mS[c] - mW[c])) ok++;
                }
            }
            line += n < 8 ? '    ·' : String(Math.round(100 * ok / n)).padStart(5);
        }
        console.log(line);
    }
}
