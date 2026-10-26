// Phase 2 test scene: a hand-made mini Wilson cycle with PRESCRIBED motion, to show the
// divergence and convergence rules in isolation.
//   • one landmass, already cut along a zig-zag line into West and East (rifting logic
//     itself is a later phase), plus a third continent "Far", over a passive pre-history ocean
//   • West and East hinge apart about a shared Euler pole at very different speeds (1 vs 6 cm/yr)
//     → an interior ocean opens between them. Spreading is symmetric, so the ridge stays mid-way
//     between the two coasts and therefore migrates east at half the speed difference
//   • their outer (leading) coasts override the old ocean → trenches
//   • East runs into Far → land-on-land contact, which this phase only detects
//   • at 100 Myr West reverses: its western coast stops being an active margin, so the trench
//     flags it carries go dormant — the persistent record of a former active margin

import { SimplexNoise } from '../../../../js/simplex-noise.js';
import { TectonicWorld } from '../model/world.js';
import { CrustType, CrustFlag } from '../model/crust.js';
import { latLonToXyz, omegaFromEulerPole } from '../step/kinematics.js';
import { dot, cross, normalize, angleBetween as angle } from '../../core/sphere-geom.js';

export const WILSON_MAX_MYR = 150;
export const WEST_CM_YR = 1.0, EAST_CM_YR = 6.0;
export const WEST_REVERSES_MYR = 100;

const HOME = [8, -40];            // centre of the starting landmass (lat, lon)
const HINGE_POLE = [72, -40];     // West and East both rotate about this pole, in opposite senses
const FAR_CENTRE = [2, 72];

export function buildWilsonWorld(simMesh, seed, { farCentre = FAR_CENTRE } = {}) {
    const world = new TectonicWorld(simMesh, seed);
    const noise = new SimplexNoise(seed);
    const { xyz, numCells } = simMesh;

    const west = world.addPlate('West'), east = world.addPlate('East'), far = world.addPlate('Far');
    const ocean = world.addPlate('Pre-history ocean');
    ocean.isBackground = true;
    const pole = latLonToXyz(HINGE_POLE[0], HINGE_POLE[1]);
    west.scene.motion = { pole, speedCmYr: -WEST_CM_YR, speedAt: t => (t < WEST_REVERSES_MYR ? -WEST_CM_YR : WEST_CM_YR),
        note: `hinges slowly west (${WEST_CM_YR} cm/yr at the pole’s equator), then reverses at ${WEST_REVERSES_MYR} Myr` };
    east.scene.motion = { pole, speedCmYr: EAST_CM_YR, note: `hinges east ${EAST_CM_YR / WEST_CM_YR}× faster, toward Far (${EAST_CM_YR} cm/yr at the pole’s equator)` };
    far.scene.motion = { pole, speedCmYr: 0, note: 'stationary continent in East’s path' };
    ocean.scene.motion = { pole, speedCmYr: 0, note: 'passive background — only ever consumed' };

    const home = latLonToXyz(HOME[0], HOME[1]), farC = latLonToXyz(farCentre[0], farCentre[1]);
    // local east axis at HOME, to measure which side of the rift a cell is on
    const eastAxis = normalize(cross([0, 0, 1], home)), northAxis = cross(home, eastAxis);
    const cratonW = latLonToXyz(HOME[0] + 4, HOME[1] - 15), cratonE = latLonToXyz(HOME[0] - 5, HOME[1] + 16);

    for (let c = 0; c < numCells; c++) {
        const p = [xyz[3 * c], xyz[3 * c + 1], xyz[3 * c + 2]];
        const wob = 0.26 * noise.fbm(p[0] * 2.3 + 9, p[1] * 2.3 + 9, p[2] * 2.3 + 9, 5);
        const dHome = angle(p, home), dFar = angle(p, farC);

        if (dHome + wob < 0.52) {
            // zig-zag rift: three straight segments, like joined triple-junction arms
            const e = dot(p, eastAxis), n = dot(p, northAxis);
            const zig = 0.07 * triangleWave(n * 3.2 + 0.4);
            const plate = e < zig ? west : east;
            const craton = angle(p, plate === west ? cratonW : cratonE) + 0.5 * wob < 0.17;
            plate.crust.create(c, craton ? CrustType.CRATON : CrustType.CONTINENT, -world.config.initialLandAgeMyr);
            if (Math.abs(e - zig) < 1.2 * simMesh.edgeRad) plate.crust.flags[c] |= CrustFlag.RIFT_MARGIN;
        } else if (dFar + wob < 0.34) {
            far.crust.create(c, dFar + 0.5 * wob < 0.15 ? CrustType.CRATON : CrustType.CONTINENT, -world.config.initialLandAgeMyr);
        } else {
            ocean.crust.create(c, CrustType.OCEAN, -world.config.initialOceanAgeMyr);
        }
    }
    return world;
}

/** Prescribed motion: Euler-pole rotation per plate, optionally changing with time. */
export function driveWilson(world) {
    for (const p of world.plates) {
        const speed = p.scene.motion.speedAt ? p.scene.motion.speedAt(world.time) : p.scene.motion.speedCmYr;
        p.omega = omegaFromEulerPole(p.scene.motion.pole, speed);
    }
}

export const WILSON_POLE_XYZ = latLonToXyz(HINGE_POLE[0], HINGE_POLE[1]);
export const WILSON_HOME = { lat: HOME[0], lon: HOME[1], xyz: latLonToXyz(HOME[0], HOME[1]), poleDistanceDeg: HINGE_POLE[0] - HOME[0] };

function triangleWave(t) { return 2 * Math.abs(2 * (t - Math.floor(t + 0.5))) - 1; }
