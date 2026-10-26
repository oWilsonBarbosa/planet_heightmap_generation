/**
 * The coupled climate's rain on Earth against the observed (Beck et al. 2023 on land, GPCP at sea), where its biases
 * show: by height, by the observed annual temperature (and by season where it is cold), in named boxes — the high
 * plateaus and ranges, the cold interiors — the windward and lee sides of the westerlies' coastal ranges (their
 * contrast), and the storm tracks at sea. Each line: the model's mean rain (mm/yr), the observed, their ratio and the
 * log error (rain + 120 mm). The climate runs as coupled-check.mjs runs it.
 *
 *   node tuning/climate/diag-rain-bias.mjs [--n 160000] [--set KEY=value,…] [--label name]
 *   → a table on stderr, one JSON line on stdout
 */

import { loadEarthGrayscale } from './lib/earth-context.mjs';
import { buildEarthMesh } from './lib/earth-mesh.mjs';
import { loadReferences } from './lib/ref.mjs';
import { elevToHeightKm } from '../../js/color-map.js';
import { computeClimate } from '../../v2/js/climate/core.js';
import { energyBalanceTemperature } from '../../v2/js/climate/temperature.js';
import { derivedCirculation } from '../../v2/js/climate/circulation.js';
import { windDrivenOcean } from '../../v2/js/climate/ocean.js';
import { columnWaterRain } from '../../v2/js/climate/rain.js';
import { setParams } from '../../v2/js/climate/config.js';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const N = +arg('--n', 160000), LABEL = arg('--label', 'run');
const SET = arg('--set', '') ? Object.fromEntries(arg('--set').split(',').map(kv => { const [k, v] = kv.split('='); return [k, +v]; })) : {};
setParams(SET);
const { grid, fields: obs, land: obsLand } = loadReferences();
const G = grid.size;
const { gray, width, height } = loadEarthGrayscale();
const e = buildEarthMesh(gray, width, height, { N });
const n = e.mesh.numRegions, elevKm = new Float32Array(n);
for (let r = 0; r < n; r++) elevKm[r] = elevToHeightKm(e.r_elevation[r]);
const t0 = performance.now();
const stages = { temperature: energyBalanceTemperature(), circulation: derivedCirculation(), ocean: windDrivenOcean(), rain: columnWaterRain() };
const res = computeClimate({ xyz: e.r_xyz, elevKm, axes: 'y-up' }, { stages });
const secs = (performance.now() - t0) / 1000;
const lat = (c) => grid.lat[Math.floor(c / grid.w)], lon = (c) => grid.lon[c % grid.w];
const SEAS = { DJF: [11, 0, 1], MAM: [2, 3, 4], JJA: [5, 6, 7], SON: [8, 9, 10] };
const cells = [];
for (let c = 0; c < G; c++) {
    if (!obsLand[c] || !(res.surface.landFrac[c] >= 0.5)) continue;
    let pm = 0, po = 0, to = 0; const sm = {}, so = {};
    for (let m = 0; m < 12; m++) { pm += res.months.P[m * G + c]; po += obs.precip[m * G + c]; to += obs.t2m[m * G + c] / 12; }
    for (const [k, ms] of Object.entries(SEAS)) { sm[k] = ms.reduce((a, m) => a + res.months.P[m * G + c], 0); so[k] = ms.reduce((a, m) => a + obs.precip[m * G + c], 0); }
    if (!(pm === pm && po === po)) continue;
    const h = res.surface.meanLandKm[c];
    cells.push({ c, lat: lat(c), lon: lon(c), w: Math.cos(lat(c) * Math.PI / 180), h: h === h ? h : 0, pm, po, to, sm, so });
}
function group(name, pick, key = null) {
    const s = cells.filter(pick);
    let wm = 0, wo = 0, w = 0;
    const vm = (x) => key ? x.sm[key] : x.pm, vo = (x) => key ? x.so[key] : x.po;
    for (const x of s) { wm += x.w * vm(x); wo += x.w * vo(x); w += x.w; }
    const lr = s.length ? Math.sqrt(s.reduce((a, x) => a + x.w * Math.log((vm(x) + (key ? 30 : 120)) / (vo(x) + (key ? 30 : 120))) ** 2, 0) / w) : NaN;
    return { name: key ? `${name} ${key}` : name, cells: s.length, model: w ? Math.round(wm / w) : null, obs: w ? Math.round(wo / w) : null, ratio: w ? +(wm / wo).toFixed(2) : null, logRms: +lr.toFixed(3) };
}
const out = { label: LABEL, N, set: SET, secs: +secs.toFixed(1), groups: [] };
const add = (g) => { out.groups.push(g); return g; };
add(group('all land', () => true));
for (const [a, b] of [[0, 0.5], [0.5, 1], [1, 2], [2, 3], [3, 4], [4, 9]]) add(group(`height ${a}–${b} km`, x => x.h >= a && x.h < b));
for (const [a, b] of [[-99, -20], [-20, -10], [-10, 0], [0, 10], [10, 20], [20, 99]]) {
    add(group(`obs T ${a}…${b} °C`, x => x.to >= a && x.to < b));
    if (a >= -20 && b <= 10) for (const k of ['DJF', 'JJA']) add(group(`obs T ${a}…${b} °C`, x => x.to >= a && x.to < b && x.lat > 0, k));
}
const box = (name, la0, la1, lo0, lo1, hmin = -1) => (x => x.lat >= la0 && x.lat <= la1 && x.lon >= lo0 && x.lon <= lo1 && x.h >= hmin);
const BOXES = [
    ['Greenland ice sheet (≥1.5 km)', box(0, 62, 82, -60, -20, 1.5)], ['Antarctica', box(0, -90, -65, -180, 180)],
    ['Tibetan Plateau (≥4 km)', box(0, 30, 37, 80, 97, 4)], ['Himalaya front', box(0, 26.5, 29, 80, 95)],
    ['Altiplano (≥3 km)', box(0, -22, -14, -70, -65, 3)], ['Ethiopian Highlands (≥1.5 km)', box(0, 6, 15, 36, 41, 1.5)],
    ['Rockies (≥1.5 km)', box(0, 37, 50, -115, -105, 1.5)], ['Western Ghats', box(0, 8, 20, 72.5, 76)],
    ['Siberia (55–70°N, 90–140°E)', box(0, 55, 70, 90, 140)], ['Canada interior (50–65°N, 120–90°W)', box(0, 50, 65, -120, -90)],
    ['Alaska interior (62–68°N)', box(0, 62, 68, -160, -141)],
];
const PAIRS = [
    ['Patagonia', box(0, -52, -42, -76, -72), box(0, -50, -40, -71, -66)],
    ['Pacific NW / BC', box(0, 48, 58, -135, -122), box(0, 46, 56, -121, -112)],
    ['SE Alaska / Yukon', box(0, 55, 61, -145, -130), box(0, 60, 66, -139, -128)],
    ['Norway / Sweden', box(0, 58, 69, 4, 14), box(0, 58, 66, 14, 24)],
    ['NZ Southern Alps / Canterbury', box(0, -46, -41, 166, 170.5), box(0, -46, -42, 170.5, 174)],
    ['Alps / Po–Pannonia', box(0, 44, 48, 5, 16), box(0, 45, 48, 16, 22)],
    ['Iceland', box(0, 63, 67, -25, -13), null],
    ['Scotland W / E', box(0, 55.5, 59, -7, -4.5), box(0, 55.5, 58.5, -4, -1.5)],
    ['Cascades W / E (Oregon)', box(0, 42, 47, -125, -121.5), box(0, 42, 47, -121.5, -117)],
];
for (const [name, pick] of BOXES) add(group(name, pick));
for (const [name, wpick, lpick] of PAIRS) {
    const a = add(group(`${name} windward`, wpick));
    if (lpick) { const b = add(group(`${name} lee`, lpick)); out.groups.push({ name: `${name} contrast`, model: a.model && b.model ? +(a.model / b.model).toFixed(2) : null, obs: a.obs && b.obs ? +(a.obs / b.obs).toFixed(2) : null }); }
}
// the sea against GPCP: the storm tracks off the windward coasts, the tropics, the dry subtropics
const seaGroup = (name, la0, la1, lo0, lo1) => {
    let wm = 0, wo = 0, w = 0, k = 0;
    for (let c = 0; c < G; c++) {
        const la = lat(c), lo = lon(c);
        if (la < la0 || la > la1 || lo < lo0 || lo > lo1 || !(res.surface.landFrac[c] < 0.2)) continue;
        let pm = 0, po = 0;
        for (let m = 0; m < 12; m++) { pm += res.months.P[m * G + c]; po += obs.precipAll[m * G + c]; }
        if (!(pm === pm && po === po)) continue;
        const ww = Math.cos(la * Math.PI / 180); wm += ww * pm; wo += ww * po; w += ww; k++;
    }
    return add({ name: `sea: ${name}`, cells: k, model: w ? Math.round(wm / w) : null, obs: w ? Math.round(wo / w) : null, ratio: w ? +(wm / wo).toFixed(2) : null, logRms: NaN });
};
seaGroup('N Atlantic storm track', 45, 62, -45, -15); seaGroup('Norwegian Sea', 62, 70, -5, 10); seaGroup('NE Pacific', 45, 58, -155, -135);
seaGroup('Gulf of Alaska', 52, 60, -150, -138); seaGroup('SE Pacific off Patagonia', -56, -42, -100, -78); seaGroup('Southern Ocean 45–60°S', -60, -45, -180, 180);
seaGroup('North Pacific 35–50°N', 35, 50, 160, 220 - 360 + 360); seaGroup('ITCZ east Pacific', 2, 10, -150, -100); seaGroup('warm pool', -10, 10, 130, 160);
seaGroup('SE Pacific subtropics', -25, -10, -110, -85); seaGroup('Arctic Ocean', 75, 90, -180, 180);
let rMax = 0; for (let r = 0; r < n; r++) { const p = res.cell.pAnnual[r]; if (p === p && p > rMax) rMax = p; }
out.tail = { max1deg: Math.round(Math.max(...cells.map(x => x.pm))), over4k: cells.filter(x => x.pm > 4000).length, obsMax1deg: Math.round(Math.max(...cells.map(x => x.po))), obsOver4k: cells.filter(x => x.po > 4000).length, regionMax: Math.round(rMax) };
console.log(JSON.stringify(out));
const row = (g) => g.cells === undefined ? `  ${g.name.padEnd(40)}        model ${String(g.model).padStart(6)}  obs ${String(g.obs).padStart(6)}` : `  ${g.name.padEnd(40)} ${String(g.cells).padStart(5)}  model ${String(g.model).padStart(6)}  obs ${String(g.obs).padStart(6)}  ×${String(g.ratio).padEnd(5)} logRMS ${g.logRms}`;
console.error(`[${LABEL}] N=${N} ${JSON.stringify(SET)} (${out.secs} s)\n${out.groups.map(row).join('\n')}\n  tail ${JSON.stringify(out.tail)}`);
