// Phase 7a test scenes — hotspots and LIPs. Two are driven KINEMATICALLY (each plate's motion is set, not
// solved for), because what they test is geometry: that a track lies where the plate carried the crust
// over a plume fixed in the mantle, that it grows older downstream, and that it bends where the plate
// turned. The third is the whole generator, with every event rule on.

import { SimplexNoise } from '../../../../js/simplex-noise.js';
import { TectonicWorld } from '../model/world.js';
import { latLonToXyz, omegaFromEulerPole } from '../step/kinematics.js';
import { updatePlateMotion } from '../step/torque-balance.js';
import { sceneCanvas, addContinent, addApronAndTrench, addOcean, fillBackground } from './scene-kit.js';
import { onlyMechanisms } from '../config.js';
import { buildStartWorld } from '../init/start-world.js';
import { cross, normalize } from '../../core/sphere-geom.js';

// Hawaii: the plume, the plate's speed, and its heading (degrees from north) at the plume before and after the bend
const HAWAII = { plume: [19, -155], speedCmYr: 8, bendMyr: 45, legs: [0, -60] };
const DECCAN = { plume: [-30, 75], speedCmYr: 12, arrivesMyr: 12 };

// the kinematic scenes isolate the plumes: no rifting, no arcs or wings, no new trenches, no plumes by chance
const PLUMES_ONLY = onlyMechanisms();              // the scene places its own plume; nothing else happens

export const HOTSPOT_SCENES = [
    {
        id: 'hawaii', label: 'A plate slides over a fixed plume', maxMyr: 90, view: [20, -165],
        about: 'An ocean plate, “Pacifica”, slides over a plume that stays put in the mantle. The plume keeps erupting, so the plate carries away a chain of volcanoes that is youngest over the plume and older the further downstream — and at 45 Myr the plate turns 60° to the west, so the chain bends, as the Hawaiian–Emperor chain does.',
        ...HAWAII,
        build(simMesh, seed) {
            const { world, canvas } = begin(simMesh, seed);
            Object.assign(world.config, PLUMES_ONLY);
            const pac = world.addPlate('Pacifica');
            // a cap of old ocean big enough to hold the whole track (which, on the plate, runs south and then east-south-east of the plume)
            const centre = latLonToXyz(-6, -148), reach = Math.cos(5200 / 6371);
            addOcean(canvas, pac, (x, y, z) => x * centre[0] + y * centre[1] + z * centre[2] >= reach, -60);
            fillBackground(canvas, world, world.config);
            world.plumes.push({ time: 0, xyz: latLonToXyz(...HAWAII.plume), head: false, rift: false, lifeMyr: 1000, strength: 1 });
            return world;
        },
        drive(world) {
            const pac = world.plates.find(p => p.name === 'Pacifica'), P = latLonToXyz(...HAWAII.plume);
            pac.omega = omegaFor(P, heading(P, world.time < HAWAII.bendMyr ? HAWAII.legs[0] : HAWAII.legs[1]), HAWAII.speedCmYr);
        },
    },
    {
        id: 'deccan', label: 'A plume head reaches a drifting continent', maxMyr: 70, view: [-15, 75],
        about: '“Indica” drifts north. At 12 Myr a new plume reaches the surface under its southern half: the plume HEAD floods a broad, lobed province of it with basalt — the Indica Traps, a Large Igneous Province — and then its TAIL, still erupting, draws a chain of volcanoes across the ocean floor Indica leaves behind it, from the traps to where the plume is now. (India, the Deccan Traps and the Réunion chain.)',
        ...DECCAN,
        build(simMesh, seed) {
            const { world, canvas, noise } = begin(simMesh, seed);
            Object.assign(world.config, PLUMES_ONLY);
            const ind = world.addPlate('Indica');
            const land = addContinent(canvas, noise, { plate: ind, centre: [-32, 75], radiusKm: 1800, cratonKm: 600 });
            addApronAndTrench(canvas, ind, land, [], world.config);
            fillBackground(canvas, world, world.config);
            world.plumes.push({ time: DECCAN.arrivesMyr, xyz: latLonToXyz(...DECCAN.plume), head: true, rift: false, lifeMyr: 1000, strength: 1 });
            return world;
        },
        drive(world) {
            const ind = world.plates.find(p => p.name === 'Indica'), P = latLonToXyz(...DECCAN.plume);
            ind.omega = omegaFor(P, heading(P, 0), DECCAN.speedCmYr);
        },
    },
    {
        id: 'history', label: 'Plumes through a whole history', maxMyr: 300, view: null,
        about: 'The generated supercontinent of Phase 3, left to itself, with every rule on. Plumes rise where the mantle is hot — above all where the supercontinent has sat for aeons, which it has insulated (Mantle heat layer) — but not only there. Each head floods the land or sea above it with basalt; under a big enough continent it may split it; each tail draws a track across whatever plate passes over it. The mantle remembers where the supercontinent WAS, so plumes keep rising there after it has broken up.',
        build(simMesh, seed) { return buildStartWorld(simMesh, seed).world; },
        drive: updatePlateMotion,
    },
];

function begin(simMesh, seed) {
    const world = new TectonicWorld(simMesh, seed);
    return { world, canvas: sceneCanvas(simMesh, world.config), noise: new SimplexNoise(seed) };
}

/** Unit tangent at P toward a compass bearing (degrees: 0 north, 90 east, −60 west-north-west). */
export function heading(P, bearingDeg) {
    const north = normalize([-P[2] * P[0], -P[2] * P[1], 1 - P[2] * P[2]]), east = cross(north, P), b = bearingDeg * Math.PI / 180;
    return normalize([north[0] * Math.cos(b) + east[0] * Math.sin(b), north[1] * Math.cos(b) + east[1] * Math.sin(b), north[2] * Math.cos(b) + east[2] * Math.sin(b)]);
}

/** The angular velocity that moves the point P along the tangent `dir` at speedCmYr: rotation about the pole P × dir. */
export function omegaFor(P, dir, speedCmYr) {
    return omegaFromEulerPole(normalize(cross(P, dir)), speedCmYr);    // (the pole is 90° from P, so P moves at the full speed)
}

