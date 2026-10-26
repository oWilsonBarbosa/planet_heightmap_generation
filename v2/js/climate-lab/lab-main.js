// Climate lab. Phase 0: real Earth observations beside V1's climate on the imported Earth, on the 1° climate grid;
// the per-stage scores, the truth-swap attribution and the few-points-in-the-year test; on-device timings.
// Phase 1–2: the new climate run live in a worker — on Earth or a test planet — with its temperature stage.
// Data comes from the tuning suite (tuning/climate/{fetch,regrid}-references.mjs, stage-audit.mjs, season-test.mjs,
// skeleton-check.mjs, temperature-check.mjs).

import { GlobeView } from '../app/globe-view.js';
import { LatLonGrid } from '../climate/grid.js';
import { KOPPEN_CLASSES } from '../climate/koppen.js';
import { RAMPS, rampColor, drawRampBar, NO_DATA_SEA, NO_DATA_LAND } from './palettes.js';

const REF = '../tuning/climate/data/ref1deg/';
const LAB = '../tuning/climate/data/lab/';
const RESULTS = '../tuning/results/climate/';
const grid = new LatLonGrid(1), G = grid.size;
const MAP_W = 1440, MAP_H = 720, PX = MAP_W / grid.w;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const $ = (id) => document.getElementById(id);
const NARROW = matchMedia('(max-width: 768px)');

// ── Data ──────────────────────────────────────────────────────────────────────
const cache = new Map();
async function fetchBin(url, Type) {
    if (cache.has(url)) return cache.get(url);
    const p = fetch(url).then(r => { if (!r.ok) throw new Error(`${r.status} ${url}`); return r.arrayBuffer(); }).then(b => new Type(b));
    cache.set(url, p);
    return p;
}
async function fetchJson(url) {
    if (cache.has(url)) return cache.get(url);
    const p = fetch(url).then(r => { if (!r.ok) throw new Error(`${r.status} ${url}`); return r.json(); });
    cache.set(url, p);
    return p;
}
const obsField = (name) => fetchBin(`${REF}${name}.f32`, Float32Array);         // 12 monthly layers
const v1Field = (name) => fetchBin(`${LAB}v1_${name}.f32`, Float32Array);       // 2 layers: JJA, DJF
const koppenMap = (file) => fetchBin(file, Uint8Array);

const SEASON_MONTHS = { JJA: [5, 6, 7], DJF: [11, 0, 1], YEAR: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] };
function obsSeason(arr, season) {
    const months = typeof season === 'number' ? [season] : SEASON_MONTHS[season];
    const out = new Float32Array(G);
    for (let c = 0; c < G; c++) { let s = 0; for (const m of months) s += arr[m * G + c]; out[c] = s / months.length; }
    return out;
}
function v1Season(arr, season) {
    if (season === 'JJA') return arr.subarray(0, G);
    if (season === 'DJF') return arr.subarray(G, 2 * G);
    const out = new Float32Array(G);
    for (let c = 0; c < G; c++) out[c] = (arr[c] + arr[G + c]) / 2;
    return out;
}
function zonalAnomaly(f) {
    const out = new Float32Array(G).fill(NaN);
    for (let j = 0; j < grid.h; j++) {
        let s = 0, n = 0;
        for (let i = 0; i < grid.w; i++) { const v = f[j * grid.w + i]; if (v === v) { s += v; n++; } }
        if (n < 5) continue;
        for (let i = 0; i < grid.w; i++) { const c = j * grid.w + i; if (f[c] === f[c]) out[c] = f[c] - s / n; }
    }
    return out;
}

// ── What can be shown ─────────────────────────────────────────────────────────
const FIELDS = {
    koppen: { label: 'Köppen' },
    t2m:    { label: 'Temperature', ramp: 'temperature', diff: 'tempDiff', landOnly: true },
    swing:  { label: 'Seasonal swing', ramp: 'swing', diff: 'swingDiff', landOnly: true, noSeason: true },
    precip: { label: 'Rain', ramp: 'rain', diff: 'rainRatio', landOnly: true, itcz: true },
    slp:    { label: 'Pressure & wind', ramp: 'pressure', diff: 'pressureDiff', arrows: true, itcz: true },
    ocean:  { label: 'Ocean warmth', seaOnly: true },
    seaIce: { label: 'Sea ice', ramp: 'seaIce', seaOnly: true },
};
const KOPPEN_SOURCES = {
    beck:  { label: 'Beck map', file: `${REF}koppen_beck_0p1.u8`, fine: true, caption: 'Real Earth — Beck et al. 2023 map (1991–2020, 0.1°)' },
    new:   { label: 'New', caption: 'New climate — per terrain cell' },
    obs12: { label: '12 months', file: `${LAB}koppen_obs12.u8`, caption: 'Real Earth — 12 observed months, new classifier' },
    obs6:  { label: '6 points', file: `${LAB}koppen_obs6.u8`, caption: 'Real Earth — rebuilt from 6 points in the year' },
    obs4:  { label: '4 points', file: `${LAB}koppen_obs4.u8`, caption: 'Real Earth — rebuilt from 4 points in the year' },
    obs2:  { label: '2 seasons', file: `${LAB}koppen_obs2.u8`, caption: 'Real Earth — rebuilt from 2 seasons' },
    v1:    { label: 'V1', file: `${LAB}v1_koppen.u8`, caption: 'V1 climate on the imported Earth (as shipped)' },
};
const SCALAR_SOURCES = { obs: 'Observed', v1: 'V1', new: 'New', diff: 'V1 − observed', diffNew: 'New − observed' };
const SEASONS = { JJA: 'Jun–Aug', DJF: 'Dec–Feb', YEAR: 'Year' };
const PLANETS = { earth: 'Earth', midlat: 'Mid-latitude continent', mountains: 'Coastal range', tropical: 'Tropical continent', supercontinent: 'Supercontinent',
    evolution: 'Evolution world', evolutionSuper: 'Evolution supercontinent' };

const state = { field: 'koppen', source: 'v1', season: 'JJA', month: null, view: 'globe', itcz: true, coast: true, planet: 'earth' };

/** Resolve one panel: { kind: 'koppen'|'scalar', values, ramp, landOnly, seaOnly, wind?, caption, note? } */
let beckFine = null;              // Beck 0.1° resampled to the map's pixels
async function beckPixels() {
    if (beckFine) return beckFine;
    const k01 = await koppenMap(KOPPEN_SOURCES.beck.file);
    beckFine = new Uint8Array(MAP_W * MAP_H);
    for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
        const sx = Math.min(3599, Math.floor((x + 0.5) * 3600 / MAP_W)), sy = Math.min(1799, Math.floor((y + 0.5) * 1800 / MAP_H));
        beckFine[y * MAP_W + x] = k01[sy * 3600 + sx];
    }
    return beckFine;
}
let newRun = null;                // the last new-climate run: { planet, label, raster, landPx, monthlyT, … }

/** Warmest minus coldest of 12 monthly layers. */
function swingOf(monthly) {
    const out = new Float32Array(G);
    for (let c = 0; c < G; c++) {
        let mx = -Infinity, mn = Infinity;
        for (let m = 0; m < 12; m++) { const v = monthly[m * G + c]; if (v > mx) mx = v; if (v < mn) mn = v; }
        out[c] = mx >= mn ? mx - mn : NaN;
    }
    return out;
}
/** Sea cells of the last run's planet on the 1° grid (from its land pixels: 4 × 4 per cell). */
function newSeaMask() {
    if (newRun.sea) return newRun.sea;
    const sea = new Uint8Array(G), f = MAP_W / grid.w;
    for (let j = 0; j < grid.h; j++) for (let i = 0; i < grid.w; i++) {
        let l = 0;
        for (let y = 0; y < f; y++) for (let x = 0; x < f; x++) l += newRun.landPx[(j * f + y) * MAP_W + i * f + x];
        sea[j * grid.w + i] = l < f * f / 2 ? 1 : 0;
    }
    return (newRun.sea = sea);
}
/** New-climate monthly temperature on the displayed planet, land only on Earth (to compare with observations). */
function newMonthlyT() {
    if (!newRun || newRun.planet !== state.planet || !newRun.monthlyT) return null;
    return newRun.monthlyT;
}

async function resolve(field, source) {
    const onEarth = state.planet === 'earth';
    const needRun = { kind: 'none', caption: 'Not run yet', note: `Run the new climate first: panel → "New climate" → ${PLANETS[state.planet]} → Run.` };
    if (!onEarth && source !== 'new') {
        return { kind: 'none', caption: 'Only the new climate exists on a test planet', note: 'A test planet has no observations or V1 climate — pick the source "New".' };
    }
    if (field === 'koppen') {
        const src = KOPPEN_SOURCES[source] ?? KOPPEN_SOURCES.v1;
        if (source === 'beck') return { kind: 'koppenPx', values: await beckPixels(), caption: src.caption };
        if (source === 'new') {
            if (!newRun || newRun.planet !== state.planet) return needRun;
            return { kind: 'koppenPx', values: newRun.raster, caption: `${src.caption} · ${newRun.label}` };
        }
        return { kind: 'koppen', values: await koppenMap(src.file), caption: src.caption };
    }
    const f = FIELDS[field];
    if ((source === 'new' || source === 'diffNew') && !newMonthlyT()) return needRun;
    if (field === 'precip' && (source === 'new' || source === 'diffNew')) {
        if (!newRun.monthlyP) return { kind: 'none', caption: 'This run used the real rain', note: 'Run again with Rain: "New (Phase 5)".' };
        const season = state.month ?? state.season;
        const seasonText = typeof season === 'number' ? MONTHS[season] : SEASONS[season];
        const n = obsSeason(newRun.monthlyP, season);
        if (source === 'new') return { kind: 'scalar', values: n, ramp: RAMPS.rain, caption: `New rain (land and sea) · ${seasonText} · ${newRun.label}` };
        const o = obsSeason(await obsField('precip'), season);
        for (let c = 0; c < G; c++) n[c] = Math.log2((n[c] + 5) / (o[c] + 5));
        return { kind: 'scalar', values: n, ramp: RAMPS.rainRatio, landOnly: true, caption: `New ÷ observed rain · ${seasonText}` };
    }
    if ((field === 'ocean' || field === 'seaIce') && (source === 'new' || source === 'diffNew')) {
        if (!newRun.monthlySL) return needRun;
        const season = state.month ?? state.season;
        const seasonText = typeof season === 'number' ? MONTHS[season] : SEASONS[season];
        const sea = newSeaMask();
        if (field === 'seaIce') {
            const ice = obsSeason(newRun.seaIce, season);
            for (let c = 0; c < G; c++) if (!sea[c]) ice[c] = NaN;
            if (source === 'new') return { kind: 'scalar', values: ice, ramp: RAMPS.seaIce, seaOnly: true, caption: `New sea ice · ${seasonText} · ${newRun.label}` };
            const o = obsSeason(await obsField('seaIce'), season);
            for (let c = 0; c < G; c++) ice[c] = ice[c] - o[c];
            return { kind: 'scalar', values: ice, ramp: RAMPS.pressureDiff, seaOnly: true, caption: `New − observed sea ice (×10 on the scale) · ${seasonText}` };
        }
        if (source === 'diffNew') return { kind: 'none', caption: 'Compare side by side', note: 'For the sea\'s east–west pattern compare New and Observed side by side.' };
        const t = obsSeason(newRun.monthlySL, season);
        for (let c = 0; c < G; c++) if (!sea[c]) t[c] = NaN;
        const wind = newRun.ocean ? { u: newRun.ocean.u, v: newRun.ocean.v } : null;
        return { kind: 'scalar', values: zonalAnomaly(t), ramp: RAMPS.oceanAnom, seaOnly: true, wind, caption: `New sea temperature vs its latitude's average, with the yearly currents · ${seasonText}` };
    }
    if (field === 'slp' && (source === 'new' || source === 'diffNew')) {
        if (!newRun.circ) return { kind: 'none', caption: 'This run used the real winds', note: 'Run again with Winds: "Derived (Phase 3)".' };
        const season = state.month ?? state.season;
        const seasonText = typeof season === 'number' ? MONTHS[season] : SEASONS[season];
        const slp = obsSeason(newRun.circ.slp, season);
        const wind = { u: obsSeason(newRun.circ.u, season), v: obsSeason(newRun.circ.v, season) };
        if (source === 'new') return { kind: 'scalar', values: slp, ramp: RAMPS.pressure, wind, caption: `New pressure & wind · ${seasonText} · ${newRun.label}` };
        const o = obsSeason(await obsField('slp'), season);
        for (let c = 0; c < G; c++) slp[c] -= o[c];
        return { kind: 'scalar', values: slp, ramp: RAMPS.pressureDiff, caption: `New − observed pressure · ${seasonText}` };
    }
    if (field === 'swing') {
        const o = source === 'v1' || source === 'new' ? null : swingOf(await obsField('t2m'));
        if (source === 'obs') return { kind: 'scalar', values: o, ramp: RAMPS.swing, landOnly: true, caption: 'Observed seasonal swing (warmest − coldest month)' };
        if (source === 'v1' || source === 'diff') {
            const v = await v1Field('t2m'), s = new Float32Array(G);
            for (let c = 0; c < G; c++) s[c] = Math.abs(v[c] - v[G + c]);
            if (source === 'v1') return { kind: 'scalar', values: s, ramp: RAMPS.swing, landOnly: true, caption: 'V1 seasonal swing (June–August vs December–February)', note: 'V1 has two seasons, so its swing is summer minus winter (slightly less than warmest minus coldest month).' };
            for (let c = 0; c < G; c++) s[c] -= o[c];
            return { kind: 'scalar', values: s, ramp: RAMPS.swingDiff, landOnly: true, caption: 'V1 − observed seasonal swing' };
        }
        const n = swingOf(newMonthlyT());
        if (source === 'new') return { kind: 'scalar', values: n, ramp: RAMPS.swing, caption: `New seasonal swing (land and sea) · ${newRun.label}` };
        for (let c = 0; c < G; c++) n[c] -= o[c];
        return { kind: 'scalar', values: n, ramp: RAMPS.swingDiff, landOnly: true, caption: 'New − observed seasonal swing' };
    }
    const season = state.month ?? state.season;
    const seasonText = typeof season === 'number' ? MONTHS[season] : SEASONS[season];
    const v1Season2 = typeof season === 'number' ? ([2, 3, 4, 5, 6, 7].includes(season) ? 'JJA' : 'DJF') : season;
    let note = null;
    if ((source === 'v1' || source === 'diff') && typeof season === 'number') note = `V1 has only two seasons — showing its ${SEASONS[v1Season2]}.`;
    const getObs = async (name) => obsSeason(await obsField(name), season);
    const getV1 = async (name) => v1Season(await v1Field(name), v1Season2);
    if (field === 't2m' && (source === 'new' || source === 'diffNew')) {
        const n = obsSeason(newMonthlyT(), season);
        if (source === 'new') return { kind: 'scalar', values: n, ramp: RAMPS.temperature, caption: `New temperature (land and sea) · ${seasonText} · ${newRun.label}` };
        const o = await getObs('t2m');
        for (let c = 0; c < G; c++) n[c] -= o[c];
        return { kind: 'scalar', values: n, ramp: RAMPS.tempDiff, landOnly: true, caption: `New − observed temperature · ${seasonText}` };
    }

    if (field === 'seaIce') {
        if (source !== 'obs') return { kind: 'none', caption: 'V1 has no sea ice', note: 'V1 does not model sea ice.' };
        return { kind: 'scalar', values: await getObs('seaIce'), ramp: RAMPS.seaIce, seaOnly: true, caption: `Observed sea ice · ${seasonText}` };
    }
    if (field === 'ocean') {
        if (source === 'diff') return { kind: 'none', caption: 'No difference view', note: 'V1\'s ocean warmth has no units, so there is no difference view — compare the patterns side by side.' };
        if (source === 'obs') return { kind: 'scalar', values: zonalAnomaly(await getObs('sst')), ramp: RAMPS.oceanAnom, seaOnly: true, caption: `Observed sea temperature vs its latitude's average · ${seasonText}` };
        return { kind: 'scalar', values: await getV1('oceanWarmth'), ramp: RAMPS.oceanWarmthV1, seaOnly: true, caption: `V1 ocean warmth · ${SEASONS[v1Season2]}`, note };
    }
    const fetchWind = async (which) => which === 'obs'
        ? { u: await getObs('u10'), v: await getObs('v10') }
        : { u: await getV1('u10'), v: await getV1('v10') };
    if (source === 'obs') {
        return { kind: 'scalar', values: await getObs(field), ramp: RAMPS[f.ramp], landOnly: f.landOnly,
            wind: f.arrows ? await fetchWind('obs') : null, caption: `Observed ${f.label.toLowerCase()} · ${seasonText}` };
    }
    if (source === 'v1') {
        return { kind: 'scalar', values: await getV1(field), ramp: RAMPS[f.ramp], landOnly: f.landOnly,
            wind: f.arrows ? await fetchWind('v1') : null, caption: `V1 ${f.label.toLowerCase()} · ${SEASONS[v1Season2]}`, note };
    }
    // difference
    const o = await getObs(field), s = await getV1(field);
    const d = new Float32Array(G);
    for (let c = 0; c < G; c++) d[c] = field === 'precip' ? Math.log2((s[c] + 5) / (o[c] + 5)) : s[c] - o[c];
    return { kind: 'scalar', values: d, ramp: RAMPS[f.diff], landOnly: f.landOnly, caption: `V1 − observed · ${SEASONS[v1Season2]}`, note };
}

// ── Painting ──────────────────────────────────────────────────────────────────
const small = new OffscreenCanvas(grid.w, grid.h), smallCtx = small.getContext('2d');
let earthCoast = null, planetCoast = null;
const coastLayerNow = () => (state.planet === 'earth' ? earthCoast : planetCoast);
/** Coastline overlay from a land mask at map resolution. */
function coastFromLand(land) {
    const img = new ImageData(MAP_W, MAP_H);
    for (let y = 1; y < MAP_H - 1; y++) for (let x = 0; x < MAP_W; x++) {
        const c = y * MAP_W + x;
        if (!land[c]) continue;
        const e = land[c - MAP_W] && land[c + MAP_W] && land[y * MAP_W + (x + 1) % MAP_W] && land[y * MAP_W + (x - 1 + MAP_W) % MAP_W];
        if (!e) { img.data[4 * c] = img.data[4 * c + 1] = img.data[4 * c + 2] = 20; img.data[4 * c + 3] = 200; }
    }
    const layer = new OffscreenCanvas(MAP_W, MAP_H);
    layer.getContext('2d').putImageData(img, 0, 0);
    return layer;
}
async function buildCoast() {
    const k01 = await koppenMap(`${REF}koppen_beck_0p1.u8`);
    const land = new Uint8Array(MAP_W * MAP_H);
    for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
        const sx = Math.min(3599, Math.floor((x + 0.5) * 3600 / MAP_W)), sy = Math.min(1799, Math.floor((y + 0.5) * 1800 / MAP_H));
        land[y * MAP_W + x] = k01[sy * 3600 + sx] ? 1 : 0;
    }
    earthCoast = coastFromLand(land);
}

let v1Land = null;
function paint(canvas, d, itczKey) {
    if (canvas.width !== MAP_W || canvas.height !== MAP_H) { canvas.width = MAP_W; canvas.height = MAP_H; }
    const g = canvas.getContext('2d');
    if (d.kind === 'koppenPx') {                          // already at map resolution
        const big = g.createImageData(MAP_W, MAP_H);
        const lut = KOPPEN_CLASSES.map((c, k) => (k ? c.color.map(x => x * 255) : NO_DATA_SEA));
        for (let p = 0; p < MAP_W * MAP_H; p++) {
            const rgb = lut[d.values[p]];
            big.data[4 * p] = rgb[0]; big.data[4 * p + 1] = rgb[1]; big.data[4 * p + 2] = rgb[2]; big.data[4 * p + 3] = 255;
        }
        g.putImageData(big, 0, 0);
        if (state.coast && coastLayerNow()) { g.globalAlpha = 0.55; g.drawImage(coastLayerNow(), 0, 0); g.globalAlpha = 1; }
        return;
    }
    const img = smallCtx.createImageData(grid.w, grid.h);
    for (let c = 0; c < G; c++) {
        let rgb;
        if (d.kind === 'none') rgb = [30, 32, 40];
        else if (d.kind === 'koppen') rgb = d.values[c] ? KOPPEN_CLASSES[d.values[c]].color.map(x => x * 255) : NO_DATA_SEA;
        else {
            const v = d.values[c];
            rgb = v === v ? rampColor(d.ramp, v) : (d.seaOnly ? NO_DATA_LAND : NO_DATA_SEA);
        }
        img.data[4 * c] = rgb[0]; img.data[4 * c + 1] = rgb[1]; img.data[4 * c + 2] = rgb[2]; img.data[4 * c + 3] = 255;
    }
    smallCtx.putImageData(img, 0, 0);
    g.imageSmoothingEnabled = false;
    g.drawImage(small, 0, 0, MAP_W, MAP_H);
    if (state.coast && coastLayerNow()) { g.globalAlpha = 0.55; g.drawImage(coastLayerNow(), 0, 0); g.globalAlpha = 1; }
    if (d.wind) drawArrows(g, d.wind);
    if (state.itcz && FIELDS[state.field]?.itcz) {
        if (itczKey && state.planet === 'earth' && audit?.itcz?.[itczKey]) drawItcz(g, audit.itcz[itczKey]);
        const nl = newItczLine();
        if (nl) drawLine(g, nl, 'rgba(60,230,255,.95)', [4, 3]);
    }
}

/** The new climate's rain belt for the season or month shown (mean of the months). */
function newItczLine() {
    if (!newRun?.circ || newRun.planet !== state.planet) return null;
    const season = state.month ?? state.season, months = typeof season === 'number' ? [season] : SEASON_MONTHS[season];
    const w = grid.w, out = new Float64Array(w);
    for (const m of months) for (let i = 0; i < w; i++) out[i] += newRun.circ.itczLat[m * w + i] / months.length;
    return out;
}
function drawLine(g, lats, color, dash) {
    g.strokeStyle = color; g.lineWidth = 3; g.setLineDash(dash); g.beginPath();
    lats.forEach((lat, i) => { const x = (i + 0.5) * PX, y = (90 - lat) * PX; i ? g.lineTo(x, y) : g.moveTo(x, y); });
    g.stroke(); g.setLineDash([]);
}

function drawArrows(g, { u, v }) {
    const speeds = [];
    for (let c = 0; c < G; c += 7) { const s = Math.hypot(u[c], v[c]); if (s === s) speeds.push(s); }
    speeds.sort((a, b) => a - b);
    const p95 = speeds[Math.floor(speeds.length * 0.95)] || 1;
    g.strokeStyle = 'rgba(15,18,28,.85)'; g.fillStyle = 'rgba(15,18,28,.85)'; g.lineWidth = 1.6;
    for (let j = 2; j < grid.h; j += 5) for (let i = 2; i < grid.w; i += 5) {
        const c = j * grid.w + i, uu = u[c], vv = v[c], s = Math.hypot(uu, vv);
        if (!(s > 0)) continue;
        const len = 5 + 13 * Math.min(1, s / p95), ex = uu / s, ey = -vv / s;
        const x0 = (i + 0.5) * PX - ex * len / 2, y0 = (j + 0.5) * PX - ey * len / 2, x1 = x0 + ex * len, y1 = y0 + ey * len;
        g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
        g.beginPath(); g.moveTo(x1, y1); g.lineTo(x1 - ex * 5 - ey * 3, y1 - ey * 5 + ex * 3); g.lineTo(x1 - ex * 5 + ey * 3, y1 - ey * 5 - ex * 3); g.fill();
    }
}

function drawItcz(g, lines) {
    const draw = (lats, color, dash) => {
        g.strokeStyle = color; g.lineWidth = 3; g.setLineDash(dash); g.beginPath();
        lats.forEach((lat, i) => { const x = (i + 0.5) * PX, y = (90 - lat) * PX; i ? g.lineTo(x, y) : g.moveTo(x, y); });
        g.stroke(); g.setLineDash([]);
    };
    draw(lines.obs, 'rgba(255,255,255,.95)', [10, 6]);
    draw(lines.sim, 'rgba(255,79,216,.95)', []);
}

// ── Legend ────────────────────────────────────────────────────────────────────
function renderLegend(d) {
    const el = $('legend');
    el.innerHTML = '';
    if (d.kind === 'koppen' || d.kind === 'koppenPx') {
        const present = new Set(d.values);
        const box = document.createElement('div'); box.className = 'classes';
        for (let k = 1; k < KOPPEN_CLASSES.length; k++) {
            if (!present.has(k)) continue;
            const c = KOPPEN_CLASSES[k], s = document.createElement('span');
            s.title = c.name;
            s.innerHTML = `<i style="background: rgb(${c.color.map(x => Math.round(x * 255)).join(',')})"></i>${c.code}`;
            box.appendChild(s);
        }
        el.appendChild(box);
    } else if (d.kind === 'scalar') {
        const cv = document.createElement('canvas'); cv.width = 600; cv.height = 60;
        drawRampBar(cv, d.ramp);
        el.appendChild(cv);
        const u = document.createElement('div'); u.className = 'unit'; u.textContent = d.ramp.unit; el.appendChild(u);
    }
}

// ── UI ────────────────────────────────────────────────────────────────────────
const ui = { map: $('map'), globe: $('globe'), mapA: $('mapA'), mapB: $('mapB'), readout: $('hover'), panel: $('panel') };
ui.map.width = MAP_W; ui.map.height = MAP_H;          // the globe's texture: fixed size before it is first uploaded
const globe = new GlobeView(ui.globe, ui.map);
let audit = null, seasonTest = null;
let current = null, currentRef = null;

function segmented(el, options, value, onPick) {
    el.innerHTML = '';
    for (const [key, label] of Object.entries(options)) {
        const b = document.createElement('button');
        b.textContent = label; b.dataset.key = key;
        b.classList.toggle('on', key === value); b.setAttribute('aria-pressed', key === value);
        b.addEventListener('click', () => onPick(key));
        el.appendChild(b);
    }
}
function sourcesFor(field) {
    if (state.planet !== 'earth') return { new: 'New' };
    if (field === 'koppen') return Object.fromEntries(Object.entries(KOPPEN_SOURCES).map(([k, s]) => [k, s.label]));
    return SCALAR_SOURCES;
}
function buildControls() {
    segmented($('fields'), Object.fromEntries(Object.entries(FIELDS).map(([k, f]) => [k, f.label])), state.field, (k) => {
        state.field = k;
        if (!sourcesFor(k)[state.source]) state.source = state.planet !== 'earth' ? 'new' : k === 'koppen' ? 'v1' : 'obs';
        refresh();
    });
    const sources = sourcesFor(state.field);
    if (!sources[state.source]) state.source = Object.keys(sources)[0];
    segmented($('sources'), sources, state.source, (k) => { state.source = k; refresh(); });
    segmented($('seasons'), SEASONS, state.month === null ? state.season : null, (k) => { state.season = k; state.month = null; $('month').value = 0; refresh(); });
    const seasonal = state.field !== 'koppen' && !FIELDS[state.field].noSeason;
    $('seasons').hidden = !seasonal; $('monthRow').hidden = !seasonal;
    $('seasonHead').hidden = !seasonal;
    $('monthLabel').textContent = state.month === null ? '—' : MONTHS[state.month];
}
$('month').addEventListener('input', (e) => {
    const m = +e.target.value;
    state.month = m === 0 ? null : m - 1;
    refresh();
});
$('optItcz').addEventListener('change', (e) => { state.itcz = e.target.checked; refresh(); });
$('optCoast').addEventListener('change', (e) => { state.coast = e.target.checked; refresh(); });
for (const b of document.querySelectorAll('#viewSwitch button')) {
    b.addEventListener('click', () => {
        state.view = b.dataset.view;
        for (const x of document.querySelectorAll('#viewSwitch button')) { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b); }
        ui.globe.hidden = state.view !== 'globe'; ui.map.hidden = state.view !== 'map'; $('compare').hidden = state.view !== 'compare';
        ui.readout.hidden = true;
        refresh();
    });
}
$('panelHandle').addEventListener('click', () => ui.panel.classList.toggle('open'));

const FIELD_NOTES = {
    koppen: 'Beck map = the published 1991–2020 Köppen map. New = the new climate from your last run (per terrain cell). "12 months / 6 / 4 points / 2 seasons" = real Earth data classified by the new classifier after cutting the year down. V1 = the current app on the imported Earth.',
    t2m: 'Observed: Beck et al. 1991–2020 monthly means (land only). V1 has two seasons (June–August, December–February). New: the energy balance from your last run, every month, land and sea, at each 1° cell\'s mean height.',
    swing: 'Warmest month minus coldest month: large deep inside continents, small near and over the sea. V1 has only two seasons, so its swing is summer minus winter.',
    precip: 'Mm per month. Observed and V1: land only (Beck 2023; V1\'s two seasons). New (Phase 5): land and sea, from the column-water budget — at sea compare with GPCP in the Phase 5 table. The lines are the tropical rain belt (ITCZ): white dashed = observed (rain maximum), pink = V1, cyan = the new winds\' belt.',
    slp: 'Sea-level pressure with near-surface wind arrows (arrow length is relative within each source; V1\'s wind has no units). Observed: NCEP reanalysis 1991–2020. New (Phase 3): derived from the new temperature — belts placed by the planet\'s own warmth, thermal lows and highs, friction. Rain-belt lines: white dashed = observed (June–August / December–February), pink = V1, cyan = new (any month).',
    ocean: 'Observed: sea-surface temperature minus the average at that latitude — warm currents (Gulf Stream, Kuroshio) red, cold upwelling coasts blue. V1: its "ocean warmth" field. New (Phase 4): the same for the new climate\'s sea temperature, with its wind-driven currents as arrows (gyres, western boundary currents, the circumpolar current).',
    seaIce: 'Observed sea-ice concentration (NOAA OISST 1991–2020). V1 has no sea ice. New: sea ice from the energy balance, by month.',
};

async function refresh() {
    buildControls();
    $('busy').hidden = false;
    try {
        const itczKey = (state.month === null && (state.season === 'JJA' || state.season === 'DJF')) ? state.season : null;
        current = await resolve(state.field, state.source);
        paint(ui.map, current, itczKey);
        globe.setSmooth(false);
        globe.textureChanged();
        if (state.view === 'compare') {
            let other;
            if (state.planet !== 'earth') {                  // a test planet: its Köppen beside the field shown
                currentRef = await resolve('koppen', 'new');
                other = await resolve(state.field, 'new');
            } else {
                const refSource = state.field === 'koppen' ? 'beck' : 'obs';
                const otherSource = state.field === 'koppen' ? (state.source === 'beck' ? 'v1' : state.source) : (state.source === 'obs' ? 'v1' : state.source);
                currentRef = await resolve(state.field, refSource);
                other = await resolve(state.field, otherSource);
            }
            paint(ui.mapA, currentRef, itczKey); paint(ui.mapB, other, itczKey);
            $('capA').textContent = currentRef.caption; $('capB').textContent = other.caption;
            current = other;
        }
        renderLegend(current.kind === 'none' && currentRef ? currentRef : current);
        $('fieldNote').textContent = FIELD_NOTES[state.field];
        const note = current.note;
        $('notice').hidden = !note; $('notice').textContent = note ?? '';
    } catch (err) {
        showError(err);
    } finally {
        $('busy').hidden = true;
    }
}

function showError(err) {
    const el = $('loadError');
    el.hidden = false;
    el.textContent = `Could not load the lab data (${err.message}). Run: node tuning/climate/fetch-references.mjs, `
        + 'node tuning/climate/regrid-references.mjs, node tuning/climate/season-test.mjs, node tuning/climate/stage-audit.mjs — '
        + 'and serve the project with node tuning/dev-server.mjs.';
    console.error(err);
}

// ── Readout ───────────────────────────────────────────────────────────────────
function latLonUnder(e) {
    if (state.view === 'globe') {
        const uv = globe.uvAt(e.clientX, e.clientY);
        return uv ? [90 - (1 - uv.y) * 180, uv.x * 360 - 180] : null;
    }
    const cv = e.target;
    if (!(cv instanceof HTMLCanvasElement)) return null;
    const r = cv.getBoundingClientRect(), cs = getComputedStyle(cv);
    const padL = parseFloat(cs.paddingLeft), padT = parseFloat(cs.paddingTop);
    const boxW = r.width - padL - parseFloat(cs.paddingRight), boxH = r.height - padT - parseFloat(cs.paddingBottom);
    const scale = Math.min(boxW / MAP_W, boxH / MAP_H);
    const x = (e.clientX - (r.left + padL + (boxW - MAP_W * scale) / 2)) / scale, y = (e.clientY - (r.top + padT + (boxH - MAP_H * scale) / 2)) / scale;
    return x >= 0 && y >= 0 && x < MAP_W && y < MAP_H ? [90 - y / MAP_H * 180, x / MAP_W * 360 - 180] : null;
}
const fmt = {
    t2m: v => `${v.toFixed(1)} °C`, precip: v => `${v.toFixed(0)} mm/mo`, slp: v => `${v.toFixed(1)} hPa`,
    seaIce: v => `${(100 * v).toFixed(0)} % ice`,
};
async function showReadout(e) {
    const ll = latLonUnder(e);
    if (!ll) { ui.readout.hidden = true; return; }
    const [lat, lon] = ll, c = grid.cellAt(lat, lon);
    const where = `${Math.abs(lat).toFixed(1)}°${lat >= 0 ? 'N' : 'S'} ${Math.abs(lon).toFixed(1)}°${lon >= 0 ? 'E' : 'W'}`;
    const parts = [where];
    const beckPx = await beckPixels(), v1k = await koppenMap(KOPPEN_SOURCES.v1.file);
    const px = Math.min(MAP_W - 1, Math.floor((lon + 180) / 360 * MAP_W)) + MAP_W * Math.min(MAP_H - 1, Math.floor((90 - lat) / 180 * MAP_H));
    const realK = beckPx[px];
    const onEarth = state.planet === 'earth';
    const nT = newMonthlyT();
    const cls = (k) => (k ? `${KOPPEN_CLASSES[k].code} ${KOPPEN_CLASSES[k].name}` : 'sea');
    if (state.field === 'koppen') {
        const shown = current?.kind === 'koppen' ? current.values[c] : current?.kind === 'koppenPx' ? current.values[px] : 0;
        if (onEarth) parts.push(`real: ${cls(realK)}`);
        parts.push(`shown: ${cls(shown)}`);
    } else if (state.field === 't2m' || state.field === 'swing') {
        const pick = async (src) => { const r = await resolve(state.field, src); const v = r.values?.[c]; return v === v && v !== undefined ? `${v.toFixed(1)} °C` : '—'; };
        if (onEarth) { parts.push(`observed ${await pick('obs')}`); parts.push(`V1 ${await pick('v1')}`); }
        if (nT) parts.push(`new ${await pick('new')}`);
        if (onEarth) parts.push(`Köppen real ${realK ? KOPPEN_CLASSES[realK].code : 'sea'} · V1 ${v1k[c] ? KOPPEN_CLASSES[v1k[c]].code : 'sea'}${newRun?.planet === 'earth' ? ` · new ${newRun.raster[px] ? KOPPEN_CLASSES[newRun.raster[px]].code : 'sea'}` : ''}`);
        else if (newRun) parts.push(`Köppen ${cls(newRun.raster[px])}`);
    } else if (fmt[state.field]) {
        const o = await resolve(state.field, 'obs');
        const ov = o.values?.[c];
        parts.push(`observed ${ov === ov && ov !== undefined ? fmt[state.field](ov) : '—'}`);
        if (state.field !== 'seaIce') {
            const s = await resolve(state.field, 'v1');
            const sv = s.values?.[c];
            parts.push(`V1 ${sv === sv && sv !== undefined ? fmt[state.field](sv) : '—'}`);
        }
        parts.push(`Köppen real ${realK ? KOPPEN_CLASSES[realK].code : 'sea'} · V1 ${v1k[c] ? KOPPEN_CLASSES[v1k[c]].code : 'sea'}`);
    } else if (current?.kind === 'scalar') {
        const v = current.values[c];
        parts.push(v === v ? v.toFixed(2) : '—');
    }
    ui.readout.textContent = parts.join(' · ');
    ui.readout.hidden = false;
    if (NARROW.matches) return;
    const s = $('stage').getBoundingClientRect(), x = e.clientX - s.left, y = e.clientY - s.top, gap = 14;
    const w = ui.readout.offsetWidth, h = ui.readout.offsetHeight;
    ui.readout.style.left = `${x + gap + w <= s.width ? x + gap : Math.max(0, x - gap - w)}px`;
    ui.readout.style.top = `${y + gap + h <= s.height ? y + gap : Math.max(0, y - gap - h)}px`;
}
for (const el of [ui.globe, ui.map, ui.mapA, ui.mapB]) {
    el.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') showReadout(e); });
    el.addEventListener('pointerleave', () => { ui.readout.hidden = true; });
    el.addEventListener('click', showReadout);
}

// ── Tables ────────────────────────────────────────────────────────────────────
const pct = (x) => (x === x && x !== null && x !== undefined ? `${(100 * x).toFixed(0)} %` : '—');
const num = (x, d = 2) => (x === x && x !== null && x !== undefined ? x.toFixed(d) : '—');
const grade = (x, good, mid, lowerIsBetter = false) => {
    if (!(x === x)) return '';
    return lowerIsBetter ? (x <= good ? 'good' : x <= mid ? 'mid' : 'bad') : (x >= good ? 'good' : x >= mid ? 'mid' : 'bad');
};
function table(el, head, rows) {
    el.innerHTML = `<thead><tr>${head.map((h, i) => `<th class="${i === 0 ? 'wrap' : ''}">${h}</th>`).join('')}</tr></thead>`
        + `<tbody>${rows.map(r => r.note !== undefined ? `<tr class="note"><td colspan="${head.length}">${r.note}</td></tr>`
            : `<tr>${r.map((c, i) => typeof c === 'object' ? `<td class="${c.cls ?? ''}">${c.text}</td>` : `<td class="${i === 0 ? 'wrap' : ''}">${c}</td>`).join('')}</tr>`).join('')}</tbody>`;
}
function renderStageTable() {
    const S = audit.stages;
    table($('stageTable'), ['Stage · measure', 'Jun–Aug', 'Dec–Feb'], [
        ['Pressure · pattern match (corr.)', { text: num(S.pressure.JJA.patternCorr), cls: grade(S.pressure.JJA.patternCorr, 0.8, 0.6) }, { text: num(S.pressure.DJF.patternCorr), cls: grade(S.pressure.DJF.patternCorr, 0.8, 0.6) }],
        ['Pressure · land–sea highs & lows (corr.)', { text: num(S.pressure.JJA.eastWestCorr), cls: grade(S.pressure.JJA.eastWestCorr, 0.7, 0.45) }, { text: num(S.pressure.DJF.eastWestCorr), cls: grade(S.pressure.DJF.eastWestCorr, 0.7, 0.45) }],
        ['Wind · direction within 45°', { text: pct(S.wind.JJA.all.within45deg), cls: grade(S.wind.JJA.all.within45deg, 0.8, 0.65) }, { text: pct(S.wind.DJF.all.within45deg), cls: grade(S.wind.DJF.all.within45deg, 0.8, 0.65) }],
        { note: `over the sea ${pct(S.wind.JJA.sea.within45deg)}, over land ${pct(S.wind.JJA.land.within45deg)} (Jun–Aug)` },
        ['Rain belt (ITCZ) · typical error', { text: `${num(S.itcz.JJA.meanAbsErrDeg, 1)}°`, cls: grade(S.itcz.JJA.meanAbsErrDeg, 3, 6, true) }, { text: `${num(S.itcz.DJF.meanAbsErrDeg, 1)}°`, cls: grade(S.itcz.DJF.meanAbsErrDeg, 3, 6, true) }],
        { note: `average latitude: V1 ${num(S.itcz.JJA.simMeanLat, 1)}° vs real ${num(S.itcz.JJA.obsMeanLat, 1)}° (Jun–Aug), ${num(S.itcz.DJF.simMeanLat, 1)}° vs ${num(S.itcz.DJF.obsMeanLat, 1)}° (Dec–Feb)` },
        ['Ocean · warm & cold currents (corr.)', { text: num(S.ocean.JJA.eastWestCorr), cls: grade(S.ocean.JJA.eastWestCorr, 0.7, 0.45) }, { text: num(S.ocean.DJF.eastWestCorr), cls: grade(S.ocean.DJF.eastWestCorr, 0.7, 0.45) }],
        ['Temperature · pattern (corr.)', { text: num(S.temperature.JJA.corr), cls: grade(S.temperature.JJA.corr, 0.95, 0.9) }, { text: num(S.temperature.DJF.corr), cls: grade(S.temperature.DJF.corr, 0.95, 0.9) }],
        ['Temperature · typical error', { text: `${num(S.temperature.JJA.rmseC, 1)} °C`, cls: grade(S.temperature.JJA.rmseC, 3, 5, true) }, { text: `${num(S.temperature.DJF.rmseC, 1)} °C`, cls: grade(S.temperature.DJF.rmseC, 3, 5, true) }],
        ['Rain · pattern (corr. of log rain)', { text: num(S.rain.JJA.logCorr), cls: grade(S.rain.JJA.logCorr, 0.8, 0.6) }, { text: num(S.rain.DJF.logCorr), cls: grade(S.rain.DJF.logCorr, 0.8, 0.6) }],
        ['Rain · wet season the right way round', { text: pct(S.rain.wetSeasonRightWayRound), cls: grade(S.rain.wetSeasonRightWayRound, 0.9, 0.8) }, ''],
        { note: `V1 run at ${audit.N.toLocaleString()} regions (climate ${audit.v1ClimateMs} ms in Node). Green / yellow / red = good / so-so / poor for a believable map.` },
    ]);
    const rows = audit.koppen.rows.map(r => [r.label, pct(r.exact), pct(r.major),
        ...['Cs (Mediterranean)', 'Cw (dry-winter temperate)', 'Am (tropical monsoon)', 'Dw (dry-winter continental)'].map(k => pct(r.regimes[k].recall))]);
    table($('swapTable'), ['Temperature + rain', 'Exact', 'Group', 'Cs', 'Cw', 'Am', 'Dw'], [
        ...rows,
        { note: 'Exact = same Köppen class as the Beck map; Group = same letter (A/B/C/D/E). Cs … Dw = share of each real regime\'s area that is found.' },
    ]);
}
function renderSeasonTable() {
    const best = (K) => seasonTest.results.filter(r => r.K === K).reduce((a, b) => (b.alignedAgreement > a.alignedAgreement ? b : a));
    const regs = ['Cs (Mediterranean)', 'Cw (dry-winter temperate)', 'Am (tropical monsoon)', 'Dw (dry-winter continental)'];
    const rows = [2, 4, 6].map(K => {
        const r = best(K);
        return [`${K === 2 ? '2 seasons' : `${K} points`}`, { text: pct(r.alignedAgreement), cls: grade(r.alignedAgreement, 0.95, 0.9) },
            ...regs.map(k => ({ text: pct(r.alignedRecall[k]), cls: grade(r.alignedRecall[k], 0.9, 0.8) })),
            { text: r.passAligned ? 'pass' : 'no', cls: r.passAligned ? 'good' : 'bad' }];
    });
    rows.push(['12 months', { text: '100 %', cls: 'good' }, ...regs.map(() => ({ text: '100 %', cls: 'good' })), { text: 'pass', cls: 'good' }]);
    const dec = seasonTest.decomposition4 ?? [];
    for (const d of dec) rows.push({ note: `4 points, only ${d.rebuilt} rebuilt (the other kept at 12 real months): ${pct(d.agreement)} of land keeps its class.` });
    table($('seasonTable'), ['Points in the year', 'Same class', 'Cs', 'Cw', 'Am', 'Dw', 'Gate'], rows);
    $('seasonNote').textContent = `Gate: ≥ 95 % of land keeps its class and Cs, Cw, Am, Dw each keep ≥ 90 %. `
        + `Classifier check: the new classifier on real monthly data matches the published Beck map on ${pct(seasonTest.classifierCheck.exact)} of land (${pct(seasonTest.classifierCheck.major)} by group).`;
}

// ── Timing ────────────────────────────────────────────────────────────────────
const worker = new Worker(new URL('./timing-worker.js', import.meta.url), { type: 'module' });
let jobId = 0;
const pending = new Map();
worker.onmessage = (e) => { const p = pending.get(e.data.id); pending.delete(e.data.id); e.data.ok ? p.resolve(e.data.result) : p.reject(new Error(e.data.error)); };
worker.onerror = (e) => { for (const p of pending.values()) p.reject(new Error(e.message || 'worker failed to start')); pending.clear(); };
const runJob = (msg) => new Promise((resolve, reject) => { const id = ++jobId; pending.set(id, { resolve, reject }); worker.postMessage({ id, ...msg }); });
const timingRows = [];
function renderTiming() { table($('timingTable'), ['What', 'Time'], timingRows.length ? timingRows : [{ note: 'Nothing measured yet.' }]); }
async function timed(button, fn) {
    for (const b of document.querySelectorAll('.buttons .tool')) b.disabled = true;
    button.classList.add('on');
    try { await fn(); } catch (err) { timingRows.push({ note: `Failed: ${err.message}` }); console.error(err); }
    finally { button.classList.remove('on'); for (const b of document.querySelectorAll('.buttons .tool')) b.disabled = false; renderTiming(); }
}
const ms = (x) => (x >= 1000 ? `${(x / 1000).toFixed(2)} s` : x >= 10 ? `${x.toFixed(0)} ms` : `${x.toFixed(2)} ms`);
for (const [id, N] of [['timeV1_40', 40000], ['timeV1_160', 160000]]) {
    $(id).addEventListener('click', (e) => timed(e.currentTarget, async () => {
        const r = await runJob({ cmd: 'v1', N });
        timingRows.push([`<b>V1 climate · ${r.N.toLocaleString()} regions</b>`, { text: `<b>${ms(r.climateMs)}</b>` }]);
        for (const s of r.stages) timingRows.push([`&nbsp;&nbsp;${s.name}`, ms(s.ms)]);
        timingRows.push([`&nbsp;&nbsp;(building the Earth mesh, not climate)`, ms(r.meshMs)]);
    }));
}
$('timeKernels').addEventListener('click', (e) => timed(e.currentTarget, async () => {
    const r = await runJob({ cmd: 'kernels' });
    timingRows.push([`<b>New-climate building blocks</b>`, '']);
    for (const k of r) timingRows.push([`&nbsp;&nbsp;${k.name}`, `${ms(k.ms)} ${k.unit === 'total' ? '' : k.unit}`]);
}));
// ── The new climate (Phases 1–2) ──────────────────────────────────────────────
const sk = { N: '160000', K: '6', planet: 'earth', temp: 'ebm', winds: 'derived', rain: 'model', detail: 'full' };
let skData = null, tempData = null;
const skRows = [];
const PLANET_NOTES = {
    earth: 'The imported Earth heightmap. Every stage can run new; winds and rain can also be swapped for real observations to judge the other stages on their own.',
    mountains: 'The mid-latitude continent with a 3 km range 8° inland from its west coast. Expect a wet windward slope and a rain shadow east of the range.',
    midlat: 'One continent from 20° to 60°N, 80° wide. Expect big seasons inland, a mild west coast and a harsh east coast, hot summers and cold winters compared with the sea.',
    tropical: 'A flat continent across the equator (30°S–30°N, 45° wide). Expect small seasons near the equator, growing toward 30°.',
    supercontinent: 'One huge continent, 60°S–60°N and 110° wide. Expect extreme seasons deep inside at mid-latitudes, a wet equator and subtropical deserts in the interior.',
    evolution: 'A planet from the Evolution engine: the V2 lab\'s whole-planet history (600 Myr, seed 12345), its last frame\'s terrain at the chosen size — z north, heights in km, exactly what Evolution hands the climate. The history takes about a minute the first time.',
    evolutionSuper: 'The same history run on until it ends as a supercontinent (the V2 lab\'s "End as: supercontinent"). Expect a dry, continental interior. The history takes a minute or two the first time.',
};
function buildSkeletonControls() {
    segmented($('ncPlanet'), PLANETS, sk.planet, (k) => {
        sk.planet = k;
        buildSkeletonControls();
        // Earth's observations are always there; a test planet is shown once it has been run
        if (k === 'earth' || newRun?.planet === k) { state.planet = k; refresh(); }
    });
    $('ncPlanetNote').textContent = PLANET_NOTES[sk.planet];
    const earth = sk.planet === 'earth';
    $('ncTemp').hidden = !earth; $('ncTempHead').hidden = !earth;
    segmented($('ncTemp'), { ebm: 'New (Phase 2)', observed: 'Real data (Phase 1 oracle)' }, sk.temp, (k) => { sk.temp = k; buildSkeletonControls(); });
    $('ncWinds').hidden = !earth || sk.temp !== 'ebm'; $('ncWindsHead').hidden = $('ncWinds').hidden;
    segmented($('ncWinds'), { derived: 'Derived (Phase 3)', observed: 'Real winds' }, sk.winds, (k) => { sk.winds = k; buildSkeletonControls(); });
    $('ncRain').hidden = !earth || sk.temp !== 'ebm'; $('ncRainHead').hidden = $('ncRain').hidden;
    segmented($('ncRain'), { model: 'New (Phase 5)', observed: 'Real rain' }, sk.rain, (k) => { sk.rain = k; buildSkeletonControls(); });
    segmented($('ncDetail'), { full: 'Terrain + texture', terrain: 'Terrain only', smooth: 'Smooth' }, sk.detail, (k) => { sk.detail = k; buildSkeletonControls(); });
    segmented($('skRes'), { 40000: '40K', 160000: '160K', 640000: '640K', 2500000: '2.5M' }, sk.N, (k) => { sk.N = k; buildSkeletonControls(); });
    segmented($('skK'), { 4: '4', 6: '6 (default)', 12: '12' }, sk.K, (k) => { sk.K = k; buildSkeletonControls(); });
}
/** A pass/fail list with a detail line under each check. */
function checkTable(el, rows) {
    const out = [];
    for (const r of rows) out.push([r.text, { text: r.ok ? 'pass' : 'fail', cls: r.ok ? 'good' : 'bad' }], { note: r.detail });
    table(el, ['Check', ''], out);
}
let circData = null;
function renderCirculationTables() {
    if (!circData) { table($('circTable'), ['—'], [{ note: 'Run node tuning/climate/circulation-check.mjs to fill these tables.' }]); return; }
    const per = circData.vsV1.perRegion, rows = [];
    for (const [k, r] of Object.entries(per)) {
        const better = r.newSeason.within45 > r.v1Season.within45;
        rows.push([k, { text: pct(r.newSeason.within45), cls: better ? 'good' : 'bad' }, pct(r.v1Season.within45),
            { text: num(r.newSeason.slpAnomRmse, 1), cls: r.newSeason.slpAnomRmse < r.v1Season.slpAnomRmse ? 'good' : 'bad' }, num(r.v1Season.slpAnomRmse, 1), num(r.new12.speedRatio, 2)]);
    }
    const v = circData.vsV1;
    rows.push({ note: `Weighted equally: wind within 45° new ${pct(v.newWithin45)} vs V1 ${pct(v.v1Within45)}; pressure error new ${num(v.newPressureErr, 1)} vs V1 ${num(v.v1PressureErr, 1)} hPa; east–west pressure correlation new ${num(v.newCorr)} vs V1 ${num(v.v1Corr)}; rain belt new ${num(v.newItcz, 1)}° vs V1 ${num(v.v1Itcz, 1)}° off the real rain maximum. Speed = new ÷ real wind speed.` });
    table($('circTable'), ['Region', 'Wind ±45° new', 'V1', 'Pressure err. new hPa', 'V1', 'Speed'], rows);
    checkTable($('circNamedTable'), circData.named);
    const pl = [];
    for (const [kind, p] of Object.entries(circData.planets)) for (const c of p.checks) pl.push({ ...c, text: `${PLANETS[kind]}: ${c.text}` });
    const cl = circData.closed, mean = (o) => Object.values(o).reduce((a, b) => a + b, 0) / Object.values(o).length;
    pl.push({ text: 'Coupled on Earth: temperature no worse with its own winds', ok: circData.gate.temperatureHolds,
        detail: `monthly temperature error ${num(mean(cl.tClosed), 2)} °C with derived winds vs ${num(mean(cl.tempOpen), 2)} °C with real winds; Köppen with real rain ${pct(cl.koppen)}; winds ${pct(cl.within45)} within 45°` });
    checkTable($('circPlanetTable'), pl);
    $('circNote').textContent = `Input: ${circData.input}. Settings: ${Object.entries(circData.params).map(([k, x]) => `${k.replace('CIRC_', '').toLowerCase()} ${+(+x).toPrecision(3)}`).join(', ')}. `
        + `Circulation ${num(circData.open.ms, 0)} ms; coupled temperature ↔ winds ${num(circData.closed.timing.find(t => t.stage.startsWith('temperature'))?.ms ?? NaN, 0)} ms (Node).`;
}
let oceanData = null;
function renderOceanTables() {
    if (!oceanData) { table($('oceanTable'), ['—'], [{ note: 'Run node tuning/climate/ocean-check.mjs to fill these tables.' }]); return; }
    const o = oceanData.open, rows = [];
    for (const k of Object.keys(o.perBasin)) rows.push([`${k} (sea temperature)`, { text: num(o.perBasin[k], 1), cls: o.perBasin[k] <= o.perBasinWithout[k] ? 'good' : 'bad' }, num(o.perBasinWithout[k], 1)]);
    for (const k of Object.keys(o.perCont)) rows.push([`${k} (land temperature)`, { text: num(o.perCont[k], 1), cls: o.perCont[k] <= o.perContWithout[k] ? 'good' : 'bad' }, num(o.perContWithout[k], 1)]);
    rows.push({ note: `Monthly error °C with the ocean's heat vs without. East–west sea-temperature pattern (warm western, cold eastern boundaries) correlation: ${num(o.ew)} with, ${num(o.ewWithout)} without; June–August / December–February new ${num(oceanData.vsV1.newEW)} vs V1's ocean warmth ${num(oceanData.vsV1.v1EW)}. Circumpolar: ${o.channels.map(c => `${num(c.transportSv, 0)} Sv at ${num(c.fromLat, 0)}°`).join(', ')}.` });
    table($('oceanTable'), ['Region', 'With ocean', 'Without'], rows);
    const cl = oceanData.closed;
    const list = [...oceanData.named];
    for (const [kind, p] of Object.entries(oceanData.planets)) for (const c of p.checks) list.push({ ...c, text: `${PLANETS[kind]}: ${c.text}` });
    checkTable($('oceanNamedTable'), list);
    $('oceanNote').textContent = `Coupled on Earth (temperature ↔ winds ↔ ocean): sea temperature ${num(cl.sst, 2)} °C (${num(cl.sstWithout, 2)} without the ocean); `
        + `land ${Object.entries(cl.perCont).map(([k, v]) => `${k} ${num(v, 1)} (${num(cl.perContWithout[k], 1)})`).join(', ')}; Köppen with real rain ${pct(cl.koppen)} (${pct(cl.koppenWithout)}); named features ${cl.named.filter(c => c.ok).length}/${cl.named.length}. `
        + `Settings: ${Object.entries(oceanData.params).map(([k, x]) => `${k.replace('OCEAN_', '').toLowerCase()} ${+(+x).toPrecision(3)}`).join(', ')}. Ocean ${num(o.ms, 0)} ms.`;
}
let coupledData = null;
function renderCoupledTables() {
    if (!coupledData) { table($('coupledTable'), ['—'], [{ note: 'Run node tuning/climate/coupled-check.mjs to fill these tables.' }]); return; }
    const e = coupledData.earth, nc = e.withoutClouds, rows = [];
    for (const k of Object.keys(e.perCont)) rows.push([k, pct(e.perCont[k]), num(e.guard.temperature[k], 1), num(e.guard.rainLand[k], 2)]);
    rows.push({ note: `Köppen ${pct(e.exact)} of land (major group ${pct(e.major)}; continents weighted equally ${pct(e.meanCont)}); without the clouds from the rain ${pct(nc.exact)}. V1 38 %. Temperature: monthly error °C; rain: typical monthly error (log ratio). Sea temperature ${num(e.guard.sst, 2)} °C.` });
    table($('coupledTable'), ['Continent', 'Köppen', 'Temperature err.', 'Rain err.'], rows);
    const more = [];
    for (const [k, r] of Object.entries(e.regimes)) more.push([k, `${pct(r.recall)} found`, `area × ${num(r.areaRatio, 2)}`]);
    if (coupledData.drift) for (const [N, d] of Object.entries(coupledData.drift)) more.push([`${(+N).toLocaleString()} terrain cells`, `Köppen ${pct(d.exact)}`, `class shares differ by ${(100 * d.classShareTV).toFixed(2)} %`]);
    for (const [kind, p] of Object.entries(coupledData.planets ?? {})) more.push([PLANETS[kind] ?? kind, Object.entries(p.classes).slice(0, 5).map(([k, v]) => `${k} ${(100 * v).toFixed(0)} %`).join(', '), `${num(p.ms, 0)} ms`]);
    table($('coupledMoreTable'), ['', '', ''], more);
    const t = coupledData.tuned ? ` Tuned on Köppen: ${Object.entries(coupledData.tuned.params).map(([k, v]) => `${k.toLowerCase()} ${+(+v).toPrecision(3)}`).join(', ')}.` : '';
    $('coupledNote').textContent = `The whole climate, 160K cells, Node on the developer's desktop: ${num(e.ms, 0)} ms (${e.timing.map(x => `${x.stage} ${num(x.ms, 0)}`).join(' · ')}).${t}`;
}
let rainData = null;
function renderRainTables() {
    if (!rainData) { table($('rainTable'), ['—'], [{ note: 'Run node tuning/climate/rain-check.mjs to fill these tables.' }]); return; }
    const o = rainData.open, d = rainData.openDerivedWinds, v1 = rainData.v1, rows = [];
    for (const k of Object.keys(o.per)) rows.push([k, num(o.per[k], 2), num(d.per[k], 2), v1.perCont[k] !== undefined ? `${num(o.seas.perCont[k], 2)} / ${num(v1.perCont[k], 2)}` : '—']);
    rows.push({ note: `Typical monthly error as a log ratio (0.69 = off by a factor of 2), regions weighted equally: ${num(o.mean, 2)} with real winds, ${num(d.mean, 2)} with the circulation stage's winds (both with real temperature). Last column: two seasons, new vs V1 on the same land.` });
    table($('rainTable'), ['Region', 'Real winds', 'Own winds', 'New / V1 (2 seasons)'], rows);
    const cmp = [
        ['Rain pattern, Jun–Aug (log corr.)', num(o.seas.logCorrJJA), num(d.seas.logCorrJJA), num(v1.logCorrJJA)],
        ['Rain pattern, Dec–Feb', num(o.seas.logCorrDJF), num(d.seas.logCorrDJF), num(v1.logCorrDJF)],
        ['Wet season right way round', pct(o.seas.wetSeason), pct(d.seas.wetSeason), pct(v1.wetSeason)],
        ['Continents, typical error (2 seasons)', num(o.seas.meanCont, 2), num(d.seas.meanCont, 2), num(v1.meanCont, 2)],
        ['Rain belt, degrees off', num(o.belt, 1), num(d.belt, 1), '—'],
        ['Köppen: real temperature + this rain', pct(rainData.truthSwap.new), '—', pct(rainData.truthSwap.v1)],
    ];
    table($('rainCmpTable'), ['Measure', 'New, real winds', 'New, own winds', 'V1'], cmp);
    const list = [...o.named];
    for (const [kind, p] of Object.entries(rainData.planets)) for (const c of p.checks) list.push({ ...c, text: `${PLANETS[kind] ?? kind}: ${c.text}` });
    checkTable($('rainNamedTable'), list);
    const cl = rainData.closed;
    $('rainNote').textContent = `Every stage new on Earth: Köppen ${pct(cl.koppen)} of land vs Beck (V1 38 %); rain error ${num(cl.mean, 2)}; wet season right way round ${pct(cl.seas.wetSeason)}; named ${cl.named.filter(c => c.ok).length}/${cl.named.length}. `
        + `Rain stage ${num(o.ms, 0)} ms for 12 months (Node); settings: ${Object.entries(rainData.params).map(([k, x]) => `${k.replace('RAIN_', '').toLowerCase()} ${+(+x).toPrecision(3)}`).join(', ')}.`;
}
function renderTemperatureTables() {
    if (!tempData) { table($('tempTable'), ['—'], [{ note: 'Run node tuning/climate/temperature-check.mjs to fill these tables.' }]); return; }
    const pc = tempData.perContinent, rows = [];
    for (const k of ['North America', 'South America', 'Europe', 'Africa', 'Asia', 'Australia', 'Greenland', 'Antarctica']) {
        const m = pc[k];
        const better = (m.newJJA + m.newDJF) < (m.v1JJA + m.v1DJF);
        rows.push([k, { text: `${num(m.rmse, 1)} °C`, cls: grade(m.rmse, 3, 5, true) }, `${num(m.rangeSim, 0)} / ${num(m.rangeObs, 0)}`,
            { text: `${num(m.newJJA, 1)} / ${num(m.newDJF, 1)}`, cls: better ? 'good' : 'bad' }, `${num(m.v1JJA, 1)} / ${num(m.v1DJF, 1)}`]);
    }
    rows.push({ note: `Continents weighted equally (without the ice sheets): June–August / December–February error new ${num(tempData.seasonalMean.new, 1)} °C, V1 ${num(tempData.seasonalMean.v1, 1)} °C. Sea (ice-free): ${num(tempData.sea.rmse, 1)} °C monthly error. Europe is too cold because the ocean's heat (the Gulf Stream) arrives with the ocean stage (Phase 4); hot desert summers and the cloudy tropics need rain (Phase 6 coupling).` });
    table($('tempTable'), ['Land', 'Monthly error', 'Swing new / real °C', 'Jun–Aug / Dec–Feb new', 'V1'], rows);
    table($('tempSwapTable'), ['Temperature (+ real rain)', 'Same class', 'Group'], tempData.swaps.map(s => [s.label, pct(s.exact), pct(s.major)]));
    const prow = [];
    for (const [kind, p] of Object.entries(tempData.planets)) for (const c of p.checks) prow.push([`${PLANETS[kind]}: ${c.text}`, { text: c.ok ? 'pass' : 'fail', cls: c.ok ? 'good' : 'bad' }], { note: c.detail });
    table($('tempPlanetTable'), ['Check', ''], prow);
    $('tempNote').textContent = `Settings (physical, with literature values and ranges — config.js): ${Object.entries(tempData.params).map(([k, v]) => `${k.replace('TEMP_', '').toLowerCase()} ${+(+v).toPrecision(3)}`).join(', ')}. `
        + `Temperature stage ${num(tempData.ms, 0)} ms in Node.`;
}
function renderSkeletonTables() {
    const regs = ['Cs (Mediterranean)', 'Cw (dry-winter temperate)', 'Am (tropical monsoon)', 'Dw (dry-winter continental)'];
    table($('skTable'), ['Run on this device', 'Same class', 'Group', 'Cs', 'Cw', 'Am', 'Dw'], skRows.length ? skRows : [{ note: 'Not run yet.' }]);
    if (!skData) return;
    const rows = [];
    for (const r of skData.resolutions) {
        const c = r.configs.k6;
        rows.push([`${r.N.toLocaleString()} cells · 6 points`, pct(c.exact), pct(c.major), ...regs.map(k => pct(c.regimes[k].recall))]);
        rows.push({ note: `new climate ${c.ms} ms (${c.timing.map(t => `${t.stage} ${t.ms.toFixed(0)}`).join(' · ')}); 12 months: ${pct(r.configs.k12.exact)}; no height correction: ${pct(r.configs.k6flat.exact)}` });
    }
    const d = skData.drift.k6;
    rows.push({ note: `Across resolutions the share of land in each class differs by at most ${(100 * d.classShareTV).toFixed(2)} % (group shares ${(100 * d.groupShareSpread).toFixed(2)} pts) — gate ${skData.gate.pass ? 'passed' : 'not met'}. V1 as shipped: temperate share 17.9 → 10.6 % from 40K to 640K.` });
    table($('skNodeTable'), ['Earth, real data', 'Same class', 'Group', 'Cs', 'Cw', 'Am', 'Dw'], rows);
}
$('skRun').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true; btn.classList.add('on'); btn.textContent = 'Running…';
    const lapse = $('skLapse').checked;
    const planet = sk.planet, temperature = planet === 'earth' ? sk.temp : 'ebm';
    try {
        const winds = planet === 'earth' ? sk.winds : 'derived', rain = planet === 'earth' ? sk.rain : 'model';
        const r = await runJob({ cmd: 'newClimate', planet, N: +sk.N, anchors: +sk.K, lapse: lapse ? 6.5 : 0, temperature, winds, rain, detail: sk.detail });
        const what = (temperature === 'ebm' ? `energy balance${r.circ ? ' + derived winds' : ' + real winds'}${r.monthlyP ? ' + new rain' : ' + real rain'}` : 'real temperature')
            + (sk.detail === 'full' ? '' : sk.detail === 'terrain' ? ' · terrain detail, no texture' : ' · smooth (no terrain rain or texture)');
        const evoText = r.evolution ? ` · ${r.evolution.timeMyr} Myr, land ${Math.round(100 * r.evolution.landShare)} %` : '';
        const label = `${PLANETS[planet]}${evoText} · ${r.N.toLocaleString()} cells · ${sk.K} points · ${what}${lapse ? '' : ' · no height correction'}`;
        newRun = { planet, label, raster: r.raster, landPx: r.landPx, monthlyT: r.monthlyT, monthlySL: r.monthlySL, seaIce: r.seaIce, circ: r.circ, ocean: r.ocean, monthlyP: r.monthlyP };
        if (planet !== 'earth') planetCoast = coastFromLand(r.landPx);
        const regs = ['Cs (Mediterranean)', 'Cw (dry-winter temperate)', 'Am (tropical monsoon)', 'Dw (dry-winter continental)'];
        skRows.push(r.score ? [label, pct(r.score.exact), pct(r.score.major), ...regs.map(k => pct(r.score.regimes[k]))] : [label, '—', '—', '—', '—', '—', '—']);
        const tp = r.tempProfile ? ` — temperature: ${Object.entries(r.tempProfile).map(([k, v]) => `${k} ${ms(v)}`).join(', ')}` : '';
        skRows.push({ note: `new climate ${ms(r.climateMs)} (${r.timing.map(t => `${t.stage} ${ms(t.ms)}`).join(' · ')})${tp}; building the planet ${ms(r.meshMs)}; drawing the map ${ms(r.rasterMs)}` });
        state.planet = planet;
        state.source = 'new';
        if (!['koppen', 't2m', 'swing', 'precip', 'slp', 'ocean', 'seaIce'].includes(state.field)) state.field = temperature === 'ebm' ? 't2m' : 'koppen';
        await refresh();
    } catch (err) {
        skRows.push({ note: `Failed: ${err.message}` }); console.error(err);
    } finally {
        btn.disabled = false; btn.classList.remove('on'); btn.textContent = 'Run on this device';
        renderSkeletonTables();
    }
});

$('deviceInfo').textContent = `This device: ${navigator.hardwareConcurrency ?? '?'} cores · ${navigator.userAgent.replace(/\s*\(KHTML.*?\)/, '').slice(0, 140)}`;

// ── Start ─────────────────────────────────────────────────────────────────────
function tick() {
    if (state.view === 'globe') { globe.resize(); globe.render(); }
    requestAnimationFrame(tick);
}
try {
    [audit, seasonTest] = await Promise.all([fetchJson(`${LAB}stage-audit.json`), fetchJson(`${RESULTS}season-test.json`)]);
    skData = await fetchJson(`${LAB}skeleton-check.json`).catch(() => null);
    tempData = await fetchJson(`${LAB}temperature-check.json`).catch(() => null);
    circData = await fetchJson(`${LAB}circulation-check.json`).catch(() => null);
    oceanData = await fetchJson(`${LAB}ocean-check.json`).catch(() => null);
    rainData = await fetchJson(`${LAB}rain-check.json`).catch(() => null);
    coupledData = await fetchJson(`${LAB}coupled-check.json`).catch(() => null);
    renderStageTable();
    renderSeasonTable();
    renderTiming();
    buildSkeletonControls();
    renderSkeletonTables();
    renderTemperatureTables();
    renderCirculationTables();
    renderOceanTables();
    renderRainTables();
    renderCoupledTables();
    await buildCoast();
    await refresh();
} catch (err) {
    showError(err);
}
requestAnimationFrame(tick);
