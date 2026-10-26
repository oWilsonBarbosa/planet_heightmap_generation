/**
 * The Köppen map of an Evolution world as the Evolution page draws it (its SmoothMapRaster, V1's class colours, the
 * sea plain), written as a PNG — for looking at the climate's detail on a simulated planet.
 *
 *   node tuning/climate/render-evolution-koppen.mjs [--seed 12345] [--ending none] [--n 160000] [--width 1440]
 *        [--out file.png] [--crop lon0,lon1,lat0,lat1] [--set KEY=value,…]   (CORE='{…}' for core options; uses diag-blotch.mjs's cached terrain)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import './lib/earth-context.mjs';                                   // (hands V1's sphere-mesh its Delaunator)
import { planetClimate } from '../../v2/js/climate/climate.js';
import { KOPPEN_CLASSES } from '../../v2/js/climate/koppen.js';
import { setParams } from '../../v2/js/climate/config.js';
import { terrainMesh } from '../../v2/js/terrain/terrain-mesh.js';
import { evolutionWorld } from '../../v2/js/climate-lab/evolution-world.js';
import { SmoothMapRaster } from '../../v2/js/view/map-raster.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const argSet = process.argv.indexOf('--set');
if (argSet > 0) setParams(Object.fromEntries(process.argv[argSet + 1].split(',').map(kv => { const [k, v] = kv.split('='); return [k, +v]; })));
const N = +arg('--n', 160000), SEED = +arg('--seed', 12345), ENDING = arg('--ending', 'none'), W = +arg('--width', 1440);
const OUT = arg('--out', path.join(__dirname, '..', 'results', 'climate', `evolution-koppen-${SEED}-${ENDING}.png`));
const CORE = process.env.CORE ? JSON.parse(process.env.CORE) : {};

const dir = path.join(__dirname, '..', 'results', 'climate', 'cache'), file = path.join(dir, `evolution-${SEED}-${ENDING}-${N}.f32`);
const tm = terrainMesh(N);
let heightKm;
if (fs.existsSync(file)) { const b = fs.readFileSync(file); heightKm = new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4); }
else {
    heightKm = evolutionWorld({ seed: SEED, ending: ENDING, cells: N }).heightKm;
    fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(file, Buffer.from(heightKm.buffer, heightKm.byteOffset, heightKm.byteLength));
}
const res = planetClimate({ xyz: tm.xyz, elevKm: heightKm, axes: 'z-up' }, CORE);
const rgb = new Uint8Array(3 * heightKm.length);
for (let c = 0; c < heightKm.length; c++) {
    const k = res.cell.koppen[c];
    const col = k ? KOPPEN_CLASSES[k].color.map(v => Math.round(255 * v)) : [28, 44, 70];
    rgb.set(col, 3 * c);
}
const raster = new SmoothMapRaster(tm, W), H = W >> 1;
const rgba = new Uint8ClampedArray(4 * W * H);
raster.paint(rgb, rgba);
// --crop lon0,lon1,lat0,lat1 (degrees): only that box
const crop = arg('--crop', null);
let png;
if (crop) {
    const [lo0, lo1, la0, la1] = crop.split(',').map(Number);
    const x0 = Math.round((lo0 + 180) / 360 * W), x1 = Math.round((lo1 + 180) / 360 * W), y0 = Math.round((90 - la1) / 180 * H), y1 = Math.round((90 - la0) / 180 * H);
    png = new PNG({ width: x1 - x0, height: y1 - y0 });
    for (let y = y0; y < y1; y++) png.data.set(rgba.subarray(4 * (y * W + x0), 4 * (y * W + x1)), 4 * (y - y0) * (x1 - x0));
} else { png = new PNG({ width: W, height: H }); png.data.set(rgba); }
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, PNG.sync.write(png));
console.log(`wrote ${OUT}`);
