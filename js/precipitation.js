// Precipitation simulation: moisture advection driven by wind, ocean warmth,
// orographic effects, ITCZ uplift, frontal convergence, and polar fronts.
// Computes per-region precipitation for summer and winter seasons.

import { CLIMATE } from './climate-config.js';
import { smoothstep } from './wind.js';
import { computeGradients } from './wind.js';
import { elevToHeightKm } from './color-map.js';
import { computeHeuristicPrecipitation, computeHeuristicWindField } from './heuristic-precip.js';
import { smoothField, makeItczLookup, percentile } from './climate-util.js';
import { annualBaseTemperatureC } from './temperature.js';
import { buildSphere } from './sphere-mesh.js';
import { makeRng } from './rng.js';

const DEG = Math.PI / 180;

// Moisture capacity never falls below this fraction of the warm-air value (polar desert, not zero)
const COLD_CAPACITY_FLOOR = 0.25;

// ── Rain shadow on a fixed reference mesh ──────────────────────────────────────
// The rain shadow is seeded on the leeward slopes of terrain above 0.8 km, and "leeward" is the sign of
// wind · elevation gradient. Where the slope along the wind is small that sign flips at the scale of a
// cell, so a finer mesh breaks the seeds into more, smaller patches, and each patch casts a full-length
// shadow: the shadowed share of land went from 78 % at 40K cells to 90 % at 2.56M, and the mean rain over
// land fell by a quarter across this step. Smoothing the elevation, or a slope threshold, on the planet's
// own mesh did not stop it. So from SHADOW_REF_REGIONS cells up the field is computed on one fixed mesh of
// that size, from the planet's elevation and wind averaged over each reference cell's footprint and
// smoothed to the same scale, and interpolated back onto the planet's cells: the same shadow at every
// Detail setting, at a cost that stops growing with it. Below that the planet's own mesh is used, with the
// same smoothing in km.

const SHADOW_REF_REGIONS = 160000;
const SHADOW_REF_JITTER = 0.75;
const SHADOW_REF_SEED = 7;
const SHADOW_REF_SMOOTH_PASSES = 4;   // passes on the reference mesh (about 65 km of spread)

let shadowRefMesh = null;
const shadowMapCache = new WeakMap();   // planet mesh → its two maps to and from the reference mesh (a slider re-runs this with the same mesh)

/** East/north unit vectors per region, Y being the pole (the convention wind.js uses). */
function localFrames(r_xyz, n) {
    const eastX = new Float32Array(n), eastY = new Float32Array(n), eastZ = new Float32Array(n);
    const northX = new Float32Array(n), northY = new Float32Array(n), northZ = new Float32Array(n);
    for (let r = 0; r < n; r++) {
        const x = r_xyz[3 * r], y = r_xyz[3 * r + 1], z = r_xyz[3 * r + 2];
        let ex = z, ez = -x;
        let elen = Math.sqrt(ex * ex + ez * ez);
        if (elen < 1e-10) { ex = 1; ez = 0; elen = 1; }
        ex /= elen; ez /= elen;
        const nx = y * ez, ny = z * ex - x * ez, nz = -y * ex;
        const nlen = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
        eastX[r] = ex; eastZ[r] = ez;
        northX[r] = nx / nlen; northY[r] = ny / nlen; northZ[r] = nz / nlen;
    }
    return { eastX, eastY, eastZ, northX, northY, northZ };
}

/** The reference mesh, built once. */
function getShadowRefMesh() {
    if (shadowRefMesh) return shadowRefMesh;
    const { mesh, r_xyz } = buildSphere(SHADOW_REF_REGIONS, SHADOW_REF_JITTER, makeRng(SHADOW_REF_SEED));
    shadowRefMesh = { mesh, r_xyz, frames: localFrames(r_xyz, mesh.numRegions) };
    return shadowRefMesh;
}

/** Greedy walk to the region of `mesh` nearest to the unit vector (px, py, pz), from `start`. */
function nearestRegion(mesh, r_xyz, px, py, pz, start) {
    const { adjOffset, adjList } = mesh;
    let cur = start;
    let best = px * r_xyz[3 * cur] + py * r_xyz[3 * cur + 1] + pz * r_xyz[3 * cur + 2];
    for (let improved = true; improved;) {
        improved = false;
        for (let i = adjOffset[cur], end = adjOffset[cur + 1]; i < end; i++) {
            const nb = adjList[i];
            const d = px * r_xyz[3 * nb] + py * r_xyz[3 * nb + 1] + pz * r_xyz[3 * nb + 2];
            if (d > best) { best = d; cur = nb; improved = true; }
        }
    }
    return cur;
}

/** For every region of `from`, the nearest region of `to`. Sweeps `from` breadth-first so each walk starts at its neighbour's answer. */
function nearestMap(fromMesh, from_xyz, toMesh, to_xyz) {
    const n = fromMesh.numRegions;
    const out = new Int32Array(n).fill(-1);
    const queue = new Int32Array(n);
    let head = 0, tail = 0;
    out[0] = nearestRegion(toMesh, to_xyz, from_xyz[0], from_xyz[1], from_xyz[2], 0);
    queue[tail++] = 0;
    while (head < tail) {
        const r = queue[head++];
        for (let i = fromMesh.adjOffset[r], end = fromMesh.adjOffset[r + 1]; i < end; i++) {
            const nb = fromMesh.adjList[i];
            if (out[nb] >= 0) continue;
            out[nb] = nearestRegion(toMesh, to_xyz, from_xyz[3 * nb], from_xyz[3 * nb + 1], from_xyz[3 * nb + 2], out[r]);
            queue[tail++] = nb;
        }
    }
    return out;
}

/**
 * Passes of neighbour averaging that smooth a mesh of this size to the reference mesh's scale. Repeated
 * averaging spreads by about edge x sqrt(passes), so the passes go as the square of the edge ratio.
 */
function shadowSmoothPasses(avgEdgeKm) {
    const refEdgeKm = (Math.PI * 6371) / Math.sqrt(SHADOW_REF_REGIONS);
    return Math.round(SHADOW_REF_SMOOTH_PASSES * Math.pow(refEdgeKm / avgEdgeKm, 2));
}

/**
 * What the rain-shadow field is computed from on one mesh: its elevation smoothed by `passes` (the land
 * mask is kept as classified), in km, and the orographic gradient (the planet's own recipe: ~200 km of
 * smoothing blended 60/40 with the field). `elevation` is smoothed in place.
 */
function makeShadowGrid(mesh, r_xyz, frames, elevation, isLand, passes) {
    const n = mesh.numRegions;
    const edgeKm = (Math.PI * 6371) / Math.sqrt(n);
    if (passes > 0) smoothField(mesh, elevation, passes);
    const heightKm = new Float32Array(n);
    for (let r = 0; r < n; r++) heightKm[r] = elevToHeightKm(Math.max(0, elevation[r]));
    const smoothed = new Float32Array(elevation);
    smoothField(mesh, smoothed, Math.max(2, Math.round(200 / edgeKm)));
    for (let r = 0; r < n; r++) smoothed[r] = smoothed[r] * 0.6 + elevation[r] * 0.4;
    const gradE = new Float32Array(n), gradN = new Float32Array(n);
    computeGradients(mesh, r_xyz, smoothed,
        frames.eastX, frames.eastY, frames.eastZ, frames.northX, frames.northY, frames.northZ, gradE, gradN);
    return { mesh, r_xyz, r_isLand: isLand, r_elevation: elevation, r_heightKm: heightKm,
        r_elevGradE: gradE, r_elevGradN: gradN, avgEdgeKm: edgeKm };
}

/** A wind field smoothed by `passes` (as copies: the caller's wind is used elsewhere), with its 3D vectors. */
function smoothedWind(mesh, frames, windE, windN, passes) {
    const n = mesh.numRegions;
    const wE = new Float32Array(windE), wN = new Float32Array(windN);
    if (passes > 0) { smoothField(mesh, wE, passes); smoothField(mesh, wN, passes); }
    const x = new Float32Array(n), y = new Float32Array(n), z = new Float32Array(n);
    for (let r = 0; r < n; r++) {
        x[r] = wE[r] * frames.eastX[r] + wN[r] * frames.northX[r];
        y[r] = wE[r] * frames.eastY[r] + wN[r] * frames.northY[r];
        z[r] = wE[r] * frames.eastZ[r] + wN[r] * frames.northZ[r];
    }
    return { wE, wN, x, y, z };
}

/** The planet's elevation averaged onto the reference mesh, as a grid for the rain shadow, with the maps between the two meshes. */
function makeShadowRefGrid(mesh, r_xyz, r_elevation) {
    const ref = getShadowRefMesh();
    const nRef = ref.mesh.numRegions;
    let maps = shadowMapCache.get(mesh);
    if (!maps) {
        maps = {
            refToPlanet: nearestMap(ref.mesh, ref.r_xyz, mesh, r_xyz),
            planetToRef: nearestMap(mesh, r_xyz, ref.mesh, ref.r_xyz),
        };
        shadowMapCache.set(mesh, maps);
    }
    const { refToPlanet, planetToRef } = maps;

    // Each reference cell takes the mean elevation of the planet's cells in its footprint (land cells if most of
    // them are land, else ocean cells), so a finer planet is averaged down to the reference scale instead of
    // contributing its cell-scale detail; a cell with none takes the nearest planet cell.
    const n = mesh.numRegions;
    const landCount = new Int32Array(nRef), oceanCount = new Int32Array(nRef);
    const landSum = new Float64Array(nRef), oceanSum = new Float64Array(nRef);
    for (let r = 0; r < n; r++) {
        const c = planetToRef[r], e = r_elevation[r];
        if (e > 0) { landCount[c]++; landSum[c] += e; } else { oceanCount[c]++; oceanSum[c] += e; }
    }
    const elevation = new Float32Array(nRef), isLand = new Uint8Array(nRef);
    for (let c = 0; c < nRef; c++) {
        let e;
        if (landCount[c] + oceanCount[c] === 0) e = r_elevation[refToPlanet[c]];
        else if (landCount[c] >= oceanCount[c]) e = landSum[c] / landCount[c];
        else e = oceanSum[c] / oceanCount[c];
        elevation[c] = e;
        isLand[c] = e > 0 ? 1 : 0;
    }
    // Averaging smooths a fine planet but a planet near the reference scale is point-sampled, so smooth them all alike
    const grid = makeShadowGrid(ref.mesh, ref.r_xyz, ref.frames, elevation, isLand, SHADOW_REF_SMOOTH_PASSES);
    return { ref, refToPlanet, planetToRef, grid };
}

/**
 * Rain-shadow field: leeward slopes of high terrain seed negative values, windward slopes positive
 * ones; the shadow travels downwind (foehn drying) and the windward rain extends upwind (rising air
 * condenses approaching the mountains). Returns a field in about -1..1, smoothed ~150 km.
 *
 * @param grid  { mesh, r_xyz, r_isLand, r_elevation, r_heightKm, r_elevGradE, r_elevGradN, avgEdgeKm }
 */
function computeRainShadowField(grid, r_windE, r_windN, r_wind3dX, r_wind3dY, r_wind3dZ) {
    const { mesh, r_xyz, r_isLand, r_elevation, r_heightKm, r_elevGradE, r_elevGradN, avgEdgeKm } = grid;
    const numRegions = mesh.numRegions;
    const { adjOffset, adjList } = mesh;
    const rainShadow = new Float32Array(numRegions);

    // Seed: local orographic effect at each cell
    // Only significant terrain (≥0.8 km) seeds shadows — small hills
    // shouldn't cast continent-scale rain shadows.
    for (let r = 0; r < numRegions; r++) {
        if (!r_isLand[r] || r_elevation[r] <= 0) continue;
        const we = r_windE[r], wn = r_windN[r];
        const windDotGrad = we * r_elevGradE[r] + wn * r_elevGradN[r];
        const heightKm = r_heightKm[r];
        if (heightKm < 0.8) continue; // skip low terrain
        const heightScale = Math.min(1, (heightKm - 0.5) / 2.5);
        if (windDotGrad > 0) {
            rainShadow[r] = Math.min(1, windDotGrad * 20) * heightScale;
        } else if (windDotGrad < 0) {
            rainShadow[r] = -Math.min(1, -windDotGrad * 18) * heightScale;
        }
    }

    // Pre-compute wind-aligned neighbor lists once — avoids
    // redundant dot-product calculations inside every propagation
    // iteration.  Two sets: "upwind" (nb's wind points toward r,
    // for shadow propagation) and "downwind" (r's wind points
    // toward nb, for windward propagation).
    const maxNbTotal = adjList.length;
    const upNb = new Int32Array(maxNbTotal);
    const upWt = new Float32Array(maxNbTotal);
    const upOff = new Int32Array(numRegions + 1);
    const dnNb = new Int32Array(maxNbTotal);
    const dnWt = new Float32Array(maxNbTotal);
    const dnOff = new Int32Array(numRegions + 1);
    let upCount = 0, dnCount = 0;
    for (let r = 0; r < numRegions; r++) {
        upOff[r] = upCount;
        dnOff[r] = dnCount;
        if (!r_isLand[r]) continue;
        const end = adjOffset[r + 1];
        for (let ni = adjOffset[r]; ni < end; ni++) {
            const nb = adjList[ni];
            const dx = r_xyz[3 * r] - r_xyz[3 * nb];
            const dy = r_xyz[3 * r + 1] - r_xyz[3 * nb + 1];
            const dz = r_xyz[3 * r + 2] - r_xyz[3 * nb + 2];
            // Upwind: wind at nb points toward r
            const upDot = r_wind3dX[nb] * dx + r_wind3dY[nb] * dy + r_wind3dZ[nb] * dz;
            if (upDot > 0) { upNb[upCount] = nb; upWt[upCount] = upDot; upCount++; }
            // Downwind: wind at r points toward nb (direction is -dx,-dy,-dz)
            const dnDot = -(r_wind3dX[r] * dx + r_wind3dY[r] * dy + r_wind3dZ[r] * dz);
            if (dnDot > 0) { dnNb[dnCount] = nb; dnWt[dnCount] = dnDot; dnCount++; }
        }
    }
    upOff[numRegions] = upCount;
    dnOff[numRegions] = dnCount;

    // --- Pass 1: Propagate shadow DOWNWIND (~2500 km, 15% survives) ---
    const shadowHops = Math.max(8, Math.round(CLIMATE.PRECIP_RS_SHADOW_PROP_KM / avgEdgeKm));
    const shadowDecay = 1 - Math.pow(0.15, 1 / shadowHops);
    const shadowField = new Float32Array(rainShadow);
    // Reusable ping-pong buffers for both shadow and windward passes
    let src = new Float32Array(shadowField);
    let dst = new Float32Array(numRegions);
    for (let iter = 0; iter < shadowHops; iter++) {
        for (let r = 0; r < numRegions; r++) {
            let upVal = 0, upW = 0;
            const uEnd = upOff[r + 1];
            for (let ui = upOff[r]; ui < uEnd; ui++) {
                const val = src[upNb[ui]];
                if (val < 0) { upVal += val * upWt[ui]; upW += upWt[ui]; }
            }
            if (upW > 0) {
                const carried = (upVal / upW) * (1 - shadowDecay);
                dst[r] = Math.min(src[r], carried);
            } else {
                dst[r] = src[r];
            }
        }
        const swap = src; src = dst; dst = swap;
    }
    for (let r = 0; r < numRegions; r++) {
        if (src[r] < shadowField[r]) shadowField[r] = src[r];
    }

    // --- Pass 2: Propagate windward rain UPWIND (~1500 km, 25% survives) ---
    const windwardHops = Math.max(6, Math.round(1500 / avgEdgeKm));
    const windwardDecay = 1 - Math.pow(0.25, 1 / windwardHops);
    const windwardField = new Float32Array(rainShadow);
    // Reuse ping-pong buffers from shadow pass
    src.set(windwardField);
    dst.fill(0);
    for (let iter = 0; iter < windwardHops; iter++) {
        for (let r = 0; r < numRegions; r++) {
            let dnVal = 0, dnW = 0;
            const dEnd = dnOff[r + 1];
            for (let di = dnOff[r]; di < dEnd; di++) {
                const val = src[dnNb[di]];
                if (val > 0) { dnVal += val * dnWt[di]; dnW += dnWt[di]; }
            }
            if (dnW > 0) {
                const carried = (dnVal / dnW) * (1 - windwardDecay);
                dst[r] = Math.max(src[r], carried);
            } else {
                dst[r] = src[r];
            }
        }
        const swap = src; src = dst; dst = swap;
    }
    for (let r = 0; r < numRegions; r++) {
        if (src[r] > windwardField[r]) windwardField[r] = src[r];
    }

    // Merge: shadow dominates if present, otherwise take windward
    for (let r = 0; r < numRegions; r++) {
        rainShadow[r] = shadowField[r] < 0 ? shadowField[r] : windwardField[r];
    }

    // Smooth ~150 km so the zones read clearly
    const rsSmoothPasses = Math.max(2, Math.round(150 / avgEdgeKm));
    smoothField(mesh, rainShadow, rsSmoothPasses);
    return rainShadow;
}

/** The rain-shadow field for one season on the planet's own mesh (below SHADOW_REF_REGIONS cells). */
function rainShadowOnMesh(grid, frames, windE, windN) {
    const w = smoothedWind(grid.mesh, frames, windE, windN, shadowSmoothPasses(grid.avgEdgeKm));
    return computeRainShadowField(grid, w.wE, w.wN, w.x, w.y, w.z);
}

/**
 * The rain-shadow field for one season, computed on the reference mesh and interpolated onto the planet's
 * land cells (inverse-distance weights over the nearest reference cell and its land neighbours).
 */
function rainShadowFromRef(sr, mesh, r_xyz, r_isLand, frames, windE, windN) {
    const { ref, refToPlanet, planetToRef, grid } = sr;
    const nRef = ref.mesh.numRegions;
    const n = mesh.numRegions;
    // Mean wind vector over each reference cell's footprint (the planet's land cells for a land cell, else its ocean
    // cells), in the reference cell's own east/north frame; a cell with none takes the nearest planet cell.
    const sx = new Float64Array(nRef), sy = new Float64Array(nRef), sz = new Float64Array(nRef), cnt = new Int32Array(nRef);
    for (let r = 0; r < n; r++) {
        const c = planetToRef[r];
        if ((r_isLand[r] ? 1 : 0) !== grid.r_isLand[c]) continue;
        const we = windE[r], wn = windN[r];
        sx[c] += we * frames.eastX[r] + wn * frames.northX[r];
        sy[c] += we * frames.eastY[r] + wn * frames.northY[r];
        sz[c] += we * frames.eastZ[r] + wn * frames.northZ[r];
        cnt[c]++;
    }
    const rf = ref.frames;
    const wE = new Float32Array(nRef), wN = new Float32Array(nRef);
    for (let c = 0; c < nRef; c++) {
        let vx, vy, vz;
        if (cnt[c] > 0) { vx = sx[c] / cnt[c]; vy = sy[c] / cnt[c]; vz = sz[c] / cnt[c]; }
        else {
            const p = refToPlanet[c], we = windE[p], wn = windN[p];
            vx = we * frames.eastX[p] + wn * frames.northX[p];
            vy = we * frames.eastY[p] + wn * frames.northY[p];
            vz = we * frames.eastZ[p] + wn * frames.northZ[p];
        }
        wE[c] = vx * rf.eastX[c] + vy * rf.eastY[c] + vz * rf.eastZ[c];
        wN[c] = vx * rf.northX[c] + vy * rf.northY[c] + vz * rf.northZ[c];
    }
    const w = smoothedWind(ref.mesh, rf, wE, wN, SHADOW_REF_SMOOTH_PASSES);
    const field = computeRainShadowField(grid, w.wE, w.wN, w.x, w.y, w.z);

    const out = new Float32Array(n);
    const { adjOffset, adjList } = ref.mesh;
    const refXyz = ref.r_xyz, refLand = grid.r_isLand;
    const eps = Math.pow(0.25 * grid.avgEdgeKm / 6371, 2);   // squared chord on the unit sphere, a quarter of a reference cell
    for (let r = 0; r < n; r++) {
        if (!r_isLand[r]) continue;
        const px = r_xyz[3 * r], py = r_xyz[3 * r + 1], pz = r_xyz[3 * r + 2];
        const c0 = planetToRef[r];
        let sw = 0, sv = 0;
        for (let k = adjOffset[c0] - 1, kEnd = adjOffset[c0 + 1]; k < kEnd; k++) {
            const c = k < adjOffset[c0] ? c0 : adjList[k];   // the nearest cell first, then its neighbours
            if (!refLand[c]) continue;
            const dx = refXyz[3 * c] - px, dy = refXyz[3 * c + 1] - py, dz = refXyz[3 * c + 2] - pz;
            const wgt = 1 / (dx * dx + dy * dy + dz * dz + eps);
            sw += wgt; sv += wgt * field[c];
        }
        out[r] = sw > 0 ? sv / sw : 0;
    }
    return out;
}


// ── Wind convergence ─────────────────────────────────────────────────────────
// Compute per-region convergence of the wind field. Negative divergence means
// winds are piling into a region (frontal zone / ITCZ-like uplift). We measure
// this as net inward flux: for each neighbor pair, how much does the neighbor's
// wind point toward us vs. our wind point toward the neighbor?

function computeWindConvergence(mesh, r_xyz,
    r_wind3dX, r_wind3dY, r_wind3dZ) {
    const { adjOffset, adjList, numRegions } = mesh;
    const convergence = new Float32Array(numRegions);

    for (let r = 0; r < numRegions; r++) {
        // Wind at r in 3D (pre-computed)
        const wdx = r_wind3dX[r];
        const wdy = r_wind3dY[r];
        const wdz = r_wind3dZ[r];

        let conv = 0;
        let count = 0;
        const end = adjOffset[r + 1];
        for (let ni = adjOffset[r]; ni < end; ni++) {
            const nb = adjList[ni];
            // Direction from r to nb
            const dx = r_xyz[3 * nb] - r_xyz[3 * r];
            const dy = r_xyz[3 * nb + 1] - r_xyz[3 * r + 1];
            const dz = r_xyz[3 * nb + 2] - r_xyz[3 * r + 2];

            // inFlux - outFlux = -(nw·d) - (w·d) = -((nw + w)·d)
            conv -= (r_wind3dX[nb] + wdx) * dx
                  + (r_wind3dY[nb] + wdy) * dy
                  + (r_wind3dZ[nb] + wdz) * dz;
            count++;
        }

        // Normalize by neighbor count; positive = converging, negative = diverging
        convergence[r] = count > 0 ? conv / count : 0;
    }

    return convergence;
}

// ── Upwind moisture advection ────────────────────────────────────────────────
// For each land cell, accumulate moisture from upwind neighbors.
// Moisture originates at coast cells proportional to ocean warmth and
// depletes with distance and elevation gain.

function advectMoisture(mesh, r_xyz, r_heightKm, r_isLand,
    r_windE, r_windN,
    r_wind3dX, r_wind3dY, r_wind3dZ,
    r_oceanWarmth, r_coastDistLand, maxHops, avgEdgeKm) {
    const { adjOffset, adjList, numRegions } = mesh;

    const moisture = new Float32Array(numRegions);

    // Initialize moisture: coastal land cells from adjacent ocean warmth,
    // ocean cells from their own warmth
    for (let r = 0; r < numRegions; r++) {
        if (!r_isLand[r]) {
            // Ocean cells: base moisture proportional to warmth
            const warmth = r_oceanWarmth ? r_oceanWarmth[r] : 0;
            moisture[r] = CLIMATE.PRECIP_OCEAN_MOISTURE_BASE + 0.35 * Math.max(0, warmth);
            continue;
        }
        if (r_coastDistLand[r] !== 0) continue; // not a coast cell

        // Coastal land cell — check for onshore wind
        let warmthSum = 0;
        let oceanCount = 0;
        let oceanDirX = 0, oceanDirY = 0, oceanDirZ = 0;
        const end = adjOffset[r + 1];
        for (let ni = adjOffset[r]; ni < end; ni++) {
            const nb = adjList[ni];
            if (!r_isLand[nb]) {
                oceanCount++;
                if (r_oceanWarmth) warmthSum += r_oceanWarmth[nb];
                oceanDirX += r_xyz[3 * nb] - r_xyz[3 * r];
                oceanDirY += r_xyz[3 * nb + 1] - r_xyz[3 * r + 1];
                oceanDirZ += r_xyz[3 * nb + 2] - r_xyz[3 * r + 2];
            }
        }
        if (oceanCount === 0) continue;

        const avgWarmth = warmthSum / oceanCount;

        // Wind direction in 3D (pre-computed)
        const wdx = r_wind3dX[r];
        const wdy = r_wind3dY[r];
        const wdz = r_wind3dZ[r];

        // Onshore = wind blows FROM ocean toward land = wind dot (ocean→region) < 0
        const windDotOcean = wdx * oceanDirX + wdy * oceanDirY + wdz * oceanDirZ;
        const onshore = windDotOcean < 0 ? 1.0 : 0.25;

        // Base moisture: warm currents provide more, cold currents less
        const warmthFactor = 0.5 + 0.5 * Math.max(-0.8, Math.min(1, avgWarmth));
        moisture[r] = onshore * warmthFactor;
    }

    // Base friction: ~78% moisture survives the full maxHops
    // distance over flat terrain. Per-hop retention = 0.78^(1/maxHops).
    const depletionBase = 1 - Math.pow(CLIMATE.PRECIP_ADVECT_FLAT_SURVIVAL, 1 / maxHops);

    // Iterative downwind propagation (ping-pong double-buffering)
    let src = moisture;
    let dst = new Float32Array(numRegions);
    for (let iter = 0; iter < maxHops; iter++) {
        for (let r = 0; r < numRegions; r++) {
            if (!r_isLand[r]) { dst[r] = src[r]; continue; }

            const we = r_windE[r], wn = r_windN[r];
            if (we * we + wn * wn < 1e-6) { dst[r] = src[r]; continue; }

            // Wind direction in 3D (pre-computed)
            const wdx = r_wind3dX[r];
            const wdy = r_wind3dY[r];
            const wdz = r_wind3dZ[r];

            // Find upwind neighbors (those where wind at neighbor points toward us)
            // Track weighted-average upwind elevation for gradient-based depletion
            let upwindMoisture = 0;
            let upwindWeight = 0;
            let upwindHeightSum = 0;
            const heightHere = r_heightKm[r];
            const end = adjOffset[r + 1];
            for (let ni = adjOffset[r]; ni < end; ni++) {
                const nb = adjList[ni];
                // Direction from nb to r
                const dx = r_xyz[3 * r] - r_xyz[3 * nb];
                const dy = r_xyz[3 * r + 1] - r_xyz[3 * nb + 1];
                const dz = r_xyz[3 * r + 2] - r_xyz[3 * nb + 2];

                // Alignment: how much does wind at nb point toward r?
                const dot = r_wind3dX[nb] * dx + r_wind3dY[nb] * dy + r_wind3dZ[nb] * dz;
                if (dot > 0) {
                    upwindMoisture += src[nb] * dot;
                    upwindHeightSum += r_heightKm[nb] * dot;
                    upwindWeight += dot;
                }
            }

            if (upwindWeight > 0) {
                const incoming = upwindMoisture / upwindWeight;
                const upwindHeight = upwindHeightSum / upwindWeight;

                // Depletion depends on physical height GAIN (km) from upwind.
                const heightGain = Math.max(0, heightHere - upwindHeight);

                // Height gain per hop (km) shrinks at higher resolution.
                // Multiply by maxHops to get total rise over the advection
                // distance. A ~1 km total rise dumps significant moisture,
                // ~2 km near-total.
                const normalizedGain = heightGain * maxHops;
                const elevDepletion = Math.min(0.8, normalizedGain * CLIMATE.PRECIP_ELEV_DEPLETION_PER_KM);
                const depletion = depletionBase + elevDepletion;

                const carried = incoming * Math.max(0, 1 - depletion);
                dst[r] = Math.max(src[r], carried);
            } else {
                dst[r] = src[r];
            }
        }

        // Swap buffers
        const swap = src;
        src = dst;
        dst = swap;
    }

    return src;
}

// ── Main entry point ─────────────────────────────────────────────────────────

/**
 * Compute seasonal precipitation fields.
 *
 * @param {SphereMesh} mesh
 * @param {Float32Array} r_xyz - per-region 3D positions
 * @param {Float32Array} r_elevation - per-region elevation
 * @param {object} windResult - output from computeWind()
 * @param {object} oceanResult - output from computeOceanCurrents()
 * @returns {{ r_precip_summer, r_precip_winter }} normalized 0–1 arrays
 */
export function computePrecipitation(mesh, r_xyz, r_elevation, windResult, oceanResult, precipitationOffset = 0, landCoverage = 0.3) {
    console.log('[precipitation.js] computePrecipitation called, numRegions:', mesh.numRegions);
    const numRegions = mesh.numRegions;
    const timing = [];

    const { r_lat, r_lon, r_isLand, r_continentality,
        r_eastX, r_eastY, r_eastZ,
        r_northX, r_northY, r_northZ } = windResult;

    // Scale-dependent hop count: ~2000 km reach.
    // Average edge length ≈ π / sqrt(numRegions) radians ≈ (π * 6371) / sqrt(N) km
    // hops ≈ 2000 / edgeLengthKm
    const avgEdgeKm = (Math.PI * 6371) / Math.sqrt(numRegions);
    const avgEdgeRad = Math.PI / Math.sqrt(numRegions);
    const maxHops = Math.max(8, Math.min(20, Math.round(CLIMATE.PRECIP_ADVECT_REACH_KM / avgEdgeKm)));

    // Coast distance through land — reuse BFS already computed by wind.js
    const r_coastDistLand = windResult.r_coastDistLand;
    const r_westness = windResult.r_westness;  // +1 west coast, −1 east coast, 0 interior

    // Elevation gradient for orographic detection (shared).
    // Use a smoothed copy of elevation so local noise/crags don't fragment
    // the large-scale windward/leeward signal at high resolutions.
    // Target ~200 km smoothing radius — enough to average out terrain noise
    // while preserving the broad mountain-range slope.
    let t0 = performance.now();
    const elevSmoothPasses = Math.max(2, Math.round(200 / avgEdgeKm));
    const r_elevSmoothed = new Float32Array(r_elevation);
    smoothField(mesh, r_elevSmoothed, elevSmoothPasses);
    // Blend smoothed with actual: keeps broad slope signal but retains some local detail
    for (let r = 0; r < numRegions; r++) {
        r_elevSmoothed[r] = r_elevSmoothed[r] * 0.6 + r_elevation[r] * 0.4;
    }
    const r_elevGradE = new Float32Array(numRegions);
    const r_elevGradN = new Float32Array(numRegions);
    computeGradients(mesh, r_xyz, r_elevSmoothed,
        r_eastX, r_eastY, r_eastZ, r_northX, r_northY, r_northZ,
        r_elevGradE, r_elevGradN);
    timing.push({ stage: 'Precip: elevation gradients (smoothed)', ms: performance.now() - t0 });

    // Pre-compute height in km for advection and mechanisms (elevation is constant across seasons)
    const r_heightKm = new Float32Array(numRegions);
    for (let r = 0; r < numRegions; r++) {
        r_heightKm[r] = elevToHeightKm(Math.max(0, r_elevation[r]));
    }

    // What the rain-shadow field is computed on: the fixed reference mesh from SHADOW_REF_REGIONS cells up, else the planet's own mesh
    const shadowFrames = { eastX: r_eastX, eastY: r_eastY, eastZ: r_eastZ, northX: r_northX, northY: r_northY, northZ: r_northZ };
    t0 = performance.now();
    const shadowRef = numRegions >= SHADOW_REF_REGIONS ? makeShadowRefGrid(mesh, r_xyz, r_elevation) : null;
    const nativeShadowGrid = shadowRef ? null
        : makeShadowGrid(mesh, r_xyz, shadowFrames, new Float32Array(r_elevation), r_isLand, shadowSmoothPasses(avgEdgeKm));
    timing.push({ stage: 'Precip: rain-shadow grid', ms: performance.now() - t0 });

    const result = {};

    const seasons = [
        { name: 'summer', shift: 5 },
        { name: 'winter', shift: -5 }
    ];

    for (const { name, shift } of seasons) {
        t0 = performance.now();

        const r_windE_raw = windResult[`r_wind_east_${name}`];
        const r_windN_raw = windResult[`r_wind_north_${name}`];
        const r_windSpeed = windResult[`r_wind_speed_${name}`];
        const r_pressure = windResult[`r_pressure_${name}`];
        const r_oceanWarmth = oceanResult[`r_ocean_warmth_${name}`];

        const itczLookup = makeItczLookup(windResult.itczLons,
            name === 'summer' ? windResult.itczLatsSummer : windResult.itczLatsWinter);

        // ── Blend complex wind with heuristic zonal wind (50-50) ──
        // Smooths out noisy pressure-derived wind patterns, strengthens
        // zonal consistency for advection and orographic effects.
        const { hWindE, hWindN } = computeHeuristicWindField(
            numRegions, r_lat, r_lon, itczLookup);
        const r_windE = new Float32Array(numRegions);
        const r_windN = new Float32Array(numRegions);
        for (let r = 0; r < numRegions; r++) {
            r_windE[r] = 0.5 * r_windE_raw[r] + 0.5 * hWindE[r];
            r_windN[r] = 0.5 * r_windN_raw[r] + 0.5 * hWindN[r];
        }

        // Pre-compute 3D wind vectors for convergence and advection
        const r_wind3dX = new Float32Array(numRegions);
        const r_wind3dY = new Float32Array(numRegions);
        const r_wind3dZ = new Float32Array(numRegions);
        for (let r = 0; r < numRegions; r++) {
            const we = r_windE[r], wn = r_windN[r];
            r_wind3dX[r] = we * r_eastX[r] + wn * r_northX[r];
            r_wind3dY[r] = we * r_eastY[r] + wn * r_northY[r];
            r_wind3dZ[r] = we * r_eastZ[r] + wn * r_northZ[r];
        }

        // ── Step 1a: Wind convergence field ──
        // Compute raw convergence then smooth heavily — real fronts are
        // messy, mobile bands, not sharp lines. The smoothing spreads the
        // signal over a wide area representing the zone where frontal
        // weather systems wander over a season.
        const r_convergence = computeWindConvergence(mesh, r_xyz,
            r_wind3dX, r_wind3dY, r_wind3dZ);
        // Smooth ~400 km worth of hops so frontal zones are broad bands
        const convSmoothPasses = Math.max(3, Math.round(400 / avgEdgeKm));
        smoothField(mesh, r_convergence, convSmoothPasses);

        // ── Step 1b: Moisture advection from coasts ──
        const moisture = advectMoisture(mesh, r_xyz, r_heightKm, r_isLand,
            r_windE, r_windN,
            r_wind3dX, r_wind3dY, r_wind3dZ,
            r_oceanWarmth, r_coastDistLand, maxHops, avgEdgeKm);

        const tAdvect = performance.now() - t0;

        // ── Step 2: Apply precipitation mechanisms ──
        t0 = performance.now();
        const precip = new Float32Array(numRegions);

        for (let r = 0; r < numRegions; r++) {
            const lat = r_lat[r];
            const lon = r_lon[r];
            const absLatDeg = Math.abs(lat) / DEG;
            const elev = r_elevation[r];
            const isLand = r_isLand[r];

            let p = moisture[r];

            // (a) ITCZ uplift: boost moisture within ±15° of ITCZ
            const itczLat = itczLookup(lon);
            const distFromItcz = Math.abs(lat - itczLat) / DEG;
            const cont = (isLand && r_continentality) ? r_continentality[r] : 0;
            if (distFromItcz < CLIMATE.PRECIP_ITCZ_WIDTH_DEG) {
                const itczStrength = smoothstep(CLIMATE.PRECIP_ITCZ_WIDTH_DEG, 0, distFromItcz);
                // Core ITCZ (within 5°): strong uplift and convective rain
                const coreBoost = distFromItcz < 5 ? CLIMATE.PRECIP_ITCZ_CORE_BOOST : 1.0;
                p = p * (1 + itczStrength * coreBoost) + itczStrength * CLIMATE.PRECIP_ITCZ_ADDITIVE;
            }

            // (b) Frontal precipitation: actual wind convergence
            // Where winds collide (convergence > 0) air is forced upward,
            // creating turbulence and wringing out whatever moisture is present.
            // This naturally finds frontal zones, ITCZ-like convergence,
            // and any other place where air masses meet.
            const conv = r_convergence[r];
            if (conv > 0) {
                // Scale convergence: gentle convergence gives mild boost,
                // strong convergence (opposing air masses) gives large boost.
                // Only amplifies existing moisture — dry converging air
                // doesn't produce rain.
                // Raw convergence ∝ avgEdgeRad (neighbor displacements shrink
                // at higher resolution), so normalize to make scale-invariant.
                const convStrength = Math.min(1, (conv / avgEdgeRad) * 0.055);
                p = p * (1 + convStrength * CLIMATE.PRECIP_CONV_MULT_BOOST) + convStrength * moisture[r] * CLIMATE.PRECIP_CONV_ADD_FRAC;
            }

            // (c) Orographic effects (land only)
            // The advection step already handles gradient-based moisture loss
            // per hop. This step adds the *local* precipitation boost on windward
            // slopes (forced uplift squeezes out extra rain at that cell) and a
            // moderate leeward shadow for any remaining moisture.
            if (isLand && elev > 0) {
                const we = r_windE[r], wn = r_windN[r];
                // Windward uplift: wind dot elevation gradient
                // Positive = wind blows upslope (windward), negative = downslope (leeward)
                const windDotGrad = we * r_elevGradE[r] + wn * r_elevGradN[r];

                if (windDotGrad > 0) {
                    // Windward: orographic enhancement — the steeper the slope
                    // the wind is pushing up, the more rain wrung out.
                    // gradient strength matters more than absolute height.
                    const uplift = Math.min(1, windDotGrad * 15);
                    p += uplift * CLIMATE.PRECIP_ORO_UPLIFT_ADD;
                } else {
                    // Leeward: rain shadow. The advection step already depleted
                    // moisture crossing the ridge; this is the *extra* suppression
                    // from descending/warming air (foehn drying) on the lee side.
                    const shadow = Math.min(1, -windDotGrad * 18);
                    p *= Math.max(0.02, 1 - shadow * CLIMATE.PRECIP_ORO_SHADOW_MAX_SUPPRESS);
                }
            }

            // (d) Pressure-driven suppression/enhancement (hybrid)
            // Start with a gentle latitude-band expectation for subtropical
            // highs, then let the actual pressure field shift it — so the
            // effect tracks real geography without being too aggressive.
            const pDev = r_pressure[r]; // deviation from 1013 hPa

            // Seasonal subtropical suppression: the subtropical high shifts
            // poleward in local summer (creating Mediterranean dry summers)
            // and retreats equatorward in local winter (allowing westerly rain).
            const inLocalSummer = (name === 'summer') ? (lat >= 0) : (lat < 0);
            const subtropCenter = inLocalSummer ? CLIMATE.PRECIP_SUBTROP_CENTER_SUMMER_DEG : CLIMATE.PRECIP_SUBTROP_CENTER_WINTER_DEG;
            const subtropWidth  = inLocalSummer ? CLIMATE.PRECIP_SUBTROP_WIDTH_SUMMER_DEG : CLIMATE.PRECIP_SUBTROP_WIDTH_WINTER_DEG;
            let   subtropPeak   = inLocalSummer ? CLIMATE.PRECIP_SUBTROP_PEAK_SUMMER : CLIMATE.PRECIP_SUBTROP_PEAK_WINTER;

            // East-coast monsoon relief: reduce summer drying where
            // poleward winds bring tropical moisture onshore. On Earth
            // this produces humid subtropical (Cfa) on east coasts
            // while west coasts keep Mediterranean (Cs) dry summers.
            if (isLand && inLocalSummer) {
                const polewardWind = lat >= 0 ? r_windN[r] : -r_windN[r];
                if (polewardWind > 0) {
                    const coastDist = r_coastDistLand[r] >= 0 ? r_coastDistLand[r] : maxHops;
                    const coastProximity = 1 - smoothstep(0, maxHops * 0.4, coastDist);
                    const monsoonRelief = smoothstep(0, 0.15, polewardWind) * coastProximity;
                    subtropPeak *= (1 - monsoonRelief * CLIMATE.PRECIP_MONSOON_RELIEF_MAX);
                }
            }

            // East-coast geographic relief: the subtropical high's dry flank sits
            // over WEST coasts; EAST coasts (westness < 0) get onshore moisture and
            // stay humid subtropical (Cfa), not Mediterranean/steppe. This is the
            // longitude-aware version the wind-gated relief above could not deliver
            // (the simulated summer wind is not reliably onshore). Also removes the
            // spurious dry-summer Csa that appears on east coasts (e.g. SE Australia).
            if (isLand && r_westness) {
                const eastness = Math.max(0, -r_westness[r]);   // 0 west/interior → 1 full east coast
                subtropPeak *= (1 - eastness * CLIMATE.PRECIP_SUBTROP_EAST_RELIEF);
            }

            const subtropDist = Math.abs(absLatDeg - subtropCenter);
            const latBandSuppression = subtropDist < subtropWidth
                ? smoothstep(subtropWidth, 0, subtropDist) * subtropPeak : 0;

            // Pressure modifier: high pressure adds suppression, low reduces it
            // Kept gentle — pressure nudges the baseline, doesn't overwhelm it.
            let pressureMod = 0;
            if (pDev > 0) {
                pressureMod = smoothstep(0, 12, pDev) * 0.25; // extra suppression
            } else {
                pressureMod = -smoothstep(0, 15, -pDev) * 0.2; // relief / enhancement
            }

            const totalSuppression = Math.max(0, latBandSuppression + pressureMod);
            if (totalSuppression > 0) {
                p *= Math.max(0.05, 1 - totalSuppression);
            } else {
                // Net enhancement from low pressure outside subtropical belt
                p *= (1 - totalSuppression); // totalSuppression is negative here
            }

            // (d2) Summer monsoon moisture source. Where the summer ITCZ has
            // migrated poleward over a heated continent, the thermal low draws
            // moist oceanic air inland → strong wet summer; combined with the
            // subtropical dry winter above this yields the Köppen 'w' pattern
            // (savanna Aw, monsoon Cwa/Dwa) and keeps humid-subtropical east
            // coasts (S. China, Florida, SE US) from drying out. This is the
            // moisture the wind-gated relief could never deliver — the simulated
            // summer wind over hot interiors is not reliably onshore. Generalizes
            // via the ITCZ excursion (obliquity) and coast proximity; default 0.
            if (inLocalSummer && isLand && CLIMATE.PRECIP_MONSOON_ADD > 0) {
                const mItczLat = itczLookup(lon);                 // this season's ITCZ (radians)
                const poleward = (lat >= 0 ? (lat - mItczLat) : (mItczLat - lat)) / DEG;
                if (poleward > 0 && poleward < CLIMATE.PRECIP_MONSOON_REACH_DEG) {
                    const band = smoothstep(CLIMATE.PRECIP_MONSOON_REACH_DEG, 0, poleward);
                    const cd = r_coastDistLand[r] >= 0 ? r_coastDistLand[r] : maxHops;
                    const supply = 1 - smoothstep(0, maxHops, cd);  // ocean moisture within reach
                    p += CLIMATE.PRECIP_MONSOON_ADD * band * supply;
                }
            }

            // (e) Polar front: diffuse precipitation at high latitudes
            // The polar front is broad and pushes moisture deep inland —
            // the blog cites ~2000 km downwind, ~1500 km crosswind from
            // any coast, including coasts with offshore winds.
            // It always brings *some* precipitation from its own cyclonic
            // activity, even deep inland, plus a stronger coastal component.
            if (absLatDeg > 40) {
                const polarStrength = smoothstep(40, 70, absLatDeg);
                const coastDist = r_coastDistLand[r] < 0 ? maxHops : r_coastDistLand[r];
                const inlandFade = 1 - smoothstep(0, maxHops, coastDist);
                // Base: always present regardless of coast distance
                const polarBase = polarStrength * CLIMATE.PRECIP_POLAR_BASE_ADD;
                // Coastal enhancement: fades inland
                const polarCoastal = polarStrength * CLIMATE.PRECIP_POLAR_COASTAL_ADD * inlandFade;
                // Mostly enhances existing moisture, but adds some regardless
                p += polarBase + polarCoastal;
                p *= (1 + polarStrength * 0.15); // gentle multiplicative boost
            }

            // (f) Continental interior dryness
            // Now that continentality is BFS-based (0 at coast, 0.5 at ~1000km,
            // 1.0 at ~2000km), we can use it directly. Squared curve keeps
            // near-coast areas gentle while ramping for deep interiors.
            if (isLand && cont > 0) {
                const dryness = cont * cont * CLIMATE.PRECIP_CONT_DRYNESS;
                p *= Math.max(0.03, 1 - dryness);
            }

            // (g) Lee cyclogenesis: localized wet zone on leeward side of high mountains
            // when ocean is nearby downwind (~200 km)
            const heightKm = r_heightKm[r];
            if (isLand && heightKm > 1.5) {
                const we = r_windE[r], wn = r_windN[r];
                const windDotGrad = we * r_elevGradE[r] + wn * r_elevGradN[r];
                // ~200 km in hops (scale-invariant)
                const leeCoastHops = Math.max(2, Math.round(200 / avgEdgeKm));
                if (windDotGrad < -0.01 && r_coastDistLand[r] >= 0 && r_coastDistLand[r] < leeCoastHops) {
                    p += 0.15 * Math.min(1, heightKm / 5);
                }
            }

            // Ocean cells: precipitation over ocean (for visual completeness)
            if (!isLand) {
                // ITCZ and frontal zones already contribute above.
                // Add baseline ocean precipitation, suppressed under high pressure
                const highPressureFade = pDev > 0 ? smoothstep(0, 12, pDev) : 0;
                const oceanBase = 0.15 * (1 - highPressureFade);
                p = Math.max(p, oceanBase);
            }

            // (h) Hard distance-from-coast moisture cutoff
            // Beyond ~2000 km from any coast, moisture drops off steeply.
            // By 3000 km almost nothing remains.
            if (isLand && r_coastDistLand[r] > 0) {
                const distKm = r_coastDistLand[r] * avgEdgeKm;
                if (distKm > CLIMATE.PRECIP_COAST_CUTOFF_START_KM) {
                    const fade = 1 - smoothstep(CLIMATE.PRECIP_COAST_CUTOFF_START_KM, CLIMATE.PRECIP_COAST_CUTOFF_END_KM, distKm);
                    p *= Math.max(0.03, fade);
                }
            }

            const precipMult = 1 + precipitationOffset * 0.5;
            let finalPrecip = p * precipMult;
            if (landCoverage > 0.4) {
                const t = (landCoverage - 0.4) / 0.6;
                finalPrecip *= 1 - t * t * 0.98;
            }
            precip[r] = Math.max(0, finalPrecip);
        }

        const tMechanisms = performance.now() - t0;

        // ── Step 2b: Rain shadow — local source + bidirectional propagation ──
        t0 = performance.now();
        const rainShadow = shadowRef
            ? rainShadowFromRef(shadowRef, mesh, r_xyz, r_isLand, shadowFrames, r_windE, r_windN)
            : rainShadowOnMesh(nativeShadowGrid, shadowFrames, r_windE, r_windN);
        timing.push({ stage: `Precip: rain shadow (${name})`, ms: performance.now() - t0 });

        // ── Step 2c: Apply propagated rain shadow to actual precipitation ──
        // The local orographic effect in (c) only touches the mountain slopes
        // themselves. This step extends the shadow hundreds of km downwind and
        // boosts windward rain upwind, using the propagated field from 2b.
        for (let r = 0; r < numRegions; r++) {
            if (!r_isLand[r]) continue;
            const rs = rainShadow[r];
            if (rs < -0.01) {
                // Shadow zone: precipitation suppression behind mountains
                const strength = Math.min(1, -rs * CLIMATE.PRECIP_RS_APPLY_STRENGTH_SCALE);
                precip[r] *= Math.max(0.02, 1 - strength * CLIMATE.PRECIP_RS_APPLY_MAX_SUPPRESS);
            } else if (rs > 0.01) {
                // Windward zone: strong orographic precipitation enhancement
                precip[r] += rs * CLIMATE.PRECIP_RS_APPLY_WINDWARD_ADD;
            }
        }

        // ── Step 2d: Ocean-current coastal modulation ──
        // Warm poleward currents wet the adjacent coast (marine convection);
        // cold equatorward currents (Atacama/Namib/Benguela/California pattern)
        // suppress coastal rain via a capping inversion. Reuses the already-
        // computed ocean-warmth field; only touches a shallow coastal strip.
        // Both strengths default 0 → no-op.
        const coldSup = CLIMATE.PRECIP_COLD_CURRENT_SUPPRESS;
        const warmBoost = CLIMATE.PRECIP_WARM_CURRENT_BOOST;
        if (r_oceanWarmth && (coldSup > 0 || warmBoost > 0)) {
            const coastalReach = Math.max(2, Math.round(300 / avgEdgeKm)); // ~300 km inland
            const { adjOffset, adjList } = mesh;
            for (let r = 0; r < numRegions; r++) {
                if (!r_isLand[r]) continue;
                const cd = r_coastDistLand[r];
                if (cd < 0 || cd > coastalReach) continue;
                let wsum = 0, wn = 0;
                const end = adjOffset[r + 1];
                for (let ni = adjOffset[r]; ni < end; ni++) {
                    const nb = adjList[ni];
                    if (!r_isLand[nb]) { wsum += r_oceanWarmth[nb]; wn++; }
                }
                if (wn === 0) continue;
                const w = wsum / wn;                 // adjacent ocean warmth (−1..1)
                const fade = 1 - cd / coastalReach;  // full at coast, 0 inland
                if (w < 0) precip[r] *= Math.max(0.05, 1 + w * coldSup * fade);
                else precip[r] *= 1 + w * warmBoost * fade;
            }
        }

        // ── Step 3: Smooth (normalization deferred to blending step) ──
        t0 = performance.now();
        // Light smoothing ~100 km to blend cell-to-cell noise
        const precipSmoothPasses = Math.max(1, Math.round(100 / avgEdgeKm));
        smoothField(mesh, precip, precipSmoothPasses);
        const tSmooth = performance.now() - t0;

        timing.push({ stage: `Precip: advection (${name})`, ms: tAdvect });
        timing.push({ stage: `Precip: mechanisms (${name})`, ms: tMechanisms });
        timing.push({ stage: `Precip: smooth (${name})`, ms: tSmooth });

        result[`r_precip_${name}`] = precip;
        result[`r_rainshadow_${name}`] = rainShadow;
    }

    // ── Step 4: Blend with heuristic model and normalize ──
    t0 = performance.now();
    const heuristic = computeHeuristicPrecipitation(mesh, r_xyz, r_elevation, windResult, r_elevGradE, r_elevGradN, r_coastDistLand);

    for (const seasonName of ['summer', 'winter']) {
        const complex = result[`r_precip_${seasonName}`];
        const heur = heuristic[`r_precip_${seasonName}`];
        const blended = new Float32Array(numRegions);
        for (let r = 0; r < numRegions; r++) {
            blended[r] = CLIMATE.PRECIP_MODEL_BLEND * complex[r] + (1 - CLIMATE.PRECIP_MODEL_BLEND) * heur[r];
        }

        // 95th-percentile normalization on blended result
        const maxPrecip = percentile(blended, 0.95);
        for (let r = 0; r < numRegions; r++) {
            blended[r] = Math.min(1, blended[r] / maxPrecip);
        }

        // Continental interior cap: interior regions can't exceed steppe-level
        // precipitation.  At cont=1.0, cap is 0.20 per season (≈ 200mm
        // half-year → 400mm annual — solidly in steppe territory).  Fades in
        // from cont 0.5 so the transition is gradual.  Other factors (desert
        // factory, rain shadows, distance cutoff) can still push lower.
        const r_continentality = windResult.r_continentality;
        if (r_continentality) {
            for (let r = 0; r < numRegions; r++) {
                if (r_isLand[r] && r_continentality[r] > CLIMATE.PRECIP_CONT_CAP_FADE_START) {
                    const t = smoothstep(CLIMATE.PRECIP_CONT_CAP_FADE_START, 1.0, r_continentality[r]);
                    const cap = 1.0 - t * CLIMATE.PRECIP_CONT_CAP_MAX_REDUCTION;  // 1.0 at cont=0.5, 0.20 at cont=1.0
                    blended[r] = Math.min(blended[r], cap);
                }
            }
        }

        result[`r_precip_${seasonName}`] = blended;
    }

    // ── Step 4b: Cold-air moisture capacity ──
    // Neither model above knows that cold air holds little water vapour (saturation
    // vapour pressure falls ~7 % per °C), so left alone the far north is nearly as
    // wet as the temperate belt: on the Earth heightmap ~1,000 mm a year over land at
    // 60–70° (Russia as a whole averages ~460 mm) and ~1,000 mm on tundra (a few
    // hundred observed). Thin the rain below a reference annual temperature,
    // exponentially. The temperature is the base-curve estimate (the full field is
    // computed after precipitation and depends on it), applied after the
    // 95th-percentile normalisation so the wet tropics, which set that scale, are
    // untouched.
    {
        const k = CLIMATE.PRECIP_COLD_CAPACITY_PER_C;
        if (k > 0) {
            const T0 = CLIMATE.PRECIP_COLD_CAPACITY_REF_C;
            const r_tProxy = annualBaseTemperatureC(windResult, r_elevation);
            const ps = result.r_precip_summer;
            const pw = result.r_precip_winter;
            for (let r = 0; r < numRegions; r++) {
                if (r_tProxy[r] >= T0) continue;
                const capacity = Math.max(COLD_CAPACITY_FLOOR, Math.exp(k * (r_tProxy[r] - T0)));
                ps[r] *= capacity;
                pw[r] *= capacity;
            }
        }
    }

    // ── Step 5: Seasonal contrast exaggeration ──
    // The two models each smooth the wet/dry season difference (advection
    // averages, 50/50 blending, percentile normalization), which starves the
    // Köppen w/s subtypes (monsoon Cw/Dw, Mediterranean Cs/Ds) of signal.
    // Push each season away from the seasonal mean by a tunable factor.
    // PRECIP_SEASON_CONTRAST = 1.0 → no change.
    {
        const c = CLIMATE.PRECIP_SEASON_CONTRAST;
        if (c !== 1.0) {
            const ps = result.r_precip_summer;
            const pw = result.r_precip_winter;
            for (let r = 0; r < numRegions; r++) {
                const m = (ps[r] + pw[r]) / 2;
                ps[r] = Math.max(0, m + (ps[r] - m) * c);
                pw[r] = Math.max(0, m + (pw[r] - m) * c);
            }
        }
    }
    timing.push({ stage: 'Precip: heuristic blend+normalize', ms: performance.now() - t0 });

    // Pass the west/east field through so the Köppen classifier can give east
    // coasts a selective aridity discount (they're humid-subtropical, not desert).
    result.r_westness = r_westness;
    result._precipTiming = timing;
    return result;
}
