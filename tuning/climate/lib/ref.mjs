/**
 * Loads the 1° reference fields written by regrid-references.mjs (Node side; the climate lab fetches the same
 * files over HTTP).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LatLonGrid } from '../../../v2/js/climate/grid.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REF_DIR = path.join(__dirname, '..', 'data', 'ref1deg');

export function loadReferences() {
    const mfPath = path.join(REF_DIR, 'manifest.json');
    if (!fs.existsSync(mfPath)) {
        throw new Error('References missing: run  node tuning/climate/fetch-references.mjs  then  node tuning/climate/regrid-references.mjs');
    }
    const manifest = JSON.parse(fs.readFileSync(mfPath, 'utf8'));
    const grid = new LatLonGrid(manifest.grid.stepDeg);
    const f32 = (file) => {
        const b = fs.readFileSync(path.join(REF_DIR, file));
        return new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4);
    };
    const fields = {};
    for (const [name, meta] of Object.entries(manifest.fields)) fields[name] = f32(meta.file);
    const koppen = new Uint8Array(fs.readFileSync(path.join(REF_DIR, manifest.koppen.koppen_beck.file)));
    const koppen01 = new Uint8Array(fs.readFileSync(path.join(REF_DIR, manifest.koppen.koppen_beck_0p1.file)));
    // Land cells with complete monthly T and P (where observed Köppen can be computed)
    const land = new Uint8Array(grid.size);
    for (let c = 0; c < grid.size; c++) {
        let ok = true;
        for (let m = 0; m < 12 && ok; m++) ok = fields.t2m[m * grid.size + c] === fields.t2m[m * grid.size + c]
            && fields.precip[m * grid.size + c] === fields.precip[m * grid.size + c];
        land[c] = ok ? 1 : 0;
    }
    return { manifest, grid, fields, koppen, koppen01, land };
}

/** Beck 0.1° truth class at lat/lon (degrees). 0 = sea / no data. */
export function truthAt01(koppen01, latDeg, lonDeg) {
    let i = Math.floor((lonDeg + 180) * 10), j = Math.floor((90 - latDeg) * 10);
    i = ((i % 3600) + 3600) % 3600; j = Math.max(0, Math.min(1799, j));
    return koppen01[j * 3600 + i];
}

/** Mean over a set of months (e.g. [5,6,7] = JJA) of a month-major field → Float32Array(size). */
export function seasonMean(field, size, months) {
    const out = new Float32Array(size);
    for (let c = 0; c < size; c++) {
        let s = 0;
        for (const m of months) s += field[m * size + c];
        out[c] = s / months.length;
    }
    return out;
}

export const JJA = [5, 6, 7], DJF = [11, 0, 1];
