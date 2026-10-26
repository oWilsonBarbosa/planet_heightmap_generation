// Hotspots and Large Igneous Provinces (Phase 7a; WBP Part Va). A mantle plume is fixed in the MANTLE
// (world) frame, and the plates slide over it. Its HEAD arrives first: a burst of flood basalt over a
// disc a thousand-odd km wide — a LIP: traps on a continent (Deccan, Siberia), a plateau at sea
// (Ontong Java) — and, under a continent big enough, it may split it (the South Atlantic opened over
// the Paraná–Etendeka plume). Then its TAIL keeps erupting for 100–200 Myr through whatever crust
// passes over it, leaving a chain of volcanoes that grows older downstream along the plate's motion
// (Hawaii–Emperor), bending where the plate turned.
//
// Where plumes rise: anywhere, but preferentially under mantle a continent has sat on for a long time
// — a continent is a lid that keeps the heat in. The mantle keeps a memory of this (world.mantleHeat,
// per world cell, 0…1) that warms under continent and cools slowly once the continent has gone, so
// plumes keep rising where a supercontinent USED to be. The bias is strong but not absolute
// (plumeOceanWeight, developer): some plumes rise under open ocean.
//
// The 6a plumes are these same plumes (developer): a scene may schedule one (world.plumes); every
// plume head is a LIP, and one that rifts a continent does so through step/rifting.js.
//
// Records only (crust.volc*, CrustFlag.LIP): Phase 8 turns them into volcanoes and plateaus.

import { CrustType, CrustFlag, VolcanicType } from '../model/crust.js';
import { PLANET_RADIUS_KM } from '../../core/sim-mesh.js';
import { tangentBasis, normalize } from '../../core/sphere-geom.js';
import { SimplexNoise } from '../../../../js/simplex-noise.js';
import { makeRng } from '../../../../js/rng.js';
import { EventKind } from '../model/world.js';

/**
 * One step of the plumes: warm or cool the mantle, bring up any plume due (scheduled or by chance),
 * let each head erupt and each tail build its track, and retire the plumes that have run their course.
 * Heads that may split a continent are queued in world.pendingPlumeRifts for step/rifting.js.
 */
export function updateHotspots(world, dt) {
    const { config } = world;
    if (!world.hotspotsReady) begin(world);
    warmMantle(world, dt);

    // plumes a scene scheduled
    for (const p of world.plumes) {
        if (p.done || p.time > world.time + 1e-9) continue;
        p.done = true;
        if (p.xyz) { birth(world, p.xyz, { head: p.head ?? true, rift: p.rift ?? 'chance', name: p.name, lifeMyr: p.lifeMyr, strength: p.strength, bornAt: p.time }); continue; }
        const plate = world.plates[p.plate];                 // (the 6a form: a cell of a plate, carried to where that plate is now)
        if (!plate?.alive) continue;
        const { xyz } = world.mesh, at = plate.toWorld(xyz[3 * p.cell], xyz[3 * p.cell + 1], xyz[3 * p.cell + 2], [0, 0, 0]);
        birth(world, at, { head: true, rift: true, riftPlate: plate.id, riftCell: p.cell, bornAt: p.time });
    }
    // plumes that rise by chance
    if (config.plumeRatePerMyr > 0 && world.rngHotspot() < config.plumeRatePerMyr * dt) {
        const w = pickPlumeSite(world, world.rngHotspot);
        if (w >= 0) birth(world, cellXyz(world.mesh, w), { head: true, rift: 'chance' });
    }
    // tails
    for (const h of world.hotspots) {
        if (!h.alive) continue;
        if (world.time >= h.dieAt) {
            h.alive = false;
            world.log(EventKind.PLUME_DEATH, `the ${h.name} hotspot dies out after ${(world.time - h.bornAt).toFixed(0)} Myr`, { hotspot: h.id, name: h.name, lifeMyr: world.time - h.bornAt });
            continue;
        }
        stampTrack(world, h, dt);
    }
}

/**
 * A world cell for a new plume, drawn with weight plumeOceanWeight + (1 − plumeOceanWeight) × mantle heat,
 * never within plumeSpacingKm of a live plume. @returns the cell, or −1 if nowhere qualifies
 */
export function pickPlumeSite(world, rng) {
    const { mesh, config, mantleHeat } = world, { numCells, xyz } = mesh;
    const cool = config.plumeOceanWeight, near = Math.cos(config.plumeSpacingKm / PLANET_RADIUS_KM);
    const live = world.hotspots.filter(h => h.alive).map(h => h.xyz);
    const weight = new Float32Array(numCells);
    let total = 0;
    for (let w = 0; w < numCells; w++) {
        const x = xyz[3 * w], y = xyz[3 * w + 1], z = xyz[3 * w + 2];
        if (live.some(p => x * p[0] + y * p[1] + z * p[2] > near)) continue;
        weight[w] = cool + (1 - cool) * mantleHeat[w];
        total += weight[w];
    }
    if (total <= 0) return -1;
    let r = rng() * total;
    for (let w = 0; w < numCells; w++) { r -= weight[w]; if (r <= 0 && weight[w] > 0) return w; }
    return -1;
}

// ─────────────────────────────── the mantle ───────────────────────────────

/** First step: the start is old — the mantle under every continent is already insulated — and some plumes are already rising. */
function begin(world) {
    const { mesh, config } = world;
    world.hotspotsReady = true;
    insulateAtStart(world);
    for (let i = 0; i < config.hotspotInitialCount; i++) {
        const w = pickPlumeSite(world, world.rngHotspot);
        if (w < 0) break;
        // heads erupted in prehistory: only the tail is left, some way through its life
        const age = world.rngHotspot() * config.plumeLifeMinMyr * 0.6;
        birth(world, cellXyz(mesh, w), { head: false, rift: false, bornAt: world.time - age });
    }
}

/**
 * The start is old: the mantle under every continent is already insulated. The first step sets it (begin); this also
 * sets it before the history's first frame is recorded, so that frame shows the start as it is (it read no heat, and
 * every continent rose by its mantle swell at the first step — developer, 8b round 6: "on step 1 all the land raises
 * up a bit"). The first step sets it again, the same way: the history is unchanged.
 */
export function insulateAtStart(world) {
    const { mesh, mantleHeat } = world;
    for (let w = 0; w < mesh.numCells; w++) mantleHeat[w] = isContinental(world, w) ? 1 : 0;
}

/** Warm the mantle under continents, cool it elsewhere — toward 1 and 0 respectively, over mantleInsulateMyr and mantleCoolMyr. */
function warmMantle(world, dt) {
    const { config, mantleHeat } = world, n = mantleHeat.length;
    const warm = 1 - Math.exp(-dt / config.mantleInsulateMyr), cool = 1 - Math.exp(-dt / config.mantleCoolMyr);
    for (let w = 0; w < n; w++) mantleHeat[w] += isContinental(world, w) ? (1 - mantleHeat[w]) * warm : -mantleHeat[w] * cool;
}

/**
 * Phase 13: a plume head splits a continent the more readily the hotter the mantle under it (as tension rifts do,
 * step/rifting.js) — relative to fully insulated mantle, where it splits one at plumeRiftChance. 1 with the mechanism off.
 */
function plumeHeatFactor(world, plate) {
    const { config, owner, mantleHeat } = world;
    if (!(config.riftHeatGain > 0)) return 1;
    let s = 0, n = 0;
    for (let w = 0; w < owner.length; w++) if (owner[w] === plate.id && isContinental(world, w)) { s += mantleHeat[w]; n++; }
    const h = n ? s / n : 0;
    return (config.riftHeatFloor + config.riftHeatGain * h ** config.riftHeatPower) / (config.riftHeatFloor + config.riftHeatGain);
}

export function isContinental(world, w) {
    const o = world.owner[w];
    if (o < 0) return false;
    const t = world.plates[o].crust.type[world.ownerCell[w]];
    return t === CrustType.CONTINENT || t === CrustType.CRATON;          // (an island arc is too thin to keep the heat in)
}

// ─────────────────────────────── a plume's life ───────────────────────────────

/**
 * A plume reaches the surface at `xyz` (a mantle-frame position). Its head erupts a LIP; under a continent it may
 * be queued to split it. `rift`: true = it must try (a scene said so), 'chance' = plumeRiftChance if the continent is
 * big enough, false = never.
 */
function birth(world, xyz, { head = true, rift = 'chance', riftPlate = -1, riftCell = -1, name, lifeMyr, strength, bornAt = world.time } = {}) {
    const { config, mesh, plates, owner } = world, rng = world.rngHotspot;
    const h = {
        id: world.hotspots.length, name: name ?? plumeName(world), xyz: normalize(xyz), bornAt, alive: true, lip: null,
        dieAt: bornAt + (lifeMyr ?? config.plumeLifeMinMyr + rng() * (config.plumeLifeMaxMyr - config.plumeLifeMinMyr)),
        strength: strength ?? 0.6 + 0.8 * rng(),
        // the tail's eruptions (eruptedDuring): bursting or quiet until pulseUntil, at pulseIntensity; drawn on first use
        pulseUntil: undefined, bursting: false, pulseIntensity: 0,
    };
    world.hotspots.push(h);
    const w = mesh.index.nearest(h.xyz[0], h.xyz[1], h.xyz[2]), plate = owner[w] >= 0 ? plates[owner[w]] : null;
    world.log(EventKind.PLUME_RISE, `the ${h.name} plume ${head ? 'rises' : 'is already rising'} beneath ${plate && !plate.isBackground ? plate.name : 'the open ocean'}`,
        { hotspot: h.id, name: h.name, plate: plate && !plate.isBackground ? plate.id : -1, head });
    if (head) eruptLip(world, h, w);
    if (rift !== false && plate && !plate.isBackground) {
        const target = riftPlate >= 0 ? plates[riftPlate] : plate;
        const bigEnough = target.stats.continentalCells * mesh.cellAreaKm2 >= config.riftMinContinentKm2;
        if (rift === true || (bigEnough && rng() < config.plumeRiftChance * plumeHeatFactor(world, target))) world.pendingPlumeRifts.push({ plate: target.id, xyz: h.xyz, cell: riftCell, cause: { text: `the ${h.name} plume`, kind: 'plume', hotspot: h.id } });
    }
    return h;
}

/**
 * The head: flood basalt over a province of lipAreaMin…MaxMkm2 (log-uniform: many small, a few vast — the Columbia River
 * basalts 0.2 Mkm², the Deccan 1.5, Siberia ~4), thickest by its vents. No two alike (developer: "all almost the same size
 * and shape"): a province is the lava of a few great flows — one to four elongated lobes (ellipses of aspect 1…3, turned
 * every way), the first on the plume and the others spilling off it, often along one axis (a rift's: the CAMP, the
 * Karoo) — its edge ragged with lobes and tongues (a warped noise), like lava that flooded the low ground.
 */
function eruptLip(world, h, w0) {
    const { config, mesh, plates, owner, ownerCell, provisional, time } = world, { adjOffset, adjList, cellAreaKm2, xyz } = mesh;
    // (the draws the shared streams always gave a head — the same number, in the same order; its shape from a stream of
    // its own, seeded from them: the rest of the history is unchanged)
    const u = world.rngHotspot();
    const rv = world.rngVolcano, ragged = 0.4 + 0.6 * rv();
    const lobes = [1, 2, 3, 4, 5].map(k => ({ k, amp: ragged * rv() * config.lipLobes / Math.sqrt(k), phase: rv() * 2 * Math.PI }));
    const noiseSeed = Math.floor(rv() * 1e9), noise = new SimplexNoise(noiseSeed), rs = makeRng((noiseSeed ^ 0x11b5) >>> 0);
    const areaKm2 = 1e6 * config.lipAreaMinMkm2 * (config.lipAreaMaxMkm2 / config.lipAreaMinMkm2) ** u;
    const radius = Math.sqrt(areaKm2 / Math.PI) / PLANET_RADIUS_KM;          // (of a disc of that area)
    // the flows: a main lobe on the plume, and up to three more off it — mostly along the province's own axis
    const axis = rs() * Math.PI, [b1, b2] = tangentBasis(h.xyz), count = 1 + Math.floor(rs() * rs() * 4);
    const flows = [];
    let weight = 0;
    for (let i = 0; i < count; i++) {
        const w = i === 0 ? 1 : 0.25 + 0.6 * rs();
        const along = i === 0 ? 0 : (0.6 + 0.6 * rs()) * (rs() < 0.5 ? -1 : 1), off = i === 0 ? 0 : radius * along;
        const dir = axis + (rs() - 0.5) * 1.2, cd = Math.cos(off), sd = Math.sin(off);
        const c = normalize([cd * h.xyz[0] + sd * (Math.cos(dir) * b1[0] + Math.sin(dir) * b2[0]), cd * h.xyz[1] + sd * (Math.cos(dir) * b1[1] + Math.sin(dir) * b2[1]),
            cd * h.xyz[2] + sd * (Math.cos(dir) * b1[2] + Math.sin(dir) * b2[2])]);
        const aspect = 1 + 2 * rs() * rs(), turn = (i === 0 ? axis : dir) + (rs() - 0.5) * 0.8, [f1, f2] = tangentBasis(c);
        flows.push({ c, f1, f2, w, aspect, cos: Math.cos(turn), sin: Math.sin(turn) });
        weight += w;
    }
    // (their sizes shared out so the whole, overlaps and all, comes to about the province's area)
    for (const f of flows) { const r = radius * Math.sqrt(1.25 * f.w / weight); f.a = r * Math.sqrt(f.aspect); f.b = r / Math.sqrt(f.aspect); }
    const warpF = 2.5 / radius, freq = 5 / radius;
    // how far inside the province a cell is: 1 at a vent, 0 on the edge (< 0 outside) — the nearest flow's, the edge
    // pushed in and out by the lobes and a warped noise
    const depth = w => {
        let x = xyz[3 * w], y = xyz[3 * w + 1], z = xyz[3 * w + 2];
        const wx = 0.35 * radius * noise.fbm(x * warpF + 3.1, y * warpF, z * warpF, 2), wy = 0.35 * radius * noise.fbm(x * warpF, y * warpF + 5.3, z * warpF, 2), wz = 0.35 * radius * noise.fbm(x * warpF, y * warpF, z * warpF + 7.7, 2);
        x += wx; y += wy; z += wz;
        let best = -Infinity;
        for (const f of flows) {
            const px = x * f.f1[0] + y * f.f1[1] + z * f.f1[2], py = x * f.f2[0] + y * f.f2[1] + z * f.f2[2];
            const pu = px * f.cos + py * f.sin, pv = -px * f.sin + py * f.cos, q = Math.hypot(pu / f.a, pv / f.b);
            if (1 - q > best) best = 1 - q;
        }
        const theta = Math.atan2(x * b2[0] + y * b2[1] + z * b2[2], x * b1[0] + y * b1[1] + z * b1[2]);
        let lobe = 0;
        for (const l of lobes) lobe += l.amp * Math.cos(l.k * theta + l.phase);
        return best + 0.5 * lobe + config.lipEdgeNoise * noise.fbm(x * freq, y * freq, z * freq, 3);
    };
    const inside = w => depth(w) > 0;
    let cells = 0, landCells = 0;
    const seen = new Set([w0]);
    for (let queue = [w0], i = 0; i < queue.length; i++) {
        const w = queue[i];
        if (owner[w] >= 0 && !provisional[w]) {
            const crust = plates[owner[w]].crust, c = ownerCell[w], d = 1 - Math.max(0, Math.min(1, depth(w)));
            crust.volcType[c] = VolcanicType.LIP;
            crust.volcAt[c] = time;
            // (flat-lying flows: a plateau of nearly even thickness, a little thicker by the vents, thinning only near its edge)
            const inn = 1 - d;
            crust.volcKm[c] = Math.max(crust.volcKm[c], config.lipThicknessKm * (0.8 + 0.2 * inn) * (0.35 + 0.65 * Math.min(1, inn / 0.15)));
            crust.volcSource[c] = h.id + 1;
            crust.flags[c] |= CrustFlag.LIP;
            cells++;
            if (crust.type[c] !== CrustType.OCEAN) landCells++;
        }
        for (let k = adjOffset[w]; k < adjOffset[w + 1]; k++) { const nb = adjList[k]; if (!seen.has(nb) && inside(nb)) { seen.add(nb); queue.push(nb); } }
    }
    const onLand = landCells * 2 > cells, host = owner[w0] >= 0 && !plates[owner[w0]].isBackground ? plates[owner[w0]].name : 'the open ocean';
    h.lip = { name: `${h.name} ${onLand ? 'Traps' : 'Plateau'}`, time, radiusKm: radius * PLANET_RADIUS_KM, flows: count, cells, onLand };
    world.log(EventKind.LIP, `the ${h.lip.name} erupt${onLand ? '' : 's'}: ${(cells * cellAreaKm2 / 1e6).toFixed(1)} Mkm² of flood basalt on ${host}`,
        { hotspot: h.id, name: h.lip.name, onLand, areaMkm2: cells * cellAreaKm2 / 1e6, plate: owner[w0] >= 0 && !plates[owner[w0]].isBackground ? owner[w0] : -1 });
}

/**
 * The tail, on whatever plate is passing over the plume now. Everywhere within hotspotTrackKm the plume marks the
 * TRACK — the swell it lifts, and the line its age progression runs along, one unbroken ribbon on the plate's own
 * lattice however that lattice sits against the world's. But it builds VOLCANOES only in bursts (eruptedDuring):
 * a burst piles rock within hotspotEdificeKm of the plume, then the plume goes quiet while the plate carries that
 * volcano off — so the chain is a string of separate islands and seamounts, not a line of land (developer).
 */
function stampTrack(world, h, dt) {
    const { config, mesh, plates, owner, provisional, time } = world, { adjOffset, adjList, index, xyz } = mesh;
    const w0 = index.nearest(h.xyz[0], h.xyz[1], h.xyz[2]);
    if (owner[w0] < 0 || provisional[w0]) return;
    const plate = plates[owner[w0]], crust = plate.crust, c0 = plate.cellAt(index, h.xyz[0], h.xyz[1], h.xyz[2]);
    if (!crust.mask[c0]) return;
    const local = plate.toPlateFrame(h.xyz[0], h.xyz[1], h.xyz[2], [0, 0, 0]), reach = Math.cos(config.hotspotTrackKm / PLANET_RADIUS_KM);
    const edifice = Math.cos(config.hotspotEdificeKm / PLANET_RADIUS_KM), closeness = c => xyz[3 * c] * local[0] + xyz[3 * c + 1] * local[1] + xyz[3 * c + 2] * local[2];
    const cells = [c0], seen = new Set(cells);                 // every cell within hotspotTrackKm of the plume, however fine the mesh
    for (let i = 0; i < cells.length; i++) for (let k = adjOffset[cells[i]]; k < adjOffset[cells[i] + 1]; k++) {
        const nb = adjList[k];
        if (!seen.has(nb) && crust.mask[nb] && closeness(nb) >= reach) { seen.add(nb); cells.push(nb); }
    }
    const build = config.hotspotBuildKmPerMyr * h.strength * eruptedDuring(world, h, time - dt, time);
    for (const c of cells) {
        if (crust.volcType[c] !== VolcanicType.LIP) crust.volcType[c] = VolcanicType.TRACK;
        crust.volcAt[c] = time;
        crust.volcSource[c] = h.id + 1;
        if (build > 0 && (c === c0 || closeness(c) >= edifice)) crust.volcKm[c] = Math.max(crust.volcKm[c], Math.min(config.hotspotMaxKm, crust.volcKm[c] + build));
    }
}

/**
 * How much the plume erupted between t0 and t1 — the time spent in bursts, × each burst's intensity. A plume
 * alternates bursts (hotspotBurstMin…MaxMyr, intensity 0.5–1.4) with quiet spells (hotspotQuietMin…MaxMyr); a burst
 * shorter than a step still counts in full.
 */
function eruptedDuring(world, h, t0, t1) {
    const { config } = world, rv = world.rngVolcano;
    if (h.pulseUntil === undefined) { h.bursting = false; h.pulseUntil = t0 + rv() * config.hotspotQuietMaxMyr; }
    let total = 0;
    for (let t = t0; t < t1;) {
        const end = Math.min(t1, h.pulseUntil);
        if (h.bursting) total += h.pulseIntensity * (end - t);
        if (end < h.pulseUntil) break;
        // the pulse ends here: switch
        if (h.bursting) { h.bursting = false; h.pulseUntil = end + config.hotspotQuietMinMyr + rv() * (config.hotspotQuietMaxMyr - config.hotspotQuietMinMyr); }
        else { h.bursting = true; h.pulseIntensity = 0.5 + 0.9 * rv(); h.pulseUntil = end + config.hotspotBurstMinMyr + rv() * (config.hotspotBurstMaxMyr - config.hotspotBurstMinMyr); }
        t = end;
    }
    return total;
}

// ─────────────────────────────── names and small helpers ───────────────────────────────

const ONSETS = ['K', 'V', 'T', 'R', 'M', 'S', 'L', 'N', 'D', 'H', 'Th', 'Z', 'B', 'G', 'Sh', 'F', 'P', 'Kh'];
const NUCLEI = ['a', 'e', 'i', 'o', 'u', 'a', 'o', 'ai', 'au', 'ei'];
const CODAS = ['', '', 'n', 'r', 'l', 's', 'th', 'k', 'm', 'rn'];

/** A name for a plume (and its LIP and track): two or three invented syllables, unique in this world. */
function plumeName(world) {
    const r = world.rngHotspot, pick = a => a[Math.floor(r() * a.length)];
    for (let tries = 0; tries < 30; tries++) {
        const n = r() < 0.3 ? 3 : 2;
        let s = '';
        for (let i = 0; i < n; i++) s += pick(ONSETS) + pick(NUCLEI) + (i === n - 1 ? pick(CODAS) : '');
        s = s[0] + s.slice(1).toLowerCase();
        if (!world.hotspots.some(h => h.name === s)) return s;
    }
    return `Plume ${world.hotspots.length + 1}`;
}

function cellXyz(mesh, w) { return [mesh.xyz[3 * w], mesh.xyz[3 * w + 1], mesh.xyz[3 * w + 2]]; }
function dotCell(mesh, w, p) { return mesh.xyz[3 * w] * p[0] + mesh.xyz[3 * w + 1] * p[1] + mesh.xyz[3 * w + 2] * p[2]; }
