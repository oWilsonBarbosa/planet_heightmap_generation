// Frames, packed for keeping (Phase 12): most of a frame's per-cell records are zero over the ocean and untouched land
// (a belt's records on 16 % of cells, a river's on a third, a slab's on 3 %), so a whole history held as full arrays
// is mostly zeros — 273 MB at 40K cells, 1.1 GB at 160K. A packed frame keeps each field whose background (zero, or the
// value most cells hold) makes it worth it as a bitmap of the cells that differ plus their values, in order (lossless:
// −0 and NaN are values too), and the rest whole — about 4× smaller. It reads like any frame: a field is unpacked the
// first time it is read, and only the few frames read most recently keep theirs unpacked.

import { SMALL_DEVICE } from '../core/device.js';

const CTORS = { Int8Array, Uint8Array, Int16Array, Uint16Array, Int32Array, Uint32Array, Float32Array, Float64Array };
// unpacked fields kept, the frames read most recently (~20 frames at 40K cells, 5 at 160K; a small device a third — a
// frame unpacks in milliseconds)
const UNPACKED_BYTES = SMALL_DEVICE ? 32e6 : 96e6;

/**
 * A frame's per-cell fields packed: { meta: every other property (time, plates, hotspots…), fields: { name: {type,
 * length, bits?, values} } }, and the buffers to hand over with it (postMessage transfer list).
 * @returns {{packed: Object, transfer: ArrayBuffer[]}}
 */
export function packFrame(frame) {
    const meta = {}, fields = {}, transfer = [];
    for (const [k, v] of Object.entries(frame)) {
        if (!ArrayBuffer.isView(v)) { meta[k] = v; continue; }
        // a list of cell ids in order (crustCells, the biggest field): the steps between them, a byte each
        if (v instanceof Int32Array && v.length > 1 && increasing(v)) {
            const steps = new Uint8Array(v.length - 1), far = [];
            for (let i = 1; i < v.length; i++) { const d = v[i] - v[i - 1] - 1; if (d < 255) steps[i - 1] = d; else { steps[i - 1] = 255; far.push(d); } }
            fields[k] = { type: 'Int32Array', length: v.length, first: v[0], steps, far: Int32Array.from(far) };
            transfer.push(steps.buffer, fields[k].far.buffer);
            continue;
        }
        const n = v.length, bits = new Uint8Array((n + 7) >> 3), float = v instanceof Float32Array || v instanceof Float64Array;
        // the background: the value most cells hold — zero, or −1 (no plate), or whatever a sample of the cells holds most
        // (the formation time of the first continents); a float's −0 and NaN are never the background, so unpacking
        // gives back every bit
        const bg = background(v, float);
        let nz = 0;
        if (bg === 0) { for (let i = 0; i < n; i++) { const x = v[i]; if (x !== 0 || (float && 1 / x < 0)) { bits[i >> 3] |= 1 << (i & 7); nz++; } } }
        else for (let i = 0; i < n; i++) if (v[i] !== bg) { bits[i >> 3] |= 1 << (i & 7); nz++; }
        if (bits.byteLength + nz * v.BYTES_PER_ELEMENT < 0.8 * v.byteLength) {
            const values = new v.constructor(nz);
            for (let i = 0, j = 0; i < n; i++) if (bits[i >> 3] & (1 << (i & 7))) values[j++] = v[i];
            fields[k] = { type: v.constructor.name, length: n, bg, bits, values };
            transfer.push(bits.buffer, values.buffer);
        } else {
            // (whole — handed over as its own buffer, copied if it shares one)
            const own = v.byteOffset === 0 && v.byteLength === v.buffer.byteLength ? v : v.slice();
            fields[k] = { type: v.constructor.name, length: n, values: own };
            if (!transfer.includes(own.buffer)) transfer.push(own.buffer);
        }
    }
    return { packed: { meta, fields }, transfer };
}

function increasing(v) { for (let i = 1; i < v.length; i++) if (!(v[i] > v[i - 1])) return false; return true; }

/** The value most of `v` holds, among 0, −1 and the most common in a sample (never −0 or NaN). */
function background(v, float) {
    const n = v.length, step = Math.max(1, Math.floor(n / 2000)), count = new Map();
    for (let i = 0; i < n; i += step) { const x = v[i]; if (x === x && !(x === 0 && 1 / x < 0)) count.set(x, (count.get(x) ?? 0) + 1); }
    let best = 0, most = count.get(0) ?? 0;
    for (const [x, c] of count) if (c > most) { most = c; best = x; }
    if (!float && (count.get(-1) ?? 0) > most) best = -1;
    return best;
}

/** The bytes a packed frame holds (its fields' arrays). */
export function packedBytes({ fields }) {
    let b = 0;
    for (const f of Object.values(fields)) b += f.steps ? f.steps.byteLength + f.far.byteLength : f.values.byteLength + (f.bits?.byteLength ?? 0);
    return b;
}

function unpack(f) {
    if (f.steps) {
        const out = new Int32Array(f.length), { steps, far } = f;
        out[0] = f.first;
        for (let i = 1, j = 0; i < f.length; i++) out[i] = out[i - 1] + 1 + (steps[i - 1] < 255 ? steps[i - 1] : far[j++]);
        return out;
    }
    if (!f.bits) return f.values;
    const out = new CTORS[f.type](f.length), { bits, values } = f;
    if (f.bg) out.fill(f.bg);
    for (let i = 0, j = 0; i < f.length; i++) if (bits[i >> 3] & (1 << (i & 7))) out[i] = values[j++];
    return out;
}

// the frames holding unpacked fields, least recently unpacked first, and the bytes they hold
const unpackedFrames = new Set();
let unpackedBytes = 0;

/** A frame read from its packed form: the same properties, each field unpacked when first read. */
export class PackedFrame {
    constructor({ meta, fields }) {
        // (own properties, so a field packed in another frame — a getter on the prototype — never stands in their way)
        for (const [k, v] of Object.entries(meta)) Object.defineProperty(this, k, { value: v, writable: true, enumerable: true, configurable: true });
        Object.defineProperty(this, '_packed', { value: fields });
        Object.defineProperty(this, '_open', { value: {}, writable: true });
        Object.defineProperty(this, '_openBytes', { value: 0, writable: true });
        for (const k of Object.keys(fields)) if (!Object.getOwnPropertyDescriptor(PackedFrame.prototype, k)) {
            Object.defineProperty(PackedFrame.prototype, k, { get() { return this._open[k] ?? this._unpack(k); }, enumerable: true, configurable: true });
        }
    }
    _unpack(k) {
        const f = this._packed[k];
        if (!f) return undefined;
        const out = unpack(f);
        unpackedFrames.delete(this); unpackedFrames.add(this);                     // (now the most recent)
        this._openBytes += out.byteLength; unpackedBytes += out.byteLength;
        // over budget: the frames unpacked longest ago let theirs go (read again, a field is unpacked again)
        for (const old of unpackedFrames) {
            if (unpackedBytes <= UNPACKED_BYTES || old === this) break;
            unpackedFrames.delete(old); unpackedBytes -= old._openBytes; old._open = {}; old._openBytes = 0;
        }
        return (this._open[k] = out);
    }
}
