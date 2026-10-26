// Climate lab worker. On whatever device opens the lab:
//   'v1'       — times V1's climate (unchanged) on the imported Earth at N regions, stage by stage: the speed budget
//   'kernels'  — times the building blocks the new climate is made of, on the 1° grid: diffusion passes,
//                semi-Lagrangian advection, sampling fields onto terrain cells, and per-cell Köppen from 4 anchors
//   'newClimate' — runs the new climate (v2/js/climate/core.js) on the imported Earth or a test planet at N terrain
//                cells — temperature from the energy balance (Phase 2) or real data (the Phase 1 oracle) — scores
//                it against Beck's 0.1° map (Earth), and rasterises the per-cell Köppen and land for the map

import Delaunator from 'https://cdn.jsdelivr.net/npm/delaunator@5.0.1/+esm';
import { setDelaunator } from '../../../js/sphere-mesh.js';
import { SimplexNoise } from '../../../js/simplex-noise.js';
import { computeWind } from '../../../js/wind.js';
import { computeOceanCurrents } from '../../../js/ocean.js';
import { computePrecipitation } from '../../../js/precipitation.js';
import { computeTemperature } from '../../../js/temperature.js';
import { classifyKoppen } from '../../../js/koppen.js';
import { buildEarthMesh, rgbaToGray } from '../../../tuning/climate/lib/earth-mesh.mjs';
import { LatLonGrid } from '../climate/grid.js';
import { synthesizeCell } from '../climate/seasons.js';
import { classifyCell } from '../climate/koppen.js';
import { computeClimate } from '../climate/core.js';
import { energyBalanceTemperature } from '../climate/temperature.js';
import { derivedCirculation } from '../climate/circulation.js';
import { windDrivenOcean } from '../climate/ocean.js';
import { observedWinds, zonalWinds, observedTemperature, observedRain, zonalRain } from '../climate/inputs.js';
import { columnWaterRain } from '../climate/rain.js';
import { buildTestPlanet } from '../climate/test-planets.js';
import { PARAMS, setParams } from '../climate/config.js';
import { planetClimate } from '../climate/climate.js';
import { evolutionWorld } from './evolution-world.js';
import { buildSphere } from '../../../js/sphere-mesh.js';
import { makeRng } from '../../../js/rng.js';
import { elevToHeightKm } from '../../../js/color-map.js';
import { SphereIndex } from '../core/sphere-index.js';
import { compareClasses, groupStats, REGIMES } from '../../../tuning/climate/lib/compare.mjs';

setDelaunator(Delaunator);

// V1's modules log a lot; keep the worker quiet so timings are not dominated by console I/O.
const quiet = () => {};
console.log = quiet; console.info = quiet;

let earthGray = null;
const evoWorlds = new Map();          // Evolution worlds built so far, by ending and terrain size
async function loadEarth() {
    if (earthGray) return earthGray;
    const res = await fetch(new URL('../../../assets/earth.png', import.meta.url));
    const bmp = await createImageBitmap(await res.blob());
    const oc = new OffscreenCanvas(bmp.width, bmp.height);
    const g = oc.getContext('2d');
    g.drawImage(bmp, 0, 0);
    const { data } = g.getImageData(0, 0, bmp.width, bmp.height);
    earthGray = { gray: rgbaToGray(data, bmp.width, bmp.height), width: bmp.width, height: bmp.height };
    return earthGray;
}

async function timeV1(N) {
    const { gray, width, height } = await loadEarth();
    let t = performance.now();
    const e = buildEarthMesh(gray, width, height, { N, seed: 1234, jitter: 0.75 });
    const meshMs = performance.now() - t;
    const stages = [];
    const lap = (name) => { const now = performance.now(); stages.push({ name, ms: now - t }); t = now; };
    t = performance.now();
    const noise = new SimplexNoise(1234);
    const wind = computeWind(e.mesh, e.r_xyz, e.r_elevation, e.plateIsOcean, e.r_plate, noise); lap('Wind (incl. ITCZ scan)');
    const ocean = computeOceanCurrents(e.mesh, e.r_xyz, e.r_elevation, wind); lap('Ocean currents');
    const precip = computePrecipitation(e.mesh, e.r_xyz, e.r_elevation, wind, ocean, 0, 0.3); lap('Precipitation');
    const temp = computeTemperature(e.mesh, e.r_xyz, e.r_elevation, wind, ocean, precip, 0); lap('Temperature');
    classifyKoppen(e.mesh, e.r_elevation, temp, precip); lap('Köppen');
    return { N: e.mesh.numRegions, meshMs, stages, climateMs: stages.reduce((s, x) => s + x.ms, 0) };
}

function timeKernels() {
    const grid = new LatLonGrid(1), { w, h, size } = grid;
    const out = [];
    const a = new Float32Array(size), b = new Float32Array(size);
    for (let c = 0; c < size; c++) a[c] = Math.sin(c * 0.01) * 10 + (c % 7);

    // 1. Diffusion: 5-point stencil, longitude wraps
    let t = performance.now();
    const PASSES = 200;
    let src = a, dst = b;
    for (let p = 0; p < PASSES; p++) {
        for (let j = 0; j < h; j++) {
            const jn = j > 0 ? j - 1 : j, js = j < h - 1 ? j + 1 : j;
            for (let i = 0; i < w; i++) {
                const ie = i < w - 1 ? i + 1 : 0, iw = i > 0 ? i - 1 : w - 1;
                const c = j * w + i;
                dst[c] = 0.5 * src[c] + 0.125 * (src[j * w + ie] + src[j * w + iw] + src[jn * w + i] + src[js * w + i]);
            }
        }
        const s = src; src = dst; dst = s;
    }
    const diffMs = performance.now() - t;
    out.push({ name: `Diffusion pass on the 1° grid (${size.toLocaleString()} cells)`, ms: diffMs / PASSES, unit: 'per pass' });

    // 2. Semi-Lagrangian advection: trace back along a wind, sample bilinearly
    const u = new Float32Array(size), v = new Float32Array(size);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const lat = grid.lat[j]; u[j * w + i] = 8 * Math.cos(3 * lat * Math.PI / 180); v[j * w + i] = 2 * Math.sin(i * 0.05); }
    const STEPS = 50, dt = 3600 * 6, mPerDeg = 111320;
    t = performance.now();
    src = a; dst = b;
    for (let s = 0; s < STEPS; s++) {
        for (let j = 0; j < h; j++) {
            const lat = grid.lat[j], cosl = Math.max(0.05, Math.cos(lat * Math.PI / 180));
            for (let i = 0; i < w; i++) {
                const c = j * w + i;
                const dLat = v[c] * dt / mPerDeg, dLon = u[c] * dt / (mPerDeg * cosl);
                dst[c] = grid.sample(src, lat - dLat, grid.lon[i] - dLon);
            }
        }
        const sw = src; src = dst; dst = sw;
    }
    out.push({ name: 'Semi-Lagrangian advection step (1° grid)', ms: (performance.now() - t) / STEPS, unit: 'per step' });

    // 3. Downscale: sample 4 grid fields onto terrain cells (random points on the sphere)
    for (const n of [160000, 640000, 2500000]) {
        const lat = new Float32Array(n), lon = new Float32Array(n);
        let seed = 12345;
        const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
        t = performance.now();
        for (let r = 0; r < n; r++) {                 // positions → lat/lon, as the core will do once per call
            const z = 2 * rnd() - 1, ph = 2 * Math.PI * rnd(), s = Math.sqrt(1 - z * z);
            lat[r] = Math.asin(z) * 180 / Math.PI; lon[r] = Math.atan2(s * Math.sin(ph), s * Math.cos(ph)) * 180 / Math.PI;
        }
        const f = new Float32Array(n);
        for (let k = 0; k < 4; k++) for (let r = 0; r < n; r++) f[r] += grid.sample(src, lat[r], lon[r]);
        out.push({ name: `Sample 4 fields onto ${n.toLocaleString()} terrain cells`, ms: performance.now() - t, unit: 'total' });
    }

    // 4. Per-cell finishing: 12 months from 4 anchors + Köppen, for 160K cells
    {
        const n = 160000, T12 = new Float64Array(12), P12 = new Float64Array(12);
        const tA = new Float64Array(4), pA = new Float64Array(4);
        let acc = 0;
        t = performance.now();
        for (let r = 0; r < n; r++) {
            const base = (r % 60) - 20;
            tA[0] = base - 8; tA[1] = base; tA[2] = base + 8; tA[3] = base + 1;
            pA[0] = 20 + (r % 90); pA[1] = 50; pA[2] = 80 + (r % 50); pA[3] = 40;
            synthesizeCell(tA, pA, { phase: 0, transform: 'sqrt' }, T12, P12);
            acc += classifyCell(T12, P12);
        }
        out.push({ name: '12 months + Köppen for 160,000 terrain cells', ms: performance.now() - t, unit: 'total', _acc: acc });
    }
    return out;
}

const REF = new URL('../../../tuning/climate/data/ref1deg/', import.meta.url);
const refCache = {};
async function ref(file, Type) {
    refCache[file] ??= fetch(new URL(file, REF)).then(r => { if (!r.ok) throw new Error(`${r.status} ${file}`); return r.arrayBuffer(); }).then(b => new Type(b));
    return refCache[file];
}

/**
 * Run the new climate on Earth or a test planet. temperature: 'ebm' (the Phase 2 energy balance) or 'observed'
 * (real Earth data — the Phase 1 oracle). winds: 'derived' (Phase 3) or 'observed' (Earth). rain: 'model' (the
 * Phase 5 rain stage) or 'observed' (Earth's real rain, to judge the other stages on their own).
 */
async function runNewClimate({ planet = 'earth', N, anchors = 6, lapse = 6.5, temperature = 'ebm', winds = 'derived', rain = 'model', detail = 'full', mapW = 1440, mapH = 720 }) {
    // detail below the climate grid (Phase 9): 'full' — terrain-scale rain and a gentle texture; 'terrain' — no texture;
    // 'smooth' — neither (as in Phase 8)
    const detailOpts = detail === 'smooth' ? { rainPerKm: 0, texture: null } : detail === 'terrain' ? { texture: null } : {};
    const slope0 = PARAMS.RAIN_SLOPE_FACTOR;
    if (detail === 'smooth') setParams({ RAIN_SLOPE_FACTOR: 0 });
    try { return await runNewClimateWith({ planet, N, anchors, lapse, temperature, winds, rain, mapW, mapH, detailOpts }); }
    finally { setParams({ RAIN_SLOPE_FACTOR: slope0 }); }
}
async function runNewClimateWith({ planet, N, anchors, lapse, temperature, winds, rain, mapW, mapH, detailOpts }) {
    let t = performance.now();
    let xyz, elevKm, mesh, axes = 'y-up', index = null, evo = null;
    if (planet === 'evolution' || planet === 'evolutionSuper') {
        // an Evolution world: the V2 engine's whole-planet history (≈ a minute, kept for the next run), its last
        // frame's terrain at N cells — z north, heights in km — exactly what Evolution would hand the climate
        const ending = planet === 'evolutionSuper' ? 'supercontinent' : 'none', key = `${ending}|${N}`;
        evo = evoWorlds.get(key) ?? evolutionWorld({ ending, cells: N });
        evoWorlds.set(key, evo);
        xyz = evo.xyz; elevKm = evo.heightKm; mesh = evo.terrain; axes = 'z-up'; index = evo.terrain.index;
    } else if (planet === 'earth') {
        const { gray, width, height } = await loadEarth();
        const e = buildEarthMesh(gray, width, height, { N, seed: 1234, jitter: 0.75 });
        xyz = e.r_xyz; mesh = e.mesh;
        elevKm = new Float32Array(mesh.numRegions);
        for (let r = 0; r < mesh.numRegions; r++) elevKm[r] = elevToHeightKm(e.r_elevation[r]);
    } else {
        const p = buildTestPlanet(planet, N, buildSphere, makeRng(7));
        xyz = p.xyz; mesh = p.mesh; elevKm = p.elevKm;
    }
    const n = elevKm.length;                         // (V1 meshes count numRegions, V2 terrain meshes numCells)
    const meshMs = performance.now() - t;

    let stages;
    if (planet === 'earth') {
        const [t2m, precip, u10, v10] = await Promise.all(['t2m', 'precip', 'u10', 'v10'].map(f => ref(`${f}.f32`, Float32Array)));
        const rainStage = rain === 'observed' ? observedRain(precip) : columnWaterRain();
        if (temperature === 'observed') {                      // the Phase 1 oracle: real temperature, real winds and rain
            stages = { winds: observedWinds(u10, v10), temperature: observedTemperature(t2m), rain: observedRain(precip) };
        } else if (winds === 'observed') {                     // Phase 2 as scored: the energy balance with real winds
            stages = { winds: observedWinds(u10, v10), temperature: energyBalanceTemperature(), rain: rainStage };
        } else {                                               // Phases 3–5: temperature ↔ derived winds ↔ ocean, then rain
            stages = { temperature: energyBalanceTemperature(), circulation: derivedCirculation(), ocean: windDrivenOcean(), rain: rainStage };
        }
    } else {
        stages = { temperature: energyBalanceTemperature(), circulation: derivedCirculation(), ocean: windDrivenOcean(), rain: columnWaterRain() };
    }
    const res = evo ? planetClimate({ xyz, elevKm, axes }, { anchors, lapseRateCPerKm: lapse, ...detailOpts })
        : computeClimate({ xyz, elevKm, axes }, { anchors, lapseRateCPerKm: lapse, stages, ...detailOpts });
    const climateMs = res.timing.reduce((s, x) => s + x.ms, 0);

    let score = null;
    if (planet === 'earth') {                        // against Beck 0.1° at each terrain cell
        const k01 = await ref('koppen_beck_0p1.u8', Uint8Array);
        const truth = new Uint8Array(n);
        for (let r = 0; r < n; r++) {
            let i = Math.floor((res.cell.lon[r] + 180) * 10), j = Math.floor((90 - res.cell.lat[r]) * 10);
            i = ((i % 3600) + 3600) % 3600; j = Math.max(0, Math.min(1799, j));
            truth[r] = k01[j * 3600 + i];
        }
        const cmp = compareClasses(truth, res.cell.koppen);
        const regimes = Object.fromEntries(Object.entries(REGIMES).map(([k, codes]) => [k, groupStats(cmp, codes).recall]));
        score = { exact: cmp.exact, major: cmp.major, graded: cmp.graded, regimes };
    }

    // rasterise: every map pixel shows its nearest terrain cell's class (V1's frame: y north, lon = atan2(x, z);
    // Evolution's: z north, lon = atan2(y, x))
    t = performance.now();
    index ??= new SphereIndex(xyz, mesh, n > 1e6 ? 1 : 2);
    const raster = new Uint8Array(mapW * mapH), landPx = new Uint8Array(mapW * mapH);
    for (let py = 0; py < mapH; py++) {
        const lat = (90 - (py + 0.5) * 180 / mapH) * Math.PI / 180, cl = Math.cos(lat), sl = Math.sin(lat);
        for (let px = 0; px < mapW; px++) {
            const lon = ((px + 0.5) * 360 / mapW - 180) * Math.PI / 180;
            const r = axes === 'z-up' ? index.nearest(cl * Math.cos(lon), cl * Math.sin(lon), sl) : index.nearest(cl * Math.sin(lon), sl, cl * Math.cos(lon));
            raster[py * mapW + px] = res.cell.koppen[r];
            landPx[py * mapW + px] = elevKm[r] > 0 ? 1 : 0;
        }
    }
    const rasterMs = performance.now() - t;
    const temp = res.stages.temperature, circ = res.stages.circulation, oc = res.stages.ocean;
    return {
        planet, N: n, meshMs, climateMs, rasterMs, timing: res.timing, raster, landPx,
        evolution: evo ? { timeMyr: evo.timeMyr, reachedEnding: evo.reachedEnding, landShare: evo.landShare, historyMs: evo.ms.history, terrainMs: evo.ms.terrain } : null,
        monthlyT: temp.monthly ? Float32Array.from(temp.monthly) : null, tempProfile: temp.profile ?? null,
        monthlySL: temp.monthlySL ? Float32Array.from(temp.monthlySL) : null, seaIce: temp.seaIce ? Float32Array.from(temp.seaIce) : null,
        circ: circ ? { u: circ.u, v: circ.v, slp: circ.slp, itczLat: circ.itczLat } : null,
        monthlyP: res.stages.rain.source === 'column water' ? Float32Array.from(res.months.P) : null,
        ocean: oc ? { u: oc.u, v: oc.v, psi: oc.psi, qflux: oc.qflux, upwelling: oc.upwelling } : null,
        score,
    };
}

self.onmessage = async (e) => {
    const { id, cmd, N } = e.data;
    try {
        const result = cmd === 'v1' ? await timeV1(N) : cmd === 'newClimate' ? await runNewClimate(e.data) : timeKernels();
        const transfer = [];
        if (result?.raster) {
            for (const a of [result.raster, result.landPx, result.monthlyT, result.monthlySL, result.seaIce, result.monthlyP]) if (a) transfer.push(a.buffer);
            if (result.circ) for (const a of Object.values(result.circ)) transfer.push(a.buffer);
            if (result.ocean) for (const a of Object.values(result.ocean)) transfer.push(a.buffer);
        }
        self.postMessage({ id, ok: true, result }, transfer);
    } catch (err) {
        self.postMessage({ id, ok: false, error: String(err && err.stack || err) });
    }
};
