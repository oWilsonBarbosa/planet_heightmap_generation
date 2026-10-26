/**
 * Warm and cold currents, and the coasts beside them (Earth, every stage new): for each named current, the sea's annual
 * temperature against the average of the sea at its latitude (new vs OISST), the ocean's heat there (W/m²) and the
 * current's northward speed; and the neighbouring coast's annual land temperature against its latitude's land average
 * (new vs Beck), and its annual rain as a ratio to its latitude's land average (new vs Beck). Poleward currents should be
 * warm, equatorward ones cold, and their coasts with them — warmer and wetter, or cooler and drier.
 *
 *   node tuning/climate/diag-currents.mjs [--set KEY=value,…]   (CORE='{…}' for core options)
 */

import { loadEarthGrayscale } from './lib/earth-context.mjs';
import { buildEarthMesh } from './lib/earth-mesh.mjs';
import { loadReferences } from './lib/ref.mjs';
import { elevToHeightKm } from '../../js/color-map.js';
import { planetClimate } from '../../v2/js/climate/climate.js';
import { setParams } from '../../v2/js/climate/config.js';

const argSet = process.argv.indexOf('--set');
if (argSet > 0) setParams(Object.fromEntries(process.argv[argSet + 1].split(',').map(kv => { const [k, v] = kv.split('='); return [k, +v]; })));
const CORE = process.env.CORE ? JSON.parse(process.env.CORE) : {};
// name, poleward (+1) or equatorward (−1), sea box [lat0, lat1, lon0, lon1], coast box (land) or null
const CURRENTS = [
    ['Gulf Stream',        +1, [33, 42, -76, -62],   [33, 42, -82, -74]],
    ['N Atlantic Drift',   +1, [48, 62, -25, -5],    [50, 60, -10, 10]],
    ['Norwegian',          +1, [62, 72, -2, 15],     [60, 70, 5, 20]],
    ['Kuroshio',           +1, [28, 38, 128, 145],   [30, 38, 128, 142]],
    ['Brazil',             +1, [-35, -20, -50, -38], [-32, -20, -54, -42]],
    ['East Australian',    +1, [-38, -25, 152, 160], [-37, -25, 145, 153]],
    ['Agulhas',            +1, [-38, -28, 25, 36],   [-34, -26, 25, 32]],
    ['California',         -1, [25, 42, -130, -117], [30, 42, -124, -116]],
    ['Canary',             -1, [15, 32, -25, -12],   [18, 32, -17, -8]],
    ['Humboldt',           -1, [-35, -8, -85, -72],  [-32, -8, -81, -69]],
    ['Benguela',           -1, [-33, -15, 5, 14],    [-32, -15, 11, 18]],
    ['West Australian',    -1, [-35, -20, 105, 114], [-35, -20, 113, 120]],
    ['Labrador',           -1, [45, 60, -60, -45],   [45, 58, -70, -55]],
    ['Oyashio',            -1, [38, 50, 142, 158],   [40, 50, 138, 146]],
];

const { grid, fields: obs } = loadReferences();
const G = grid.size, W = grid.w, H = grid.h;
const { gray, width, height } = loadEarthGrayscale();
const e = buildEarthMesh(gray, width, height, { N: 40000 });
const elevKm = new Float32Array(e.mesh.numRegions);
for (let r = 0; r < elevKm.length; r++) elevKm[r] = elevToHeightKm(e.r_elevation[r]);
const res = planetClimate({ xyz: e.r_xyz, elevKm, axes: 'y-up' }, CORE);
const lf = res.surface.landFrac, SL = res.stages.temperature.monthlySL, T = res.months.T, O = res.stages.ocean, P = res.months.P;
const lonOf = (i) => -180 + (i + 0.5) * grid.step;
const annual = (f, c) => { let s = 0; for (let m = 0; m < 12; m++) s += f[m * G + c]; return s / 12; };
// annual fields and each row's sea / land means
const sstN = new Float64Array(G), sstO = new Float64Array(G), tlN = new Float64Array(G), tlO = new Float64Array(G);
const seaRowN = new Float64Array(H), seaRowO = new Float64Array(H), landRowN = new Float64Array(H), landRowO = new Float64Array(H);
const prN = new Float64Array(G), prO = new Float64Array(G), rainRowN = new Float64Array(H), rainRowO = new Float64Array(H);
for (let j = 0; j < H; j++) {
    let a = 0, b = 0, n = 0, la = 0, lb = 0, ln = 0;
    for (let i = 0; i < W; i++) {
        const c = j * W + i;
        sstN[c] = annual(SL, c); sstO[c] = annual(obs.sst, c); tlN[c] = annual(T, c); tlO[c] = annual(obs.t2m, c);
        prN[c] = 12 * annual(P, c); prO[c] = 12 * annual(obs.precip, c);
        if (lf[c] < 0.1 && sstO[c] === sstO[c]) { a += sstN[c]; b += sstO[c]; n++; }
        if (lf[c] >= 0.5 && tlO[c] === tlO[c] && prO[c] === prO[c]) { la += tlN[c]; lb += tlO[c]; ln++; rainRowN[j] += prN[c]; rainRowO[j] += prO[c]; }
    }
    seaRowN[j] = a / n; seaRowO[j] = b / n; landRowN[j] = la / ln; landRowO[j] = lb / ln; rainRowN[j] /= ln; rainRowO[j] /= ln;
}
const box = (b, pick) => { let s = 0, n = 0; for (let j = 0; j < H; j++) { const la = grid.lat[j]; if (la < b[0] || la > b[1]) continue; for (let i = 0; i < W; i++) { const lo = lonOf(i); if (lo < b[2] || lo > b[3]) continue; const v = pick(j * W + i, j); if (v === v) { s += v; n++; } } } return n ? s / n : NaN; };
const f = (x, d = 1) => (x === x ? (x >= 0 ? '+' : '') + x.toFixed(d) : '—').padStart(6);
console.log('Sea: annual temperature minus its latitude\'s sea average (°C), new / OISST; ocean heat (W/m²); northward current (cm/s)');
console.log('Coast: annual land temperature minus its latitude\'s land average (°C), new / Beck');
let sN = 0, sO = 0, cN = 0, cO = 0, k = 0, rsN = 0, rsO = 0;
for (const [name, dir, sea, coast] of CURRENTS) {
    const aN = box(sea, (c, j) => (lf[c] < 0.1 && sstO[c] === sstO[c] ? sstN[c] - seaRowN[j] : NaN));
    const aO = box(sea, (c, j) => (lf[c] < 0.1 ? sstO[c] - seaRowO[j] : NaN));
    const q = box(sea, (c) => (lf[c] < 0.1 ? O.qflux[c] : NaN)), v = box(sea, (c) => (lf[c] < 0.1 ? 100 * O.v[c] : NaN));
    const carr = O.carried ? box(sea, (c) => (lf[c] < 0.1 ? O.carried[c] : NaN)) : NaN;
    const lN = coast ? box(coast, (c, j) => (lf[c] >= 0.5 && tlO[c] === tlO[c] ? tlN[c] - landRowN[j] : NaN)) : NaN;
    const lO = coast ? box(coast, (c, j) => (lf[c] >= 0.5 ? tlO[c] - landRowO[j] : NaN)) : NaN;
    const rN = box(coast, (c, j) => (lf[c] >= 0.5 && prO[c] === prO[c] ? Math.log(prN[c] / rainRowN[j]) : NaN)), rO = box(coast, (c, j) => (lf[c] >= 0.5 && prO[c] === prO[c] ? Math.log(prO[c] / rainRowO[j]) : NaN));
    console.log(`  ${(dir > 0 ? '↑ ' : '↓ ') + name.padEnd(18)} sea ${f(aN)} /${f(aO)}   heat ${f(q, 0)}   v ${f(v, 1)}  carried ${f(carr)}   coast ${f(lN)} /${f(lO)}   rain ×${Math.exp(rN).toFixed(2)} / ×${Math.exp(rO).toFixed(2)}`);
    rsN += dir * rN; rsO += dir * rO;
    sN += dir * aN; sO += dir * aO; if (lN === lN) { cN += dir * lN; cO += dir * lO; k++; }
}
console.log(`  warm-minus-cold, mean: sea ${f(sN / CURRENTS.length)} /${f(sO / CURRENTS.length)} °C · coast ${f(cN / k)} /${f(cO / k)} °C · coast rain ×${Math.exp(rsN / CURRENTS.length).toFixed(2)} / ×${Math.exp(rsO / CURRENTS.length).toFixed(2)}`);
