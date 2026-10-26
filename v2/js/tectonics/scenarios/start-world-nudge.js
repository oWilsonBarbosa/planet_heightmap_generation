// Phase 3 scene: a generated start world, plus a short PRESCRIBED drift of the whole
// supercontinent ("the nudge") to show what the ocean apron buys: the trench is a smooth line
// a little offshore, so the active margin consumes old ocean cleanly and new crust appears only
// in the wake behind the plate — not in the lee of every headland as in the Phase 2 scene.

import { buildStartWorld } from '../init/start-world.js';
import { omegaFromEulerPole } from '../step/kinematics.js';
import { cross, normalize } from '../../core/sphere-geom.js';

export const NUDGE_MAX_MYR = 60;
export const NUDGE_CM_YR = 2;      // [WBP] an active-margin continent moves 2–5 cm/yr

/** @returns {{world, start, drive, heading: number[], pole: number[]}} */
export function buildNudgeScene(simMesh, seed, overrides = {}) {
    const { world, start } = buildStartWorld(simMesh, seed, overrides);
    // Head for the middle of the active rim: directly away from the passive stretch.
    const azimuth = ((start.passiveFrom + start.passiveTo) / 2 + 180) * Math.PI / 180;
    const u = start.reference, v = cross(start.centre, u);
    const heading = normalize([0, 1, 2].map(i => Math.cos(azimuth) * u[i] + Math.sin(azimuth) * v[i]));
    const pole = normalize(cross(start.centre, heading));         // 90° from the centre → near-pure translation
    const continent = world.plates[start.continentId];
    const drive = w => { continent.omega = omegaFromEulerPole(pole, NUDGE_CM_YR); void w; };
    return { world, start, drive, heading, pole };
}
