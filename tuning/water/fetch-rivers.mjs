/**
 * Downloads the measured river flows that the rivers are scored against (earth-rivers.mjs): Dai & Trenberth's coastal
 * stations — the gauge nearest the mouth of each of the world's 925 largest rivers, with its monthly mean flows
 * 1900–2018, drainage area and place (NCAR GDEX dataset d551000, CC BY 4.0; Dai et al. 2009, J. Climate 22:2773–2792,
 * updated May 2019). Public, no account needed. The file lands in tuning/water/data/ (gitignored), and stations.json
 * next to it: per station its river, place, drainage area, long-term mean flow and the twelve months' mean flows.
 *
 *   node tuning/water/fetch-rivers.mjs          # fetch if missing, then convert
 *   node tuning/water/fetch-rivers.mjs --force  # re-download
 *
 * Dev-only dependency (tuning suite, never the app):  npm install --no-save netcdfjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NetCDFReader } from 'netcdfjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = path.join(__dirname, 'data');
export const STATIONS = path.join(DATA_DIR, 'stations.json');
const FILE = 'coastal-stns-Vol-monthly.updated-May2019.nc';
const URL = `https://tds.gdex.ucar.edu/thredds/fileServer/files/d551000/${FILE}`;

fs.mkdirSync(DATA_DIR, { recursive: true });
const ncPath = path.join(DATA_DIR, FILE);
if (process.argv.includes('--force') || !fs.existsSync(ncPath) || fs.statSync(ncPath).size === 0) {
    const res = await fetch(URL);
    if (!res.ok) throw new Error(`${URL}: HTTP ${res.status}`);
    fs.writeFileSync(ncPath, Buffer.from(await res.arrayBuffer()));
    console.log(`downloaded ${FILE} (${(fs.statSync(ncPath).size / 1e6).toFixed(1)} MB)`);
} else console.log(`cached ${FILE}`);

const raw = fs.readFileSync(ncPath), nc = new NetCDFReader(raw);
const dim = (name) => nc.dimensions.find(d => d.name === name).size, S = dim('station'), W = dim('chars');
const get = (k) => nc.getDataVariable(k);
// (a name read from the file's own bytes at its variable's offset — netcdfjs returns char arrays flattened past use:
// each station's W characters, up to the first NUL)
const names = (k) => {
    const v = nc.variables.find(x => x.name === k);
    return Array.from({ length: S }, (_, i) => { const b = raw.subarray(v.offset + i * W, v.offset + (i + 1) * W), z = b.indexOf(0); return b.subarray(0, z < 0 ? W : z).toString('latin1').trim(); });
};
const lat = get('lat'), lon = get('lon'), area = get('area_stn'), vol = get('vol_stn'), time = get('time'), flow = get('FLOW');
const latM = get('lat_mou'), lonM = get('lon_mou'), areaM = get('area_mou');
const river = names('riv_name'), station = names('stn_name'), country = names('ct_name'), continent = names('cn_name');
const T = time.length, at = Array.isArray(flow[0]) ? (t, s) => flow[t][s] : (t, s) => flow[t * S + s];
const out = [];
for (let s = 0; s < S; s++) {
    const sum = new Float64Array(12), n = new Uint16Array(12);
    for (let t = 0; t < T; t++) { const v = at(t, s); if (v > -900 && Number.isFinite(v)) { const m = (time[t] % 100) - 1; sum[m] += v; n[m]++; } }
    out.push({
        river: river[s], station: station[s], country: country[s], continent: continent[s], lat: lat[s], lon: lon[s], areaKm2: area[s],
        q: vol[s] > -900 ? vol[s] * 1e9 / 3.15576e7 : null,                 // (the long-term mean, m³/s)
        months: Array.from({ length: 12 }, (_, m) => (n[m] ? sum[m] / n[m] : null)), yearsPerMonth: Math.min(...n),
        mouth: { lat: latM[s], lon: lonM[s], areaKm2: areaM[s] },
    });
}
fs.writeFileSync(STATIONS, JSON.stringify(out));
console.log(`${out.length} stations (${out.filter(o => o.areaKm2 >= 25000).length} draining at least 25,000 km²) → ${path.relative(process.cwd(), STATIONS)}`);
