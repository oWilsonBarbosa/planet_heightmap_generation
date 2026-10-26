/**
 * How blotchy the Köppen map is — on Earth (with Beck's map for scale) or on an Evolution world — and what makes it so.
 * On neighbouring land cells of the terrain mesh:
 *  • class edges: the share of neighbouring pairs in different classes (diag-detail.mjs's patchiness);
 *  • specks: the share of land cells whose class differs from most of their neighbours (salt and pepper);
 *  • patches: connected same-class regions per 10,000 land cells.
 * With --parts it also runs the climate with each source of detail below the grid switched off in turn.
 *
 *   node tuning/climate/diag-blotch.mjs [--planet earth|evolution] [--seed 12345] [--ending none|supercontinent]
 *                                       [--n 160000] [--parts] [--set KEY=value,…]   (CORE='{…}' for core options)
 *
 * An Evolution world's terrain is cached in tuning/results/climate/cache/ (its history takes about a minute).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEarthGrayscale } from './lib/earth-context.mjs';
import { buildEarthMesh } from './lib/earth-mesh.mjs';
import { loadReferences, truthAt01 } from './lib/ref.mjs';
import { elevToHeightKm } from '../../js/color-map.js';
import { planetClimate } from '../../v2/js/climate/climate.js';
import { KOPPEN_CLASSES } from '../../v2/js/climate/koppen.js';
import { setParams, PARAMS } from '../../v2/js/climate/config.js';
import { terrainMesh } from '../../v2/js/terrain/terrain-mesh.js';
import { evolutionWorld } from '../../v2/js/climate-lab/evolution-world.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const argSet = process.argv.indexOf('--set');
if (argSet > 0) setParams(Object.fromEntries(process.argv[argSet + 1].split(',').map(kv => { const [k, v] = kv.split('='); return [k, +v]; })));
const PLANET = arg('--planet', 'evolution'), N = +arg('--n', 160000), SEED = +arg('--seed', 12345), ENDING = arg('--ending', 'none');
const CORE = process.env.CORE ? JSON.parse(process.env.CORE) : {};

// ── the planet: positions, heights, neighbours (and Beck's classes on Earth) ──
let xyz, elevKm, axes, adjOffset, adjList, truth = null;
if (PLANET === 'earth') {
    const { koppen01 } = loadReferences();
    const { gray, width, height } = loadEarthGrayscale();
    const e = buildEarthMesh(gray, width, height, { N });
    xyz = e.r_xyz; axes = 'y-up'; ({ adjOffset, adjList } = e.mesh);
    elevKm = new Float32Array(e.mesh.numRegions);
    for (let r = 0; r < elevKm.length; r++) elevKm[r] = elevToHeightKm(e.r_elevation[r]);
    const probe = planetClimate({ xyz, elevKm, axes }, CORE);
    truth = new Uint8Array(elevKm.length);
    for (let r = 0; r < truth.length; r++) truth[r] = truthAt01(koppen01, probe.cell.lat[r], probe.cell.lon[r]);
} else {
    const dir = path.join(__dirname, '..', 'results', 'climate', 'cache'), file = path.join(dir, `evolution-${SEED}-${ENDING}-${N}.f32`);
    const tm = terrainMesh(N);
    if (fs.existsSync(file)) { const b = fs.readFileSync(file); elevKm = new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4); }
    else {
        console.log(`Building the Evolution world (seed ${SEED}, ending ${ENDING}) — about a minute, cached after…`);
        const wld = evolutionWorld({ seed: SEED, ending: ENDING, cells: N });
        elevKm = wld.heightKm;
        fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(file, Buffer.from(elevKm.buffer, elevKm.byteOffset, elevKm.byteLength));
    }
    xyz = tm.xyz; axes = 'z-up'; ({ adjOffset, adjList } = tm);
}
const n = elevKm.length;

function measure(k) {
    let pairs = 0, diff = 0, diffG = 0, specks = 0, land = 0;
    const parent = new Int32Array(n).fill(-1);
    const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
    for (let r = 0; r < n; r++) if (k[r]) parent[r] = r;
    for (let r = 0; r < n; r++) {
        if (!k[r]) continue;
        land++;
        let nb = 0, other = 0;
        for (let q = adjOffset[r]; q < adjOffset[r + 1]; q++) {
            const s = adjList[q]; if (!k[s]) continue;
            nb++; if (k[s] !== k[r]) other++;
            if (s < r) continue;
            pairs++;
            if (k[s] !== k[r]) diff++; else { const a = find(r), b = find(s); if (a !== b) parent[a] = b; }
            if (KOPPEN_CLASSES[k[s]].code[0] !== KOPPEN_CLASSES[k[r]].code[0]) diffG++;
        }
        if (nb >= 3 && other > nb / 2) specks++;
    }
    let patches = 0; for (let r = 0; r < n; r++) if (k[r] && find(r) === r) patches++;
    return { edges: diff / pairs, groups: diffG / pairs, specks: specks / land, patches: 1e4 * patches / land };
}
const fmt = (m) => `class edges ${(100 * m.edges).toFixed(1).padStart(4)} % · groups ${(100 * m.groups).toFixed(1).padStart(4)} % · specks ${(100 * m.specks).toFixed(2).padStart(5)} % · patches ${m.patches.toFixed(0).padStart(4)} per 10k land cells`;
const run = (label, core = {}, params = null) => {
    const saved = params ? { ...PARAMS } : null;
    if (params) setParams(params);
    const res = planetClimate({ xyz, elevKm, axes }, { ...CORE, ...core });
    if (saved) setParams(saved);
    const k = res.cell.koppen;
    if (truth) for (let r = 0; r < n; r++) if (!truth[r]) k[r] = 0;       // (Earth: the land Beck classifies)
    console.log(`  ${label.padEnd(30)} ${fmt(measure(k))}`);
    return res;
};

console.log(`${PLANET === 'earth' ? 'Earth' : `Evolution world, seed ${SEED}, ending ${ENDING}`}, ${n.toLocaleString()} cells`);
if (truth) console.log(`  ${'Beck (real)'.padEnd(30)} ${fmt(measure(truth))}`);
run('new climate');
if (process.argv.includes('--parts')) {
    run('… without the texture', { texture: null });
    run('… without rain by height', { rainPerKm: 0 });
    run('… without windward / lee / islands', {}, { RAIN_SLOPE_FACTOR: 0, RAIN_LEE_PER_KM: 0, RAIN_ISLAND_BOOST: 0 });
    run('… without the coasts\' seasons', {}, { TEMP_SEA_SWING: 1 });
    run('… none of these', { texture: null, rainPerKm: 0 }, { RAIN_SLOPE_FACTOR: 0, RAIN_LEE_PER_KM: 0, RAIN_ISLAND_BOOST: 0, TEMP_SEA_SWING: 1 });
}
