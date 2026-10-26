// Render the start world's crust-type map for a few seeds, without simulating: for judging craton
// shapes, sizes and the accreted land around them at a glance.
// Usage: node v2/tools/render-start.mjs [seed seed …] [--tag=name]   → v2/out/start_<tag>_<seed>.png

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { labMesh } from './lib/check-kit.mjs';
import { buildStartWorld } from '../js/tectonics/init/start-world.js';
import { captureFrame } from '../js/tectonics/snapshot.js';
import { resolve } from '../js/tectonics/step/resolve.js';
import { classifyBoundaries } from '../js/tectonics/step/boundaries.js';
import { MapRaster } from '../js/view/map-raster.js';
import { colorByCrustType, overlayBoundaries } from '../js/view/palettes.js';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'out');
fs.mkdirSync(OUT, { recursive: true });
const args = process.argv.slice(2), tag = (args.find(a => a.startsWith('--tag=')) ?? '--tag=now').slice(6);
const seeds = args.filter(a => !a.startsWith('--')).map(Number);
if (!seeds.length) seeds.push(1, 2, 3, 4);

const mesh = labMesh(), raster = new MapRaster(mesh, 1024), rgb = new Uint8Array(mesh.numCells * 3);
for (const seed of seeds) {
    const { world, start } = buildStartWorld(mesh, seed);
    for (const p of world.plates) p.refreshExtent(mesh.xyz);
    resolve(world); classifyBoundaries(world, 0);
    const frame = captureFrame(world);
    colorByCrustType(frame, rgb); overlayBoundaries(frame, rgb);
    const png = new PNG({ width: raster.width, height: raster.height });
    raster.paint(rgb, png.data);
    const name = `start_${tag}_${seed}.png`;
    fs.writeFileSync(path.join(OUT, name), PNG.sync.write(png));
    const d = start.cratons.map(k => Math.round(2 * k.radius * 6371)).sort((a, b) => b - a);
    console.log(`${name} · craton diameters ${d.join(' ')} km · skirt ${start.skirtKm.toFixed(0)} km · ${start.attempts} attempt(s), craton area × ${start.cratonAreaScale.toFixed(2)}`);
}
