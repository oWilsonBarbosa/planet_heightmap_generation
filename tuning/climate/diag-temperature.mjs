/**
 * Where is the temperature stage wrong? Land error by latitude band (Jan / Jul / yearly swing) and for named
 * regions, from the last temperature-check.mjs run (data/lab/new_t2m.f32).   node tuning/climate/diag-temperature.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadReferences } from './lib/ref.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { grid, fields: obs, land } = loadReferences();
const G = grid.size;
const b = fs.readFileSync(path.join(__dirname, 'data', 'lab', 'new_t2m.f32'));
const T = new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4);
const f1 = (x) => (x === x ? x.toFixed(1).padStart(6) : '     —');

function stats(cells, m) {
    let s = 0, o = 0, n = 0;
    for (const c of cells) { const v = T[m * G + c], r = obs.t2m[m * G + c]; if (v === v && r === r) { s += v; o += r; n++; } }
    return n ? [s / n, o / n] : [NaN, NaN];
}
function swing(cells, src) {
    let s = 0, n = 0;
    for (const c of cells) { let mx = -Infinity, mn = Infinity; for (let m = 0; m < 12; m++) { const v = src[m * G + c]; mx = Math.max(mx, v); mn = Math.min(mn, v); } if (mx === mx) { s += mx - mn; n++; } }
    return n ? s / n : NaN;
}
console.log('Land by latitude band:        January (model / real)     July (model / real)      yearly swing (model / real)');
for (let lat = 80; lat > -60; lat -= 10) {
    const cells = [];
    for (let j = 0; j < grid.h; j++) { if (grid.lat[j] > lat || grid.lat[j] <= lat - 10) continue; for (let i = 0; i < grid.w; i++) { const c = j * grid.w + i; if (land[c]) cells.push(c); } }
    const [js, jo] = stats(cells, 0), [us, uo] = stats(cells, 6);
    console.log(`  ${String(lat - 10).padStart(4)}…${String(lat).padStart(3)}°  (${String(cells.length).padStart(5)} cells)   ${f1(js)} /${f1(jo)}             ${f1(us)} /${f1(uo)}            ${f1(swing(cells, T))} /${f1(swing(cells, obs.t2m))}`);
}
const REGIONS = {
    'Siberia (55–70N, 90–140E)': [55, 70, 90, 140], 'Canada (50–65N, 120–70W)': [50, 65, -120, -70],
    'W Europe (45–55N, 10W–10E)': [45, 55, -10, 10], 'E USA (30–45N, 95–75W)': [30, 45, -95, -75],
    'Sahara (18–30N, 10W–30E)': [18, 30, -10, 30], 'India (15–28N, 72–88E)': [15, 28, 72, 88],
    'Amazon (10S–2N, 70–50W)': [-10, 2, -70, -50], 'Australia (30–20S, 120–145E)': [-30, -20, 120, 145],
    'Tibet (30–36N, 80–95E)': [30, 36, 80, 95], 'Greenland (65–80N, 50–30W)': [65, 80, -50, -30],
    'Antarctica (<70S)': [-90, -70, -180, 180], 'Mediterranean (35–42N, 0–25E)': [35, 42, 0, 25],
};
console.log('\nRegions:                          January (model / real)   July (model / real)   swing (model / real)');
for (const [name, [la0, la1, lo0, lo1]] of Object.entries(REGIONS)) {
    const cells = [];
    for (let j = 0; j < grid.h; j++) { const la = grid.lat[j]; if (la < la0 || la > la1) continue; for (let i = 0; i < grid.w; i++) { const lo = grid.lon[i]; if (lo < lo0 || lo > lo1) continue; const c = j * grid.w + i; if (land[c]) cells.push(c); } }
    const [js, jo] = stats(cells, 0), [us, uo] = stats(cells, 6);
    console.log(`  ${name.padEnd(32)} ${f1(js)} /${f1(jo)}           ${f1(us)} /${f1(uo)}       ${f1(swing(cells, T))} /${f1(swing(cells, obs.t2m))}`);
}
