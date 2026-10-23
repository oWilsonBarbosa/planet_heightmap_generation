// Rivers and lakes for Generate and Import: the Evolution's hydrology (v2/js/finish/finish-hydro.js; plans/V2_FINISH_PLAN.md,
// R1) on a V1 planet as it is, fed by the new climate's own twelve months (js/climate-new.js). DOM-free: Node or a worker.
// One call: the planet's mesh (positions and each region's neighbours), its elevations and the climate's full result in;
// out, per region:
//
//   ocean      1 on the sea: the open ocean, and the water behind a barrier lower and shorter than a strait the mesh
//              could show (the Evolution's strait rule: a lagoon's mouth, a narrow strait)
//   lake       the rest of the water (Water: 0 none, 1 fresh lake, 2 salt lake, 3 salt pan); lakeLevel its surface (km)
//   q          the year's mean discharge (m³/s): the runoff — rain less evaporation, Budyko's curve — of everything
//              upstream, less what a river loses along its bed in dry country; area: what drains there (km²)
//   recv       the region each land region drains into — a lake's water its outlet; −1 on the sea and where the water
//              goes no further (a salt lake): a tree, every region's water followed down it reaches the sea or a salt lake
//   heightKm   the height after the rivers (km): where a river leaves a hollow it cannot keep as a lake, or an inland sea
//              spills, it has cut its way out — the pages' heights everywhere else
//   rivers     every reach from F.riverMinM3s as a polyline (lat, lon, discharge, its wet months' share, the region of
//              each point) and its year: regime (steady, flood season, seasonal, dry most of the year), flood months,
//              fed from afar
//
// The water stays where the pages draw it. The planet's water below sea level that the sea does not reach — an inland
// sea — fills its basin and spills on toward the sea if its rivers bring more than it evaporates (a fresh lake, its
// outflow running on: every big river reaches the sea); else its rivers end in it (a salt lake). A hollow on land holds
// a lake by its water balance and size, as in the Evolution — or its river cuts through it.

import { FINISH } from '../v2/js/finish/finish-config.js';
import { hydrology, openStraits, Water } from '../v2/js/finish/finish-hydro.js';
import { oceanMask, runoffMonths, corners, bilinear } from '../v2/js/finish/finish.js';
import { KOPPEN_ID } from '../v2/js/climate/koppen.js';
import { CORE_DEFAULTS } from '../v2/js/climate/core.js';
import { elevToHeightKm } from './color-map.js';

export { Water };

/**
 * Rivers and lakes on a V1 planet.
 * @param {{r_xyz: Float32Array, r_elevation: Float32Array, adjOffset: Int32Array, adjList: Int32Array, climate: Object}} planet
 *        unit-sphere positions (any axes: the climate's lat / lon place the rivers), V1's elevation (≤ 0 water), each
 *        region's neighbours (SphereMesh), and planetClimate's result for this planet (grid, surface, months, cell)
 * @param {{F?: Object}} options  the hydrology's constants (finish-config.js FINISH)
 */
export function runNewWater({ r_xyz, r_elevation, adjOffset, adjList, climate: res }, { F = FINISH } = {}) {
    const t0 = performance.now();
    const n = r_elevation.length, G = res.grid.size, climGrid = { w: res.grid.w, h: res.grid.h };
    const mesh = { numCells: n, xyz: r_xyz, adjOffset, adjList };
    const z0 = new Float32Array(n);
    for (let r = 0; r < n; r++) z0[r] = elevToHeightKm(r_elevation[r]);
    // (an inland sea that spills stands at sea level, its outflow cut down to just above it: the pages' shores)
    const Fw = { ...F, seaCutFloorKm: SPILL_LEVEL_KM };

    // ── the water's year: the climate's per land region (copied — the climate stays as it was calculated), the grid's
    // year at sea level on the water; potential evaporation and runoff (Budyko); wet months; each month's share ──
    const { koppen, lat, lon } = res.cell, pAnn = Float32Array.from(res.cell.pAnnual), tAnn = Float32Array.from(res.cell.tAnnual);
    for (let c = 0; c < n; c++) if (pAnn[c] > F.rainMaxMm) pAnn[c] = F.rainMaxMm;     // (the climate's rare wet hotspots)
    const wetG = new Float32Array(G), wetMonths = new Float32Array(n);
    for (let g = 0; g < G; g++) {
        let k = 0;
        for (let m = 0; m < 12; m++) { const T = res.months.T[m * G + g], P = res.months.P[m * G + g], E = Math.max(5, (F.petBaseMm + F.petPerC * T) / 12); if (T < 0 || P > F.wetShare * E) k++; }
        wetG[g] = k;
    }
    for (let c = 0; c < n; c++) wetMonths[c] = bilinear(climGrid, wetG, lat[c], lon[c]);
    const gamma = CORE_DEFAULTS.lapseRateCPerKm, pG = new Float32Array(G), tG = new Float32Array(G);
    for (let g = 0; g < G; g++) {
        const href = res.surface.meanLandKm[g] === res.surface.meanLandKm[g] ? Math.max(0, res.surface.meanLandKm[g]) : 0;
        let p = 0, t = 0;
        for (let m = 0; m < 12; m++) { p += res.months.P[m * G + g]; t += res.months.T[m * G + g] / 12; }
        pG[g] = p; tG[g] = t + gamma * href;
    }
    for (let c = 0; c < n; c++) if (!(pAnn[c] === pAnn[c])) { pAnn[c] = bilinear(climGrid, pG, lat[c], lon[c]); tAnn[c] = bilinear(climGrid, tG, lat[c], lon[c]) - gamma * Math.max(0, z0[c]); }
    const runoff = new Float32Array(n), pet = new Float32Array(n);
    for (let c = 0; c < n; c++) {
        const P = Math.max(0, pAnn[c]), E0 = Math.max(F.petMinMm, F.petBaseMm + F.petPerC * tAnn[c]);
        pet[c] = E0;
        runoff[c] = P > 0 ? Math.max(0, P - P * (1 + E0 / P - (1 + (E0 / P) ** F.budykoW) ** (1 / F.budykoW))) : 0;
    }
    const monthly = runoffMonths(res.months, G, F);
    const bi = new Int32Array(4), bw = new Float64Array(4), at = (f) => f[bi[0]] * bw[0] + f[bi[1]] * bw[1] + f[bi[2]] * bw[2] + f[bi[3]] * bw[3];
    const months = { at: (c, m0, M, share, arid) => { corners(climGrid, lat[c], lon[c], bi, bw); for (let j = 0; j < M; j++) { share[j] = at(monthly.share[m0 + j]); arid[j] = at(monthly.arid[m0 + j]); } } };
    // (no rivers on the ice caps)
    const ice = new Uint8Array(n);
    for (let c = 0; c < n; c++) if (koppen[c] === KOPPEN_ID.EF) ice[c] = 1;

    // ── the sea, and the inland seas: each body of water, and whether the open ocean reaches it (through a strait the
    // mesh cannot show, too — found on a copy of the heights: the planet's own are not cut) ──
    const zs = z0.slice(), reach = oceanMask(mesh, zs);
    openStraits(mesh, zs, reach, F);
    const reached = oceanMask(mesh, zs), body = new Int32Array(n).fill(-1), bodySea = [];
    for (let s = 0; s < n; s++) {
        if (r_elevation[s] > 0 || body[s] >= 0) continue;
        const id = bodySea.length, cells = [s];
        body[s] = id;
        let sea = reached[s] === 1;
        for (let i = 0; i < cells.length; i++) for (let k = adjOffset[cells[i]]; k < adjOffset[cells[i] + 1]; k++) {
            const nb = adjList[k];
            if (r_elevation[nb] <= 0 && body[nb] < 0) { body[nb] = id; cells.push(nb); if (reached[nb]) sea = true; }
        }
        bodySea.push(sea);
    }
    const ocean = new Uint8Array(n), inland = new Uint8Array(n);
    for (let c = 0; c < n; c++) if (body[c] >= 0) { if (bodySea[body[c]]) ocean[c] = 1; else inland[c] = 1; }
    const water = (z, sink, seaBasin) => hydrology({ mesh, z, ocean: sink, runoff, pet, rain: pAnn, wetMonths, ice, glaciated: null, tectonic: null, seaBasin, fillHollows: true, lat, lon, months, network: true }, Fw);
    // (each inland sea a remnant of the sea in its basin, as the Evolution has them: full, it spills on, its outflow cut
    // down to the sea; short of full it would shrink — here it is where its rivers end instead, a salt lake as the pages
    // draw it, and the rivers run again: until every inland sea left spills — a few, at the divides with their
    // neighbours, tip once the next is a lake its rivers end in)
    const B = bodySea.length, sink = ocean.slice(), spilling = inland.slice(), full = new Uint8Array(B), closed = new Uint8Array(B);
    let Hy = null, z = null, rounds = 0, short = 0;
    for (;;) {
        z = z0.slice();
        Hy = water(z, sink, spilling);
        rounds++;
        full.fill(0);
        for (let c = 0; c < n; c++) if (spilling[c] && Hy.lake[c] === Water.FRESH) full[body[c]] = 1;
        short = 0;
        for (let i = 0; i < B; i++) if (!bodySea[i] && !closed[i] && !full[i]) short++;
        // (unsettled after MAX_ROUNDS: those left keep the Evolution's water — shrunk to their balance)
        if (!short || rounds === MAX_ROUNDS) break;
        for (let i = 0; i < B; i++) if (!bodySea[i] && !closed[i] && !full[i]) closed[i] = 1;
        for (let c = 0; c < n; c++) if (spilling[c] && closed[body[c]]) { spilling[c] = 0; sink[c] = 1; }
    }
    const lake = Hy.lake, lakeLevel = Hy.lakeLevel;
    for (let c = 0; c < n; c++) if (sink[c] && !ocean[c]) { lake[c] = Water.SALT; lakeLevel[c] = 0; }
    let salt = 0, spilled = 0;
    for (let i = 0; i < B; i++) if (!bodySea[i]) { if (closed[i]) salt++; else if (full[i]) spilled++; }
    return {
        heightKm: z, ocean, lake, lakeLevel, q: Hy.q, area: Hy.area, recv: Hy.recv, rivers: Hy.rivers,
        stats: { ...Hy.stats, inlandSeas: { spilling: spilled, salt, rounds, unsettled: short } }, timing: { total: performance.now() - t0 },
    };
}

/** At most this many runs of the rivers to settle which inland seas spill (two or three, as a rule). */
const MAX_ROUNDS = 8;

/** The level (km) an inland sea that spills stands at — sea level, as the pages draw it: a hair above it (2⁻¹⁰⁰, exact in
 *  a Float32Array), so the gorge its outflow cuts stays land and no land is drowned — V1's coastal plains lie within
 *  millimetres of the sea (a fifth of the land below 3 m: the Evolution's seaCutFloorKm would flood them). */
const SPILL_LEVEL_KM = 2 ** -100;
