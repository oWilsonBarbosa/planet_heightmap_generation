/**
 * Converts the downloaded observations (fetch-references.mjs) to the shared 1° climate grid
 * (v2/js/climate/grid.js): 12 monthly layers per field, Float32, NaN = no data.
 *
 *   node tuning/climate/regrid-references.mjs
 *
 * Output: tuning/climate/data/ref1deg/
 *   manifest.json            grid + per-field units/source/description
 *   <field>.f32              Float32 little-endian, 12 × 180 × 360, north-west corner first
 *   koppen_beck.u8           Beck 1991–2020 Köppen at 1° (class ids of v2/js/climate/koppen.js, 0 = sea/no data)
 *   koppen_beck_0p1.u8       the same at 0.1° (3600 × 1800), for scoring terrain cells
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fromArrayBuffer } from 'geotiff';
import { readVariable } from './lib/nc-read.mjs';
import { rawPath } from './fetch-references.mjs';
import { LatLonGrid, regridBilinear } from '../../v2/js/climate/grid.js';
import { KOPPEN_ID } from '../../v2/js/climate/koppen.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REF_DIR = path.join(__dirname, 'data', 'ref1deg');
const DAYS = [31, 28.25, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

async function regridVar(file, name, grid, map = null) {
    const v = await readVariable(rawPath(file), name);
    const layers = v.data.length / (v.lat.length * v.lon.length);
    if (layers !== 12) throw new Error(`${file}:${name} has ${layers} layers, expected 12`);
    const out = regridBilinear(v.data, v.lat, v.lon, 12, grid);
    if (map) for (let m = 0; m < 12; m++) for (let c = 0; c < grid.size; c++) {
        const k = m * grid.size + c;
        if (out[k] === out[k]) out[k] = map(out[k], m);
    }
    return { data: out, units: v.units };
}

async function readBeckKoppen(file) {
    const buf = fs.readFileSync(rawPath(file));
    const tiff = await fromArrayBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    const img = await tiff.getImage();
    const [raster] = await img.readRasters();
    const [west, south, east, north] = img.getBoundingBox();
    // Beck's legend (beck_koppen_legend.txt): 1 Af … 30 EF, in its own order → our class ids by code.
    const legend = fs.readFileSync(rawPath('beck_koppen_legend.txt'), 'utf8');
    const lut = new Uint8Array(256);
    for (const m of legend.matchAll(/^\s*(\d+):\s+(\w+)/gm)) lut[+m[1]] = KOPPEN_ID[m[2]] ?? 0;
    const w = img.getWidth(), h = img.getHeight();
    const out = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) out[i] = lut[raster[i]];
    return { data: out, w, h, bbox: [west, south, east, north] };
}

function saveF32(name, arr) { fs.writeFileSync(path.join(REF_DIR, `${name}.f32`), Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength)); }

function stats(arr) {
    let lo = Infinity, hi = -Infinity, n = 0, s = 0;
    for (const v of arr) if (v === v) { lo = Math.min(lo, v); hi = Math.max(hi, v); s += v; n++; }
    return `min ${lo.toFixed(1)}  max ${hi.toFixed(1)}  mean ${(s / n).toFixed(2)}  valid ${(100 * n / arr.length).toFixed(0)}%`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const grid = new LatLonGrid(1);
    fs.mkdirSync(REF_DIR, { recursive: true });
    const fields = {};
    const put = (name, data, units, source, desc) => {
        saveF32(name, data);
        fields[name] = { file: `${name}.f32`, units, months: 12, source, desc };
        console.log(`  ${name.padEnd(9)} ${units.padEnd(9)} ${stats(data)}`);
    };

    console.log('Regridding to 1° →', REF_DIR);
    const beckT = await regridVar('beck_1991_2020_mean_1p0.nc', 'air_temperature', grid);
    put('t2m', beckT.data, '°C', 'Beck et al. 2023, 1991–2020', 'Near-surface air temperature, land');
    const beckP = await regridVar('beck_1991_2020_mean_1p0.nc', 'precipitation', grid);
    put('precip', beckP.data, 'mm/month', 'Beck et al. 2023, 1991–2020', 'Precipitation, land');
    const gpcp = await regridVar('precip.mon.ltm.1991-2020.nc', 'precip', grid, (v, m) => v * DAYS[m]);
    put('precipAll', gpcp.data, 'mm/month', 'GPCP v2.3, 1991–2020', 'Precipitation, land and sea (2.5°)');
    const slp = await regridVar('slp.mon.ltm.1991-2020.nc', 'slp', grid);
    put('slp', slp.data, 'hPa', 'NCEP/NCAR R1, 1991–2020', 'Sea-level pressure (2.5°)');
    const u = await regridVar('uwnd.sig995.mon.ltm.1991-2020.nc', 'uwnd', grid);
    put('u10', u.data, 'm/s', 'NCEP/NCAR R1, 1991–2020', 'Near-surface eastward wind (σ 0.995, 2.5°)');
    const v = await regridVar('vwnd.sig995.mon.ltm.1991-2020.nc', 'vwnd', grid);
    put('v10', v.data, 'm/s', 'NCEP/NCAR R1, 1991–2020', 'Near-surface northward wind (σ 0.995, 2.5°)');
    if (fs.existsSync(rawPath('air.sig995.mon.ltm.1991-2020.nc'))) {
        const air = await regridVar('air.sig995.mon.ltm.1991-2020.nc', 'air', grid, x => (x > 150 ? x - 273.15 : x));
        put('airNear', air.data, '°C', 'NCEP/NCAR R1, 1991–2020', 'Near-surface air temperature, land and sea (σ 0.995, 2.5°)');
    } else console.log('  airNear   (skipped: air.sig995 not downloaded — circulation-check.mjs falls back to Beck land + OISST sea)');
    // The OISST long-term mean fills land with interpolated values; the sea-ice file is masked to the ocean,
    // so its valid cells are the ocean mask for both.
    const ice = await regridVar('icec.ltm.1991-2020.nc', 'icec', grid, x => Math.max(0, Math.min(1, x / 100)));
    const sst = await regridVar('sst.ltm.1991-2020.nc', 'sst', grid);
    for (let k = 0; k < sst.data.length; k++) if (ice.data[k] !== ice.data[k]) sst.data[k] = NaN;
    put('sst', sst.data, '°C', 'NOAA OISST v2, 1991–2020', 'Sea-surface temperature');
    put('seaIce', ice.data, 'fraction', 'NOAA OISST v2, 1991–2020', 'Sea-ice concentration');

    // Köppen truth
    const k1 = await readBeckKoppen('beck_koppen_1991_2020_1p0.tif');
    const k01 = await readBeckKoppen('beck_koppen_1991_2020_0p1.tif');
    for (const [k, name, w, h] of [[k1, 'koppen_beck', 360, 180], [k01, 'koppen_beck_0p1', 3600, 1800]]) {
        if (k.w !== w || k.h !== h) throw new Error(`${name}: expected ${w}×${h}, got ${k.w}×${k.h}`);
        if (Math.abs(k.bbox[0] + 180) > 1e-3 || Math.abs(k.bbox[3] - 90) > 1e-3) throw new Error(`${name}: unexpected bbox ${k.bbox}`);
        fs.writeFileSync(path.join(REF_DIR, `${name}.u8`), k.data);
        let land = 0; for (const c of k.data) if (c) land++;
        console.log(`  ${name.padEnd(16)} ${w}×${h}  land ${(100 * land / k.data.length).toFixed(1)}%`);
    }

    const manifest = {
        grid: { stepDeg: 1, w: grid.w, h: grid.h, order: 'month-major; rows north→south from 89.5°; columns west→east from −179.5°' },
        months: 'index 0 = January',
        fields,
        koppen: {
            koppen_beck: { file: 'koppen_beck.u8', w: 360, h: 180, source: 'Beck et al. 2023, 1991–2020, 1°' },
            koppen_beck_0p1: { file: 'koppen_beck_0p1.u8', w: 3600, h: 1800, source: 'Beck et al. 2023, 1991–2020, 0.1°' },
            classIds: 'v2/js/climate/koppen.js KOPPEN_CLASSES (same order as V1 js/koppen.js)',
        },
        licences: 'Beck: CC BY 4.0 (cite Beck et al. 2023, Sci. Data 10:724). NOAA PSL datasets: public domain.',
    };
    fs.writeFileSync(path.join(REF_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));
    console.log('Done.');
}
