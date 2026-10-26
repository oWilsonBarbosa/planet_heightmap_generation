// Phase 4 test scenes: nothing is prescribed — every plate moves only because of the forces on
// its boundaries. Each scene isolates one situation from WBP's speed table.
//   expect     plate name (or '*') → the situations (tectonics/measure.js SITUATIONS) that plate may be in
//              during the scene. Read by the lab's ✓/✗ column and by tools/check-phase4.mjs.
//   checklist  what the developer should see in this scene, in plain language.

import { SimplexNoise } from '../../../../js/simplex-noise.js';
import { TectonicWorld } from '../model/world.js';
import { PLANET_RADIUS_KM } from '../../core/sim-mesh.js';
import { dot, cross, normalize } from '../../core/sphere-geom.js';
import { sceneCanvas, addContinent, addApronAndTrench, addOcean, flagCoastTrench, fillBackground } from './scene-kit.js';
import { buildWilsonWorld, WILSON_HOME } from './wilson-cycle.js';
import { buildStartWorld } from '../init/start-world.js';

const WEST = [[125, 235]], EAST = [[-55, 55]];

export const FORCE_SCENES = [
    {
        id: 'one-sided', label: 'One-sided trench', maxMyr: 80, view: [5, -35],
        about: 'A lone continent with a trench along its west coast only. Slab suction should pull it west, toward its trench, and it should settle at an active-margin speed (2–5 cm/yr).',
        expect: { Solo: ['active'] },
        checklist: [
            'Solo heads west, toward its trench: the cyan suction arrow points the way it goes, and the white velocity arrows follow it.',
            'It settles at an active-margin speed (WBP: 2–5 cm/yr) and its land keeps its shape; new ocean opens behind it, in the east.',
            'Try the sliders: zero suction freezes it; more continental drag slows it.',
        ],
        build(simMesh, seed) {
            const { world, canvas, noise } = begin(simMesh, seed);
            const solo = world.addPlate('Solo');
            addApronAndTrench(canvas, solo, addContinent(canvas, noise, { plate: solo, centre: [5, -20], radiusKm: 2300 }), WEST, world.config);
            fillBackground(canvas, world, world.config);
            return world;
        },
    },
    {
        id: 'tug', label: 'Tug of war', maxMyr: 80, view: [5, -5],
        about: '“Balanced” has equal trenches on opposite coasts: the pulls cancel, it barely moves, and its tension reads high — the state a ringed supercontinent is in before it rifts. “Lopsided” has a long trench in the west and a short one in the east, so it drifts slowly west.',
        expect: { Balanced: ['ringed', 'active'], Lopsided: ['active', 'ringed'] },
        checklist: [
            '“Balanced” sits almost still for tens of Myr with its two pulls cancelling: two long cyan arrows pointing opposite ways, and tension close to 1.',
            'It is an unstable balance, so it eventually tips one way and slowly speeds up; a new trench has little slab at first, which is what keeps the tipping slow.',
            '“Lopsided” drifts steadily west toward its longer trench, slower than a plate with one trench would.',
        ],
        build(simMesh, seed) {
            const { world, canvas, noise } = begin(simMesh, seed);
            const balanced = world.addPlate('Balanced'), lopsided = world.addPlate('Lopsided');
            addApronAndTrench(canvas, balanced, addContinent(canvas, noise, { plate: balanced, centre: [25, -65], radiusKm: 1900, wobble: 0.05 }), [[140, 220], [-40, 40]], world.config);
            addApronAndTrench(canvas, lopsided, addContinent(canvas, noise, { plate: lopsided, centre: [-20, 55], radiusKm: 1900 }), [[125, 235], [-18, 18]], world.config);
            fillBackground(canvas, world, world.config);
            return world;
        },
    },
    {
        id: 'wilson', label: 'Self-driven Wilson cycle', maxMyr: 160, view: [10, -20],
        about: 'The Phase 2 landmass, but nobody tells it how to move. Trenches on the two outer coasts pull West and East apart; an ocean opens between them and ridge push joins in. East then meets Far — and this time the collision slows it and locks the two together instead of letting them plough through each other.',
        expect: { West: ['active'], East: ['active', 'colliding'], Far: ['passive', 'colliding', 'active', 'ringed'] },       // once pushed, Far grows trenches of its own
        checklist: [
            'The two halves separate on their own, each toward its outer trench; a ridge and new ocean open between them and the red ridge-push arrows appear.',
            'When East reaches Far it slows, and the two lock and move together — the strong-magenta overlap stays a thin seam instead of growing as it did in Phase 2.',
            'Far, pushed east, starts to override the old ocean ahead of it and grows a trench of its own there.',
        ],
        build(simMesh, seed) {
            const world = buildWilsonWorld(simMesh, seed, { farCentre: [2, 26] });
            const named = name => world.plates.find(p => p.name === name);
            flagCoastTrench(simMesh, named('West'), WILSON_HOME.xyz, WEST, world.config);
            flagCoastTrench(simMesh, named('East'), WILSON_HOME.xyz, EAST, world.config);
            for (const p of world.plates) p.refreshExtent(simMesh.xyz);
            return world;
        },
    },
    {
        id: 'india', label: 'India: a subducting ocean plate', maxMyr: 70, view: [5, 72],
        about: '“Asia” is a big continent with a trench along its south coast. “India” is a small continent on a plate that is mostly ocean, and that ocean is going down Asia’s trench: slab pull acts on India’s own plate, so it should race north at subducting-ocean speeds (8–20 cm/yr), several times faster than any suction-driven continent, then slow sharply when the two landmasses meet.',
        expect: { India: ['subducting', 'colliding'], Asia: ['active', 'colliding'] },
        checklist: [
            'India — whose own ocean floor is going down Asia’s trench — is several times faster than any suction-driven continent (yellow slab-pull arrow), in WBP’s 8–20 cm/yr band.',
            'Its speed is set by the balance of slab pull against the mantle’s resistance to the sinking slab, not by a speed cap.',
            'On contact it drops sharply and the two lock (the real India went 20 → 6 cm/yr).',
        ],
        build(simMesh, seed) {
            const { world, canvas, noise } = begin(simMesh, seed);
            const asia = world.addPlate('Asia'), india = world.addPlate('India');
            const asiaLand = addContinent(canvas, noise, { plate: asia, centre: [40, 72], radiusKm: 2800 });
            addApronAndTrench(canvas, asia, asiaLand, [[215, 325]], world.config);
            const indiaLand = addContinent(canvas, noise, { plate: india, centre: [-28, 72], radiusKm: 850, cratonKm: 400 });
            // India's plate: the ocean floor between the two continents, plus a skirt around India
            const a = indiaLand.centre, b = asiaLand.centre, axis = normalize(cross(a, b)), span = Math.acos(dot(a, b));
            addOcean(canvas, india, (x, y, z) => {
                const p = [x, y, z];
                if (Math.acos(Math.max(-1, Math.min(1, dot(p, a)))) * PLANET_RADIUS_KM < 1500) return true;
                const off = Math.abs(Math.asin(Math.max(-1, Math.min(1, dot(p, axis))))) * PLANET_RADIUS_KM;       // distance from the India–Asia great circle
                const along = Math.atan2(dot(cross(a, p), axis), dot(a, p));                                         // angle travelled from India toward Asia
                return off < 1700 && along > 0 && along < span;
            }, -90);
            fillBackground(canvas, world, world.config);
            return world;
        },
    },
    {
        id: 'start', label: 'The Phase 3 start world', maxMyr: 60, view: null,
        about: 'A generated supercontinent with a trench round most of its rim. Pulled from almost every side at once, it should hardly move — but its tension should be high. That stored tension is what Phase 6 will use to decide when and where it rifts.',
        expect: { '*': ['ringed'] },
        checklist: [
            'Pulled from nearly all sides, the supercontinent barely moves (well under 1 cm/yr), but “tension” reads close to 1.',
            'Phase 6 will use that stored tension to decide when and where a supercontinent rifts.',
        ],
        build(simMesh, seed) { return buildStartWorld(simMesh, seed).world; },
    },
];

function begin(simMesh, seed) {
    const world = new TectonicWorld(simMesh, seed);
    return { world, canvas: sceneCanvas(simMesh, world.config), noise: new SimplexNoise(seed) };
}
