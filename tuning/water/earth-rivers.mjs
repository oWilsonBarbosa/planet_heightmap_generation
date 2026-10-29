/**
 * The rivers of real Earth as Generate makes them (js/water-new.js), against measured flows. assets/earth.png is
 * imported as the Import page imports it (tuning/climate/lib/earth-mesh.mjs), and its rivers run twice: with the
 * climate simulated as Import runs it, and with the observed climate (Beck et al. 2023, 1991–2020, 1°:
 * tuning/climate/data/ref1deg) — the rivers' own error apart from the climate's.
 *
 * Each of Dai & Trenberth's coastal gauges (fetch-rivers.mjs) draining at least --min-area is placed on the network at
 * the dry-land region within 100 km whose drainage area is nearest its own, and kept if within ×1.5 — else the coarse
 * Earth map (20 km pixels, 8 bits) sends that basin elsewhere (the Congo, the Mississippi, the Orinoco). Scored, by the
 * climate zone at the gauge (Beck's Köppen group):
 *   runoff   the year's flow ÷ the drainage area, simulated ÷ measured: median, share within ×2, rms
 *   year     the twelve monthly mean flows: correlation with the measured, the peak month within one of it, the range
 *            (coefficient of variation of the months, simulated ÷ measured), the peak (the highest month ÷ the mean,
 *            simulated ÷ measured) and the low flow (the lowest month ÷ the mean, simulated ÷ measured); the share of
 *            gauges with a flood season (the peak month floodRatio × the mean or more: the regime the Evolution colours
 *            violet), simulated and measured; how early the simulated year comes (the shift, in months, that best
 *            correlates it with the measured: the mean over all gauges, and over the great basins, from 500,000 km²)
 * And the closed basins: the share of the land (without Antarctica) whose water ends in a lake with no outflow (Earth:
 * ≈ 18–20 %, Wang et al. 2018), and which of Earth's own closed basins close (CLOSED); and the network's consistency
 * (the dry land whose drainage area is more than twice what drains into it down the network: 0 when sound).
 *
 *   node tuning/water/earth-rivers.mjs [--n 640000] [--climate obs|sim|both] [--min-area 25000] [--set key=value,…]
 *                                      [--evolution] [--tune [--grid key=v/v/v,…]] [--list] [--json report.json]
 *                                      [--trace low|<gauge index>,…] [--from lat,lon;…]
 *
 * --evolution runs the Evolution's rules (FINISH: no closed basins on land, no inland seas below seaBasinKm2) instead of
 * Generate's (WATER). --trace follows each listed gauge's river (`low`: those under a tenth of the measured flow): the
 * region it is matched to, where its water ends, its main stem up to its source with the discharge, runoff and bed's
 * dryness, the rain over its basin observed and simulated, the closed lakes near it and the wettest region within
 * 100 km; --from follows the water down from a place. Both for finding why a river comes out dry or is not matched.
 *
 * --set overrides the hydrology's constants (js/water-new.js WATER); --tune searches the constants of the rivers' year
 * (TUNE below) with the observed climate (--climate sim: the simulated), ranked by the year's score: correlation −
 * |ln(range ratio)| − ½ |ln(low-flow ratio)|, the median over the gauges; each with the cold climates' (zone D) and
 * each zone's flood seasons. The annual flows do not depend on them. --list prints each gauge.
 *
 * Needs:  npm install --no-save netcdfjs pngjs delaunator
 *         node tuning/water/fetch-rivers.mjs
 *         node tuning/climate/fetch-references.mjs && node tuning/climate/regrid-references.mjs
 */

import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { seasonalMetrics, yearScore, compareScores, summarizeRows, metricJson } from './lib/metrics.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Delaunator from 'delaunator';
import { setDelaunator } from '../../js/sphere-mesh.js';
import { elevToHeightKm } from '../../js/color-map.js';
import { runNewWater, WATER } from '../../js/water-new.js';
import { FINISH } from '../../v2/js/finish/finish-config.js';
import { planetClimate } from '../../v2/js/climate/climate.js';
import { CORE_DEFAULTS } from '../../v2/js/climate/core.js';
import { loadEarthGrayscale } from '../climate/lib/earth-context.mjs';
import { buildEarthMesh } from '../climate/lib/earth-mesh.mjs';
import { loadReferences } from '../climate/lib/ref.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATIONS = path.join(__dirname, 'data', 'stations.json');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const N = Number(arg('--n', 640000)), CLIMATE = arg('--climate', 'both'), MIN_AREA = Number(arg('--min-area', 25000)), TUNING = process.argv.includes('--tune'), LIST = process.argv.includes('--list');
const JSON_OUT = arg('--json', null), TRACE = arg('--trace', null), FROM = arg('--from', null);
if (!['obs', 'sim', 'both'].includes(CLIMATE)) throw new Error('--climate must be obs, sim or both');
const SET = Object.fromEntries((arg('--set', '') || '').split(',').filter(Boolean).map(kv => { const [k, v] = kv.split('='); return [k, v === 'true' ? true : v === 'false' ? false : Number(v)]; }));
for (const k of Object.keys(SET)) if (!(k in WATER)) throw new Error(`--set: no constant ${k} in WATER`);
// (--evolution: the Evolution's own rules — no closed basins on land, no inland seas below its seaBasinKm2 — not Generate's)
if (process.argv.includes('--evolution')) for (const k of ['closedBasins', 'seaRemnantAnySize']) if (!(k in SET)) SET[k] = FINISH[k];
const RADIUS_KM = 100, AREA_TOL = 1.5, R = 6371, SEC = 3.15576e7;
/** The constants of the rivers' year searched by --tune, each one's values (--grid key=v/v/v,… instead). */
const TUNE = arg('--grid', null) ? Object.fromEntries(arg('--grid').split(',').map(kv => { const [k, v] = kv.split('='); return [k, v.split('/').map(Number)]; }))
    : { baseflowShare: [0.5, 0.6, 0.7, 0.8, 0.9], baseflowMonths: [2, 2.5, 3, 4] };
for (const k of Object.keys(TUNE)) if (!(k in WATER)) throw new Error(`--grid: no constant ${k} in WATER`);
const t0 = performance.now(), log = (m) => console.error(`[${((performance.now() - t0) / 1000).toFixed(0)} s] ${m}`);

if (!fs.existsSync(STATIONS)) throw new Error('Gauges missing: run  node tuning/water/fetch-rivers.mjs');
const stationText = fs.readFileSync(STATIONS, 'utf8'), sourceGauges = JSON.parse(stationText);
const gauges = sourceGauges.filter(s => s.areaKm2 >= MIN_AREA && s.q > 0 && Number.isFinite(s.q)
    && s.yearsPerMonth >= 5 && s.months.length === 12 && s.months.every(v => Number.isFinite(v) && v > 0));

// ── the Earth planet, as the Import page builds it, and its simulated climate ──
setDelaunator(Delaunator);
const { gray, width, height } = loadEarthGrayscale();
const E = buildEarthMesh(gray, width, height, { N });
const n = E.r_elevation.length, xyz = E.r_xyz, adj = { adjOffset: E.mesh.adjOffset, adjList: E.mesh.adjList };
const elevKm = new Float32Array(n), land = new Uint8Array(n);
for (let r = 0; r < n; r++) { elevKm[r] = elevToHeightKm(E.r_elevation[r]); land[r] = E.r_elevation[r] > 0 ? 1 : 0; }
const sim = planetClimate({ xyz, elevKm, land, axes: 'y-up' }, { greenhouseWm2: 0, precipScale: 1 });
log(`Earth at ${n.toLocaleString()} regions, its climate simulated`);

// ── the observed climate in the climate's own form: Beck's monthly temperature and rain on the 1° grid (the simulated
// grid's where Beck has none: the sea, small islands), each land region's year from it, its temperature taken to its
// own height as the climate does (6.5 °C/km against the grid cell's mean land height) ──
function observedClimate() {
    const ref = loadReferences(), G = ref.grid.size, { t2m, precip } = ref.fields;
    const T = new Float32Array(12 * G), P = new Float32Array(12 * G), Ty = new Float32Array(G), Py = new Float32Array(G), href = new Float32Array(G);
    for (let g = 0; g < G; g++) {
        for (let m = 0; m < 12; m++) {
            T[m * G + g] = ref.land[g] ? t2m[m * G + g] : sim.months.T[m * G + g];
            P[m * G + g] = ref.land[g] ? precip[m * G + g] : sim.months.P[m * G + g];
            Ty[g] += T[m * G + g] / 12; Py[g] += P[m * G + g];
        }
        const h = sim.surface.meanLandKm[g]; href[g] = h === h ? Math.max(0, h) : 0;
    }
    const bil = (f, lat, lon) => {
        const x = (lon + 180) - 0.5, y = Math.max(0, Math.min(179, (90 - lat) - 0.5)), x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
        const i0 = ((x0 % 360) + 360) % 360, i1 = (i0 + 1) % 360, j1 = Math.min(179, y0 + 1);
        return (1 - fx) * (1 - fy) * f[y0 * 360 + i0] + fx * (1 - fy) * f[y0 * 360 + i1] + (1 - fx) * fy * f[j1 * 360 + i0] + fx * fy * f[j1 * 360 + i1];
    };
    const tA = new Float32Array(n).fill(NaN), pA = new Float32Array(n).fill(NaN), koppen = new Uint8Array(n), gamma = CORE_DEFAULTS.lapseRateCPerKm;
    for (let r = 0; r < n; r++) {
        if (!land[r]) continue;
        const la = sim.cell.lat[r], lo = sim.cell.lon[r], g = Math.min(179, Math.floor(90 - la)) * 360 + Math.min(359, Math.floor(lo + 180));
        tA[r] = bil(Ty, la, lo) - gamma * (Math.max(0, elevKm[r]) - bil(href, la, lo));
        pA[r] = Math.max(0, bil(Py, la, lo));
        koppen[r] = ref.koppen[g] || sim.cell.koppen[r];
    }
    return { grid: sim.grid, surface: sim.surface, months: { T, P }, cell: { koppen, tAnnual: tA, pAnnual: pA, lat: sim.cell.lat, lon: sim.cell.lon } };
}
const obs = CLIMATE === 'sim' && !TUNING ? null : observedClimate();
const zoneClimate = obs ?? observedClimate();

// ── each gauge's candidate regions: those within 100 km (regions bucketed by 1° of latitude and longitude) ──
const lat = sim.cell.lat, lon = sim.cell.lon, buckets = new Map(), bkey = (la, lo) => Math.floor(la + 90) * 360 + (((Math.floor(lo) % 360) + 360) % 360);
for (let r = 0; r < n; r++) { const k = bkey(lat[r], lon[r]); let b = buckets.get(k); if (!b) buckets.set(k, b = []); b.push(r); }
const candidates = gauges.map(s => {
    const out = [], dLa = Math.ceil(RADIUS_KM / 111) + 1, y0 = Math.sin(s.lat * Math.PI / 180), c = Math.cos(s.lat * Math.PI / 180);
    const x0 = c * Math.sin(s.lon * Math.PI / 180), z0 = c * Math.cos(s.lon * Math.PI / 180), cosMax = Math.cos(RADIUS_KM / R);
    for (let a = Math.floor(s.lat) - dLa; a <= Math.floor(s.lat) + dLa; a++) {
        const dLo = Math.min(180, Math.ceil(RADIUS_KM / 111 / Math.max(0.02, Math.cos(Math.min(89.5, Math.abs(a) + 1) * Math.PI / 180))) + 1);
        for (let o = Math.floor(s.lon) - dLo; o <= Math.floor(s.lon) + dLo; o++) {
            const b = buckets.get(bkey(a, o));
            if (b) for (const r of b) if (xyz[3 * r] * x0 + xyz[3 * r + 1] * y0 + xyz[3 * r + 2] * z0 >= cosMax) out.push(r);
        }
    }
    return out;
});

const ZONES = ['A', 'B', 'C', 'D', 'E'], zoneOf = (k) => (k <= 0 ? '?' : k <= 3 ? 'A' : k <= 7 ? 'B' : k <= 16 ? 'C' : k <= 28 ? 'D' : 'E');
const GREAT_KM2 = 500000;

/** Each gauge against one run of the rivers: matched or not; its runoff ratio; its year's correlation, peak, range, low
 *  flow; and whether a lake lies upstream (a lake evens out what it passes on: on the coarse Earth map most are
 *  artefacts of its 8-bit steps). */
function score(W, F) {
    // (each region's own river point: at a confluence the first point of the reach that starts there — the last point
    // there, as every reach ending there, with its own tributary's year, is traced before it)
    const pointAt = new Map();
    for (let i = 0; i < W.rivers.cell.length; i++) pointAt.set(W.rivers.cell[i], i);
    const first = new Int32Array(n).fill(-1), next = new Int32Array(n).fill(-1);
    for (let c = 0; c < n; c++) { const r = W.recv[c]; if (r >= 0) { next[c] = first[r]; first[r] = c; } }
    const lakeUpstream = (c0) => { const st = [c0]; while (st.length) { const c = st.pop(); if (W.lake[c]) return true; for (let u = first[c]; u >= 0; u = next[u]) st.push(u); } return false; };
    const unmatched = [];
    const rows = gauges.map((s, gi) => {
        let best = -1, err = Infinity;
        for (const r of candidates[gi]) { if (W.ocean[r] || W.lake[r] || !(W.area[r] > 0)) continue; const e = Math.abs(Math.log(W.area[r] / s.areaKm2)); if (e < err) { err = e; best = r; } }
        if (!(best >= 0 && err <= Math.log(AREA_TOL))) {
            unmatched.push({ gaugeIndex: gi, river: s.river, station: s.station, lat: s.lat, lon: s.lon,
                observedAreaKm2: s.areaKm2, nearestAreaKm2: best >= 0 ? W.area[best] : null,
                reason: best >= 0 ? 'drainage-area-mismatch' : 'no-dry-cell-with-drainage' });
            return null;
        }
        const row = { gaugeIndex: gi, river: s.river, station: s.station, q: s.q, simulatedQ: W.q[best],
            cell: best, observedAreaKm2: s.areaKm2, simulatedAreaKm2: W.area[best],
            zone: zoneOf(zoneClimate.cell.koppen[best]), runoff: (W.q[best] / W.area[best]) / (s.q / s.areaKm2),
            lake: lakeUpstream(best), great: s.areaKm2 >= GREAT_KM2,
            seasonalStatus: W.q[best] === 0 ? 'zero-annual-flow' : 'no-river-series' };
        const i = pointAt.get(best);
        if (i !== undefined && W.rivers.months) {
            const m = Array.from(W.rivers.months.subarray(12 * i, 12 * i + 12));
            Object.assign(row, seasonalMetrics(m, s.months, F.floodRatio), { monthlySimulatedM3s: m, monthlyObservedM3s: s.months });
        }
        return row;
    }).filter(Boolean);
    return { rows, unmatched };
}
/** --trace: each listed gauge's river followed (gauge indices, or `low`: those whose flow comes out under a tenth of
 *  the measured): the region it is matched to; its water down to where it ends; up its main stem (the largest area
 *  upstream at each step) to its source, with the discharge, the runoff, the bed's dryness and the lakes on the way;
 *  the runoff of everything upstream against what arrives (the rest lost along the beds or off lakes); the closed lakes
 *  near it; and the region within 100 km carrying the most water — where the river is, if the match missed it. */
function trace(W, rows, unmatched, which) {
    const D = W.debug, cellKm2 = 4 * Math.PI * R * R / n, own = c => Math.max(0, D.runoff[c]) * cellKm2 * 1e3 / SEC;
    const first = new Int32Array(n).fill(-1), next = new Int32Array(n).fill(-1);
    for (let c = 0; c < n; c++) { const r = W.recv[c]; if (r >= 0) { next[c] = first[r]; first[r] = c; } }
    const arid = c => D.pet[c] > 0 ? Math.max(0, Math.min(1, (D.pet[c] - Math.max(0, D.rain[c])) / D.pet[c])) : 0;
    const at = c => `${lat[c].toFixed(1)},${lon[c].toFixed(1)}`;
    const km = (a, b) => R * Math.acos(Math.max(-1, Math.min(1, xyz[3 * a] * xyz[3 * b] + xyz[3 * a + 1] * xyz[3 * b + 1] + xyz[3 * a + 2] * xyz[3 * b + 2])));
    const kind = c => W.ocean[c] ? 'sea' : ['', 'fresh lake', 'salt lake', 'salt pan', 'brackish lake'][W.lake[c]] || 'land';
    // (and the rain over it, observed and simulated: what the climate gives the basin)
    const upstream = (c0) => {
        let sum = 0, cells = 0, pObs = 0, pSim = 0; const st = [c0];
        while (st.length) { const c = st.pop(); sum += own(c); cells++; pObs += Math.max(0, zoneClimate.cell.pAnnual[c] || 0); pSim += Math.max(0, sim.cell.pAnnual[c] || 0); for (let u = first[c]; u >= 0; u = next[u]) st.push(u); }
        return { sum, cells, pObs: pObs / cells, pSim: pSim / cells };
    };
    const ids = which === 'low' ? rows.filter(x => !(x.runoff >= 0.1)).map(x => x.gaugeIndex) : which.split(',').map(Number);
    for (const gi of ids) {
        const s = gauges[gi], row = rows.find(x => x.gaugeIndex === gi), um = unmatched.find(x => x.gaugeIndex === gi);
        console.log(`\n  ── ${gi} ${s.river} at ${s.station} (${s.lat.toFixed(2)},${s.lon.toFixed(2)}): measured ${s.q.toFixed(0)} m³/s from ${s.areaKm2.toLocaleString()} km²`);
        if (!row) { console.log(`     unmatched: ${um?.reason}`); continue; }
        const c0 = row.cell, up = upstream(c0), g = Math.cos(s.lat * Math.PI / 180), gx = g * Math.sin(s.lon * Math.PI / 180), gy = Math.sin(s.lat * Math.PI / 180), gz = g * Math.cos(s.lon * Math.PI / 180);
        const fromGauge = Math.round(R * Math.acos(Math.max(-1, Math.min(1, xyz[3 * c0] * gx + xyz[3 * c0 + 1] * gy + xyz[3 * c0 + 2] * gz))));
        console.log(`     matched ${at(c0)}, ${fromGauge} km from the gauge; ${W.q[c0].toFixed(1)} m³/s from ${Math.round(W.area[c0]).toLocaleString()} km²; `
            + `upstream runoff ${up.sum.toFixed(1)} m³/s over ${up.cells} regions → ${up.sum > 0 ? Math.round(100 * (1 - W.q[c0] / up.sum)) : 0} % lost on the way; `
            + `rain over it observed ${up.pObs.toFixed(0)} mm, simulated ${up.pSim.toFixed(0)} mm (×${(up.pSim / Math.max(1, up.pObs)).toFixed(2)})`);
        // down to where the water ends
        let c = c0, steps = 0, dist = 0, peak = W.q[c0];
        while (W.recv[c] >= 0 && steps < 1e5) { const r = W.recv[c]; dist += km(c, r); c = r; steps++; if (W.q[c] > peak) peak = W.q[c]; }
        console.log(`     down: ${steps} steps, ${Math.round(dist)} km to ${kind(c)} at ${at(c)} (its region's recv ${W.recv[c]}); most on the way ${peak.toFixed(1)} m³/s`);
        // up the main stem
        const path = [c0];
        for (let x = c0; ;) { let best = -1; for (let u = first[x]; u >= 0; u = next[u]) if (best < 0 || W.area[u] > W.area[best]) best = u; if (best < 0) break; path.push(best); x = best; }
        path.reverse();          // from the source down
        let qMax = 0, iMax = 0, len = 0;
        for (let i = 0; i < path.length; i++) { if (W.q[path[i]] > qMax) { qMax = W.q[path[i]]; iMax = i; } if (i) len += km(path[i - 1], path[i]); }
        console.log(`     main stem: ${path.length} regions, ${Math.round(len)} km from its source; most water ${qMax.toFixed(1)} m³/s at ${at(path[iMax])}, ${path.length - 1 - iMax} regions above the gauge`);
        const show = new Set([0, iMax, path.length - 1]);
        for (let i = 0; i < path.length; i += Math.max(1, Math.round(path.length / 12))) show.add(i);
        for (let i = 1; i < path.length; i++) if (W.lake[path[i]] !== W.lake[path[i - 1]]) { show.add(i - 1); show.add(i); }
        let d = 0;
        for (let i = 0; i < path.length; i++) {
            if (i) d += km(path[i - 1], path[i]);
            if (!show.has(i)) continue;
            const x = path[i];
            console.log(`       ${String(Math.round(d)).padStart(5)} km  ${at(x).padEnd(12)} ${kind(x).padEnd(10)} q ${W.q[x].toFixed(1).padStart(8)}  area ${Math.round(W.area[x]).toLocaleString().padStart(9)}  h ${(1000 * W.heightKm[x]).toFixed(0).padStart(5)} m  rain ${D.rain[x].toFixed(0).padStart(5)}  pet ${D.pet[x].toFixed(0).padStart(5)}  runoff ${D.runoff[x].toFixed(0).padStart(4)} mm  arid ${arid(x).toFixed(2)}`);
        }
        // the closed lakes within 1000 km (inflow: what drains into them)
        const inflow = new Map();
        for (let x = 0; x < n; x++) { const r = W.recv[x]; if (r >= 0 && W.lake[r] >= 2 && W.recv[r] < 0 && !W.lake[x]) inflow.set(r, (inflow.get(r) ?? 0) + W.q[x]); }
        const near = [...inflow.entries()].filter(([x, v]) => v > 1 && km(c0, x) < 1000).sort((a, b) => b[1] - a[1]).slice(0, 4);
        if (near.length) console.log(`     closed lakes within 1000 km: ${near.map(([x, v]) => `${kind(x)} at ${at(x)} (${Math.round(km(c0, x))} km), ${v.toFixed(1)} m³/s in`).join('; ')}`);
        // the wettest region near the gauge
        let wet = -1;
        for (const r of candidates[gi]) if (!W.ocean[r] && !W.lake[r] && (wet < 0 || W.q[r] > W.q[wet])) wet = r;
        if (wet >= 0) console.log(`     most water within 100 km: ${W.q[wet].toFixed(1)} m³/s from ${Math.round(W.area[wet]).toLocaleString()} km² at ${at(wet)} (${Math.round(km(c0, wet))} km from the match)`);
    }
}
/** The network against its drainage areas: the dry land whose area is more than twice what drains into it down the
 *  network (`recv`) — a region given a basin's area that none of the basin drains to — and its largest such area. */
function networkCheck(W) {
    const cellKm2 = 4 * Math.PI * R * R / n, deg = new Int32Array(n), tree = new Float64Array(n);
    for (let c = 0; c < n; c++) if (!W.ocean[c] && W.recv[c] >= 0) deg[W.recv[c]]++;
    const queue = [];
    for (let c = 0; c < n; c++) if (!W.ocean[c] && deg[c] === 0) queue.push(c);
    for (let i = 0; i < queue.length; i++) { const c = queue[i], r = W.recv[c]; tree[c] += cellKm2; if (r >= 0 && !W.ocean[r]) { tree[r] += tree[c]; if (--deg[r] === 0) queue.push(r); } }
    let bad = 0, worst = 0;
    for (let c = 0; c < n; c++) if (!W.ocean[c] && !W.lake[c] && W.area[c] > 2 * tree[c] + 1) { bad++; worst = Math.max(worst, W.area[c]); }
    return `network: ${bad} dry regions with a drainage area over twice what drains into them (largest ${Math.round(worst).toLocaleString()} km²)`;
}
/** --from lat,lon;lat,lon…: the water followed down from the dry-land region nearest each place to where it ends (the
 *  sea or a closed lake), its discharge and the lakes on the way — where a river goes when no gauge finds it. */
function follow(W, places) {
    const D = W.debug, at = c => `${lat[c].toFixed(1)},${lon[c].toFixed(1)}`;
    const kind = c => W.ocean[c] ? 'sea' : ['', 'fresh lake', 'salt lake', 'salt pan', 'brackish lake'][W.lake[c]] || 'land';
    for (const p of places.split(';')) {
        const [la, lo] = p.split(',').map(Number);
        let c = -1, bd = Infinity;
        for (let a = Math.floor(la) - 1; a <= Math.floor(la) + 1; a++) for (let o = Math.floor(lo) - 1; o <= Math.floor(lo) + 1; o++) for (const r of buckets.get(bkey(a, o)) ?? []) {
            if (W.ocean[r] || W.lake[r]) continue;
            const d = (lat[r] - la) ** 2 + ((lon[r] - lo) * Math.cos(la * Math.PI / 180)) ** 2;
            if (d < bd) { bd = d; c = r; }
        }
        if (c < 0) { console.log(`\n  ── from ${p}: no dry land near`); continue; }
        const path = [c];
        while (W.recv[c] >= 0 && path.length < 1e5) { c = W.recv[c]; path.push(c); }
        console.log(`\n  ── from ${p}: ${path.length} regions to ${kind(c)} at ${at(c)}`);
        const show = new Set([0, path.length - 1]);
        for (let i = 0; i < path.length; i += Math.max(1, Math.round(path.length / 14))) show.add(i);
        for (let i = 1; i < path.length; i++) if (W.lake[path[i]] !== W.lake[path[i - 1]] || (W.q[path[i]] === 0) !== (W.q[path[i - 1]] === 0)) { show.add(i - 1); show.add(i); }
        for (const i of [...show].sort((a, b) => a - b)) {
            const x = path[i];
            console.log(`       ${String(i).padStart(4)}  ${at(x).padEnd(12)} ${kind(x).padEnd(10)} q ${W.q[x].toFixed(1).padStart(8)}  area ${Math.round(W.area[x]).toLocaleString().padStart(9)}  h ${(1000 * W.heightKm[x]).toFixed(0).padStart(5)} m  rain ${D.rain[x].toFixed(0).padStart(5)}  pet ${D.pet[x].toFixed(0).padStart(5)}  runoff ${D.runoff[x].toFixed(0).padStart(4)} mm`);
        }
    }
}
const f = (x, digits = 2) => Number.isNaN(x) ? 'n/a' : x.toFixed(digits);
const pc = x => Number.isNaN(x) ? 'n/a' : Math.round(100 * x) + ' %';
function summary(rows) {
    const { matched, annual: a, seasonal: y } = summarizeRows(rows);
    return `${matched} matched · annual n=${a.n}, zero=${a.zero}, invalid=${a.invalid}: runoff ×${f(a.medianRatio)}, within ×2 ${pc(a.withinFactorTwo)}, rms ×${f(a.rmsFactor)}`
        + ` · seasonal n=${y.n}/${matched} (score n=${y.scoreN}, infinite penalties=${y.infinitePenaltyN}, invalid=${y.invalidScoreN}): r ${f(y.correlation)}, peak ±1 month ${pc(y.peakWithinMonth)} (n=${y.peakN}), range ×${f(y.range)}, peak ×${f(y.peakRatio)}, low flow ×${f(y.low)}`
        + `, flood season ${pc(y.flood)} (measured ${pc(y.floodMeasured)})`
        + `, early ${f(y.early)} months (n=${y.phaseN}; great basins ${f(y.greatEarly)}, n=${y.greatN})`;
}
const run = (climate, F) => runNewWater({ r_xyz: xyz, r_elevation: E.r_elevation, ...adj, climate }, { F, riverMonths: true });
/** Earth's closed basins, a place on each one's floor or terminal lake (the Caspian and the Aral are water on the map: an
 *  enclosed sea, if the map closes it) */
const CLOSED = [['Tarim', 40.5, 88], ['Balkhash', 46.5, 74.5], ['Eyre', -28.4, 137.3], ['Great Basin', 40, -116], ['Great Salt Lake', 41.1, -112.5],
    ['Sistan', 31, 61.5], ['Dead Sea', 31.5, 35.5], ['Urmia', 37.7, 45.4], ['Altiplano', -18.7, -67.1], ['Chad', 13, 14.5], ['Okavango', -19.5, 23],
    ['Turkana', 3.6, 36.1], ['Issyk-Kul', 42.4, 77.3], ['Aral', 45, 60], ['Caspian', 42, 51]];
/** The land (without Antarctica) whose water, followed down, ends in a lake with no outflow rather than the sea; and
 *  whether each of Earth's closed basins does (its nearest region not the sea) */
function closedBasins(W) {
    const end = new Int32Array(n).fill(-2), trail = [];
    for (let s = 0; s < n; s++) {
        if (end[s] !== -2) continue;
        trail.length = 0;
        let c = s;
        while (c >= 0 && end[c] === -2) { end[c] = -3; trail.push(c); const r = W.recv[c]; if (r < 0) break; c = r; }
        const e = end[c] >= 0 ? end[c] : c;
        for (const t of trail) end[t] = e;
    }
    let all = 0, closed = 0;
    for (let c = 0; c < n; c++) if (land[c] && !W.lake[c] && lat[c] >= -60) { all++; if (!W.ocean[end[c]]) closed++; }
    const named = CLOSED.map(([name, la, lo]) => {
        let best = -1, bd = Infinity;
        for (let a = Math.floor(la) - 1; a <= Math.floor(la) + 1; a++) for (let o = Math.floor(lo) - 1; o <= Math.floor(lo) + 1; o++) for (const r of buckets.get(bkey(a, o)) ?? []) {
            if (W.ocean[r]) continue;
            const d = (lat[r] - la) ** 2 + ((lon[r] - lo) * Math.cos(la * Math.PI / 180)) ** 2;
            if (d < bd) { bd = d; best = r; }
        }
        return [name, best >= 0 && !W.ocean[end[best]]];
    });
    return `closed basins: ${(100 * closed / Math.max(1, all)).toFixed(1)} % of the land drains to them (Earth ≈ 18–20 %); of Earth's own closed ${named.filter(x => x[1]).map(x => x[0]).join(', ') || 'none'}; open ${named.filter(x => !x[1]).map(x => x[0]).join(', ') || 'none'}`;
}

const report = { format: 'orogen-river-check-v2', regions: n, eligibleGauges: gauges.length, sourceGauges: sourceGauges.length,
    stationDataSha256: createHash('sha256').update(stationText).digest('hex'),
    matching: { radiusKm: RADIUS_KM, areaFactor: AREA_TOL, minAreaKm2: MIN_AREA, minimumYearsPerMonth: 5 },
    scoreDefinition: 'upper median; zero annual/monthly flows and constant simulated years retain -Infinity penalties; invalid model output yields NaN; unavailable positive-flow series reported separately',
    nonFiniteJsonEncoding: 'Infinity, -Infinity and NaN are strings, not null', runs: [] };

if (TUNING) {
    // ── every combination of TUNE's values, with the observed climate (or the simulated) ──
    const keys = Object.keys(TUNE), combos = keys.reduce((list, k) => list.flatMap(c => TUNE[k].map(v => ({ ...c, [k]: v }))), [{}]);
    const results = [];
    for (const c of combos) {
        const F = { ...WATER, ...SET, ...c }, batch = score(run(CLIMATE === 'sim' ? sim : obs, F), F);
        results.push({ c, ...batch, s: yearScore(batch.rows) });
        log(`${keys.map(k => `${k} ${c[k]}`).join(', ')}: year score ${results.at(-1).s.toFixed(3)}`);
    }
    results.sort((a, b) => compareScores(a.s, b.s));
    console.log(`${gauges.length} gauges draining ≥ ${MIN_AREA.toLocaleString()} km²; Earth at ${n.toLocaleString()} regions; ${CLIMATE === 'sim' ? 'simulated' : 'observed'} climate; ranked by the year's score`);
    const floods = (rows) => ZONES.map(z => { const yr = rows.filter(y => y.zone === z && y.r !== undefined); return yr.length >= 3 ? `${z} ${Math.round(100 * yr.filter(y => y.flood).length / yr.length)}/${Math.round(100 * yr.filter(y => y.floodMeasured).length / yr.length)}` : ''; }).filter(Boolean).join(', ');
    report.runs = results.map(x => ({ climate: CLIMATE === 'sim' ? 'simulated' : 'observed', constants: { ...WATER, ...SET, ...x.c }, summary: summarizeRows(x.rows), rows: x.rows, unmatched: x.unmatched }));
    for (const x of results) console.log(`${x.s.toFixed(3)}  ${keys.map(k => `${k} ${x.c[k]}`).join(', ').padEnd(64)} ${summary(x.rows)}\n${' '.repeat(71)}zone D ${summary(x.rows.filter(y => y.zone === 'D'))}\n${' '.repeat(71)}flood season by zone, simulated/measured %: ${floods(x.rows)}`);
} else {
    console.log(`${gauges.length} gauges draining ≥ ${MIN_AREA.toLocaleString()} km²; Earth at ${n.toLocaleString()} regions${Object.keys(SET).length ? `; ${JSON.stringify(SET)}` : ''}`);
    for (const [label, climate] of [['observed climate', obs], ['simulated climate', CLIMATE === 'obs' ? null : sim]]) {
        if (!climate) continue;
        const F = { ...WATER, ...SET }, W = run(climate, F), { rows, unmatched } = score(W, F);
        report.runs.push({ climate: label, constants: F, summary: summarizeRows(rows), rows, unmatched });
        console.log(`  matched ${rows.length}/${gauges.length} eligible (${sourceGauges.length} source); unmatched ${unmatched.length}`);
        console.log(`── ${label}: year score ${yearScore(rows).toFixed(3)}`);
        console.log(`  ${closedBasins(W)}`);
        console.log(`  ${networkCheck(W)}`);
        console.log(`  all      ${summary(rows)}`);
        console.log(`  no lake  ${summary(rows.filter(x => !x.lake))}`);
        for (const z of ZONES) { const zr = rows.filter(x => x.zone === z); if (zr.length >= 3) console.log(`  zone ${z}   ${summary(zr)}`); }
        if (LIST) for (const x of rows.slice().sort((a, b) => b.q - a.q)) console.log(`    ${x.river.slice(0, 16).padEnd(17)}${x.zone} runoff ×${x.runoff.toFixed(2)}`
            + (x.r === undefined ? ` [${x.seasonalStatus}]` : ` r ${x.r.toFixed(2)} range ×${x.range.toFixed(2)} low ×${x.low.toFixed(2)} early ${x.early ?? 'n/a'} | ${x.year.map(v => v.toFixed(1)).join(' ')} | measured ${x.measured.map(v => v.toFixed(1)).join(' ')}`));
        if (LIST) for (const x of unmatched) console.log(`    ${x.river} / ${x.station}: unmatched [${x.reason}]`);
        if (TRACE) trace(W, rows, unmatched, TRACE);
        if (FROM) follow(W, FROM);
    }
}
if (JSON_OUT) {
    fs.mkdirSync(path.dirname(path.resolve(JSON_OUT)), { recursive: true });
    fs.writeFileSync(JSON_OUT, JSON.stringify(report, metricJson, 2) + '\n');
    log(`report: ${JSON_OUT}`);
}
if (report.runs.some(x => x.summary.annual.invalid || x.summary.seasonal.invalidScoreN)) process.exitCode = 1;
log('done');
