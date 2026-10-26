// Shared by every v2/tools/check-phase<N>.mjs: Node set-up for the sim mesh, the PASS/FAIL
// reporter, and the smoke test that a lab phase module loads and honours the Phase contract.

import Delaunator from 'delaunator';
import { setDelaunator } from '../../../js/sphere-mesh.js';
import { buildSimMesh } from '../../js/core/sim-mesh.js';
import { TECTONICS } from '../../js/tectonics/config.js';
import { assertPhaseContract } from '../../js/app/phases/phase-kit.js';
import { largestPieceOf, piecesOf } from '../../js/core/mesh-bfs.js';
import { cellDistanceKm } from '../../js/core/sphere-geom.js';
import { CrustType } from '../../js/tectonics/model/crust.js';
import { CM_PER_YR_TO_RAD_PER_MYR } from '../../js/tectonics/config.js';

setDelaunator(Delaunator);      // the browser gets Delaunator from a <script> tag; Node has to hand it over

/** The lab's mesh: same cell count, same fixed seed (v2/js/app/lab-main.js MESH_SEED). */
export const LAB_MESH_SEED = 12345;
export function labMesh(cells = TECTONICS.simCells, seed = LAB_MESH_SEED) { return buildSimMesh(cells, seed); }

let failures = 0, total = 0;

/** Report one check. `detail` should carry the measured numbers, so a FAIL explains itself. */
export function check(name, ok, detail = '') {
    total++;
    if (!ok) failures++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  —  ${detail}` : ''}`);
}

export function section(title) { console.log(`\n── ${title} ──`); }

/** Print the verdict and set the process exit code. Call last. */
export function finish(phaseName) {
    console.log(`\n${failures === 0 ? `${phaseName}: all ${total} checks passed.` : `${phaseName}: ${failures} of ${total} checks FAILED.`}`);
    process.exitCode = failures === 0 ? 0 : 1;
}

/**
 * The lab imports phase modules in the browser, where a syntax error or a broken contract would
 * only show up on screen. Load the module here, build it, and exercise everything the shell calls.
 */
export async function checkLabPhaseLoads(modulePath, mesh, seed, overridesList = [{}]) {
    try {
        const { createPhase } = await import(modulePath);
        const stubCtx = new Proxy({}, { get: (o, k) => (k in o ? o[k] : () => {}), set: (o, k, v) => { o[k] = v; return true; } });   // a canvas that draws nothing
        for (const overrides of overridesList) {
            const phase = await createPhase(mesh, seed, overrides);
            assertPhaseContract(phase);
            const shown = phase.displayMesh ?? mesh, out = new Uint8Array(shown.numCells * 3);
            for (const t of [0, phase.maxTime / 2, phase.maxTime]) {
                const frame = phase.frameAt(t);
                if (phase.prepare) await phase.prepare(frame);
                for (const layer of phase.layers) { layer.paint(frame, out); layer.overlay?.(stubCtx, { width: 2048, height: 1024, project: () => [0, 0] }, frame); }
                if (phase.profileAlong) { const p = phase.profileAlong(frame, [1, 0, 0], [0, 1, 0], 64); if (p.km.length !== p.heightKm.length || p.heightKm.some(v => !Number.isFinite(v))) throw new Error('profileAlong must return finite heights'); }
                phase.paintBoundaries?.(frame, out);
                const stats = phase.stats(frame);
                if (!stats.rows || !stats.cards) throw new Error('stats() must return {cards, rows}');
                phase.markers(frame);
                for (let w = 0; w < shown.numCells; w += 997) if (typeof phase.describeCell(frame, w) !== 'string') throw new Error('describeCell must return text');
            }
        }
        check('lab phase module loads and honours the Phase contract', true, `${overridesList.length} configuration(s): every layer, stat panel, marker set and cell readout exercised`);
    } catch (err) {
        check('lab phase module loads and honours the Phase contract', false, err.stack ?? String(err));
    }
}

export const mean = a => a.reduce((s, v) => s + v, 0) / a.length;
export const largestJump = a => Math.max(0, ...a.slice(1).map((v, i) => Math.abs(v - a[i])));

// ── Frame helpers shared by the check scripts (one definition each, so no two scripts disagree on what they mean) ──

/** Land (any crust but ocean) at world cell w of a frame. */
export const isLand = (f, w) => f.owner[w] >= 0 && f.type[w] !== CrustType.OCEAN;
/** The world cells 0…numCells−1 where `test` holds, as a list. */
export function cellsWhere(numCells, test) { const out = []; for (let w = 0; w < numCells; w++) if (test(w)) out.push(w); return out; }
/** How many world cells 0…numCells−1 satisfy `test`. */
export function countWhere(numCells, test) { let n = 0; for (let w = 0; w < numCells; w++) if (test(w)) n++; return n; }
/** Land cells in a frame. */
export const landCount = f => countWhere(f.owner.length, w => isLand(f, w));
/** The recorded frame nearest to time t. */
export const nearestFrame = (frames, t) => frames.reduce((best, f) => (Math.abs(f.time - t) < Math.abs(best.time - t) ? f : best), frames[0]);
/** A living plate of a frame by name, or undefined. */
export const plateNamed = (f, name) => f.plates.find(p => p.alive && p.name === name);
/** A living plate of a frame by id (events give plates by id), or null. */
export const plateById = (f, id) => (id >= 0 && f.plates[id]?.alive ? f.plates[id] : null);
/** Great-circle km between two world cells. */
export const kmBetween = (mesh, a, b) => cellDistanceKm(mesh.xyz, a, b);
/** Great-circle km from world cell w to the nearest of `from` (brute force: both sets are small). */
export function nearestKm(mesh, w, from) { let best = Infinity; for (const c of from) best = Math.min(best, cellDistanceKm(mesh.xyz, w, c)); return best; }
/** Size of the largest connected piece of a set of cells. */
export const largestPiece = (mesh, cells) => largestPieceOf(mesh, cells).length;
/** Is a set of cells one connected piece? */
export const isConnected = (mesh, cells) => cells.length > 0 && largestPieceOf(mesh, cells).length === cells.length;
export { piecesOf };
/** Relative surface speed (cm/yr) of frame plate a against frame plate b, at a's centre. */
export function relativeCmYr(fa, fb) {
    const o = [fa.omega[0] - fb.omega[0], fa.omega[1] - fb.omega[1], fa.omega[2] - fb.omega[2]], c = fa.centre;
    return Math.hypot(o[1] * c[2] - o[2] * c[1], o[2] * c[0] - o[0] * c[2], o[0] * c[1] - o[1] * c[0]) / CM_PER_YR_TO_RAD_PER_MYR;
}
