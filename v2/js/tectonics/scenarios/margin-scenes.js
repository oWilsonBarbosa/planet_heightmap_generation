// Phase 7b test scenes — margins, flat slabs, slab rollback and back-arc basins.
//   margins   a continent pulled by one trench: a leading, active coast and a trailing, passive one
//   laramide  a continent driving over a young, buoyant slab: the slab goes in flat, the belt reaches far inland
//   mariana   an ocean plate pulled away from its own trench: the arc rifts off it and a basin opens behind
//   japan     the same at a continental margin: a strip of the coast rifts off and a sea opens behind it
//   history   the generator with every rule on

import { SimplexNoise } from '../../../../js/simplex-noise.js';
import { TectonicWorld } from '../model/world.js';
import { CrustType } from '../model/crust.js';
import { onlyMechanisms } from '../config.js';
import { latLonToXyz } from '../step/kinematics.js';
import { updatePlateMotion } from '../step/torque-balance.js';
import { sceneCanvas, addContinent, addApronAndTrench, addOcean, fillBackground } from './scene-kit.js';
import { buildStartWorld } from '../init/start-world.js';
import { heading, omegaFor } from './hotspot-scenes.js';

// the rollback scenes isolate rollback: no rifting, wings, arcs grown, new trenches or plumes — and a back-arc basin
// opens as soon as its conditions hold (the chance per Myr is high), so the scene shows it rather than waits for it.
// Their plates move as set (kinematic): what they test is where and how the split happens; the force model's version
// of the same is the history scene. A strip that rifts off follows its trench in both (step/backarc.js steerBackArcStrips).
const ROLLBACK_ONLY = { ...onlyMechanisms('backArcs', 'flatSlabs'), backArcRatePerMyr: 0.5, backArcContinentalShare: 1 };
const QUIET = onlyMechanisms('flatSlabs', 'marginIsles');   // an active coast: its slab, and the islands off it
const LARAMIDE = { speedCmYr: 5, trenchLon: -118 };

export const MARGIN_SCENES = [
    {
        id: 'margins', label: 'A continent’s leading and trailing coasts', maxMyr: 60, view: [0, 0],
        about: '“Driftia” has a trench along its western coast and none elsewhere; slab suction pulls it west. Its western coast is ACTIVE and LEADING — a narrow shelf and a coastal range to come — and its eastern coast PASSIVE and TRAILING, a wide shelf; along its flanks it slides past the old ocean (Margins layer).',
        build(simMesh, seed) {
            const { world, canvas, noise } = begin(simMesh, seed);
            Object.assign(world.config, QUIET);
            const drift = world.addPlate('Driftia');
            const land = addContinent(canvas, noise, { plate: drift, centre: [0, 0], radiusKm: 2200, cratonKm: 700 });
            addApronAndTrench(canvas, drift, land, [], world.config);
            fillBackground(canvas, world, world.config);
            armFacing(simMesh, drift, latLonToXyz(0, 0), -90, world.config);      // the trench: the rim that faces west
            return world;
        },
        drive: updatePlateMotion,
    },
    {
        id: 'laramide', label: 'A continent drives over a young slab', maxMyr: 50, view: [40, -110],
        about: '“Laurentia” drives west at 5 cm/yr into a narrow, YOUNG ocean plate, “Farallona”, which is being made at a ridge only a short way offshore — so the slab going down is never older than a few tens of Myr. Young slab is warm and buoyant, and under a plate that drives at it this hard it goes in flat: the belt is Laramide — it reaches far inland, like the Rockies — and there are no arc volcanoes above it (Orogeny layer). Compare the Andean belt a steep slab makes (tunable: flat slabs up to …).',
        ...LARAMIDE,
        build(simMesh, seed) {
            const { world, canvas, noise } = begin(simMesh, seed);
            Object.assign(world.config, QUIET);
            const laur = world.addPlate('Laurentia'), far = world.addPlate('Farallona');
            const land = addContinent(canvas, noise, { plate: laur, centre: [42, -98], radiusKm: 2300, cratonKm: 400 });   // a small craton, far from the coast: a belt is not stopped short of its reach
            addApronAndTrench(canvas, laur, land, [], world.config);
            // a young ocean plate all along Laurentia's west coast, a narrow band between it and a ridge with the old ocean —
            // so every stretch of the leading edge goes down over young crust, never over the old ocean
            addOcean(canvas, far, (x, y, z) => {
                const lat = Math.asin(z) * 180 / Math.PI, lon = Math.atan2(y, x) * 180 / Math.PI;
                return lat > 12 && lat < 72 && lon > LARAMIDE.trenchLon - 30 && lon < LARAMIDE.trenchLon + 20;
            }, 0);                                                                                // brand new: the ridge is just offshore
            fillBackground(canvas, world, world.config);
            armAgainst(simMesh, laur, far, world.config);
            return world;
        },
        drive(world) {
            const laur = world.plates.find(p => p.name === 'Laurentia'), far = world.plates.find(p => p.name === 'Farallona'), P = latLonToXyz(42, LARAMIDE.trenchLon);
            laur.omega = omegaFor(P, heading(P, -90), LARAMIDE.speedCmYr);
            far.omega = omegaFor(P, heading(P, 90), LARAMIDE.speedCmYr);
        },
    },
    {
        id: 'mariana', label: 'An arc rifts off its ocean plate', maxMyr: 50, view: [15, 140],
        about: '“Philippina” is an ocean plate caught between two trenches. On its west it goes down under the continent “Asiana”, drifting west at 3 cm/yr; on its east it overrides “Pacifica”, very old ocean coming in at 8 cm/yr — and there it carries an island arc. It does not keep up with its own eastern trench, and the old, cold Pacifica slab sinks steeply and rolls back: Philippina is stretched behind its arc until the arc rifts away after the trench, and a back-arc sea opens behind it (the Mariana Trough, the Philippine Sea).',
        build(simMesh, seed) {
            const { world, canvas, noise } = begin(simMesh, seed);
            Object.assign(world.config, ROLLBACK_ONLY);
            const asia = world.addPlate('Asiana'), phil = world.addPlate('Philippina'), pac = world.addPlate('Pacifica');
            const land = addContinent(canvas, noise, { plate: asia, centre: [18, 100], radiusKm: 2200, cratonKm: 800 });
            addApronAndTrench(canvas, asia, land, [], world.config);
            const cp = latLonToXyz(15, 138), cq = latLonToXyz(15, 190), rp = Math.cos(1900 / 6371), rq = Math.cos(5000 / 6371);
            addOcean(canvas, phil, (x, y, z) => x * cp[0] + y * cp[1] + z * cp[2] >= rp, -10);     // young: under Asiana its slab does not roll back
            addOcean(canvas, pac, (x, y, z) => x * cq[0] + y * cq[1] + z * cq[2] >= rq, -150);
            fillBackground(canvas, world, world.config);
            armAgainst(simMesh, asia, phil, world.config);                            // Philippina goes down under Asiana…
            const trench = armAgainst(simMesh, phil, pac, world.config);              // …and Pacifica under Philippina
            arcBehind(simMesh, phil, trench, Math.max(1, Math.round(243 / simMesh.edgeKm)));                                        // Philippina's island arc, behind its trench
            return world;
        },
        drive(world) {
            const P = latLonToXyz(15, 150);
            setMotion(world, 'Philippina', P, -90, 3);
            setMotion(world, 'Pacifica', P, -90, 8);
        },
    },
    {
        id: 'japan', label: 'A strip of coast rifts off a continent', maxMyr: 60, view: [35, 135],
        about: '“Asiana” overrides very old ocean, “Pacifica”, coming in at 8 cm/yr along its eastern coast; Asiana itself creeps east at only 1 cm/yr. The cold slab sinks steeply and rolls back faster than the continent follows: Asiana’s eastern margin is stretched until a strip of the coast — hundreds of km wide, accreted crust, never a craton — rifts away after the trench as a chain of islands, and a sea opens behind it (Japan and the Sea of Japan).',
        build(simMesh, seed) {
            const { world, canvas, noise } = begin(simMesh, seed);
            Object.assign(world.config, ROLLBACK_ONLY);
            const asia = world.addPlate('Asiana'), pac = world.addPlate('Pacifica');
            const land = addContinent(canvas, noise, { plate: asia, centre: [35, 110], radiusKm: 2700, cratonKm: 800 });
            addApronAndTrench(canvas, asia, land, [], world.config);
            const cq = latLonToXyz(32, 185), rq = Math.cos(5000 / 6371);
            addOcean(canvas, pac, (x, y, z) => x * cq[0] + y * cq[1] + z * cq[2] >= rq, -150);
            fillBackground(canvas, world, world.config);
            armAgainst(simMesh, asia, pac, world.config);
            return world;
        },
        drive(world) {
            const P = latLonToXyz(35, 140);
            setMotion(world, 'Asiana', P, 90, 1);
            setMotion(world, 'Pacifica', P, -90, 8);
        },
    },
    {
        id: 'history', label: 'Margins and back-arcs through a whole history', maxMyr: 300, view: null,
        about: 'The generated supercontinent of Phase 3 with every rule on: every coast is classified as it goes (Margins layer), young slabs go in flat under plates driving at them, and old, rolling-back trenches peel arcs — now and then a strip of a continent — off their plates and open seas behind them.',
        build(simMesh, seed) { return buildStartWorld(simMesh, seed).world; },
        drive: updatePlateMotion,
    },
];

/** Set a named plate's motion so that the point P moves at speedCmYr toward a compass bearing. */
function setMotion(world, name, P, bearingDeg, speedCmYr) {
    const p = world.plates.find(q => q.name === name && q.alive);
    if (p) p.omega = omegaFor(P, heading(P, bearingDeg), speedCmYr);
}

function begin(simMesh, seed) {
    const world = new TectonicWorld(simMesh, seed);
    return { world, canvas: sceneCanvas(simMesh, world.config), noise: new SimplexNoise(seed) };
}

/** Arm a mature trench on every cell of P that touches Q (both still in the start frame). @returns those cells */
function armAgainst(mesh, P, Q, cfg) {
    const { numCells, adjOffset, adjList } = mesh, out = [];
    for (let c = 0; c < numCells; c++) {
        if (!P.crust.mask[c]) continue;
        for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) if (Q.crust.mask[adjList[k]]) { P.crust.armTrench(c, cfg.slabMatureKm); out.push(c); break; }
    }
    return out;
}

/** Arm a mature trench on the rim of P that faces within 50° of a compass bearing (seen from `centre`). */
function armFacing(mesh, P, centre, bearingDeg, cfg) {
    const { numCells, adjOffset, adjList, xyz } = mesh, dir = heading(centre, bearingDeg);
    for (let c = 0; c < numCells; c++) {
        if (!P.crust.mask[c]) continue;
        let nx = 0, ny = 0, nz = 0, rim = false;
        for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) {
            const nb = adjList[k];
            if (P.crust.mask[nb]) continue;
            rim = true; nx += xyz[3 * nb] - xyz[3 * c]; ny += xyz[3 * nb + 1] - xyz[3 * c + 1]; nz += xyz[3 * nb + 2] - xyz[3 * c + 2];
        }
        const l = Math.hypot(nx, ny, nz);
        if (rim && l > 0 && (nx * dir[0] + ny * dir[1] + nz * dir[2]) / l > Math.cos(50 * Math.PI / 180)) P.crust.armTrench(c, cfg.slabMatureKm);
    }
}

/** Island-arc crust `hops` cells behind a trench line on plate P (inland of it, on P's own ocean). */
function arcBehind(mesh, P, trench, hops) {
    const { adjOffset, adjList } = mesh, seen = new Set(trench);
    let ring = trench;
    for (let h = 0; h < hops; h++) {
        const next = [];
        for (const c of ring) for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) { const nb = adjList[k]; if (P.crust.mask[nb] && !seen.has(nb)) { seen.add(nb); next.push(nb); } }
        ring = next;
    }
    for (const c of ring) { P.crust.type[c] = CrustType.ARC; P.crust.terrane[c] = 900; }
    P.arcTerraneId = 900;
}
