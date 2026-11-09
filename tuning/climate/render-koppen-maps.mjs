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
import { pixelToCell as pixelMap } from './lib/glance.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const climateBase = arg('--climate', null) ? pathToFileURL(path.resolve(arg('--climate')) + '/').href : new URL('../../', import.meta.url).href;
const { planetClimate } = await import(climateBase + 'v2/js/climate/climate.js');
const { setParams } = await import(climateBase + 'v2/js/climate/config.js');
const argSet = arg('--set', null);
if (argSet) setParams(Object.fromEntries(argSet.split(',').map(kv => { const [k, v] = kv.split('='); return [k, +v]; })));
const TAG = arg('--tag', 'now'), W = +arg('--width', 1200), H = W / 2;
const ONLY = arg('--only', null)?.split(',') ?? null;
const pixelToCell = (xyz, axes) => pixelMap(xyz, axes, W, H);
const OUT = path.join(__dirname, '..', 'results', 'climate', 'maps', TAG);
fs.mkdirSync(OUT, { recursive: true });

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
