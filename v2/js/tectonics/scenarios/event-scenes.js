// Phase 5b test scenes — plates larger than their land: trench wings and arcs, a microcontinent
// docking, an island arc meeting a passive margin (polarity reversal), and two continents closing
// on each other with an arc on each facing margin. Driven by the force model with the event rules
// on, like the Phase 5a scenes.

import { SimplexNoise } from '../../../../js/simplex-noise.js';
import { TectonicWorld } from '../model/world.js';
import { CrustType, CrustFlag } from '../model/crust.js';
import { PLANET_RADIUS_KM } from '../../core/sim-mesh.js';
import { dot, cross, normalize } from '../../core/sphere-geom.js';
import { latLonToXyz } from '../step/kinematics.js';
import { sceneCanvas, sceneTerrane, addContinent, addApronAndTrench, addOcean, fillBackground } from './scene-kit.js';
import { FORCE_SCENES } from './force-scenes.js';

export const EVENT_SCENES = [
    {
        id: 'wings', label: 'Trench wings & island arcs', maxMyr: 300, view: [5, -35],
        about: 'The lone continent with a trench on its west coast. The trench does not stop where the land stops: its ends propagate out to sea, across the plate’s motion, capturing old ocean into the plate as a fore-arc; where a wing has swallowed enough slab, an island arc forms behind it — land that belongs to the continent’s plate.',
        expect: { wings: true, arc: true },
        build: FORCE_SCENES.find(s => s.id === 'one-sided').build,
    },
    {
        id: 'terrane', label: 'Microcontinent docks', maxMyr: 90, view: [5, 72],
        about: '“Asia” with a trench on its south coast; a microcontinent (well under the terrane size) rides north on a mostly-oceanic plate. On arrival it does not suture as an equal: it is added to Asia’s plate with a narrow belt, and subduction jumps to its outboard side — the rest of its plate keeps going down.',
        expect: { docks: true },
        build(simMesh, seed) {
            const { world, canvas, noise } = begin(simMesh, seed);
            const asia = world.addPlate('Asia'), rider = world.addPlate('Rider');
            const asiaLand = addContinent(canvas, noise, { plate: asia, centre: [40, 72], radiusKm: 2800 });
            addApronAndTrench(canvas, asia, asiaLand, [[215, 325]], world.config);
            const micro = addContinent(canvas, noise, { plate: rider, centre: [-26, 72], radiusKm: 450, cratonKm: 0 });
            addOceanBetween(canvas, rider, micro.centre, asiaLand.centre, 1500, 1700);
            fillBackground(canvas, world, world.config);
            return world;
        },
    },
    {
        id: 'arc', label: 'Arc meets a passive margin', maxMyr: 90, view: [0, 130],
        about: '“Austral” is a continent with no trench of its own; the ocean on its plate is going down the trench of “Oceanica”, an oceanic plate that already carries a mature island arc. Slab pull takes Austral north into the arc. The arc is small, so it accretes onto Austral — and from then on Oceanica’s ocean goes down beneath Austral: the polarity has reversed, with no rule written for it.',
        expect: { docks: true, reversal: true },
        build(simMesh, seed) {
            const { world, canvas, noise } = begin(simMesh, seed);
            const austral = world.addPlate('Austral'), oceanica = world.addPlate('Oceanica');
            const land = addContinent(canvas, noise, { plate: austral, centre: [-28, 130], radiusKm: 2000 });
            addArcPlate(canvas, oceanica, { lat: 14, lon: 130, halfWidthDeg: 17, depthDeg: 22 }, world.config);
            addOceanBetween(canvas, austral, land.centre, latLonToXyz(12, 130), 2200, 2600);
            fillBackground(canvas, world, world.config);
            return world;
        },
    },
    {
        id: 'arc-collision', label: 'Arcs between closing continents', maxMyr: 220, view: [0, 0],
        about: 'Two continents close on each other, each carrying an island arc on its facing margin. The arcs meet first — and they are thin, buoyant crust, so they are SCRAPED onto whichever continent they hit rather than welding the two plates where they touch. The ocean behind them keeps going down, and the continents keep closing until their own cores meet: that is the collision, and that is where the suture and the mountains belong.',
        expect: { docks: true },
        build(simMesh, seed) {
            const { world, canvas, noise } = begin(simMesh, seed);
            const west = world.addPlate('Westland'), east = world.addPlate('Eastland');
            const wl = addContinent(canvas, noise, { plate: west, centre: [0, -26], radiusKm: 2300 });
            const el = addContinent(canvas, noise, { plate: east, centre: [0, 26], radiusKm: 2300 });
            addApronAndTrench(canvas, west, wl, [[240, 300]], world.config);        // trench on the facing (east) coast
            addApronAndTrench(canvas, east, el, [[60, 120]], world.config);         // …and on the facing (west) coast
            addOceanBetween(canvas, west, wl.centre, el.centre, 400, 2200);
            addOceanBetween(canvas, east, el.centre, wl.centre, 400, 2200);
            addArcRidge(canvas, west, wl.centre, el.centre, 2000, 700, world.config, sceneTerrane(canvas));
            addArcRidge(canvas, east, el.centre, wl.centre, 2000, 700, world.config, sceneTerrane(canvas));
            fillBackground(canvas, world, world.config);
            return world;
        },
    },
];

/**
 * A line of island-arc crust on `plate`'s own ocean, `distanceKm` from `from` along the great circle toward
 * `toward`, `halfWidthKm` to each side of it — an arc that has already grown, so a scene need not wait for one.
 */
function addArcRidge(canvas, plate, from, toward, distanceKm, halfWidthKm, cfg, terraneId) {
    const { mesh } = canvas, { xyz, numCells } = mesh, crust = plate.crust;
    const axis = normalize(cross(from, toward));                                     // the plane the two centres lie in
    const band = distanceKm / PLANET_RADIUS_KM, half = halfWidthKm / PLANET_RADIUS_KM;
    plate.arcTerraneId = terraneId;
    for (let i = 0; i < numCells; i++) {
        if (!crust.mask[i] || crust.type[i] !== CrustType.OCEAN) continue;
        const p = [xyz[3 * i], xyz[3 * i + 1], xyz[3 * i + 2]];
        const lateral = Math.asin(Math.max(-1, Math.min(1, dot(p, axis))));           // off the great circle
        if (Math.abs(lateral) > half * 2.2) continue;
        const along = Math.acos(Math.max(-1, Math.min(1, dot(p, from))));             // from the continent's centre
        if (Math.abs(along - band) > half * 0.5) continue;
        crust.type[i] = CrustType.ARC;
        crust.terrane[i] = terraneId;
        crust.formedAt[i] = -cfg.initialOceanAgeMyr;
        crust.flags[i] &= ~CrustFlag.TRENCH;
    }
}

function begin(simMesh, seed) {
    const world = new TectonicWorld(simMesh, seed);
    return { world, canvas: sceneCanvas(simMesh, world.config), noise: new SimplexNoise(seed) };
}

/** Old ocean on `plate`: a skirt of `skirtKm` round `a`, plus a corridor `halfWidthKm` wide from `a` toward `b`. */
function addOceanBetween(canvas, plate, a, b, skirtKm, halfWidthKm) {
    const axis = normalize(cross(a, b)), span = Math.acos(dot(a, b));
    addOcean(canvas, plate, (x, y, z) => {
        const p = [x, y, z];
        if (Math.acos(Math.max(-1, Math.min(1, dot(p, a)))) * PLANET_RADIUS_KM < skirtKm) return true;
        const off = Math.abs(Math.asin(Math.max(-1, Math.min(1, dot(p, axis))))) * PLANET_RADIUS_KM;
        const along = Math.atan2(dot(cross(a, p), axis), dot(a, p));
        return off < halfWidthKm && along > 0 && along < span;
    }, -90);
}

/**
 * An oceanic plate with a mature trench along its south edge and an island arc behind it: the cells of
 * a lat/lon box; trench = the box's southern rim, two cells deep so a jagged edge has no unflagged
 * contact cells (a trench's polarity is decided cell by cell); arc = the row behind the rim.
 */
function addArcPlate(canvas, plate, { lat, lon, halfWidthDeg, depthDeg }, cfg) {
    const { mesh, taken } = canvas, { xyz, numCells, adjOffset, adjList } = mesh, arcTerrane = sceneTerrane(canvas);
    const inside = new Uint8Array(numCells);
    for (let i = 0; i < numCells; i++) {
        if (taken[i]) continue;
        const la = Math.asin(xyz[3 * i + 2]) * 180 / Math.PI, lo = Math.atan2(xyz[3 * i + 1], xyz[3 * i]) * 180 / Math.PI;
        const dlon = ((lo - lon + 540) % 360) - 180;
        if (la < lat || la > lat + depthDeg || Math.abs(dlon) > halfWidthDeg) continue;
        plate.crust.create(i, CrustType.OCEAN, -cfg.initialOceanAgeMyr);
        inside[i] = 1; taken[i] = 1;
    }
    // rows of cells inward (north) from the plate's southern rim: a trench TRENCH_KM deep, then an arc ARC_KM wide —
    // counted in this mesh's cells (2 rows and 1 at 40K), each row the neighbours just north of the row before
    const TRENCH_KM = 243, ARC_KM = 121, rows = Math.max(1, Math.round(TRENCH_KM / mesh.edgeKm)), arcRows = Math.max(1, Math.round(ARC_KM / mesh.edgeKm));
    const row = new Int16Array(numCells).fill(-1);
    let ring = [];
    for (let i = 0; i < numCells; i++) {
        if (!inside[i]) continue;
        for (let k = adjOffset[i]; k < adjOffset[i + 1]; k++) if (!inside[adjList[k]] && xyz[3 * adjList[k] + 2] < xyz[3 * i + 2]) { row[i] = 0; ring.push(i); break; }
    }
    for (let r = 1; r < rows + arcRows; r++) {
        const next = [];
        for (const i of ring) for (let k = adjOffset[i]; k < adjOffset[i + 1]; k++) { const nb = adjList[k]; if (inside[nb] && row[nb] < 0 && xyz[3 * nb + 2] > xyz[3 * i + 2]) { row[nb] = r; next.push(nb); } }
        ring = next;
    }
    plate.arcTerraneId = arcTerrane;
    for (let i = 0; i < numCells; i++) {
        if (row[i] < 0) continue;
        if (row[i] < rows) plate.crust.armTrench(i, cfg.arcMatureConsumedKm);
        else { plate.crust.type[i] = CrustType.ARC; plate.crust.formedAt[i] = -40; plate.crust.terrane[i] = arcTerrane; }
    }
}
