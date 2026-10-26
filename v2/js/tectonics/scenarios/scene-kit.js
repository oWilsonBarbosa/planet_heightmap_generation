// Building blocks for hand-made test scenes: drop a noise-shaped continent onto a plate, give it
// an ocean apron with a trench on chosen stretches of its rim, attach a patch of ocean to a
// plate, and fill everything left over with the passive pre-history ocean.
// Azimuths are degrees about the continent's centre: 0° = east, 90° = north, 180° = west.

import { PLANET_RADIUS_KM } from '../../core/sim-mesh.js';
import { polarFrame, tangentBasis } from '../../core/sphere-geom.js';
import { touches } from '../../core/mesh-bfs.js';
import { CrustType, CrustFlag } from '../model/crust.js';
import { latLonToXyz } from '../step/kinematics.js';
import { plateOutlineWithApron } from '../init/rim-trench.js';

/** Tracks which sim cells a scene has already given to some plate. */
export function sceneCanvas(simMesh, cfg) { return { mesh: simMesh, taken: new Uint8Array(simMesh.numCells), landAgeMyr: cfg.initialLandAgeMyr, lastTerrane: 0 }; }

/** A terrane id no other piece of this scene uses (terrane ids are unique across a world: see TectonicWorld.nextTerraneId). */
export function sceneTerrane(canvas) { return ++canvas.lastTerrane; }

/**
 * @param {{plate, centre:[number,number], radiusKm:number, cratonKm?:number, wobble?:number}} o
 * @returns {{centre:number[], isLand:Uint8Array}}
 */
export function addContinent(canvas, noise, { plate, centre, radiusKm, cratonKm = radiusKm * 0.4, wobble = 0.22 }) {
    const { mesh, taken } = canvas, { xyz, numCells } = mesh;
    const c = latLonToXyz(centre[0], centre[1]), isLand = new Uint8Array(numCells);
    const k = (centre[0] * 0.37 + centre[1] * 0.11) % 17;          // de-correlate the outlines of different continents
    const terrane = sceneTerrane(canvas);
    for (let i = 0; i < numCells; i++) {
        if (taken[i]) continue;
        const x = xyz[3 * i], y = xyz[3 * i + 1], z = xyz[3 * i + 2];
        const d = Math.acos(Math.max(-1, Math.min(1, x * c[0] + y * c[1] + z * c[2]))) * PLANET_RADIUS_KM;
        const shaped = d * (1 + wobble * noise.fbm(x * 2.3 + k, y * 2.3 + k, z * 2.3 + k, 5));
        if (shaped > radiusKm) continue;
        plate.crust.create(i, shaped < cratonKm ? CrustType.CRATON : CrustType.CONTINENT, -canvas.landAgeMyr, terrane);
        isLand[i] = 1; taken[i] = 1;
    }
    return { centre: c, isLand };
}

/**
 * Give a continent's plate an apron of old ocean and flag its rim as trench inside the given
 * azimuth sectors ('all', or a list of [fromDeg, toDeg]; empty list = passive all round).
 */
export function addApronAndTrench(canvas, plate, continent, sectors, cfg) {
    const { mesh, taken } = canvas, { xyz, numCells } = mesh;
    const { inPlate, rim } = plateOutlineWithApron(mesh, continent.isLand, cfg);
    for (let i = 0; i < numCells; i++) {
        if (!inPlate[i] || taken[i]) continue;
        plate.crust.create(i, CrustType.OCEAN, -cfg.initialOceanAgeMyr);
        plate.crust.flags[i] |= CrustFlag.APRON;
        taken[i] = 1;
    }
    const toPolar = polarFrame(continent.centre, tangentBasis(continent.centre)[0]);
    for (const i of rim) if (plate.crust.mask[i] && inSectors(toPolar(xyz[3 * i], xyz[3 * i + 1], xyz[3 * i + 2]).azimuth, sectors)) plate.crust.armTrench(i, cfg.slabMatureKm);
}

/** Arm the coast cells of a land-only plate (no apron) as a mature trench inside the given sectors. */
export function flagCoastTrench(mesh, plate, centreXyz, sectors, cfg) {
    const { xyz, numCells } = mesh, crust = plate.crust;
    const toPolar = polarFrame(centreXyz, tangentBasis(centreXyz)[0]);
    for (let i = 0; i < numCells; i++) {
        if (!crust.mask[i] || !touches(mesh, i, nb => !crust.mask[nb])) continue;
        if (inSectors(toPolar(xyz[3 * i], xyz[3 * i + 1], xyz[3 * i + 2]).azimuth, sectors)) crust.armTrench(i, cfg.slabMatureKm);
    }
}

/** Attach free ocean cells chosen by `wanted(x, y, z)` to a plate (ordinary ocean floor, not apron). */
export function addOcean(canvas, plate, wanted, formedAt) {
    const { mesh, taken } = canvas, { xyz, numCells } = mesh;
    for (let i = 0; i < numCells; i++) {
        if (taken[i] || !wanted(xyz[3 * i], xyz[3 * i + 1], xyz[3 * i + 2])) continue;
        plate.crust.create(i, CrustType.OCEAN, formedAt);
        taken[i] = 1;
    }
}

/** Everything not yet claimed becomes the passive pre-history ocean. */
export function fillBackground(canvas, world, cfg) {
    const ocean = world.addPlate('Pre-history ocean');
    ocean.isBackground = true;
    for (let i = 0; i < canvas.mesh.numCells; i++) if (!canvas.taken[i]) ocean.crust.create(i, CrustType.OCEAN, -cfg.initialOceanAgeMyr);
    for (const p of world.plates) p.refreshExtent(canvas.mesh.xyz);
    return ocean;
}

function inSectors(azimuth, sectors) {
    if (sectors === 'all') return true;          // (a [0, 360] pair would wrap to a single point — say 'all' instead)
    return sectors.some(([from, to]) => (((azimuth - from) % 360) + 360) % 360 <= (((to - from) % 360) + 360) % 360);
}
