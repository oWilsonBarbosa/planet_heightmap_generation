/**
 * Phase 4 — the ocean stage (v2/js/climate/ocean.js): wind-driven gyres, circumpolar currents, and the heat they
 * move into the temperature stage (currents + upwelling).
 *
 *   node tuning/climate/ocean-check.mjs            score the current settings
 *   node tuning/climate/ocean-check.mjs --tune     tune (basin- and continent-aware, priors), then score
 *
 * Open loop: the observed winds drive the ocean; the temperature stage runs with the observed winds and the ocean's
 * heat (two rounds). Closed loop: temperature ↔ winds ↔ ocean. Scored: the sea surface temperature per ocean basin and
 * its east–west pattern (warm western, cold eastern boundaries), land temperature per continent (a milder Europe),
 * named currents and cold coasts, V1's "ocean warmth" on the same cells, and the test planets. Earth is a check, not
 * the target (literature priors; no region may end up worse than with the literature values).
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
const f1 = (x) => (x === x ? x.toFixed(1) : '—'), f2 = (x) => (x === x ? x.toFixed(2) : '—');

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

// ── Masks: open, ice-free sea per basin; land per continent ──
const seaMask = Object.fromEntries(TUNED_BASINS.map(k => [k, new Uint8Array(G)]));
const seaAll = new Uint8Array(G);
for (let c = 0; c < G; c++) {
    if (surface.landFrac[c] >= 0.2) continue;
    let ok = true; for (let m = 0; m < 12; m++) { const s = obs.sst[m * G + c]; if (!(s === s) || obs.seaIce[m * G + c] > 0.15) ok = false; }
    if (!ok) continue;
    seaAll[c] = 1;
    const b = basinOf(cellLat(c), cellLon(c)); if (seaMask[b]) seaMask[b][c] = 1;
}
const landMask = Object.fromEntries(TUNED_CONTINENTS.map(k => [k, new Uint8Array(G)]));
for (let c = 0; c < G; c++) if (obsLand[c] && surface.landFrac[c] >= 0.5) { const k = continentOf(cellLat(c), cellLon(c)); if (landMask[k]) landMask[k][c] = 1; }

function rmse(model, ref, mask) {
    let se = 0, sw = 0;
    for (let c = 0; c < G; c++) { if (!mask[c]) continue; for (let m = 0; m < 12; m++) { const d = model[m * G + c] - ref[m * G + c]; if (d === d) { se += W[c] * d * d; sw += W[c]; } } }
    return Math.sqrt(se / sw);
}
/** Correlation of the east–west pattern (each field minus its latitude row's mean over the mask) — warm western, cold eastern boundaries. */
function eastWestCorr(a, b, mask) {
    let num = 0, va = 0, vb = 0;
    for (let j = 0; j < grid.h; j++) {
        let sa = 0, sb = 0, n = 0;
        for (let i = 0; i < grid.w; i++) { const c = j * grid.w + i; if (mask[c] && a[c] === a[c] && b[c] === b[c]) { sa += a[c]; sb += b[c]; n++; } }
        if (n < 10) continue;
        sa /= n; sb /= n;
        for (let i = 0; i < grid.w; i++) { const c = j * grid.w + i; if (!(mask[c] && a[c] === a[c] && b[c] === b[c])) continue; const da = a[c] - sa, db = b[c] - sb; num += W[c] * da * db; va += W[c] * da * da; vb += W[c] * db * db; }
    }
    return num / Math.sqrt(va * vb);
}
const annual = (f) => seasonMean(f, G, MONTHS12);

// ── Open loop ──
function runOpen() {
    const tStage = energyBalanceTemperature(), oStage = windDrivenOcean();
    let T = tStage(ctxEarth, obsWinds), O = null;
    for (let it = 0; it < 2; it++) { O = oStage(ctxEarth, obsWinds, T); T = tStage(ctxEarth, obsWinds, T.state, O.qflux); }
    return { T, O };
}
function score(T) {
    const perBasin = Object.fromEntries(TUNED_BASINS.map(k => [k, rmse(T.monthlySL, obs.sst, seaMask[k])]));
    const perCont = Object.fromEntries(TUNED_CONTINENTS.map(k => [k, rmse(T.monthly, obs.t2m, landMask[k])]));
    const ew = eastWestCorr(annual(T.monthlySL), annual(obs.sst), seaAll);
    return { perBasin, perCont, ew, sst: rmse(T.monthlySL, obs.sst, seaAll) };
}
const noOcean = energyBalanceTemperature()(ctxEarth, obsWinds);
const baseScore = score(noOcean);

const TUNED = ['OCEAN_HEAT_SHARE', 'OCEAN_UPWELL_DT', 'OCEAN_GUST_MS', 'OCEAN_FRICTION', 'OCEAN_CHANNEL_DRAG'];
const PRIOR_WEIGHT = 0.5, WORSEN = 0.15;
const regionScores = (s) => ({ ...s.perBasin, ...s.perCont });
function objective(s) {
    const all = regionScores(s), vals = Object.values(all);
    return vals.reduce((a, b) => a + b, 0) / vals.length + 2 * (1 - s.ew);
}
function prior(p) { let s = 0; for (const k of TUNED) { const pr = PARAM_PRIORS[k]; s += ((Math.log(p[k]) - Math.log(pr.value)) / (Math.log(pr.max) - Math.log(pr.min))) ** 2; } return PRIOR_WEIGHT * s; }
let tuneLog = null;
if (TUNE) {
    let best = { ...PARAMS_DEFAULTS, ...OVERRIDES };
    for (const k of TUNED) best[k] = PARAM_PRIORS[k].value;
    const ev = (p) => { setParams(p); const s = score(runOpen().T); return { s, total: objective(s) + prior(p), regions: regionScores(s) }; };
    let bestE = ev(best);
    const start = { ...bestE.regions };
    console.log(`Tuning ${TUNED.length} ocean settings (open loop; basins and continents weighted equally; none worse than with literature values).`);
    console.log(`  start ${bestE.total.toFixed(3)} (east–west SST corr ${f2(bestE.s.ew)})`);
    let step = 0.25;
    for (let round = 0; round < 6; round++) {
        let improved = false;
        for (const k of TUNED) {
            const pr = PARAM_PRIORS[k], lmin = Math.log(pr.min), lmax = Math.log(pr.max);      // settings spanning decades: log steps
            for (const dir of [1, -1]) {
                const lv = Math.max(lmin, Math.min(lmax, Math.log(best[k]) + dir * step * (lmax - lmin)));
                const trial = { ...best, [k]: Math.exp(lv) };
                if (Math.abs(trial[k] - best[k]) < 1e-12) continue;
                const e = ev(trial);
                if (e.total < bestE.total - 1e-3 && Object.keys(start).every(r => e.regions[r] <= start[r] + WORSEN)) { best = trial; bestE = e; improved = true; break; }
            }
        }
        console.log(`  round ${round + 1} (step ${(100 * step).toFixed(1)} %): ${bestE.total.toFixed(3)} (east–west SST corr ${f2(bestE.s.ew)})`);
        if (!improved) step /= 2;
    }
    tuneLog = { params: Object.fromEntries(TUNED.map(k => [k, best[k]])), total: bestE.total };
    setParams(best);
    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(path.join(OUT_DIR, 'ocean-tuned.json'), JSON.stringify(tuneLog, null, 2));
    console.log('  tuned:', Object.entries(tuneLog.params).map(([k, v]) => `${k}=${+(+v).toPrecision(3)}`).join(', '));
}

const t0 = performance.now();
const open = runOpen();
const openMs = performance.now() - t0;
const S = score(open.T);
console.log(`\nOcean stage, open loop (observed winds) — ocean ${open.O.ms.toFixed(0)} ms, Stommel solve ${open.O.solver.cycles} cycles; channels: ${open.O.channels.map(c => `${f1(c.fromLat)}…${f1(c.toLat)}° ${f1(c.transportSv)} Sv`).join(', ') || 'none'}`);
console.log(`  Sea surface temperature, monthly error: ${f2(S.sst)} °C with the ocean vs ${f2(baseScore.sst)} °C without;  east–west pattern corr ${f2(S.ew)} vs ${f2(baseScore.ew)} without`);
console.log('  per basin (with / without): ' + TUNED_BASINS.map(k => `${k} ${f1(S.perBasin[k])}/${f1(baseScore.perBasin[k])}`).join(', '));
console.log('  land per continent (with / without): ' + TUNED_CONTINENTS.map(k => `${k} ${f1(S.perCont[k])}/${f1(baseScore.perCont[k])}`).join(', '));

// V1's ocean warmth on the same cells (June–August / December–February), against the observed east–west SST pattern
const readLab = (name) => { const b = fs.readFileSync(path.join(LAB_DIR, name)); return new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4); };
const v1W = readLab('v1_oceanWarmth.f32');
const newSeasonEW = (eastWestCorr(seasonMean(open.T.monthlySL, G, JJA), seasonMean(obs.sst, G, JJA), seaAll) + eastWestCorr(seasonMean(open.T.monthlySL, G, DJF), seasonMean(obs.sst, G, DJF), seaAll)) / 2;
const v1SeasonEW = (eastWestCorr(v1W.subarray(0, G), seasonMean(obs.sst, G, JJA), seaAll) + eastWestCorr(v1W.subarray(G, 2 * G), seasonMean(obs.sst, G, DJF), seaAll)) / 2;
console.log(`  East–west SST pattern, June–August / December–February: new ${f2(newSeasonEW)} vs V1's ocean warmth ${f2(v1SeasonEW)}`);

// ── Named currents and coasts (open loop) ──
const box = (f, la0, la1, lo0, lo1, layer = 0) => { let s = 0, n = 0; for (let j = 0; j < grid.h; j++) { const la = grid.lat[j]; if (la < la0 || la > la1) continue; for (let i = 0; i < grid.w; i++) { const lo = grid.lon[i]; if (lo < lo0 || lo > lo1) continue; const v = f[layer * G + j * grid.w + i]; if (v === v) { s += v; n++; } } } return n ? s / n : NaN; };
const ewAnom = (f, la0, la1, lo0, lo1) => {                        // box mean minus the sea mean of its latitudes
    let z = 0, zn = 0; for (let j = 0; j < grid.h; j++) { const la = grid.lat[j]; if (la < la0 || la > la1) continue; for (let i = 0; i < grid.w; i++) { const c = j * grid.w + i; if (seaAll[c] && f[c] === f[c]) { z += f[c]; zn++; } } }
    return box(f, la0, la1, lo0, lo1) - z / zn;
};
function namedChecks(O, T) {
    const sstA = annual(T.monthlySL), obsA = annual(obs.sst), out = [];
    const chk = (text, ok, detail) => out.push({ text, ok, detail });
    chk('Gulf Stream flows north along North America (35°N)', box(O.v, 32, 38, -78, -70) > 0, `v ${f2(box(O.v, 32, 38, -78, -70))} m/s`);
    chk('Kuroshio flows north past Japan (30°N)', box(O.v, 26, 34, 125, 135) > 0, `v ${f2(box(O.v, 26, 34, 125, 135))} m/s`);
    chk('California Current flows south (35°N)', box(O.v, 30, 40, -130, -122) < 0, `v ${f2(box(O.v, 30, 40, -130, -122))} m/s`);
    chk('Humboldt Current flows north off Peru (20°S)', box(O.v, -25, -15, -82, -74) > 0, `v ${f2(box(O.v, -25, -15, -82, -74))} m/s`);
    chk('Circumpolar current flows east (55–62°S)', box(O.u, -62, -55, -180, 180) > 0, `u ${f2(box(O.u, -62, -55, -180, 180))} m/s`);
    const coasts = [['California', 30, 38, -126, -118], ['Peru', -18, -5, -84, -76], ['Benguela', -30, -17, 8, 15], ['Canary', 18, 30, -22, -15]];
    const cold = coasts.map(([n, ...b]) => [n, ewAnom(sstA, ...b), ewAnom(obsA, ...b)]);
    chk('cold upwelling coasts (California, Peru, Benguela, Canary) colder than their latitude', cold.filter(x => x[1] < 0).length >= 3,
        cold.map(([n, s, o]) => `${n} ${f1(s)} (real ${f1(o)}) °C`).join(', '));
    const tongue = box(sstA, -3, 3, -110, -90) - box(sstA, -3, 3, 140, 160), tongueObs = box(obsA, -3, 3, -110, -90) - box(obsA, -3, 3, 140, 160);
    chk('equatorial Pacific: cold east, warm west', tongue < 0, `east − west ${f1(tongue)} °C (real ${f1(tongueObs)})`);
    const ns = ewAnom(sstA, 45, 60, -40, -10), nsObs = ewAnom(obsA, 45, 60, -40, -10);
    chk('North Atlantic warmer than its latitude (the Gulf Stream\'s heat)', ns > 0, `${f1(ns)} °C (real ${f1(nsObs)})`);
    return out;
}
const named = namedChecks(open.O, open.T);
console.log('\n  Named currents and coasts (open loop):');
for (const c of named) console.log(`    ${c.ok ? 'PASS' : 'FAIL'}  ${c.text} — ${c.detail}`);

// ── Closed loop on Earth ──
const tc = performance.now();
const noOceanClosed = computeClimate({ xyz: earth.r_xyz, elevKm, axes: 'y-up' }, { stages: { temperature: energyBalanceTemperature(), circulation: derivedCirculation(), rain: observedRain(obs.precip) } });
const closed = computeClimate({ xyz: earth.r_xyz, elevKm, axes: 'y-up' }, { stages: { temperature: energyBalanceTemperature(), circulation: derivedCirculation(), ocean: windDrivenOcean(), rain: observedRain(obs.precip) } });
const closedMs = performance.now() - tc;
const Sc = score(closed.stages.temperature), Sn = score(noOceanClosed.stages.temperature);
const truth = new Uint8Array(nR); for (let r = 0; r < nR; r++) truth[r] = truthAt01(koppen01, latC[r], lonC[r]);
const kWith = compareClasses(truth, closed.cell.koppen).exact, kWithout = compareClasses(truth, noOceanClosed.cell.koppen).exact;
const meanOf = (o) => Object.values(o).reduce((a, b) => a + b, 0) / Object.values(o).length;
const namedClosed = namedChecks(closed.stages.ocean, closed.stages.temperature);
console.log(`\n  Closed loop (temperature ↔ winds ↔ ocean; ${closed.timing.map(t => `${t.stage} ${t.ms.toFixed(0)}`).join(' · ')} ms):`);
console.log(`    sea surface temperature ${f2(Sc.sst)} °C (without the ocean ${f2(Sn.sst)}); east–west corr ${f2(Sc.ew)} (${f2(Sn.ew)})`);
console.log(`    land per continent: ${TUNED_CONTINENTS.map(k => `${k} ${f1(Sc.perCont[k])} (${f1(Sn.perCont[k])})`).join(', ')}; mean ${f2(meanOf(Sc.perCont))} (${f2(meanOf(Sn.perCont))})`);
console.log(`    Köppen with real rain: ${(100 * kWith).toFixed(1)} % (without the ocean ${(100 * kWithout).toFixed(1)} %)`);
console.log(`    named, closed loop: ${namedClosed.filter(c => c.ok).length} / ${namedClosed.length} pass${namedClosed.filter(c => !c.ok).map(c => ` · fails: ${c.text}`).join('')}`);

// ── Test planets ──
const planets = {};
for (const kind of ['midlat', 'supercontinent']) {
    const p = buildTestPlanet(kind, 40000, buildSphere, makeRng(7));
    const res = computeClimate({ xyz: p.xyz, elevKm: p.elevKm, axes: p.axes }, { anchors: 12, stages: { temperature: energyBalanceTemperature(), circulation: derivedCirculation(), ocean: windDrivenOcean(), rain: observedRain(new Float32Array(12 * G).fill(50)) } });
    const O = res.stages.ocean, sstA = annual(res.stages.temperature.monthlySL), list = [];
    const eastLon = kind === 'midlat' ? 44 : 60, westLon = kind === 'midlat' ? -44 : -60, lat = kind === 'midlat' ? 30 : 30;
    const vE = box(O.v, lat - 4, lat + 4, eastLon, eastLon + 6), vW = box(O.v, lat - 4, lat + 4, westLon - 6, westLon);
    list.push({ text: 'warm current poleward along the east coast, cold equatorward along the west coast', ok: vE > 0 && vW < 0, detail: `v east ${f2(vE)}, west ${f2(vW)} m/s at ${lat}°N` });
    const sE = box(sstA, lat - 4, lat + 4, eastLon, eastLon + 6), sW = box(sstA, lat - 4, lat + 4, westLon - 6, westLon);
    list.push({ text: 'the sea is colder off the west coast than off the east coast', ok: sW < sE, detail: `${f1(sW)} vs ${f1(sE)} °C at ${lat}°N` });
    planets[kind] = { checks: list };
    console.log(`\n  ${TEST_PLANETS[kind].label}:`);
    for (const c of list) console.log(`    ${c.ok ? 'PASS' : 'FAIL'}  ${c.text} — ${c.detail}`);
}

const gate = {
    beatsV1Pattern: newSeasonEW > v1SeasonEW,
    currentsAndCoasts: named.filter(c => c.ok).length >= named.length - 1,
    temperatureHolds: meanOf(Sc.perCont) <= meanOf(Sn.perCont) + 0.1,
    europeMilder: Sc.perCont.Europe < Sn.perCont.Europe,
    testPlanets: Object.values(planets).every(p => p.checks.every(c => c.ok)),
};
gate.pass = Object.values(gate).every(Boolean);
console.log(`\nGate: east–west SST pattern beats V1 ${gate.beatsV1Pattern ? '✓' : '✗'} · currents and coasts ${gate.currentsAndCoasts ? '✓' : '✗'}`
    + ` · land temperature holds ${gate.temperatureHolds ? '✓' : '✗'} · Europe better ${gate.europeMilder ? '✓' : '✗'} · test planets ${gate.testPlanets ? '✓' : '✗'} → ${gate.pass ? 'PASSED' : 'not met'}`);

const results = {
    params: Object.fromEntries(Object.keys(PARAM_PRIORS).filter(k => k.startsWith('OCEAN_')).map(k => [k, PARAMS[k]])), tuned: tuneLog,
    open: { ms: open.O.ms, sst: S.sst, sstWithout: baseScore.sst, ew: S.ew, ewWithout: baseScore.ew, perBasin: S.perBasin, perBasinWithout: baseScore.perBasin, perCont: S.perCont, perContWithout: baseScore.perCont, channels: open.O.channels },
    vsV1: { newEW: newSeasonEW, v1EW: v1SeasonEW }, named,
    closed: { ms: closedMs, timing: closed.timing, sst: Sc.sst, sstWithout: Sn.sst, ew: Sc.ew, ewWithout: Sn.ew, perCont: Sc.perCont, perContWithout: Sn.perCont, koppen: kWith, koppenWithout: kWithout, named: namedClosed },
    planets, gate,
};
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, 'ocean-check.json'), JSON.stringify(results, null, 2));
fs.writeFileSync(path.join(LAB_DIR, 'ocean-check.json'), JSON.stringify(results));
console.log(`Wrote ${path.relative(process.cwd(), path.join(OUT_DIR, 'ocean-check.json'))}`);
resetParams();
