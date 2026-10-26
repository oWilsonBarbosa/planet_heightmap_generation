/**
 * Minimal reader for the observed-climatology files: netCDF-3 classic (via
 * netcdfjs) and netCDF-4/HDF5 (via h5wasm). Returns a variable as Float64 with
 * packing (scale_factor/add_offset) applied and fill/missing values → NaN, plus
 * its dimension names and the 1-D coordinate arrays.
 *
 * Dev-only dependencies (tuning suite, never the app):
 *   npm install --no-save h5wasm netcdfjs
 */

import fs from 'node:fs';
import { NetCDFReader } from 'netcdfjs';
import h5wasm from 'h5wasm/node';

function isHdf5(buf) {
    return buf[0] === 0x89 && buf[1] === 0x48 && buf[2] === 0x44 && buf[3] === 0x46;
}

function unpack(raw, attrs) {
    const scale = attrs.scale_factor ?? 1;
    const offset = attrs.add_offset ?? 0;
    const fills = [attrs._FillValue, attrs.missing_value].flat().filter(v => v !== undefined && v !== null);
    const out = new Float64Array(raw.length);
    for (let i = 0; i < raw.length; i++) {
        const v = Number(raw[i]);
        let missing = !Number.isFinite(v);
        for (const f of fills) if (v === Number(f)) { missing = true; break; }
        // Some files mark missing with huge sentinels (e.g. -9.96921e36)
        if (Math.abs(v) > 1e30) missing = true;
        out[i] = missing ? NaN : v * scale + offset;
    }
    return out;
}

function scalar(v) {
    if (v === undefined || v === null) return undefined;
    if (ArrayBuffer.isView(v) || Array.isArray(v)) return v.length === 1 ? Number(v[0]) : Array.from(v, Number);
    if (typeof v === 'bigint') return Number(v);
    return v;
}

/** List variables with their dimensions (for inspection). */
export async function listVariables(file) {
    const buf = fs.readFileSync(file);
    if (isHdf5(buf)) {
        await h5wasm.ready;
        const f = new h5wasm.File(file, 'r');
        try {
            return f.keys().map(k => {
                const d = f.get(k);
                const attrs = {};
                for (const [n, a] of Object.entries(d.attrs ?? {})) attrs[n] = scalar(a.value);
                return { name: k, shape: d.shape, units: attrs.units, long_name: attrs.long_name };
            });
        } finally { f.close(); }
    }
    const r = new NetCDFReader(buf);
    return r.variables.map(v => ({
        name: v.name,
        dims: v.dimensions.map(i => r.dimensions[i].name),
        units: v.attributes.find(a => a.name === 'units')?.value,
    }));
}

/**
 * Read one variable. Returns { data: Float64Array (NaN = missing), shape, units, lat, lon }.
 * lat/lon are read from the file's 'lat'/'lon' (or 'latitude'/'longitude') variables.
 */
export async function readVariable(file, name) {
    const buf = fs.readFileSync(file);
    if (isHdf5(buf)) {
        await h5wasm.ready;
        const f = new h5wasm.File(file, 'r');
        try {
            const get = (n) => f.get(n);
            const d = get(name);
            if (!d) throw new Error(`${name} not in ${file}; have ${f.keys().join(', ')}`);
            const attrs = {};
            for (const [n, a] of Object.entries(d.attrs ?? {})) attrs[n] = scalar(a.value);
            const data = unpack(d.value, attrs);
            const coord = (...names) => {
                for (const n of names) { const c = get(n); if (c) return Float64Array.from(c.value, Number); }
                return null;
            };
            return {
                data, shape: d.shape, units: attrs.units,
                lat: coord('lat', 'latitude'), lon: coord('lon', 'longitude'),
            };
        } finally { f.close(); }
    }
    const r = new NetCDFReader(buf);
    const v = r.variables.find(x => x.name === name);
    if (!v) throw new Error(`${name} not in ${file}; have ${r.variables.map(x => x.name).join(', ')}`);
    const attrs = {};
    for (const a of v.attributes) attrs[a.name] = scalar(a.value);
    const flat = r.getDataVariable(name).flat(Infinity);
    const data = unpack(flat, attrs);
    const shape = v.dimensions.map(i => r.dimensions[i].size || r.recordDimension?.length);
    const coord = (...names) => {
        for (const n of names) if (r.variables.some(x => x.name === n)) return Float64Array.from(r.getDataVariable(n).flat(Infinity), Number);
        return null;
    };
    return { data, shape, units: attrs.units, lat: coord('lat', 'latitude'), lon: coord('lon', 'longitude') };
}
