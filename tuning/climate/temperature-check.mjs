/**
 * Phase 2 — the temperature stage (energy balance, v2/js/climate/temperature.js), checked on its own.
 *
 *   node tuning/climate/temperature-check.mjs           score the current settings
 *   node tuning/climate/temperature-check.mjs --tune    tune the settings, then score
 *
 * Open loop: on Earth the stage gets the observed winds, so its error is its own.
 *
 * Earth is a check, not the target: the settings are physical constants with literature values and ranges
 * (config.js PARAM_PRIORS), meant to transfer to any Earth-like planet. Tuning uses the whole Earth but is
 * continent-aware — each continent is scored on its own and weighted equally (Asia's size does not dominate), a
 * change is kept only if no continent gets noticeably worse, and every setting is pulled toward its literature value.
 * The synthetic test planets must behave as physics expects.
 *
 * Reports: temperature error per continent and at sea, the seasonal swing, the month of peak warmth, V1's
 * temperature on the same cells, the Köppen "truth swap" (this temperature + observed rain, per terrain cell, vs
 * Beck), the test planets, and timing.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEarthGrayscale } from './lib/earth-context.mjs';
import { buildEarthMesh } from './lib/earth-mesh.mjs';
import { loadReferences, truthAt01, seasonMean, JJA, DJF } from './lib/ref.mjs';
import { compareClasses, groupStats, gridWeights, REGIMES } from './lib/compare.mjs';
import { CONTINENTS, TUNED_CONTINENTS, continentOf } from './lib/continents.mjs';
import { elevToHeightKm } from '../../js/color-map.js';
import { buildSphere } from '../../js/sphere-mesh.js';
import { makeRng } from '../../js/rng.js';
import { computeClimate, aggregateSurface, cellLatLon } from '../../v2/js/climate/core.js';
import { energyBalanceTemperature } from '../../v2/js/climate/temperature.js';
import { observedWinds, zonalWinds, observedRain, observedTemperature, atAnchors } from '../../v2/js/climate/inputs.js';
import { synthesizeCell } from '../../v2/js/climate/seasons.js';
import { PARAMS, PARAMS_DEFAULTS, PARAM_PRIORS, setParams, resetParams } from '../../v2/js/climate/config.js';
import { TEST_PLANETS, buildTestPlanet } from '../../v2/js/climate/test-planets.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, '..', 'results', 'climate');
const LAB_DIR = path.join(__dirname, 'data', 'lab');
const TUNE = process.argv.includes('--tune');
// --set KEY=VALUE[,KEY=VALUE…] tries settings without editing config.js (e.g. --set TEMP_GRID_DEG=2)
const argSet = process.argv.indexOf('--set');
const OVERRIDES = argSet > 0 ? Object.fromEntries(process.argv[argSet + 1].split(',').map(kv => { const [k, v] = kv.split('='); return [k, +v]; })) : {};
setParams(OVERRIDES);
const N = 160000;
const LAPSE = 6.5;

const { grid, fields: obs, koppen01, land: obsLand } = loadReferences();
const G = grid.size, W = gridWeights(grid);

// ── Earth surface (the imported heightmap), aggregated to the grid ──
const { gray, width, height } = loadEarthGrayscale();
const earth = buildEarthMesh(gray, width, height, { N });
const nR = earth.mesh.numRegions;
const elevKm = new Float32Array(nR);
for (let r = 0; r < nR; r++) elevKm[r] = elevToHeightKm(earth.r_elevation[r]);
const latC = new Float32Array(nR), lonC = new Float32Array(nR);
cellLatLon(earth.r_xyz, 'y-up', latC, lonC);
const landC = new Uint8Array(nR); for (let r = 0; r < nR; r++) landC[r] = elevKm[r] > 0 ? 1 : 0;
const surface = aggregateSurface(grid, latC, lonC, elevKm, landC);
const MONTHS12 = Array.from({ length: 12 }, (_, m) => m);
const ctxEarth = { grid, surface, anchorMonths: MONTHS12, options: { lapseRateCPerKm: LAPSE } };
const windsEarth = observedWinds(obs.u10, obs.v10)(ctxEarth);

// ── Scoring masks: land per continent (observed land, ≥ half land in the heightmap); open, ice-free sea ──
const landMasks = Object.fromEntries(CONTINENTS.map(k => [k, new Uint8Array(G)]));
const landAll = new Uint8Array(G), seaAll = new Uint8Array(G);
for (let c = 0; c < G; c++) {
    const lat = grid.lat[Math.floor(c / grid.w)], lon = grid.lon[c % grid.w];
    if (obsLand[c] && surface.landFrac[c] >= 0.5) { landMasks[continentOf(lat, lon)][c] = 1; landAll[c] = 1; }
    let iceFree = true, sst = true;
    for (let m = 0; m < 12; m++) { const s = obs.sst[m * G + c], ice = obs.seaIce[m * G + c]; if (!(s === s)) sst = false; if (ice > 0.15) iceFree = false; }
    if (sst && iceFree && surface.landFrac[c] < 0.2) seaAll[c] = 1;
}

/** Monthly field errors (12 × G model vs observations) on a mask. */
function tempMetrics(model, ref, mask) {
    let sw = 0, se = 0, sb = 0, rngE = 0, rngS = 0, rngO = 0, peakE = 0, peakW = 0;
    for (let c = 0; c < G; c++) {
        if (!mask[c]) continue;
        const w = W[c];
        let mxS = -Infinity, mnS = Infinity, mxO = -Infinity, mnO = Infinity, pS = 0, pO = 0;
        for (let m = 0; m < 12; m++) {
            const s = model[m * G + c], o = ref[m * G + c], d = s - o;
            se += w * d * d; sb += w * d;
            if (s > mxS) { mxS = s; pS = m; } if (s < mnS) mnS = s;
            if (o > mxO) { mxO = o; pO = m; } if (o < mnO) mnO = o;
        }
        sw += w;
        const rS = mxS - mnS, rO = mxO - mnO;
        rngE += w * (rS - rO) ** 2; rngS += w * rS; rngO += w * rO;
        if (rO > 5) { let d = Math.abs(pS - pO); d = Math.min(d, 12 - d); peakE += w * d; peakW += w; }
    }
    return {
        rmse: Math.sqrt(se / (12 * sw)), bias: sb / (12 * sw),
        rangeRmse: Math.sqrt(rngE / sw), rangeSim: rngS / sw, rangeObs: rngO / sw,
        peakMonthErr: peakW ? peakE / peakW : NaN,
    };
}
/** Seasonal-mean (JJA / DJF) error, the measure V1 was scored with in Phase 0. */
const obsJ = seasonMean(obs.t2m, G, JJA), obsD = seasonMean(obs.t2m, G, DJF);
function seasonRmse(s, o, mask) {
    let sw = 0, se = 0, sb = 0;
    for (let c = 0; c < G; c++) { if (!mask[c] || !(s[c] === s[c])) continue; const d = s[c] - o[c]; sw += W[c]; se += W[c] * d * d; sb += W[c] * d; }
    return { rmse: Math.sqrt(se / sw), bias: sb / sw };
}

function runEarth() {
    const t0 = performance.now();
    const out = energyBalanceTemperature()(ctxEarth, windsEarth);
    return { out, ms: performance.now() - t0 };
}
function scoreEarth(out) {
    const cont = Object.fromEntries(CONTINENTS.map(k => [k, tempMetrics(out.monthly, obs.t2m, landMasks[k])]));
    return { cont, land: tempMetrics(out.monthly, obs.t2m, landAll), sea: tempMetrics(out.monthlySL, obs.sst, seaAll) };
}

// ── Tuning ──
const TUNED = ['TEMP_OLR_A', 'TEMP_DIFFUSIVITY', 'TEMP_DIFFUSIVITY_EW', 'TEMP_ALBEDO', 'TEMP_ALBEDO_LAT', 'TEMP_ALBEDO_ICE',
    'TEMP_ALBEDO_SNOW', 'TEMP_LAND_HEAT_CAP', 'TEMP_OCEAN_MIX_M', 'TEMP_WIND_CARRY', 'TEMP_INVERSION_C', 'TEMP_INVERSION_WIND', 'TEMP_PLATEAU_LAPSE'];
const PRIOR_WEIGHT = 1.0;          // °C of error accepted for moving a setting across its whole range
const WORSEN_TOLERANCE = 0.15;     // °C — no continent may get worse than this for a change to be kept
const contScore = (m) => m.rmse + 0.5 * m.rangeRmse;
function priorPenalty(p) {
    let s = 0;
    for (const k of TUNED) { const pr = PARAM_PRIORS[k]; s += ((p[k] - pr.value) / (pr.max - pr.min)) ** 2; }
    return PRIOR_WEIGHT * s;
}
function evaluate(p) {
    setParams(p);
    const { out } = runEarth();
    const s = scoreEarth(out);
    const per = Object.fromEntries(TUNED_CONTINENTS.map(k => [k, contScore(s.cont[k])]));
    const mean = TUNED_CONTINENTS.reduce((a, k) => a + per[k], 0) / TUNED_CONTINENTS.length;
    const prior = priorPenalty(p);
    return { total: mean + 0.5 * s.sea.rmse + prior, mean, prior, per, s };
}

let tuneLog = null;
if (TUNE) {
    let best = { ...PARAMS_DEFAULTS };
    for (const k of TUNED) best[k] = PARAM_PRIORS[k].value;
    let bestE = evaluate(best);
    const startPer = { ...bestE.per };          // the guard is against the literature values, so losses cannot pile up
    const fmtPer = (e) => TUNED_CONTINENTS.map(k => `${k} ${e.per[k].toFixed(2)}`).join(', ');
    console.log(`Tuning ${TUNED.length} settings on the whole Earth, continents weighted equally; no continent may end up more than`);
    console.log(`${WORSEN_TOLERANCE} °C worse than with the literature values; every setting pulled toward its literature value.`);
    console.log(`  start: ${bestE.total.toFixed(3)}  (${fmtPer(bestE)})`);
    let step = 0.25;                           // fraction of each setting's range
    for (let round = 0; round < 7; round++) {
        let improved = false;
        for (const k of TUNED) {
            const pr = PARAM_PRIORS[k], span = pr.max - pr.min;
            for (const dir of [1, -1]) {
                const trial = { ...best, [k]: Math.max(pr.min, Math.min(pr.max, best[k] + dir * step * span)) };
                if (trial[k] === best[k]) continue;
                const e = evaluate(trial);
                const noneWorse = TUNED_CONTINENTS.every(c => e.per[c] <= startPer[c] + WORSEN_TOLERANCE);
                if (e.total < bestE.total - 1e-3 && noneWorse) { best = trial; bestE = e; improved = true; break; }
            }
        }
        console.log(`  round ${round + 1} (step ${(100 * step).toFixed(1)} % of range): ${bestE.total.toFixed(3)}  (${fmtPer(bestE)})`);
        if (!improved) step /= 2;
    }
    tuneLog = { params: Object.fromEntries(TUNED.map(k => [k, best[k]])), total: bestE.total, perContinent: bestE.per, prior: bestE.prior };
    setParams(best);
    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(path.join(OUT_DIR, 'temperature-tuned.json'), JSON.stringify(tuneLog, null, 2));
    console.log('  tuned settings:', Object.entries(tuneLog.params).map(([k, v]) => `${k}=${+v.toPrecision(4)}`).join(', '));
}

// ── Score ──
const { out: earthOut, ms: ebmMs } = runEarth();
const S = scoreEarth(earthOut);
const newJ = seasonMean(earthOut.monthly, G, JJA), newD = seasonMean(earthOut.monthly, G, DJF);
const v1Raw = new Float32Array(fs.readFileSync(path.join(LAB_DIR, 'v1_t2m.f32')).buffer.slice(0));
const v1J = v1Raw.subarray(0, G), v1D = v1Raw.subarray(G, 2 * G);
const f1 = (x) => (x === x ? x.toFixed(1) : '—');
const perCont = {};
console.log(`\nTemperature stage (energy balance) on Earth, observed winds — ${ebmMs.toFixed(0)} ms`);
console.log(`  solver cycles per outer iteration [mean, 1st, 2nd harmonic]: ${earthOut.solverStats.map(s => s.cycles.join('/')).join('  ')}`);
{   // warm timing (the first run includes the JavaScript engine's warm-up)
    const warm = runEarth();
    console.log(`  warm run ${warm.ms.toFixed(0)} ms — ${Object.entries(warm.out.profile).map(([k, v]) => `${k} ${v.toFixed(0)}`).join(', ')} ms`);
}
console.log('  Land:            monthly error   bias   swing model / real   peak month off   Jun–Aug / Dec–Feb error: new   V1');
for (const k of [...CONTINENTS, 'all land']) {
    const mask = k === 'all land' ? landAll : landMasks[k], m = k === 'all land' ? S.land : S.cont[k];
    const nj = seasonRmse(newJ, obsJ, mask), nd = seasonRmse(newD, obsD, mask), vj = seasonRmse(v1J, obsJ, mask), vd = seasonRmse(v1D, obsD, mask);
    perCont[k] = { ...m, newJJA: nj.rmse, newDJF: nd.rmse, v1JJA: vj.rmse, v1DJF: vd.rmse };
    console.log(`    ${k.padEnd(15)} ${f1(m.rmse).padStart(6)} °C   ${f1(m.bias).padStart(5)}   ${f1(m.rangeSim).padStart(5)} / ${f1(m.rangeObs).padStart(5)} °C       ${m.peakMonthErr.toFixed(2).padStart(5)}`
        + `          ${f1(nj.rmse).padStart(5)} / ${f1(nd.rmse).padStart(5)}     ${f1(vj.rmse).padStart(5)} / ${f1(vd.rmse).padStart(5)}`);
}
console.log(`  Sea (ice-free): monthly error ${f1(S.sea.rmse)} °C; swing ${f1(S.sea.rangeSim)} vs ${f1(S.sea.rangeObs)} °C; peak month off by ${S.sea.peakMonthErr.toFixed(2)}`);

// ── Truth swap per terrain cell: this temperature + observed rain → Köppen vs Beck ──
function v1Temperature() {
    return ({ grid: g, anchorMonths }) => {
        const monthly = new Float32Array(12 * G).fill(NaN), T12 = new Float64Array(12), P12 = new Float64Array(12);
        for (let c = 0; c < G; c++) {
            if (!(v1J[c] === v1J[c])) continue;
            synthesizeCell([v1D[c], v1J[c]], [1, 1], { phase: 0, transform: 'linear', attenuation: 3 }, T12, P12);
            for (let m = 0; m < 12; m++) monthly[m * G + c] = T12[m];
        }
        return { T: atAnchors(monthly, g.size, anchorMonths), source: 'V1' };
    };
}
const truth = new Uint8Array(nR);
for (let r = 0; r < nR; r++) truth[r] = truthAt01(koppen01, latC[r], lonC[r]);
const swaps = [];
for (const [label, tStage] of [['observed temperature (oracle)', observedTemperature(obs.t2m)], ['new temperature', energyBalanceTemperature()], ["V1's temperature", v1Temperature()]]) {
    const res = computeClimate({ xyz: earth.r_xyz, elevKm, axes: 'y-up' },
        { stages: { winds: observedWinds(obs.u10, obs.v10), temperature: tStage, rain: observedRain(obs.precip) } });
    const cmp = compareClasses(truth, res.cell.koppen);
    const reg = Object.fromEntries(Object.entries(REGIMES).map(([k, codes]) => [k, groupStats(cmp, codes).recall]));
    swaps.push({ label, exact: cmp.exact, major: cmp.major, graded: cmp.graded, regimes: reg });
}
console.log(`\nKöppen per terrain cell (${nR.toLocaleString()}), with observed rain, against Beck 0.1°:`);
for (const s of swaps) console.log(`  ${s.label.padEnd(30)} same class ${(100 * s.exact).toFixed(1)} %   group ${(100 * s.major).toFixed(1)} %   graded ${(100 * s.graded).toFixed(1)} %`);

// ── Test planets: what physics expects, without reference to Earth ──
function valueAt(field, m, lat, lon) { return grid.sample(field.subarray(m * G, (m + 1) * G), lat, lon); }
function swingAt(monthly, lat, lon) { let mx = -Infinity, mn = Infinity; for (let m = 0; m < 12; m++) { const v = valueAt(monthly, m, lat, lon); mx = Math.max(mx, v); mn = Math.min(mn, v); } return mx - mn; }
const planets = {};
for (const kind of Object.keys(TEST_PLANETS)) {
    const p = buildTestPlanet(kind, 40000, buildSphere, makeRng(7));
    const n = p.elevKm.length, la = new Float32Array(n), lo = new Float32Array(n), ld = new Uint8Array(n);
    cellLatLon(p.xyz, 'y-up', la, lo);
    for (let r = 0; r < n; r++) ld[r] = p.elevKm[r] > 0 ? 1 : 0;
    const surf = aggregateSurface(grid, la, lo, p.elevKm, ld);
    const ctx = { grid, surface: surf, anchorMonths: MONTHS12, options: { lapseRateCPerKm: LAPSE } };
    const t0 = performance.now();
    const out = energyBalanceTemperature()(ctx, zonalWinds()(ctx));
    const ms = performance.now() - t0;
    const T = out.monthly, checks = [];
    const check = (text, ok, detail) => checks.push({ text, ok, detail });
    if (kind === 'midlat') {
        const inland = swingAt(T, 40, 0), west = swingAt(T, 40, -36), sea = swingAt(T, 40, -120);
        check('seasons biggest inland, smaller on the coast, smallest at sea', inland > west && west > sea, `swing inland ${f1(inland)}, west coast ${f1(west)}, open sea ${f1(sea)} °C`);
        const janW = valueAt(T, 0, 45, -36), janE = valueAt(T, 0, 45, 36);
        check('west coast milder than east coast in winter (westerlies)', janW > janE, `January at 45°N: west ${f1(janW)}, east ${f1(janE)} °C`);
        const julL = valueAt(T, 6, 40, 0), julS = valueAt(T, 6, 40, -120), janL = valueAt(T, 0, 40, 0), janS = valueAt(T, 0, 40, -120);
        check('land hotter than sea in summer, colder in winter', julL > julS && janL < janS, `July land ${f1(julL)} / sea ${f1(julS)}; January land ${f1(janL)} / sea ${f1(janS)} °C`);
    } else if (kind === 'tropical') {
        const eq = swingAt(T, 0, 22.5), edge = swingAt(T, 25, 22.5);
        check('small seasons at the equator, larger toward 25°', eq < edge, `swing at 0° ${f1(eq)}, at 25°N ${f1(edge)} °C`);
        const julL = valueAt(T, 6, 20, 22.5), julS = valueAt(T, 6, 20, -90);
        check('land warmer than sea in its summer', julL > julS, `July at 20°N: land ${f1(julL)}, sea ${f1(julS)} °C`);
    } else {
        const inland = swingAt(T, 45, 0), coast = swingAt(T, 45, 52), sea = swingAt(T, 45, 150);
        check('extreme seasons deep inside, far bigger than at sea', inland > 3 * sea && inland > coast, `swing at 45°N: interior ${f1(inland)}, coast ${f1(coast)}, sea ${f1(sea)} °C`);
        const julI = valueAt(T, 6, 30, 0), julS = valueAt(T, 6, 30, 150);
        check('hot summer interior', julI > julS + 5, `July at 30°N: interior ${f1(julI)}, sea ${f1(julS)} °C`);
    }
    planets[kind] = { ms, checks };
    console.log(`\n${TEST_PLANETS[kind].label} (${ms.toFixed(0)} ms):`);
    for (const c of checks) console.log(`  ${c.ok ? 'PASS' : 'FAIL'}  ${c.text} — ${c.detail}`);
}

// ── Gate ──
const v1Swap = swaps.find(s => s.label.startsWith('V1')), newSwap = swaps.find(s => s.label.startsWith('new'));
const meanOver = (key) => TUNED_CONTINENTS.reduce((a, k) => a + perCont[k][key], 0) / TUNED_CONTINENTS.length;
const newSeasonal = (meanOver('newJJA') + meanOver('newDJF')) / 2, v1Seasonal = (meanOver('v1JJA') + meanOver('v1DJF')) / 2;
const gate = {
    beatsV1PerContinent: newSeasonal < v1Seasonal,
    beatsV1Swap: newSwap.exact > v1Swap.exact,
    testPlanets: Object.values(planets).every(p => p.checks.every(c => c.ok)),
};
gate.pass = Object.values(gate).every(Boolean);
console.log(`\nGate: Jun–Aug / Dec–Feb error, continents weighted equally: new ${f1(newSeasonal)} vs V1 ${f1(v1Seasonal)} °C ${gate.beatsV1PerContinent ? '✓' : '✗'}`
    + ` · truth swap beats V1 ${gate.beatsV1Swap ? '✓' : '✗'} · test planets ${gate.testPlanets ? '✓' : '✗'} → ${gate.pass ? 'PASSED' : 'not met'}`);

const results = {
    params: Object.fromEntries(Object.keys(PARAM_PRIORS).map(k => [k, PARAMS[k]])), tuned: tuneLog,
    ms: ebmMs, perContinent: perCont, sea: S.sea, seasonalMean: { new: newSeasonal, v1: v1Seasonal }, swaps, planets, gate,
};
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, 'temperature-check.json'), JSON.stringify(results, null, 2));
fs.writeFileSync(path.join(LAB_DIR, 'temperature-check.json'), JSON.stringify(results));
fs.writeFileSync(path.join(LAB_DIR, 'new_t2m.f32'), Buffer.from(earthOut.monthly.buffer));
console.log(`Wrote ${path.relative(process.cwd(), path.join(OUT_DIR, 'temperature-check.json'))}`);
resetParams();
