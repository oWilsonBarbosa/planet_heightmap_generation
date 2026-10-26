/**
 * Phase 3 — the circulation stage (pressure and wind, v2/js/climate/circulation.js), checked on its own and coupled.
 *
 *   node tuning/climate/circulation-check.mjs            score the current settings
 *   node tuning/climate/circulation-check.mjs --tune     tune (region-aware, priors), then score
 *   node tuning/climate/circulation-check.mjs --set CIRC_THERMAL_HPA_PER_K=1.2
 *
 * Open loop: the stage gets the observed near-surface temperature (NCEP air if downloaded; otherwise "real where
 * observed" — Beck land, OISST sea — with the Phase 2 model filling sea ice and gaps), so its error is its own.
 * Scored against NCEP pressure and winds per region — the continents and the ocean basins, each weighted equally: wind
 * direction and speed, the pressure pattern — plus the zonal-mean pressure profile (the belts' depth and place)
 * and the rain belt against GPCP's rain maximum. Earth is a check, not the target: settings are physical with
 * literature priors (config.js), tuning keeps a change only if no region ends up worse than with the literature values.
 *
 * Closed loop: temperature ↔ winds coupled, on Earth (temperature must not get worse than with the observed winds)
 * and on the test planets (physical expectations). V1's pressure and winds are scored on the same cells.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEarthGrayscale } from './lib/earth-context.mjs';
import { buildEarthMesh } from './lib/earth-mesh.mjs';
import { loadReferences, truthAt01, seasonMean, JJA, DJF } from './lib/ref.mjs';
import { compareClasses, gridWeights } from './lib/compare.mjs';
import { continentOf, TUNED_CONTINENTS, CONTINENTS } from './lib/continents.mjs';
import { regionOf, TUNED_REGIONS, BASINS } from './lib/regions.mjs';
import { elevToHeightKm } from '../../js/color-map.js';
import { buildSphere } from '../../js/sphere-mesh.js';
import { makeRng } from '../../js/rng.js';
import { computeClimate, aggregateSurface, cellLatLon } from '../../v2/js/climate/core.js';
import { energyBalanceTemperature } from '../../v2/js/climate/temperature.js';
import { derivedCirculation } from '../../v2/js/climate/circulation.js';
import { observedWinds, observedRain } from '../../v2/js/climate/inputs.js';
import { PARAMS, PARAMS_DEFAULTS, PARAM_PRIORS, setParams, resetParams } from '../../v2/js/climate/config.js';
import { TEST_PLANETS, buildTestPlanet } from '../../v2/js/climate/test-planets.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, '..', 'results', 'climate');
const LAB_DIR = path.join(__dirname, 'data', 'lab');
const TUNE = process.argv.includes('--tune');
const argSet = process.argv.indexOf('--set');
const OVERRIDES = argSet > 0 ? Object.fromEntries(process.argv[argSet + 1].split(',').map(kv => { const [k, v] = kv.split('='); return [k, +v]; })) : {};
setParams(OVERRIDES);
const N = 160000;
const f1 = (x) => (x === x ? x.toFixed(1) : '—'), f2 = (x) => (x === x ? x.toFixed(2) : '—'), pc = (x) => (x === x ? `${(100 * x).toFixed(0)} %` : '—');

const { grid, fields: obs, koppen01, land: obsLand } = loadReferences();
const G = grid.size, W = gridWeights(grid);

// ── Earth surface ──
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

// ── Regions and masks ──
const cellLat = (c) => grid.lat[Math.floor(c / grid.w)], cellLon = (c) => grid.lon[c % grid.w];
const region = new Array(G);
const lowland = new Uint8Array(G);                         // sea-level pressure is only meaningful over low ground
for (let c = 0; c < G; c++) {
    region[c] = regionOf(cellLat(c), cellLon(c), surface.landFrac[c] >= 0.5);
    const hkm = surface.meanKm[c];
    lowland[c] = (hkm < 1.0 && Math.abs(cellLat(c)) < 80) ? 1 : 0;
}
const ALL_REGIONS = [...CONTINENTS, ...BASINS];

// ── Open-loop input: observed near-surface temperature at sea level ──
const phase2 = energyBalanceTemperature()(ctxEarth, observedWinds(obs.u10, obs.v10)(ctxEarth));
// (at each grid cell's reference height — its mean land height — as the temperature stage reports it)
const obsT = { monthly: new Float32Array(12 * G), source: '' };
{
    if (obs.airNear) {
        obsT.monthly.set(obs.airNear);
        obsT.source = 'NCEP near-surface air';
    } else {
        let filled = 0;
        for (let m = 0; m < 12; m++) for (let c = 0; c < G; c++) {
            const k = m * G + c, f = surface.landFrac[c];
            const tl = obs.t2m[k], ts = obs.sst[k], ice = obs.seaIce[k];
            const landOk = tl === tl, seaOk = ts === ts && !(ice > 0.15);
            let v;
            if (landOk && seaOk) v = f * tl + (1 - f) * ts;
            else if (landOk && f >= 0.3) v = tl;
            else if (seaOk && f < 0.7) v = ts;
            else { v = phase2.monthly[k]; filled++; }
            obsT.monthly[k] = v;
        }
        obsT.source = `Beck land + OISST sea (${(100 * filled / (12 * G)).toFixed(0)} % of cells — sea ice, gaps — from the Phase 2 model)`;
    }
}

// ── Observed rain belt: latitude of the rain maximum within 30°, per longitude (GPCP, smoothed) ──
function obsItczMonth(m) {
    const out = new Float64Array(grid.w), pAll = obs.precipAll.subarray(m * G, (m + 1) * G);
    for (let i = 0; i < grid.w; i++) {
        let best = -1, bestLat = 0;
        for (let j = 0; j < grid.h; j++) {
            const lat = grid.lat[j]; if (Math.abs(lat) > 30) continue;
            let s = 0, n = 0;
            for (let di = -10; di <= 10; di++) for (let dj = -2; dj <= 2; dj++) {
                const jj = j + dj; if (jj < 0 || jj >= grid.h) continue;
                const v = pAll[jj * grid.w + (((i + di) % grid.w) + grid.w) % grid.w]; if (v === v) { s += v; n++; }
            }
            if (n && s / n > best) { best = s / n; bestLat = lat; }
        }
        out[i] = bestLat;
    }
    return out;
}
const OBS_ITCZ = MONTHS12.map(obsItczMonth);

// ── Metrics ──
/** Per-region wind direction agreement, speed ratio and pressure-anomaly error over a set of months. */
function circMetrics(get, months) {
    const acc = Object.fromEntries(ALL_REGIONS.map(k => [k, { cs: 0, c45: 0, cw: 0, sM: 0, sO: 0, sw: 0, pe: 0, pw: 0, pmm: 0, poo: 0, pmo: 0 }]));
    const zm = new Float64Array(grid.h), zo = new Float64Array(grid.h);
    let corrNum = 0, vS = 0, vO = 0, zE = 0, zW = 0;
    for (const m of months) {
        const { u, v, slp } = get(m);
        const ou = obs.u10.subarray(m * G, (m + 1) * G), ov = obs.v10.subarray(m * G, (m + 1) * G), op = obs.slp.subarray(m * G, (m + 1) * G);
        for (let j = 0; j < grid.h; j++) {                  // zonal means over low ground
            let a = 0, b = 0, n = 0;
            for (let i = 0; i < grid.w; i++) { const c = j * grid.w + i; if (!lowland[c]) continue; a += slp[c]; b += op[c]; n++; }
            zm[j] = n ? a / n : NaN; zo[j] = n ? b / n : NaN;
            if (n) { const cl = Math.cos(grid.lat[j] * Math.PI / 180); zE += cl * (zm[j] - zo[j]) ** 2; zW += cl; }
        }
        for (let c = 0; c < G; c++) {
            const R = acc[region[c]]; if (!R) continue;
            const w = W[c], mu = u[c], mv = v[c], uo = ou[c], vo = ov[c];
            const so = Math.hypot(uo, vo), sm = Math.hypot(mu, mv);
            R.sM += w * sm; R.sO += w * so; R.sw += w;
            if (so > 0.5 && sm > 1e-6) { const cos = (mu * uo + mv * vo) / (so * sm); R.cs += w * so * cos; R.c45 += cos > Math.SQRT1_2 ? w * so : 0; R.cw += w * so; }
            if (lowland[c]) {
                const j = Math.floor(c / grid.w), am = slp[c] - zm[j], ao = op[c] - zo[j];
                R.pe += w * (am - ao) ** 2; R.pw += w; R.pmm += w * am * am; R.poo += w * ao * ao; R.pmo += w * am * ao;
                corrNum += w * am * ao; vS += w * am * am; vO += w * ao * ao;
            }
        }
    }
    const per = Object.fromEntries(ALL_REGIONS.map(k => {
        const R = acc[k];
        return [k, { meanCos: R.cs / R.cw, within45: R.c45 / R.cw, speedRatio: R.sM / R.sO, slpAnomRmse: Math.sqrt(R.pe / R.pw),
            slpCorr: R.pmo / Math.sqrt(R.pmm * R.poo), slpAmp: Math.sqrt(R.pmm / R.poo) }];
    }));
    return { per, slpAnomCorr: corrNum / Math.sqrt(vS * vO), zonalRmse: Math.sqrt(zE / zW) };
}
// Per region: wind direction; the pressure pattern by its correlation and its amplitude (not an RMS error, which
// rewards a damped, featureless field whenever the features are a little misplaced); the wind's speed (a factor of e
// off counts 2). The zonal-mean profile (the belts' depth and place) once for the planet.
const regionScore = (r) => 10 * (1 - r.meanCos) + 3 * (1 - (r.slpCorr === r.slpCorr ? r.slpCorr : 0)) + 2 * Math.abs(Math.log(r.slpAmp || 1)) + 2 * Math.abs(Math.log(r.speedRatio));
function itczError(getLat, months) {
    let s = 0, n = 0;
    for (const m of months) { const o = OBS_ITCZ[m]; for (let i = 0; i < grid.w; i++) { s += Math.abs(getLat(m, i) - o[i]); n++; } }
    return s / n;
}

// ── Open-loop evaluation ──
function runOpen() { return derivedCirculation()(ctxEarth, obsT); }
const monthView = (res) => (m) => ({ u: res.u.subarray(m * G, (m + 1) * G), v: res.v.subarray(m * G, (m + 1) * G), slp: res.slp.subarray(m * G, (m + 1) * G) });
function evaluateOpen() {
    const res = runOpen();
    const met = circMetrics(monthView(res), MONTHS12);
    const itcz = itczError((m, i) => res.itczLat[m * grid.w + i], MONTHS12);
    const perScore = Object.fromEntries(TUNED_REGIONS.map(k => [k, regionScore(met.per[k])]));
    const mean = TUNED_REGIONS.reduce((a, k) => a + perScore[k], 0) / TUNED_REGIONS.length;
    return { res, met, itcz, perScore, fit: mean + 0.15 * itcz + 0.25 * met.zonalRmse };
}

// ── Tuning (region-aware, with priors) ──
const TUNED = ['CIRC_HADLEY_SCALE', 'CIRC_FERREL_DEG', 'CIRC_TROPICAL_HPA', 'CIRC_MIDLAT_HPA', 'CIRC_OPEN_SEA_POWER', 'CIRC_POLAR_HPA',
    'CIRC_HEAT_LOW_MILD', 'CIRC_HEAT_LOW_TROPICS', 'CIRC_OCEAN_HIGH_HPA', 'CIRC_COLD_HIGH_BOOST', 'CIRC_SURFACE_WIND', 'CIRC_SURFACE_WIND_LAND',
    'CIRC_THERMAL_HPA_PER_K', 'CIRC_ROSSBY_KM', 'CIRC_TURN_OCEAN_DEG', 'CIRC_TURN_LAND_DEG'];
const PRIOR_WEIGHT = 0.5, WORSEN_TOLERANCE = 0.15;
function priorPenalty(p) { let s = 0; for (const k of TUNED) { const pr = PARAM_PRIORS[k]; s += ((p[k] - pr.value) / (pr.max - pr.min)) ** 2; } return PRIOR_WEIGHT * s; }
let tuneLog = null;
if (TUNE) {
    let best = { ...PARAMS_DEFAULTS, ...OVERRIDES };
    for (const k of TUNED) best[k] = PARAM_PRIORS[k].value;
    const evalP = (p) => { setParams(p); const e = evaluateOpen(); return { ...e, total: e.fit + priorPenalty(p) }; };
    let bestE = evalP(best);
    const start = { ...bestE.perScore };
    const fmt = (e) => TUNED_REGIONS.map(k => `${k.split(' ').map(s => s[0]).join('')} ${e.perScore[k].toFixed(2)}`).join(' ');
    console.log(`Tuning ${TUNED.length} circulation settings, open loop, regions weighted equally; none may end up > ${WORSEN_TOLERANCE} worse than with literature values.`);
    console.log(`  start ${bestE.total.toFixed(3)} (rain belt ${bestE.itcz.toFixed(1)}°)  ${fmt(bestE)}`);
    let step = 0.25;
    for (let round = 0; round < 7; round++) {
        let improved = false;
        for (const k of TUNED) {
            const pr = PARAM_PRIORS[k], span = pr.max - pr.min;
            for (const dir of [1, -1]) {
                const trial = { ...best, [k]: Math.max(pr.min, Math.min(pr.max, best[k] + dir * step * span)) };
                if (trial[k] === best[k]) continue;
                const e = evalP(trial);
                if (e.total < bestE.total - 1e-3 && TUNED_REGIONS.every(r => e.perScore[r] <= start[r] + WORSEN_TOLERANCE)) { best = trial; bestE = e; improved = true; break; }
            }
        }
        console.log(`  round ${round + 1} (step ${(100 * step).toFixed(1)} %): ${bestE.total.toFixed(3)} (rain belt ${bestE.itcz.toFixed(1)}°)`);
        if (!improved) step /= 2;
    }
    tuneLog = { params: Object.fromEntries(TUNED.map(k => [k, best[k]])), total: bestE.total, perRegion: bestE.perScore };
    setParams(best);
    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(path.join(OUT_DIR, 'circulation-tuned.json'), JSON.stringify(tuneLog, null, 2));
    console.log('  tuned:', Object.entries(tuneLog.params).map(([k, v]) => `${k}=${+(+v).toPrecision(4)}`).join(', '));
}

const open = evaluateOpen();
{ const t = performance.now(); runOpen(); open.warmMs = performance.now() - t; }
console.log(`\nCirculation stage, open loop (input: ${obsT.source}) — ${open.warmMs.toFixed(0)} ms warm`);
console.log(`  Pressure pattern (east–west, low ground, 12 months): corr ${f2(open.met.slpAnomCorr)}    zonal-mean profile error ${f1(open.met.zonalRmse)} hPa    rain belt error ${f1(open.itcz)}°`);

// ── V1 on the same cells (June–August and December–February only) ──
const readLab = (name) => { const b = fs.readFileSync(path.join(LAB_DIR, name)); return new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4); };
const v1 = { u: readLab('v1_u10.f32'), v: readLab('v1_v10.f32'), slp: readLab('v1_slp.f32') };
const v1Month = (m) => { const o = m === 6 ? 0 : G; return { u: v1.u.subarray(o, o + G), v: v1.v.subarray(o, o + G), slp: v1.slp.subarray(o, o + G) }; };
// V1 gives season means; compare everything on the season means of July-centred and January-centred months
const seasonView = (res) => (m) => {
    const ms = m === 6 ? JJA : DJF;
    return { u: seasonMean(res.u, G, ms), v: seasonMean(res.v, G, ms), slp: seasonMean(res.slp, G, ms) };
};
const obsSeasonal = { u10: obs.u10, v10: obs.v10, slp: obs.slp };
// season-mean observations in place of month 6 / 0 for this comparison
function seasonalMetrics(get) {
    const saved = { u10: obs.u10, v10: obs.v10, slp: obs.slp };
    const mk = (f) => { const out = new Float32Array(12 * G); out.set(seasonMean(f, G, JJA), 6 * G); out.set(seasonMean(f, G, DJF), 0); return out; };
    obs.u10 = mk(saved.u10); obs.v10 = mk(saved.v10); obs.slp = mk(saved.slp);
    try { return circMetrics(get, [6, 0]); } finally { Object.assign(obs, saved); }
}
const newSeason = seasonalMetrics(seasonView(open.res));
const v1Season = seasonalMetrics(v1Month);
const v1ItczRaw = JSON.parse(fs.readFileSync(path.join(LAB_DIR, 'stage-audit.json'), 'utf8')).itcz;

console.log('\n  Region            wind within 45°  (new 12 mo | new Jul+Jan | V1 Jul+Jan)   pressure anomaly error hPa (new | V1)   speed new/real   pressure corr / amplitude');
const perOut = {};
for (const k of ALL_REGIONS) {
    const a = open.met.per[k], b = newSeason.per[k], c = v1Season.per[k];
    perOut[k] = { new12: a, newSeason: b, v1Season: c };
    console.log(`    ${k.padEnd(16)}     ${pc(a.within45).padStart(5)}  |  ${pc(b.within45).padStart(5)}  |  ${pc(c.within45).padStart(5)}                    ${f1(b.slpAnomRmse).padStart(5)} | ${f1(c.slpAnomRmse).padStart(5)}           ${f2(a.speedRatio)}      ${f2(a.slpCorr)} / ×${f2(a.slpAmp)}`);
}
const meanOver = (per, key) => TUNED_REGIONS.reduce((s, k) => s + per[k][key], 0) / TUNED_REGIONS.length;
const newW45 = meanOver(newSeason.per, 'within45'), v1W45 = meanOver(v1Season.per, 'within45');
const newPE = meanOver(newSeason.per, 'slpAnomRmse'), v1PE = meanOver(v1Season.per, 'slpAnomRmse');
const newItczSeason = (itczError((m, i) => open.res.itczLat[m * grid.w + i], [0, 6]));
const v1ItczErr = (() => { let s = 0, n = 0; for (const [m, key] of [[6, 'JJA'], [0, 'DJF']]) for (let i = 0; i < grid.w; i++) { s += Math.abs(v1ItczRaw[key].sim[i] - OBS_ITCZ[m][i]); n++; } return s / n; })();
console.log(`  Regions weighted equally: wind within 45° new ${pc(newW45)} vs V1 ${pc(v1W45)}; pressure anomaly error new ${f1(newPE)} vs V1 ${f1(v1PE)} hPa;`
    + ` east–west pressure corr new ${f2(newSeason.slpAnomCorr)} vs V1 ${f2(v1Season.slpAnomCorr)}; rain belt Jan+Jul new ${f1(newItczSeason)}° vs V1 ${f1(v1ItczErr)}°`);

// ── Named Earth checks ──
const boxMean = (f, m, la0, la1, lo0, lo1) => { let s = 0, n = 0; for (let j = 0; j < grid.h; j++) { const la = grid.lat[j]; if (la < la0 || la > la1) continue; for (let i = 0; i < grid.w; i++) { const lo = grid.lon[i]; if (lo < lo0 || lo > lo1) continue; s += f[m * G + j * grid.w + i]; n++; } } return s / n; };
const slpAnomBox = (f, m, la0, la1, lo0, lo1) => {
    let z = 0, zn = 0; for (let j = 0; j < grid.h; j++) { const la = grid.lat[j]; if (la < la0 || la > la1) continue; for (let i = 0; i < grid.w; i++) { z += f[m * G + j * grid.w + i]; zn++; } }
    return boxMean(f, m, la0, la1, lo0, lo1) - z / zn;
};
const R = open.res, checks = [];
const named = (text, okNew, okObs, detail) => checks.push({ text, ok: okNew, obsOk: okObs, detail });
{
    const u = (f, m) => boxMean(f, m, 10, 20, 60, 75), v = (f, m) => boxMean(f, m, 10, 20, 60, 75);
    named('South Asian monsoon: south-westerly over the Arabian Sea in July', boxMean(R.u, 6, 10, 20, 60, 75) > 0 && boxMean(R.v, 6, 10, 20, 60, 75) > 0,
        boxMean(obs.u10, 6, 10, 20, 60, 75) > 0, `new u ${f1(boxMean(R.u, 6, 10, 20, 60, 75))} v ${f1(boxMean(R.v, 6, 10, 20, 60, 75))} m/s; real u ${f1(boxMean(obs.u10, 6, 10, 20, 60, 75))} v ${f1(boxMean(obs.v10, 6, 10, 20, 60, 75))}`);
    named('… and north-easterly in January', boxMean(R.u, 0, 10, 20, 60, 75) < 0, true, `new u ${f1(boxMean(R.u, 0, 10, 20, 60, 75))} v ${f1(boxMean(R.v, 0, 10, 20, 60, 75))}; real u ${f1(boxMean(obs.u10, 0, 10, 20, 60, 75))} v ${f1(boxMean(obs.v10, 0, 10, 20, 60, 75))}`);
    named('West African monsoon: southerly onto the coast in July', boxMean(R.v, 6, 5, 12, -15, 5) > 0, true, `new v ${f1(boxMean(R.v, 6, 5, 12, -15, 5))}; real v ${f1(boxMean(obs.v10, 6, 5, 12, -15, 5))} m/s`);
    named('East Asian winter monsoon: northerly in January', boxMean(R.v, 0, 30, 40, 115, 125) < 0, true, `new v ${f1(boxMean(R.v, 0, 30, 40, 115, 125))}; real v ${f1(boxMean(obs.v10, 0, 30, 40, 115, 125))} m/s`);
    const hiP = slpAnomBox(R.slp, 6, 30, 40, -150, -130), hiA = slpAnomBox(R.slp, 6, 30, 40, -40, -25);
    named('Summer highs over the eastern oceans (July, Pacific and Atlantic)', hiP > 0 && hiA > 0, true,
        `new ${f1(hiP)} / ${f1(hiA)} hPa above the latitude's mean; real ${f1(slpAnomBox(obs.slp, 6, 30, 40, -150, -130))} / ${f1(slpAnomBox(obs.slp, 6, 30, 40, -40, -25))}`);
    const sib = slpAnomBox(R.slp, 0, 45, 55, 90, 110), ale = slpAnomBox(R.slp, 0, 45, 55, 170, 180);
    named('Siberian High and Aleutian Low in January', sib > 0 && ale < 0, true, `new ${f1(sib)} / ${f1(ale)} hPa; real ${f1(slpAnomBox(obs.slp, 0, 45, 55, 90, 110))} / ${f1(slpAnomBox(obs.slp, 0, 45, 55, 170, 180))}`);
}
console.log('\n  Earth, named features (open loop):');
for (const c of checks) console.log(`    ${c.ok ? 'PASS' : 'FAIL'}  ${c.text} — ${c.detail}`);

// ── Closed loop on Earth: temperature ↔ winds; temperature must not get worse than with the observed winds ──
function tempError(monthly, mask) {
    let se = 0, sw = 0;
    for (let c = 0; c < G; c++) { if (!mask[c]) continue; for (let m = 0; m < 12; m++) { const d = monthly[m * G + c] - obs.t2m[m * G + c]; if (d === d) { se += W[c] * d * d; sw += W[c]; } } }
    return Math.sqrt(se / sw);
}
const contMask = Object.fromEntries(TUNED_CONTINENTS.map(k => [k, new Uint8Array(G)]));
for (let c = 0; c < G; c++) if (obsLand[c] && surface.landFrac[c] >= 0.5) { const k = continentOf(cellLat(c), cellLon(c)); if (contMask[k]) contMask[k][c] = 1; }
const t0 = performance.now();
const closed = computeClimate({ xyz: earth.r_xyz, elevKm, axes: 'y-up' },
    { stages: { temperature: energyBalanceTemperature(), circulation: derivedCirculation(), rain: observedRain(obs.precip) } });
const closedMs = performance.now() - t0;
const tOpen = {}, tClosed = {};
for (const k of TUNED_CONTINENTS) { tOpen[k] = tempError(phase2.monthly, contMask[k]); tClosed[k] = tempError(closed.stages.temperature.monthly, contMask[k]); }
const meanC = (o) => TUNED_CONTINENTS.reduce((s, k) => s + o[k], 0) / TUNED_CONTINENTS.length;
const truth = new Uint8Array(nR); for (let r = 0; r < nR; r++) truth[r] = truthAt01(koppen01, latC[r], lonC[r]);
const swapClosed = compareClasses(truth, closed.cell.koppen);
const closedMet = circMetrics(monthView(closed.stages.circulation), MONTHS12);
console.log(`\n  Closed loop on Earth (temperature ↔ winds, ${closed.timing.map(t => `${t.stage} ${t.ms.toFixed(0)}`).join(' · ')} ms):`);
console.log(`    temperature monthly error, continents weighted equally: ${f2(meanC(tClosed))} °C with its own winds vs ${f2(meanC(tOpen))} °C with the observed winds`);
console.log(`    ${TUNED_CONTINENTS.map(k => `${k} ${f1(tClosed[k])} (${f1(tOpen[k])})`).join(', ')}`);
console.log(`    wind within 45°, regions weighted equally: ${pc(meanOver(closedMet.per, 'within45'))} (open loop ${pc(meanOver(open.met.per, 'within45'))})`);
console.log(`    Köppen with real rain: ${(100 * swapClosed.exact).toFixed(1)} % same class (Phase 2 with observed winds: 68.4 %)`);

// ── Test planets ──
const planets = {};
const sampleAt = (f, m, lat, lon) => grid.sample(f.subarray(m * G, (m + 1) * G), lat, lon);
const zonalMeanU = (res, lat, seaOnly, surf) => { let s = 0, n = 0; const j = Math.floor((90 - lat)); for (let m = 0; m < 12; m++) for (let i = 0; i < grid.w; i++) { const c = j * grid.w + i; if (seaOnly && surf.landFrac[c] > 0.2) continue; s += res.u[m * G + c]; n++; } return s / n; };
for (const kind of Object.keys(TEST_PLANETS)) {
    const p = buildTestPlanet(kind, 40000, buildSphere, makeRng(7));
    const res = computeClimate({ xyz: p.xyz, elevKm: p.elevKm, axes: p.axes }, { anchors: 12, stages: { temperature: energyBalanceTemperature(), circulation: derivedCirculation(), rain: observedRain(new Float32Array(12 * G).fill(50)) } });
    const C = res.stages.circulation, surf = res.surface, list = [];
    const chk = (text, ok, detail) => list.push({ text, ok, detail });
    const tr = (zonalMeanU(C, 15, true, surf) + zonalMeanU(C, -15, true, surf)) / 2, we = (zonalMeanU(C, 45, true, surf) + zonalMeanU(C, -45, true, surf)) / 2;
    chk('trade winds (easterly at 15°) and westerlies (at 45°) over the sea', tr < 0 && we > 0, `u at 15° ${f1(tr)}, at 45° ${f1(we)} m/s`);
    const pAnom = (m, lat, lon) => { let z = 0; for (let i = 0; i < grid.w; i++) z += sampleAt(C.slp, m, lat, grid.lon[i]); return sampleAt(C.slp, m, lat, lon) - z / grid.w; };
    if (kind === 'midlat') {
        chk('thermal low over the continent in summer, high in winter', pAnom(6, 40, 0) < 0 && pAnom(0, 45, 0) > 0, `July ${f1(pAnom(6, 40, 0))}, January ${f1(pAnom(0, 45, 0))} hPa vs the latitude's mean`);
        chk('winter winds onto the west coast from the sea', sampleAt(C.u, 0, 45, -45) > 0, `January u west of the coast ${f1(sampleAt(C.u, 0, 45, -45))} m/s`);
    } else if (kind === 'tropical') {
        const landI = (m) => C.itczLat[m * grid.w + Math.floor((22.5 + 180) / grid.step)], seaI = (m) => C.itczLat[m * grid.w + Math.floor((-120 + 180) / grid.step)];
        chk('the rain belt swings further over the continent than over the sea', Math.abs(landI(6) - landI(0)) > Math.abs(seaI(6) - seaI(0)), `swing over land ${f1(landI(0))}° → ${f1(landI(6))}°, over sea ${f1(seaI(0))}° → ${f1(seaI(6))}°`);
        chk('summer monsoon: southerly onto the continent at 10°N in July', sampleAt(C.v, 6, 5, 22.5) > 0, `July v at 5°N ${f1(sampleAt(C.v, 6, 5, 22.5))} m/s`);
    } else {
        chk('deep summer low and strong winter high over the interior (30°N)', pAnom(6, 30, 0) < 0 && pAnom(0, 40, 0) > 0, `July ${f1(pAnom(6, 30, 0))}, January ${f1(pAnom(0, 40, 0))} hPa`);
        chk('summer monsoon: onshore winds on the east coast at 25°N in July', sampleAt(C.u, 6, 25, 60) < 0, `July u off the east coast ${f1(sampleAt(C.u, 6, 25, 60))} m/s (westward = onshore)`);
    }
    planets[kind] = { checks: list };
    console.log(`\n  ${TEST_PLANETS[kind].label}:`);
    for (const c of list) console.log(`    ${c.ok ? 'PASS' : 'FAIL'}  ${c.text} — ${c.detail}`);
}

// ── Gate ──
const gate = {
    beatsV1Wind: newW45 > v1W45,
    beatsV1Pressure: newSeason.slpAnomCorr > v1Season.slpAnomCorr && newPE < v1PE,
    beatsV1RainBelt: newItczSeason < v1ItczErr,
    temperatureHolds: meanC(tClosed) <= meanC(tOpen) + 0.3,
    testPlanets: Object.values(planets).every(p => p.checks.every(c => c.ok)),
};
gate.pass = Object.values(gate).every(Boolean);
console.log(`\nGate: wind ${gate.beatsV1Wind ? '✓' : '✗'} · pressure ${gate.beatsV1Pressure ? '✓' : '✗'} · rain belt ${gate.beatsV1RainBelt ? '✓' : '✗'}`
    + ` · temperature holds with its own winds ${gate.temperatureHolds ? '✓' : '✗'} · test planets ${gate.testPlanets ? '✓' : '✗'} → ${gate.pass ? 'PASSED' : 'not met'}`);

const results = {
    params: Object.fromEntries(Object.keys(PARAM_PRIORS).filter(k => k.startsWith('CIRC_')).map(k => [k, PARAMS[k]])), tuned: tuneLog,
    input: obsT.source, open: { ms: open.warmMs, slpAnomCorr: open.met.slpAnomCorr, itcz: open.itcz, per: open.met.per },
    vsV1: { newWithin45: newW45, v1Within45: v1W45, newPressureErr: newPE, v1PressureErr: v1PE, newCorr: newSeason.slpAnomCorr, v1Corr: v1Season.slpAnomCorr, newItcz: newItczSeason, v1Itcz: v1ItczErr, perRegion: perOut },
    named: checks, closed: { ms: closedMs, timing: closed.timing, tempOpen: tOpen, tClosed, koppen: swapClosed.exact, within45: meanOver(closedMet.per, 'within45') },
    planets, gate,
};
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, 'circulation-check.json'), JSON.stringify(results, null, 2));
fs.writeFileSync(path.join(LAB_DIR, 'circulation-check.json'), JSON.stringify(results));
console.log(`Wrote ${path.relative(process.cwd(), path.join(OUT_DIR, 'circulation-check.json'))}`);
resetParams();
