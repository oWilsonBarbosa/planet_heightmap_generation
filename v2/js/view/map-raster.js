// Equirectangular rasteriser for sim-mesh cell data. DOM-free: it fills a plain RGBA
// byte buffer, so the browser lab (canvas/texture) and the Node check scripts (PNG)
// share one code path. Longitude −180…180 left→right, latitude 90…−90 top→bottom.

import { locate } from '../core/mesh-locate.js';

export class MapRaster {
    constructor(simMesh, width = 1024) {
        this.width = width;
        this.height = width >> 1;
        this.pixelCell = new Int32Array(this.width * this.height);
        const { index } = simMesh;
        for (let py = 0; py < this.height; py++) {
            const lat = Math.PI / 2 - ((py + 0.5) / this.height) * Math.PI;
            const cl = Math.cos(lat), z = Math.sin(lat);
            for (let px = 0; px < this.width; px++) {
                const lon = ((px + 0.5) / this.width) * 2 * Math.PI - Math.PI;
                this.pixelCell[py * this.width + px] = index.nearest(cl * Math.cos(lon), cl * Math.sin(lon), z);
            }
        }
    }

    /** Sim cell under pixel (px, py). */
    cellAt(px, py) {
        px = Math.max(0, Math.min(this.width - 1, px | 0));
        py = Math.max(0, Math.min(this.height - 1, py | 0));
        return this.pixelCell[py * this.width + px];
    }

    /**
     * @param {Uint8Array} cellRgb  3 bytes per sim cell
     * @param {Uint8ClampedArray|Uint8Array} outRgba  width*height*4 buffer
     */
    paint(cellRgb, outRgba) {
        const pc = this.pixelCell;
        for (let i = 0, o = 0; i < pc.length; i++, o += 4) {
            const c = 3 * pc[i];
            outRgba[o] = cellRgb[c]; outRgba[o + 1] = cellRgb[c + 1]; outRgba[o + 2] = cellRgb[c + 2];
            outRgba[o + 3] = 255;
        }
    }

    /** Pixel position of a unit vector. */
    project(x, y, z) {
        const lat = Math.asin(Math.max(-1, Math.min(1, z))), lon = Math.atan2(y, x);
        return [(lon + Math.PI) / (2 * Math.PI) * this.width, (Math.PI / 2 - lat) / Math.PI * this.height];
    }
}

/**
 * The same map, but for a fine mesh drawn smoothly: each pixel blends the three cells of the mesh triangle it falls
 * in (core/mesh-locate.js), so a terrain mesh shows as continuous shaded relief instead of Voronoi patches.
 * Same interface as MapRaster.
 */
export class SmoothMapRaster {
    constructor(mesh, width = 1024) {
        this.init(width);
        for (let py = 0; py < this.height; py++) this.fillRow(mesh, py);
    }

    /**
     * The same table, built a few rows at a time between the page's frames (a 4096-pixel table takes ~1 s): a promise of
     * it. `signal` aborts the build.
     */
    static async build(mesh, width = 1024, { signal = null, sliceMs = 8 } = {}) {
        const r = Object.create(SmoothMapRaster.prototype);
        r.init(width);
        for (let py = 0; py < r.height;) {
            const t = performance.now();
            while (py < r.height && performance.now() - t < sliceMs) r.fillRow(mesh, py++);
            if (py < r.height) await new Promise(res => setTimeout(res, 0));
            if (signal?.aborted) throw new DOMException('map table build aborted', 'AbortError');
        }
        return r;
    }

    init(width) {
        this.width = width;
        this.height = width >> 1;
        const n = this.width * this.height;
        this.pixelCells = new Int32Array(3 * n);
        this.pixelWeights = new Uint8Array(2 * n);        // the 2nd and 3rd corner's weight × 255; the 1st gets the rest
    }

    fillRow(mesh, py) {
        const c3 = ROW_C3, w3 = ROW_W3;
        const lat = Math.PI / 2 - ((py + 0.5) / this.height) * Math.PI, cl = Math.cos(lat), z = Math.sin(lat);
        for (let px = 0, i = py * this.width; px < this.width; px++, i++) {
            const lon = ((px + 0.5) / this.width) * 2 * Math.PI - Math.PI;
            locate(mesh, cl * Math.cos(lon), cl * Math.sin(lon), z, c3, w3);
            this.pixelCells[3 * i] = c3[0]; this.pixelCells[3 * i + 1] = c3[1]; this.pixelCells[3 * i + 2] = c3[2];
            this.pixelWeights[2 * i] = Math.round(w3[1] * 255); this.pixelWeights[2 * i + 1] = Math.round(w3[2] * 255);
        }
    }

    /** The cell that weighs most at pixel (px, py). */
    cellAt(px, py) {
        px = Math.max(0, Math.min(this.width - 1, px | 0));
        py = Math.max(0, Math.min(this.height - 1, py | 0));
        const i = py * this.width + px, w1 = this.pixelWeights[2 * i], w2 = this.pixelWeights[2 * i + 1], w0 = 255 - w1 - w2;
        return this.pixelCells[3 * i + (w0 >= w1 && w0 >= w2 ? 0 : w1 >= w2 ? 1 : 2)];
    }

    paint(cellRgb, outRgba) {
        const pc = this.pixelCells, pw = this.pixelWeights, n = this.width * this.height;
        for (let i = 0, o = 0; i < n; i++, o += 4) {
            const a = 3 * pc[3 * i], b = 3 * pc[3 * i + 1], c = 3 * pc[3 * i + 2], w1 = pw[2 * i], w2 = pw[2 * i + 1], w0 = 255 - w1 - w2;
            outRgba[o] = (w0 * cellRgb[a] + w1 * cellRgb[b] + w2 * cellRgb[c]) / 255;
            outRgba[o + 1] = (w0 * cellRgb[a + 1] + w1 * cellRgb[b + 1] + w2 * cellRgb[c + 1]) / 255;
            outRgba[o + 2] = (w0 * cellRgb[a + 2] + w1 * cellRgb[b + 2] + w2 * cellRgb[c + 2]) / 255;
            outRgba[o + 3] = 255;
        }
    }

    /**
     * Per pixel: the height (and hillshade) blended from the pixel's three cells, THEN coloured — so a coast is drawn as
     * the heights' zero line, crisp at the pixel, instead of land and sea colours blended across a mesh triangle (a
     * zig-zag of the mesh's triangles along every shore). `lut`: {rgb: 3 per step (0–255), minM, stepM, n, zero (the
     * first step at or above sea level), shaded}; shaded colours are × (0.35 + 0.65 · shade), as paintRelief's.
     */
    paintHeights(heightKm, shade, lut, outRgba, seaLevelKm = 0) {
        const pc = this.pixelCells, pw = this.pixelWeights, n = this.width * this.height;
        const L = lut.rgb, { minM, stepM, zero } = lut, top = lut.n - 1, S = lut.shaded ? shade : null;
        for (let i = 0, o = 0; i < n; i++, o += 4) {
            const a = pc[3 * i], b = pc[3 * i + 1], c = pc[3 * i + 2], w1 = pw[2 * i], w2 = pw[2 * i + 1], w0 = 255 - w1 - w2;
            const m = ((w0 * heightKm[a] + w1 * heightKm[b] + w2 * heightKm[c]) / 255 - seaLevelKm) * 1000;
            const j = Math.round((m - minM) / stepM), k3 = 3 * (m < 0 ? Math.max(0, Math.min(zero - 1, j)) : Math.min(top, Math.max(zero, j)));
            const k = S ? 0.35 + 0.65 * (w0 * S[a] + w1 * S[b] + w2 * S[c]) / 255 : 1;
            outRgba[o] = Math.min(255, L[k3] * k); outRgba[o + 1] = Math.min(255, L[k3 + 1] * k); outRgba[o + 2] = Math.min(255, L[k3 + 2] * k);
            outRgba[o + 3] = 255;
        }
    }

    /** Per pixel: 255 where the blended height is below sea level, else 0 — the sea, as crisp as paintHeights' coast. */
    paintSea(heightKm, outRgba, seaLevelKm = 0) {
        const pc = this.pixelCells, pw = this.pixelWeights, n = this.width * this.height;
        for (let i = 0, o = 0; i < n; i++, o += 4) {
            const w1 = pw[2 * i], w2 = pw[2 * i + 1], w0 = 255 - w1 - w2;
            const v = (w0 * heightKm[pc[3 * i]] + w1 * heightKm[pc[3 * i + 1]] + w2 * heightKm[pc[3 * i + 2]]) / 255 < seaLevelKm ? 255 : 0;
            outRgba[o] = outRgba[o + 1] = outRgba[o + 2] = v; outRgba[o + 3] = 255;
        }
    }

    project(x, y, z) { return MapRaster.prototype.project.call(this, x, y, z); }
}
const ROW_C3 = [0, 0, 0], ROW_W3 = [0, 0, 0];
