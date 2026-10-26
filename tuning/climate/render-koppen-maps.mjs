/**
 * Köppen maps (equirectangular PNGs, the app's class colours) of Earth and the generated planets of
 * lib/gen-planets.mjs — to compare climates by eye, e.g. before and after a tune. Also writes stats.json (each map's
 * arid share, desert share and land rain).
 *
 *   node tuning/climate/render-koppen-maps.mjs --tag before [--set KEY=value,…] [--climate <snapshot>] [--only earth,gen-6]
 *        [--width 1200] [--tests]           → tuning/results/climate/maps/<tag>/<key>.png (+ earth-observed.png)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PNG } from 'pngjs';
import { loadEarthGrayscale } from './lib/earth-context.mjs';
import { buildEarthMesh } from './lib/earth-mesh.mjs';
import { loadReferences, truthAt01 } from './lib/ref.mjs';
import { elevToHeightKm } from '../../js/color-map.js';
import { KOPPEN_CLASSES } from '../../v2/js/climate/koppen.js';
import { GEN_PLANETS, loadGenPlanets, dryness, cellLatDeg } from './lib/gen-planets.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const climateBase = arg('--climate', null) ? pathToFileURL(path.resolve(arg('--climate')) + '/').href : new URL('../../', import.meta.url).href;
const { planetClimate } = await import(climateBase + 'v2/js/climate/climate.js');
const { setParams } = await import(climateBase + 'v2/js/climate/config.js');
const argSet = arg('--set', null);
if (argSet) setParams(Object.fromEntries(argSet.split(',').map(kv => { const [k, v] = kv.split('='); return [k, +v]; })));
const TAG = arg('--tag', 'now'), W = +arg('--width', 1200), H = W / 2;
const ONLY = arg('--only', null)?.split(',') ?? null;
const OUT = path.join(__dirname, '..', 'results', 'climate', 'maps', TAG);
fs.mkdirSync(OUT, { recursive: true });

/** Each pixel's nearest cell: cells hashed into a 3D grid over the unit cube, each pixel searching its voxel and the
 *  26 around it (a voxel is wider than the gap between neighbouring cells at any detail used here). */
function pixelToCell(xyz, axes) {
    const n = xyz.length / 3, G = 96, vox = (v) => Math.min(G - 1, Math.max(0, Math.floor((v + 1) / 2 * G)));
    const head = new Int32Array(G * G * G).fill(-1), next = new Int32Array(n);
    for (let r = 0; r < n; r++) { const k = (vox(xyz[3 * r]) * G + vox(xyz[3 * r + 1])) * G + vox(xyz[3 * r + 2]); next[r] = head[k]; head[k] = r; }
    const map = new Int32Array(W * H), D = Math.PI / 180;
    for (let py = 0; py < H; py++) {
        const lat = (90 - (py + 0.5) * 180 / H) * D;
        for (let px = 0; px < W; px++) {
            const lon = (-180 + (px + 0.5) * 360 / W) * D;
            // the planet's own frame: V1's y north with lon = atan2(x, z); Evolution's z north with lon = atan2(y, x)
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

function writeMap(file, cellClass, pix) {
    const png = new PNG({ width: W, height: H });
    for (let i = 0; i < W * H; i++) {
        const k = pix[i] >= 0 ? cellClass[pix[i]] : 0, col = KOPPEN_CLASSES[k]?.color ?? KOPPEN_CLASSES[0].color;
        png.data[4 * i] = Math.round(255 * col[0]); png.data[4 * i + 1] = Math.round(255 * col[1]); png.data[4 * i + 2] = Math.round(255 * col[2]); png.data[4 * i + 3] = 255;
    }
    fs.writeFileSync(file, PNG.sync.write(png));
}

const stats = {};
const want = (k) => !ONLY || ONLY.includes(k);

if (want('earth')) {
    const { gray, width, height } = loadEarthGrayscale();
    const e = buildEarthMesh(gray, width, height, { N: 160000 });
    const elevKm = new Float32Array(e.mesh.numRegions);
    for (let r = 0; r < elevKm.length; r++) elevKm[r] = elevToHeightKm(e.r_elevation[r]);
    const res = planetClimate({ xyz: e.r_xyz, elevKm, axes: 'y-up' });
    const pix = pixelToCell(e.r_xyz, 'y-up');
    writeMap(path.join(OUT, 'earth.png'), res.cell.koppen, pix);
    stats.earth = { label: 'Earth', group: 'Earth', ...dryness(res) };
    // observed (Beck), drawn on the same land
    const { koppen01 } = loadReferences(), lat = cellLatDeg(e.r_xyz, 'y-up', elevKm.length), truth = new Uint8Array(elevKm.length);
    for (let r = 0; r < truth.length; r++) {
        if (!res.cell.koppen[r]) continue;
        const lon = Math.atan2(e.r_xyz[3 * r], e.r_xyz[3 * r + 2]) * 180 / Math.PI;
        truth[r] = truthAt01(koppen01, lat[r], lon) || res.cell.koppen[r];
    }
    writeMap(path.join(OUT, 'earth-observed.png'), truth, pix);
    console.log(`earth: arid ${(100 * stats.earth.aridShare).toFixed(0)} %`);
}

const keys = GEN_PLANETS.filter(p => (process.argv.includes('--tests') || p.kind !== 'test') && want(p.key)).map(p => p.key);
for (const p of await loadGenPlanets({ only: keys, log: () => {} })) {
    const res = planetClimate({ xyz: p.xyz, elevKm: p.elevKm, axes: p.axes });
    writeMap(path.join(OUT, `${p.key}.png`), res.cell.koppen, pixelToCell(p.xyz, p.axes));
    const q = GEN_PLANETS.find(g => g.key === p.key);
    stats[p.key] = { label: q.label, group: q.group, ...dryness(res) };
    console.log(`${p.key}: arid ${(100 * stats[p.key].aridShare).toFixed(0)} %`);
}
const statsFile = path.join(OUT, 'stats.json');
const prev = fs.existsSync(statsFile) ? JSON.parse(fs.readFileSync(statsFile, 'utf8')) : {};
fs.writeFileSync(statsFile, JSON.stringify({ ...prev, ...stats }, null, 2));
console.log(`Wrote ${path.relative(process.cwd(), OUT)}`);
