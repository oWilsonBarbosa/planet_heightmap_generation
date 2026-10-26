/**
 * Phase 5 — the rain stage (v2/js/climate/rain.js): a column-water budget driven by the winds and temperature.
 *
 *   node tuning/climate/rain-check.mjs              score the current settings
 *   node tuning/climate/rain-check.mjs --tune       tune (continent- and basin-aware, priors), then score
 *   node tuning/climate/rain-check.mjs --set RAIN_EDDY_DIFF=2e6
 *   node tuning/climate/rain-check.mjs --quick      open loop only (for iterating on the physics)
 *
 * Open loop: the stage gets the observed winds and "real where observed" temperature (Beck land, OISST sea, the
 * Phase 2 model under sea ice and in gaps), so its error is its own. Scored against Beck's monthly rain on land (each
 * continent) and GPCP at sea (each ocean basin), all regions weighted equally, as the typical monthly error in log
 * terms (a ratio: 0.69 = off by a factor of 2); V1's rain on the same cells (its two seasons); the rain belt; which
 * half of the year is wetter; named features (deserts, rainforests, monsoons, rain shadows). Then the truth swap
 * (observed temperature + new rain → Köppen), the closed loop (every stage new) and the test planets. Earth is a
 * check, not the target: settings are physical with literature priors (config.js); tuning keeps a change only if no
 * region ends up worse than with the literature values.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEarthGrayscale } from './lib/earth-context.mjs';
import { buildEarthMesh } from './lib/earth-mesh.mjs';
import { loadReferences, truthAt01, seasonMean, JJA, DJF } from './lib/ref.mjs';
import { compareClasses, gridWeights } from './lib/compare.mjs';
import { continentOf, TUNED_CONTINENTS } from './lib/continents.mjs';
import { basinOf, TUNED_BASINS } from './lib/regions.mjs';
import { elevToHeightKm } from '../../js/color-map.js';
import { buildSphere } from '../../js/sphere-mesh.js';
import { makeRng } from '../../js/rng.js';
import { computeClimate, aggregateSurface, cellLatLon } from '../../v2/js/climate/core.js';
import { energyBalanceTemperature } from '../../v2/js/climate/temperature.js';
import { derivedCirculation } from '../../v2/js/climate/circulation.js';
import { windDrivenOcean } from '../../v2/js/climate/ocean.js';
import { columnWaterRain } from '../../v2/js/climate/rain.js';
import { observedWinds, atAnchors } from '../../v2/js/climate/inputs.js';
import { PARAMS, PARAMS_DEFAULTS, PARAM_PRIORS, setParams, resetParams } from '../../v2/js/climate/config.js';
import { TEST_PLANETS, buildTestPlanet } from '../../v2/js/climate/test-planets.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, '..', 'results', 'climate');
const LAB_DIR = path.join(__dirname, 'data', 'lab');
const TUNE = process.argv.includes('--tune'), QUICK = process.argv.includes('--quick');
const argSet = process.argv.indexOf('--set');
const OVERRIDES = argSet > 0 ? Object.fromEntries(process.argv[argSet + 1].split(',').map(kv => { const [k, v] = kv.split('='); return [k, +v]; })) : {};
setParams(OVERRIDES);
if (process.env.RAIN_DEBUG) globalThis.RAIN_DEBUG = true;
const N = 160000;
const f0 = (x) => (x === x ? x.toFixed(0) : '—'), f1 = (x) => (x === x ? x.toFixed(1) : '—'), f2 = (x) => (x === x ? x.toFixed(2) : '—');
const pc = (x) => (x === x ? `${(100 * x).toFixed(0)} %` : '—');

const { grid, fields: obs, koppen01, land: obsLand } = loadReferences();
const G = grid.size, W = gridWeights(grid);
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
const ctxEarth = { grid, surface, anchorMonths: MONTHS12, options: { lapseRateCPerKm: 6.5 } };
const obsWinds = observedWinds(obs.u10, obs.v10)(ctxEarth);
const cellLat = (c) => grid.lat[Math.floor(c / grid.w)], cellLon = (c) => grid.lon[c % grid.w];

// ── Open-loop input: "real where observed" temperature ──
const phase2 = energyBalanceTemperature()(ctxEarth, obsWinds);
const obsT = { monthly: new Float32Array(12 * G), monthlySL: new Float32Array(12 * G), seaIce: new Float32Array(12 * G) };
let filled = 0;
for (let m = 0; m < 12; m++) for (let c = 0; c < G; c++) {
    const k = m * G + c, f = surface.landFrac[c];
    const tl = obs.t2m[k], ts = obs.sst[k], ice = obs.seaIce[k];
    const landOk = tl === tl, seaOk = ts === ts && !(ice > 0.15);
    const href = surface.meanLandKm[c] === surface.meanLandKm[c] ? Math.max(0, surface.meanLandKm[c]) : 0;
    let v;
    if (landOk && seaOk) v = f * tl + (1 - f) * ts;
    else if (landOk && f >= 0.3) v = tl;
    else if (seaOk && f < 0.7) v = ts;
    else { v = phase2.monthly[k]; filled++; }
    obsT.monthly[k] = v;
    obsT.monthlySL[k] = seaOk ? ts : (landOk ? tl + 6.5 * href : phase2.monthlySL[k]);
    obsT.seaIce[k] = ice === ice ? Math.min(1, ice) : 0;
}

// ── Masks: land per continent (Beck), sea per basin (GPCP) ──
const landMask = Object.fromEntries(TUNED_CONTINENTS.map(k => [k, new Uint8Array(G)]));
const landAll = new Uint8Array(G);
for (let c = 0; c < G; c++) {
    if (!(obsLand[c] && surface.landFrac[c] >= 0.5)) continue;
    const k = continentOf(cellLat(c), cellLon(c));
    if (landMask[k]) { landMask[k][c] = 1; landAll[c] = 1; }
}
const seaMask = Object.fromEntries(TUNED_BASINS.map(k => [k, new Uint8Array(G)]));
const seaAll = new Uint8Array(G);
for (let c = 0; c < G; c++) {
    if (surface.landFrac[c] >= 0.2 || !(obs.precipAll[c] === obs.precipAll[c])) continue;
    const b = basinOf(cellLat(c), cellLon(c)); if (seaMask[b]) { seaMask[b][c] = 1; seaAll[c] = 1; }
}
const REGIONS = [...TUNED_CONTINENTS, ...TUNED_BASINS];
const refOf = (region) => (TUNED_CONTINENTS.includes(region) ? obs.precip : obs.precipAll);
const maskOf = (region) => landMask[region] ?? seaMask[region];

// ── Metrics ──
const lr = (s, o) => Math.log((s + 10) / (o + 10));
/** Typical monthly error as a log ratio (0.69 = a factor of 2) over a mask and a set of months. */
function logErr(model, ref, mask, months = MONTHS12, modelLayer = (m) => m) {
    let se = 0, sw = 0;
    for (const m of months) {
        const ml = modelLayer(m);
        for (let c = 0; c < G; c++) { if (!mask[c]) continue; const o = ref[m * G + c], s = model[ml * G + c]; if (o === o && s === s) { se += W[c] * lr(s, o) ** 2; sw += W[c]; } }
    }
    return Math.sqrt(se / sw);
}
function corr(a, b, mask) {
    let sw = 0, ma = 0, mb = 0;
    for (let c = 0; c < G; c++) if (mask[c]) { sw += W[c]; ma += W[c] * a[c]; mb += W[c] * b[c]; }
    ma /= sw; mb /= sw;
    let n = 0, va = 0, vb = 0;
    for (let c = 0; c < G; c++) if (mask[c]) { const da = a[c] - ma, db = b[c] - mb; n += W[c] * da * db; va += W[c] * da * da; vb += W[c] * db * db; }
    return n / Math.sqrt(va * vb);
}
const lg = (a) => a.map(v => Math.log(Math.max(0, v) + 10));
/** V1-comparable measures from two seasons (JJA, DJF mean mm/month) on land. */
function seasonal(pS, pW) {
    const oS = seasonMean(obs.precip, G, JJA), oW = seasonMean(obs.precip, G, DJF);
    let agree = 0, tot = 0;
    for (let c = 0; c < G; c++) {
        if (!landAll[c]) continue;
        const dO = oS[c] - oW[c], dS = pS[c] - pW[c], mean = (oS[c] + oW[c]) / 2;
        if (Math.abs(dO) < 0.3 * mean || mean < 5) continue;
        tot += W[c]; if (Math.sign(dO) === Math.sign(dS)) agree += W[c];
    }
    const perCont = {};
    for (const k of TUNED_CONTINENTS) {
        let se = 0, sw = 0;
        for (let c = 0; c < G; c++) if (landMask[k][c]) { se += W[c] * (lr(pS[c], oS[c]) ** 2 + lr(pW[c], oW[c]) ** 2); sw += 2 * W[c]; }
        perCont[k] = Math.sqrt(se / sw);
    }
    const meanCont = Object.values(perCont).reduce((a, b) => a + b, 0) / TUNED_CONTINENTS.length;
    return { logCorrJJA: corr(lg(pS), lg(oS), landAll), logCorrDJF: corr(lg(pW), lg(oW), landAll), wetSeason: agree / tot, perCont, meanCont };
}
/** Latitude of the tropical rain maximum per longitude (±30°, smoothed 20° × 5°) — the rain belt. */
function beltLat(P, m) {
    const out = new Float64Array(grid.w), p = P.subarray(m * G, (m + 1) * G);
    for (let i = 0; i < grid.w; i++) {
        let best = -1, bestLat = 0;
        for (let j = 0; j < grid.h; j++) {
            const lat = grid.lat[j]; if (Math.abs(lat) > 30) continue;
            let s = 0, n = 0;
            for (let di = -10; di <= 10; di++) for (let dj = -2; dj <= 2; dj++) {
                const jj = j + dj; if (jj < 0 || jj >= grid.h) continue;
                const v = p[jj * grid.w + (((i + di) % grid.w) + grid.w) % grid.w]; if (v === v) { s += v; n++; }
            }
            if (n && s / n > best) { best = s / n; bestLat = lat; }
        }
        out[i] = bestLat;
    }
    return out;
}
const OBS_BELT = MONTHS12.map(m => beltLat(obs.precipAll, m));
function beltError(P) {
    let s = 0, n = 0;
    for (const m of MONTHS12) { const b = beltLat(P, m); for (let i = 0; i < grid.w; i++) { s += Math.abs(b[i] - OBS_BELT[m][i]); n++; } }
    return s / n;
}
/** Everything about a monthly (12 × G) rain field. */
function score(P) {
    const per = Object.fromEntries(REGIONS.map(k => [k, logErr(P, refOf(k), maskOf(k))]));
    const mean = REGIONS.reduce((a, k) => a + per[k], 0) / REGIONS.length;
    const ann = seasonMean(P, G, MONTHS12), annObs = seasonMean(obs.precip, G, MONTHS12), annAll = seasonMean(obs.precipAll, G, MONTHS12);
    const seas = seasonal(seasonMean(P, G, JJA), seasonMean(P, G, DJF));
    return {
        per, mean, belt: beltError(P), seas,
        landAnnualLogCorr: corr(lg(ann), lg(annObs), landAll), seaAnnualLogCorr: corr(lg(ann), lg(annAll), seaAll),
        landMonthly: logErr(P, obs.precip, landAll), seaMonthly: logErr(P, obs.precipAll, seaAll),
    };
}

// ── Named features ──
const box = (f, la0, la1, lo0, lo1, months = MONTHS12) => {
    let s = 0, n = 0;
    for (const m of months) for (let j = 0; j < grid.h; j++) {
        const la = grid.lat[j]; if (la < la0 || la > la1) continue;
        for (let i = 0; i < grid.w; i++) { const lo = grid.lon[i]; if (lo < lo0 || lo > lo1) continue; const c = j * grid.w + i; if (surface.landFrac[c] < 0.5) continue; const v = f[m * G + c]; if (v === v) { s += v; n++; } }
    }
    return n ? s / n : NaN;
};
function named(P) {
    const out = [];
    const chk = (text, ok, detail, phase8 = false) => out.push({ text, ok, detail, phase8 });
    const both = (f, ...b) => [box(f, ...b), box(obs.precip, ...b)];
    const lvl = (text, b, cmp, thr) => { const [s, o] = both(P, ...b); chk(text, cmp === '<' ? s < thr : s > thr, `${f0(s)} mm/month (real ${f0(o)})`); };
    lvl('Sahara dry (< 15 mm/month)', [18, 28, -10, 30], '<', 15);
    lvl('Arabian and Thar deserts dry (< 20)', [18, 28, 42, 72], '<', 20);
    lvl('Australian interior dry (< 30)', [-30, -20, 122, 140], '<', 30);
    lvl('Atacama dry (< 20)', [-27, -18, -72, -69], '<', 20);
    lvl('Namib dry (< 20)', [-28, -18, 12, 16], '<', 20);
    lvl('Amazon wet (> 150)', [-10, 2, -70, -50], '>', 150);
    lvl('Congo wet (> 110)', [-5, 5, 12, 28], '>', 110);
    lvl('Maritime continent wet (> 180)', [-8, 6, 95, 125], '>', 180);
    const ratio = (text, b, m1, m2, thr, phase8) => {
        const s = box(P, ...b, m1) / box(P, ...b, m2), o = box(obs.precip, ...b, m1) / box(obs.precip, ...b, m2);
        chk(text, s > thr, `× ${f1(s)} (real × ${f1(o)})`, phase8);
    };
    ratio('South Asian monsoon: Jun–Aug > 4 × Dec–Feb (India)', [15, 25, 72, 88], JJA, DJF, 4);
    ratio('West African monsoon: Jun–Aug > 4 × Dec–Feb (Sahel)', [10, 16, -10, 20], JJA, DJF, 4);
    ratio('East Asian summer rain: Jun–Aug > 2 × Dec–Feb (south China)', [23, 33, 105, 120], JJA, DJF, 2);
    ratio('Northern Australian monsoon: Dec–Feb > 4 × Jun–Aug', [-18, -11, 125, 142], DJF, JJA, 4);
    ratio('Mediterranean: Dec–Feb > 2 × Jun–Aug (Phase 8)', [35, 42, -8, 25], DJF, JJA, 2, true);
    ratio('California: Dec–Feb > 3 × Jun–Aug (Phase 8)', [33, 40, -123, -117], DJF, JJA, 3, true);
    const shadow = (text, wet, dry, thr) => {
        const s = box(P, ...wet) / box(P, ...dry), o = box(obs.precip, ...wet) / box(obs.precip, ...dry);
        chk(text, s > thr, `× ${f1(s)} (real × ${f1(o)})`);
    };
    shadow('Rain shadow: southern Chile > 2 × Patagonia', [-50, -40, -75, -72], [-50, -40, -70, -65], 2);
    shadow('Rain shadow: Pacific Northwest > 2 × the Great Basin', [42, 55, -128, -121], [38, 44, -120, -112], 2);
    shadow('Continentality: western Europe > 2 × Kazakhstan', [45, 55, -5, 10], [40, 50, 55, 75], 2);
    // the rain belt over the eastern Pacific stays north of the equator (Jun–Aug) — and is north of it all year
    const b = MONTHS12.map(m => beltLat(P, m)), ep = (m) => { let s = 0, n = 0; for (let i = 0; i < grid.w; i++) { const lo = grid.lon[i]; if (lo > -150 && lo < -100) { s += b[m][i]; n++; } } return s / n; };
    const epObs = (m) => { let s = 0, n = 0; for (let i = 0; i < grid.w; i++) { const lo = grid.lon[i]; if (lo > -150 && lo < -100) { s += OBS_BELT[m][i]; n++; } } return s / n; };
    const jja = (ep(5) + ep(6) + ep(7)) / 3;
    chk('Eastern Pacific rain belt north of the equator in Jun–Aug (5–12°N)', jja > 4 && jja < 14, `${f1(jja)}° (real ${f1((epObs(5) + epObs(6) + epObs(7)) / 3)}°)`);
    return out;
}

// ── The open loop: observed temperature, with the observed winds and with the circulation stage's own winds ──
const rainStage = columnWaterRain();
const derivedWinds = derivedCirculation()(ctxEarth, obsT);
function runOpen(winds = obsWinds) { return rainStage(ctxEarth, winds, obsT); }

// ── Tuning (continent- and basin-aware, with priors) ──
const TUNED = ['RAIN_EVAP_COEFF', 'RAIN_SURFACE_RH', 'RAIN_TIMESCALE_H', 'RAIN_RH_STEEPNESS', 'RAIN_EDDY_DIFF', 'RAIN_EDDY_LENGTH_KM', 'RAIN_STORM_RH', 'RAIN_WIND_ROT', 'RAIN_WIND_DIV_DRY', 'RAIN_WIND_DIV_MOIST', 'RAIN_STABILITY', 'RAIN_SOIL_MM', 'RAIN_COLUMN_LOCAL', 'RAIN_OROGRAPHIC'];
const PRIOR_WEIGHT = 0.05, WORSEN = 0.05;
const objective = (s) => s.mean + 0.01 * s.belt;
function prior(p) { let s = 0; for (const k of TUNED) { const pr = PARAM_PRIORS[k]; s += ((Math.log(p[k]) - Math.log(pr.value)) / (Math.log(pr.max) - Math.log(pr.min))) ** 2; } return PRIOR_WEIGHT * s; }
let tuneLog = null;
if (TUNE) {
    let best = { ...PARAMS_DEFAULTS, ...OVERRIDES };
    for (const k of TUNED) best[k] = PARAM_PRIORS[k].value;
    // both wind sources: the settings must suit the winds the stage will get (the circulation stage's) as well as real ones
    const ev = (p) => {
        setParams(p);
        const a = score(runOpen().P), b = score(runOpen(derivedWinds).P);
        const s = { per: Object.fromEntries(REGIONS.map(k => [k, (a.per[k] + b.per[k]) / 2])), mean: (a.mean + b.mean) / 2, belt: (a.belt + b.belt) / 2 };
        return { s, total: objective(s) + prior(p) };
    };
    let bestE = ev(best);
    const start = { ...bestE.s.per };
    const fmt = (e) => REGIONS.map(k => `${k.split(' ').map(x => x[0]).join('')} ${e.s.per[k].toFixed(2)}`).join(' ');
    console.log(`Tuning ${TUNED.length} rain settings (open loop; continents and basins weighted equally; none worse than with literature values).`);
    console.log(`  start ${bestE.total.toFixed(3)} (rain belt ${f1(bestE.s.belt)}°)  ${fmt(bestE)}`);
    let step = 0.25;
    for (let round = 0; round < 6; round++) {
        let improved = false;
        for (const k of TUNED) {
            const pr = PARAM_PRIORS[k], lmin = Math.log(pr.min), lmax = Math.log(pr.max);
            for (const dir of [1, -1]) {
                const lv = Math.max(lmin, Math.min(lmax, Math.log(best[k]) + dir * step * (lmax - lmin)));
                const trial = { ...best, [k]: Math.exp(lv) };
                if (Math.abs(trial[k] - best[k]) < 1e-12 * Math.abs(best[k])) continue;
                const e = ev(trial);
                if (e.total < bestE.total - 1e-3 && REGIONS.every(r => e.s.per[r] <= start[r] + WORSEN)) { best = trial; bestE = e; improved = true; break; }
            }
        }
        console.log(`  round ${round + 1} (step ${(100 * step).toFixed(1)} %): ${bestE.total.toFixed(3)} (rain belt ${f1(bestE.s.belt)}°)  ${fmt(bestE)}`);
        if (!improved) step /= 2;
    }
    tuneLog = { params: Object.fromEntries(TUNED.map(k => [k, best[k]])), total: bestE.total };
    setParams(best);
    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(path.join(OUT_DIR, 'rain-tuned.json'), JSON.stringify(tuneLog, null, 2));
    console.log('  tuned:', Object.entries(tuneLog.params).map(([k, v]) => `${k}=${+(+v).toPrecision(3)}`).join(', '));
}

const t0 = performance.now();
const open = runOpen();
const openMs = performance.now() - t0;
const S = score(open.P);
const readLab = (name) => { const b = fs.readFileSync(path.join(LAB_DIR, name)); return new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4); };
const v1P = readLab('v1_precip.f32');
const V1 = seasonal(v1P.subarray(0, G), v1P.subarray(G, 2 * G));
const V1belt = (() => { try { const a = JSON.parse(fs.readFileSync(path.join(LAB_DIR, 'stage-audit.json'), 'utf8')); return a.stages?.itcz ?? null; } catch { return null; } })();
const balance = open.balance.map(b => f2(b)).join(' ');
console.log(`\nRain stage, open loop (observed winds and temperature; ${(100 * filled / (12 * G)).toFixed(0)} % of temperature cells from the Phase 2 model) — ${f0(openMs)} ms for 12 months, ${open.cycles} cycles; rain / evaporation per month ${balance}`);
console.log(`  Typical monthly error (log ratio; 0.69 = × 2), regions weighted equally: ${f2(S.mean)} — land ${f2(S.landMonthly)}, sea ${f2(S.seaMonthly)}`);
console.log('  per region: ' + REGIONS.map(k => `${k} ${f2(S.per[k])}`).join(', '));
console.log(`  Annual pattern (log corr): land ${f2(S.landAnnualLogCorr)}, sea ${f2(S.seaAnnualLogCorr)};  rain belt ${f1(S.belt)}° off`);
console.log(`  Two seasons, land (vs V1 on the same cells): log corr Jun–Aug ${f2(S.seas.logCorrJJA)} (V1 ${f2(V1.logCorrJJA)}), Dec–Feb ${f2(S.seas.logCorrDJF)} (V1 ${f2(V1.logCorrDJF)});`
    + ` wet season right way round ${pc(S.seas.wetSeason)} (V1 ${pc(V1.wetSeason)}); per-continent error ${f2(S.seas.meanCont)} (V1 ${f2(V1.meanCont)})`);
console.log('  per continent, two seasons (new / V1): ' + TUNED_CONTINENTS.map(k => `${k} ${f2(S.seas.perCont[k])}/${f2(V1.perCont[k])}`).join(', '));
const openD = runOpen(derivedWinds), SD = score(openD.P);
console.log(`
  With the circulation stage's winds (observed temperature): typical error ${f2(SD.mean)} (land ${f2(SD.landMonthly)}, sea ${f2(SD.seaMonthly)}); rain belt ${f1(SD.belt)}° off;`
    + ` log corr ${f2(SD.seas.logCorrJJA)} / ${f2(SD.seas.logCorrDJF)}; wet season ${pc(SD.seas.wetSeason)}; per-continent error ${f2(SD.seas.meanCont)}`);
console.log('  per region: ' + REGIONS.map(k => `${k} ${f2(SD.per[k])}`).join(', '));
const namedD = named(openD.P);
console.log(`  named: ${namedD.filter(c => c.ok).length} / ${namedD.length} pass; fail: ${namedD.filter(c => !c.ok).map(c => `${c.text.split(' (')[0].split(':')[0]} ${c.detail.split(' (')[0]}`).join(' · ')}`);
const namedOpen = named(open.P);
console.log('\n  Named features (open loop):');
for (const c of namedOpen) console.log(`    ${c.ok ? 'PASS' : 'FAIL'}  ${c.text} — ${c.detail}`);
if (QUICK) { resetParams(); process.exit(0); }

// ── Truth swap: observed temperature + new rain (6 points in the year) → Köppen ──
const truth = new Uint8Array(nR); for (let r = 0; r < nR; r++) truth[r] = truthAt01(koppen01, latC[r], lonC[r]);
const input = { xyz: earth.r_xyz, elevKm, axes: 'y-up' };
const swap = computeClimate(input, {
    anchorSource: (sctx) => ({ T: atAnchors(obs.t2m, G, sctx.anchorMonths), P: rainStage(sctx, obsWinds, obsT).P }),
});
const swapAcc = compareClasses(truth, swap.cell.koppen).exact;
const oracle = computeClimate(input, { anchorSource: (sctx) => ({ T: atAnchors(obs.t2m, G, sctx.anchorMonths), P: atAnchors(obs.precip, G, sctx.anchorMonths) }) });
const oracleAcc = compareClasses(truth, oracle.cell.koppen).exact;
// V1's rain has two seasons: rebuilt to the same points in the year as a square-root cosine through June–August and
// December–February (the season test's two-season setup), so both rains go through the same pipeline
const v1S = v1P.subarray(0, G), v1W = v1P.subarray(G, 2 * G);
const v1Swap = compareClasses(truth, computeClimate(input, {
    anchorSource: (sctx) => {
        const K = sctx.anchorMonths.length, P = new Float32Array(K * G);
        sctx.anchorMonths.forEach((mf, k) => {
            const cs = Math.cos(2 * Math.PI * (mf + 0.5 - 6.5) / 12);
            for (let c = 0; c < G; c++) { const a = Math.sqrt(Math.max(0, v1S[c])), b = Math.sqrt(Math.max(0, v1W[c])); P[k * G + c] = ((a + b) / 2 + (a - b) / 2 * cs) ** 2; }
        });
        return { T: atAnchors(obs.t2m, G, sctx.anchorMonths), P };
    },
}).cell.koppen).exact;
console.log(`\n  Truth swap — observed temperature + new rain → Köppen: ${(100 * swapAcc).toFixed(1)} % of land (with V1's rain ${(100 * v1Swap).toFixed(1)} %; with observed rain ${(100 * oracleAcc).toFixed(1)} %)`);

// ── Closed loop: every stage new ──
const tc = performance.now();
const closed = computeClimate(input, { stages: { temperature: energyBalanceTemperature(), circulation: derivedCirculation(), ocean: windDrivenOcean(), rain: columnWaterRain() } });
const closedMs = performance.now() - tc;
const Sc = score(closed.months.P);
const closedAcc = compareClasses(truth, closed.cell.koppen).exact;
const namedClosed = named(closed.months.P);
console.log(`\n  Closed loop (every stage new; ${closed.timing.map(t => `${t.stage} ${t.ms.toFixed(0)}`).join(' · ')} ms):`);
console.log(`    typical monthly error ${f2(Sc.mean)} (land ${f2(Sc.landMonthly)}, sea ${f2(Sc.seaMonthly)}); rain belt ${f1(Sc.belt)}° off; wet season ${pc(Sc.seas.wetSeason)}; log corr ${f2(Sc.seas.logCorrJJA)} / ${f2(Sc.seas.logCorrDJF)}`);
console.log(`    Köppen vs Beck: ${(100 * closedAcc).toFixed(1)} % of land (V1 38 %); named ${namedClosed.filter(c => c.ok).length} / ${namedClosed.length} pass`);

// ── Test planets ──
const planets = {};
const pbox = (P, g, la0, la1, lo0, lo1, months, landFrac, wantLand = true) => {
    let s = 0, n = 0;
    for (const m of months) for (let j = 0; j < g.h; j++) {
        const la = g.lat[j]; if (la < la0 || la > la1) continue;
        for (let i = 0; i < g.w; i++) { const lo = g.lon[i]; if (lo < lo0 || lo > lo1) continue; const c = j * g.w + i; if ((landFrac[c] >= 0.5) !== wantLand) continue; s += P[m * g.size + c]; n++; }
    }
    return n ? s / n : NaN;
};
for (const kind of ['midlat', 'tropical', 'supercontinent', 'mountains']) {
    if (!TEST_PLANETS[kind]) continue;
    const p = buildTestPlanet(kind, 40000, buildSphere, makeRng(7));
    const res = computeClimate({ xyz: p.xyz, elevKm: p.elevKm, axes: p.axes }, { stages: { temperature: energyBalanceTemperature(), circulation: derivedCirculation(), ocean: windDrivenOcean(), rain: columnWaterRain() } });
    const P = res.months.P, g = res.grid, lf = res.surface.landFrac, list = [];
    const B = (la0, la1, lo0, lo1, months = MONTHS12, wantLand = true) => pbox(P, g, la0, la1, lo0, lo1, months, lf, wantLand);
    const chk = (text, ok, detail) => list.push({ text, ok, detail });
    if (kind === 'midlat') {
        const west = B(40, 50, -40, -30), inner = B(40, 50, -8, 8);
        chk('the west coast under the westerlies is wetter than the interior', west > inner, `${f0(west)} vs ${f0(inner)} mm/month at 40–50°N`);
        const sw = B(20, 28, -38, -25), se = B(20, 28, 25, 38);
        chk('subtropical west coast drier than the east coast (eastern-ocean highs vs onshore trades)', sw < se, `${f0(sw)} vs ${f0(se)} mm/month at 20–28°N`);
    } else if (kind === 'tropical') {
        const eq = B(-5, 5, 5, 40), sub = (B(20, 30, 5, 40) + B(-30, -20, 5, 40)) / 2;
        chk('equator wetter than the subtropics', eq > 2 * sub, `${f0(eq)} vs ${f0(sub)} mm/month`);
        const nS = B(8, 18, 5, 40, JJA) / B(8, 18, 5, 40, DJF), sS = B(-18, -8, 5, 40, DJF) / B(-18, -8, 5, 40, JJA);
        chk('the rain belt follows the sun (10–18° wet in its own summer)', nS > 2 && sS > 2, `north × ${f1(nS)}, south × ${f1(sS)}`);
    } else if (kind === 'supercontinent') {
        // paleoclimate runs of Pangaea (Kutzbach & Gallimore 1989; Parrish 1993): wet, monsoonal equatorial coasts, an arid interior
        const eqCoast = (B(-5, 5, -53, -45) + B(-5, 5, 45, 53)) / 2, eqInner = B(-5, 5, -15, 15), desert = (B(18, 32, -20, 20) + B(-32, -18, -20, 20)) / 2;
        chk('equatorial coasts wet, subtropical interior a desert', eqCoast > 60 && desert < 25, `coasts ${f0(eqCoast)}, subtropical interior ${f0(desert)} mm/month (equatorial interior ${f0(eqInner)})`);
        const coast = B(40, 55, -52, -45), inner = B(40, 55, -10, 10);
        chk('mid-latitude west coast wetter than the deep interior', coast > 2 * inner, `${f0(coast)} vs ${f0(inner)} mm/month`);
    } else if (kind === 'mountains') {
        const wind = B(38, 52, -39, -33), lee = B(38, 52, -26, -18);             // the slopes either side of the crest (−30°)
        chk('windward (west) side of the range wetter than the lee side', wind > 1.5 * lee, `${f0(wind)} vs ${f0(lee)} mm/month at 38–52°N`);
    }
    planets[kind] = { checks: list, ms: res.timing.reduce((a, t) => a + t.ms, 0) };
    console.log(`\n  ${TEST_PLANETS[kind].label}:`);
    for (const c of list) console.log(`    ${c.ok ? 'PASS' : 'FAIL'}  ${c.text} — ${c.detail}`);
}

const namedCore = namedOpen.filter(c => !c.phase8);
const gate = {
    beatsV1: S.seas.logCorrJJA > V1.logCorrJJA && S.seas.logCorrDJF > V1.logCorrDJF && S.seas.wetSeason > V1.wetSeason && S.seas.meanCont < V1.meanCont,
    truthSwap: swapAcc > v1Swap,
    named: namedCore.filter(c => c.ok).length >= namedCore.length - 2,
    testPlanets: Object.values(planets).every(p => p.checks.every(c => c.ok)),
};
gate.pass = Object.values(gate).every(Boolean);
console.log(`\nGate: beats V1's rain ${gate.beatsV1 ? '✓' : '✗'} · truth swap beats V1 ${gate.truthSwap ? '✓' : '✗'} · named features ${gate.named ? '✓' : '✗'} · test planets ${gate.testPlanets ? '✓' : '✗'} → ${gate.pass ? 'PASSED' : 'not met'}`);

const results = {
    params: Object.fromEntries(Object.keys(PARAMS).filter(k => k.startsWith('RAIN_')).map(k => [k, PARAMS[k]])), tuned: tuneLog,
    open: { ms: openMs, cycles: open.cycles, balance: open.balance, ...S, named: namedOpen },
    openDerivedWinds: SD,
    v1: V1, truthSwap: { new: swapAcc, observedRain: oracleAcc, v1: v1Swap },
    closed: { ms: closedMs, timing: closed.timing, ...Sc, koppen: closedAcc, named: namedClosed },
    planets, gate,
};
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, 'rain-check.json'), JSON.stringify(results, null, 2));
fs.writeFileSync(path.join(LAB_DIR, 'rain-check.json'), JSON.stringify(results));
console.log(`Wrote ${path.relative(process.cwd(), path.join(OUT_DIR, 'rain-check.json'))}`);
resetParams();
