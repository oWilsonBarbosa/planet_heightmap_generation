// Coarse occupancy: which plates have crust roughly WHERE. The growth step (step/resolve.js) asks, for
// each candidate cell, which other plates have crust within a few cells of it; a plate's bounding cap
// says nothing once plates span the globe, so instead the sphere is cut into latitude–longitude bins
// and every plate marks the bins its crust falls in during the gather (which visits every crust cell
// anyway). A plate with nothing in the bins around a point is skipped without a search. A bin's
// neighbourhood is every bin any part of which may lie within REACH_KM of any part of it, so this
// never changes an answer, only skips work.

import { PLANET_RADIUS_KM } from '../../core/sim-mesh.js';

const BIN_DEG = 6;                 // bins are 6° × 6° (≈ 670 km at the equator)
const REACH_KM = 700;              // beyond the growth step's furthest look (candidate ≤ 2 rings from a gap, crust ≤ 3 rings from it ≈ 5–6 cells ≈ 650 km at 40K cells)
const REACH_CELLS = 6.5;           // …the same look in cells, for coarser meshes, whose cells are wider

/** The bin index of a mesh (built once per mesh): `binOf[worldCell]`, `neighbours[bin]` = bins within reach, `at(x, y, z)`. */
export function binIndex(mesh) {
    if (mesh._bins) return mesh._bins;
    const { xyz, numCells } = mesh, rows = 180 / BIN_DEG, cols = 360 / BIN_DEG, rad = Math.PI / 180;
    const at = (x, y, z) => {
        const row = Math.min(rows - 1, Math.floor((Math.asin(Math.max(-1, Math.min(1, z))) / Math.PI + 0.5) * rows));
        const col = Math.min(cols - 1, Math.floor((Math.atan2(y, x) / (2 * Math.PI) + 0.5) * cols));
        return row * cols + col;
    };
    const binOf = new Uint16Array(numCells);
    for (let w = 0; w < numCells; w++) binOf[w] = at(xyz[3 * w], xyz[3 * w + 1], xyz[3 * w + 2]);
    // each bin: its centre and the angular radius of a circle round that centre containing the whole bin
    const centre = [], radius = [];
    for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
        const lat = (-90 + (row + 0.5) * BIN_DEG) * rad, lon = (-180 + (col + 0.5) * BIN_DEG) * rad;
        centre.push([Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)]);
        let r = 0;                                          // the corners are the farthest points
        for (const dLat of [-0.5, 0.5]) for (const dLon of [-0.5, 0.5]) {
            const a = lat + dLat * BIN_DEG * rad, b = lon + dLon * BIN_DEG * rad;
            const d = Math.acos(Math.max(-1, Math.min(1, centre.at(-1)[0] * Math.cos(a) * Math.cos(b) + centre.at(-1)[1] * Math.cos(a) * Math.sin(b) + centre.at(-1)[2] * Math.sin(a))));
            r = Math.max(r, d);
        }
        radius.push(r);
    }
    const reach = Math.max(REACH_KM, REACH_CELLS * mesh.edgeKm) / PLANET_RADIUS_KM, neighbours = [];
    for (let i = 0; i < centre.length; i++) {
        const list = [];
        for (let j = 0; j < centre.length; j++) {
            const d = Math.acos(Math.max(-1, Math.min(1, centre[i][0] * centre[j][0] + centre[i][1] * centre[j][1] + centre[i][2] * centre[j][2])));
            if (d <= radius[i] + radius[j] + reach) list.push(j);
        }
        neighbours.push(Int32Array.from(list));
    }
    return (mesh._bins = { binOf, neighbours, count: rows * cols, at });
}

/** Mark that `plate` has crust in `bin` for the pass numbered `stamp`. */
export function markBin(plate, bin, stamp, count) {
    if (!plate.bins || plate.bins.length !== count) plate.bins = new Uint32Array(count);
    plate.bins[bin] = stamp;
}

/** Might `plate` have crust within REACH_KM of a point in `bin`? (False = certainly not.) */
export function mayHaveCrustNear(plate, bin, stamp, bins) {
    const marks = plate.bins;
    if (!marks) return false;
    const near = bins.neighbours[bin];
    for (let i = 0; i < near.length; i++) if (marks[near[i]] === stamp) return true;
    return false;
}
