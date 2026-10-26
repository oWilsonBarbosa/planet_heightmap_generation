// Oceans that break into plates (plans/V2_REALISM_PASS_PLAN.md, phase 3). The recordings (developer, 2026-10-18) found
// worlds of 5–7 plates, nearly all of them carrying land, and an ocean floor twice Earth's age: oceanic plates were only
// ever carved out of the pre-history ocean as trenches reached it, and the rest of it never moved — a pocket of it kept
// floor as old as the history. Two rules, on the slow clock:
//
//   the background retires  from backgroundEndMyr on, every region of the passive pre-history ocean big enough to be a
//                           plate becomes one: its old floor can then founder and go down like any other ocean's
//                           (scraps too small for a plate stay passive, to be subducted in time, as before)
//   big ocean plates split  a plate with more than oceanSplitAreaKm2 of ocean may break along a new ridge — a chance per
//                           Myr rising with its excess area, from a seeded stream of its own — on a great circle through
//                           its open ocean (the part over oceanSplitLandKm from its land), running along the coast it
//                           carries, so the far ocean parts from the near (as the Farallon plate broke from the Pacific's
//                           side), or across its motion if it carries no land; only where all its continent stays on one
//                           side and each half is a plate's worth. The halves are pushed apart as a rift's are (forces.js,
//                           the rift push), and the gap between them fills with new floor at a new ridge.
//   microplates captured    an ocean plate subducted down to less than oceanPlateCaptureKm2 (and carrying no land) is
//                           captured by the plate it shares the most boundary with — as the last of the Farallon plate's
//                           pieces were by the Pacific: no specks of plate left spinning (a tiny plate's rotation rate is
//                           unbounded, and the history's step shrinks to the fastest rotation's)

import { CrustType } from '../model/crust.js';
import { EventKind } from '../model/world.js';
import { transferCells } from '../ops/tidy-plates.js';
import { oceanPlateName } from '../ops/birth-ocean-plate.js';
import { hopDistance } from '../../core/mesh-bfs.js';
import { normalize } from '../../core/sphere-geom.js';

/** @returns {number} plates born from the pre-history ocean */
export function retireBackground(world) {
    const { config, time, plates, mesh } = world;
    if (!(time >= config.backgroundEndMyr)) return 0;
    const background = plates.find(p => p.isBackground);
    if (!background?.crust.count) return 0;
    const { numCells, adjOffset, adjList, cellAreaKm2 } = mesh, { mask } = background.crust, minCells = config.oceanPlateMinAreaKm2 / cellAreaKm2;
    const seen = new Uint8Array(numCells);
    let born = 0;
    for (let s = 0; s < numCells; s++) {
        if (!mask[s] || seen[s]) continue;
        const piece = [s];
        seen[s] = 1;
        for (let i = 0; i < piece.length; i++) for (let k = adjOffset[piece[i]]; k < adjOffset[piece[i] + 1]; k++) {
            const nb = adjList[k];
            if (mask[nb] && !seen[nb]) { seen[nb] = 1; piece.push(nb); }
        }
        if (piece.length < minCells) continue;
        const fresh = world.addPlate(oceanPlateName(world));
        fresh.setQuat(background.quat.slice());
        fresh.omega = [0, 0, 0];                                 // it starts where it stood; the torque balance takes it from there
        fresh.isOceanBorn = true;
        if (!transferCells(world, background, fresh, piece)) { fresh.alive = false; continue; }
        fresh.born = time;
        born++;
        world.log(EventKind.PLATE_BORN, `${fresh.name} is born: ${(piece.length * cellAreaKm2 / 1e6).toFixed(1)} Mkm² of the pre-history ocean, still passive ${time.toFixed(0)} Myr on, becomes a plate of its own`,
            { plate: fresh.id, areaMkm2: piece.length * cellAreaKm2 / 1e6 });
    }
    return born;
}

/** @returns {number} plates captured */
export function captureMicroplates(world) {
    const { config, plates, mesh, owner } = world;
    if (!(config.oceanPlateCaptureKm2 > 0)) return 0;
    const { numCells, adjOffset, adjList, cellAreaKm2 } = mesh, limit = config.oceanPlateCaptureKm2 / cellAreaKm2;
    let captured = 0;
    for (const P of plates) {
        if (!P.alive || P.isBackground || P.reshaped || P.crust.count === 0 || P.stats.continentalCells > 0 || P.crust.count >= limit) continue;
        // the neighbour along the most of its boundary (the world view: P is not reshaped this step)
        const contact = new Map();
        for (let w = 0; w < numCells; w++) {
            if (owner[w] !== P.id) continue;
            for (let k = adjOffset[w]; k < adjOffset[w + 1]; k++) { const o = owner[adjList[k]]; if (o >= 0 && o !== P.id && !plates[o].isBackground && plates[o].alive) contact.set(o, (contact.get(o) ?? 0) + 1); }
        }
        let host = -1, most = 0;
        for (const [o, c] of contact) if (c > most || (c === most && o < host)) { most = c; host = o; }
        if (host < 0) continue;
        const H = plates[host], cells = [];
        for (let c = 0; c < P.crust.mask.length; c++) if (P.crust.mask[c]) cells.push(c);
        transferCells(world, P, H, cells);
        P.alive = false; P.omega = [0, 0, 0]; P.dynamics = null;
        for (const p of plates) { if (p.riftPartner === P.id) p.riftPartner = -1; if (p.oceanSplitWith === P.id) p.oceanSplitWith = -1; }
        captured++;
        world.log(EventKind.MICROPLATE, `${P.name}, subducted down to ${(cells.length * cellAreaKm2 / 1e6).toFixed(2)} Mkm², is captured by ${H.name}`, { plate: P.id, host: H.id, areaMkm2: cells.length * cellAreaKm2 / 1e6 });
    }
    return captured;
}

/** @param {number} dt Myr since it last ran  @returns {number} plates split */
export function splitOceanPlates(world, dt) {
    const { config, time, plates, mesh } = world;
    if (!(config.oceanSplitRatePerMyr > 0)) return 0;
    const { numCells, xyz, adjOffset, adjList, cellAreaKm2, edgeKm } = mesh;
    const threshold = config.oceanSplitAreaKm2 / cellAreaKm2, minCells = config.oceanPlateMinAreaKm2 / cellAreaKm2;
    let split = 0;
    for (const P of [...plates]) {                                          // (a copy: plates are added as it goes)
        if (!P.alive || P.isBackground || time - Math.max(P.born, P.splitAt ?? -Infinity) < config.oceanSplitMinAgeMyr) continue;
        const ocean = P.stats.cells - P.stats.continentalCells;
        if (ocean < threshold) continue;
        const chance = config.oceanSplitRatePerMyr * dt * Math.min(config.oceanSplitAreaCap, ocean / threshold - 1);
        if (world.rngOceanSplit() >= chance) continue;
        const { mask, type } = P.crust;
        const land = c => mask[c] && (type[c] === CrustType.CONTINENT || type[c] === CrustType.CRATON);
        // its open ocean (over oceanSplitLandKm from its land, on its own raster), and the centres of that and of its land
        const fromLand = hopDistance(mesh, land, Math.ceil(config.oceanSplitLandKm / edgeKm), c => mask[c] === 1);
        const O = [0, 0, 0], L = [0, 0, 0];
        let open = 0, nLand = 0;
        for (let c = 0; c < numCells; c++) {
            if (!mask[c]) continue;
            if (land(c)) { nLand++; L[0] += xyz[3 * c]; L[1] += xyz[3 * c + 1]; L[2] += xyz[3 * c + 2]; }
            else if (type[c] === CrustType.OCEAN && fromLand[c] < 0) { open++; O[0] += xyz[3 * c]; O[1] += xyz[3 * c + 1]; O[2] += xyz[3 * c + 2]; }
        }
        if (open < minCells) continue;
        const c0 = normalize(O);
        // the line's normal, tangent at the open ocean's centre: toward the plate's land (the line then runs along its
        // coast), or along its motion there if it has none
        let dir;
        if (nLand) dir = normalize(L);
        else {
            const w = P.toWorld(c0[0], c0[1], c0[2], [0, 0, 0]), o = P.omega;
            const v = [o[1] * w[2] - o[2] * w[1], o[2] * w[0] - o[0] * w[2], o[0] * w[1] - o[1] * w[0]];
            dir = Math.hypot(...v) > 1e-9 ? P.toPlateFrame(v[0], v[1], v[2], [0, 0, 0]) : [world.rngOceanSplit() - 0.5, world.rngOceanSplit() - 0.5, world.rngOceanSplit() - 0.5];
            dir = [c0[0] + dir[0], c0[1] + dir[1], c0[2] + dir[2]];
        }
        const along = dir[0] * c0[0] + dir[1] * c0[1] + dir[2] * c0[2];
        const n = normalize([dir[0] - along * c0[0], dir[1] - along * c0[1], dir[2] - along * c0[2]]);
        // the far side: below the plane through the open ocean's centre — moved away from the land, if land reaches past it
        const side = c => xyz[3 * c] * n[0] + xyz[3 * c + 1] * n[1] + xyz[3 * c + 2] * n[2];
        let cut = 0;
        for (let c = 0; c < numCells; c++) if (land(c)) cut = Math.min(cut, side(c) - edgeKm / 6371);
        // the largest piece of the far side, joined through the plate's own cells there
        const far = new Uint8Array(numCells);
        for (let c = 0; c < numCells; c++) if (mask[c] && side(c) < cut) far[c] = 1;
        let best = [];
        const seen = new Uint8Array(numCells);
        for (let s = 0; s < numCells; s++) {
            if (!far[s] || seen[s]) continue;
            const piece = [s];
            seen[s] = 1;
            for (let i = 0; i < piece.length; i++) for (let k = adjOffset[piece[i]]; k < adjOffset[piece[i] + 1]; k++) { const nb = adjList[k]; if (far[nb] && !seen[nb]) { seen[nb] = 1; piece.push(nb); } }
            if (piece.length > best.length) best = piece;
        }
        if (best.length < minCells || ocean - best.length < minCells) continue;
        const fresh = world.addPlate(oceanPlateName(world));
        fresh.setQuat(P.quat.slice());
        fresh.omega = P.omega.slice();
        fresh.isOceanBorn = true;
        for (const [tip, d] of P.wings) if (seen[tip] && far[tip]) { fresh.wings.set(tip, d); P.wings.delete(tip); }     // (wing tips go with their half)
        if (!transferCells(world, P, fresh, best)) { fresh.alive = false; continue; }
        fresh.born = time;
        P.splitAt = time;
        // pushed apart as a rift's halves are, straight across the line, the old floor along it counting as a rifted margin
        P.riftPartner = fresh.id; fresh.riftPartner = P.id;
        P.oceanSplitWith = fresh.id; fresh.oceanSplitWith = P.id;
        P.riftPushDir = n.slice(); fresh.riftPushDir = n.map(x => -x);
        split++;
        world.log(EventKind.OCEAN_SPLIT, `a new ridge splits ${P.name}: ${(best.length * cellAreaKm2 / 1e6).toFixed(1)} Mkm² of its ocean breaks away as ${fresh.name}`,
            { plate: P.id, fresh: fresh.id, areaMkm2: best.length * cellAreaKm2 / 1e6 });
    }
    return split;
}
