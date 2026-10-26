// Plate motion from force balance. Plates have no meaningful inertia (the mantle is far too
// viscous), so at every instant a plate turns at the rate where everything that resists motion
// cancels the driving torque:
//        Σ r × F_drive  =  [ drag + slab resistance + collision lock ] ω      →   D ω = T
//   basal drag       Σ c (I − r rᵀ) over the plate's own crust; c is larger under continents and largest
//                    under cratons (deep lithospheric roots), so big, cratonic plates are slow
//   slab resistance  at each trench cell where this plate's ocean goes down: the mantle resists the
//                    slab's sinking in proportion to the convergence rate. This — not basal drag — is
//                    what limits a subducting plate's speed (terminal speed ≈ slabPull ÷ slabResistance)
//   collision lock   where land overlaps land, a viscous tie to the other plate ACROSS the front, against their
//                    closing: as the overlap grows it swamps everything else and the seam stops closing — but along
//                    the front it resists only weakly, and hardly at all where the two part, so a contact is a pivot
//                    (Phase 11): the pull of the ocean still going down beside it turns the plate about it and the
//                    rest of the gap closes like a zipper
// The two couplings involve the other plate's velocity; every plate is solved against the velocities
// all plates had at the START of the step, so the result does not depend on plate order.
// The solved rotation is approached over `relaxMyr` (WBP: plates change speed over a few Myr).

import { CrustType } from '../model/crust.js';
import { CM_PER_YR_TO_RAD_PER_MYR } from '../config.js';
import { gatherLoads, FORCE_KINDS } from './forces.js';
import { speedCmYrAt } from './kinematics.js';

/** Recompute every plate's angular velocity from the forces on it. Use as the `drive` of tectonics/simulate.js. */
export function updatePlateMotion(world) {
    const { plates, config } = world;
    const loads = gatherLoads(world);
    const before = plates.map(p => p.omega.slice());
    const blend = 1 - Math.exp(-world.lastDt / config.relaxMyr);        // 0 on the very first call: a world starts from rest

    for (const plate of plates) {
        if (!plate.alive) continue;
        if (plate.isBackground || plate.crust.count === 0) { plate.omega = [0, 0, 0]; plate.dynamics = null; continue; }
        const load = loads.get(plate.id);
        const target = balancedRotation(world, plate, load, before);
        const centre = plate.toWorld(plate.capCenter[0], plate.capCenter[1], plate.capCenter[2], [0, 0, 0]);
        softenSpeed(target, plate, centre, config);
        const capped = clampSpeed(target, plate, centre, config);
        plate.omega = [0, 1, 2].map(i => before[plate.id][i] + (target[i] - before[plate.id][i]) * blend);
        plate.dynamics = describeDynamics(load, target, centre, capped, world.mesh);
    }
}

/** The rotation at which drag and the couplings cancel the driving torque on this plate. */
function balancedRotation(world, plate, load, omegaOf) {
    const { config, mesh } = world, areaUnit = mesh.cellAreaKm2 / 1e4;
    const D = dragTensor(plate, mesh, config, areaUnit);
    const T = load.torque.slice();

    // slab resistance acts along the trench normal only:  F = −c (n · (v_self − v_other)) n
    for (const { r, n, other, length } of load.slabs) {
        const c = config.slabResistance * length;
        const a = [r[1] * n[2] - r[2] * n[1], r[2] * n[0] - r[0] * n[2], r[0] * n[1] - r[1] * n[0]];       // r × n, and n·(ω × r) = ω·(r × n)
        for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) D[3 * i + j] += c * a[i] * a[j];
        const o = omegaOf[other], otherNormalSpeed = o[0] * a[0] + o[1] * a[1] + o[2] * a[2];
        for (let i = 0; i < 3; i++) T[i] += c * otherNormalSpeed * a[i];
    }
    // collision lock, across the front and along it:  F = −c_n (n · v_rel) n − c_t (t · v_rel) t, v_rel = v_self − v_other;
    // across, full strength where the two close and a small share where they part (judged at the start of the step)
    const self = omegaOf[plate.id];
    for (const { r, n, other, weight } of load.contacts) {
        const c = config.collisionResistance * areaUnit * weight, o = omegaOf[other];
        const an = [r[1] * n[2] - r[2] * n[1], r[2] * n[0] - r[0] * n[2], r[0] * n[1] - r[1] * n[0]];      // r × n: n·(ω × r) = ω·(r × n)
        const closing = (self[0] - o[0]) * an[0] + (self[1] - o[1]) * an[1] + (self[2] - o[2]) * an[2] > 0;
        const t = an, at = [r[1] * t[2] - r[2] * t[1], r[2] * t[0] - r[0] * t[2], r[0] * t[1] - r[1] * t[0]];   // t = r × n along the front; r × t
        for (const [a, k] of [[an, closing ? 1 : config.collisionSeparateShare], [at, config.collisionShearShare]]) {
            const ck = c * k, oa = o[0] * a[0] + o[1] * a[1] + o[2] * a[2];
            for (let i = 0; i < 3; i++) { for (let j = 0; j < 3; j++) D[3 * i + j] += ck * a[i] * a[j]; T[i] += ck * oa * a[i]; }
        }
    }
    return solve3(D, T);
}

/** The fastest surface speed over the plate's cap, rad/Myr: rate · sin(angle from the axis), the angle axisAngle ± capRadius. */
export function fastestSpeed(omega, plate, centre) {
    const rate = Math.hypot(omega[0], omega[1], omega[2]);
    if (rate < 1e-12) return 0;
    const axisAngle = Math.acos(Math.max(-1, Math.min(1, (omega[0] * centre[0] + omega[1] * centre[1] + omega[2] * centre[2]) / rate)));
    const capRadius = Math.acos(Math.max(-1, Math.min(1, plate.capCos)));
    const reachesEquator = axisAngle - capRadius <= Math.PI / 2 && axisAngle + capRadius >= Math.PI / 2;
    return rate * (reachesEquator ? 1 : Math.max(Math.sin(axisAngle - capRadius), Math.sin(axisAngle + capRadius)));
}

/**
 * A continent's speed saturates smoothly: its fastest point's speed v becomes v / √(1 + (v/S)²), S = continentalSoftCmYr —
 * hardly changed at a few cm/yr, a third slower near the limit (plans/V2_REALISM_PASS_PLAN.md, phase 4: the recordings
 * found the land of a supercontinent just broken up moving at 5–10 cm/yr, much of it against the limit — the rift push, the
 * mantle's outflow and the pieces' repulsion stacking — and the pieces flew apart into a ring around a round ocean;
 * Pangaea's opened the Atlantic at 2–4 cm/yr). The deep roots of continents drag ever harder the faster they go.
 */
function softenSpeed(omega, plate, centre, config) {
    // (an oceanic plate as well, at oceanicSoftCmYr: the plates oceans now break into ran at 15–20 cm/yr under slab pull —
    // Earth's fastest run ~10 — and halved every step of the history)
    const continental = plate.stats.continentalCells > config.continentalPlateShare * plate.stats.cells;
    const S = (continental ? config.continentalSoftCmYr : config.oceanicSoftCmYr) * CM_PER_YR_TO_RAD_PER_MYR;
    if (!(S > 0)) return;
    const v = fastestSpeed(omega, plate, centre);
    if (v < 1e-12) return;
    // (a square root, not Math.tanh: tanh's last digit differs between JavaScript engines — Node's and Chrome's V8 already —
    // and the history would differ with it; a square root is exactly rounded everywhere, so a seed builds one planet)
    const k = 1 / Math.sqrt(1 + (v / S) * (v / S));
    for (let i = 0; i < 3; i++) omega[i] *= k;
}

/**
 * Backstop only — the force balance should keep plates inside these limits by itself, and the Phase 4
 * checks assert that it does. Scales `omega` down in place if the fastest point of the plate would
 * exceed the limit. @returns {boolean} whether it had to
 */
function clampSpeed(omega, plate, centre, config) {
    const fastest = fastestSpeed(omega, plate, centre);
    if (fastest < 1e-12) return false;
    const continental = plate.stats.continentalCells > config.continentalPlateShare * plate.stats.cells;
    const limit = (continental ? config.maxSpeedContinental : config.maxSpeedOceanic) * CM_PER_YR_TO_RAD_PER_MYR;
    if (fastest <= limit) return false;
    for (let i = 0; i < 3; i++) omega[i] *= limit / fastest;
    return true;
}

/** What the lab and the checks get to see about the forces on a plate. */
function describeDynamics(load, target, centre, capped, mesh) {
    const net = Math.hypot(load.torque[0] - load.flowTorque[0], load.torque[1] - load.flowTorque[1], load.torque[2] - load.flowTorque[2]);   // (the boundary forces'; the mantle flow is not a tug at a boundary)
    return {
        forces: FORCE_KINDS.map((name, k) => ({ name, cells: load.cells[k], km: load.cells[k] * mesh.edgeKm, vector: load.forceByKind[k].slice(), torque: Math.hypot(...load.byKind[k]) })),
        collisionCells: load.contacts.length,
        collisionKm2: load.contacts.length * mesh.cellAreaKm2,
        // how much of the pulling cancels itself out: 0 = all one way, 1 = perfectly balanced tug of war
        tension: load.torqueMagnitudeSum > 1e-12 ? 1 - net / load.torqueMagnitudeSum : 0,
        targetCmYr: speedCmYrAt(target, centre[0], centre[1], centre[2]),      // at the plate's centre, like FramePlate.speedCmYr
        capped,
    };
}

// Basal drag tensor Σ c (I − r rᵀ) over the plate's crust, rotated into the world frame (M · D_local · Mᵀ).
function dragTensor(plate, mesh, config, areaUnit) {
    const { xyz, numCells } = mesh, { mask, type } = plate.crust, local = new Float64Array(9);
    const perArea = areaUnit / config.mobility;
    const cOcean = config.dragOcean * perArea, cLand = config.dragContinent * perArea, cCraton = config.dragCraton * perArea;
    for (let i = 0; i < numCells; i++) {
        if (!mask[i]) continue;
        addProjector(local, [xyz[3 * i], xyz[3 * i + 1], xyz[3 * i + 2]], type[i] === CrustType.OCEAN ? cOcean : type[i] === CrustType.CRATON ? cCraton : cLand);
    }
    const m = plate.mat, tmp = new Float64Array(9), out = new Float64Array(9);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) tmp[3 * i + j] = m[3 * i] * local[j] + m[3 * i + 1] * local[3 + j] + m[3 * i + 2] * local[6 + j];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) out[3 * i + j] = tmp[3 * i] * m[3 * j] + tmp[3 * i + 1] * m[3 * j + 1] + tmp[3 * i + 2] * m[3 * j + 2];
    return out;
}

/** D += c (I − r rᵀ): viscous resistance to the tangential velocity at unit position r. */
function addProjector(D, r, c) {
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) D[3 * i + j] += c * ((i === j ? 1 : 0) - r[i] * r[j]);
}

/** Solve the 3×3 system D x = b by Cramer's rule (D is positive definite for any real plate). D is row-major. */
export function solve3(D, b) {
    const c00 = D[4] * D[8] - D[5] * D[7], c01 = D[3] * D[8] - D[5] * D[6], c02 = D[3] * D[7] - D[4] * D[6];
    const det = D[0] * c00 - D[1] * c01 + D[2] * c02;
    if (Math.abs(det) < 1e-30) return [0, 0, 0];
    return [
        (b[0] * c00 - D[1] * (b[1] * D[8] - D[5] * b[2]) + D[2] * (b[1] * D[7] - D[4] * b[2])) / det,
        (D[0] * (b[1] * D[8] - D[5] * b[2]) - b[0] * c01 + D[2] * (D[3] * b[2] - b[1] * D[6])) / det,
        (D[0] * (D[4] * b[2] - b[1] * D[7]) - D[1] * (D[3] * b[2] - b[1] * D[6]) + b[0] * c02) / det,
    ];
}
