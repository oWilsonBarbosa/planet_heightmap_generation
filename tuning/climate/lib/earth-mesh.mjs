/**
 * The "Earth example" mesh, exactly as V1's heightmap-import pipeline builds it (js/planet-worker.js
 * handleImportHeightmap with the import page's defaults: all sculpting 0, jitter 0.75):
 *
 *   buildSphere → sample the grayscale heightmap → detail noise L1 + L2 → soil creep → synthetic plates
 *
 * Pure and environment-free (no Node or DOM imports), so the Node tuning suite (earth-context.mjs) and the browser
 * climate lab's timing worker build the identical planet. The caller supplies the decoded grayscale image and must
 * have called setDelaunator() on js/sphere-mesh.js.
 */

import { makeRng } from '../../../js/rng.js';
import { buildSphere } from '../../../js/sphere-mesh.js';
import { applyDetailNoise, applySoilCreep } from '../../../js/terrain-post.js';
import { DETAIL_NOISE_DAMPEN_STRENGTH } from '../../../js/terrain-config.js';

// ── Verbatim ports of tiny private helpers from js/planet-worker.js ──

function sampleBilinear(pixels, imgW, imgH, px, py) {
    py = Math.max(0, Math.min(py, imgH - 1));
    const x0 = Math.floor(px), y0 = Math.floor(py);
    const x1 = (x0 + 1) % imgW;
    const y1 = Math.min(y0 + 1, imgH - 1);
    const fx = px - x0, fy = py - y0;
    const v00 = pixels[y0 * imgW + ((x0 % imgW) + imgW) % imgW];
    const v10 = pixels[y0 * imgW + x1];
    const v01 = pixels[y1 * imgW + ((x0 % imgW) + imgW) % imgW];
    const v11 = pixels[y1 * imgW + x1];
    return (v00 * (1 - fx) * (1 - fy) + v10 * fx * (1 - fy) +
            v01 * (1 - fx) * fy + v11 * fx * fy);
}

function grayscaleToElevation(v) {
    if (v < 1) return -0.5;
    return Math.sqrt((v - 1) / 254);
}

function sampleHeightmap(mesh, r_xyz, imageData, imgW, imgH) {
    const r_elevation = new Float32Array(mesh.numRegions);
    for (let r = 0; r < mesh.numRegions; r++) {
        const x = r_xyz[3 * r], y = r_xyz[3 * r + 1], z = r_xyz[3 * r + 2];
        const lat = Math.asin(Math.max(-1, Math.min(1, y)));
        const lon = Math.atan2(x, z);
        const px = (lon / Math.PI + 1) * 0.5 * imgW;
        const py = (0.5 - lat / Math.PI) * imgH;
        r_elevation[r] = grayscaleToElevation(sampleBilinear(imageData, imgW, imgH, px, py));
    }
    return r_elevation;
}

function deriveSyntheticPlates(mesh, r_elevation) {
    const N = mesh.numRegions;
    const r_plate = new Int32Array(N).fill(-1);
    const plateSeeds = new Set();
    const plateIsOcean = new Set();
    const plateVec = {};
    const { adjOffset, adjList } = mesh;

    for (let r = 0; r < N; r++) {
        if (r_plate[r] >= 0) continue;
        const isOcean = r_elevation[r] <= 0;
        r_plate[r] = r;
        plateSeeds.add(r);
        plateVec[r] = [0, 0, 0];
        if (isOcean) plateIsOcean.add(r);
        const queue = [r];
        let head = 0;
        while (head < queue.length) {
            const cur = queue[head++];
            const end = adjOffset[cur + 1];
            for (let ni = adjOffset[cur]; ni < end; ni++) {
                const nb = adjList[ni];
                if (r_plate[nb] >= 0) continue;
                if ((r_elevation[nb] <= 0) === isOcean) {
                    r_plate[nb] = r;
                    queue.push(nb);
                }
            }
        }
    }
    return { r_plate, plateSeeds, plateIsOcean, plateVec };
}

/** Luminance → grayscale, the same formula as V1's import page. rgba: Uint8(Clamped)Array of w·h·4. */
export function rgbaToGray(rgba, w, h) {
    const gray = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) {
        gray[i] = Math.round(0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2]);
    }
    return gray;
}

/**
 * Build the Earth mesh and elevations.
 * @param {Uint8Array} gray  grayscale heightmap (assets/earth.png)
 * @returns {{ mesh, r_xyz, r_elevation, r_plate, plateSeeds, plateIsOcean, plateVec }}
 */
export function buildEarthMesh(gray, width, height, { N = 40000, seed = 1234, jitter = 0.75 } = {}) {
    const rng = makeRng(seed);
    const { mesh, r_xyz } = buildSphere(N, jitter, rng);
    const r_elevation = sampleHeightmap(mesh, r_xyz, gray, width, height);

    // Post-processing exactly as handleImportHeightmap with all sculpting sliders at 0: detail noise L1 + L2
    // (always on), soil creep (always on). Terrain warp / smoothing / erosion / ridge sharpening are skipped at 0.
    const r_isOcean = new Uint8Array(mesh.numRegions);
    for (let r = 0; r < mesh.numRegions; r++) {
        if (r_elevation[r] <= 0) r_isOcean[r] = 1;
    }
    applyDetailNoise(mesh, r_xyz, r_elevation, r_isOcean, seed, {
        dampenField: null,
        dampenStrength: DETAIL_NOISE_DAMPEN_STRENGTH,
        amplitudeField: null,
    });
    applyDetailNoise(mesh, r_xyz, r_elevation, r_isOcean, seed, {
        amplitudeKm: 0.05,
        frequencyMult: 2.0,
        warpAmpMult: 2.0,
        bipolar: true,
        biasExponent: 0.4,
        seedOffset: 13579,
        dampenField: null,
        dampenStrength: DETAIL_NOISE_DAMPEN_STRENGTH,
        amplitudeField: null,
    });
    applySoilCreep(mesh, r_elevation, r_isOcean, 3, 0.1125);

    const { r_plate, plateSeeds, plateIsOcean, plateVec } = deriveSyntheticPlates(mesh, r_elevation);
    return { mesh, r_xyz, r_elevation, r_plate, plateSeeds, plateIsOcean, plateVec };
}
