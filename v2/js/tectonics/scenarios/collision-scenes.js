// Phase 11 test scenes: collisions that close oceans. Driven by the force model with the collision rules on (no
// wings, as the Phase 5a scenes).

import { SimplexNoise } from '../../../../js/simplex-noise.js';
import { TectonicWorld } from '../model/world.js';
import { PLANET_RADIUS_KM } from '../../core/sim-mesh.js';
import { dot, cross, normalize } from '../../core/sphere-geom.js';
import { sceneCanvas, addContinent, addApronAndTrench, addOcean, fillBackground } from './scene-kit.js';

export const COLLISION_SCENES = [
    {
        id: 'zipper', label: 'Two continents meet at an angle', maxMyr: 160, view: [18, 72],
        about: '“Borea”, a long continent, has a trench along its whole south coast. “Austra” rides north on a mostly oceanic plate, its long chain of land set at an angle to that coast: its north-east end strikes Borea first, while the ocean to the west of the contact is still going down the trench. The pull of that slab turns Austra about the first contact, so the rest of the gap closes like a zipper — and only then do the two weld, with little or no sea left between them.',
        build(simMesh, seed) {
            const world = new TectonicWorld(simMesh, seed), canvas = sceneCanvas(simMesh, world.config), noise = new SimplexNoise(seed);
            const borea = world.addPlate('Borea'), austra = world.addPlate('Austra');
            // Borea: four cores in a row, one long continent with a long, fairly straight south coast (a round one curves
            // away from the contact, and no turn of a straight chain could close the gap against it — Phase 12)
            const cores = [[36, 20], [33, 45], [33, 70], [36, 95]].map(c => addContinent(canvas, noise, { plate: borea, centre: c, radiusKm: 1700, cratonKm: 550 }));
            const isLand = new Uint8Array(simMesh.numCells);
            for (const k of cores) for (let i = 0; i < isLand.length; i++) if (k.isLand[i]) isLand[i] = 1;
            const mid = normalize(cores.reduce((s, k) => [s[0] + k.centre[0], s[1] + k.centre[1], s[2] + k.centre[2]], [0, 0, 0]));
            const boreaLand = { centre: mid, isLand };
            addApronAndTrench(canvas, borea, boreaLand, [[180, 360]], world.config);
            // Austra: a long continent (three cores in a row), its north-east end nearest Borea's coast, its south-west end
            // further off — the two coasts meet at an angle (~30°)
            const parts = [[2, 92], [-8, 75], [-18, 58]].map(c => addContinent(canvas, noise, { plate: austra, centre: c, radiusKm: 1250, cratonKm: 450 }));
            const austraLand = parts[1];
            // Austra's plate: a skirt round it and the ocean between it and Borea, wide enough to meet Borea's trench along
            // most of its south coast
            const a = austraLand.centre, b = cores[2].centre, axis = normalize(cross(a, b)), span = Math.acos(dot(a, b));
            addOcean(canvas, austra, (x, y, z) => {
                const p = [x, y, z];
                if (Math.acos(Math.max(-1, Math.min(1, dot(p, a)))) * PLANET_RADIUS_KM < 3400) return true;
                const off = Math.abs(Math.asin(Math.max(-1, Math.min(1, dot(p, axis))))) * PLANET_RADIUS_KM;
                const along = Math.atan2(dot(cross(a, p), axis), dot(a, p));
                return off < 4200 && along > 0 && along < span;
            }, -90);
            fillBackground(canvas, world, world.config);
            return world;
        },
    },
];
