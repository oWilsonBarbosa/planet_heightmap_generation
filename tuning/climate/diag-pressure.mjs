/**
 * Where the circulation goes wrong (Earth, every stage new, against NCEP 1991–2020):
 *  1. Pressure error per region and season — departures from each latitude's mean over low ground (as the coupled
 *     check scores it), RMS and mean bias.
 *  2. Maps of that departure error, January and July (6° boxes).
 *  3. The zonal-mean pressure profile over low ground, January and July — the belts' strength and position.
 *  4. The centres of action: value and position of each named low and high, model vs NCEP.
 *  5. Winds: direction (share within 45°) and speed ratio per region and season, and named wind systems — the monsoons,
 *     the trades, the westerlies.
 *
 *   node tuning/climate/diag-pressure.mjs [--set KEY=value,…] [--maps]   (CORE='{…}' for core options)
 */

import { loadEarthGrayscale } from './lib/earth-context.mjs';
import { buildEarthMesh } from './lib/earth-mesh.mjs';
import { loadReferences } from './lib/ref.mjs';
import { regionOf, TUNED_REGIONS } from './lib/regions.mjs';
import { elevToHeightKm } from '../../js/color-map.js';
import { planetClimate } from '../../v2/js/climate/climate.js';
import { setParams } from '../../v2/js/climate/config.js';

const argSet = process.argv.indexOf('--set');
if (argSet > 0) setParams(Object.fromEntries(process.argv[argSet + 1].split(',').map(kv => { const [k, v] = kv.split('='); return [k, +v]; })));
const MAPS = process.argv.includes('--maps');
const CORE = process.env.CORE ? JSON.parse(process.env.CORE) : {};
const { grid, fields: obs } = loadReferences();
const G = grid.size, W = grid.w, H = grid.h;
const { gray, width, height } = loadEarthGrayscale();
const e = buildEarthMesh(gray, width, height, { N: 40000 });
const elevKm = new Float32Array(e.mesh.numRegions);
for (let r = 0; r < elevKm.length; r++) elevKm[r] = elevToHeightKm(e.r_elevation[r]);
const res = planetClimate({ xyz: e.r_xyz, elevKm, axes: 'y-up' }, CORE);
const C = res.stages.circulation, lf = res.surface.landFrac, hKm = res.surface.meanKm;
const lonOf = (i) => -180 + (i + 0.5) * grid.step;
const lowland = new Uint8Array(G);
for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const c = j * W + i; lowland[c] = hKm[c] < 1 && Math.abs(grid.lat[j]) < 80 && obs.slp[c] === obs.slp[c] ? 1 : 0; }
const cosW = Float64Array.from(grid.lat, l => Math.cos(l * Math.PI / 180));

// departures from each latitude's lowland mean, per month
const depM = new Float64Array(12 * G), depO = new Float64Array(12 * G), zonM = new Float64Array(12 * H), zonO = new Float64Array(12 * H);
for (let m = 0; m < 12; m++) for (let j = 0; j < H; j++) {
    let a = 0, b = 0, n = 0;
    for (let i = 0; i < W; i++) { const c = j * W + i; if (lowland[c]) { a += C.slp[m * G + c]; b += obs.slp[m * G + c]; n++; } }
    if (!n) { zonM[m * H + j] = NaN; zonO[m * H + j] = NaN; continue; }
    a /= n; b /= n; zonM[m * H + j] = a; zonO[m * H + j] = b;
    for (let i = 0; i < W; i++) { const c = j * W + i, k = m * G + c; depM[k] = C.slp[k] - a; depO[k] = obs.slp[k] - b; }
}
const DJF = [11, 0, 1], JJA = [5, 6, 7];

// ── 1. Per region and season ──
console.log('1. Pressure departures from the latitude mean (lowland), model − NCEP: RMS / mean bias (hPa)');
console.log(`   ${'region'.padEnd(16)}   DJF RMS  bias    JJA RMS  bias`);
for (const R of TUNED_REGIONS) {
    const row = [];
    for (const S of [DJF, JJA]) {
        let se = 0, sb = 0, sw = 0;
        for (const m of S) for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
            const c = j * W + i; if (!lowland[c] || regionOf(grid.lat[j], lonOf(i), lf[c] >= 0.5) !== R) continue;
            const d = depM[m * G + c] - depO[m * G + c]; se += cosW[j] * d * d; sb += cosW[j] * d; sw += cosW[j];
        }
        row.push(`${Math.sqrt(se / sw).toFixed(1).padStart(7)} ${(sb / sw).toFixed(1).padStart(5)}`);
    }
    console.log(`   ${R.padEnd(16)} ${row.join('   ')}`);
}

// ── 2. Maps ──
if (MAPS) for (const [name, m] of [['January', 0], ['July', 6]]) {
    console.log(`\n2. ${name}: departure error, model − NCEP, 6° boxes (# > +6, + +2…+6, . ±2, - −2…−6, = < −6 hPa; blank: high ground)`);
    console.log('       ' + Array.from({ length: 60 }, (_, q) => (q % 5 === 0 ? String(-180 + q * 6).padEnd(5) : '')).join('').slice(0, 60));
    for (let la = 78; la > -72; la -= 6) {
        let row = `${String(la).padStart(4)}   `;
        for (let lo = -180; lo < 180; lo += 6) {
            let s = 0, n = 0;
            for (let dj = 0; dj < 6; dj++) for (let di = 0; di < 6; di++) {
                const c = grid.cellAt(la - dj - 0.5, lo + di + 0.5); if (!lowland[c]) continue;
                s += depM[m * G + c] - depO[m * G + c]; n++;
            }
            const x = n ? s / n : NaN;
            row += !(x === x) ? ' ' : x > 6 ? '#' : x > 2 ? '+' : x >= -2 ? '.' : x >= -6 ? '-' : '=';
        }
        console.log(row);
    }
}

// ── 3. Zonal profile ──
console.log('\n3. Zonal-mean sea-level pressure over low ground (hPa), model / NCEP');
console.log('    lat     January          July');
for (let la = 75; la >= -65; la -= 10) {
    const f = (m) => { let a = 0, b = 0, n = 0; for (let j = 0; j < H; j++) { if (Math.abs(grid.lat[j] - la) > 5) continue; const x = zonM[m * H + j], y = zonO[m * H + j]; if (x === x) { a += x; b += y; n++; } } return `${(a / n).toFixed(1).padStart(7)} /${(b / n).toFixed(1).padStart(7)}`; };
    console.log(`  ${String(la).padStart(4)}  ${f(0)}  ${f(6)}`);
}

// ── 4. Centres of action ──
const CENTRES = [
    ['Icelandic low', 'min', [0], [50, 72, -60, 10]],
    ['Aleutian low', 'min', [0], [40, 65, 150, 220]],
    ['Siberian high', 'max', [0], [35, 65, 70, 130]],
    ['N American high (winter)', 'max', [0], [35, 65, -130, -80]],
    ['Azores high (Jan)', 'max', [0], [20, 45, -60, 0]],
    ['Azores high (Jul)', 'max', [6], [20, 50, -60, 0]],
    ['N Pacific high (Jul)', 'max', [6], [20, 50, 170, 240]],
    ['Asian summer low', 'min', [6], [15, 45, 40, 110]],
    ['N American heat low', 'min', [6], [20, 42, -125, -95]],
    ['Saharan heat low', 'min', [6], [15, 35, -15, 35]],
    ['S Atlantic high (Jul)', 'max', [6], [-45, -10, -40, 10]],
    ['S Pacific high (Jul)', 'max', [6], [-45, -10, -130, -70]],
    ['S Indian high (Jul)', 'max', [6], [-45, -15, 40, 110]],
    ['Australian heat low (Jan)', 'min', [0], [-35, -10, 110, 155]],
    ['S American heat low (Jan)', 'min', [0], [-35, -10, -70, -45]],
    ['S African heat low (Jan)', 'min', [0], [-30, -10, 10, 35]],
    ['Australian high (Jul)', 'max', [6], [-40, -20, 110, 155]],
];
console.log('\n4. Centres of action (lowland, 1° cells, full pressure): model vs NCEP — value (hPa) at lat, lon');
for (const [name, kind, months, [la0, la1, lo0, lo1]] of CENTRES) {
    const find = (field) => {
        let best = kind === 'min' ? 1e9 : -1e9, bj = -1, bi = -1;
        for (let j = 0; j < H; j++) { const la = grid.lat[j]; if (la < la0 || la > la1) continue;
            for (let i = 0; i < W; i++) { let lo = lonOf(i); if (lo < lo0) lo += 360; if (lo < lo0 || lo > lo1) continue;
                const c = j * W + i; if (!lowland[c]) continue;
                let v = 0; for (const m of months) v += field[m * G + c] / months.length;
                if (kind === 'min' ? v < best : v > best) { best = v; bj = j; bi = i; } } }
        return `${best.toFixed(1)} at ${grid.lat[bj].toFixed(0)}, ${lonOf(bi).toFixed(0)}`;
    };
    console.log(`   ${name.padEnd(27)} ${find(C.slp).padEnd(24)} NCEP ${find(obs.slp)}`);
}

// ── 5. Winds ──
console.log('\n5. Near-surface wind per region: within 45° of NCEP (speed-weighted) / speed model ÷ NCEP');
console.log(`   ${'region'.padEnd(16)}   DJF            JJA`);
for (const R of TUNED_REGIONS) {
    const row = [];
    for (const S of [DJF, JJA]) {
        let ok = 0, wsum = 0, sm = 0, so = 0;
        for (const m of S) for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
            const c = j * W + i; if (Math.abs(grid.lat[j]) > 80 || regionOf(grid.lat[j], lonOf(i), lf[c] >= 0.5) !== R) continue;
            const k = m * G + c, uo = obs.u10[k], vo = obs.v10[k], s0 = Math.hypot(uo, vo), s1 = Math.hypot(C.u[k], C.v[k]);
            if (!(s0 === s0)) continue;
            sm += cosW[j] * s1; so += cosW[j] * s0;
            if (s0 > 0.5) { wsum += cosW[j] * s0; if (s1 > 1e-6 && (C.u[k] * uo + C.v[k] * vo) / (s0 * s1) > Math.SQRT1_2) ok += cosW[j] * s0; }
        }
        row.push(`${(100 * ok / wsum).toFixed(0).padStart(3)} % / ×${(sm / so).toFixed(2)}`);
    }
    console.log(`   ${R.padEnd(16)} ${row.join('   ')}`);
}
const SYSTEMS = [
    ['Indian monsoon (Jul)', [6], [8, 22, 70, 90]],
    ['Somali jet / Arabian Sea (Jul)', [6], [5, 15, 50, 70]],
    ['Gangetic plain (Jul)', [6], [22, 29, 78, 90]],
    ['Bay of Bengal (Jul)', [6], [10, 20, 85, 95]],
    ['East Asian monsoon (Jul)', [6], [22, 35, 105, 122]],
    ['East Asian winter monsoon (Jan)', [0], [22, 40, 105, 125]],
    ['Indian winter monsoon (Jan)', [0], [8, 22, 70, 90]],
    ['West African monsoon (Jul)', [6], [5, 15, -15, 10]],
    ['N Australian monsoon (Jan)', [0], [-18, -8, 120, 145]],
    ['S American monsoon (Jan)', [0], [-20, -5, -65, -45]],
    ['N Atlantic trades (Jan)', [0], [10, 25, -60, -20]],
    ['N Atlantic westerlies (Jan)', [0], [45, 60, -40, -10]],
    ['Westerlies onto Europe (Jan)', [0], [45, 58, -10, 15]],
    ['Westerlies onto Europe (Jul)', [6], [45, 58, -10, 15]],
    ['US Pacific coast (Jan)', [0], [35, 50, -130, -122]],
    ['US Pacific coast (Jul)', [6], [35, 50, -130, -122]],
    ['Southern Ocean westerlies (Jul)', [6], [-60, -45, -180, 180]],
];
console.log('\n   Wind systems (mean vector, m/s east, north): model vs NCEP');
for (const [name, months, [la0, la1, lo0, lo1]] of SYSTEMS) {
    let um = 0, vm = 0, uo = 0, vo = 0, n = 0;
    for (const m of months) for (let j = 0; j < H; j++) { const la = grid.lat[j]; if (la < la0 || la > la1) continue;
        for (let i = 0; i < W; i++) { const lo = lonOf(i); if (lo < lo0 || lo > lo1) continue;
            const k = m * G + j * W + i; if (!(obs.u10[k] === obs.u10[k])) continue;
            um += C.u[k]; vm += C.v[k]; uo += obs.u10[k]; vo += obs.v10[k]; n++; } }
    const f = (x) => (x / n).toFixed(1).padStart(5);
    console.log(`   ${name.padEnd(33)} ${f(um)},${f(vm)}    NCEP ${f(uo)},${f(vo)}`);
}
