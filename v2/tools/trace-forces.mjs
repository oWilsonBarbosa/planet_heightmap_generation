// Print every plate's speed, force-balance target and situation through a Phase 4 scene.
// Usage: node v2/tools/trace-forces.mjs [sceneId|all] [configKey=value …]      e.g.  … india mobility=4
import { labMesh } from './lib/check-kit.mjs';
import { FORCE_SCENES } from '../js/tectonics/scenarios/force-scenes.js';
import { simulate } from '../js/tectonics/simulate.js';
import { updatePlateMotion } from '../js/tectonics/step/torque-balance.js';
import { frameTallies, situationOf } from '../js/tectonics/measure.js';

const which = process.argv[2] ?? 'all';
const over = Object.fromEntries(process.argv.slice(3).map(a => a.split('=')).map(([k, v]) => [k, +v]));
const mesh = labMesh(), SEED = 12345;
for (const scene of FORCE_SCENES) {
    if (which !== 'all' && scene.id !== which) continue;
    const world = scene.build(mesh, SEED);
    Object.assign(world.config, over);
    const t0 = Date.now();
    const { frames, steps } = simulate(world, { untilMyr: scene.maxMyr, drive: updatePlateMotion, snapshotEveryMyr: 2 });
    console.log(`\n== ${scene.id}  (${steps} steps, ${Date.now() - t0} ms)`);
    for (const f of frames) {
        if (Math.round(f.time) % 10 !== 0) continue;
        const t = frameTallies(f);
        const cols = f.plates.filter(p => !p.isBackground).map(p => `${p.name} ${p.speedCmYr.toFixed(2)}→${p.dynamics ? p.dynamics.targetCmYr.toFixed(2) : '-'} ${situationOf(p.dynamics)}${p.dynamics?.capped ? ' CAP' : ''} T${p.dynamics ? p.dynamics.tension.toFixed(2) : ''} c${p.dynamics?.collisionCells ?? 0}`);
        console.log(`${String(f.time).padStart(4)}  gaps ${t.gaps} prov ${t.provisional} coll ${t.collision} land ${t.land} | ${cols.join(' | ')}`);
    }
}
