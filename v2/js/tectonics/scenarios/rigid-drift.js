// Phase 1 test scene, continents-first like WBP's GPlates workflow: four plates that are
// ONLY a continent (noise-shaped, with a craton core), each on a fixed Euler pole, over one
// passive, stationary "pre-history ocean" plate that holds all the ocean crust. Nothing is
// resolved — the scene exists to prove rigid plate-frame storage, rotation math, and
// reconstruction. Behind a moving continent a gap opens (future new ocean, Phase 2); ahead
// of it the continent overlaps the old ocean (future subduction, Phase 2).

import { SimplexNoise } from '../../../../js/simplex-noise.js';
import { TectonicWorld } from '../model/world.js';
import { CrustType } from '../model/crust.js';
import { latLonToXyz, omegaFromEulerPole, poseAtConstantOmega } from '../step/kinematics.js';
import { quatIdentity } from '../../core/rotation.js';

// Plate centres (lat, lon) and their prescribed motions. `poleOffsetDeg` is the angular
// distance from the plate centre to its Euler pole: 90 = pure translation, 0 = pure spin.
const PLATES = [
    { name: 'Drifter',  centre: [ 20,  -60], poleOffsetDeg: 90, speedCmYr: 5, note: 'pole 90° away → translates at 5 cm/yr' },
    { name: 'Spinner',  centre: [-25,   40], poleOffsetDeg: 0,  speedCmYr: 4, note: 'pole at its centre → spins in place' },
    { name: 'Hinge',    centre: [ 45,  140], poleOffsetDeg: 35, speedCmYr: 3, note: 'pole 35° away → swings like a hinge' },
    { name: 'Anchor',   centre: [-50, -150], poleOffsetDeg: 90, speedCmYr: 0, note: 'stationary reference continent' },
];
const OCEAN = { name: 'Pre-history ocean', centre: [90, 0], poleOffsetDeg: 90, speedCmYr: 0, note: 'passive background — never moves, only gets overridden' };

export const RIGID_DRIFT_MAX_MYR = 300;

export function buildRigidDriftWorld(simMesh, seed) {
    const world = new TectonicWorld(simMesh, seed);
    const noise = new SimplexNoise(seed);
    const { xyz, numCells } = simMesh;
    const centres = PLATES.map(p => latLonToXyz(p.centre[0], p.centre[1]));

    const plates = PLATES.map((def, i) => {
        const plate = world.addPlate(def.name);
        plate.scene.q0 = quatIdentity();
        plate.scene.def = def;
        plate.scene.centre = centres[i];
        plate.scene.pole = poleFor(centres[i], def.poleOffsetDeg);
        plate.omega = omegaFromEulerPole(plate.scene.pole, def.speedCmYr);
        return plate;
    });

    const ocean = world.addPlate(OCEAN.name);
    ocean.scene.q0 = quatIdentity();
    ocean.scene.def = OCEAN;
    ocean.scene.centre = latLonToXyz(OCEAN.centre[0], OCEAN.centre[1]);
    ocean.scene.pole = ocean.scene.centre;
    ocean.isBackground = true;

    for (let c = 0; c < numCells; c++) {
        const x = xyz[3 * c], y = xyz[3 * c + 1], z = xyz[3 * c + 2];
        let best = 0, ownD = Infinity;
        for (let i = 0; i < centres.length; i++) {
            const d = Math.acos(clampDot(x, y, z, centres[i]));
            if (d < ownD) { ownD = d; best = i; }
        }
        // Continent = noisy blob around the plate centre; craton = its inner core.
        const shape = ownD + 0.30 * noise.fbm(x * 2.3 + 9, y * 2.3 + 9, z * 2.3 + 9, 5);
        let type = CrustType.OCEAN;
        if (shape < 0.20) type = CrustType.CRATON;
        else if (shape < 0.46) type = CrustType.CONTINENT;
        // Continental crust belongs to its continent's plate; every ocean cell to the background.
        if (type === CrustType.OCEAN) ocean.crust.create(c, type, -world.config.initialOceanAgeMyr);
        else plates[best].crust.create(c, type, -world.config.initialLandAgeMyr);
    }
    for (const p of world.plates) p.refreshExtent(xyz);
    setRigidDriftTime(world, 0);
    return world;
}

/** Pose every plate at absolute time t (closed form, so scrubbing backwards is exact). */
export function setRigidDriftTime(world, t) {
    for (const p of world.plates) p.setQuat(poseAtConstantOmega(p.scene.q0, p.omega, t));
    world.time = t;
}

function clampDot(x, y, z, v) {
    return Math.max(-1, Math.min(1, x * v[0] + y * v[1] + z * v[2]));
}

// A point `offsetDeg` away from `centre` (toward the north pole, or toward +x if degenerate).
function poleFor(centre, offsetDeg) {
    if (offsetDeg === 0) return centre.slice();
    const up = Math.abs(centre[2]) > 0.95 ? [1, 0, 0] : [0, 0, 1];
    // tangent at centre pointing toward `up`
    const d = up[0] * centre[0] + up[1] * centre[1] + up[2] * centre[2];
    let tx = up[0] - d * centre[0], ty = up[1] - d * centre[1], tz = up[2] - d * centre[2];
    const l = Math.hypot(tx, ty, tz); tx /= l; ty /= l; tz /= l;
    const a = offsetDeg * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
    return [centre[0] * ca + tx * sa, centre[1] * ca + ty * sa, centre[2] * ca + tz * sa];
}
