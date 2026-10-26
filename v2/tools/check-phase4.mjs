// Headless acceptance checks for Phase 4 (plate driving forces).
// Usage: node v2/tools/check-phase4.mjs

import { check, section, finish, labMesh, checkLabPhaseLoads, mean, largestJump, LAB_MESH_SEED } from './lib/check-kit.mjs';
import { makeRng } from '../../js/rng.js';
import { PLANET_RADIUS_KM } from '../js/core/sim-mesh.js';
import { FORCE_SCENES } from '../js/tectonics/scenarios/force-scenes.js';
import { simulate } from '../js/tectonics/simulate.js';
import { updatePlateMotion, solve3 } from '../js/tectonics/step/torque-balance.js';
import { frameTallies, situationOf, isSteady, SITUATIONS } from '../js/tectonics/measure.js';
import { CrustType } from '../js/tectonics/model/crust.js';
import { resolve } from '../js/tectonics/step/resolve.js';
import { gatherLoads } from '../js/tectonics/step/forces.js';

const SEED = 12345, SNAPSHOT_MYR = 2, SPIN_UP_MYR = 20;
const mesh = labMesh();
const frameIndex = myr => Math.round(myr / SNAPSHOT_MYR);

function landCells(world) {
    let n = 0;
    for (const p of world.plates) for (let c = 0; c < p.crust.mask.length; c++) if (p.crust.mask[c] && p.crust.type[c] !== CrustType.OCEAN) n++;
    return n;
}

/** Simulate one Phase 4 scene with the force model as the only source of motion. */
function run(id, overrides = {}, onMesh = mesh) {
    const scene = FORCE_SCENES.find(s => s.id === id), world = scene.build(onMesh, SEED);
    Object.assign(world.config, overrides);
    const landBefore = landCells(world);
    const { frames, steps } = simulate(world, { untilMyr: scene.maxMyr, drive: updatePlateMotion, snapshotEveryMyr: SNAPSHOT_MYR, events: false });     // forces alone: collision events are Phase 5
    const idOf = Object.fromEntries(frames[0].plates.map(p => [p.name, p.id]));
    const tallies = frames.map(frameTallies);
    return {
        scene, world, frames, steps, idOf,
        movers: frames[0].plates.filter(p => !p.isBackground).map(p => p.name),
        plate: (name, myr) => frames[frameIndex(myr)].plates[idOf[name]],
        track: name => frames.map(f => f.plates[idOf[name]].speedCmYr),
        landDrift: landCells(world) - landBefore,
        maxGaps: Math.max(...tallies.map(t => t.gaps)),
        collision: tallies.map(t => t.collision),
    };
}

/**
 * How much of a plate's velocity (at its centre, at time `myr`) points west: 1 = due west, −1 = due east.
 * (Judged from the velocity: the centre of area itself lags, because new ocean keeps being added behind the plate.)
 */
function westwardShare(r, name, myr) {
    const { omega: o, centre: c } = r.plate(name, myr), v = [o[1] * c[2] - o[2] * c[1], o[2] * c[0] - o[0] * c[2], o[0] * c[1] - o[1] * c[0]];
    const west = [c[1], -c[0], 0], speed = Math.hypot(...v), length = Math.hypot(...west);
    return speed < 1e-12 ? 0 : (v[0] * west[0] + v[1] * west[1]) / (speed * length);
}

section('the solver');
{
    const rng = makeRng(7);
    let worst = 0;
    for (let k = 0; k < 200; k++) {
        const D = new Float64Array(9);                     // a random drag tensor: Σ c (I − r rᵀ)
        for (let j = 0; j < 30; j++) {
            const z = rng() * 2 - 1, a = rng() * 2 * Math.PI, s = Math.sqrt(1 - z * z), r = [s * Math.cos(a), s * Math.sin(a), z], c = 0.2 + rng();
            for (let p = 0; p < 3; p++) for (let q = 0; q < 3; q++) D[3 * p + q] += c * ((p === q ? 1 : 0) - r[p] * r[q]);
        }
        const b = [rng() - 0.5, rng() - 0.5, rng() - 0.5], x = solve3(D, b);
        for (let p = 0; p < 3; p++) worst = Math.max(worst, Math.abs(D[3 * p] * x[0] + D[3 * p + 1] * x[1] + D[3 * p + 2] * x[2] - b[p]));
    }
    check('torque balance is solved exactly', worst < 1e-10, `largest residual |D·ω − T| over 200 random plates: ${worst.toExponential(1)}`);
}

section('every scene');
const runs = Object.fromEntries(FORCE_SCENES.map(s => [s.id, run(s.id)]));
for (const r of Object.values(runs)) {
    const id = r.scene.id;
    check(`${id}: crust rules hold under computed motion`, r.maxGaps === 0 && r.landDrift === 0, `${r.maxGaps} gap cells, ${r.landDrift} land cells changed, ${r.steps} steps`);

    // Speeds must come out of the force balance. The speed cap is a backstop; if it ever engages, a force is missing.
    const capped = r.frames.flatMap(f => f.plates.filter(p => p.dynamics?.capped).map(p => `${p.name} at ${f.time} Myr`));
    const fastest = Math.max(...r.movers.map(name => Math.max(...r.track(name))));
    check(`${id}: the speed cap never engages`, capped.length === 0, capped.length ? capped.slice(0, 4).join(', ') : `fastest plate ${fastest.toFixed(1)} cm/yr, set by the balance of forces alone`);

    // Each plate is only ever in a situation the scene expects, and whenever it has settled its speed is in WBP's band for it.
    const surprises = [], outOfBand = [];
    let judged = 0;
    for (const f of r.frames) for (const p of f.plates) {
        if (p.isBackground || f.time < SPIN_UP_MYR) continue;
        const kind = situationOf(p.dynamics), expected = r.scene.expect[p.name] ?? r.scene.expect['*'];
        if (!expected.includes(kind)) surprises.push(`${p.name} is “${kind}” at ${f.time} Myr`);
        if (!isSteady(p)) continue;
        judged++;
        const band = SITUATIONS[kind];
        if (p.speedCmYr < band.min - 0.05 || p.speedCmYr > band.max + 0.05) outOfBand.push(`${p.name} ${p.speedCmYr.toFixed(2)} cm/yr as “${kind}” (${band.min}–${band.max}) at ${f.time} Myr`);
    }
    check(`${id}: plates are in the situations the scene sets up`, surprises.length === 0, surprises.length ? surprises.slice(0, 4).join('; ') : Object.entries(r.scene.expect).map(([n, k]) => `${n}: ${k.join(' → ')}`).join(' · '));
    check(`${id}: settled speeds sit in Worldbuilding Pasta's bands`, judged > 10 && outOfBand.length === 0,
        outOfBand.length ? `${outOfBand.length} of ${judged}: ${outOfBand.slice(0, 4).join('; ')}` : `${judged} plate-frames judged from ${SPIN_UP_MYR} Myr on`);
}

section('one-sided trench');
const solo = runs['one-sided'];
{
    const cruising = solo.track('Solo').slice(frameIndex(30));
    check('active-margin continent: 2–5 cm/yr', mean(cruising) >= 2 && mean(cruising) <= 5, `Solo cruises at ${mean(cruising).toFixed(2)} cm/yr (30–80 Myr), from rest`);
    const west = [20, 40, 60, 80].map(t => westwardShare(solo, 'Solo', t));
    check('it heads for its trench', Math.min(...west) > 0.9, `trench on the west coast → share of its velocity pointing west at 20/40/60/80 Myr: ${west.map(v => v.toFixed(2)).join(' / ')}`);
    const spinUp = solo.track('Solo').findIndex(v => v > 0.8 * mean(cruising)) * SNAPSHOT_MYR;
    check('motion is smooth, and takes a few Myr to respond', largestJump(cruising) < 0.35 && spinUp >= 4 && spinUp <= 25,
        `largest change between frames (${SNAPSHOT_MYR} Myr) once under way: ${largestJump(cruising).toFixed(2)} cm/yr; reaches 80 % of cruising speed after ${spinUp} Myr`);
}

section('tug of war');
{
    const r = runs.tug, early = Math.max(...r.track('Balanced').slice(0, frameIndex(30) + 1)), soloEarly = Math.max(...solo.track('Solo').slice(0, frameIndex(30) + 1));
    check('balanced pulls (nearly) cancel', early < 1 && early < 0.4 * soloEarly && r.plate('Balanced', 20).dynamics.tension > 0.8,
        `“Balanced” stays below ${early.toFixed(2)} cm/yr for the first 30 Myr while the one-sided continent reaches ${soloEarly.toFixed(2)}; tension ${r.plate('Balanced', 20).dynamics.tension.toFixed(2)}; ${r.plate('Balanced', 80).speedCmYr.toFixed(1)} cm/yr by 80 Myr once the unstable balance tips`);
    const lop = mean(r.track('Lopsided').slice(frameIndex(20))), west = [20, 50, 80].map(t => westwardShare(r, 'Lopsided', t));
    check('unequal pulls: it goes to the stronger side', lop > 0.8 && lop <= 5 && Math.min(...west) > 0.8,
        `“Lopsided” (long trench west, short trench east) drifts at ${lop.toFixed(2)} cm/yr; share of its velocity pointing west at 20/50/80 Myr: ${west.map(v => v.toFixed(2)).join(' / ')}`);
}

section('self-driven Wilson cycle');
{
    const r = runs.wilson, contact = r.collision.findIndex(c => c > 0) * SNAPSHOT_MYR;
    const west = r.plate('West', 40).speedCmYr, east = r.plate('East', 40).speedCmYr;
    check('the landmass pulls itself apart', west >= 2 && west <= 5 && east >= 2 && east <= 5, `at 40 Myr West ${west.toFixed(2)} and East ${east.toFixed(2)} cm/yr, no prescribed motion`);
    const track = r.track('East'), before = mean(track.slice(frameIndex(contact) - 6, frameIndex(contact))), after = mean(track.slice(frameIndex(contact) + 10, frameIndex(contact) + 25));
    check('collision slows the plate', contact > 0 && after < 0.75 * before, `East meets Far at ${contact} Myr: ${before.toFixed(2)} → ${after.toFixed(2)} cm/yr`);
    const late = r.collision.slice(-15), peak = Math.max(...r.collision);
    check('colliding plates lock instead of ploughing through', peak < 80 && Math.max(...late) <= Math.min(...late) + 25,
        `land-on-land overlap peaks at ${peak} cells and is ${r.collision.at(-1)} at the end, ${r.scene.maxMyr - contact} Myr after contact`);
    // judged at the seam: locked plates may still pivot about it, so their centres can differ in speed
    const last = r.frames.at(-1), oE = last.plates[r.idOf.East].omega, oF = last.plates[r.idOf.Far].omega, d = [oE[0] - oF[0], oE[1] - oF[1], oE[2] - oF[2]];
    let slip = 0, seam = 0;
    for (let c = 0; c < mesh.numCells; c++) {
        if (last.overlap[c] !== 2) continue;
        const x = mesh.xyz[3 * c], y = mesh.xyz[3 * c + 1], z = mesh.xyz[3 * c + 2];
        slip += Math.hypot(d[1] * z - d[2] * y, d[2] * x - d[0] * z, d[0] * y - d[1] * x) * PLANET_RADIUS_KM / 10; seam++;
    }
    check('locked plates move together', seam > 0 && slip / seam < 0.3 * before,
        `slip along the East–Far seam at ${r.scene.maxMyr} Myr: ${(slip / Math.max(1, seam)).toFixed(2)} cm/yr over ${seam} cells, against ${before.toFixed(2)} cm/yr of approach before contact; Far, with no trench of its own at first, is pushed along at ${r.plate('Far', r.scene.maxMyr).speedCmYr.toFixed(2)} cm/yr`);
}

section('India');
{
    const r = runs.india, contact = r.collision.findIndex(c => c > 0) * SNAPSHOT_MYR, india = r.track('India'), peak = Math.max(...india);
    const asiaBefore = mean(r.track('Asia').slice(frameIndex(10), frameIndex(contact)));
    check('subducting ocean plate: 8–20 cm/yr, several times a suction-driven continent', peak >= 8 && peak <= 20 && peak > 2.5 * asiaBefore,
        `India peaks at ${peak.toFixed(1)} cm/yr — ${(peak / asiaBefore).toFixed(1)}× the continent it is heading for (${asiaBefore.toFixed(2)})`);
    const after = mean(india.slice(frameIndex(contact) + 8));
    check('it slows sharply on contact', contact > 0 && after < 0.65 * peak, `contact at ${contact} Myr: ${peak.toFixed(1)} → ${after.toFixed(1)} cm/yr (the real India: 20 → 6)`);
    check('the collision stays a seam', Math.max(...r.collision) < 160, `overlap peaks at ${Math.max(...r.collision)} cells`);
    const stiff = run('india', { slabResistance: 2 * r.world.config.slabResistance }), stiffPeak = Math.max(...stiff.track('India'));
    check('its speed is set by slab pull against the mantle’s resistance', stiffPeak < 0.75 * peak, `doubling the slab resistance: peak ${peak.toFixed(1)} → ${stiffPeak.toFixed(1)} cm/yr`);
}

section('the start world');
{
    const r = runs.start, name = r.movers[0], top = Math.max(...r.track(name)), tension = r.plate(name, r.scene.maxMyr).dynamics.tension;
        // tension runs 0.74–0.88 over seeds (a ragged rim is a little less perfectly opposed than a round one)
    check('ringed supercontinent: still, but under tension', top < 1 && tension > 0.7, `${name} is never faster than ${top.toFixed(2)} cm/yr in ${r.scene.maxMyr} Myr; tension ${tension.toFixed(2)}`);
}

section('the physics responds the way it should');
{
    const cruise = r => mean(r.track('Solo').slice(frameIndex(30)));
    const cfg = solo.world.config, heavy = run('one-sided', { dragContinent: 2 * cfg.dragContinent, dragCraton: 2 * cfg.dragCraton }), none = run('one-sided', { slabSuction: 0 });
    check('more continental drag → slower continent', cruise(heavy) < 0.7 * cruise(solo), `${cruise(solo).toFixed(2)} → ${cruise(heavy).toFixed(2)} cm/yr with drag doubled`);
    check('no suction → no motion', Math.max(...none.track('Solo')) < 0.05, `fastest speed with suction off: ${Math.max(...none.track('Solo')).toFixed(3)} cm/yr`);
    // the forces themselves must not depend on the mesh …
    const pulls = [16000, 40000, 90000].map(cells => {
        const m = labMesh(cells), world = FORCE_SCENES[0].build(m, SEED);
        for (const p of world.plates) p.refreshExtent(m.xyz);
        resolve(world);
        return gatherLoads(world).get(world.plates.find(p => p.name === 'Solo').id).torqueMagnitudeSum;
    });
    const spread = (Math.max(...pulls) - Math.min(...pulls)) / mean(pulls);
    check('forces do not depend on mesh resolution', spread < 0.1, `total trench torque on the same continent at 16K / 40K / 90K cells: ${pulls.map(v => v.toFixed(1)).join(' / ')} (spread ${(spread * 100).toFixed(0)} %)`);
    // … the speed that emerges over time is allowed a wider margin (it also depends on how newly formed trench cells mature)
    const coarse = run('one-sided', {}, labMesh(16000));
    check('emergent speed is similar on a coarser mesh', Math.abs(cruise(coarse) - cruise(solo)) / cruise(solo) < 0.3,
        `${cruise(solo).toFixed(2)} cm/yr on 40K cells vs ${cruise(coarse).toFixed(2)} on 16K cells (the history always runs on the fixed 40K mesh, whatever the render detail)`);
}

section('lab');
await checkLabPhaseLoads('../../js/app/phases/phase4-forces.js', mesh, LAB_MESH_SEED, FORCE_SCENES.map(s => ({ scene: s.id })));

finish('Phase 4');
