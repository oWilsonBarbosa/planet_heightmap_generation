// Rivers and lakes for Generate and Import: the Evolution's hydrology (v2/js/finish/finish-hydro.js; plans/V2_FINISH_PLAN.md,
// R1) on a V1 planet as it is, fed by the new climate's own twelve months (js/climate-new.js). DOM-free: Node or a worker.
// One call: the planet's mesh (positions and each region's neighbours), its elevations and the climate's full result in;
// out, per region:
//
//   ocean      1 on the sea: the open ocean, and the water behind a barrier lower and shorter than a strait the mesh
//              could show (the Evolution's strait rule: a lagoon's mouth, a narrow strait)
//   lake       the rest of the water (Water: 0 none, 1 fresh lake, 2 salt lake, 3 salt pan, 4 brackish lake); lakeLevel
//              its surface (km); lakeOutlet the region its outflow leaves by (its discharge there: q), −1 if it has none
//   q          the year's mean discharge (m³/s): the runoff — rain less evaporation (potential evaporation month by
//              month), Budyko's curve — of everything upstream, less what a river loses along its bed in dry country;
//              area: what drains there (km²)
//   recv       the region each land region drains into — a lake's water its outlet; −1 on the sea and where the water
//              goes no further (a closed lake): a tree, every region's water followed down it reaches the sea or a closed
//              lake
//   heightKm   the height after the rivers (km): where a river leaves a hollow it cannot keep as a lake, or an inland sea
//              spills, it has cut its way out; a lake's bed filled with sediment toward at most about a kilometre below
//              its surface — the pages' heights everywhere else (with the ice age: its troughs, hollows and moraines too)
//   glaciated  with the ice age (options.iceAge): 1 where its ice lay at its greatest extent, else null
//   rivers     every reach from F.riverMinM3s as a polyline (lat, lon, discharge, its wet months' share, the region of
//              each point) and its year: regime (steady, flood season, seasonal, dry most of the year), flood months,
//              fed from afar
//
// The water stays where the pages draw it. The planet's water below sea level that the sea does not reach — an inland
// sea — fills its basin and spills on toward the sea if its rivers bring more than it evaporates (a fresh lake, its
// outflow running on: every big river reaches the sea); else its rivers end in it (a salt lake, or brackish where its
// climate is humid). A hollow on land holds a lake by its water balance and size, as in the Evolution — or its river
// cuts through it. V1's erosion drains almost every hollow on land; with options.iceAge the Evolution's last ice age
// shapes the land first, and the hollows it scoured are lake districts, as on Earth's shields.

import { FINISH } from '../v2/js/finish/finish-config.js';
import { hydrology, openStraits, Water as HydroWater } from '../v2/js/finish/finish-hydro.js';
import { lastIceAge } from '../v2/js/finish/finish-ice.js';
import { LatLonGrid } from '../v2/js/finish/finish-grid.js';
import { oceanMask, runoffMonths, corners, bilinear } from '../v2/js/finish/finish.js';
import { KOPPEN_ID } from '../v2/js/climate/koppen.js';
import { CORE_DEFAULTS } from '../v2/js/climate/core.js';
import { elevToHeightKm } from './color-map.js';

/** The water of a lake region: the Evolution's kinds (finish-hydro.js), and brackish — a closed lake in a humid climate. */
export const Water = Object.freeze({ ...HydroWater, BRACKISH: 4 });

/**
 * The hydrology's constants for Generate: the Evolution's (finish-config.js FINISH), with the rivers' year checked
 * against measured flows (tuning/water/earth-rivers.mjs: real Earth's rivers against 130 of Dai & Trenberth's gauges,
 * with the observed climate, at 2.56M):
 *   - a basin its river cuts through (no water kept) does not even out the river's months — the Evolution's own do,
 *     as lakes: at 2.56M that flattened the Tocantins', the Mackenzie's and the Brahmaputra's years to within ±15 % of
 *     their mean, the more the finer the mesh (the range ×0.86 of the measured at 640K, ×0.64 at 2.56M);
 *   - more of the water through the ground, drained back more slowly (baseflowShare 0.5 → 0.7, baseflowMonths 2.5 → 3):
 *     the months' correlation with the measured 0.80 → 0.86, the peak within a month 76 → 83 %, the range (coefficient
 *     of variation) ×1.24 → ×0.98 and the low flow ×0.51 → ×0.85 of the measured. Of 0.5–0.9 × 2–4 months, 2.5 months
 *     scores a little higher with the observed climate, 3 with the simulated one, and keeps the dry season's flow
 *     nearer the measured with either (×0.85 against ×0.66 observed, ×0.75 against ×0.56 simulated);
 *   - each month's water reaching a river point as late as its way down takes, at 40 km a day, and spread over the
 *     months as its water comes from near and far (riverSpeedKmDay: the Evolution's water reaches the mouth within the
 *     month): the great basins' year, from 500,000 km², 0.79 months early → 0.07, the months' correlation 0.86 → 0.89,
 *     the peak within a month 83 → 87 %. Of 25–80 km a day, 40 scores best: 0.46 m/s, one effective speed for every
 *     river, as simple global river-routing schemes have it (TRIP's first version, CLM4, LPJ) — the water runs faster
 *     in its channel, but floodplains and wetlands hold it back. A basin far larger than Earth's has its year spread
 *     out more than shifted: water from 7,600 km on average, give or take 3,400, keeps 40 % of its seasons.
 * The year's flows do not depend on them.
 */
export const WATER = Object.freeze({ ...FINISH, lakeRegulationDry: 0, baseflowShare: 0.7, baseflowMonths: 3, riverSpeedKmDay: 40 });

/**
 * Rivers and lakes on a V1 planet.
 * @param {{r_xyz: Float32Array, r_elevation: Float32Array, adjOffset: Int32Array, adjList: Int32Array, climate: Object, heightKm?: Float32Array}} planet
 *        unit-sphere positions (any axes: the climate's lat / lon place the rivers), V1's elevation (≤ 0 water), each
 *        region's neighbours (SphereMesh), planetClimate's result for this planet (grid, surface, months, cell), and
 *        the heights to run on (km: js/earth-relief.js earthLikeHeights for Earth's; by default the generator's own
 *        curve, js/color-map.js elevToHeightKm — the climate's must be the same)
 * @param {{F?: Object, riverMonths?: boolean, iceAge?: {seed: number}}} options  the hydrology's constants (WATER);
 *        riverMonths: also each river point's twelve monthly flows (rivers.months, m³/s, 12 per point); iceAge: the land
 *        shaped by the Evolution's last ice age first (lakeDistricts below; the planet's seed for its scour's noise)
 */
export function runNewWater({ r_xyz, r_elevation, adjOffset, adjList, climate: res, heightKm = null }, { F = WATER, riverMonths = false, iceAge = null } = {}) {
    const t0 = performance.now();
    const n = r_elevation.length, G = res.grid.size, climGrid = { w: res.grid.w, h: res.grid.h };
    const mesh = { numCells: n, xyz: r_xyz, adjOffset, adjList, edgeKm: R_KM * Math.sqrt(8 * Math.PI / (Math.sqrt(3) * n)) };
    const z0 = new Float32Array(n);
    for (let r = 0; r < n; r++) z0[r] = heightKm ? heightKm[r] : elevToHeightKm(r_elevation[r]);
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
    // (potential evaporation month by month, as the rivers' months have it (runoffMonths): each month's temperature at
    // the region's own height — the grid's month there, moved by the region's year against the grid's: the climate's
    // own per-region months, to rounding — so a continental summer evaporates where the year averages below freezing;
    // from the annual mean the Lena's basin evaporated 60 mm and its rivers ran 1.6 times too full on real Earth, with
    // the observed climate. Runoff by Budyko's curve from the year's totals)
    const runoff = new Float32Array(n), pet = new Float32Array(n), Tm = new Float64Array(12);
    const bi = new Int32Array(4), bw = new Float64Array(4), at = (f) => f[bi[0]] * bw[0] + f[bi[1]] * bw[1] + f[bi[2]] * bw[2] + f[bi[3]] * bw[3];
    const monthT = Array.from({ length: 12 }, (_, m) => res.months.T.subarray(m * G, (m + 1) * G));
    for (let c = 0; c < n; c++) {
        corners(climGrid, lat[c], lon[c], bi, bw);
        let mean = 0;
        for (let m = 0; m < 12; m++) { Tm[m] = at(monthT[m]); mean += Tm[m] / 12; }
        const P = Math.max(0, pAnn[c]), shift = tAnn[c] - mean;
        let E0 = 0;
        for (let m = 0; m < 12; m++) E0 += Math.max(F.petMinMm / 12, (F.petBaseMm + F.petPerC * (Tm[m] + shift)) / 12);
        pet[c] = E0;
        runoff[c] = P > 0 ? Math.max(0, P - P * (1 + E0 / P - (1 + (E0 / P) ** F.budykoW) ** (1 / F.budykoW))) : 0;
    }
    const monthly = runoffMonths(res.months, G, F);
    const months = { at: (c, m0, M, share, arid) => { corners(climGrid, lat[c], lon[c], bi, bw); for (let j = 0; j < M; j++) { share[j] = at(monthly.share[m0 + j]); arid[j] = at(monthly.arid[m0 + j]); } } };
    // (no rivers on the ice caps)
    const ice = new Uint8Array(n);
    for (let c = 0; c < n; c++) if (koppen[c] === KOPPEN_ID.EF) ice[c] = 1;

    // ── the sea, and the inland seas: each body of water, and whether the open ocean reaches it (through a strait the
    // mesh cannot show, too — found on a copy of the heights: the planet's own are not cut). Always on the generator's
    // own heights: a strip of coast one region wide is its lowest land, a strait's sill of a metre or two; on Earth-like
    // heights it would stand tens of metres high and cut 445 bays off the sea on planet 06cy8w6z6a89kow6psje93 ──
    const zs = heightKm ? Float32Array.from(r_elevation, (e) => elevToHeightKm(e)) : z0.slice(), reach = oceanMask(mesh, zs);
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
    const iceAgeOut = iceAge ? lakeDistricts({ mesh, z0, r_elevation, res, lat, lon, rain: pAnn, seed: iceAge.seed }, F) : null;
    const glaciated = iceAgeOut ? iceAgeOut.ice : null;
    const water = (z, sink, seaBasin) => hydrology({ mesh, z, ocean: sink, runoff, pet, rain: pAnn, wetMonths, ice, glaciated, tectonic: null, seaBasin, fillHollows: true, lat, lon, months, network: true, debug: riverMonths }, Fw);
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
    // (the inland seas the rivers end in: salt where the lake's own climate is dry; where it is humid — its rain at least
    // BRACKISH_ARIDITY of its potential evaporation — brackish: on Earth a closed lake there is flushed in wet years or
    // drains through the ground, and is seldom salt)
    const sumP = new Float64Array(B), sumE = new Float64Array(B), humid = new Uint8Array(B);
    for (let c = 0; c < n; c++) if (sink[c] && !ocean[c]) { sumP[body[c]] += Math.max(0, pAnn[c]); sumE[body[c]] += pet[c]; }
    let salt = 0, brackish = 0, spilled = 0;
    for (let i = 0; i < B; i++) {
        if (closed[i]) { humid[i] = sumP[i] >= BRACKISH_ARIDITY * sumE[i] ? 1 : 0; if (humid[i]) brackish++; else salt++; }
        else if (!bodySea[i] && full[i]) spilled++;
    }
    for (let c = 0; c < n; c++) if (sink[c] && !ocean[c]) { lake[c] = humid[body[c]] ? Water.BRACKISH : Water.SALT; lakeLevel[c] = 0; }
    // (a lake's bed, filled with sediment since its water has stood there: toward at most about F.seaFillKm below its
    // surface (depth d → seaFillKm × tanh(d / seaFillKm)), as the Evolution fills a remnant of the sea — V1's inland seas
    // are pits of the sea floor, kilometres deep, and Earth's deepest lake, Baikal, is 1.6 km. Its water stays as it was)
    for (let c = 0; c < n; c++) {
        const d = lakeLevel[c] - z[c];
        if (lake[c] && d > 0) z[c] = lakeLevel[c] - F.seaFillKm * Math.tanh(d / F.seaFillKm);
    }
    return {
        heightKm: z, ocean, lake, lakeLevel, lakeOutlet: Hy.lakeOutlet, q: Hy.q, area: Hy.area, recv: Hy.recv, rivers: Hy.rivers, glaciated,
        stats: { ...Hy.stats, inlandSeas: { spilling: spilled, salt, brackish, rounds, unsettled: short }, ...(iceAgeOut ? { iceAge: iceAgeOut.stats } : {}) },
        timing: { total: performance.now() - t0 },
    };
}

/**
 * The Evolution's last ice age (v2/js/finish/finish-ice.js) on a V1 planet's land, for its lake districts: the ice where
 * snow outlasted an Earth-like glacial summer — the climate cooled toward the poles and dried — its troughs along the
 * ice's paths, hollows scoured under the sheets, moraines at its farthest reach. V1's own erosion drains almost every
 * hollow (js/terrain-post.js: each pit carved through toward the sea), so its land has few lakes; Earth's great lakes are
 * mostly glacial (Canada, Scandinavia, Siberia). The hydrology then keeps a hollow the ice scoured as a lake where it is
 * half the size it asks of others, and only a big river breaks one open (finish-config.js glacialKeepShare,
 * glacialBreachQ). (Rifts' lakes are not made here: V1 builds a rift valley only where two super plates part inside a
 * continent, and drains it like any hollow.)
 * The coasts stay the pages': the sea floor keeps its heights, and the land is never cut below the sea (a trough's
 * fjord ends at the coast). The land the ice pressed down is not left sunk (finish-config.js reboundLeft 0 here): behind
 * coasts that cannot flood, a Hudson Bay would be a lake the size of a sea.
 * Changes ctx.z0 in place; returns the ice's extent (1: under the ice) and its size.
 */
function lakeDistricts({ mesh, z0, r_elevation, res, lat, lon, rain, seed }, F) {
    const n = z0.length, G = res.grid.size, climGrid = { w: res.grid.w, h: res.grid.h }, gamma = CORE_DEFAULTS.lapseRateCPerKm;
    // (the warmest month at sea level, as the Evolution has it: on the climate's grid, to each region)
    const warmG = new Float32Array(G).fill(-Infinity);
    for (let g = 0; g < G; g++) {
        const href = res.surface.meanLandKm[g] === res.surface.meanLandKm[g] ? Math.max(0, res.surface.meanLandKm[g]) : 0;
        for (let m = 0; m < 12; m++) { const t = res.months.T[m * G + g] + gamma * href; if (t > warmG[g]) warmG[g] = t; }
    }
    const warmSl = new Float32Array(n);
    for (let c = 0; c < n; c++) warmSl[c] = bilinear(climGrid, warmG, lat[c], lon[c]);
    const before = z0.slice(), cellKm2 = 4 * Math.PI * R_KM * R_KM / n;
    const I = lastIceAge({ mesh, z: z0, lat, lon, warmSl, rain, grid: new LatLonGrid(0.25), cellKm2, seed }, { ...F, reboundLeft: 0 });
    let land = 0, iced = 0, lowered = 0, raised = 0, deepest = 0, highest = 0;
    for (let c = 0; c < n; c++) {
        if (r_elevation[c] <= 0) { z0[c] = before[c]; continue; }
        if (z0[c] < ICE_AGE_LAND_FLOOR_KM) z0[c] = ICE_AGE_LAND_FLOOR_KM;
        land++; if (I.ice[c]) iced++;
        const d = z0[c] - before[c];
        if (d < -1e-4) lowered++; else if (d > 1e-4) raised++;
        deepest = Math.min(deepest, d); highest = Math.max(highest, d);
    }
    return { ice: I.ice, stats: { iceKm2: Math.round(I.iceKm2), sheets: I.sheets, landShareIced: iced / Math.max(1, land), landLowered: lowered, landRaised: raised,
        mostLoweredKm: +(-deepest).toFixed(3), mostRaisedKm: +highest.toFixed(3) } };
}

/** The lowest the ice age leaves land (km), so that it stays above the sea. */
const ICE_AGE_LAND_FLOOR_KM = 1e-4;
const R_KM = 6371;

/** At most this many runs of the rivers to settle which inland seas spill (two or three, as a rule). */
const MAX_ROUNDS = 8;

/** A closed lake is brackish rather than salt where its rain is at least this share of its potential evaporation: the
 *  humid side of UNEP's aridity index (P / PET 0.65). */
const BRACKISH_ARIDITY = 0.65;

/** The level (km) an inland sea that spills stands at — sea level, as the pages draw it: a hair above it (2⁻¹⁰⁰, exact in
 *  a Float32Array), so the gorge its outflow cuts stays land and no land is drowned — V1's coastal plains lie within
 *  millimetres of the sea (a fifth of the land below 3 m: the Evolution's seaCutFloorKm would flood them). */
const SPILL_LEVEL_KM = 2 ** -100;
