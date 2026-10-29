/**
 * Earth's hypsometry — how much of its land lies below each height, and of its sea floor above each depth — from
 * ETOPO 2022 (NOAA NCEI, 60 arc-second surface elevation, public domain; doi:10.25921/fd45-gt74), for js/earth-relief.js.
 * It reads one sample every 6 arc-minutes (~11 km) through the NCEI THREDDS server's OPeNDAP service — a 26 MB
 * download instead of the whole grid's 233 million values — into tuning/relief/data/ (gitignored), then weighs each
 * sample by its area (cos latitude):
 *   land  above sea level, Antarctica left out (its height is the thickness of its ice, not relief)
 *   sea   at or below sea level, every latitude
 * and prints both quantile tables (201 values, every half per cent) as earth-relief.js holds them, with a summary.
 *
 *   node tuning/relief/fetch-etopo.mjs          # fetch if missing, then the tables
 *   node tuning/relief/fetch-etopo.mjs --force  # fetch again
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(__dirname, 'data'), FILE = path.join(DATA, 'etopo2022-60s-every6.dods');
const NLAT = 10800, NLON = 21600, STRIDE = 6, ROWS = NLAT / STRIDE, COLS = NLON / STRIDE;
const URL = 'https://www.ngdc.noaa.gov/thredds/dodsC/global/ETOPO2022/60s/60s_surface_elev_netcdf/ETOPO_2022_v1_60s_N90W180_surface.nc.dods'
    + `?z.z[0:${STRIDE}:${NLAT - 1}][0:${STRIDE}:${NLON - 1}]`;

fs.mkdirSync(DATA, { recursive: true });
if (process.argv.includes('--force') || !fs.existsSync(FILE)) {
    const res = await fetch(URL);
    if (!res.ok) throw new Error(`ETOPO: HTTP ${res.status}`);
    fs.writeFileSync(FILE, Buffer.from(await res.arrayBuffer()));
    console.log(`downloaded ${(fs.statSync(FILE).size / 1e6).toFixed(1)} MB`);
}
// (a DAP2 binary response: its structure as text, "Data:", then the array — its length twice, then big-endian floats)
const raw = fs.readFileSync(FILE), at = raw.indexOf('\nData:\n') + 7;
if (at < 7) throw new Error('ETOPO: not a DAP2 response');
const n = raw.readUInt32BE(at);
if (n !== ROWS * COLS) throw new Error(`ETOPO: ${n} values, expected ${ROWS * COLS}`);

// ── area-weighted histograms, 1 m bins ──
const LAND_MAX = 9000, SEA_MAX = 11500, land = new Float64Array(LAND_MAX + 1), sea = new Float64Array(SEA_MAX + 1);
for (let i = 0; i < ROWS; i++) {
    const lat = 90 - (i * STRIDE + 0.5) / 60, w = Math.cos(lat * Math.PI / 180);
    for (let j = 0; j < COLS; j++) {
        const z = raw.readFloatBE(at + 8 + 4 * (i * COLS + j));
        if (!(z > -20000)) continue;                                          // (the fill value)
        if (z > 0) { if (lat >= -60) land[Math.min(LAND_MAX, Math.floor(z))] += w; }
        else sea[Math.min(SEA_MAX, Math.floor(-z))] += w;
    }
}
/** The height at each half per cent of a histogram's weight, interpolated within its 1 m bins (km, 3 decimals). */
function quantiles(hist) {
    const total = hist.reduce((s, x) => s + x, 0), out = [];
    let acc = 0, b = 0;
    for (let k = 0; k <= 200; k++) {
        const target = total * k / 200;
        while (b < hist.length - 1 && acc + hist[b] < target) acc += hist[b++];
        const f = hist[b] > 0 ? Math.min(1, Math.max(0, (target - acc) / hist[b])) : 0;
        out.push(+((b + f) / 1000).toFixed(3));
    }
    return out;
}
const L = quantiles(land), S = quantiles(sea);
const share = (hist, x) => { let a = 0, t = 0; for (let b = 0; b < hist.length; b++) { t += hist[b]; if (b < x) a += hist[b]; } return a / t; };
const mean = (hist) => { let a = 0, t = 0; for (let b = 0; b < hist.length; b++) { t += hist[b]; a += hist[b] * (b + 0.5); } return a / t; };
console.log(`land (without Antarctica): mean ${mean(land).toFixed(0)} m, median ${(1000 * L[100]).toFixed(0)} m; below `
    + [10, 50, 100, 200, 500, 1000, 2000, 3000].map(x => `${x} m ${(100 * share(land, x)).toFixed(1)} %`).join(', '));
console.log(`sea: mean depth ${mean(sea).toFixed(0)} m, median ${(1000 * S[100]).toFixed(0)} m; shallower than `
    + [200, 1000, 2000, 3000, 4000, 5000, 6000].map(x => `${x} m ${(100 * share(sea, x)).toFixed(1)} %`).join(', '));
fs.writeFileSync(path.join(DATA, 'hypsometry.json'), JSON.stringify({ landKm: L, seaDepthKm: S }));
console.log(`\nconst EARTH_LAND_KM = [${L.join(', ')}];\nconst EARTH_SEA_DEPTH_KM = [${S.join(', ')}];`);
