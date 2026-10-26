/**
 * Builds the fixed "Earth example" evaluation context once, exactly mirroring
 * the app's heightmap-import pipeline (js/planet-worker.js handleImportHeightmap
 * with the import page's default sliders: all sculpting 0, jitter 0.75):
 *
 *   buildSphere → sampleHeightmap(assets/earth.png) → detail noise L1 + L2 →
 *   soil creep → synthetic plates → [climate chain runs per evaluation]
 *
 * The mesh itself is built by earth-mesh.mjs (shared with the browser climate lab).
 * Everything here is deterministic for a given (N, seed).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import Delaunator from 'delaunator';

import { setDelaunator } from '../../../js/sphere-mesh.js';
import { buildEarthMesh, rgbaToGray } from './earth-mesh.mjs';
import { loadGroundTruth, truthAt, NO_DATA } from './ground-truth.mjs';

setDelaunator(Delaunator);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const EARTH_PNG = path.join(PROJECT_ROOT, 'assets', 'earth.png');

/** Decode assets/earth.png to a grayscale Uint8Array (same luminance as import-main.js). */
export function loadEarthGrayscale(pngPath = EARTH_PNG) {
    const png = PNG.sync.read(fs.readFileSync(pngPath));
    const { width, height, data } = png;
    return { gray: rgbaToGray(data, width, height), width, height };
}

/**
 * Build the full evaluation context.
 * @param {object} opts { N: region count, seed, jitter }
 */
export function buildEarthContext({ N = 40000, seed = 1234, jitter = 0.75 } = {}) {
    const t0 = performance.now();
    const { gray, width, height } = loadEarthGrayscale();
    const { mesh, r_xyz, r_elevation, r_plate, plateSeeds, plateIsOcean, plateVec } =
        buildEarthMesh(gray, width, height, { N, seed, jitter });

    // Per-region lat/lon (radians) — same formulas as sampleHeightmap, so the
    // ground-truth lookup aligns with the heightmap sampling.
    const numRegions = mesh.numRegions;
    const r_lat = new Float32Array(numRegions);
    const r_lon = new Float32Array(numRegions);
    for (let r = 0; r < numRegions; r++) {
        r_lat[r] = Math.asin(Math.max(-1, Math.min(1, r_xyz[3 * r + 1])));
        r_lon[r] = Math.atan2(r_xyz[3 * r], r_xyz[3 * r + 2]);
    }

    // Ground truth per region
    const truthGrid = loadGroundTruth();
    const r_truth = new Uint8Array(numRegions).fill(NO_DATA);
    for (let r = 0; r < numRegions; r++) {
        r_truth[r] = truthAt(truthGrid, r_lat[r], r_lon[r]);
    }

    // Scoring mask: sim says land AND truth has data. Report mask agreement too.
    const r_scored = new Uint8Array(numRegions);
    let simLand = 0, truthLand = 0, bothLand = 0;
    for (let r = 0; r < numRegions; r++) {
        const sl = r_elevation[r] > 0;
        const tl = r_truth[r] !== NO_DATA;
        if (sl) simLand++;
        if (tl) truthLand++;
        if (sl && tl) { bothLand++; r_scored[r] = 1; }
    }

    return {
        mesh, r_xyz, r_elevation, r_lat, r_lon,
        r_plate, plateSeeds, plateIsOcean, plateVec,
        truthGrid, r_truth, r_scored,
        maskStats: {
            simLandFrac: simLand / numRegions,
            truthLandFrac: truthLand / numRegions,
            scoredFrac: bothLand / numRegions,
            landAgreement: bothLand / Math.max(1, simLand),
        },
        seed, N,
        buildMs: performance.now() - t0,
    };
}
