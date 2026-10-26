// Phase 6a/6b test scenes — rifting: a plume splits a lone continent; the Phase 3 start world breaks
// up on its own; and (6b) an old passive margin founders into a new trench, so an ocean that opened
// begins to close again. Driven by the force model with every event rule on.

import { SimplexNoise } from '../../../../js/simplex-noise.js';
import { TectonicWorld } from '../model/world.js';
import { latLonToXyz } from '../step/kinematics.js';
import { sceneCanvas, addContinent, addApronAndTrench, addOcean, fillBackground } from './scene-kit.js';
import { mechanismsOff } from '../config.js';
import { dot } from '../../core/sphere-geom.js';
import { buildStartWorld } from '../init/start-world.js';

export const RIFT_SCENES = [
    {
        id: 'plume', label: 'A plume splits a continent', maxMyr: 160, view: [5, -20],
        about: '“Pangaea” is a single continent with trenches on its west and east coasts — pulled both ways, going nowhere. At 20 Myr a mantle plume rises under it: a rift starts there, runs to the coasts along the cheapest line (round the craton, along any old seams), leaves a failed arm behind, and the two halves are pulled apart by their own trenches; a ridge opens between them.',
        build(simMesh, seed) {
            const { world, canvas, noise } = begin(simMesh, seed);
            const pangaea = world.addPlate('Pangaea');
            pangaea.born = -world.config.riftTenureMyr;                       // (assembled in prehistory, as the start world: its clock — step/rifting.js — lets it rift)
            const land = addContinent(canvas, noise, { plate: pangaea, centre: [5, -20], radiusKm: 2600, cratonKm: 800, wobble: 0.12 });
            addApronAndTrench(canvas, pangaea, land, [[140, 220], [-40, 40]], world.config);
            fillBackground(canvas, world, world.config);
            Object.assign(world.config, mechanismsOff('plumes', 'backArcs', 'marginIsles', 'marginErosion', 'underthrust', 'arcRecycling'));      // the one scheduled plume, and no other
            const j = latLonToXyz(-3, -14);                                                     // off-centre, so the rift skirts the craton
            world.plumes.push({ time: 20, plate: pangaea.id, cell: simMesh.index.nearest(j[0], j[1], j[2]), done: false });
            return world;
        },
    },
    {
        id: 'breakup', label: 'The start world breaks up', maxMyr: 300, view: null,
        about: 'The generated supercontinent of Phase 3, ringed by subduction and under tension. Left to itself it rifts — when is a matter of chance from the seed; where follows the sutures between its cratons — and the pieces disperse, each with its own trenches, wings and arcs. The first history the generator produces on its own.',
        build(simMesh, seed) { return buildStartWorld(simMesh, seed).world; },
    },
    {
        id: 'founder', label: 'A passive margin founders', maxMyr: 300, view: [0, 0],
        about: 'Two continents across one old ocean, and not a trench between them: passive margins, as a rift leaves them. Each plate owns its half of the ocean, so they meet in mid-basin. Old ocean crust is cold and dense, so sooner or later one of those margins founders — a new trench is born along it, that half of the ocean starts going down beneath the other plate, and the basin that once opened begins to close. When it happens is a matter of chance from the seed (try New); that it happens at all is what closes a Wilson cycle.',
        build(simMesh, seed) {
            const { world, canvas, noise } = begin(simMesh, seed);
            const west = world.addPlate('Westland'), east = world.addPlate('Eastland');
            const wl = addContinent(canvas, noise, { plate: west, centre: [0, -26], radiusKm: 2200, cratonKm: 700 });
            const el = addContinent(canvas, noise, { plate: east, centre: [0, 26], radiusKm: 2200, cratonKm: 700 });
            addApronAndTrench(canvas, west, wl, [], world.config);          // an apron of old ocean and NO trench: passive all round
            addApronAndTrench(canvas, east, el, [], world.config);
            shareBasin(canvas, [west, east], [wl.centre, el.centre], world.config);
            fillBackground(canvas, world, world.config);
            // this scene is about a margin founding, and nothing else: no rifting, and no plate carved out of the
            // passive ocean (so only the real margin the two plates share can give way, not the open ocean around them)
            Object.assign(world.config, mechanismsOff('rifts', 'plumes', 'backArcs', 'marginIsles', 'marginErosion', 'underthrust', 'arcRecycling'), { oceanPlateMinAreaKm2: Infinity });
            return world;
        },
    },
];

/**
 * The basin between the two continents, divided between their plates so they MEET down its middle —
 * a real plate-to-plate margin, which is the only kind that can found a trench. Its crust is the old
 * ocean a rift left behind; beyond the two plates lies the passive pre-history ocean, which takes no
 * part. Old and long, the shared margin is the one that gives way, and the basin closes.
 */
function shareBasin(canvas, plates, centres, cfg) {
    const sep = Math.acos(Math.max(-1, Math.min(1, dot(centres[0], centres[1]))));
    const reach = sep * 0.72;                                       // each plate reaches a little past the mid-line: they meet all along it
    for (let i = 0; i < plates.length; i++) {
        addOcean(canvas, plates[i], (x, y, z) => {
            const here = [x, y, z];
            if (Math.acos(Math.max(-1, Math.min(1, dot(here, centres[i])))) > reach) return false;
            return dot(here, centres[i]) >= dot(here, centres[1 - i]);
        }, -cfg.basinOceanAgeMyr);
    }
}

function begin(simMesh, seed) {
    const world = new TectonicWorld(simMesh, seed);
    return { world, canvas: sceneCanvas(simMesh, world.config), noise: new SimplexNoise(seed) };
}
