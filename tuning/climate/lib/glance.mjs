/**
 * The glance test: what a viewer sees on a Köppen map, measured on its equirectangular picture — how much land is arid,
 * whether the equator is rain forest, whether a subtropical desert gives way to a humid east coast, whether the west
 * coasts at 30–45° are Mediterranean. Earth's observed map, measured the same way, is the target: the worlds should look
 * like it, not match it cell by cell. Used by glance-check.mjs (on rendered PNGs), planets-dry.mjs and the tune in
 * coupled-check.mjs (on each planet's cells). docs/PLAUSIBILITY_REVIEW_20261106.md.
 *
 * Metrics (shares, 0–1; of ice-free land unless said):
 *   arid, desert         B, BW
 *   Cs, Cw, Dw           dry-summer temperate, dry-winter temperate and cold
 *   Af+Am                tropical rain forest and monsoon forest
 *   E<60                 polar classes (ET, EF) equatorward of 60°, of all land
 *   eq wet, eq arid      Af+Am and B within 10° of the equator
 *   sub W/E/in arid      B at 15–35°: west coasts, east coasts, interiors
 *   mid W/E/in arid      B at 35–60° (polar classes aside)
 *   mid W marit          Cfb, Cfc, Csb, Csc on the west coasts at 35–60°
 *   Cs W                 Cs on the west coasts at 30–45°
 * A west coast is land within COAST_KM of the sea to its west, along the parallel, with at least LAND_KM of land to its
 * east; an east coast the mirror; an interior at least LAND_KM from the sea both ways.
 * The arid line's target is not Earth's own share but the share Earth's observed land has at the latitudes where the
 * world's land lies (10° bands of |latitude|): a world with more subtropical land should be more arid.
 */

import { KOPPEN_CLASSES } from '../../../v2/js/climate/koppen.js';

export const GLANCE_W = 1200, GLANCE_H = 600;
export const COAST_KM = 300, LAND_KM = 800;
export const GLANCE_COLUMNS = ['arid', 'desert', 'Cs', 'Cw', 'Dw', 'Af+Am', 'E<60', 'eq wet', 'eq arid', 'sub W arid', 'sub E arid',
    'sub in arid', 'mid W arid', 'mid E arid', 'mid in arid', 'mid W marit', 'Cs W'];
/** The lines the glance error scores: the ones that most mislead the eye (the review's table). */
export const GLANCE_LINES = ['arid', 'eq wet', 'sub E arid', 'mid E arid', 'Cs W'];
/** A line counts fully once its land is this share of the planet's ice-free land, less below (a few cells are noise). */
export const GLANCE_FULL_AREA = 0.02;
const BAND_DEG = 10, BANDS = 9;

const CODE = KOPPEN_CLASSES.map(k => k.code);
const starts = (k, pre) => pre.some(p => CODE[k].startsWith(p));
const MARITIME = new Set(['Cfb', 'Cfc', 'Csb', 'Csc']);

/** Each pixel's nearest cell (equirectangular, W × H): cells hashed into a 3D grid over the unit cube, each pixel
 *  searching its voxel and the 26 around it. axes: 'y-up' (V1: y north, lon = atan2(x, z)) or 'z-up' (Evolution). */
export function pixelToCell(xyz, axes, W = GLANCE_W, H = GLANCE_H) {
    const n = xyz.length / 3, G = 96, vox = (v) => Math.min(G - 1, Math.max(0, Math.floor((v + 1) / 2 * G)));
    const head = new Int32Array(G * G * G).fill(-1), next = new Int32Array(n);
    for (let r = 0; r < n; r++) { const k = (vox(xyz[3 * r]) * G + vox(xyz[3 * r + 1])) * G + vox(xyz[3 * r + 2]); next[r] = head[k]; head[k] = r; }
    const map = new Int32Array(W * H), D = Math.PI / 180;
    for (let py = 0; py < H; py++) {
        const lat = (90 - (py + 0.5) * 180 / H) * D;
        for (let px = 0; px < W; px++) {
            const lon = (-180 + (px + 0.5) * 360 / W) * D;
            let x, y, z;
            if (axes === 'z-up') { x = Math.cos(lat) * Math.cos(lon); y = Math.cos(lat) * Math.sin(lon); z = Math.sin(lat); }
            else { x = Math.cos(lat) * Math.sin(lon); y = Math.sin(lat); z = Math.cos(lat) * Math.cos(lon); }
            const vx = vox(x), vy = vox(y), vz = vox(z);
            let best = -1, bd = Infinity;
            for (let a = Math.max(0, vx - 1); a <= Math.min(G - 1, vx + 1); a++)
                for (let b = Math.max(0, vy - 1); b <= Math.min(G - 1, vy + 1); b++)
                    for (let c = Math.max(0, vz - 1); c <= Math.min(G - 1, vz + 1); c++)
                        for (let r = head[(a * G + b) * G + c]; r >= 0; r = next[r]) {
                            const dx = xyz[3 * r] - x, dy = xyz[3 * r + 1] - y, dz = xyz[3 * r + 2] - z, d = dx * dx + dy * dy + dz * dz;
                            if (d < bd) { bd = d; best = r; }
                        }
            map[py * W + px] = best;
        }
    }
    return map;
}

/** The class picture of per-cell classes (0 = sea) through a pixelToCell map. */
export function rasterize(cellClass, pix) {
    const out = new Uint8Array(pix.length);
    for (let i = 0; i < pix.length; i++) out[i] = pix[i] >= 0 ? cellClass[pix[i]] : 0;
    return out;
}

/**
 * The glance metrics of a class picture (W × H, row 0 at the north pole, class 0 = sea).
 * @returns {{values: Object<string, number>, areas: Object<string, number>}} each metric's share, and the share of the
 *          ice-free land it was measured on
 */
export function glanceMetrics(cls, W = GLANCE_W, H = GLANCE_H) {
    const acc = {};
    const add = (name, w, v) => { const o = acc[name] ??= [0, 0]; o[0] += w * v; o[1] += w; };
    const dW = new Float64Array(W), dE = new Float64Array(W);
    const bandLand = new Float64Array(BANDS), bandArid = new Float64Array(BANDS);
    let freeLand = 0;
    for (let y = 0; y < H; y++) {
        const lat = 90 - (y + 0.5) * 180 / H, al = Math.abs(lat), w = Math.cos(lat * Math.PI / 180);
        const kmPx = 360 / W * 111.2 * w, row = y * W;
        // distance to the sea along the parallel, westward and eastward (wrapping): two sweeps from a sea pixel
        let s0 = -1;
        for (let x = 0; x < W; x++) if (!cls[row + x]) { s0 = x; break; }
        if (s0 < 0) { dW.fill(Infinity); dE.fill(Infinity); }
        else {
            for (let t = 1, last = s0; t <= W; t++) { const x = (s0 + t) % W; if (!cls[row + x]) last = s0 + t; else dW[x] = (s0 + t - last) * kmPx; }
            for (let t = 1, last = s0 + W; t <= W; t++) { const xx = s0 + W - t, x = xx % W; if (!cls[row + x]) last = xx; else dE[x] = (last - xx) * kmPx; }
        }
        for (let x = 0; x < W; x++) {
            const k = cls[row + x]; if (!k) continue;
            const B = starts(k, ['B']) ? 1 : 0, polar = starts(k, ['E']);
            if (al < 60) add('E<60', w, polar ? 1 : 0);
            if (CODE[k] === 'EF') continue;                             // the rest: ice-free land
            freeLand += w;
            const band = Math.min(BANDS - 1, Math.floor(al / BAND_DEG));
            bandLand[band] += w; bandArid[band] += w * B;
            add('arid', w, B); add('desert', w, starts(k, ['BW']) ? 1 : 0);
            add('Cs', w, starts(k, ['Cs']) ? 1 : 0); add('Cw', w, starts(k, ['Cw']) ? 1 : 0); add('Dw', w, starts(k, ['Dw']) ? 1 : 0);
            add('Af+Am', w, starts(k, ['Af', 'Am']) ? 1 : 0);
            if (al < 10) { add('eq wet', w, starts(k, ['Af', 'Am']) ? 1 : 0); add('eq arid', w, B); }
            const west = dW[x] <= COAST_KM && dE[x] >= LAND_KM, east = dE[x] <= COAST_KM && dW[x] >= LAND_KM, inner = dW[x] >= LAND_KM && dE[x] >= LAND_KM;
            if (al >= 15 && al < 35) {
                if (west) add('sub W arid', w, B);
                if (east) add('sub E arid', w, B);
                if (inner) add('sub in arid', w, B);
            }
            if (al >= 35 && al < 60 && !polar) {
                if (west) { add('mid W arid', w, B); add('mid W marit', w, MARITIME.has(CODE[k]) ? 1 : 0); }
                if (east) add('mid E arid', w, B);
                if (inner) add('mid in arid', w, B);
            }
            if (al >= 30 && al < 45 && west) add('Cs W', w, starts(k, ['Cs']) ? 1 : 0);
        }
    }
    const values = {}, areas = {};
    for (const [name, [s, wt]] of Object.entries(acc)) { values[name] = wt ? s / wt : NaN; areas[name] = freeLand ? wt / freeLand : 0; }
    return { values, areas, bandLand: Array.from(bandLand, v => v / (freeLand || 1)), bandArid: Array.from(bandArid, (v, b) => bandLand[b] ? v / bandLand[b] : NaN) };
}

/** The arid share the target's land has where the world's land lies (its |latitude| bands, weighted by the world's). */
export function aridTarget(m, ref) {
    let s = 0, w = 0;
    for (let b = 0; b < m.bandLand.length; b++) { const a = ref.bandArid[b]; if (m.bandLand[b] > 0 && Number.isFinite(a)) { s += m.bandLand[b] * a; w += m.bandLand[b]; } }
    return w ? s / w : ref.values.arid;
}

/**
 * How far a map's glance is from the target's (Earth observed): the mean absolute difference over GLANCE_LINES, each
 * line weighted by how much land it was measured on (full weight from GLANCE_FULL_AREA of the ice-free land).
 * @returns {{err: number, diff: Object<string, number>}} err as a share (0.05 = 5 points); diff signed, per line
 */
export function glanceError(m, ref) {
    let s = 0, sw = 0;
    const diff = {};
    for (const k of GLANCE_LINES) {
        const v = m.values[k], t = k === 'arid' ? aridTarget(m, ref) : ref.values[k];
        if (!Number.isFinite(v) || !Number.isFinite(t)) continue;         // (no land of that kind)
        const w = Math.min(1, (m.areas[k] ?? 0) / GLANCE_FULL_AREA);
        diff[k] = v - t;
        s += w * Math.abs(v - t); sw += w;
    }
    return { err: sw ? s / sw : 0, diff };
}

/** A planet's glance from planetClimate's per-cell classes; `pix` is its pixelToCell map (computed once per planet). */
export function glanceOfCells(cellClass, pix) {
    return glanceMetrics(rasterize(cellClass, pix));
}

/** "arid 36 (30) · eq wet 28 (51) · …": a map's lines beside the target's, in points. */
export function glanceLine(m, ref) {
    return GLANCE_LINES.map(k => `${k} ${fmt(m.values[k])}${ref ? ` (${fmt(k === 'arid' ? aridTarget(m, ref) : ref.values[k])})` : ''}`).join(' · ');
}
const fmt = (x) => (Number.isFinite(x) ? (100 * x).toFixed(0) : '—');
