// Headless acceptance checks for Phase 1 (foundations & rigid kinematics).
// Usage: node v2/tools/check-phase1.mjs      → prints PASS/FAIL lines, writes PNGs to v2/out/

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

import { check, section, finish, labMesh, checkLabPhaseLoads, LAB_MESH_SEED } from './lib/check-kit.mjs';
import { makeRng } from '../../js/rng.js';
import { PLANET_RADIUS_KM } from '../js/core/sim-mesh.js';
import { quatIdentity, quatIntegrate } from '../js/core/rotation.js';
import { CM_PER_YR_TO_RAD_PER_MYR } from '../js/tectonics/config.js';
import { latLonToXyz, omegaFromEulerPole, poseAtConstantOmega } from '../js/tectonics/step/kinematics.js';
import { reconstruct } from '../js/tectonics/step/reconstruct.js';
import { buildRigidDriftWorld, setRigidDriftTime } from '../js/tectonics/scenarios/rigid-drift.js';
import { CrustType } from '../js/tectonics/model/crust.js';
import { MapRaster } from '../js/view/map-raster.js';
import { colorByPlate, overlayOverlaps } from '../js/view/palettes.js';
import { captureFrame } from '../js/tectonics/snapshot.js';
import { frameTallies } from '../js/tectonics/measure.js';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'out');
fs.mkdirSync(OUT, { recursive: true });

const SEED = 12345;
const started = performance.now();
const mesh = labMesh();
console.log(`sim mesh: ${mesh.numCells} cells, ${mesh.edgeKm.toFixed(1)} km spacing, built in ${(performance.now() - started).toFixed(0)} ms (index ${mesh.index.res}² × 6)`);

section('foundations');
{   // the stated cell spacing is the real mean distance between neighbouring cells
    const { xyz, adjOffset, adjList, numCells } = mesh;
    let sum = 0, n = 0;
    for (let c = 0; c < numCells; c += 7) for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) {
        const b = adjList[k];
        sum += Math.acos(Math.min(1, xyz[3 * c] * xyz[3 * b] + xyz[3 * c + 1] * xyz[3 * b + 1] + xyz[3 * c + 2] * xyz[3 * b + 2])); n++;
    }
    const measured = sum / n;
    check('mesh.edgeRad is the true mean neighbour spacing', Math.abs(measured / mesh.edgeRad - 1) < 0.05,
        `measured ${(measured * PLANET_RADIUS_KM).toFixed(1)} km vs stated ${mesh.edgeKm.toFixed(1)} km`);
}
{   // sphere index vs brute force
    const rng = makeRng(99), { xyz, numCells } = mesh, samples = 5000;
    let wrong = 0;
    for (let i = 0; i < samples; i++) {
        const z = rng() * 2 - 1, a = rng() * 2 * Math.PI, r = Math.sqrt(1 - z * z), p = [r * Math.cos(a), r * Math.sin(a), z];
        let best = -1, bestDot = -2;
        for (let c = 0; c < numCells; c++) {
            const d = p[0] * xyz[3 * c] + p[1] * xyz[3 * c + 1] + p[2] * xyz[3 * c + 2];
            if (d > bestDot) { bestDot = d; best = c; }
        }
        if (mesh.index.nearest(p[0], p[1], p[2]) !== best) wrong++;
    }
    check('sphere index is exact', wrong === 0, `${wrong} of ${samples} random lookups differ from brute force`);
}
{   // 5 cm/yr for 100 Myr = 5000 km of travel 90° from the pole
    const q = poseAtConstantOmega(quatIdentity(), omegaFromEulerPole([0, 0, 1], 5), 100);
    const km = 2 * Math.acos(Math.min(1, Math.abs(q[0]))) * PLANET_RADIUS_KM;
    check('speed calibration', Math.abs(km - 5000) < 1, `5 cm/yr × 100 Myr → ${km.toFixed(2)} km (expected 5000)`);
}
{   // 2000 small steps forward then back returns to identity
    const omega = omegaFromEulerPole(latLonToXyz(33, -71), 9), back = omega.map(v => -v);
    let q = quatIdentity();
    for (let i = 0; i < 2000; i++) q = quatIntegrate(q, omega, 0.5);
    for (let i = 0; i < 2000; i++) q = quatIntegrate(q, back, 0.5);
    const err = Math.hypot(1 - Math.abs(q[0]), q[1], q[2], q[3]);
    check('rotation round-trip', err < 1e-9, `orientation error after 1000 Myr out-and-back: ${err.toExponential(2)}`);
}

section('rigid-drift scene');
const world = buildRigidDriftWorld(mesh, SEED);
reconstruct(world);
{
    const background = world.plates.find(p => p.isBackground);
    const oceanElsewhere = world.plates.some(p => !p.isBackground && p.crust.type.some((t, c) => p.crust.mask[c] && t === CrustType.OCEAN));
    check('continents-first', !oceanElsewhere && Math.hypot(...background.omega) === 0 && background.stats.continentalCells === 0,
        'continent plates carry no ocean; all ocean sits on one stationary background plate');
    const t = frameTallies(captureFrame(world));
    check('t = 0 tiles the sphere exactly', t.gaps === 0 && t.landOverOcean + t.collision === 0, `${t.gaps} gap cells, ${t.landOverOcean + t.collision} overlap cells`);
}
const owner0 = Int16Array.from(world.owner);

/** Rodrigues rotation of v about unit `axis` by `angle` — deliberately NOT the engine's quaternion code. */
function rotateAbout(axis, angle, v) {
    const c = Math.cos(angle), s = Math.sin(angle), d = axis[0] * v[0] + axis[1] * v[1] + axis[2] * v[2];
    return [0, 1, 2].map(i => v[i] * c + (axis[(i + 1) % 3] * v[(i + 2) % 3] - axis[(i + 2) % 3] * v[(i + 1) % 3]) * s + axis[i] * d * (1 - c));
}

/**
 * Where the engine shows a plate's land (its claims, read through plate.cellAt) vs where the closed-form
 * rotation says that land must be: each claimed world cell, rotated back by −angle about the scene's
 * pole, must land on land in the t = 0 raster. Returns the share of the claim that does not, and the
 * change in claimed area.
 */
function rigidShapeError(plate, t) {
    const { xyz, numCells, index } = mesh, { mask, type } = plate.crust, out = [0, 0, 0];
    const angle = plate.scene.def.speedCmYr * CM_PER_YR_TO_RAD_PER_MYR * t;
    let claimed = 0, misplaced = 0;
    for (let w = 0; w < numCells; w++) {
        const c = plate.cellAt(index, xyz[3 * w], xyz[3 * w + 1], xyz[3 * w + 2]);
        if (!mask[c] || type[c] === CrustType.OCEAN) continue;
        claimed++;
        const home = rotateAbout(plate.scene.pole, -angle, [xyz[3 * w], xyz[3 * w + 1], xyz[3 * w + 2]], out);
        const c0 = index.nearest(home[0], home[1], home[2]);
        if (!mask[c0] || type[c0] === CrustType.OCEAN) misplaced++;
    }
    return { misplacedPct: 100 * misplaced / claimed, areaDriftPct: 100 * Math.abs(claimed - plate.stats.continentalCells) / plate.stats.continentalCells };
}

const raster = new MapRaster(mesh, 1024), rgb = new Uint8Array(mesh.numCells * 3);
function writePng(name) {
    const png = new PNG({ width: raster.width, height: raster.height }), frame = captureFrame(world);
    colorByPlate(frame, rgb);
    overlayOverlaps(frame, rgb);
    raster.paint(rgb, png.data);
    fs.writeFileSync(path.join(OUT, name), PNG.sync.write(png));
}
writePng('phase1_t000.png');

for (const t of [73, 150, 300]) {
    setRigidDriftTime(world, t);
    const before = performance.now();
    reconstruct(world);
    const ms = performance.now() - before;
    let misplaced = 0, drift = 0;
    for (const p of world.plates) {
        if (!p.stats.continentalCells) continue;
        const e = rigidShapeError(p, t);
        misplaced = Math.max(misplaced, e.misplacedPct); drift = Math.max(drift, e.areaDriftPct);
    }
    check(`rigid shapes at ${t} Myr match the closed-form rotation`, misplaced < 0.5 && drift < 1.5,
        `worst plate: ${misplaced.toFixed(2)}% of its land cells misplaced, area drift ${drift.toFixed(2)}% (sampling noise only); reconstruct ${ms.toFixed(1)} ms`);
    const tally = frameTallies(captureFrame(world));
    const gapPct = 100 * tally.gaps / tally.cells, overlapPct = 100 * (tally.landOverOcean + tally.collision) / tally.cells;
    check(`at ${t} Myr, what opens behind the continents equals what they cover ahead`, Math.abs(gapPct - overlapPct) < 0.15 * Math.max(gapPct, overlapPct) + 0.1,
        `gaps ${gapPct.toFixed(2)}% of the sphere, overlaps ${overlapPct.toFixed(2)}% (rigid motion conserves area)`);
    writePng(`phase1_t${String(t).padStart(3, '0')}.png`);
}

setRigidDriftTime(world, 0);
reconstruct(world);
let differing = 0;
for (let w = 0; w < owner0.length; w++) if (world.owner[w] !== owner0[w]) differing++;
check('scrub back to 0 Myr restores the start exactly', differing === 0, `${differing} cells differ`);

section('lab');
await checkLabPhaseLoads('../../js/app/phases/phase1-rigid-drift.js', mesh, LAB_MESH_SEED);

finish('Phase 1');
