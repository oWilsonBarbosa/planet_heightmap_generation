/**
 * Phase 0 — how good is each stage of V1's climate on its own?
 *
 * Runs V1's climate (unchanged, read-only) on the imported Earth heightmap, puts its fields on the 1° grid, and
 * scores every stage against its own observations — pressure, wind, ITCZ, ocean warmth, temperature, rain — then
 * attributes the Köppen error to temperature vs rain with "truth swaps" (observed temperature with V1's rain, and
 * V1's temperature with observed rain), all classified by the same Beck-rule classifier.
 *
 *   node tuning/climate/stage-audit.mjs [--n 160000]
 *
 * V1's "summer" / "winter" are northern-hemisphere seasons → compared with observed June–August / December–February.
 * Writes tuning/results/climate/stage-audit.json and the lab's copies (fields at 1°) in tuning/climate/data/lab/.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildEarthContext } from './lib/earth-context.mjs';
import { runClimate } from './lib/score.mjs';
import { loadReferences, seasonMean, truthAt01, JJA, DJF } from './lib/ref.mjs';
import { compareClasses, groupStats, gridWeights, REGIMES } from './lib/compare.mjs';
import { CLIMATE } from '../../js/climate-config.js';
import { elevToHeightKm } from '../../js/color-map.js';
import { classifyField, classifyCell, KOPPEN_CLASSES } from '../../v2/js/climate/koppen.js';
import { synthesizeCell } from '../../v2/js/climate/seasons.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, '..', 'results', 'climate');
const LAB_DIR = path.join(__dirname, 'data', 'lab');
const argN = process.argv.indexOf('--n');
const N = argN > 0 ? +process.argv[argN + 1] : 160000;

const DEG = 180 / Math.PI;
const { grid, fields: obs, koppen: beck1, koppen01, land: obsLand } = loadReferences();
const G = grid.size;
const W = gridWeights(grid);

// ── Run V1 ────────────────────────────────────────────────────────────────────
console.log(`Building V1's Earth (import pipeline) at ${N} regions and running its climate…`);
const ctx = buildEarthContext({ N });
const t0 = performance.now();
const { r_koppen, windResult, oceanResult, precipResult, tempResult } = runClimate(ctx);
const v1ms = performance.now() - t0;
console.log(`  context ${Math.round(ctx.buildMs)} ms, climate ${Math.round(v1ms)} ms`);

const nR = ctx.mesh.numRegions;
const r_cell = new Int32Array(nR);
for (let r = 0; r < nR; r++) r_cell[r] = grid.cellAt(ctx.r_lat[r] * DEG, ctx.r_lon[r] * DEG);
const r_land = new Uint8Array(nR);
for (let r = 0; r < nR; r++) r_land[r] = ctx.r_elevation[r] > 0 ? 1 : 0;

// Grid cells near the poles are smaller than a region, so some hold no region at all: they take the value of the
// nearest cell in the same latitude row that does (a few km away up there).
const cellRegions = new Uint32Array(G);
for (let r = 0; r < nR; r++) cellRegions[r_cell[r]]++;
const fillFrom = new Int32Array(G);
for (let j = 0; j < grid.h; j++) for (let i = 0; i < grid.w; i++) {
    const c = j * grid.w + i;
    fillFrom[c] = c;
    if (cellRegions[c]) continue;
    for (let d = 1; d < grid.w; d++) {
        const a = j * grid.w + (i + d) % grid.w, b = j * grid.w + (i - d + grid.w) % grid.w;
        if (cellRegions[a]) { fillFrom[c] = a; break; }
        if (cellRegions[b]) { fillFrom[c] = b; break; }
    }
}

/** Mean of a per-region field over the regions in each grid cell (optionally only land / only sea). */
function toGrid(field, which = 'all', map = v => v) {
    const sum = new Float64Array(G), cnt = new Float64Array(G);
    for (let r = 0; r < nR; r++) {
        if (which === 'land' && !r_land[r]) continue;
        if (which === 'sea' && r_land[r]) continue;
        const c = r_cell[r];
        sum[c] += map(field[r], r); cnt[c]++;
    }
    const out = new Float32Array(G);
    for (let c = 0; c < G; c++) { const s = fillFrom[c]; out[c] = cnt[s] > 0 ? sum[s] / cnt[s] : NaN; }
    return out;
}

const tC = v => -45 + Math.max(0, Math.min(1, v)) * 90;                         // V1 temperature → °C
const pMM = v => Math.max(0, v) * CLIMATE.KOPPEN_PRECIP_SCALE_MM / 6;            // V1 precip → mm/month (as its Köppen reads it)
const V1 = {
    tS: toGrid(tempResult.r_temperature_summer, 'land', tC), tW: toGrid(tempResult.r_temperature_winter, 'land', tC),
    pS: toGrid(precipResult.r_precip_summer, 'land', pMM), pW: toGrid(precipResult.r_precip_winter, 'land', pMM),
    slpS: toGrid(windResult.r_pressure_summer, 'all', v => v + 1013), slpW: toGrid(windResult.r_pressure_winter, 'all', v => v + 1013),
    uS: toGrid(windResult.r_wind_east_summer), vS: toGrid(windResult.r_wind_north_summer),
    uW: toGrid(windResult.r_wind_east_winter), vW: toGrid(windResult.r_wind_north_winter),
    warmS: toGrid(oceanResult.r_ocean_warmth_summer, 'sea'), warmW: toGrid(oceanResult.r_ocean_warmth_winter, 'sea'),
    elev: toGrid(ctx.r_elevation, 'all', v => elevToHeightKm(v)),
    landFrac: toGrid(r_land, 'all'),
};

// ── Observations at the same seasons ──────────────────────────────────────────
const OBS = {
    tS: seasonMean(obs.t2m, G, JJA), tW: seasonMean(obs.t2m, G, DJF),
    pS: seasonMean(obs.precip, G, JJA), pW: seasonMean(obs.precip, G, DJF),
    slpS: seasonMean(obs.slp, G, JJA), slpW: seasonMean(obs.slp, G, DJF),
    uS: seasonMean(obs.u10, G, JJA), vS: seasonMean(obs.v10, G, JJA),
    uW: seasonMean(obs.u10, G, DJF), vW: seasonMean(obs.v10, G, DJF),
    sstS: seasonMean(obs.sst, G, JJA), sstW: seasonMean(obs.sst, G, DJF),
    pAllS: seasonMean(obs.precipAll, G, JJA), pAllW: seasonMean(obs.precipAll, G, DJF),
};

// ── Statistics helpers (area-weighted) ───────────────────────────────────────
function stats(a, b, mask = null) {           // a = sim, b = obs
    let sw = 0, sa = 0, sb = 0;
    for (let c = 0; c < G; c++) { if ((mask && !mask[c]) || a[c] !== a[c] || b[c] !== b[c]) continue; sw += W[c]; sa += W[c] * a[c]; sb += W[c] * b[c]; }
    const ma = sa / sw, mb = sb / sw;
    let cov = 0, va = 0, vb = 0, se = 0;
    for (let c = 0; c < G; c++) {
        if ((mask && !mask[c]) || a[c] !== a[c] || b[c] !== b[c]) continue;
        const da = a[c] - ma, db = b[c] - mb;
        cov += W[c] * da * db; va += W[c] * da * da; vb += W[c] * db * db; se += W[c] * (a[c] - b[c]) ** 2;
    }
    return { corr: cov / Math.sqrt(va * vb), bias: ma - mb, rmse: Math.sqrt(se / sw), simMean: ma, obsMean: mb, simStd: Math.sqrt(va / sw), obsStd: Math.sqrt(vb / sw), area: sw };
}
const map2 = (a, f) => a.map(f);
const both = (a, b) => { const m = new Uint8Array(G); for (let c = 0; c < G; c++) m[c] = a[c] === a[c] && b[c] === b[c] ? 1 : 0; return m; };
function zonalAnomaly(f, mask = null) {       // remove the zonal (latitude-row) mean → east–west pattern only
    const out = new Float32Array(G).fill(NaN);
    for (let j = 0; j < grid.h; j++) {
        let s = 0, n = 0;
        for (let i = 0; i < grid.w; i++) { const c = j * grid.w + i; if ((mask && !mask[c]) || f[c] !== f[c]) continue; s += f[c]; n++; }
        if (n < 10) continue;
        for (let i = 0; i < grid.w; i++) { const c = j * grid.w + i; if ((mask && !mask[c]) || f[c] !== f[c]) continue; out[c] = f[c] - s / n; }
    }
    return out;
}

const results = { N, v1ClimateMs: Math.round(v1ms), stages: {} };
const scoredLand = new Uint8Array(G);
for (let c = 0; c < G; c++) scoredLand[c] = obsLand[c] && V1.landFrac[c] >= 0.5 ? 1 : 0;
const lowland = new Uint8Array(G);           // SLP is extrapolated under high ground → compare where the surface is low
for (let c = 0; c < G; c++) lowland[c] = V1.elev[c] === V1.elev[c] && V1.elev[c] < 1.0 && Math.abs(grid.lat[Math.floor(c / grid.w)]) < 80 ? 1 : 0;

// Pressure
{
    const r = {};
    for (const s of ['S', 'W']) {
        const full = stats(V1[`slp${s}`], OBS[`slp${s}`], lowland);
        const eddy = stats(zonalAnomaly(V1[`slp${s}`], lowland), zonalAnomaly(OBS[`slp${s}`], lowland), lowland);
        r[s === 'S' ? 'JJA' : 'DJF'] = { patternCorr: full.corr, rmseHpa: full.rmse, eastWestCorr: eddy.corr, eastWestSimStd: eddy.simStd, eastWestObsStd: eddy.obsStd };
    }
    results.stages.pressure = r;
}
// Wind direction
{
    const r = {};
    for (const s of ['S', 'W']) {
        const acc = { all: [0, 0, 0], sea: [0, 0, 0], land: [0, 0, 0] };
        for (let c = 0; c < G; c++) {
            const u = V1[`u${s}`][c], v = V1[`v${s}`][c], uo = OBS[`u${s}`][c], vo = OBS[`v${s}`][c];
            if (u !== u || uo !== uo) continue;
            const ms = Math.hypot(u, v), mo = Math.hypot(uo, vo);
            if (ms < 1e-9 || mo < 0.5) continue;                       // calm observed cells carry no direction
            const cos = (u * uo + v * vo) / (ms * mo), wt = W[c] * mo;
            const key = V1.landFrac[c] >= 0.5 ? 'land' : 'sea';
            for (const k of ['all', key]) { acc[k][0] += wt * cos; acc[k][1] += wt; acc[k][2] += cos > Math.SQRT1_2 ? wt : 0; }
        }
        r[s === 'S' ? 'JJA' : 'DJF'] = Object.fromEntries(Object.entries(acc).map(([k, [sc, sw, s45]]) => [k, { meanCos: sc / sw, within45deg: s45 / sw }]));
    }
    results.stages.wind = r;
}
// ITCZ: latitude of the tropical rain maximum per longitude (observed GPCP, 20° lon smoothing) vs V1's ITCZ line
function obsItcz(pAll) {
    const out = new Float64Array(grid.w);
    for (let i = 0; i < grid.w; i++) {
        let best = -1, bestLat = 0;
        for (let j = 0; j < grid.h; j++) {
            const lat = grid.lat[j];
            if (lat > 30 || lat < -30) continue;
            let s = 0, n = 0;
            for (let di = -10; di <= 10; di++) for (let dj = -2; dj <= 2; dj++) {
                const jj = j + dj; if (jj < 0 || jj >= grid.h) continue;
                const v = pAll[jj * grid.w + (((i + di) % grid.w) + grid.w) % grid.w];
                if (v === v) { s += v; n++; }
            }
            if (n && s / n > best) { best = s / n; bestLat = lat; }
        }
        out[i] = bestLat;
    }
    return out;
}
{
    const r = {};
    for (const [s, key] of [['S', 'itczLatsSummer'], ['W', 'itczLatsWinter']]) {
        const o = obsItcz(OBS[`pAll${s}`]);
        let mae = 0, mSim = 0, mObs = 0;
        for (let i = 0; i < grid.w; i++) {
            const sim = windResult[key][i] * DEG;          // V1 samples 360 longitudes at the same 1° centres
            mae += Math.abs(sim - o[i]); mSim += sim; mObs += o[i];
        }
        r[s === 'S' ? 'JJA' : 'DJF'] = { meanAbsErrDeg: mae / grid.w, simMeanLat: mSim / grid.w, obsMeanLat: mObs / grid.w };
        results[`_itcz${s}`] = { sim: Array.from(windResult[key], v => +(v * DEG).toFixed(2)), obs: Array.from(o) };
    }
    results.stages.itcz = r;
}
// Ocean warmth vs observed east–west sea-temperature pattern (warm western boundary currents, cold upwelling)
{
    const r = {};
    for (const s of ['S', 'W']) {
        const sea = both(V1[`warm${s}`], OBS[`sst${s}`]);
        const e = stats(zonalAnomaly(V1[`warm${s}`], sea), zonalAnomaly(OBS[`sst${s}`], sea), sea);
        r[s === 'S' ? 'JJA' : 'DJF'] = { eastWestCorr: e.corr };
    }
    results.stages.ocean = r;
}
// Temperature (land)
{
    const r = {};
    for (const s of ['S', 'W']) {
        const st = stats(V1[`t${s}`], OBS[`t${s}`], scoredLand);
        r[s === 'S' ? 'JJA' : 'DJF'] = { corr: st.corr, biasC: st.bias, rmseC: st.rmse };
    }
    const rangeSim = V1.tS.map((v, c) => Math.abs(v - V1.tW[c])), rangeObs = OBS.tS.map((v, c) => Math.abs(v - OBS.tW[c]));
    const rg = stats(rangeSim, rangeObs, scoredLand);
    const ann = stats(V1.tS.map((v, c) => (v + V1.tW[c]) / 2), OBS.tS.map((v, c) => (v + OBS.tW[c]) / 2), scoredLand);
    r.annual = { corr: ann.corr, biasC: ann.bias, rmseC: ann.rmse };
    r.seasonalRange = { corr: rg.corr, biasC: rg.bias, rmseC: rg.rmse, simMeanC: rg.simMean, obsMeanC: rg.obsMean };
    results.stages.temperature = r;
}
// Rain (land)
{
    const r = {};
    const lg = a => a.map(v => Math.log(v + 10));
    for (const s of ['S', 'W']) {
        const st = stats(lg(V1[`p${s}`]), lg(OBS[`p${s}`]), scoredLand);
        const raw = stats(V1[`p${s}`], OBS[`p${s}`], scoredLand);
        r[s === 'S' ? 'JJA' : 'DJF'] = { logCorr: st.corr, rmsLogRatio: st.rmse, simMeanMm: raw.simMean, obsMeanMm: raw.obsMean };
    }
    // Which half of the year is wetter — right way round?
    let agree = 0, tot = 0;
    for (let c = 0; c < G; c++) {
        if (!scoredLand[c]) continue;
        const dO = OBS.pS[c] - OBS.pW[c], dS = V1.pS[c] - V1.pW[c], mean = (OBS.pS[c] + OBS.pW[c]) / 2;
        if (Math.abs(dO) < 0.3 * mean || mean < 5) continue;          // no clear wet season observed
        tot += W[c]; if (Math.sign(dO) === Math.sign(dS)) agree += W[c];
    }
    const ann = stats(lg(V1.pS.map((v, c) => (v + V1.pW[c]) / 2)), lg(OBS.pS.map((v, c) => (v + OBS.pW[c]) / 2)), scoredLand);
    r.annual = { logCorr: ann.corr, rmsLogRatio: ann.rmse };
    r.wetSeasonRightWayRound = agree / tot;
    results.stages.rain = r;
}

// ── Köppen and truth swaps (same classifier and month synthesis for every row) ──
// Two-season inputs → 12 months: DJF and JJA means as anchors at January and July (the best two-season setup found
// by season-test.mjs: 3-month-mean anchors, rain interpolated as a square root).
function classifyMix(tSrc, pSrc) {
    const out = new Uint8Array(G);
    const T12 = new Float64Array(12), P12 = new Float64Array(12), Tx = new Float64Array(12), Px = new Float64Array(12);
    for (let c = 0; c < G; c++) {
        if (!scoredLand[c]) continue;
        const pick = (src, isT) => {
            if (src === 'obs12') { const f = isT ? obs.t2m : obs.precip; for (let m = 0; m < 12; m++) (isT ? T12 : P12)[m] = f[m * G + c]; return; }
            const S = src === 'obs2' ? OBS : V1;
            const a = isT ? [S.tW[c], S.tS[c]] : [S.pW[c], S.pS[c]];
            synthesizeCell(a, a, { phase: 0, transform: 'sqrt', attenuation: 3 }, Tx, Px);
            const res = isT ? Tx : Px;
            for (let m = 0; m < 12; m++) (isT ? T12 : P12)[m] = res[m];
        };
        pick(tSrc, true); pick(pSrc, false);
        let ok = true; for (let m = 0; m < 12; m++) ok = ok && T12[m] === T12[m] && P12[m] === P12[m];
        if (ok) out[c] = classifyCell(T12, P12);
    }
    return out;
}
// V1's own classifier: its classes on the 1° grid (majority of its regions per cell), and per region vs Beck 0.1°
const v1Grid = new Uint8Array(G);
{
    const votes = new Map();
    for (let r = 0; r < nR; r++) {
        if (!r_land[r]) continue;
        const key = r_cell[r] * 32 + r_koppen[r];
        votes.set(key, (votes.get(key) ?? 0) + 1);
    }
    const best = new Float64Array(G);
    for (const [key, v] of votes) { const c = Math.floor(key / 32), k = key % 32; if (v > best[c]) { best[c] = v; v1Grid[c] = k; } }
}
const rTruth = new Uint8Array(nR), rSim = new Uint8Array(nR);
for (let r = 0; r < nR; r++) { if (!r_land[r]) continue; rTruth[r] = truthAt01(koppen01, ctx.r_lat[r] * DEG, ctx.r_lon[r] * DEG); rSim[r] = r_koppen[r]; }

const rows = [
    ['Observed T and P, 12 months (classifier ceiling)', classifyMix('obs12', 'obs12')],
    ['Observed T and P, 2 seasons (best any 2-season model can do)', classifyMix('obs2', 'obs2')],
    ["V1's temperature + V1's rain (V1, new classifier)", classifyMix('v1', 'v1')],
    ["Observed temperature + V1's rain (rain error alone)", classifyMix('obs12', 'v1')],
    ["V1's temperature + observed rain (temperature error alone)", classifyMix('v1', 'obs12')],
    ["V1's own classifier (as shipped), on the 1° grid", v1Grid],
];
results.koppen = { rows: [] };
console.log('\nKöppen vs Beck 1991–2020 (land both agree on; area-weighted):');
console.log('                                                                  exact  major graded     Cs     Cw     Am     Dw');
for (const [label, cls] of rows) {
    const cmp = compareClasses(beck1, cls, W, scoredLand);
    const reg = Object.fromEntries(Object.entries(REGIMES).map(([k, codes]) => [k, groupStats(cmp, codes)]));
    results.koppen.rows.push({ label, exact: cmp.exact, major: cmp.major, graded: cmp.graded, macroF1: cmp.macroF1,
        regimes: Object.fromEntries(Object.entries(reg).map(([k, v]) => [k, { recall: v.recall, areaRatio: v.areaRatio }])) });
    const p = x => (100 * x).toFixed(1).padStart(6);
    console.log(`  ${label.padEnd(62)} ${p(cmp.exact)} ${p(cmp.major)} ${p(cmp.graded)} ${['Cs (Mediterranean)', 'Cw (dry-winter temperate)', 'Am (tropical monsoon)', 'Dw (dry-winter continental)'].map(k => p(reg[k].recall)).join(' ')}`);
}
const perRegion = compareClasses(rTruth, rSim, null, null);
results.koppen.v1PerRegion = { exact: perRegion.exact, major: perRegion.major, graded: perRegion.graded };
console.log(`  V1 as shipped, per region vs Beck 0.1°: exact ${(100 * perRegion.exact).toFixed(1)} %, major ${(100 * perRegion.major).toFixed(1)} %, graded ${(100 * perRegion.graded).toFixed(1)} %`);

// ── Report the stages ─────────────────────────────────────────────────────────
const f = (x, d = 2) => (x === x ? x.toFixed(d) : '—');
const S = results.stages;
console.log('\nStage by stage (V1 vs observed; JJA / DJF):');
console.log(`  Pressure     pattern corr ${f(S.pressure.JJA.patternCorr)} / ${f(S.pressure.DJF.patternCorr)}   east–west corr ${f(S.pressure.JJA.eastWestCorr)} / ${f(S.pressure.DJF.eastWestCorr)}`
    + `   east–west spread sim ${f(S.pressure.JJA.eastWestSimStd, 1)} vs obs ${f(S.pressure.JJA.eastWestObsStd, 1)} hPa (JJA)`);
console.log(`  Wind         direction: mean cos ${f(S.wind.JJA.all.meanCos)} / ${f(S.wind.DJF.all.meanCos)}   within 45° ${f(100 * S.wind.JJA.all.within45deg, 0)} % / ${f(100 * S.wind.DJF.all.within45deg, 0)} %`
    + `   (sea ${f(100 * S.wind.JJA.sea.within45deg, 0)} %, land ${f(100 * S.wind.JJA.land.within45deg, 0)} % in JJA)`);
console.log(`  ITCZ         mean |error| ${f(S.itcz.JJA.meanAbsErrDeg, 1)}° / ${f(S.itcz.DJF.meanAbsErrDeg, 1)}°   mean latitude sim ${f(S.itcz.JJA.simMeanLat, 1)}° vs obs ${f(S.itcz.JJA.obsMeanLat, 1)}° (JJA), ${f(S.itcz.DJF.simMeanLat, 1)}° vs ${f(S.itcz.DJF.obsMeanLat, 1)}° (DJF)`);
console.log(`  Ocean        warmth vs observed east–west SST pattern: corr ${f(S.ocean.JJA.eastWestCorr)} / ${f(S.ocean.DJF.eastWestCorr)}`);
console.log(`  Temperature  corr ${f(S.temperature.JJA.corr)} / ${f(S.temperature.DJF.corr)}   bias ${f(S.temperature.JJA.biasC, 1)} / ${f(S.temperature.DJF.biasC, 1)} °C   rmse ${f(S.temperature.JJA.rmseC, 1)} / ${f(S.temperature.DJF.rmseC, 1)} °C`
    + `   seasonal range sim ${f(S.temperature.seasonalRange.simMeanC, 1)} vs obs ${f(S.temperature.seasonalRange.obsMeanC, 1)} °C (corr ${f(S.temperature.seasonalRange.corr)})`);
console.log(`  Rain         log corr ${f(S.rain.JJA.logCorr)} / ${f(S.rain.DJF.logCorr)}   annual log corr ${f(S.rain.annual.logCorr)}   mean ${f(S.rain.JJA.simMeanMm, 0)} vs ${f(S.rain.JJA.obsMeanMm, 0)} / ${f(S.rain.DJF.simMeanMm, 0)} vs ${f(S.rain.DJF.obsMeanMm, 0)} mm/month`
    + `   wet season right way round ${f(100 * S.rain.wetSeasonRightWayRound, 0)} %`);

// ── Save ─────────────────────────────────────────────────────────────────────
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.mkdirSync(LAB_DIR, { recursive: true });
const { _itczS, _itczW, ...summary } = results;
fs.writeFileSync(path.join(OUT_DIR, `stage-audit-${N}.json`), JSON.stringify(summary, null, 2));
fs.writeFileSync(path.join(LAB_DIR, 'stage-audit.json'), JSON.stringify({ ...summary, itcz: { JJA: _itczS, DJF: _itczW } }));
const save2 = (name, a, b) => {                // two layers: JJA, DJF
    const out = new Float32Array(2 * G); out.set(a, 0); out.set(b, G);
    fs.writeFileSync(path.join(LAB_DIR, `v1_${name}.f32`), Buffer.from(out.buffer));
};
save2('t2m', V1.tS, V1.tW); save2('precip', V1.pS, V1.pW); save2('slp', V1.slpS, V1.slpW);
save2('u10', V1.uS, V1.uW); save2('v10', V1.vS, V1.vW); save2('oceanWarmth', V1.warmS, V1.warmW);
fs.writeFileSync(path.join(LAB_DIR, 'v1_koppen.u8'), v1Grid);
fs.writeFileSync(path.join(LAB_DIR, 'v1_landFrac.f32'), Buffer.from(V1.landFrac.buffer));
console.log(`\nWrote ${path.relative(process.cwd(), path.join(OUT_DIR, `stage-audit-${N}.json`))} and V1 fields for the lab.`);
