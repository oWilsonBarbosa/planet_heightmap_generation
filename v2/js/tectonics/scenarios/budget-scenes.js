// Phase 7c test scenes: the crust budget. Continents gain area from arcs and fore-arc islands; they lose it where a
// margin is erosive, where a collision drives one continent under another, and where a small arc goes down with its
// slab instead of accreting. Each scene isolates one of those; the last runs the whole budget over a long history.
// (They reuse older scenes, whose build() switches later mechanisms off: mechanismsOn switches the ones wanted back on.)

import { onlyMechanisms, mechanismsOn } from '../config.js';
import { updatePlateMotion } from '../step/torque-balance.js';
import { buildStartWorld, buildStartWorldAsync } from '../init/start-world.js';
import { MARGIN_SCENES } from './margin-scenes.js';
import { FORCE_SCENES } from './force-scenes.js';
import { EVENT_SCENES } from './event-scenes.js';

const scene = (list, id) => list.find(s => s.id === id);

export const BUDGET_SCENES = [
    {
        id: 'erosion', label: 'Erosive and accretionary margins', maxMyr: 150, view: [0, -20],
        about: '“Driftia” is pulled west by the trench along its western coast. Stretches of that margin are EROSIVE: the trench scrapes the fore-arc away and the coast retreats (Margins layer: purple), as the Andes have lost ~250 km of coast since the Jurassic. The stretches between are ACCRETIONARY: islands rise off the coast and grow into it (Crust type layer). Which is which comes from a field fixed in the plate, so a stretch keeps its character as the plate moves.',
        build(simMesh, seed) {
            const world = scene(MARGIN_SCENES, 'margins').build(simMesh, seed);
            Object.assign(world.config, onlyMechanisms('marginIsles', 'marginErosion'), mechanismsOn('marginIsles', 'marginErosion'),
                { marginErosionPatchKm: 1500, marginErosionRateBias: 0 });   // (shorter stretches, and no tilt by Driftia's slow convergence: one coast shows both kinds)
            return world;
        },
        drive: updatePlateMotion,
    },
    {
        id: 'india', label: 'A continent slides under another', maxMyr: 90, view: [5, 72],
        about: '“India” reaches “Asia”. Continental crust is too buoyant to subduct as a slab, but the leading edge of the lower continent slides UNDER the upper one: as the two converge, India’s land in the overlap is consumed and Asia’s crust above it thickens (Thickness layer) — the area becomes a plateau, as Tibet swallowed ~2000 km of Greater India. The continents weld when the collision is spent.',
        build(simMesh, seed) {
            const world = scene(FORCE_SCENES, 'india').build(simMesh, seed);
            Object.assign(world.config, onlyMechanisms('underthrust'), mechanismsOn('underthrust'));
            return world;
        },
        drive: updatePlateMotion,
    },
    {
        id: 'arcs', label: 'Small arcs go down, big arcs accrete', maxMyr: 220, view: [0, 0],
        about: 'Two continents close on each other, each with island arcs on its facing margin (the Phase 5b scene). Where an arc arrives at a continent, a small piece of it — under arcAccreteMinKm2 — is too little to accrete: it goes down with its slab (event log: “arc recycled”). Big arcs still accrete. So continents grow from arcs in fewer, bigger pieces — a Japan, a Kohistan — not a scatter of islets.',
        build(simMesh, seed) {
            const world = scene(EVENT_SCENES, 'arc-collision').build(simMesh, seed);
            Object.assign(world.config, onlyMechanisms('wings', 'arcs', 'arcRecycling'), mechanismsOn('wings', 'arcs', 'arcRecycling'));
            return world;
        },
        drive: updatePlateMotion,
    },
    {
        id: 'history', label: 'The crust budget over 600 Myr', maxMyr: 600, view: null,
        about: 'The generated supercontinent with every rule on, over 600 Myr (it takes a while to build). Continental area grows — arcs and fore-arc islands add crust — but not without bound: erosive margins, underthrusting at collisions and recycled arcs take some away again (chart: land share of the planet).',
        // (overrides: start-world tunables — the Evolution page's starting continent size is continentalFraction)
        build(simMesh, seed, overrides = {}) { return buildStartWorld(simMesh, seed, overrides).world; },
        // (the same, its start world's layout attempts evaluated side by side: app/helper-pool.js)
        async buildAsync(simMesh, seed, overrides = {}, helpers) { return (await buildStartWorldAsync(simMesh, seed, overrides, helpers)).world; },
        drive: updatePlateMotion,
    },
];
