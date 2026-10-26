/**
 * Mountains and rain on synthetic planets: a flat mid-latitude continent (20–60°N, 80° wide, the westerlies) with
 * north–south ridges of known height and width, and the annual rain across them (35–45°N, the 1° grid) — windward
 * slopes, crests, lee. Does a higher mountain wring out more rain? Does a range upwind shadow the next?
 *
 *   node tuning/climate/diag-ridges.mjs [--n 160000] [--cells] [--set KEY=value,…]   (--cells: also the terrain cells')   (CORE='{…}' for core options)
 */

import './lib/earth-context.mjs';                                   // (hands V1's sphere-mesh its Delaunator)
import { buildSphere } from '../../js/sphere-mesh.js';
import { makeRng } from '../../js/rng.js';
import { planetClimate } from '../../v2/js/climate/climate.js';
import { setParams } from '../../v2/js/climate/config.js';
import { TEST_PLANETS, buildTestPlanet, testPlanetHeightKm } from '../../v2/js/climate/test-planets.js';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const argSet = process.argv.indexOf('--set');
if (argSet > 0) setParams(Object.fromEntries(process.argv[argSet + 1].split(',').map(kv => { const [k, v] = kv.split('='); return [k, +v]; })));
const N = +arg('--n', 160000), CELLS = process.argv.includes('--cells');
const CORE = process.env.CORE ? JSON.parse(process.env.CORE) : {};
const ridge = (lon, heightKm, halfWidthDeg = 2.5) => ({ lat0: 24, lat1: 56, lon, halfWidthDeg, heightKm });
const CASES = {
    flat:         [],
    low:          [ridge(-20, 1.5)],
    high:         [ridge(-20, 3)],
    highWide:     [ridge(-20, 3, 5)],
    lowThenHigh:  [ridge(-28, 1.5), ridge(-12, 3)],
    highThenLow:  [ridge(-28, 3), ridge(-12, 1.5)],
};
const LON0 = -40, LON1 = 30, STEP = 2;
console.log(`Annual rain (mm/yr) at 35–45°N across the continent (west coast at 40°W), every ${STEP}° of longitude; heights in km`);
let header = 'lon      '; for (let lo = LON0; lo <= LON1; lo += STEP) header += String(lo).padStart(6);
console.log(header);
for (const [name, ridges] of Object.entries(CASES)) {
    TEST_PLANETS[name] = { label: name, blobs: [{ lat: 40, lon: 0, a: 20, b: 40 }], ridges };
    const p = buildTestPlanet(name, N, buildSphere, makeRng(7));
    const res = planetClimate({ xyz: p.xyz, elevKm: p.elevKm, axes: p.axes }, CORE);
    const g = res.grid, G = g.size, P = res.months.P;
    let hRow = 'height   ', pRow = `${name.padEnd(9)}`, cRow = '  cells  ', sum = 0;
    const { lat, lon, pAnnual } = res.cell;
    for (let lo = LON0; lo <= LON1; lo += STEP) {
        let s = 0, n = 0;
        for (let la = 35.5; la <= 44.5; la += 1) { const c = g.cellAt(la, lo + 0.5); for (let m = 0; m < 12; m++) s += P[m * G + c]; n++; }
        pRow += (s / n).toFixed(0).padStart(6); sum += s / n;
        hRow += testPlanetHeightKm(name, 40, lo).toFixed(1).padStart(6);
        // the terrain cells (with the finishing's rain by height and texture): within ±1° of this longitude
        let cs = 0, cn = 0;
        for (let r = 0; r < lat.length; r++) if (lat[r] >= 35 && lat[r] <= 45 && Math.abs(lon[r] - lo) <= 1 && pAnnual[r] === pAnnual[r]) { cs += pAnnual[r]; cn++; }
        cRow += (cn ? (cs / cn).toFixed(0) : '—').padStart(6);
    }
    console.log(hRow); console.log(pRow + `   mean ${(sum / ((LON1 - LON0) / STEP + 1)).toFixed(0)}`);
    if (CELLS) console.log(cRow);
}
