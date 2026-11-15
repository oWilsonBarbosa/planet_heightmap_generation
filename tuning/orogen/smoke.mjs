// Headless integration smoke test using Generate's actual planet worker and the v3 Evolution finish.
// Usage: node tuning/orogen/smoke.mjs --n 40000 --profile v3|closed-basins --out /tmp/planet.json
// This is a low-resolution functional test, NOT a replacement for the 2,560,001-cell canonical audit.
import { register } from 'node:module';
import fs from 'node:fs';
register(new URL('./delaunator-hook.mjs', import.meta.url), import.meta.url);

const arg = (k, d) => { const i = process.argv.indexOf(k); return i < 0 ? d : process.argv[i + 1]; };
const code = '06cy8w6z6a89kow6psje93';
const N = Number(arg('--n', '40000'));
const profile = arg('--profile', 'v3');
const output = arg('--out', '');
if (!Number.isInteger(N) || N < 1000 || N > 2560000) throw new Error('Unsupported --n');
if (!['v3', 'closed-basins'].includes(profile)) throw new Error('Unsupported --profile');
const gen = p => import(new URL('../../' + p, import.meta.url));
const { decodePlanetCode } = await gen('js/planet-code.js');
const params = decodePlanetCode(code);
params.N = N;
let result = null;
globalThis.self = {
    postMessage(msg) {
        if (msg.type === 'error') throw new Error(msg.message + '\n' + (msg.stack ?? ''));
        if (msg.type === 'done') result = msg;
        if (msg.type === 'progress') console.error('Generate', msg.pct, msg.label);
    },
};
const tick = performance.now();
await gen('js/planet-worker.js');
self.onmessage({ data: { cmd: 'generate', ...params, nMag: params.roughness, hydrologyProfile: profile } });
if (!result?.shared?.finish) throw new Error('Generate worker did not return a finish job');
const workerSeconds = (performance.now() - tick) / 1000;
const job = result.shared.finish;
if (profile === 'closed-basins' && (!job.finish.closedBasins || !job.finish.seaRemnantAnySize)) throw new Error('Closed-basin overrides missing in finish payload');
if (profile === 'v3' && ('closedBasins' in job.finish || 'seaRemnantAnySize' in job.finish)) throw new Error('Default v3 profile overridden unexpectedly');
console.error('Generate complete:', workerSeconds.toFixed(1), 's,', result.shared.mesh.numCells, 'cells');
const { finishPlanet } = await gen('v2/js/finish/finish.js');
const { FINISH } = await gen('v2/js/finish/finish-config.js');
const { terrainConfig } = await gen('v2/js/terrain/terrain-config.js');
const { meshFromArrays } = await gen('v2/js/core/sim-mesh.js');
const finTick = performance.now();
const fin = await finishPlanet({
    frame: job.frame,
    simMesh: meshFromArrays(job.simMesh),
    seed: job.seed,
    cells: result.shared.mesh.numCells,
    mesh: meshFromArrays(result.shared.mesh),
    surface: () => job.surface,
    climateOptions: {
        greenhouseWm2: params.greenhouse,
        precipScale: Math.max(0, 1 + 0.5 * params.precipitationOffset),
    },
    onStage: stage => console.error('Finish:', stage),
    cfg: terrainConfig(job.terrain),
    F: { ...FINISH, ...job.finish },
    network: true,
});
const finishSeconds = (performance.now() - finTick) / 1000;
const n = fin.mesh.numCells;
if (n !== result.shared.mesh.numCells) throw new Error('Mesh size changed between stages');
const types = { fresh: 0, salt: 0, pan: 0 }, koppen = { A: 0, B: 0, C: 0, D: 0, E: 0 };
let land = 0, north = 0, northIce = 0, northTundra = 0, nonfiniteZ = 0, nonfiniteQ = 0, elevated = 0;
let peak = -Infinity, deepest = Infinity, oceanCells = 0, above2 = 0;
const L = fin.lake, Z = fin.z, O = fin.ocean, H = fin.climate.cell, xyz = fin.mesh.xyz;
const classes = ['X', 'A','A','A','B','B','B','B','C','C','C','C','C','C','C','C','C','D','D','D','D','D','D','D','D','D','D','D','D','E','E'];
for (let i = 0; i < n; i++) {
    if (!Number.isFinite(Z[i])) nonfiniteZ++;
    if (O[i]) { oceanCells++; if (Z[i] < deepest) deepest = Z[i]; continue; }
    land++;
    if (Z[i] > peak) peak = Z[i];
    if (Z[i] > 2) above2++;
    if (L[i] === 1) types.fresh++;
    else if (L[i] === 2) types.salt++;
    else if (L[i] === 3) types.pan++;
    const k = H.koppen[i], grp = classes[k];
    if (grp in koppen) koppen[grp]++;
    if (xyz[3 * i + 2] > Math.sin(Math.PI / 3)) {
        north++;
        if (k === 30) northIce++;
        if (k === 29) northTundra++;
    }
}
for (const q of fin.rivers.q) if (!Number.isFinite(q)) nonfiniteQ++;
const water = fin.stats.water;
const totalBudget = water.toSeaShare + water.toBasinsShare + water.lostShare;
const summary = {
    planetCode: code, version: 'v3.0.1 + fork candidate',
    profile, requestedCells: N, cells: n,
    workerSeconds: +workerSeconds.toFixed(2), finishSeconds: +finishSeconds.toFixed(2),
    landShare: land/n, peakKm: peak, deepKm: deepest, above2KmShare: above2/Math.max(1, land),
    koppenLandCells: koppen,
    north60: { landCells: north, iceShare: northIce/Math.max(1, north), tundraShare: northTundra/Math.max(1, north) },
    lakeCells: types, water, riverPoints: fin.rivers.q.length,
    geology: !!fin.geology, farming: !!fin.farming,
    nonfiniteZ, nonfiniteQ, waterBudgetSum: totalBudget,
    memoryMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
};
console.log(JSON.stringify(summary, null, 2));
if (output) { fs.mkdirSync(new URL('.', 'file://' + output).pathname, { recursive: true }); fs.writeFileSync(output, JSON.stringify(summary, null, 2) + '\n'); }
if (nonfiniteZ || nonfiniteQ || !Number.isFinite(totalBudget) || totalBudget < 0.98 || totalBudget > 1.02 || !land || !oceanCells) process.exitCode = 1;
