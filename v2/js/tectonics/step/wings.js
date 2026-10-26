// Plates are larger than their land (WBP): a subduction zone does not stop where the continent stops. Two rules,
// both on the overriding plate:
//
//   trench wings   each end of a trench line THAT STARTS AT A CONTINENTAL MARGIN propagates out to sea along a
//                  straight line fixed when the wing starts: across the plate's motion at that moment, away from the
//                  plate's body (re-aiming a wing as the plate's motion drifts would curl it and turn the plate). It
//                  captures old ocean from the passive background, together with the ocean behind it toward the
//                  plate's body — the fore-arc, part of the overriding plate. The captured ocean rides with the plate
//                  and overrides the old ocean ahead of it: ocean-under-ocean subduction along the wing, which the
//                  polarity rule (trench flag wins) resolves. A wing grows wingGrowthCmYr.
//   island arcs    where a wing has swallowed enough slab and is overriding right now, arc crust — buoyant, counts
//                  as land — forms behind the trench, and keeps forming along it so the arc is a chain, not a dot; it
//                  widens by arcRowWidthKm with every arcWidenSlabKm more slab — up to a width set by how far it is from
//                  any continent: out in the open ocean a chain of islands (a Mariana), near a continent up to a Japan
//                  or a Philippines (developer: far-ocean arcs grew huge). Only over ocean: a trench with
//                  CONTINENTAL crust close behind it is a continental margin, whose volcanism is the Andean belt
//                  (step/boundaries.js). Slab maturity is judged over a cell and its trench neighbours, because the
//                  jitter of a rotated raster's edge spreads one trench's consumption over 2–3 cells.
// Neither rule lets a plate grow FORWARD: a wing runs across the motion (never forward of the leading edge), and
// the fore-arc it captures lies beside the continent. Arc crust belongs to the plate that carries the trench.

import { CrustType, CrustFlag, OrogenyType } from '../model/crust.js';
import { BoundaryKind } from '../model/world.js';
import { PLANET_RADIUS_KM } from '../../core/sim-mesh.js';
import { normalize, tangentToward } from '../../core/sphere-geom.js';
import { reachesWithin, hopDistance } from '../../core/mesh-bfs.js';
import { isContinental } from './hotspots.js';


/** Extend every trench's ends along strike by the wing growth rate. @returns cells captured or flagged */
export function growWings(world, dt) {
    const { mesh, plates, config, owner, ownerCell, claimCount } = world;
    const { xyz, index, adjOffset, adjList, edgeKm, edgeRad } = mesh;
    const background = plates.find(p => p.isBackground);
    let grown = 0;
    const rimSteps = Math.max(1, Math.round(config.wingRimCrossKm / edgeKm));
    for (const plate of plates) {
        if (!plate.alive || plate.isBackground || plate.crust.count === 0) continue;
        // a wing grows wingGrowthCmYr: a cell for every edgeKm of it, as many cells a step as that pays for (on a fine
        // mesh, several). The budget never banks more than a longest step's growth, or a run of long steps would be
        // paid out later far faster than wingGrowthCmYr.
        const perStepKm = config.wingGrowthCmYr * 10;                                                    // cm/yr × 10 = km/Myr
        plate.wingBudgetKm = Math.min(perStepKm * config.maxStepMyr + edgeKm, plate.wingBudgetKm + perStepKm * dt);
        while (plate.alive && plate.wingBudgetKm >= edgeKm) {
            plate.wingBudgetKm -= edgeKm;
            grown += growWingsOnce(world, plate, background, rimSteps);
        }
    }
    return grown;
}

/** One cell of growth at every wing end of `plate`. @returns cells captured or flagged */
function growWingsOnce(world, plate, background, rimSteps) {
    const { mesh, config, owner, ownerCell, claimCount } = world;
    const { xyz, index, adjOffset, adjList, edgeKm, edgeRad } = mesh;
    let grown = 0;
    {
        const { mask, type, flags, slabKm, wingKm } = plate.crust;
        const P = [0, 0, 0], F = [0, 0, 0], centre = plate.toWorld(plate.capCenter[0], plate.capCenter[1], plate.capCenter[2], [0, 0, 0]);
        // the ends of the trench lines, found before anything grows (a cell captured this tick must not grow again this tick).
        // Only a line anchored at continental land grows wings — an end is either already on a wing, or within an apron's
        // reach of continental crust. Trench that appears out at sea (a consuming edge of captured ocean) does not sprout
        // wings of its own, or the plate would eat the ocean in a chain reaction.
        const anchorHops = Math.ceil((config.apronKm + 2 * edgeKm) / edgeKm), ends = [];
        for (let c = 0; c < mask.length; c++) {
            if (!mask[c] || type[c] !== CrustType.OCEAN || !(flags[c] & CrustFlag.TRENCH) || wingKm[c] >= config.wingMaxKm) continue;
            if (wingKm[c] === 0 && !continentWithin(plate, mesh, c, anchorHops)) continue;
            let from = -1, trenchNeighbours = 0, atEdge = false;              // an end: exactly one trench neighbour on this plate
            for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) {
                const nb = adjList[k];
                if (!mask[nb]) { atEdge = true; continue; }
                if (flags[nb] & CrustFlag.TRENCH) { trenchNeighbours++; from = nb; }
            }
            if (trenchNeighbours === 1 && atEdge) ends.push([c, from]);
        }
        for (const [c, from] of ends) {
            plate.toWorld(xyz[3 * c], xyz[3 * c + 1], xyz[3 * c + 2], P);
            plate.toWorld(xyz[3 * from], xyz[3 * from + 1], xyz[3 * from + 2], F);
            const o = plate.omega, v = [o[1] * P[2] - o[2] * P[1], o[2] * P[0] - o[0] * P[2], o[0] * P[1] - o[1] * P[0]], speed = Math.hypot(...v);
            let dir;
            if (plate.wings.has(c)) {                                             // an existing wing: keep its line
                const d = plate.wings.get(c), dw = plate.toWorld(d[0], d[1], d[2], [0, 0, 0]);
                dir = tangentToward(P, P, [P[0] + dw[0], P[1] + dw[1], P[2] + dw[2]]);
            } else {                                                              // a new wing: across the motion, away from the body — fixed from now on
                if (speed < 1e-12) continue;
                const outward = tangentToward(P, centre, P), along = tangentToward(P, F, P);
                const across = normalize([v[1] * P[2] - v[2] * P[1], v[2] * P[0] - v[0] * P[2], v[0] * P[1] - v[1] * P[0]]);
                const sign = across[0] * outward[0] + across[1] * outward[1] + across[2] * outward[2] < 0 ? -1 : 1;
                dir = normalize([0, 1, 2].map(i => (1 - config.wingBendToMotion) * along[i] + config.wingBendToMotion * sign * across[i]));
                if (dir[0] * outward[0] + dir[1] * outward[1] + dir[2] * outward[2] < 0) continue;
                const vh = v.map(x => x / speed), fwd = dir[0] * vh[0] + dir[1] * vh[1] + dir[2] * vh[2];
                if (fwd > 0) dir = normalize([0, 1, 2].map(i => dir[i] - fwd * vh[i]));    // never forward of the leading edge
            }
            // step along that line until off the plate (a wing leaves the apron rim tangentially rather than running
            // round it); the plate's own ocean cells stepped over on the way carry the trench line across
            let T = null, q = -1, w = -1;
            const crossed = [];
            for (let s = 1; s <= rimSteps && !T; s++) {
                const t = normalize([P[0] + dir[0] * edgeRad * s, P[1] + dir[1] * edgeRad * s, P[2] + dir[2] * edgeRad * s]);
                const cell = plate.cellAt(index, t[0], t[1], t[2]);
                if (cell === c || cell === from) continue;
                if (mask[cell]) { if (type[cell] !== CrustType.OCEAN || (flags[cell] & CrustFlag.TRENCH)) break; crossed.push(cell); continue; }
                T = t; q = cell; w = index.nearest(t[0], t[1], t[2]);
            }
            if (!T || !background || owner[w] !== background.id || claimCount[w] !== 1) continue;      // old ocean of the passive background: capture it
            for (const cell of crossed) { plate.crust.armTrench(cell, slabKm[c]); wingKm[cell] = wingKm[c] + edgeKm; }
            plate.wings.delete(c);
            plate.wings.set(q, plate.toPlateFrame(dir[0], dir[1], dir[2], [0, 0, 0]));   // the tip moves on, the line stays
            const bgCell = ownerCell[w];
            plate.crust.create(q, CrustType.OCEAN, background.crust.formedAt[bgCell]);
            plate.crust.flags[q] = CrustFlag.TRENCH | CrustFlag.APRON;
            plate.crust.slabKm[q] = slabKm[c];
            wingKm[q] = wingKm[c] + edgeKm;
            background.crust.remove(bgCell);
            background.markReshaped();
            plate.markReshaped();
            grown += 1 + captureBehind(world, plate, background, w, T, v);
        }
    }
    return grown;
}

/** Build arc crust behind mature ocean–ocean trenches. @returns cells turned into arc */
export function buildArcs(world) {
    const { mesh, plates, config, time, boundaryKind } = world, { xyz, adjOffset, adjList, edgeKm, index } = mesh;
    const P = [0, 0, 0];
    const noLandHops = Math.ceil(config.arcNoLandWithinKm / edgeKm);
    // how far every world cell is from continental crust (any plate's), out to arcFarKm: how wide an arc there may grow
    const farHops = Math.ceil(config.arcFarKm / edgeKm), landHops = hopDistance(mesh, w => isContinental(world, w), farHops);
    const widthCapKm = c => {
        plate.toWorld(xyz[3 * c], xyz[3 * c + 1], xyz[3 * c + 2], P);
        const hops = landHops[index.nearest(P[0], P[1], P[2])], km = hops < 0 ? Infinity : hops * edgeKm;
        const t = Math.min(1, Math.max(0, (config.arcFarKm - km) / (config.arcFarKm - config.arcNoLandWithinKm)));
        return config.arcFarMaxKm + (config.arcNearMaxKm - config.arcFarMaxKm) * t * t * (3 - 2 * t);      // (smoothstep)
    };
    let built = 0, plate = null;
    for (plate of plates) {
        if (!plate.alive || plate.isBackground || plate.crust.count === 0) continue;
        const { mask, type, flags, slabKm } = plate.crust;
        const born = [];
        for (let c = 0; c < mask.length; c++) {
            if (!mask[c] || type[c] !== CrustType.OCEAN || !(flags[c] & CrustFlag.TRENCH)) continue;
            let slab = slabKm[c];
            for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) { const nb = adjList[k]; if (mask[nb] && (flags[nb] & CrustFlag.TRENCH) && slabKm[nb] > slab) slab = slabKm[nb]; }
            if (slab < config.arcMatureConsumedKm) continue;
            // outward normal: toward the cells this plate does not have
            let nx = 0, ny = 0, nz = 0, edge = false;
            for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) {
                const nb = adjList[k];
                if (mask[nb]) continue;
                edge = true; nx += xyz[3 * nb] - xyz[3 * c]; ny += xyz[3 * nb + 1] - xyz[3 * c + 1]; nz += xyz[3 * nb + 2] - xyz[3 * c + 2];
            }
            if (!edge || continentWithin(plate, mesh, c, noLandHops)) continue;
            if (arcBeside(plate, mesh, c)) { const w = widenArc(plate, mesh, c, slab, nx, ny, nz, config, widthCapKm(c)); if (w >= 0) born.push(w); continue; }   // an arc already: widen it with age
            plate.toWorld(xyz[3 * c], xyz[3 * c + 1], xyz[3 * c + 2], P);
            if (boundaryKind[index.nearest(P[0], P[1], P[2])] !== BoundaryKind.OVERRIDING) continue;      // an active trench, not a dormant flag
            // the arc cell: the ocean neighbour most directly behind the trench
            let best = -1, bestDot = 0.2;
            for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) {
                const nb = adjList[k];
                if (!mask[nb] || type[nb] !== CrustType.OCEAN || (flags[nb] & CrustFlag.TRENCH)) continue;
                const d = -((xyz[3 * nb] - xyz[3 * c]) * nx + (xyz[3 * nb + 1] - xyz[3 * c + 1]) * ny + (xyz[3 * nb + 2] - xyz[3 * c + 2]) * nz) / (Math.hypot(nx, ny, nz) * edgeKm / PLANET_RADIUS_KM);
                if (d > bestDot) { bestDot = d; best = nb; }
            }
            if (best >= 0) born.push(best);
        }
        if (!born.length) continue;
        plate.arcTerraneId ??= world.nextTerraneId();
        for (const c of born) {
            if (type[c] !== CrustType.OCEAN) continue;
            const { formedAt } = plate.crust;
            type[c] = CrustType.ARC; formedAt[c] = time; plate.crust.terrane[c] = plate.arcTerraneId;
            flags[c] &= ~CrustFlag.APRON;
            plate.crust.recordOrogeny(c, OrogenyType.ARC, 0, time, config.orogenyQuietMyr);
            built++;
        }
        plate.dirty = true;
    }
    return built;
}

/**
 * Capture the background ocean behind a new wing cell (world cell `w` at position `T`): a wedge, within
 * wingFillKm of it and within 60° of the direction OPPOSITE the plate's motion there — directly behind the
 * wing, so the fore-arc joins the plate but nothing in front of any coast, and nothing beyond the wing's
 * tip. @returns cells captured
 */
function captureBehind(world, plate, background, w, T, velocity) {
    const { mesh, owner, ownerCell, claimCount, config } = world, { xyz, index, adjOffset, adjList, edgeKm } = mesh;
    const speed = Math.hypot(...velocity), vh = velocity.map(x => x / (speed || 1));
    if (speed < 1e-12) return 0;
    const inboard = vh.map(x => -x);                                                        // behind the wing = against the motion
    const maxHops = Math.ceil(config.wingFillKm / edgeKm), seen = new Set([w]);
    let ring = [w], captured = 0;
    for (let hop = 0; hop < maxHops; hop++) {
        const next = [];
        for (const a of ring) for (let k = adjOffset[a]; k < adjOffset[a + 1]; k++) {
            const b = adjList[k];
            if (seen.has(b)) continue;
            seen.add(b);
            if (owner[b] !== background.id || claimCount[b] !== 1) continue;
            const dx = xyz[3 * b] - T[0], dy = xyz[3 * b + 1] - T[1], dz = xyz[3 * b + 2] - T[2], len = Math.hypot(dx, dy, dz) || 1;
            if ((dx * inboard[0] + dy * inboard[1] + dz * inboard[2]) / len < 0.5) continue;     // not behind the wing: stays background
            const q = plate.cellAt(index, xyz[3 * b], xyz[3 * b + 1], xyz[3 * b + 2]);
            if (!plate.crust.mask[q]) {
                plate.crust.create(q, CrustType.OCEAN, background.crust.formedAt[ownerCell[b]]);
                plate.crust.flags[q] = CrustFlag.APRON;
                captured++;
            }
            background.crust.remove(ownerCell[b]);
            owner[b] = plate.id; ownerCell[b] = q;                     // keep the world view consistent within this pass
            next.push(b);
        }
        ring = next;
    }
    if (captured) { plate.markReshaped(); background.markReshaped(); }
    return captured;
}

/**
 * Behind trench cell `t` (outward normal n) an arc already stands. With every further arcWidenSlabKm of slab it
 * may be one row deeper: returns the ocean cell to turn into arc next, or −1 if the arc is as wide as its slab allows.
 */
function widenArc(plate, mesh, t, slab, nx, ny, nz, config, capKm) {
    const { xyz, adjOffset, adjList } = mesh, { mask, type, flags } = plate.crust;
    // the arc may be arcRowWidthKm wider for every further arcWidenSlabKm of slab, up to capKm — counted in this mesh's cells
    const allowedKm = Math.min(capKm, config.arcRowWidthKm * (1 + Math.floor((slab - config.arcMatureConsumedKm) / config.arcWidenSlabKm)));
    const allowedRows = Math.max(1, Math.round(allowedKm / mesh.edgeKm));
    // walk inboard from the trench, row by row, along −n
    let cur = t, rows = 0;
    for (let step = 0; step < allowedRows + 1; step++) {
        let best = -1, bestDot = 0.2;
        for (let k = adjOffset[cur]; k < adjOffset[cur + 1]; k++) {
            const nb = adjList[k];
            if (!mask[nb] || (flags[nb] & CrustFlag.TRENCH)) continue;
            const d = -((xyz[3 * nb] - xyz[3 * cur]) * nx + (xyz[3 * nb + 1] - xyz[3 * cur + 1]) * ny + (xyz[3 * nb + 2] - xyz[3 * cur + 2]) * nz) / (Math.hypot(nx, ny, nz) * mesh.edgeKm / PLANET_RADIUS_KM);
            if (d > bestDot) { bestDot = d; best = nb; }
        }
        if (best < 0) return -1;
        if (type[best] === CrustType.ARC) { rows++; cur = best; continue; }
        return type[best] === CrustType.OCEAN && rows < allowedRows ? best : -1;
    }
    return -1;
}

function arcBeside(plate, mesh, cell) {
    const { adjOffset, adjList } = mesh, { mask, type } = plate.crust;
    for (let k = adjOffset[cell]; k < adjOffset[cell + 1]; k++) { const nb = adjList[k]; if (mask[nb] && type[nb] === CrustType.ARC) return true; }
    return false;
}

/** Continental crust (not arc: an arc is not a continental margin) within `hops` of `cell`, through this plate's crust. */
function continentWithin(plate, mesh, cell, hops) {
    const { mask, type } = plate.crust;
    return reachesWithin(mesh, cell, hops, c => mask[c] === 1, c => type[c] === CrustType.CONTINENT || type[c] === CrustType.CRATON);
}
