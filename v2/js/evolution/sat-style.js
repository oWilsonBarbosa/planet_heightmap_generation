// The Satellite view's height colours: each family of climates has its own colour by height — its lowland colour, held
// (a little darker) up to its tree line, then the mountains' dark grey-red rock with a little of the biome under it, grey
// rock higher up, and snow above its snow line — a summer and a winter version (the lines lower in winter; a savanna
// green in its wet summer and golden in its dry winter, a Mediterranean coast green in its wet winter).
//
//   · the families blend across their edges (each one's share of the land within ~RAMP_BLEND_KM), the edges warped by
//     fractal noise so they interlock rather than fade in a band; an ice sheet keeps its own sharp edge;
//   · a place takes its own season's colours by its latitude — summer in July north of the equator, in January south of
//     it — blending into the even mean of the two toward the equator (full from SEASON_FULL_DEG), so nothing flips at a
//     line; the year: the even mean;
//   · the realistic picture's fine detail (rock, mottling, the relief's texture) is kept: its brightness against its own
//     blurred self, laid over the height colours; and its snow, where the climate has snow in the season shown;
//   · the rivers green their banks by how dry the climate and the season are (none under snow);
//   · cold dry climates (a polar desert) take the tundra's colours, not sand's;
//   · and SAT_REALISTIC_SHARE of the realistic picture itself over all, for its texture.
//
// The picture is built once per finished moment and season, at the climate picture's own size, and kept.

import { KOPPEN_CLASSES } from '../climate/koppen.js';
import { statValue } from '../climate/cell-stats.js';

/** sRGB colours. low: [at the coast, at LOW_KM] per season; tree, snow: [starts, full] km per season; rip: how much the
 *  rivers green the land (its dryness) per season. */
const LOW_KM = 1.0;
export const RAMP_FAMILIES = [
    { name: 'rainforest', codes: ['Af', 'Am'],
        summer: { low: [[36, 98, 40], [62, 108, 52]], tree: [2.6, 3.6], snow: [4.6, 5.4], rip: 0 },
        winter: { low: [[40, 98, 42], [66, 106, 54]], tree: [2.6, 3.6], snow: [4.6, 5.4], rip: 0 } },
    { name: 'savanna', codes: ['Aw', 'As'],
        summer: { low: [[112, 146, 62], [130, 136, 74]], tree: [2.2, 3.2], snow: [4.4, 5.2], rip: 0.3 },
        winter: { low: [[170, 162, 88], [158, 142, 86]], tree: [2.2, 3.2], snow: [4.4, 5.2], rip: 0.8 } },
    { name: 'desert', codes: ['BWh', 'BWk'],
        summer: { low: [[230, 204, 150], [202, 156, 104]], tree: [1.0, 2.2], snow: [4.6, 5.6], rip: 1 },
        winter: { low: [[226, 200, 148], [198, 152, 102]], tree: [1.0, 2.2], snow: [3.6, 4.6], rip: 1 } },
    { name: 'steppe', codes: ['BSh', 'BSk'],
        summer: { low: [[168, 172, 102], [162, 148, 98]], tree: [1.6, 2.6], snow: [4.0, 5.0], rip: 0.8 },
        winter: { low: [[198, 180, 130], [176, 154, 110]], tree: [1.6, 2.6], snow: [3.0, 4.0], rip: 0.6 } },
    { name: 'mediterranean', codes: ['Csa', 'Csb', 'Csc'],
        summer: { low: [[178, 162, 98], [150, 138, 92]], tree: [1.6, 2.6], snow: [3.4, 4.2], rip: 0.8 },
        winter: { low: [[116, 146, 76], [116, 124, 84]], tree: [1.6, 2.6], snow: [2.4, 3.2], rip: 0.3 } },
    { name: 'temperate', codes: ['Cfa', 'Cfb', 'Cfc', 'Cwa', 'Cwb', 'Cwc'],
        summer: { low: [[84, 140, 60], [94, 122, 68]], tree: [1.6, 2.6], snow: [3.0, 3.8], rip: 0.25 },
        winter: { low: [[118, 126, 84], [116, 114, 88]], tree: [1.6, 2.6], snow: [2.0, 2.8], rip: 0.3 } },
    { name: 'continental', codes: ['Dfa', 'Dfb', 'Dwa', 'Dwb', 'Dsa', 'Dsb'],
        summer: { low: [[86, 130, 62], [98, 112, 78]], tree: [1.4, 2.2], snow: [2.6, 3.2], rip: 0.3 },
        winter: { low: [[128, 122, 100], [130, 124, 108]], tree: [1.2, 2.0], snow: [1.4, 2.0], rip: 0 } },
    { name: 'taiga', codes: ['Dfc', 'Dfd', 'Dwc', 'Dwd', 'Dsc', 'Dsd'],
        summer: { low: [[56, 96, 62], [80, 100, 80]], tree: [1.0, 1.8], snow: [2.0, 2.6], rip: 0.15 },
        winter: { low: [[74, 92, 80], [96, 104, 96]], tree: [0.8, 1.4], snow: [1.0, 1.6], rip: 0 } },
    { name: 'tundra', codes: ['ET'],
        summer: { low: [[108, 130, 90], [132, 138, 116]], tree: [0.5, 1.2], snow: [1.2, 1.8], rip: 0.2 },
        winter: { low: [[160, 166, 150], [186, 190, 180]], tree: [0.4, 1.0], snow: [0.4, 1.0], rip: 0 } },
    { name: 'ice', codes: ['EF'],
        summer: { low: [[226, 232, 240], [238, 242, 248]], tree: [9, 9.5], snow: [9, 9.5], rip: 0 },
        winter: { low: [[232, 236, 244], [242, 245, 250]], tree: [9, 9.5], snow: [9, 9.5], rip: 0 } },
];
/** The mountains' rock: dark grey with a little red at the tree line, grey higher up; a share of the biome's colour under
 *  it; the snow. The rivers' green banks. */
export const ROCK_LOW = [84, 74, 72], ROCK_HIGH = [134, 130, 128], BIOME_UNDER_ROCK = 0.25, SNOW = [244, 244, 248];
export const RIP_GREEN = { summer: [72, 118, 54], winter: [98, 112, 74] };
export const RAMP_BLEND_KM = 60, SEASON_FULL_DEG = 25, WARP_KM = 70, WARP_FEATURE_KM = 400;
export const DETAIL_KM = 30, DETAIL_STRENGTH = 0.85, RIP_KM = 25, RIP_MIN_Q = 15;
/** The realistic picture's share of the styled one (its texture), and the relief shading's strength on it. */
export const SAT_REALISTIC_SHARE = 0.25, SAT_SHADE = 1.15;
/** A cold dry climate looks like tundra, not sand: its share goes to the tundra's colours as its warmest month falls from
 *  COLD_DRY_C[0] to [1] (≈ the year's mean + half its range), or its year from COLD_DRY_YEAR_C[0] to [1]. */
export const COLD_DRY_C = [13, 8], COLD_DRY_YEAR_C = [1, -6];

const NF = RAMP_FAMILIES.length;
const familyOfClass = KOPPEN_CLASSES.map(k => RAMP_FAMILIES.findIndex(f => f.codes.includes(k.code)));
const fam = (n) => RAMP_FAMILIES.findIndex(f => f.name === n);
const TUNDRA = fam('tundra'), ICE = fam('ice'), DRY = new Set([fam('desert'), fam('steppe')]);

// linear light ↔ sRGB, by tables
const LIN = Float32Array.from({ length: 256 }, (_, v) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
const SRGB_N = 4096, SRGB = Float32Array.from({ length: SRGB_N + 1 }, (_, k) => { const l = k / SRGB_N, c = l <= 0.0031308 ? 12.92 * l : 1.055 * l ** (1 / 2.4) - 0.055; return 255 * c; });
export const toLin = (v) => LIN[v | 0];
export const toSrgb = (l) => SRGB[Math.max(0, Math.min(SRGB_N, Math.round(l * SRGB_N)))];
const linOf = (rgb) => rgb.map(v => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
const sm = (a, b, x) => { if (a === b) return x < a ? 0 : 1; const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };   // (a step where the ends meet)

// each family's two seasons as tables in linear light, every STEP_KM up to TOP_KM: [family][0 summer, 1 winter]
const STEP_KM = 0.025, TOP_KM = 7, NS = Math.round(TOP_KM / STEP_KM) + 1;
const TABLE = new Float32Array(NF * 2 * NS * 3), RIP = new Float32Array(NF * 2);
{
    const rL = linOf(ROCK_LOW), rH = linOf(ROCK_HIGH), sn = linOf(SNOW);
    RAMP_FAMILIES.forEach((f, g) => [f.summer, f.winter].forEach((P, q) => {
        RIP[g * 2 + q] = P.rip;
        const c0 = linOf(P.low[0]), c1 = linOf(P.low[1]);
        for (let s = 0; s < NS; s++) {
            const km = s * STEP_KM, o = ((g * 2 + q) * NS + s) * 3;
            const tl = sm(0, LOW_KM, km), dark = 1 - 0.12 * sm(LOW_KM, P.tree[0], km);
            const rt = sm(P.tree[0], P.tree[1], km), rh = sm(P.tree[0], P.snow[0], km), st = sm(P.snow[0], P.snow[1], km);
            for (let c = 0; c < 3; c++) {
                const base = (c0[c] + (c1[c] - c0[c]) * tl) * dark;
                const rock = (rL[c] + (rH[c] - rL[c]) * rh) * (1 - BIOME_UNDER_ROCK) + base * BIOME_UNDER_ROCK;
                const v = base + (rock - base) * rt;
                TABLE[o + c] = v + (sn[c] - v) * st;
            }
        }
    }));
}

/** How much of its summer a place at `latDeg` is in, for the view `season` ('year', 'jan', 'jul'): 0.5 at the equator and
 *  in the year's view, to 1 (summer) or 0 (winter) from SEASON_FULL_DEG — smooth, flat through the equator. */
export function summerShare(latDeg, season) {
    if (season === 'year') return 0.5;
    const x = Math.min(1, Math.abs(latDeg) / SEASON_FULL_DEG), s = Math.sign(latDeg) * x * x * (3 - 2 * x);
    return 0.5 + 0.5 * (season === 'jul' ? s : -s);
}

// ── value noise, 2-D, wrapping east–west: fractal (fbm) ──
function hash(i, j) { let h = (i * 374761393 + j * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function vnoise(x, y, period) {
    const i0 = Math.floor(x), j0 = Math.floor(y), fx = x - i0, fy = y - j0, ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
    const a = ((i0 % period) + period) % period, b = (a + 1) % period;
    const v00 = hash(a, j0), v10 = hash(b, j0), v01 = hash(a, j0 + 1), v11 = hash(b, j0 + 1);
    return v00 + (v10 - v00) * ux + (v01 - v00) * uy + (v00 - v10 - v01 + v11) * ux * uy;
}
function fbm(x, y, period, oct = 4) { let s = 0, a = 0.5, t = 0; for (let o = 0; o < oct; o++, a *= 0.5) { const k = 2 ** o; s += a * vnoise(x * k, y * k, period * k); t += a; } return s / t; }

/** Box-blur a w × h field in place (rows wrap; columns clamp), radius r cells, `passes` times. */
function boxBlur(a, w, h, r, passes = 2) {
    const tmp = new Float32Array(Math.max(w, h));
    for (let p = 0; p < passes; p++) {
        for (let y = 0; y < h; y++) {
            const o = y * w; let s = 0;
            for (let d = -r; d <= r; d++) s += a[o + ((d % w) + w) % w];
            for (let x = 0; x < w; x++) { tmp[x] = s / (2 * r + 1); s += a[o + (x + r + 1) % w] - a[o + ((x - r) % w + w) % w]; }
            for (let x = 0; x < w; x++) a[o + x] = tmp[x];
        }
        for (let x = 0; x < w; x++) {
            let s = 0, n = 0;
            for (let d = 0; d <= r && d < h; d++) { s += a[d * w + x]; n++; }
            for (let y = 0; y < h; y++) {
                tmp[y] = s / n;
                const add = y + r + 1, rem = y - r;
                if (add < h) { s += a[add * w + x]; n++; }
                if (rem >= 0) { s -= a[rem * w + x]; n--; }
            }
            for (let y = 0; y < h; y++) a[y * w + x] = tmp[y];
        }
    }
}

/** Each family's share of the land around every pixel (on a grid ≤ 1024 wide, blurred), cached per climate picture. */
const shareCache = new WeakMap();
function sharesOf(R) {
    let S = shareCache.get(R);
    if (S) return S;
    const f = Math.max(1, Math.round(R.w / 1024)), gw = Math.ceil(R.w / f), gh = Math.ceil(R.h / f), N = gw * gh;
    const share = new Float32Array(NF * N), tr = R.stats?.tRange;
    for (let y = 0; y < R.h; y++) for (let x = 0; x < R.w; x++) {
        const i = y * R.w + x, k = R.koppen[i]; if (!k) continue;
        const g = familyOfClass[k]; if (g < 0 || g === ICE) continue;
        const c = ((y / f) | 0) * gw + ((x / f) | 0);
        let cold = 0;
        if (DRY.has(g)) {
            const tA = R.tAnnual[i] / 100, range = tr ? statValue(tr, 'tRange', i) : NaN, warmest = tA + (range === range ? range / 2 : 8);
            cold = sm(0, 1, Math.max((COLD_DRY_C[0] - warmest) / (COLD_DRY_C[0] - COLD_DRY_C[1]), (COLD_DRY_YEAR_C[0] - tA) / (COLD_DRY_YEAR_C[0] - COLD_DRY_YEAR_C[1])));
        }
        share[g * N + c] += 1 - cold;
        if (cold > 0) share[TUNDRA * N + c] += cold;
    }
    const pxKm = 2 * Math.PI * 6371 / gw, r = Math.max(1, Math.round(RAMP_BLEND_KM / pxKm / 2));
    for (let g = 0; g < NF; g++) if (g !== ICE) boxBlur(share.subarray(g * N, (g + 1) * N), gw, gh, r);
    S = { f, gw, gh, N, share, pxKm };
    shareCache.set(R, S);
    return S;
}

/** The rivers' banks: how much of each pixel of the climate picture is riverside, 0…1 (by the river's size), cached. */
const ripCache = new WeakMap();
function riversideOf(R, rivers) {
    if (!rivers) return null;
    let M = ripCache.get(rivers);
    if (M) return M;
    const w = R.w, h = R.h, pxKm = 2 * Math.PI * 6371 / w, m = new Float32Array(w * h);
    const { start, lat, lon, q } = rivers, starts = [...start, lat.length];
    const splat = (x, y, rad, v) => {
        const r = Math.ceil(rad);
        for (let dy = -r; dy <= r; dy++) {
            const yy = y + dy; if (yy < 0 || yy >= h) continue;
            for (let dx = -r; dx <= r; dx++) {
                const d = Math.hypot(dx, dy); if (d > rad) continue;
                const c = yy * w + ((x + dx) % w + w) % w, a = v * (1 - d / (rad + 1));
                if (a > m[c]) m[c] = a;
            }
        }
    };
    const lq0 = Math.log10(RIP_MIN_Q);
    for (let s = 0; s < starts.length - 1; s++) for (let i = starts[s]; i < starts[s + 1] - 1; i++) {
        if (!(q[i] >= RIP_MIN_Q)) continue;
        const x0 = (lon[i] + 180) / 360 * w, y0 = (90 - lat[i]) / 180 * h, x1 = (lon[i + 1] + 180) / 360 * w, y1 = (90 - lat[i + 1]) / 180 * h;
        if (Math.abs(x1 - x0) > w / 2) continue;
        const big = sm(lq0, lq0 + 2.5, Math.log10(q[i])), rad = (RIP_KM * (0.6 + 1.4 * big)) / pxKm, v = 0.55 + 0.45 * big;
        const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
        for (let k = 0; k <= n; k++) splat(Math.round(x0 + (x1 - x0) * k / n), Math.round(y0 + (y1 - y0) * k / n), rad, v);
    }
    boxBlur(m, w, h, 1, 1);
    ripCache.set(rivers, m);
    return m;
}

/** The styled picture of a finished moment for a season: sRGB bytes per pixel of its climate picture R (land), cached.
 *  `heightM` (m): the finished heights, `hw` wide (a whole multiple of R's width); `rivers`: the finished rivers. */
const styledCache = new WeakMap();
export function styledSatellite(R, season, heightM, hw, rivers) {
    let byS = styledCache.get(R);
    if (!byS) styledCache.set(R, byS = new Map());
    if (byS.has(season)) return byS.get(season);
    const w = R.w, h = R.h, f = Math.max(1, Math.round(hw / w)), S = R.sat[season], sh = sharesOf(R), rip = riversideOf(R, rivers);
    // (the realistic picture's detail: its brightness against its blurred self, over the land)
    const Y = new Float32Array(w * h), Yb = new Float32Array(w * h), L = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) if (R.koppen[i]) { const o = 3 * i; Y[i] = 0.2126 * LIN[S[o]] + 0.7152 * LIN[S[o + 1]] + 0.0722 * LIN[S[o + 2]]; Yb[i] = Y[i]; L[i] = 1; }
    const rD = Math.max(1, Math.round(DETAIL_KM / (2 * Math.PI * 6371 / w) / 2));
    boxBlur(Yb, w, h, rD); boxBlur(L, w, h, rD);
    const out = new Uint8Array(3 * w * h), col = [0, 0, 0], N = sh.N, period = Math.max(4, Math.round(2 * Math.PI * 6371 / WARP_FEATURE_KM));
    const warpCells = WARP_KM / sh.pxKm, gS = linOf(RIP_GREEN.summer), gW = linOf(RIP_GREEN.winter);
    for (let y = 0; y < h; y++) {
        const latDeg = 90 - 180 * (y + 0.5) / h, ss = summerShare(latDeg, season), ws = 1 - ss, v = (y + 0.5) / h * period / 2;
        const ripG = [0, 1, 2].map(c => ss * gS[c] + ws * gW[c]);
        for (let x = 0; x < w; x++) {
            const i = y * w + x, k = R.koppen[i]; if (!k) continue;
            const hm = heightM[y * f * hw + x * f], hKm = hm > 0 ? hm / 1000 : 0, s = Math.min(NS - 1, Math.round(hKm / STEP_KM));
            const own = familyOfClass[k];
            col[0] = col[1] = col[2] = 0;
            let tot = 0, dry = 0;
            const add = (g, wt) => {
                const a = ((g * 2) * NS + s) * 3, b = a + NS * 3;
                col[0] += wt * (ss * TABLE[a] + ws * TABLE[b]); col[1] += wt * (ss * TABLE[a + 1] + ws * TABLE[b + 1]); col[2] += wt * (ss * TABLE[a + 2] + ws * TABLE[b + 2]);
                dry += wt * (ss * RIP[g * 2] + ws * RIP[g * 2 + 1]);
            };
            if (own === ICE) { add(ICE, 1); tot = 1; }
            else {
                // (the shares where the noise moves this pixel — the climates' edges interlock)
                const u = (x + 0.5) / w * period;
                const gx = (x + 0.5) / sh.f + warpCells * 2 * (fbm(u, v, period) - 0.5), gy = (y + 0.5) / sh.f + warpCells * 2 * (fbm(u + 17.3, v + 9.1, period) - 0.5);
                const X = gx - 0.5, Yc = Math.max(0, Math.min(sh.gh - 1.001, gy - 0.5)), x0 = Math.floor(X), y0 = Math.floor(Yc), fx = X - x0, fy = Yc - y0;
                const c00 = y0 * sh.gw + ((x0 % sh.gw) + sh.gw) % sh.gw, c10 = y0 * sh.gw + ((x0 + 1) % sh.gw + sh.gw) % sh.gw, c01 = c00 + sh.gw, c11 = c10 + sh.gw;
                for (let g = 0; g < NF; g++) {
                    if (g === ICE) continue;
                    const o = g * N, wt = (1 - fx) * (1 - fy) * sh.share[o + c00] + fx * (1 - fy) * sh.share[o + c10] + (1 - fx) * fy * sh.share[o + c01] + fx * fy * sh.share[o + c11];
                    if (wt > 1e-4) { add(g, wt); tot += wt; }
                }
                if (tot < 1e-4) { add(Math.max(0, own), 1); tot = 1; }
            }
            col[0] /= tot; col[1] /= tot; col[2] /= tot; dry /= tot;
            // (the snow: only where the climate has snow or ice in the season shown — the year's view: in its winter)
            const cv = R.cover ? R.cover[i] : 0, snowy = (cv & 31) === 1 || (season === 'jan' ? cv & 32 : season === 'jul' ? cv & 64 : cv & 96);
            // (the rivers' green banks, by the place's dryness; none under snow)
            const rp = rip && !snowy ? rip[i] * dry : 0;
            if (rp > 0) for (let c = 0; c < 3; c++) col[c] += (ripG[c] - col[c]) * rp;
            // (the realistic picture's detail, as brightness)
            const yb = L[i] > 0 ? Yb[i] / L[i] : Y[i], rd = Math.max(0.5, Math.min(1.7, (Y[i] + 0.01) / (yb + 0.01))) ** DETAIL_STRENGTH, ratio = rd + (1 - rd) * Math.min(1, 1.5 * rp);   // (the banks' own green, not the picture's dark channel)
            const o = 3 * i, r0 = S[o], g0 = S[o + 1], b0 = S[o + 2], mn = Math.min(r0, g0, b0), mx = Math.max(r0, g0, b0);
            const white = snowy ? sm(170, 220, mn) * (1 - sm(0, 40, mx - mn)) : 0;
            for (let c = 0; c < 3; c++) {
                let Lc = col[c] * ratio;
                Lc += (LIN[S[o + c]] - Lc) * Math.max(white, SAT_REALISTIC_SHARE);
                out[o + c] = Math.round(Math.min(255, toSrgb(Math.min(1, Lc))));
            }
        }
    }
    byS.set(season, out);
    return out;
}

// ── the same colours per region of a mesh (Generate and Import's Satellite view: no realistic picture, no rivers) ──
// The families' shares on a fixed lat-lon grid (~39 km cells, blurred and noise-warped as above), sampled back at each
// region — the same blend at every detail; a gentle fractal mottling of brightness for texture; the climate's snow and
// ice sheets; the sea ice sharp and ragged, like Evolution's.
const REGION_GRID_W = 1024;
let regionNoise = null;
/**
 * @param {{n: number, xyz: Float32Array, lat: Float32Array, lon: Float32Array, elevKm: (r: number) => number,
 *          koppen: Uint8Array, tAnnual: ArrayLike<number>, tRange: ArrayLike<number>, season: 'year'|'jan'|'jul',
 *          snowAt: (r: number) => number, iceSheetAt: (r: number) => number, FastNoise: Function}} p
 *   lat/lon in degrees; koppen 0 at sea; tAnnual / tRange per region (°C; NaN at sea); snowAt: the season's snow on land 0–1.
 * @returns {Float32Array} sRGB 0–1 per land region (3 n; the sea left 0)
 */
export function satelliteRegionColors(p) {
    const { n, xyz, lat, lon, elevKm, koppen, tAnnual, tRange, season, snowAt, iceSheetAt } = p;
    regionNoise ??= new p.FastNoise(4243);
    const gw = REGION_GRID_W, gh = gw / 2, N = gw * gh, share = new Float32Array(NF * N), cellOf = new Int32Array(n);
    for (let r = 0; r < n; r++) {
        const k = koppen[r]; cellOf[r] = -1; if (!k) continue;
        const g = familyOfClass[k]; if (g < 0 || g === ICE) continue;
        const x = Math.min(gw - 1, Math.floor((lon[r] + 180) / 360 * gw)), y = Math.min(gh - 1, Math.floor((90 - lat[r]) / 180 * gh)), c = y * gw + x;
        cellOf[r] = c;
        let cold = 0;
        if (DRY.has(g)) {
            const tA = tAnnual[r], range = tRange[r], warmest = tA + (range === range ? range / 2 : 8);
            if (tA === tA) cold = sm(0, 1, Math.max((COLD_DRY_C[0] - warmest) / (COLD_DRY_C[0] - COLD_DRY_C[1]), (COLD_DRY_YEAR_C[0] - tA) / (COLD_DRY_YEAR_C[0] - COLD_DRY_YEAR_C[1])));
        }
        share[g * N + c] += 1 - cold;
        if (cold > 0) share[TUNDRA * N + c] += cold;
    }
    const pxKm = 2 * Math.PI * 6371 / gw, rB = Math.max(1, Math.round(RAMP_BLEND_KM / pxKm / 2));
    for (let g = 0; g < NF; g++) if (g !== ICE) boxBlur(share.subarray(g * N, (g + 1) * N), gw, gh, rB);
    const out = new Float32Array(3 * n), col = [0, 0, 0], period = Math.max(4, Math.round(2 * Math.PI * 6371 / WARP_FEATURE_KM)), warpCells = WARP_KM / pxKm;
    const fM1 = 6371 / 300, fM2 = 6371 / 60;
    for (let r = 0; r < n; r++) {
        const k = koppen[r]; if (!k) continue;
        const own = familyOfClass[k], h = elevKm(r), s = Math.min(NS - 1, Math.round((h > 0 ? h : 0) / STEP_KM));
        const ss = summerShare(lat[r], season), ws = 1 - ss;
        col[0] = col[1] = col[2] = 0;
        let tot = 0;
        const add = (g, wt) => {
            const a = ((g * 2) * NS + s) * 3, b = a + NS * 3;
            col[0] += wt * (ss * TABLE[a] + ws * TABLE[b]); col[1] += wt * (ss * TABLE[a + 1] + ws * TABLE[b + 1]); col[2] += wt * (ss * TABLE[a + 2] + ws * TABLE[b + 2]);
        };
        if (own === ICE) { add(ICE, 1); tot = 1; }
        else {
            const u = (lon[r] + 180) / 360 * period, v = (90 - lat[r]) / 180 * period / 2;
            const X = (lon[r] + 180) / 360 * gw - 0.5 + warpCells * 2 * (fbm(u, v, period) - 0.5);
            const Yc = Math.max(0, Math.min(gh - 1.001, (90 - lat[r]) / 180 * gh - 0.5 + warpCells * 2 * (fbm(u + 17.3, v + 9.1, period) - 0.5)));
            const x0 = Math.floor(X), y0 = Math.floor(Yc), fx = X - x0, fy = Yc - y0;
            const c00 = y0 * gw + ((x0 % gw) + gw) % gw, c10 = y0 * gw + ((x0 + 1) % gw + gw) % gw, c01 = c00 + gw, c11 = c10 + gw;
            for (let g = 0; g < NF; g++) {
                if (g === ICE) continue;
                const o = g * N, wt = (1 - fx) * (1 - fy) * share[o + c00] + fx * (1 - fy) * share[o + c10] + (1 - fx) * fy * share[o + c01] + fx * fy * share[o + c11];
                if (wt > 1e-6) { add(g, wt); tot += wt; }
            }
            if (tot < 1e-6) { add(Math.max(0, own), 1); tot = 1; }
        }
        // (texture: a gentle fractal mottling of brightness)
        const px = xyz[3 * r], py = xyz[3 * r + 1], pz = xyz[3 * r + 2];
        const mot = 1 + 0.06 * regionNoise.fbm(fM1 * px, fM1 * py, fM1 * pz, 3, 0.5) + 0.04 * regionNoise.noise3D(fM2 * px + 3.3, fM2 * py - 1.7, fM2 * pz + 5.9);
        // (the climate's snow in the season, and the ice sheets)
        const white = Math.max(sm(0.3, 0.85, snowAt(r)), sm(0.2, 0.6, iceSheetAt(r)));
        const sn = [SNOW_LIN[0], SNOW_LIN[1], SNOW_LIN[2]];
        for (let c = 0; c < 3; c++) {
            let L = col[c] / tot * mot;
            L += (sn[c] - L) * white;
            out[3 * r + c] = toSrgb(Math.min(1, Math.max(0, L))) / 255;
        }
    }
    return out;
}
const SNOW_LIN = linOf(SNOW);

/** The sea ice as Evolution draws it, per region: a sharp, noise-ragged edge on the ice fraction `c` (0–1) at unit-sphere
 *  point (x, y, z). */
export function seaIceRegion(c, x, y, z, FastNoise) {
    if (!(c > 0.04)) return 0;
    if (c > 0.96) return 1;
    regionNoise ??= new FastNoise(4243);
    const fE = 6371 / 160, fF = 6371 / 30;
    const n = 0.7 * regionNoise.fbm(fE * x, fE * y, fE * z, 3, 0.5) + 0.3 * regionNoise.noise3D(fF * x + 5.1, fF * y - 2.7, fF * z + 8.3);
    return sm(0.47, 0.53, c + 0.42 * n);
}
