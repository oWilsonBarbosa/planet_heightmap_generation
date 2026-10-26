// The starting condition of every history (WBP Part Va): one supercontinent of lettered
// cratons wrapped in accreted crust, on a single plate that also carries an apron of old ocean
// with a trench along its rim, all set in one passive pre-history ocean.

import { SimplexNoise } from '../../../../js/simplex-noise.js';
import { makeRng } from '../../../../js/rng.js';
import { TECTONICS } from '../config.js';
import { TectonicWorld, EventKind } from '../model/world.js';
import { CrustType, CrustFlag } from '../model/crust.js';
import { tangentBasis } from '../../core/sphere-geom.js';
import { spreadBelt, OrogenyType } from '../step/orogeny.js';
import { placeCratons } from './cratons.js';
import { shapeLandmass } from './landmass.js';
import { plateOutlineWithApron, chooseActiveRim } from './rim-trench.js';

const MAX_ATTEMPTS = 24;
const RELAX_SPAN_AFTER = 18;        // the extent cap is a preference; the spacing promises are never relaxed
const FRACTION_TOLERANCE = 0.004;   // how far from the requested continental fraction still counts as a fit

/**
 * @param {Partial<typeof TECTONICS>} [overrides]  tunables that differ from the defaults; they become world.config
 * @returns {{world: TectonicWorld, start: Object}} `start` = layout facts (cratons, centre, passive sector, …)
 */
export function buildStartWorld(simMesh, seed, overrides = {}) {
    const world = new TectonicWorld(simMesh, seed, overrides);
    return assemble(world, simMesh, seed, findLayout(simMesh, seed, world.config, a => evaluateAttempt(simMesh, seed, world.config, a)));
}

/**
 * buildStartWorld, its layout attempts evaluated side by side by `helpers` (app/helper-pool.js) — a batch at a time, taken
 * in order by the same rules: the same start world. @returns {Promise} buildStartWorld's result
 */
export async function buildStartWorldAsync(simMesh, seed, overrides = {}, helpers) {
    const world = new TectonicWorld(simMesh, seed, overrides), cfg = world.config, results = new Map();
    let next = 0;
    const get = async a => {
        if (!results.has(a)) {
            const batch = [];
            for (let k = a; k < Math.min(MAX_ATTEMPTS, a + helpers.size); k++) batch.push(k);
            const got = await helpers.layoutAttempts(seed, cfg, batch);
            batch.forEach((k, i) => results.set(k, got[i]));
        }
        return results.get(a);
    };
    // (the selection, replayed in order over the attempts as they come back: findLayout's own rules)
    const evaluated = [];
    for (; next < MAX_ATTEMPTS; next++) {
        evaluated[next] = await get(next);
        const found = findLayout(simMesh, seed, cfg, a => withLayout(simMesh, seed, cfg, a, evaluated[a]), next + 1);
        if (found) return assemble(world, simMesh, seed, found);
    }
    return assemble(world, simMesh, seed, null);
}

/** A layout attempt as a helper evaluated it ({tried: [{areaScale, excess}], fit: {areaScale, land} | null}) made whole again:
 *  each candidate's cratons and its rng (placed again — cheap — so the rng stands where it did), the land the helper made
 *  for the fitting one, made again here for any other (the fallback's closest, rarely). */
function withLayout(simMesh, seed, cfg, attempt, got) {
    const stretch = 1 - attempt / MAX_ATTEMPTS;
    const whole = c => {
        if (c.layout) return c;
        const rng = makeRng(seed * 31 + attempt * 7919 + 17), layout = placeCratons(rng, cfg, stretch, c.areaScale);
        const land = c.land ?? shapeLandmass(simMesh, layout.cratons, layout.centre, new SimplexNoise(seed + attempt * 101), cfg, stretch);
        return Object.assign(c, { layout, land, rng, attempts: attempt + 1 });
    };
    const tried = got.tried.map(c => (got.fit && c.areaScale === got.fit.areaScale ? Object.assign(c, { land: got.fit.land }) : c));
    return { tried, fit: got.fit ? tried.find(c => c.areaScale === got.fit.areaScale) : null, whole };
}

/** The rest of the start world, once its layout is chosen. */
/**
 * The supercontinent was assembled by collisions, long before the history begins: its sutures carry old, worn ranges
 * (plans/V2_REALISM_PASS_PLAN.md, phase 8 — the recordings found the start world 90 % below ~750 m, its opening frames
 * flat). An old Ural-type belt along every suture, recorded startSutureAgeMyr before the start, its relief worn down to
 * startSutureKeep of a fresh belt's — the Appalachians and Caledonides of this Pangaea, where its rifts (which follow old
 * sutures) open. Not along every suture: their network rings every craton (a honeycomb), so a broad noise of its own
 * (startSutureNoiseKm; no seeded stream drawn) sets each stretch's strength — about half the network carries ranges, in
 * long broken stretches of varying height and width. Records only: belts and heights; the history never reads them.
 */
function oldSutureRanges(world, continent) {
    const cfg = world.config, crust = continent.crust;
    if (!(cfg.startSutureWorkKm > 0)) return;
    const sources = [];
    for (let c = 0; c < crust.mask.length; c++) if (crust.mask[c] && (crust.flags[c] & CrustFlag.SUTURE) && crust.type[c] !== CrustType.OCEAN) sources.push(c);
    if (!sources.length) return;
    const before = { root: crust.rootKm.slice(), uplift: crust.upliftKm.slice(), rugged: crust.rugged.slice() };
    const { xyz } = world.mesh, noise = new SimplexNoise((world.seed ^ 0x5a7e) >>> 0), f = 6371 / cfg.startSutureNoiseKm;
    const strength = sources.map(c => { const x = xyz[3 * c], y = xyz[3 * c + 1], z = xyz[3 * c + 2]; const v = noise.noise3D(x * f, y * f, z * f) + 0.4 * noise.noise3D(x * 2.7 * f + 3.3, y * 2.7 * f + 8.1, z * 2.7 * f + 1.9); return Math.max(0, Math.min(1, (v + 0.05) / 0.6)); });
    spreadBelt(continent, world.mesh, sources, { type: OrogenyType.URAL, time: -cfg.startSutureAgeMyr,
        works: strength.map(s => cfg.startSutureWorkKm * s), widths: strength.map(s => cfg.startSutureBeltKm * (0.55 + 0.45 * s)) }, cfg);
    const keep = cfg.startSutureKeep;
    for (let c = 0; c < crust.mask.length; c++) {
        crust.rootKm[c] = before.root[c] + (crust.rootKm[c] - before.root[c]) * keep;
        crust.upliftKm[c] = before.uplift[c] + (crust.upliftKm[c] - before.uplift[c]) * keep;
        crust.rugged[c] = before.rugged[c] + (crust.rugged[c] - before.rugged[c]) * keep;
    }
}

function assemble(world, simMesh, seed, found) {
    const cfg = world.config;
    if (!found) throw new Error(`These settings do not fit on the planet for seed ${seed}: the cratons, the required gaps between them and their margins need more room than the requested continental area allows.`);
    const { layout, land, rng, middle } = found;
    const { numCells } = simMesh;

    const isLand = Uint8Array.from(land.type, t => (t === CrustType.OCEAN ? 0 : 1));
    const { inPlate, rim } = plateOutlineWithApron(simMesh, isLand, cfg);
    const reference = tangentBasis(middle)[0];
    const trench = chooseActiveRim(simMesh, rim, middle, reference, cfg.rimTrenchCoverage, rng);

    const continent = world.addPlate(layout.cratons.map(c => c.letter).join(''));
    const ocean = world.addPlate('Pre-history ocean');
    ocean.isBackground = true;
    for (let c = 0; c < numCells; c++) {
        if (!inPlate[c]) { ocean.crust.create(c, CrustType.OCEAN, -cfg.initialOceanAgeMyr); continue; }
        if (land.type[c] === CrustType.OCEAN) {
            continent.crust.create(c, CrustType.OCEAN, -cfg.initialOceanAgeMyr);
            continent.crust.flags[c] |= CrustFlag.APRON;
            if (trench.active[c]) continent.crust.armTrench(c, cfg.slabMatureKm);       // rim trenches start mature
        } else {
            continent.crust.create(c, land.type[c], -cfg.initialLandAgeMyr, land.terrane[c]);
            if (land.suture[c]) continent.crust.flags[c] |= CrustFlag.SUTURE;
        }
    }
    oldSutureRanges(world, continent);
    for (const p of world.plates) p.refreshExtent(simMesh.xyz);
    world.terraneLetters = Object.fromEntries(layout.cratons.map(c => [c.id, c.letter]));
    continent.born = -cfg.riftTenureMyr;                  // assembled in prehistory: it may rift from the first step (developer: within ~30 Myr)
    world.log(EventKind.START, `Supercontinent ${continent.name}: ${layout.cratons.length} cratons, ringed by subduction`, { plate: continent.id, cratons: layout.cratons.length });

    return {
        world,
        start: {
            cratons: layout.cratons, centre: middle, reference, elongation: layout.elongation,
            skirtKm: land.skirtKm, rim, passiveFrom: trench.passiveFrom, passiveTo: trench.passiveTo,
            attempts: found.attempts, cratonAreaScale: found.areaScale, fractionMet: found.fractionMet,
            config: cfg, continentId: continent.id, oceanId: ocean.id,
        },
    };
}

/**
 * Search for a craton layout + landmass that honours the priorities: (1) the spacing minimums, never
 * relaxed; (2) the continental fraction, hit as closely as possible; (3) the requested craton size, which
 * gives way. Each layout is tried with the cratons at full size first and then progressively smaller,
 * until the land the spacing rules force (cratons + their sea margins + the belts joining them) fits
 * inside the requested fraction. Later attempts use rounder, tighter clusters.
 */
function findLayout(simMesh, seed, cfg, attemptOf, upTo = MAX_ATTEMPTS) {
    const roundSpan = Math.acos(1 - 2 * cfg.continentalFraction) * 180 / Math.PI;
    let closest = null;
    for (let attempt = 0; attempt < upTo; attempt++) {
        const { tried, fit, whole = c => c } = attemptOf(attempt);
        for (const candidate of tried) if (!closest || Math.abs(candidate.excess) < Math.abs(closest.candidate.excess)) closest = { candidate, whole };
        const chosen = fit ? whole(fit) : (attempt === MAX_ATTEMPTS - 1 && closest ? closest.whole(closest.candidate) : null);
        if (!chosen) continue;
        chosen.middle = landCentroid(simMesh, chosen.land.type);
        const tooWide = halfSpanDeg(simMesh, chosen.land.type, chosen.middle) > roundSpan + cfg.spanAllowanceDeg;
        if (fit && tooWide && attempt < RELAX_SPAN_AFTER) continue;
        return { ...chosen, fractionMet: !!fit, attempts: attempt + 1 };
    }
    return null;
}

/**
 * One attempt of the layout search: the cratons placed at each size in turn (full size first, then smaller) until the land
 * hits the continental fraction — every candidate tried ({layout, land, rng, areaScale, excess, attempts}) and the fitting
 * one, if any. An attempt depends on its number alone (its own rng and noise), so attempts can be evaluated apart.
 */
export function evaluateAttempt(simMesh, seed, cfg, attempt) {
    const { numCells } = simMesh, tried = [];
    for (const areaScale of shrinkSteps(cfg.cratonMinAreaScale)) {
        const rng = makeRng(seed * 31 + attempt * 7919 + 17), noise = new SimplexNoise(seed + attempt * 101);
        const stretch = 1 - attempt / MAX_ATTEMPTS;
        const layout = placeCratons(rng, cfg, stretch, areaScale);
        const land = layout && shapeLandmass(simMesh, layout.cratons, layout.centre, noise, cfg, stretch);
        if (!land) continue;                                   // did not pack, or the cratons are not joined into one landmass
        let cells = 0;
        for (let c = 0; c < numCells; c++) if (land.type[c] !== CrustType.OCEAN) cells++;
        const candidate = { layout, land, rng, areaScale, excess: cells / numCells - cfg.continentalFraction, attempts: attempt + 1 };
        tried.push(candidate);
        if (Math.abs(candidate.excess) <= FRACTION_TOLERANCE) return { tried, fit: candidate };
    }
    return { tried, fit: null };
}

/** Craton area factors to try, from full size down to the floor: 1, 0.85, 0.72, … , floor. */
function shrinkSteps(floor) {
    const lowest = Math.max(0.05, Math.min(1, floor)), steps = [];
    for (let k = 1; k > lowest; k *= 0.85) steps.push(k);
    steps.push(lowest);
    return steps;
}

function landCentroid(simMesh, type) {
    const { xyz, numCells } = simMesh;
    let sx = 0, sy = 0, sz = 0;
    for (let c = 0; c < numCells; c++) if (type[c] !== CrustType.OCEAN) { sx += xyz[3 * c]; sy += xyz[3 * c + 1]; sz += xyz[3 * c + 2]; }
    const l = Math.hypot(sx, sy, sz) || 1;
    return [sx / l, sy / l, sz / l];
}

function halfSpanDeg(simMesh, type, middle) {
    const { xyz, numCells } = simMesh;
    let far = 1;
    for (let c = 0; c < numCells; c++) {
        if (type[c] === CrustType.OCEAN) continue;
        const d = xyz[3 * c] * middle[0] + xyz[3 * c + 1] * middle[1] + xyz[3 * c + 2] * middle[2];
        if (d < far) far = d;
    }
    return Math.acos(Math.max(-1, far)) * 180 / Math.PI;
}

